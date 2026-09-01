from __future__ import annotations

import time
from typing import Dict, List, Optional, Tuple

import numpy as np

from ..clients.backend_client import BackendClient
from ..utils import l2_normalize


class CompanyEmbeddingCache:
    """
    Manages gallery template embeddings, employee metadata, and picture caches
    per company ID with TTL-based refresh.
    """

    def __init__(
        self,
        default_company_id: Optional[str] = None,
        refresh_interval_s: float = 5.0,
    ) -> None:
        self.default_company_id = default_company_id
        self.refresh_interval_s = float(refresh_interval_s)

        self._default_client = BackendClient(company_id=self.default_company_id)
        self._clients_by_company: Dict[str, BackendClient] = {}

        self._gallery_last_load_by_company: Dict[str, float] = {}
        self._gallery_matrix_by_company: Dict[str, np.ndarray] = {}
        self._gallery_meta_by_company: Dict[str, List[Tuple[int, str, str]]] = {}
        self._gallery_emp_ids_by_company: Dict[str, np.ndarray] = {}
        self._employee_pic_by_company: Dict[str, Dict[str, str]] = {}

        self._emp_id_to_int_by_company: Dict[str, Dict[str, int]] = {}
        self._next_emp_int_by_company: Dict[str, int] = {}

    def gallery_key(self, company_id: Optional[str]) -> str:
        cid = str(company_id or "").strip()
        return cid if cid else "__default__"

    def client_for_company(self, company_id: Optional[str]) -> BackendClient:
        cid = str(company_id or "").strip()
        if not cid:
            return self._default_client
        client = self._clients_by_company.get(cid)
        if client is None:
            client = BackendClient(company_id=cid)
            self._clients_by_company[cid] = client
        return client

    def emp_str_to_int(self, company_id: Optional[str], emp_id_str: str) -> int:
        emp_id_str = str(emp_id_str)
        key = self.gallery_key(company_id)

        emp_id_to_int = self._emp_id_to_int_by_company.setdefault(key, {})
        self._next_emp_int_by_company.setdefault(key, -2)

        if emp_id_str.isdigit():
            return int(emp_id_str)

        mapped = emp_id_to_int.get(emp_id_str)
        if mapped is not None:
            return int(mapped)

        v = int(self._next_emp_int_by_company[key])
        self._next_emp_int_by_company[key] = v - 1
        emp_id_to_int[emp_id_str] = v
        return v

    def invalidate_gallery(self, company_id: Optional[str] = None) -> None:
        """Forces the next ensure_gallery call to reload templates from backend immediately."""
        if company_id:
            key = self.gallery_key(company_id)
            self._gallery_last_load_by_company.pop(key, None)
        else:
            self._gallery_last_load_by_company.clear()

    def ensure_gallery(self, company_id: Optional[str]) -> None:
        cid = str(company_id or self.default_company_id or "").strip() or None
        key = self.gallery_key(cid)
        now = time.time()
        last_load = self._gallery_last_load_by_company.get(key, 0.0)
        if now - last_load < self.refresh_interval_s:
            return

        if not cid:
            self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
            self._gallery_meta_by_company[key] = []
            self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)
            self._employee_pic_by_company[key] = {}
            self._gallery_last_load_by_company[key] = now
            return

        client = self.client_for_company(cid)
        try:
            templates = client.list_templates()
        except Exception as e:
            print(f"[GALLERY] load failed company={cid or 'default'}: {e}")
            if key not in self._gallery_matrix_by_company:
                self._gallery_matrix_by_company[key] = np.zeros((0, 512), dtype=np.float32)
                self._gallery_meta_by_company[key] = []
                self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)
            self._gallery_last_load_by_company[key] = now
            return

        embs: List[np.ndarray] = []
        meta: List[Tuple[int, str, str]] = []

        for t in templates:
            emp_id_str = str(t.get("employeeId") or t.get("employee_id") or "").strip()
            if not emp_id_str:
                continue

            emb_list = t.get("embedding") or []
            if not isinstance(emb_list, list) or len(emb_list) < 10:
                continue

            emb = np.asarray(emb_list, dtype=np.float32)
            emb = l2_normalize(emb)

            name = str(
                t.get("employeeName")
                or t.get("employee_name")
                or t.get("name")
                or emp_id_str
            )
            emp_int = self.emp_str_to_int(company_id, emp_id_str)

            embs.append(emb)
            meta.append((emp_int, emp_id_str, name))

        self._gallery_matrix_by_company[key] = (
            np.stack(embs, axis=0) if embs else np.zeros((0, 512), dtype=np.float32)
        )
        self._gallery_meta_by_company[key] = meta
        if meta:
            self._gallery_emp_ids_by_company[key] = np.asarray(
                [m[0] for m in meta], dtype=np.int32
            )
        else:
            self._gallery_emp_ids_by_company[key] = np.zeros((0,), dtype=np.int32)

        self._refresh_employee_pic_cache(company_id, client)
        self._gallery_last_load_by_company[key] = now

    def _refresh_employee_pic_cache(
        self, company_id: Optional[str], client: BackendClient
    ) -> None:
        key = self.gallery_key(company_id)
        try:
            employees = client.list_employees()
        except Exception as e:
            print(f"[EMPLOYEE] pic cache load failed company={company_id or 'default'}: {e}")
            return

        pic_map: Dict[str, str] = {}
        for employee in employees:
            pic_url = str(
                employee.get("empPicUrl") or employee.get("emp_pic_url") or ""
            ).strip()
            if not pic_url:
                continue
            for candidate in (
                employee.get("empId"),
                employee.get("emp_id"),
                employee.get("employeeId"),
                employee.get("employee_id"),
                employee.get("id"),
            ):
                employee_key = str(candidate or "").strip()
                if employee_key:
                    pic_map[employee_key] = pic_url

        self._employee_pic_by_company[key] = pic_map

    def get_employee_pic_url(
        self, company_id: Optional[str], employee_id: Optional[str]
    ) -> Optional[str]:
        employee_key = str(employee_id or "").strip()
        if not employee_key:
            return None
        key = self.gallery_key(company_id)
        pic_url = self._employee_pic_by_company.get(key, {}).get(employee_key)
        if not pic_url:
            return None
        return str(pic_url)

    def get_gallery(
        self, company_id: Optional[str]
    ) -> Tuple[np.ndarray, List[Tuple[int, str, str]], np.ndarray]:
        cid = str(company_id or self.default_company_id or "").strip() or None
        self.ensure_gallery(cid)
        key = self.gallery_key(cid)
        matrix = self._gallery_matrix_by_company.get(
            key, np.zeros((0, 512), dtype=np.float32)
        )
        meta = self._gallery_meta_by_company.get(key, [])
        emp_ids = self._gallery_emp_ids_by_company.get(
            key, np.zeros((0,), dtype=np.int32)
        )
        return matrix, meta, emp_ids
