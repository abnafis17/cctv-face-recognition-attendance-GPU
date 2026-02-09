import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";
import { cn } from "@/lib/utils";

interface LocalCameraProps {
  userId?: string;
  companyId?: string;
  cameraName?: string;
  streamType?: string;
  className?: string;
  onActiveChange?: (active: boolean) => void;
}

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

const HeadCountCameraComponent: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName,
  streamType: streamTypeProp,
  className,
  onActiveChange,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const [localActive, setLocalActive] = useState(false);
  const [wsError, setWsError] = useState("");

  const cameraId = useMemo(() => {
    if (userId?.trim()) return userId.trim();
    if (companyId?.trim()) return `laptop-${companyId.trim()}`;
    return DEFAULT_CAMERA_ID;
  }, [companyId, userId]);

  const displayName = (cameraName?.trim() || "Laptop Camera").trim();
  const streamType = (streamTypeProp?.trim() || "headcount").trim();

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
    setWsError("");

    const stream =
      localStreamRef.current ||
      (localVideoRef.current?.srcObject as MediaStream | null);
    if (stream) stream.getTracks().forEach((t) => t.stop());

    localStreamRef.current = null;
    if (localVideoRef.current) localVideoRef.current.srcObject = null;

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

  useEffect(() => {
    onActiveChange?.(localActive);
  }, [localActive, onActiveChange]);

  useEffect(() => {
    return () => stopLocalCamera();
  }, [stopLocalCamera]);

  const prevKeyRef = useRef<string>(`${cameraId}|${companyId || ""}|${streamType}`);
  useEffect(() => {
    const key = `${cameraId}|${companyId || ""}|${streamType}`;
    const changed = prevKeyRef.current !== key;
    if (changed && localActive) stopLocalCamera();
    prevKeyRef.current = key;
  }, [cameraId, companyId, streamType, localActive, stopLocalCamera]);

  const startLocalCamera = async () => {
    try {
      setWsError("");

      if (localActive) stopLocalCamera();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });
      localStreamRef.current = stream;

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
    <article
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm",
        className,
      )}
    >
      <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {displayName}
          </div>
          <div className="text-xs text-zinc-500">WebRTC + Recognition</div>
        </div>

        <button
          type="button"
          onClick={localActive ? stopLocalCamera : startLocalCamera}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            localActive
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {localActive ? "Stop" : "Start"}
        </button>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
        <div className="aspect-video w-full">
          {localActive ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={recUrl}
              alt="Recognition stream"
              className="h-full w-full object-cover"
              width={1280}
              height={720}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-300">
              Start camera to view recognition overlay
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {localActive ? "LIVE" : "OFFLINE"}
        </div>

        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
      </div>

      {wsError ? (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs text-red-600">
          {wsError}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between">
        <span className="truncate rounded-md bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-600">
          {cameraId}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
            localActive
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-500"
          }`}
        >
          {localActive ? "ACTIVE" : "OFF"}
        </span>
      </div>
    </article>
  );
};

export default HeadCountCameraComponent;
