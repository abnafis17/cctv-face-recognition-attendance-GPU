import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";

interface LocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
  cameraName?: string; // NEW: display + recognition URL
  streamType?: string; // "headcount" | "ot"
}

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

const HeadCountCameraComponent: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName,
  streamType: streamTypeProp,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [localActive, setLocalActive] = useState(false);

  const cameraId = useMemo(() => {
    if (userId?.trim()) return userId.trim();
    if (companyId?.trim()) return `laptop-${companyId.trim()}`;
    return DEFAULT_CAMERA_ID;
  }, [companyId, userId]);

  const displayName = (cameraName?.trim() || "Laptop Camera").trim();
  const streamType = (streamTypeProp?.trim() || "headcount").trim();

  // Recognition MJPEG (same overlay as IP cameras)
  const recQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", streamType);
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId, streamType]);

  const recUrl = useMemo(() => {
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      cameraId,
    )}/${encodeURIComponent(displayName)}${recQuery}`;
  }, [cameraId, displayName, recQuery]);

  const wsSignalUrl = useMemo(() => {
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);

  const stopLocalCamera = useCallback(() => {
    try {
      if (localVideoRef.current?.srcObject) {
        (localVideoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((t) => t.stop());
      }
    } catch {}

    try {
      pcRef.current?.close();
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}

    pcRef.current = null;
    wsRef.current = null;

    setLocalActive(false);
  }, []);

  // ✅ Ensure no stale streams when cameraId/companyId changes or component unmounts
  useEffect(() => {
    return () => stopLocalCamera();
  }, [stopLocalCamera]);

  const prevKeyRef = useRef<string>(`${cameraId}|${companyId || ""}|${streamType}`);
  useEffect(() => {
    // If user switches camera while active, stop cleanly (user can Start again)
    const key = `${cameraId}|${companyId || ""}|${streamType}`;
    const changed = prevKeyRef.current !== key;
    if (changed && localActive) stopLocalCamera();
    prevKeyRef.current = key;
  }, [cameraId, companyId, streamType, localActive, stopLocalCamera]);

  const startLocalCamera = async () => {
    try {
      // Important for phone: playsInline is used in the <video>, but we also keep constraints simple.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play();
      }

      const pc = new RTCPeerConnection();
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        stopLocalCamera();
      };

      pc.onconnectionstatechange = () => {
        const s = pc.connectionState;
        if (s === "failed" || s === "disconnected" || s === "closed") {
          stopLocalCamera();
        }
      };

      ws.onopen = async () => {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        ws.send(
          JSON.stringify({
            sdp: pc.localDescription,
            cameraId,
            companyId,
            type: streamType,
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
              type: streamType,
            }),
          );
        }
      };

      setLocalActive(true);
    } catch (err) {
      console.error("Camera start failed", err);
      alert("Camera access failed");
      stopLocalCamera();
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm max-w-md">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{displayName}</div>
          <div className="text-xs text-gray-500">WebRTC + Recognition</div>
          <div className="mt-0.5 text-[11px] text-gray-400 break-all">
            CameraId: {cameraId}
          </div>
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

      {/* Recognition Overlay */}
      <div className="mt-3 aspect-video overflow-hidden rounded-lg border bg-gray-100">
        {localActive ? (
          // MJPEG stream (not compatible with next/image optimizations)
          // eslint-disable-next-line @next/next/no-img-element
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

export default HeadCountCameraComponent;
