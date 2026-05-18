from __future__ import annotations

from typing import Any, Dict, Optional
import requests


class HttpClient:
    """
    Reusable HTTP client wrapper (requests.Session).

    Features:
    - Base URL
    - Optional prefix (e.g. /api/v1)
    - GET/POST helpers
    - Consistent error formatting
    """

    def __init__(
        self,
        base_url: str,
        prefix: str = "",
        timeout_s: float = 10.0,
        default_headers: Optional[Dict[str, str]] = None,
    ):
        self.base_url = (base_url or "").rstrip("/")
        self.prefix = (prefix or "").strip()

        if self.prefix and not self.prefix.startswith("/"):
            self.prefix = "/" + self.prefix
        self.prefix = self.prefix.rstrip("/")

        self.timeout_s = timeout_s

        self.session = requests.Session()
        self.session.headers.update(
            {
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Connection": "close",
            }
        )
        if default_headers:
            self.session.headers.update(default_headers)

    def url(self, path: str) -> str:
        p = (path or "").strip()
        if not p.startswith("/"):
            p = "/" + p
        return f"{self.base_url}{self.prefix}{p}"

    def get(self, path: str) -> Any:
        url = self.url(path)
        res: Optional[requests.Response] = None
        try:
            res = self.session.get(url, timeout=self.timeout_s)
            res.raise_for_status()
            return res.json()
        except requests.RequestException as e:
            self._raise(url, res, e)

    def post(self, path: str, payload: Dict[str, Any]) -> Any:
        url = self.url(path)
        res: Optional[requests.Response] = None
        try:
            res = self.session.post(url, json=payload, timeout=self.timeout_s)
            res.raise_for_status()
            return res.json()
        except requests.RequestException as e:
            self._raise(url, res, e)

    def _raise(self, url: str, res: Optional[requests.Response], err: Exception):
        if res is not None:
            try:
                detail: Any = res.json()
            except Exception:
                detail = res.text
            raise RuntimeError(f"[HttpClient] {res.status_code} {url} → {detail} | Underlying error: {err}") from err
        raise RuntimeError(f"[HttpClient] Request failed → {url} | Underlying error: {err}") from err

    def set_default_headers(self, headers: Optional[Dict[str, str]]) -> None:
        if not headers:
            return
        self.session.headers.update(headers)
