from __future__ import annotations

import os
import threading
import time
import urllib.parse
import urllib.request
from typing import Any, Dict, Optional, Tuple

from ..clients.backend_client import BackendClient
from .company_cache import CompanyEmbeddingCache


def is_known_employee_id(employee_id: Optional[str]) -> bool:
    emp = str(employee_id or "").strip()
    if not emp:
        return False
    return emp.lower() not in {"-1", "unknown", "none", "null"}


class DoorRelayService:
    """
    Service responsible for triggering hardware door unlock relays and relay state toggles
    with TTL-cached company endpoints, rate limiting, and debouncing.
    """

    def __init__(
        self,
        company_cache: CompanyEmbeddingCache,
        cache_ttl_s: float = 10.0,
    ) -> None:
        self.company_cache = company_cache
        self.cache_ttl_s = float(
            os.getenv("RELAY_SETTINGS_CACHE_TTL_S", str(cache_ttl_s))
        )

        self._relay_settings_cache_by_company: Dict[str, Dict[str, Optional[str]]] = {}
        self._relay_settings_last_fetch_by_company: Dict[str, float] = {}

        self._relay_state_by_camera: Dict[str, str] = {}
        self._relay_last_ts_by_camera: Dict[str, float] = {}
        self._relay_min_interval_s = float(
            os.getenv("RELAY_MIN_INTERVAL_S", "0.75")
        )
        self._relay_http_timeout_s = float(
            os.getenv("RELAY_HTTP_TIMEOUT_S", "3.0")
        )

        self._door_last_fire: Dict[str, float] = {}
        self._door_unlock_min_gap = max(
            0.0, float(os.getenv("DOOR_UNLOCK_MIN_GAP", "0.15"))
        )

    @staticmethod
    def _normalize_relay_url(value: Any) -> Optional[str]:
        url = str(value or "").strip()
        return url or None

    def get_relay_urls_for_company(
        self, company_id: Optional[str]
    ) -> Tuple[Optional[str], Optional[str]]:
        cid = str(company_id or "").strip()
        if not cid:
            return None, None

        key = self.company_cache.gallery_key(cid)
        now = time.time()
        ttl = self.cache_ttl_s

        has_cached = key in self._relay_settings_cache_by_company
        cached = self._relay_settings_cache_by_company.get(key, {})
        last_fetch = float(self._relay_settings_last_fetch_by_company.get(key, 0.0))

        if has_cached and (ttl <= 0.0 or (now - last_fetch) < ttl):
            relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
            relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
            return relay_on, relay_silent

        client = self.company_cache.client_for_company(cid)
        try:
            data = client.get_relay_settings()
            relay_on = self._normalize_relay_url(
                data.get("relayOnUrl") or data.get("relay_on_url")
            )
            relay_silent = self._normalize_relay_url(
                data.get("relaySilentUrl") or data.get("relay_silent_url")
            )
            self._relay_settings_cache_by_company[key] = {
                "relay_on_url": relay_on,
                "relay_silent_url": relay_silent,
            }
            self._relay_settings_last_fetch_by_company[key] = now
            return relay_on, relay_silent
        except Exception as e:
            self._relay_settings_last_fetch_by_company[key] = now
            if has_cached:
                relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
                relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
                return relay_on, relay_silent
            print(f"[RELAY] settings load failed company={cid or 'default'} err={e}")
            return None, None

    def trigger_relay_http(
        self,
        camera_id: str,
        turn_on: bool,
        employee_id: Optional[str] = None,
        company_id: Optional[str] = None,
    ) -> None:
        emp_id = str(employee_id or "").strip()
        if not is_known_employee_id(emp_id):
            return

        if not turn_on:
            return

        relay_on_url, _ = self.get_relay_urls_for_company(company_id)
        if not relay_on_url:
            return

        url = relay_on_url
        if emp_id:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"
            emp_pic_url = self.company_cache.get_employee_pic_url(company_id, emp_id)
            if emp_pic_url:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}empPicUrl={urllib.parse.quote(emp_pic_url, safe='')}"

        cid = str(camera_id)
        desired = "on" if turn_on else "off"
        now = time.time()
        last_state = self._relay_state_by_camera.get(cid)
        last_ts = self._relay_last_ts_by_camera.get(cid, 0.0)

        if last_state == desired and (now - last_ts) < self._relay_min_interval_s:
            return

        self._relay_state_by_camera[cid] = desired
        self._relay_last_ts_by_camera[cid] = now

        def _do() -> None:
            try:
                resp = urllib.request.urlopen(url, timeout=self._relay_http_timeout_s)
                resp.close()
                print(f"[RELAY] {desired} cid={cid} url={url}")
            except Exception as e:
                print(f"[RELAY] failed cid={cid} url={url} err={e}")

        from ..core.runtime_opt import submit_async_io
        submit_async_io(_do)

    def trigger_door_unlock(
        self,
        *,
        camera_id: str,
        employee_id: str,
        company_id: Optional[str],
        name: str,
        similarity: float,
    ) -> None:
        """Fire-and-forget door unlock with per-person rate limiting."""
        emp_id = str(employee_id or "").strip()
        if not is_known_employee_id(emp_id):
            return

        key = f"{camera_id}:{emp_id}"
        now = time.time()
        last = self._door_last_fire.get(key, 0.0)
        if now - last < self._door_unlock_min_gap:
            return

        self._door_last_fire[key] = now

        _, relay_silent_url = self.get_relay_urls_for_company(company_id)
        if not relay_silent_url:
            return

        url = relay_silent_url
        if emp_id:
            sep = "&" if "?" in url else "?"
            url = f"{url}{sep}employee_id={urllib.parse.quote(emp_id, safe='')}"
            emp_pic_url = self.company_cache.get_employee_pic_url(company_id, emp_id)
            if emp_pic_url:
                sep = "&" if "?" in url else "?"
                url = f"{url}{sep}empPicUrl={urllib.parse.quote(emp_pic_url, safe='')}"

        def _do() -> None:
            try:
                door_timeout = float(os.getenv("DOOR_HTTP_TIMEOUT_S", "3.0"))
                resp = urllib.request.urlopen(url, timeout=door_timeout)
                resp.close()
                print(
                    f"[DOOR] unlock fired cid={camera_id} emp={emp_id} url={url} "
                    f"name={name} sim={similarity:.3f}"
                )
            except Exception as e:
                print(f"[DOOR] failed cid={camera_id} emp={emp_id} url={url} err={e}")

        from ..core.runtime_opt import submit_async_io
        submit_async_io(_do)
