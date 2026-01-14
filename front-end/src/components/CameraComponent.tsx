import React, { useRef, useState, useEffect } from "react";

interface LocalCameraProps {
  userId: string; // unique camera_id for backend recognition
}

const LocalCamera: React.FC<LocalCameraProps> = ({ userId }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [localActive, setLocalActive] = useState(false);
  const localStreamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);

  // ----------------------
  // Send frame to backend
  // ----------------------
  const sendFrameToServer = async () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.8)
    );
    if (!blob) return;

    const form = new FormData();
    form.append("frame", blob);

    try {
      await fetch(
        `http://10.81.100.96:8000/camera/frame?camera_id=${userId}`,
        {
          method: "POST",
          body: form,
        }
      );
    } catch (err) {
      console.error("Failed to send frame:", err);
    }
  };

  // ----------------------
  // Start camera
  // ----------------------
  const startLocalCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      localStreamRef.current = stream;
      setLocalActive(true);

      // Start sending frames every 100ms (~10 FPS)
      intervalRef.current = window.setInterval(sendFrameToServer, 0.001);
    } catch (err) {
      console.error("Cannot access camera", err);
      alert("Camera access denied or not available");
    }
  };

  // ----------------------
  // Stop camera
  // ----------------------
  const stopLocalCamera = () => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setLocalActive(false);

    // Optionally notify backend to stop recognition
    fetch("http://10.81.100.96:8000/camera/stop", {
      method: "POST",
      body: new URLSearchParams({ camera_id: userId }),
    }).catch(console.error);
  };

  // ----------------------
  // Attach stream to video element
  // ----------------------
  useEffect(() => {
    if (localActive && videoRef.current && localStreamRef.current) {
      videoRef.current.srcObject = localStreamRef.current;
      videoRef.current.muted = true;
      videoRef.current.play().catch(console.error);
    }
  }, [localActive]);

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm w-full max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">My Laptop Camera</div>
          <div className="text-xs text-gray-500">Browser Webcam</div>
        </div>

        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            localActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
          }`}
        >
          {localActive ? "ACTIVE" : "OFF"}
        </span>
      </div>

      {/* Stream */}
      <div className="mt-3 overflow-hidden rounded-lg border bg-gray-100">
        {localActive ? (
          <>
            {/* Show local webcam */}
            <div className="aspect-video w-full">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="h-full w-full object-cover"
              />
            </div>

            {/* Recognition stream from backend */}
            <div className="mt-2 aspect-video w-full border">
              <img
                src={`http://10.81.100.96:8000/camera/recognition/stream/${userId}/Laptop-${userId}`}
                alt="Recognition Stream"
                className="h-full w-full object-cover"
              />
            </div>
          </>
        ) : (
          <div className="aspect-video flex items-center justify-center text-xs text-gray-500">
            Camera is OFF
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 flex justify-end">
        {localActive ? (
          <button
            onClick={stopLocalCamera}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-600 hover:bg-red-100"
          >
            Stop Camera
          </button>
        ) : (
          <button
            onClick={startLocalCamera}
            className="rounded-md border border-green-300 bg-green-50 px-3 py-1 text-xs text-green-700 hover:bg-green-100"
          >
            Start Camera
          </button>
        )}
      </div>
    </div>
  );
};

export default LocalCamera;
