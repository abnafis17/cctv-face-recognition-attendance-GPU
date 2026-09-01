from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional, Tuple


@dataclass(slots=True)
class IdentityNode:
    track_id: int
    employee_id: str
    name: str
    confidence: float
    similarity: float
    last_seen_ts: float
    locked_until_ts: float = 0.0
    last_switch_ts: float = 0.0


def _sim_norm(v: float) -> float:
    return max(0.0, min(1.0, (float(v) + 1.0) * 0.5))


class IdentityGraphManager:
    """
    Camera-local global identity reconciliation.

    - Maintains one "best" active body track per employee.
    - Demotes weaker duplicates to reduce short-term identity collisions.
    - Applies optional lock-window policy before allowing reassignment.
    """

    def __init__(
        self,
        *,
        min_show_confidence: float = 0.18,
        drop_confidence: float = 0.08,
        lock_seconds: float = 3.0,
        switch_min_similarity_gain: float = 0.07,
    ) -> None:
        self.min_show_confidence = float(max(0.0, min(1.0, min_show_confidence)))
        self.drop_confidence = float(
            max(0.0, min(self.min_show_confidence, drop_confidence))
        )
        self.lock_seconds = float(max(0.0, lock_seconds))
        self.switch_min_similarity_gain = float(max(0.0, switch_min_similarity_gain))

    def can_switch(
        self,
        *,
        existing_employee_id: str,
        existing_similarity: float,
        existing_locked_until_ts: float,
        new_employee_id: str,
        new_similarity: float,
        now: float,
    ) -> bool:
        if str(existing_employee_id).strip() == str(new_employee_id).strip():
            return True
        if float(now) < float(existing_locked_until_ts):
            return False
        return float(new_similarity) >= (
            float(existing_similarity) + float(self.switch_min_similarity_gain)
        )

    def lock_until(self, *, now: float) -> float:
        return float(now) + float(self.lock_seconds)

    def reconcile(
        self,
        *,
        nodes: Dict[int, IdentityNode],
        active_track_ids: set[int],
        now: float,
    ) -> List[int]:
        if not nodes:
            return []

        by_employee: Dict[str, List[Tuple[float, int]]] = {}
        for tid, node in nodes.items():
            emp = str(node.employee_id or "").strip()
            if not emp:
                continue
            if int(tid) not in active_track_ids:
                continue
            # Weighted rank: confidence dominates; similarity and recency refine.
            age = max(0.0, float(now) - float(node.last_seen_ts))
            recency = max(0.0, 1.0 - min(1.0, age / 3.0))
            rank = (
                (0.67 * max(0.0, min(1.0, float(node.confidence))))
                + (0.24 * _sim_norm(float(node.similarity)))
                + (0.09 * recency)
            )
            by_employee.setdefault(emp, []).append((rank, int(tid)))

        removed: List[int] = []
        for emp, ranked in by_employee.items():
            if len(ranked) <= 1:
                continue
            ranked.sort(reverse=True, key=lambda x: x[0])
            keep_tid = int(ranked[0][1])
            for _rank, tid in ranked[1:]:
                node = nodes.get(int(tid))
                if node is None:
                    continue
                # Demote duplicates instead of hard delete to preserve short occlusion recovery.
                node.confidence = max(self.drop_confidence * 0.5, float(node.confidence) * 0.72)
                if node.confidence < self.drop_confidence:
                    removed.append(int(tid))
                    continue
                # Push the weaker duplicate into a lock window cooldown.
                node.locked_until_ts = max(float(node.locked_until_ts), self.lock_until(now=now))
                nodes[int(tid)] = node
            # Refresh primary node lock for stability.
            keep = nodes.get(keep_tid)
            if keep is not None:
                keep.locked_until_ts = max(float(keep.locked_until_ts), self.lock_until(now=now))
                nodes[keep_tid] = keep

        return removed
