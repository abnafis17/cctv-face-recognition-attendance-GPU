from __future__ import annotations

import os
import time
from typing import Optional, Generator

import cv2

from app.core.container import ServiceContainer
from app.core.settings import normalize_stream_type
from app.enroll2_auto.hud import draw_enroll2_auto_hud


def mjpeg_generator_raw(container: ServiceContainer, camera_id: str) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt

    # Wait for frames
    for _ in range(60):
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    try:
        while True:
            frame = camera_rt.get_frame(camera_id)
            if frame is None:
                time.sleep(0.03)
                continue

            ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if not ok:
                continue

            b = jpg.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n" + b + b"\r\n"
            )
            time.sleep(0.01)

    except GeneratorExit:
        return


def mjpeg_generator_recognition(
    container: ServiceContainer,
    camera_id: str,
    camera_name: str,
    ai_fps: float,
    stream_type: Optional[str],
) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt
    rec_worker = container.rec_worker
    stream_clients = container.stream_clients

    max_cached_jpeg_age_s = max(
        0.2, float(os.getenv("RECOGNITION_MAX_CACHED_JPEG_AGE_S", "1.5"))
    )

    st = normalize_stream_type(stream_type)
    stream_clients.inc(camera_id, st)

    rec_worker.start(camera_id, camera_name, ai_fps=float(ai_fps))

    for _ in range(60):
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    try:
        while True:
            jpg_bytes: Optional[bytes] = None
            cached = rec_worker.get_latest_jpeg_item(camera_id)
            if cached is not None:
                cached_bytes, cached_ts = cached
                if (time.time() - float(cached_ts)) <= max_cached_jpeg_age_s:
                    jpg_bytes = cached_bytes

            if jpg_bytes is None:
                raw = camera_rt.get_frame(camera_id)
                if raw is None:
                    time.sleep(0.02)
                    continue
                ok, jpg = cv2.imencode(".jpg", raw, [int(cv2.IMWRITE_JPEG_QUALITY), 65])
                if not ok:
                    continue
                jpg_bytes = jpg.tobytes()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: "
                + str(len(jpg_bytes)).encode()
                + b"\r\n\r\n"
                + jpg_bytes
                + b"\r\n"
            )
            time.sleep(0.01)

    except GeneratorExit:
        return

    finally:
        left = stream_clients.dec(camera_id, st)
        if left == 0:
            rec_worker.stop(camera_id)


def mjpeg_generator_enroll2_auto(
    container: ServiceContainer, camera_id: str
) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt
    enroller2_auto = container.enroller2_auto

    for _ in range(60):
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    try:
        while True:
            frame = camera_rt.get_frame(camera_id)
            if frame is None:
                time.sleep(0.03)
                continue

            st = enroller2_auto.overlay_state()
            if st.get("running") and st.get("camera_id") == camera_id:
                h, w = frame.shape[:2]
                cfg = enroller2_auto.cfg
                roi = (
                    int(cfg.roi_x0 * w),
                    int(cfg.roi_y0 * h),
                    int(cfg.roi_x1 * w),
                    int(cfg.roi_y1 * h),
                )

                bbox = st.get("bbox")
                primary = None if not bbox else tuple(int(v) for v in bbox)

                hud = {
                    "mode": "enroll2-auto",
                    "step": str(st.get("step", "")),
                    "instr": str(st.get("instruction", "")),
                    "q": f"{float(st.get('quality') or 0.0):.1f}",
                    "pose": str(st.get("pose") or "-"),
                    "msg": str(st.get("message") or ""),
                    "roi_faces": str(st.get("roi_faces") or 0),
                }
                frame = draw_enroll2_auto_hud(frame, roi, primary, hud)

            ok, jpg = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if not ok:
                continue

            b = jpg.tobytes()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n" + b + b"\r\n"
            )
            time.sleep(0.01)

    except GeneratorExit:
        return
