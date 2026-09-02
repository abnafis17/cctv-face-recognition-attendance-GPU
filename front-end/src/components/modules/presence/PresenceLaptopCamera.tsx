"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { MoreHorizontal } from "lucide-react";

import { AI_HOST } from "@/config/axiosInstance";
import { cn } from "@/lib/utils";
import { useMjpegStream } from "@/hooks/useMjpegStream";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const FIRST_FRAME_DETECT_WINDOW_MS = 20000;

type PresenceLaptopCameraProps = {
  userId?: string;
  companyId?: string;
  cameraName?: string;
  className?: string;
  isFullscreen?: boolean;
  fillContainer?: boolean;
  onScreenDoubleClick?: () => void;
  onActiveChange?: (active: boolean) => void;
};

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

const PresenceLaptopCamera: React.FC<PresenceLaptopCameraProps> = ({
  userId,
  companyId,
  cameraName,
  className,
  isFullscreen = false,
  fillContainer = false,
  onScreenDoubleClick,
  onActiveChange,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [localActive, setLocalActive] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  const cameraId = useMemo(() => {
    if (userId?.trim()) return userId.trim();
    if (companyId?.trim()) return `laptop-${companyId.trim()}`;
    return DEFAULT_CAMERA_ID;
  }, [companyId, userId]);

  const displayName = (cameraName?.trim() || "Laptop Camera").trim();

  const streamUrl = useMemo(() => {
    return `${AI_HOST}/presence/stream/${encodeURIComponent(cameraId)}`;
  }, [cameraId]);

  const wsSignalUrl = useMemo(() => {
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);

  const { streamSrc, streamHasFrame, streamRetries, imgKey, onFrame, onError } =
    useMjpegStream({
      streamUrl,
      enabled: localActive,
    });

  const shouldRenderStream = localActive && Boolean(streamSrc);
  const shouldFillFrame = isFullscreen || fillContainer;

  const stopLocalCamera = useCallback(() => {
    try {
      if (localVideoRef.current?.srcObject) {
        (localVideoRef.current.srcObject as MediaStream)
          .getTracks()
          .forEach((track) => track.stop());
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

  useEffect(() => {
    return () => stopLocalCamera();
  }, [stopLocalCamera]);

  useEffect(() => {
    onActiveChange?.(localActive);
  }, [localActive, onActiveChange]);

  const prevKeyRef = useRef<string>(`${cameraId}|${companyId || ""}`);
  useEffect(() => {
    const key = `${cameraId}|${companyId || ""}`;
    const changed = prevKeyRef.current !== key;
    if (changed && localActive) stopLocalCamera();
    prevKeyRef.current = key;
  }, [cameraId, companyId, localActive, stopLocalCamera]);

  useEffect(() => {
    if (!shouldRenderStream) return;
    const img = imgRef.current;
    if (!img) return;

    return () => {
      try {
        img.src = "about:blank";
      } catch {}
    };
  }, [imgKey, shouldRenderStream]);

  useEffect(() => {
    if (!shouldRenderStream) return;

    let raf = 0;
    const deadline = window.performance.now() + FIRST_FRAME_DETECT_WINDOW_MS;

    const check = () => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        onFrame();
        return;
      }
      if (window.performance.now() < deadline) {
        raf = window.requestAnimationFrame(check);
      }
    };

    raf = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(raf);
  }, [imgKey, onFrame, shouldRenderStream]);

  const startLocalCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false,
      });

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play();
      }

      const pc = new RTCPeerConnection({
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
          {
            urls: "turn:10.81.100.128:3478?transport=udp",
            username: "testuser",
            credential: "testpass",
          },
          {
            urls: "turn:10.81.100.128:3478?transport=tcp",
            username: "testuser",
            credential: "testpass",
          },
        ],
      });
      pcRef.current = pc;
      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        stopLocalCamera();
      };

      pc.onconnectionstatechange = () => {
        const state = pc.connectionState;
        if (
          state === "failed" ||
          state === "disconnected" ||
          state === "closed"
        ) {
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
            purpose: "presence",
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
              purpose: "presence",
            }),
          );
        }
      };

      setLocalActive(true);
    } catch (error) {
      console.error("Camera start failed", error);
      stopLocalCamera();
    }
  };

  return (
    <article
      className={cn(
        "self-start overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-sm",
        shouldFillFrame && "flex h-full flex-col",
        className,
      )}
    >
      <div
        onDoubleClick={onScreenDoubleClick}
        title={
          onScreenDoubleClick
            ? isFullscreen
              ? "Double-click to exit full screen"
              : "Double-click to view full screen"
            : undefined
        }
        className={cn(
          "relative w-full overflow-hidden",
          shouldFillFrame && "flex-1",
          isFullscreen ? "cursor-zoom-out" : "cursor-zoom-in",
          streamHasFrame ? "bg-zinc-950" : "bg-zinc-100",
        )}
      >
        <div
          className={cn("w-full", shouldFillFrame ? "h-full" : "aspect-video")}
        >
          {shouldRenderStream ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imgKey}
                ref={imgRef}
                src={streamSrc}
                alt="Presence stream"
                className="h-full w-full object-cover object-center"
                width={1280}
                height={720}
                onLoad={onFrame}
                onError={onError}
              />
              {!streamHasFrame ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  {streamRetries > 0
                    ? "Reconnecting stream..."
                    : "Loading stream..."}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Camera OFF
            </div>
          )}
        </div>

        <div
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white",
            localActive ? "bg-red-600/90" : "bg-black/70",
          )}
        >
          {localActive ? "LIVE" : "OFFLINE"}
        </div>
        {streamHasFrame ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
      </div>

      {!isFullscreen ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {displayName}
            </div>
            <div className="truncate text-[11px] text-zinc-500">
              WebRTC + Presence
            </div>
          </div>

          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100"
                aria-label={`Actions for ${displayName}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  if (localActive) stopLocalCamera();
                  else void startLocalCamera();
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition ${
                  localActive
                    ? "text-red-700 hover:bg-red-50"
                    : "text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {localActive ? "Stop" : "Start"}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}

      <video
        ref={localVideoRef}
        autoPlay
        playsInline
        muted
        className="hidden"
      />
    </article>
  );
};

export default PresenceLaptopCamera;
