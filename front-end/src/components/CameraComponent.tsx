import React, { useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";

interface LocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
}

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

const LocalCamera: React.FC<LocalCameraProps> = ({ userId, companyId }) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [localActive, setLocalActive] = useState(false);

  const cameraId = (userId?.trim() || DEFAULT_CAMERA_ID).trim();

  // Recognition MJPEG (same overlay as IP cameras) - no HLS buffering
  const recQuery = companyId
    ? `?companyId=${encodeURIComponent(companyId)}`
    : "";
  const recUrl = `${AI_HOST}/camera/recognition/stream/${cameraId}/${encodeURIComponent(
    "Laptop Camera",
  )}${recQuery}`;

  // ----------------------
  // Start Camera (WebRTC ingest)
  // ----------------------
  const startLocalCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      // Local preview
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play();
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      // Add tracks
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      // WebSocket signaling
      const ws = new WebSocket("ws://10.81.100.128:8000/webrtc/signal");
      wsRef.current = ws;

      ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(
          JSON.stringify({
            sdp: pc.localDescription,
            cameraId,
            companyId,
          }),
        );
      };

      ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.sdp && data.cameraId === cameraId) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.ice && data.cameraId === cameraId) {
          await pc.addIceCandidate(data.ice);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          ws.send(
            JSON.stringify({
              ice: event.candidate,
              cameraId,
              companyId,
            }),
          );
        }
      };

      setLocalActive(true);
    } catch (err) {
      console.error("Camera start failed", err);
      alert("Camera access failed");
    }
  };

  // ----------------------
  // Stop Camera
  // ----------------------
  const stopLocalCamera = () => {
    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
    }

    pcRef.current?.close();
    wsRef.current?.close();

    setLocalActive(false);
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">Laptop Camera</div>
          <div className="text-xs text-gray-500">WebRTC + HLS</div>
        </div>

        <span
          className={`text-xs px-2 py-0.5 rounded-full ${
            localActive
              ? "bg-green-100 text-green-700"
              : "bg-gray-100 text-gray-500"
          }`}
        >
          {localActive ? "ACTIVE" : "OFF"}
        </span>
      </div>

      {/* Local Preview */}
      <div className="mt-3 aspect-video overflow-hidden rounded-lg border bg-black">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </div>

      {/* Recognition Overlay (smooth MJPEG like IP cameras) */}
      <div className="mt-3 aspect-video overflow-hidden rounded-lg border bg-gray-100">
        {localActive ? (
          <img
            src={recUrl}
            alt="Recognition stream"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
            Start camera to view recognition overlay
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="mt-3 flex justify-end gap-2">
        {localActive ? (
          <button
            onClick={stopLocalCamera}
            className="rounded-md border border-red-300 bg-red-50 px-3 py-1 text-xs text-red-600"
          >
            Stop Camera
          </button>
        ) : (
          <button
            onClick={startLocalCamera}
            className="rounded-md border border-green-300 bg-green-50 px-3 py-1 text-xs text-green-700"
          >
            Start Camera
          </button>
        )}
      </div>
    </div>
  );
};

export default LocalCamera;
