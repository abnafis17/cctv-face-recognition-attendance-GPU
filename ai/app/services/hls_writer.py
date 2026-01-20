import os
import subprocess
import threading

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
HLS_ROOT = os.path.join(BASE_DIR, "hls")
os.makedirs(HLS_ROOT, exist_ok=True)

class HLSWriter:
    def __init__(self, camera_id: str, width=640, height=480, fps=25):
        self.camera_id = camera_id
        self.width = width
        self.height = height
        self.fps = fps
        print(  "HLSWriter init", camera_id)
        self.base_dir = os.path.join(HLS_ROOT, "cameras", camera_id)
        os.makedirs(self.base_dir, exist_ok=True)

        self.proc = subprocess.Popen(
            [
                "ffmpeg",
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
                "-g", str(fps),
                "-sc_threshold", "0",
                "-f", "hls",
                "-hls_time", "1",
                "-hls_list_size", "5",
                "-hls_flags", "delete_segments",
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