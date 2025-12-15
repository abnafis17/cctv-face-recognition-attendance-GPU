from __future__ import annotations

import time
import cv2
from rich import print

from ..config import load_config
from ..backend_client import BackendClient
from ..app_state import init_state
from ..capture import FrameGrabber
from ..recognizer import FaceRecognizer, match_gallery
from ..tracker import SimpleTracker
from ..utils import now_iso, ensure_dir, sleep_fps


def main():
    cfg = load_config()
    _state = init_state(cfg)

    # ✅ ALWAYS use dotenv BACKEND_BASE_URL
    client = BackendClient()
    print(f"[cyan]Backend URL:[/cyan] {client.base_url}")

    def load_gallery_from_backend():
        templates = client.list_templates()

        emp_ids = []
        names = []
        angles = []
        embs = []

        for t in templates:
            emp_ids.append(str(t["employeeId"]))
            names.append(str(t.get("employeeName") or t.get("name") or "Unknown"))
            angles.append(str(t.get("angle") or "front"))
            embs.append(t["embedding"])

        import numpy as np
        if embs:
            gallery = np.asarray(embs, dtype=np.float32)
        else:
            gallery = np.zeros((0, 512), dtype=np.float32)
        return emp_ids, names, angles, gallery

    emp_ids, names, angles, gallery = load_gallery_from_backend()
    print(f"[bold]Loaded gallery templates:[/bold] {len(names)}")
    if gallery.size == 0:
        print("[yellow]No enrolled employees. Enroll first.[/yellow]")

    recog = FaceRecognizer(
        model_name=cfg.recognition.model_name,
        use_gpu=bool(cfg.runtime.use_gpu),
        min_face_size=int(cfg.recognition.min_face_size),
    )

    grabber = FrameGrabber(cfg.camera.rtsp_url, cfg.camera.width, cfg.camera.height)
    grabber.start()

    tracker = SimpleTracker(iou_threshold=0.35, max_age_frames=30)

    cooldown = int(cfg.attendance.cooldown_seconds)
    stable_required = int(cfg.attendance.stable_hits_required)
    threshold = float(cfg.recognition.similarity_threshold)

    save_snaps = bool(cfg.attendance.save_snapshots)
    snap_dir = str(cfg.attendance.snapshot_dir)
    if save_snaps:
        ensure_dir(snap_dir)

    last_logged = {}
    frame_idx = 0
    last_dets = []

    ai_fps = float(cfg.runtime.ai_fps)
    detect_every = int(cfg.runtime.detect_every_n_frames)
    camera_id = str(cfg.camera.camera_id)

    print("Running. Keys: Q quit | R reload gallery")

    while True:
        frame = grabber.read_latest()
        if frame is None:
            cv2.waitKey(1)
            continue

        t0 = time.time()
        frame_idx += 1

        if frame_idx % detect_every == 0:
            face_dets = recog.detect_and_embed(frame)
            dets_for_tracker = []
            for fd in face_dets:
                gi, sim = match_gallery(fd.emb, gallery)
                if gi != -1 and sim >= threshold:
                    emp_id = emp_ids[gi]
                    name = names[gi]
                else:
                    emp_id = -1
                    name = "Unknown"
                dets_for_tracker.append((fd.bbox, name, emp_id, sim))
            last_dets = dets_for_tracker
            tracks = tracker.update(frame_idx, dets_for_tracker)
        else:
            tracks = tracker.update(frame_idx, last_dets)

        ts = now_iso()
        for tr in tracks:
            b = tr.bbox.astype(int)
            cv2.rectangle(frame, (b[0], b[1]), (b[2], b[3]), (0, 255, 0), 2)
            label = f"{tr.name} | sim={tr.similarity:.2f} | {ts}"
            cv2.putText(frame, label, (b[0], max(20, b[1] - 10)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 2)

            if tr.employee_id != -1 and tr.name != "Unknown":
                if tr.stable_name_hits < stable_required:
                    continue

                now_epoch = time.time()
                last = float(last_logged.get(tr.employee_id, 0.0))

                if now_epoch - last >= cooldown:
                    snapshot_path = None
                    if save_snaps:
                        snapshot_path = f"{snap_dir}/{tr.name}_{int(now_epoch)}.jpg"
                        cv2.imwrite(snapshot_path, frame)

                    client.create_attendance(
                        str(tr.employee_id),
                        ts,
                        camera_id,
                        float(tr.similarity),
                        snapshot_path,
                    )
                    last_logged[tr.employee_id] = now_epoch
                    print(f"[green]Logged[/green] {tr.name} {ts} sim={tr.similarity:.2f}")

        cv2.putText(frame, f"cam={camera_id} frame={frame_idx}", (10, 25),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        cv2.imshow("CCTV Attendance", frame)

        k = cv2.waitKey(1) & 0xFF
        if k == ord("q"):
            break
        if k == ord("r"):
            emp_ids, names, angles, gallery = load_gallery_from_backend()
            print(f"[cyan]Reloaded gallery templates[/cyan] count={len(names)}")

        sleep_fps(ai_fps, t0)

    grabber.stop()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
