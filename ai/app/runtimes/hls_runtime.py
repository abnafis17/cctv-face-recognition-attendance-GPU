from typing import Dict
from app.services.hls_writer import HLSWriter

class HLSRuntime:
    def __init__(self):
        self.writers: Dict[str, HLSWriter] = {}

    def start(self, camera_id: str):
        if camera_id not in self.writers:
            self.writers[camera_id] = HLSWriter(camera_id)
        return self.writers[camera_id]

    def write(self, camera_id: str, frame):
        writer = self.writers.get(camera_id)
        if writer:
            writer.write(frame)

    def stop(self, camera_id: str):
        writer = self.writers.pop(camera_id, None)
        if writer:
            writer.stop()