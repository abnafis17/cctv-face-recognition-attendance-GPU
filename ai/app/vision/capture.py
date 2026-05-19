from __future__ import annotations

import os
import re
import shutil
import subprocess
import threading
import time
from collections import deque
from typing import List, Optional, Protocol, Tuple, Union
from urllib.parse import urlsplit, urlunsplit

import cv2
import numpy as np


def _env_float(name: str, default: float) -> float:
    try:
        return float(str(os.getenv(name, str(default))).strip())
    except Exception:
        return default


def _env_int(name: str, default: int) -> int:
    try:
        return int(float(str(os.getenv(name, str(default))).strip()))
    except Exception:
        return default


def _env_bool(name: str, default: bool) -> bool:
    raw = str(os.getenv(name, "1" if default else "0")).strip().lower()
    return raw in {"1", "true", "yes", "on"}


def _is_webcam_source(value: str) -> bool:
    return str(value or "").strip().isdigit()


def _is_network_stream(value: str) -> bool:
    raw = str(value or "").strip().lower()
    if not raw:
        return False
    if _is_webcam_source(raw):
        return False
    return (
        "://" in raw
        or raw.startswith("rtsp:")
        or raw.startswith("rtsps:")
        or raw.startswith("rtmp:")
        or raw.startswith("udp:")
        or raw.startswith("tcp:")
    )


def _redact_source(value: str) -> str:
    """
    Hide credentials in stream URLs before logging.
    Example: rtsp://user:pass@host/path -> rtsp://user:***@host/path
    """
    raw = str(value or "").strip()
    if not raw:
        return raw
    if "://" not in raw or "@" not in raw:
        return raw

    try:
        parts = urlsplit(raw)
        netloc = parts.netloc
        if "@" not in netloc:
            return raw

        creds, host = netloc.rsplit("@", 1)
        if ":" in creds:
            user, _ = creds.split(":", 1)
            safe_creds = f"{user}:***"
        else:
            safe_creds = f"{creds}:***"

        safe_netloc = f"{safe_creds}@{host}"
        return urlunsplit(
            (parts.scheme, safe_netloc, parts.path, parts.query, parts.fragment)
        )
    except Exception:
        # Fallback: simple user:pass@ matcher
        return re.sub(r"(://[^:/@]+:)[^@]+@", r"\1***@", raw)


def _resolve_ffmpeg_exe() -> str:
    raw = os.getenv("FFMPEG_EXE")
    if raw:
        candidate = str(raw).strip().strip('"')
        if os.path.isdir(candidate):
            name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
            candidate = os.path.join(candidate, name)
        if os.path.isfile(candidate):
            return candidate

    exe = shutil.which("ffmpeg") or shutil.which("ffmpeg.exe")
    if exe:
        return exe

    try:
        import imageio_ffmpeg  # type: ignore

        exe = imageio_ffmpeg.get_ffmpeg_exe()
        if exe and os.path.isfile(exe):
            return exe
    except Exception:
        pass

    raise RuntimeError(
        "FFmpeg not found. Install FFmpeg and add it to PATH, or set FFMPEG_EXE."
    )


class _GrabberImpl(Protocol):
    backend_name: str

    def start(self) -> None: ...

    def stop(self) -> None: ...

    def read_latest(self, copy: bool = True) -> Optional[np.ndarray]: ...


class _OpenCVGrabber:
    backend_name = "opencv"

    def __init__(
        self,
        *,
        rtsp_url: str,
        width: int,
        height: int,
        prefer_max_webcam_res: bool,
        target_fps: int,
    ) -> None:
        self.rtsp_url = rtsp_url
        self._source_log = _redact_source(rtsp_url)
        self.width = int(width)
        self.height = int(height)
        self.prefer_max_webcam_res = bool(prefer_max_webcam_res)
        self.target_fps = int(target_fps)

        self.frame_stale_sec = max(0.5, _env_float("FRAME_STALE_SEC", 5.0))
        self.frame_max_fails = max(1, _env_int("FRAME_MAX_FAILS", 30))
        self.frame_reopen_wait_sec = max(0.05, _env_float("FRAME_REOPEN_WAIT_SEC", 0.5))
        self.cap_open_timeout_ms = max(0, _env_int("CAP_OPEN_TIMEOUT_MS", 5000))
        self.cap_read_timeout_ms = max(0, _env_int("CAP_READ_TIMEOUT_MS", 5000))

        self.cap: Optional[cv2.VideoCapture] = None
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def read_latest(self, copy: bool = True) -> Optional[np.ndarray]:
        with self._lock:
            frame = self._frame
            if frame is None:
                return None
            return frame.copy() if copy else frame

    def stop(self) -> None:
        self._running = False
        cap = self.cap
        self.cap = None

        join_timeout = max(0.0, _env_float("FRAME_STOP_JOIN_TIMEOUT_S", 0.2))
        if self._thread:
            self._thread.join(timeout=join_timeout)
        self._thread = None

        if cap:
            try:
                cap.release()
            except Exception:
                pass

    def _open_capture(self) -> bool:
        src: Union[str, int] = self.rtsp_url
        is_webcam = isinstance(src, str) and _is_webcam_source(src)
        cap: Optional[cv2.VideoCapture] = None

        try:
            if is_webcam:
                idx = int(str(src).strip())
                cap = cv2.VideoCapture(idx, cv2.CAP_DSHOW)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

                if self.target_fps > 0:
                    cap.set(cv2.CAP_PROP_FPS, float(self.target_fps))

                if self.prefer_max_webcam_res:
                    best = self._negotiate_best_webcam_resolution(cap)
                else:
                    best = self._set_resolution(cap, self.width, self.height)

                self._log_stream_info(prefix=f"Webcam[{idx}]", best_hint=best, cap=cap)
            else:
                os.environ.setdefault(
                    "OPENCV_FFMPEG_CAPTURE_OPTIONS",
                    "rtsp_transport;tcp|fflags;nobuffer|max_delay;0|flags;low_delay|reorder_queue_size;0",
                )
                cap = cv2.VideoCapture()
                if (
                    self.cap_open_timeout_ms > 0
                    and hasattr(cv2, "CAP_PROP_OPEN_TIMEOUT_MSEC")
                ):
                    cap.set(cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, float(self.cap_open_timeout_ms))
                if (
                    self.cap_read_timeout_ms > 0
                    and hasattr(cv2, "CAP_PROP_READ_TIMEOUT_MSEC")
                ):
                    cap.set(cv2.CAP_PROP_READ_TIMEOUT_MSEC, float(self.cap_read_timeout_ms))
                cap.open(str(src), cv2.CAP_FFMPEG)
                cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
                self._set_resolution(cap, self.width, self.height)
                self._log_stream_info(prefix="RTSP", best_hint=None, cap=cap)

            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                return False

            old = self.cap
            self.cap = cap
            if old is not None and old is not cap:
                old.release()
            return True

        except Exception:
            try:
                if cap is not None:
                    cap.release()
            except Exception:
                pass
            return False

    def _reopen_capture(self, reason: str) -> None:
        try:
            if self.cap is not None:
                self.cap.release()
        except Exception:
            pass
        self.cap = None
        with self._lock:
            self._frame = None
        print(f"[FrameGrabber][opencv] reopen ({reason}) src={self._source_log}")

    def _loop(self) -> None:
        reopen_backoff = float(self.frame_reopen_wait_sec)
        last_ok = time.monotonic()
        fails = 0

        while self._running:
            cap = self.cap
            if cap is None or not cap.isOpened():
                if self._open_capture():
                    fails = 0
                    last_ok = time.monotonic()
                    reopen_backoff = float(self.frame_reopen_wait_sec)
                    continue
                time.sleep(reopen_backoff)
                reopen_backoff = min(reopen_backoff * 2.0, 10.0)
                continue

            try:
                ok, frame = cap.read()
            except Exception as exc:
                ok, frame = False, None
                print(f"[FrameGrabber][opencv] read failed ({exc}); will reopen")
                fails = self.frame_max_fails

            now = time.monotonic()
            if ok and frame is not None:
                fails = 0
                last_ok = now
                reopen_backoff = float(self.frame_reopen_wait_sec)
                with self._lock:
                    self._frame = frame
                continue

            fails += 1
            time.sleep(0.02)
            if fails >= self.frame_max_fails or (now - last_ok) > self.frame_stale_sec:
                reason = "stale" if (now - last_ok) > self.frame_stale_sec else "fail"
                self._reopen_capture(reason=reason)
                time.sleep(reopen_backoff)
                reopen_backoff = min(reopen_backoff * 2.0, 10.0)

    def _negotiate_best_webcam_resolution(self, cap: cv2.VideoCapture) -> Tuple[int, int]:
        candidates: List[Tuple[int, int]] = [
            (1920, 1080),
            (1600, 900),
            (1280, 720),
            (1024, 576),
            (960, 540),
            (800, 600),
            (640, 480),
        ]
        if (self.width, self.height) not in candidates:
            candidates.insert(0, (self.width, self.height))

        for w, h in candidates:
            aw, ah = self._set_resolution(cap, w, h)
            if aw >= int(0.95 * w) and ah >= int(0.95 * h):
                return aw, ah

        aw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        ah = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return aw, ah

    def _set_resolution(self, cap: cv2.VideoCapture, w: int, h: int) -> Tuple[int, int]:
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, float(w))
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, float(h))
        time.sleep(0.05)
        aw = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        ah = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        return aw, ah

    def _log_stream_info(
        self, prefix: str, best_hint: Optional[Tuple[int, int]], cap: cv2.VideoCapture
    ) -> None:
        if cap is None:
            return
        w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
        h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
        fps = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
        hint = f" (negotiated {best_hint[0]}x{best_hint[1]})" if best_hint else ""
        print(f"[FrameGrabber][opencv] {prefix}: {w}x{h} @ {fps:.1f}fps{hint}")


class _FFmpegGrabber:
    backend_name = "ffmpeg"

    def __init__(
        self,
        *,
        rtsp_url: str,
        width: int,
        height: int,
        target_fps: int,
    ) -> None:
        self.rtsp_url = str(rtsp_url or "").strip()
        self._source_log = _redact_source(self.rtsp_url)
        self.width = max(16, int(width))
        self.height = max(16, int(height))
        self.target_fps = max(0, int(target_fps))
        self.ffmpeg_exe = _resolve_ffmpeg_exe()

        self.frame_stale_sec = max(0.5, _env_float("FRAME_STALE_SEC", 5.0))
        self.frame_reopen_wait_sec = max(0.05, _env_float("FRAME_REOPEN_WAIT_SEC", 0.5))
        self.startup_frame_timeout_s = max(
            3.0, _env_float("FFMPEG_CAPTURE_STARTUP_FRAME_TIMEOUT_S", 15.0)
        )
        self.max_startup_failures_before_fallback = max(
            1, _env_int("FFMPEG_CAPTURE_MAX_STARTUP_FAILS_BEFORE_FALLBACK", 6)
        )
        self.stderr_tail_lines = max(
            1, _env_int("FFMPEG_CAPTURE_STDERR_TAIL_LINES", 12)
        )

        self.ffmpeg_loglevel = str(
            os.getenv("FFMPEG_CAPTURE_LOGLEVEL", "warning")
        ).strip() or "warning"
        self.ffmpeg_rtsp_transport = str(
            os.getenv("FFMPEG_CAPTURE_RTSP_TRANSPORT", "tcp")
        ).strip() or "tcp"
        self.ffmpeg_rtsp_flags = str(
            os.getenv("FFMPEG_CAPTURE_RTSP_FLAGS", "prefer_tcp")
        ).strip()
        self.ffmpeg_fflags = str(
            os.getenv("FFMPEG_CAPTURE_FFLAGS", "nobuffer+discardcorrupt")
        ).strip()
        self.ffmpeg_low_delay_flags = str(
            os.getenv("FFMPEG_CAPTURE_FLAGS", "low_delay")
        ).strip()

        # Connect timeout for RTSP demuxer. Keep 0 by default for broad FFmpeg compatibility.
        self.ffmpeg_timeout_us = max(0, _env_int("FFMPEG_CAPTURE_TIMEOUT_US", 0))
        self.ffmpeg_rw_timeout_us = max(
            0, _env_int("FFMPEG_CAPTURE_RW_TIMEOUT_US", 15000000)
        )
        # Safer defaults for camera streams; very tiny probe values often cause early EOF.
        self.ffmpeg_probesize = max(0, _env_int("FFMPEG_CAPTURE_PROBESIZE", 5000000))
        self.ffmpeg_analyzeduration = max(
            0, _env_int("FFMPEG_CAPTURE_ANALYZEDURATION", 5000000)
        )
        self.ffmpeg_max_delay_us = max(0, _env_int("FFMPEG_CAPTURE_MAX_DELAY_US", 0))
        self.ffmpeg_reorder_queue_size = max(
            0, _env_int("FFMPEG_CAPTURE_REORDER_QUEUE_SIZE", 0)
        )
        self.ffmpeg_use_wallclock = _env_bool("FFMPEG_CAPTURE_USE_WALLCLOCK", False)

        self.ffmpeg_hwaccel = str(os.getenv("FFMPEG_HWACCEL", "none")).strip().lower()
        self.ffmpeg_hwaccel_device = str(
            os.getenv("FFMPEG_HWACCEL_DEVICE", "")
        ).strip()

        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._proc: Optional[subprocess.Popen] = None
        self._stderr_thread: Optional[threading.Thread] = None
        self._stderr_tail: deque[str] = deque(maxlen=self.stderr_tail_lines)
        self._last_ok_mono = 0.0
        self._spawned_at_mono = 0.0
        self._startup_failures = 0
        self._fallback_recommended = False

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def read_latest(self, copy: bool = True) -> Optional[np.ndarray]:
        with self._lock:
            frame = self._frame
            if frame is None:
                return None
            return frame.copy() if copy else frame

    def stop(self) -> None:
        self._running = False
        self._terminate_proc()
        join_timeout = max(0.0, _env_float("FRAME_STOP_JOIN_TIMEOUT_S", 0.2))
        if self._thread:
            self._thread.join(timeout=join_timeout)
        self._thread = None
        with self._lock:
            self._frame = None

    def fallback_recommended(self) -> bool:
        return bool(self._fallback_recommended)

    def _stderr_reader_loop(self, proc: subprocess.Popen) -> None:
        stream = proc.stderr
        if stream is None:
            return
        try:
            while self._running and proc.poll() is None:
                line = stream.readline()
                if not line:
                    break
                if isinstance(line, bytes):
                    text = line.decode("utf-8", errors="replace").strip()
                else:
                    text = str(line).strip()
                if text:
                    self._stderr_tail.append(text)
        except Exception:
            pass

    def _stderr_tail_text(self) -> str:
        if not self._stderr_tail:
            return ""
        return " | ".join(self._stderr_tail)

    def _build_ffmpeg_args(self) -> List[str]:
        args: List[str] = [
            self.ffmpeg_exe,
            "-hide_banner",
            "-loglevel",
            self.ffmpeg_loglevel,
            "-nostdin",
        ]

        is_rtsp = self.rtsp_url.lower().startswith(("rtsp://", "rtsps://"))
        if is_rtsp and self.ffmpeg_rtsp_transport:
            args.extend(["-rtsp_transport", self.ffmpeg_rtsp_transport])
        if is_rtsp and self.ffmpeg_rtsp_flags:
            args.extend(["-rtsp_flags", self.ffmpeg_rtsp_flags])
        if self.ffmpeg_timeout_us > 0:
            args.extend(["-timeout", str(self.ffmpeg_timeout_us)])
        if self.ffmpeg_rw_timeout_us > 0:
            args.extend(["-rw_timeout", str(self.ffmpeg_rw_timeout_us)])
        if self.ffmpeg_max_delay_us > 0:
            args.extend(["-max_delay", str(self.ffmpeg_max_delay_us)])
        if self.ffmpeg_fflags:
            args.extend(["-fflags", self.ffmpeg_fflags])
        if self.ffmpeg_low_delay_flags:
            args.extend(["-flags", self.ffmpeg_low_delay_flags])
        if self.ffmpeg_probesize > 0:
            args.extend(["-probesize", str(self.ffmpeg_probesize)])
        if self.ffmpeg_analyzeduration > 0:
            args.extend(["-analyzeduration", str(self.ffmpeg_analyzeduration)])
        if self.ffmpeg_reorder_queue_size > 0:
            args.extend(["-reorder_queue_size", str(self.ffmpeg_reorder_queue_size)])
        if self.ffmpeg_use_wallclock:
            args.extend(["-use_wallclock_as_timestamps", "1"])

        if self.ffmpeg_hwaccel and self.ffmpeg_hwaccel not in {"", "none", "off"}:
            args.extend(["-hwaccel", self.ffmpeg_hwaccel])
            if self.ffmpeg_hwaccel_device:
                args.extend(["-hwaccel_device", self.ffmpeg_hwaccel_device])

        args.extend(["-i", self.rtsp_url])

        vf_parts: List[str] = []
        if self.width > 0 and self.height > 0:
            vf_parts.append(f"scale={self.width}:{self.height}")
        if self.target_fps > 0:
            vf_parts.append(f"fps={self.target_fps}")
        if vf_parts:
            args.extend(["-vf", ",".join(vf_parts)])

        args.extend(
            [
                "-an",
                "-sn",
                "-dn",
                "-pix_fmt",
                "bgr24",
                "-f",
                "rawvideo",
                "pipe:1",
            ]
        )
        return args

    def _spawn_proc(self) -> bool:
        self._terminate_proc()
        try:
            args = self._build_ffmpeg_args()
            self._stderr_tail.clear()
            self._proc = subprocess.Popen(
                args,
                stdin=subprocess.DEVNULL,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                bufsize=0,
            )
            self._spawned_at_mono = time.monotonic()
            self._last_ok_mono = self._spawned_at_mono

            self._stderr_thread = threading.Thread(
                target=self._stderr_reader_loop,
                args=(self._proc,),
                daemon=True,
            )
            self._stderr_thread.start()

            print(
                f"[FrameGrabber][ffmpeg] started {self.width}x{self.height} "
                f"fps={self.target_fps or 'source'} src={self._source_log}"
            )
            return True
        except Exception as exc:
            print(f"[FrameGrabber][ffmpeg] spawn failed src={self._source_log}: {exc}")
            self._proc = None
            return False

    def _terminate_proc(self) -> None:
        proc = self._proc
        self._proc = None
        stderr_thread = self._stderr_thread
        self._stderr_thread = None
        if not proc:
            return
        try:
            if proc.stdout:
                proc.stdout.close()
        except Exception:
            pass
        try:
            if proc.stderr:
                proc.stderr.close()
        except Exception:
            pass
        try:
            if proc.poll() is None:
                proc.terminate()
                proc.wait(timeout=0.5)
        except Exception:
            try:
                proc.kill()
            except Exception:
                pass
        if stderr_thread:
            try:
                stderr_thread.join(timeout=0.2)
            except Exception:
                pass

    def _read_exact(self, size: int) -> Optional[bytes]:
        proc = self._proc
        if not proc or proc.stdout is None:
            return None

        data = bytearray()
        while self._running and len(data) < size:
            chunk = proc.stdout.read(size - len(data))
            if not chunk:
                return None
            data.extend(chunk)
        if len(data) != size:
            return None
        return bytes(data)

    def _mark_startup_failure(self, extra_reason: str = "") -> None:
        self._startup_failures += 1
        if self._startup_failures >= self.max_startup_failures_before_fallback:
            self._fallback_recommended = True

        proc = self._proc
        rc = proc.poll() if proc else None
        detail = self._stderr_tail_text()
        reason = "startup-fail"
        if extra_reason:
            reason = f"{reason}:{extra_reason}"
        suffix = f" rc={rc}" if rc is not None else ""
        if detail:
            print(
                f"[FrameGrabber][ffmpeg] {reason}{suffix} src={self._source_log} stderr={detail}"
            )
        else:
            print(f"[FrameGrabber][ffmpeg] {reason}{suffix} src={self._source_log}")

    def _mark_frame_success(self) -> None:
        self._startup_failures = 0
        self._fallback_recommended = False

    def _loop(self) -> None:
        frame_bytes = self.width * self.height * 3
        reopen_backoff = float(self.frame_reopen_wait_sec)
        had_frame_since_spawn = False

        while self._running:
            proc = self._proc
            if proc is None or proc.poll() is not None:
                if not self._spawn_proc():
                    time.sleep(reopen_backoff)
                    reopen_backoff = min(reopen_backoff * 2.0, 10.0)
                    continue
                reopen_backoff = float(self.frame_reopen_wait_sec)
                had_frame_since_spawn = False

            payload = self._read_exact(frame_bytes)
            if payload is None:
                now = time.monotonic()
                stale_for = now - self._last_ok_mono
                age_since_spawn = now - float(self._spawned_at_mono or now)
                exited = bool(self._proc and self._proc.poll() is not None)

                if not had_frame_since_spawn:
                    startup_like = exited or age_since_spawn <= self.startup_frame_timeout_s
                    if startup_like:
                        extra = "exit-before-frame" if exited else "no-frame-before-timeout"
                        self._mark_startup_failure(extra_reason=extra)

                reason = "stale" if stale_for > self.frame_stale_sec else "eof"
                print(f"[FrameGrabber][ffmpeg] reopen ({reason}) src={self._source_log}")
                self._terminate_proc()
                with self._lock:
                    self._frame = None
                time.sleep(reopen_backoff)
                reopen_backoff = min(reopen_backoff * 2.0, 10.0)
                continue

            frame = np.frombuffer(payload, dtype=np.uint8).reshape(
                (self.height, self.width, 3)
            )
            with self._lock:
                self._frame = frame
            self._last_ok_mono = time.monotonic()
            had_frame_since_spawn = True
            self._mark_frame_success()
            reopen_backoff = float(self.frame_reopen_wait_sec)


class _FFmpegWithOpenCVFallback:
    backend_name = "ffmpeg"

    def __init__(
        self,
        *,
        ffmpeg_grabber: _FFmpegGrabber,
        rtsp_url: str,
        width: int,
        height: int,
        prefer_max_webcam_res: bool,
        target_fps: int,
    ) -> None:
        self._ffmpeg = ffmpeg_grabber
        self._source_log = _redact_source(rtsp_url)
        self._width = int(width)
        self._height = int(height)
        self._prefer_max_webcam_res = bool(prefer_max_webcam_res)
        self._target_fps = int(target_fps)
        self._running = False
        self._active_impl: _GrabberImpl = self._ffmpeg
        self._opencv_fallback: Optional[_OpenCVGrabber] = None
        self._switch_lock = threading.Lock()
        self._allow_fallback = _env_bool(
            "FFMPEG_CAPTURE_AUTO_FALLBACK_TO_OPENCV", True
        )

    def _build_opencv_fallback(self) -> _OpenCVGrabber:
        return _OpenCVGrabber(
            rtsp_url=self._ffmpeg.rtsp_url,
            width=self._width,
            height=self._height,
            prefer_max_webcam_res=self._prefer_max_webcam_res,
            target_fps=self._target_fps,
        )

    def _maybe_switch_to_opencv(self) -> None:
        if not self._allow_fallback:
            return
        if self._active_impl is not self._ffmpeg:
            return
        if not self._ffmpeg.fallback_recommended():
            return

        with self._switch_lock:
            if self._active_impl is not self._ffmpeg:
                return
            if not self._ffmpeg.fallback_recommended():
                return
            if not self._running:
                return

            print(
                "[FrameGrabber] switching backend ffmpeg -> opencv "
                f"after repeated startup failures src={self._source_log}"
            )

            try:
                self._ffmpeg.stop()
            except Exception:
                pass

            self._opencv_fallback = self._build_opencv_fallback()
            self._opencv_fallback.start()
            self._active_impl = self._opencv_fallback
            self.backend_name = "opencv-fallback"

    def start(self) -> None:
        if self._running:
            return
        self._running = True
        self._active_impl.start()

    def stop(self) -> None:
        self._running = False
        try:
            self._active_impl.stop()
        except Exception:
            pass
        if self._opencv_fallback is not None and self._active_impl is not self._opencv_fallback:
            try:
                self._opencv_fallback.stop()
            except Exception:
                pass
        # Ensure ffmpeg process is not left running if already switched.
        if self._active_impl is not self._ffmpeg:
            try:
                self._ffmpeg.stop()
            except Exception:
                pass

    def read_latest(self, copy: bool = True) -> Optional[np.ndarray]:
        frame = self._active_impl.read_latest(copy=copy)
        if frame is not None:
            return frame
        self._maybe_switch_to_opencv()
        if self._active_impl is not self._ffmpeg:
            return self._active_impl.read_latest(copy=copy)
        return None


class FrameGrabber:
    """
    Source capture wrapper with pluggable backend:
    - ffmpeg for RTSP/network streams (default in auto mode)
    - opencv for local webcams and fallback
    """

    def __init__(
        self,
        rtsp_url: str,
        width: int = 1280,
        height: int = 720,
        prefer_max_webcam_res: bool = True,
        target_fps: int = 30,
    ):
        self.rtsp_url = str(rtsp_url or "").strip()
        self.width = max(16, int(width))
        self.height = max(16, int(height))
        self.prefer_max_webcam_res = bool(prefer_max_webcam_res)
        self.target_fps = max(0, int(target_fps))

        requested_backend = str(
            os.getenv("STREAM_CAPTURE_BACKEND", "auto")
        ).strip().lower()
        self.requested_backend = requested_backend if requested_backend else "auto"

        self._impl: _GrabberImpl = self._build_impl()
        self.backend_name = str(getattr(self._impl, "backend_name", "opencv"))

    def _build_impl(self) -> _GrabberImpl:
        source = self.rtsp_url
        safe_source = _redact_source(source)
        is_webcam = _is_webcam_source(source)
        is_network = _is_network_stream(source)
        request = self.requested_backend

        def _ffmpeg_with_fallback() -> _GrabberImpl:
            ffmpeg = _FFmpegGrabber(
                rtsp_url=source,
                width=self.width,
                height=self.height,
                target_fps=self.target_fps,
            )
            return _FFmpegWithOpenCVFallback(
                ffmpeg_grabber=ffmpeg,
                rtsp_url=source,
                width=self.width,
                height=self.height,
                prefer_max_webcam_res=self.prefer_max_webcam_res,
                target_fps=self.target_fps,
            )

        if request == "opencv":
            return _OpenCVGrabber(
                rtsp_url=source,
                width=self.width,
                height=self.height,
                prefer_max_webcam_res=self.prefer_max_webcam_res,
                target_fps=self.target_fps,
            )

        if request == "ffmpeg":
            if is_webcam:
                print(
                    f"[FrameGrabber] ffmpeg backend ignored for webcam src={safe_source}; using opencv"
                )
            else:
                try:
                    return _ffmpeg_with_fallback()
                except Exception as exc:
                    print(
                        "[FrameGrabber] ffmpeg backend unavailable, "
                        f"falling back to opencv src={safe_source} reason={exc}"
                    )

        if is_webcam:
            return _OpenCVGrabber(
                rtsp_url=source,
                width=self.width,
                height=self.height,
                prefer_max_webcam_res=self.prefer_max_webcam_res,
                target_fps=self.target_fps,
            )

        if is_network:
            try:
                return _ffmpeg_with_fallback()
            except Exception as exc:
                print(
                    "[FrameGrabber] falling back to opencv backend "
                    f"src={safe_source} reason={exc}"
                )

        return _OpenCVGrabber(
            rtsp_url=source,
            width=self.width,
            height=self.height,
            prefer_max_webcam_res=self.prefer_max_webcam_res,
            target_fps=self.target_fps,
        )

    def settings_signature(self) -> Tuple[str, int, int, int, str]:
        return (
            self.rtsp_url,
            int(self.width),
            int(self.height),
            int(self.target_fps),
            str(self.requested_backend),
        )

    def start(self) -> None:
        self._impl.start()

    def read_latest(self, copy: bool = True) -> Optional[np.ndarray]:
        return self._impl.read_latest(copy=copy)

    def stop(self) -> None:
        self._impl.stop()
