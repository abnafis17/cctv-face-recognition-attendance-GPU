from __future__ import annotations

import argparse
import cv2
import numpy as np
from rich import print

from ..config import load_config
from ..backend_client import BackendClient
from ..capture import FrameGrabber
from ..recognizer import FaceRecognizer
from ..utils import (
    l2_normalize,
    quality_score,
    estimate_head_pose_deg,
    pose_label,
    pose_matches,
)


def main():
    parser = argparse.ArgumentParser(
        description="Enroll employee with multi-angle scanning from live camera/RTSP (stores to backend Postgres)."
    )
    parser.add_argument("--name", required=True, help="Employee name")
    parser.add_argument("--rtsp", default=None, help='RTSP URL OR "0" for webcam')
    args = parser.parse_args()

    cfg = load_config()

    # ✅ dotenv-based backend client
    client = BackendClient()
    print(f"[cyan]Backend URL:[/cyan] {client.base_url}")

    # ✅ avoid duplicate employees by name
    name_norm = args.name.strip().lower()
    existing = None
    try:
        for e in client.list_employees():
            if str(e.get("name", "")).strip().lower() == name_norm:
                existing = e
                break
    except Exception:
        existing = None

    if existing:
        employee_id = str(existing["id"])
        print(f"[green]Employee found[/green] name={args.name} id={employee_id}")
    else:
        emp = client.upsert_employee(args.name)
        employee_id = str(emp["id"])
        print(f"[bold green]Employee created[/bold green] name={args.name} id={employee_id}")

    # Recognizer
    recog = FaceRecognizer(
        model_name=cfg.recognition.model_name,
        use_gpu=bool(cfg.runtime.use_gpu),
        min_face_size=int(cfg.recognition.min_face_size),
    )

    # Camera source
    use_webcam = (args.rtsp is not None and str(args.rtsp).strip() == "0")

    cap = None
    grabber = None

    if use_webcam:
        cap = cv2.VideoCapture(0)
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, int(cfg.camera.width))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, int(cfg.camera.height))
        if not cap.isOpened():
            raise RuntimeError("Webcam (index 0) could not be opened. Close other apps using camera.")
        print("[green]Camera started[/green] source=webcam(0)")
    else:
        src = args.rtsp if args.rtsp is not None else cfg.camera.rtsp_url
        grabber = FrameGrabber(src, cfg.camera.width, cfg.camera.height)
        grabber.start()
        print(f"[green]Camera started[/green] source={src}")

    angles = list(cfg.enrollment.angles)  # ["front","left","right","up","down"]
    samples_per = int(cfg.enrollment.samples_per_angle)
    min_q = float(cfg.enrollment.min_quality_score)
    pose_on = bool(cfg.pose.enable_pose_check)
    allow_override = bool(cfg.enrollment.allow_manual_override)

    print(f"[bold green]Enrollment started[/bold green] name={args.name}")
    print("Controls: SPACE=capture, N=next angle, Q=quit")

    angle_idx = 0
    collected: dict[str, list[np.ndarray]] = {a: [] for a in angles}

    try:
        while True:
            # read frame
            if use_webcam:
                ok, frame = cap.read()
                if not ok or frame is None:
                    cv2.waitKey(1)
                    continue
            else:
                frame = grabber.read_latest()
                if frame is None:
                    cv2.waitKey(1)
                    continue

            dets = recog.detect_and_embed(frame)
            det = None
            yaw_pitch_roll = None
            ok_pose = True

            # pick largest face
            if dets:
                dets.sort(
                    key=lambda d: (d.bbox[2] - d.bbox[0]) * (d.bbox[3] - d.bbox[1]),
                    reverse=True,
                )
                det = dets[0]
                b = det.bbox.astype(int)
                q = quality_score(det.bbox, frame)

                cv2.rectangle(frame, (b[0], b[1]), (b[2], b[3]), (0, 255, 0), 2)
                cv2.putText(
                    frame,
                    f"quality={q:.0f}",
                    (b[0], max(20, b[1] - 10)),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2,
                )

                if pose_on and det.kps is not None:
                    yaw_pitch_roll = estimate_head_pose_deg(det.kps, frame.shape)
            else:
                q = 0.0

            required = angles[angle_idx]

            # pose gating info
            if yaw_pitch_roll is not None:
                yaw, pitch, roll = yaw_pitch_roll
                pred = pose_label(yaw, pitch, cfg_pose=cfg.pose.__dict__)
                ok_pose = pose_matches(required, yaw, pitch, cfg_pose=cfg.pose.__dict__)
                cv2.putText(
                    frame,
                    f"pose: yaw={yaw:.0f} pitch={pitch:.0f} => {pred}",
                    (10, 120),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2,
                )
                cv2.putText(
                    frame,
                    f"pose_match={ok_pose}",
                    (10, 150),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.7,
                    (255, 255, 255),
                    2,
                )
            elif pose_on:
                ok_pose = False

            # overlay UI
            msg = f"Enroll: {args.name} | Required: {required} | {len(collected[required])}/{samples_per}"
            cv2.putText(frame, msg, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.9, (255, 255, 255), 2)
            cv2.putText(
                frame,
                "Turn head to the required angle.",
                (10, 60),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )
            cv2.putText(
                frame,
                "SPACE capture | N next | Q quit",
                (10, 90),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.7,
                (255, 255, 255),
                2,
            )

            if pose_on:
                note = "Pose gating ON"
                if allow_override:
                    note += " (SPACE override allowed)"
                cv2.putText(frame, note, (10, 180), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)

            # ✅ always show window
            cv2.imshow("Enrollment (Live)", frame)

            k = cv2.waitKey(1) & 0xFF
            if k == ord("q"):
                break

            if k == ord("n"):
                angle_idx = min(angle_idx + 1, len(angles) - 1)

            if k == 32:  # SPACE capture
                if det is None:
                    print("[yellow]No face detected. Try again.[/yellow]")
                    continue
                if q < min_q:
                    print(f"[yellow]Low quality {q:.0f} < {min_q}. Move closer / reduce blur.[/yellow]")
                    continue
                if pose_on and (not ok_pose) and (not allow_override):
                    print("[yellow]Pose does not match required angle. Turn head and try again.[/yellow]")
                    continue

                collected[required].append(np.asarray(det.emb, dtype=np.float32))
                print(f"[cyan]Captured[/cyan] angle={required} sample={len(collected[required])}/{samples_per}")

                if len(collected[required]) >= samples_per and angle_idx < len(angles) - 1:
                    angle_idx += 1

            if all(len(collected[a]) >= samples_per for a in angles):
                break

    finally:
        # cleanup
        if grabber is not None:
            grabber.stop()
        if cap is not None:
            cap.release()
        cv2.destroyAllWindows()

    # Save templates to backend (one per angle)
    saved = 0
    for angle in angles:
        if len(collected[angle]) == 0:
            print(f"[red]No samples for angle {angle} - skipped[/red]")
            continue

        avg = l2_normalize(np.mean(np.stack(collected[angle], axis=0), axis=0))
        client.upsert_template(
            employee_id=employee_id,
            angle=angle,
            embedding=avg.astype(float).tolist(),
            model_name=cfg.recognition.model_name,
        )
        saved += 1
        print(f"[green]Saved template[/green] angle={angle} samples={len(collected[angle])}")

    print(f"[bold green]Enrollment complete[/bold green] employee_id={employee_id}, templates_saved={saved}")


if __name__ == "__main__":
    main()
