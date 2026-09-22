from __future__ import annotations

import json
import os
import threading
import time
import urllib.parse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Dict, Optional, Tuple

import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry

from ..clients.backend_client import BackendClient
from .company_cache import CompanyEmbeddingCache


def is_known_employee_id(employee_id: Optional[str]) -> bool:
    emp = str(employee_id or "").strip()
    if not emp:
        return False
    return emp.lower() not in {"-1", "unknown", "none", "null"}


def write_door_log(message: str) -> None:
    try:
        log_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "../../logs/door")
        os.makedirs(log_dir, exist_ok=True)
        date_str = datetime.now().strftime("%Y-%m-%d")
        log_path = os.path.join(log_dir, f"{date_str}.log")
        timestamp = datetime.now().isoformat()
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] {message}\n")
    except Exception:
        pass


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

        # Dedicated high-priority worker pool for door unlock HTTP requests
        self._door_executor = ThreadPoolExecutor(
            max_workers=max(4, int(os.getenv("DOOR_RELAY_MAX_WORKERS", "4"))),
            thread_name_prefix="ai-door-relay",
        )

        # Persistent HTTP session with connection pooling for ultra-fast relay requests
        self._session = requests.Session()
        adapter = HTTPAdapter(
            pool_connections=10,
            pool_maxsize=10,
            max_retries=Retry(total=1, backoff_factor=0.1),
        )
        self._session.mount("http://", adapter)
        self._session.mount("https://", adapter)
        self._fetching_keys = set()
        self._fetch_lock = threading.Lock()

    @staticmethod
    def _normalize_relay_url(value: Any) -> Optional[str]:
        url = str(value or "").strip()
        return url or None

    def _fetch_relay_settings_bg(self, cid: str, key: str) -> None:
        try:
            client = self.company_cache.client_for_company(cid)
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
            self._relay_settings_last_fetch_by_company[key] = time.time()
        except Exception as e:
            self._relay_settings_last_fetch_by_company[key] = time.time()
            print(f"[RELAY] settings bg load failed company={cid or 'default'} err={e}")
        finally:
            with self._fetch_lock:
                self._fetching_keys.discard(key)

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

        # If cache exists and is fresh, return immediately
        if has_cached and (ttl <= 0.0 or (now - last_fetch) < ttl):
            relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
            relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
            return relay_on, relay_silent

        # If cache is missing or expired, trigger background refresh so frame loop is never blocked
        with self._fetch_lock:
            if key not in self._fetching_keys:
                self._fetching_keys.add(key)
                self._door_executor.submit(self._fetch_relay_settings_bg, cid, key)

        # Return existing cached values immediately if present (stale-while-revalidate)
        if has_cached:
            relay_on = self._normalize_relay_url(cached.get("relay_on_url"))
            relay_silent = self._normalize_relay_url(cached.get("relay_silent_url"))
            return relay_on, relay_silent

        return None, None

    def trigger_relay_http(
        self,
        camera_id: str,
        turn_on: bool,
        employee_id: Optional[str] = None,
        company_id: Optional[str] = None,
        employee_name: Optional[str] = None,
    ) -> None:
        emp_id = str(employee_id or "").strip()
        if not is_known_employee_id(emp_id):
            return

        if not turn_on:
            return

        relay_on_url, relay_silent_url = self.get_relay_urls_for_company(company_id)
        url = relay_on_url or relay_silent_url
        if not url:
            return

        cid = str(camera_id)
        desired = "on" if turn_on else "off"
        now = time.time()
        last_state = self._relay_state_by_camera.get(cid)
        last_ts = self._relay_last_ts_by_camera.get(cid, 0.0)

        if last_state == desired and (now - last_ts) < self._relay_min_interval_s:
            return

        self._relay_state_by_camera[cid] = desired
        self._relay_last_ts_by_camera[cid] = now

        emp_name = str(employee_name or "").strip()

        def _do() -> None:
            try:
                # Use persistent pooled session
                headers = {
                    "User-Agent": "CCTV-Attendance-DoorRelay/1.5",
                }
                params = {}
                if emp_id:
                    params["employee_id"] = emp_id
                if emp_name:
                    params["employee_name"] = emp_name

                resp = self._session.get(
                    url,
                    params=params if params else None,
                    headers=headers,
                    timeout=self._relay_http_timeout_s,
                )
                resp_text = resp.text.strip() if resp.text else ""
                write_door_log(
                    f"[RELAY] {desired} cid={cid} url={resp.url} status={resp.status_code} resp={resp_text}"
                )
            except Exception as e:
                err_str = "timed out" if ("timed out" in str(e).lower() or "timeout" in str(e).lower()) else str(e)
                write_door_log(f"[RELAY] failed cid={cid} url={url} err={err_str}")

        self._door_executor.submit(_do)

    def trigger_door_unlock(
        self,
        *,
        camera_id: str,
        employee_id: str,
        company_id: Optional[str],
        name: str,
        similarity: float,
        timestamp: Optional[str] = None,
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

        relay_on_url, relay_silent_url = self.get_relay_urls_for_company(company_id)
        url = relay_silent_url or relay_on_url
        if not url:
            return

        dt = datetime.now()
        if timestamp:
            try:
                dt = datetime.fromisoformat(str(timestamp))
            except Exception:
                pass
        formatted_time = dt.strftime("%H:%M:%S")
        formatted_date = dt.strftime("%d-%m-%Y")

        emp_name = str(name or "").strip()

        payload = {
            "employee_id": emp_id,
            "employee_name": emp_name,
            "time": formatted_time,
            "date": formatted_date,
        }
        payload_str = json.dumps(payload, ensure_ascii=False)

        def _do() -> None:
            try:
                door_timeout = float(os.getenv("DOOR_HTTP_TIMEOUT_S", "3.0"))
                headers = {
                    "Content-Type": "application/json",
                    "User-Agent": "CCTV-Attendance-DoorRelay/1.5",
                }
                resp = self._session.post(
                    url,
                    data=payload_str.encode("utf-8"),
                    headers=headers,
                    timeout=door_timeout,
                )
                resp_status = resp.status_code
                resp_text = resp.text.strip() if resp.text else ""

                log_msg = (
                    f"[DOOR] unlock fired cid={camera_id} emp={emp_id} url={url} "
                    f"payload={payload_str} status={resp_status} resp={resp_text} name={name} sim={similarity:.3f}"
                )
                if "cooldown active" in resp_text.lower():
                    log_msg += " [NOTICE: RELAY HARDWARE COOLDOWN ACTIVE]"
                write_door_log(log_msg)
            except Exception as e:
                err_str = "timed out" if ("timed out" in str(e).lower() or "timeout" in str(e).lower()) else str(e)
                write_door_log(f"[DOOR] failed cid={camera_id} emp={emp_id} url={url} payload={payload_str} err={err_str}")

        self._door_executor.submit(_do)
