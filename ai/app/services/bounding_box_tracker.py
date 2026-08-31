from __future__ import annotations

import os
import threading
import time
from typing import Any, Dict, List, Optional, Set, Tuple

from ..domain.attendance import BoundingBoxRuntimeBox
from ..services.company_cache import CompanyEmbeddingCache
from ..utils import now_iso


def unit_float(value: Any) -> float:
    try:
        v = float(value)
    except Exception:
        return 0.0
    return max(0.0, min(1.0, v))


class BoundingBoxTrackerService:
    """
    Service responsible for bounding box spatial tracking, in/out transitions,
    state pruning, and backend tracking event dispatch.
    """

    def __init__(
        self,
        company_cache: CompanyEmbeddingCache,
        enabled: bool = True,
        cache_ttl_s: float = 10.0,
        transition_min_s: float = 1.0,
        max_states: int = 4000,
    ) -> None:
        self.company_cache = company_cache
        self.enabled = bool(
            os.getenv("BOUNDING_BOX_TRACKING_ENABLED", str(int(enabled))) in ("1", "true", "yes", "on")
        )
        self.cache_ttl_s = float(
            os.getenv("BOUNDING_BOXES_CACHE_TTL_S", str(cache_ttl_s))
        )
        self.transition_min_s = float(
            os.getenv("BOUNDING_BOX_TRANSITION_MIN_S", str(transition_min_s))
        )
        self.max_states = int(
            os.getenv("BOUNDING_BOX_TRACKING_MAX_STATES", str(max_states))
        )

        self._boxes_by_camera: Dict[str, List[BoundingBoxRuntimeBox]] = {}
        self._boxes_last_fetch_by_camera: Dict[str, float] = {}
        self._tracking_state: Dict[str, Dict[str, Any]] = {}

    def parse_runtime_box(self, raw: Dict[str, Any]) -> Optional[BoundingBoxRuntimeBox]:
        box_id = str(raw.get("id") or "").strip()
        if not box_id:
            return None

        employee_ids_raw = raw.get("employeePublicIds") or raw.get("employeeIds") or []
        if not isinstance(employee_ids_raw, list):
            employee_ids_raw = []
        employee_ids = {
            str(value or "").strip()
            for value in employee_ids_raw
            if str(value or "").strip()
        }
        if not employee_ids:
            return None

        xs: List[float] = []
        ys: List[float] = []
        for key in ("topLeft", "topRight", "bottomLeft", "bottomRight"):
            point = raw.get(key) or {}
            if not isinstance(point, dict):
                continue
            xs.append(unit_float(point.get("x")))
            ys.append(unit_float(point.get("y")))

        if not xs or not ys:
            return None

        left = min(xs)
        right = max(xs)
        top = min(ys)
        bottom = max(ys)
        if (right - left) <= 0.001 or (bottom - top) <= 0.001:
            return None

        return BoundingBoxRuntimeBox(
            id=box_id,
            name=str(raw.get("name") or box_id).strip() or box_id,
            left=left,
            top=top,
            right=right,
            bottom=bottom,
            employee_ids=employee_ids,
        )

    def refresh_bounding_boxes(
        self, camera_id: str, company_id: Optional[str]
    ) -> List[BoundingBoxRuntimeBox]:
        if not self.enabled:
            return []

        cid = str(camera_id or "").strip()
        if not cid:
            return []

        now = time.time()
        last_fetch = float(self._boxes_last_fetch_by_camera.get(cid, 0.0) or 0.0)
        cached = self._boxes_by_camera.get(cid)
        if cached is not None and self.cache_ttl_s > 0.0 and (now - last_fetch) < self.cache_ttl_s:
            return list(cached)

        comp = str(company_id or "").strip()
        if not comp:
            return list(cached or [])

        try:
            client = self.company_cache.client_for_company(comp)
            payload = client.get_camera_bounding_boxes(cid)
            raw_boxes = payload.get("boxes") or []
            if not isinstance(raw_boxes, list):
                raw_boxes = []

            boxes: List[BoundingBoxRuntimeBox] = []
            for raw in raw_boxes:
                if not isinstance(raw, dict):
                    continue
                parsed = self.parse_runtime_box(raw)
                if parsed is not None:
                    boxes.append(parsed)

            self._boxes_by_camera[cid] = boxes
            self._boxes_last_fetch_by_camera[cid] = now
            return list(boxes)
        except Exception as e:
            self._boxes_last_fetch_by_camera[cid] = now
            if cached is not None:
                return list(cached)
            print(f"[BOX-TRACK] boxes load failed company={comp} cam={cid} err={e}")
            return []

    @staticmethod
    def point_inside_runtime_box(
        box: BoundingBoxRuntimeBox, x_unit: float, y_unit: float
    ) -> bool:
        return (
            box.left <= x_unit <= box.right
            and box.top <= y_unit <= box.bottom
        )

    @staticmethod
    def _box_tracking_key(
        *, company_id: Optional[str], camera_id: str, box_id: str, employee_id: str
    ) -> str:
        comp = str(company_id or "").strip()
        return f"{comp}:{camera_id}:{box_id}:{employee_id}"

    def push_bounding_box_tracking_event(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        camera_name: str,
        box_id: str,
        employee_id: str,
        event_type: str,
        confidence: Optional[float],
    ) -> None:
        comp = str(company_id or "").strip()
        if not comp:
            return

        client = self.company_cache.client_for_company(comp)
        timestamp_iso = now_iso()

        def _do() -> None:
            try:
                client.create_bounding_box_tracking_event(
                    camera_id=str(camera_id),
                    bounding_box_id=str(box_id),
                    employee_id=str(employee_id),
                    event_type=str(event_type),
                    occurred_at=timestamp_iso,
                    confidence=float(confidence) if confidence is not None else None,
                )
            except Exception as e:
                print(
                    "[BOX-TRACK] write failed "
                    f"company={comp} cam={camera_id} camera={camera_name} "
                    f"box={box_id} emp={employee_id} event={event_type} err={e}"
                )

        from ..core.runtime_opt import submit_async_io
        submit_async_io(_do)

    def _prune_tracking_state(self, now: float) -> None:
        if len(self._tracking_state) <= self.max_states:
            return

        cutoff = now - 3600.0
        kept = {
            key: value
            for key, value in self._tracking_state.items()
            if float(value.get("last_seen", 0.0) or 0.0) >= cutoff
        }
        if len(kept) > self.max_states:
            items = sorted(
                kept.items(),
                key=lambda item: float(item[1].get("last_seen", 0.0) or 0.0),
                reverse=True,
            )
            kept = dict(items[: self.max_states])
        self._tracking_state = kept

    def update_bounding_box_tracking_state(
        self,
        *,
        company_id: Optional[str],
        camera_id: str,
        camera_name: str,
        box_id: str,
        employee_id: str,
        outside: bool,
        confidence: Optional[float],
        now: float,
    ) -> None:
        key = self._box_tracking_key(
            company_id=company_id,
            camera_id=camera_id,
            box_id=box_id,
            employee_id=employee_id,
        )
        state = self._tracking_state.setdefault(
            key,
            {
                "armed": False,
                "outside": False,
                "pending_outside": None,
                "pending_since": 0.0,
                "last_seen": now,
            },
        )
        state["last_seen"] = now

        observed_outside = bool(outside)
        if not bool(state.get("armed", False)):
            state["outside"] = False
            state["pending_outside"] = None
            state["pending_since"] = 0.0
            if not observed_outside:
                state["armed"] = True
                self.push_bounding_box_tracking_event(
                    company_id=company_id,
                    camera_id=camera_id,
                    camera_name=camera_name,
                    box_id=box_id,
                    employee_id=employee_id,
                    event_type="in",
                    confidence=confidence,
                )
            return

        current_outside = bool(state.get("outside", False))
        if observed_outside == current_outside:
            state["pending_outside"] = None
            state["pending_since"] = 0.0
            return

        pending_outside = state.get("pending_outside")
        if pending_outside is None or bool(pending_outside) != observed_outside:
            state["pending_outside"] = observed_outside
            state["pending_since"] = now
            return

        pending_since = float(state.get("pending_since", now) or now)
        if (now - pending_since) < self.transition_min_s:
            return

        state["outside"] = observed_outside
        state["pending_outside"] = None
        state["pending_since"] = 0.0
        event_type = "out" if observed_outside else "in"
        self.push_bounding_box_tracking_event(
            company_id=company_id,
            camera_id=camera_id,
            camera_name=camera_name,
            box_id=box_id,
            employee_id=employee_id,
            event_type=event_type,
            confidence=confidence,
        )
        self._prune_tracking_state(now)

    def handle_tracking_for_track(
        self,
        *,
        camera_id: str,
        camera_name: str,
        company_id: Optional[str],
        boxes: List[BoundingBoxRuntimeBox],
        employee_id: str,
        bbox: Tuple[int, int, int, int],
        frame_shape: Tuple[int, int],
        confidence: Optional[float],
        now: float,
    ) -> None:
        if not boxes:
            return
        emp = str(employee_id or "").strip()
        if not emp or emp.lower() in {"-1", "unknown", "none", "null"}:
            return

        h, w = frame_shape
        if h <= 0 or w <= 0:
            return

        x1, y1, x2, y2 = [int(v) for v in bbox]
        cx = unit_float(((x1 + x2) * 0.5) / float(w))
        cy = unit_float(((y1 + y2) * 0.5) / float(h))

        for box in boxes:
            if emp not in box.employee_ids:
                continue
            outside = not self.point_inside_runtime_box(box, cx, cy)
            self.update_bounding_box_tracking_state(
                company_id=company_id,
                camera_id=str(camera_id),
                camera_name=str(camera_name),
                box_id=box.id,
                employee_id=emp,
                outside=outside,
                confidence=confidence,
                now=now,
            )
