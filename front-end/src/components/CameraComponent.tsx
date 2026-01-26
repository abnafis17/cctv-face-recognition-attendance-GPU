import React, { useEffect, useMemo, useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";
import Image from "next/image";

interface LocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
  cameraName?: string; // <-- NEW
}

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

const LocalCamera: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName = "Laptop Camera",
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [localActive, setLocalActive] = useState(false);
  const [wsError, setWsError] = useState<string>("");

  const cameraId = useMemo(() => {
    if (userId?.trim()) return userId.trim();
    if (companyId?.trim()) return `laptop-${companyId.trim()}`;
    return DEFAULT_CAMERA_ID;
  }, [companyId, userId]);

  const recQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "attendance");
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId]);

  const streamType = "attendance";

  const recUrl = useMemo(() => {
    // camera name + id must reflect current selection
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      cameraId,
    )}/${encodeURIComponent(cameraName)}${recQuery}`;
  }, [cameraId, cameraName, recQuery]);

  const wsSignalUrl = useMemo(() => {
    // keep WS host consistent with AI_HOST (avoid hard-coding)
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);

  // Ensure no stale streams when component unmounts
  useEffect(() => {
    return () => stopLocalCamera();
  }, []);

  // If cameraId/companyId changes while active, stop cleanly (user can Start again)
  useEffect(() => {
    if (localActive) stopLocalCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, companyId]);

  const stopLocalCamera = () => {
    setWsError("");

    if (localVideoRef.current?.srcObject) {
      (localVideoRef.current.srcObject as MediaStream)
        .getTracks()
        .forEach((t) => t.stop());
    }

    try {
      pcRef.current?.close();
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}

    pcRef.current = null;
    wsRef.current = null;

    setLocalActive(false);
  };

  const startLocalCamera = async () => {
    try {
      setWsError("");

      // if already running, restart cleanly
      if (localActive) stopLocalCamera();

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
        setWsError("WebSocket connection failed");
      };

      ws.onclose = () => {
        // if the user didn’t click stop, surface as error
        if (pcRef.current) setWsError("WebSocket connection closed");
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
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
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
      setWsError("Camera access failed");
      stopLocalCamera();
    }
  };

  return (
    <div className="rounded-xl border bg-white p-4 shadow-sm max-w-md">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold text-sm">{cameraName}</div>
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

      {/* <div className="mt-3 aspect-video overflow-hidden rounded-lg border bg-black">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="h-full w-full object-cover"
        />
      </div> */}

      <div className="mt-3 aspect-video overflow-hidden rounded-lg border bg-gray-100">
        {localActive ? (
          <Image
            src={recUrl}
            alt="Recognition stream"
            className="h-full w-full object-cover"
            width={1280}
            height={720}
            unoptimized
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-xs text-gray-500">
            Start camera to view recognition overlay
          </div>
        )}
      </div>

      {wsError ? (
        <div className="mt-2 text-xs text-red-600">{wsError}</div>
      ) : null}
      {/* <div className="mt-1 text-[11px] text-gray-500">CameraId: {cameraId}</div> */}

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
