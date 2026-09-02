from __future__ import annotations

import os
import time
from typing import Optional, Generator

import cv2

from app.core.container import ServiceContainer
from app.core.settings import normalize_stream_type
from app.enroll2_auto.hud import draw_enroll2_auto_hud


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return float(default)


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, str(default))).strip()))
    except Exception:
        return int(default)


def _stream_fps(name: str, default: float) -> float:
    value = _env_float(name, default)
    if value <= 0:
        value = default
    return max(1.0, min(60.0, float(value)))


def _jpeg_quality(name: str, default: int) -> int:
    value = _env_int(name, default)
    return max(30, min(95, int(value)))


def _pace(now: float, next_emit_at: float) -> bool:
    if now >= next_emit_at:
        return True
    time.sleep(min(0.02, next_emit_at - now))
    return False


def _stream_wait_settings() -> tuple[float, float]:
    initial_wait_s = max(0.1, _env_float("MJPEG_INITIAL_WAIT_S", 0.5))
    no_frame_timeout_s = max(
        initial_wait_s + 0.5, _env_float("MJPEG_NO_FRAME_TIMEOUT_S", 12.0)
    )
    return initial_wait_s, no_frame_timeout_s


def _startup_no_frame_timeout(no_frame_timeout_s: float) -> float:
    return max(
        float(no_frame_timeout_s),
        _env_float("MJPEG_STARTUP_NO_FRAME_TIMEOUT_S", 25.0),
    )


def mjpeg_generator_raw(
    container: ServiceContainer, camera_id: str
) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt
    initial_wait_s, no_frame_timeout_s = _stream_wait_settings()
    stream_fps = _stream_fps("MJPEG_STREAM_FPS_RAW", 15.0)
    frame_period_s = 1.0 / stream_fps
    jpg_quality = _jpeg_quality("MJPEG_RAW_JPEG_QUALITY", 90)

    # Wait for frames
    wait_deadline = time.monotonic() + initial_wait_s
    while time.monotonic() < wait_deadline:
        if camera_rt.get_frame(camera_id, copy=False) is not None:
            break
        time.sleep(0.05)

    last_frame_at = time.monotonic()
    next_emit_at = time.monotonic()

    try:
        while True:
            now = time.monotonic()
            if not _pace(now, next_emit_at):
                continue

            frame = camera_rt.get_frame(camera_id, copy=False)
            if frame is None:
                if (time.monotonic() - last_frame_at) >= no_frame_timeout_s:
                    print(
                        f"[MJPEG] closing raw stream cam={camera_id} no-frame>{no_frame_timeout_s:.1f}s"
                    )
                    return
                time.sleep(0.03)
                continue

            ok, jpg = cv2.imencode(
                ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), jpg_quality]
            )
            if not ok:
                continue

            b = jpg.tobytes()
            last_frame_at = time.monotonic()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n" + b + b"\r\n"
            )
            next_emit_at = max(next_emit_at + frame_period_s, time.monotonic())

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
    initial_wait_s, no_frame_timeout_s = _stream_wait_settings()
    stream_fps = _stream_fps(
        "MJPEG_STREAM_FPS_RECOGNITION", max(4.0, min(float(ai_fps), 30.0))
    )
    frame_period_s = 1.0 / stream_fps
    raw_jpg_quality = _jpeg_quality("MJPEG_RECOGNITION_FALLBACK_JPEG_QUALITY", 90)

    max_cached_jpeg_age_s = max(
        0.05, float(os.getenv("RECOGNITION_MAX_CACHED_JPEG_AGE_S", "0.1"))
    )

    st = normalize_stream_type(stream_type)
    stream_clients.inc(camera_id, st)

    rec_worker.start(camera_id, camera_name, ai_fps=float(ai_fps))

    wait_deadline = time.monotonic() + initial_wait_s
    while time.monotonic() < wait_deadline:
        if camera_rt.get_frame(camera_id, copy=False) is not None:
            break
        time.sleep(0.05)

    last_frame_at = time.monotonic()
    next_emit_at = time.monotonic()
    startup_no_frame_timeout_s = _startup_no_frame_timeout(no_frame_timeout_s)
    has_emitted_frame = False

    try:
        while True:
            now = time.monotonic()
            if not _pace(now, next_emit_at):
                continue

            jpg_bytes: Optional[bytes] = None
            cached = rec_worker.get_latest_jpeg_item(camera_id)
            if cached is not None:
                cached_bytes, cached_ts = cached
                age = time.time() - float(cached_ts)
                # Visual fallback: prefer slightly stale annotated frame over raw frame to prevent blinking.
                if age <= max(max_cached_jpeg_age_s, 2.0):
                    jpg_bytes = cached_bytes

            if jpg_bytes is None:
                # Prefer latest annotated frame to keep name/bbox display continuous.
                latest = rec_worker.get_latest_jpeg(camera_id)
                if latest is not None:
                    jpg_bytes = latest
                else:
                    raw = camera_rt.get_frame(camera_id, copy=False)
                    if raw is None:
                        timeout_s = (
                            no_frame_timeout_s
                            if has_emitted_frame
                            else startup_no_frame_timeout_s
                        )
                        if (time.monotonic() - last_frame_at) >= timeout_s:
                            print(
                                "[MJPEG] closing recognition stream "
                                f"cam={camera_id} no-frame>{timeout_s:.1f}s"
                            )
                            return
                        time.sleep(0.02)
                        continue

                    # Performance optimization: Downscale before JPEG compression.
                    p_w = _env_int("MJPEG_PREVIEW_WIDTH", 0)
                    p_h = _env_int("MJPEG_PREVIEW_HEIGHT", 0)
                    if p_w > 0 and p_h > 0:
                        raw = cv2.resize(raw, (p_w, p_h), interpolation=cv2.INTER_LINEAR)

                    ok, jpg = cv2.imencode(
                        ".jpg", raw, [int(cv2.IMWRITE_JPEG_QUALITY), raw_jpg_quality]
                    )
                    if not ok:
                        continue
                    jpg_bytes = jpg.tobytes()

            last_frame_at = time.monotonic()
            has_emitted_frame = True
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: "
                + str(len(jpg_bytes)).encode()
                + b"\r\n\r\n"
                + jpg_bytes
                + b"\r\n"
            )
            next_emit_at = max(next_emit_at + frame_period_s, time.monotonic())

    except GeneratorExit:
        return

    finally:
        left = stream_clients.dec(camera_id, st)
        # Keep background recognition alive for server-managed cameras.
        if left == 0 and not camera_rt.is_running(camera_id):
            rec_worker.stop(camera_id)


def mjpeg_generator_enroll2_auto(
    container: ServiceContainer, camera_id: str
) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt
    enroller2_auto = container.enroller2_auto
    initial_wait_s, no_frame_timeout_s = _stream_wait_settings()
    stream_fps = _stream_fps("MJPEG_STREAM_FPS_ENROLL", 12.0)
    frame_period_s = 1.0 / stream_fps
    jpg_quality = _jpeg_quality("MJPEG_ENROLL_JPEG_QUALITY", 90)

    wait_deadline = time.monotonic() + initial_wait_s
    while time.monotonic() < wait_deadline:
        if camera_rt.get_frame(camera_id) is not None:
            break
        time.sleep(0.05)

    last_frame_at = time.monotonic()
    next_emit_at = time.monotonic()

    try:
        while True:
            now = time.monotonic()
            if not _pace(now, next_emit_at):
                continue

            frame = camera_rt.get_frame(camera_id)
            if frame is None:
                if (time.monotonic() - last_frame_at) >= no_frame_timeout_s:
                    print(
                        f"[MJPEG] closing enroll stream cam={camera_id} no-frame>{no_frame_timeout_s:.1f}s"
                    )
                    return
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

            ok, jpg = cv2.imencode(
                ".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), jpg_quality]
            )
            if not ok:
                continue

            b = jpg.tobytes()
            last_frame_at = time.monotonic()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(b)).encode() + b"\r\n\r\n" + b + b"\r\n"
            )
            next_emit_at = max(next_emit_at + frame_period_s, time.monotonic())

    except GeneratorExit:
        return


def mjpeg_generator_presence(
    container: ServiceContainer, camera_id: str, ai_fps: float
) -> Generator[bytes, None, None]:
    camera_rt = container.camera_rt
    presence_worker = container.presence_worker
    presence_clients = container.presence_clients
    initial_wait_s, no_frame_timeout_s = _stream_wait_settings()
    stream_fps = _stream_fps(
        "MJPEG_STREAM_FPS_PRESENCE", max(3.0, min(float(ai_fps), 20.0))
    )
    frame_period_s = 1.0 / stream_fps
    raw_jpg_quality = _jpeg_quality("MJPEG_PRESENCE_FALLBACK_JPEG_QUALITY", 90)
    max_cached_jpeg_age_s = max(
        0.2, float(os.getenv("PRESENCE_MAX_CACHED_JPEG_AGE_S", "0.75"))
    )

    presence_clients.inc(camera_id)
    presence_worker.start(camera_id, ai_fps=float(ai_fps))

    wait_deadline = time.monotonic() + initial_wait_s
    while time.monotonic() < wait_deadline:
        if camera_rt.get_frame(camera_id, copy=False) is not None:
            break
        time.sleep(0.05)

    last_frame_at = time.monotonic()
    next_emit_at = time.monotonic()

    try:
        while True:
            now = time.monotonic()
            if not _pace(now, next_emit_at):
                continue

            jpg_bytes: Optional[bytes] = None
            cached = presence_worker.get_latest_jpeg_item(camera_id)
            if cached is not None:
                cached_bytes, cached_ts = cached
                age = time.time() - float(cached_ts)
                # Visual fallback: prefer slightly stale annotated frame over raw frame to prevent blinking.
                if age <= max(max_cached_jpeg_age_s, 2.0):
                    jpg_bytes = cached_bytes

            if jpg_bytes is None:
                raw = camera_rt.get_frame(camera_id, copy=False)
                if raw is None:
                    if (time.monotonic() - last_frame_at) >= no_frame_timeout_s:
                        print(
                            "[MJPEG] closing presence stream "
                            f"cam={camera_id} no-frame>{no_frame_timeout_s:.1f}s"
                        )
                        return
                    time.sleep(0.02)
                    continue
                ok, jpg = cv2.imencode(
                    ".jpg", raw, [int(cv2.IMWRITE_JPEG_QUALITY), raw_jpg_quality]
                )
                if not ok:
                    continue
                jpg_bytes = jpg.tobytes()

            last_frame_at = time.monotonic()
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: "
                + str(len(jpg_bytes)).encode()
                + b"\r\n\r\n"
                + jpg_bytes
                + b"\r\n"
            )
            next_emit_at = max(next_emit_at + frame_period_s, time.monotonic())

    except GeneratorExit:
        return

    finally:
        left = presence_clients.dec(camera_id)
        if left == 0:
            presence_worker.stop(camera_id)
