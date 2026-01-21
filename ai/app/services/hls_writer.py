import os
import subprocess
import threading
import shutil

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HLS_ROOT = os.path.join(BASE_DIR, "hls")
os.makedirs(HLS_ROOT, exist_ok=True)


def _resolve_ffmpeg_exe() -> str:
    env_candidates = [
        os.getenv("FFMPEG_PATH"),
        os.getenv("FFMPEG_EXE"),
        os.getenv("FFMPEG_BINARY"),
        os.getenv("IMAGEIO_FFMPEG_EXE"),
    ]
    for raw in env_candidates:
        if not raw:
            continue
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
        "FFmpeg not found. Install FFmpeg and add it to PATH, or set FFMPEG_PATH/FFMPEG_EXE."
    )


class HLSWriter:
    def __init__(self, camera_id: str, width=640, height=480, fps=30):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps
        print(  "HLSWriter init", camera_id)
        self.base_dir = os.path.join(HLS_ROOT, "cameras", camera_id)
        os.makedirs(self.base_dir, exist_ok=True)

        ffmpeg_exe = _resolve_ffmpeg_exe()
        self.proc = subprocess.Popen(
            [
                ffmpeg_exe,
                "-y",
                "-f", "rawvideo",
                "-pix_fmt", "bgr24",
                "-s", f"{width}x{height}",
                "-r", str(fps),
                "-i", "pipe:0",
                "-an",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-tune", "zerolatency",
                "-g", str(max(1, int(fps) // 2)),
                "-keyint_min", "1",
                "-sc_threshold", "0",
                "-f", "hls",
                "-hls_time", "0.5",
                "-hls_list_size", "3",
                "-hls_flags", "delete_segments+independent_segments+split_by_time",
                "-hls_segment_type", "fmp4",
                "-hls_fmp4_init_filename", "init.mp4",
                os.path.join(self.base_dir, "index.m3u8"),
            ],
            stdin=subprocess.PIPE,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

        self.lock = threading.Lock()

    def write(self, frame):
        if self.proc.poll() is not None:
            return
        with self.lock:
            try:
                self.proc.stdin.write(frame.tobytes())
            except Exception:
                pass

    def stop(self):
        if self.proc:
            try:
                self.proc.stdin.close()
                self.proc.terminate()
            except Exception:
                pass
