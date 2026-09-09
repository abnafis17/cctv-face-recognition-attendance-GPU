import time
import numpy as np
import cv2
from app.presence.runtime import PresenceRuntime

def test_presence_flow():
    runtime = PresenceRuntime()
    print("Testing PresenceRuntime process_frame flow...")
    
    # Create dummy black frame
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    
    # Simulate process_frame
    t0 = time.time()
    annotated, stats = runtime.process_frame(frame, camera_id="test_cam")
    print(f"Processed frame in {time.time() - t0:.4f}s. Active count: {stats['active_count']}")
    
    assert annotated.shape == (480, 640, 3)
    assert "active_count" in stats
    print("PresenceRuntime test PASSED!")

if __name__ == "__main__":
    test_presence_flow()
