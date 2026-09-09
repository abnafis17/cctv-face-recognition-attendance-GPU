import time
import numpy as np
import cv2
from app.services.stream import LiteCameraStream

def test_streams():
    print("Testing LiteCameraStream for Attendance and Presence streams...")
    stream = LiteCameraStream(
        camera_id="test_cam",
        rtsp_url="webrtc",
        company_id="test_company"
    )
    
    # Simulate incoming frames
    for i in range(10):
        frame = np.full((480, 640, 3), i * 20, dtype=np.uint8)
        stream.latest_raw_frame = frame
        stream.latest_frame_time = time.time()
        
        # Test Attendance stream
        stream.stream_type = "attendance"
        jpeg1 = stream.get_latest_annotated_jpeg()
        assert jpeg1 is not None, "Attendance JPEG should not be None"
        
        # Test Presence stream
        stream.stream_type = "presence"
        jpeg2 = stream.get_latest_annotated_jpeg()
        assert jpeg2 is not None, "Presence JPEG should not be None"
        
        time.sleep(0.01)

    stream.stop()
    print("ALL STREAM TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    test_streams()
