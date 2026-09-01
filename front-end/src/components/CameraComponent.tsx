"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Camera, Check, ChevronDown, MoreHorizontal, Video } from "lucide-react";
import { AI_HOST } from "@/config/axiosInstance";
import { cn } from "@/lib/utils";
import { useCameraDevices } from "@/hooks/useCameraDevices";
import { useMjpegStream } from "@/hooks/useMjpegStream";
import { createPeerConnection, replaceVideoTrack } from "@/lib/webrtc";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface LocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
  cameraName?: string;
  className?: string;
  isFullscreen?: boolean;
  fillContainer?: boolean;
  onScreenDoubleClick?: () => void;
  onActiveChange?: (active: boolean) => void;
}

const DEFAULT_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";
const FIRST_FRAME_DETECT_WINDOW_MS = 20000;

const LocalCamera: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName = "Laptop Camera",
  className,
  isFullscreen = false,
  fillContainer = false,
  onScreenDoubleClick,
  onActiveChange,
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const imgRef = useRef<HTMLImageElement | null>(null);

  const [localActive, setLocalActive] = useState(false);
  const [wsError, setWsError] = useState<string>("");
  const [actionsOpen, setActionsOpen] = useState(false);
  const [deviceMenuOpen, setDeviceMenuOpen] = useState(false);

  const {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedDevice,
    refreshDevices,
    requestPermissionAndEnumerate,
  } = useCameraDevices();

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
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      cameraId,
    )}/${encodeURIComponent(cameraName)}${recQuery}`;
  }, [cameraId, cameraName, recQuery]);

  const wsSignalUrl = useMemo(() => {
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);

  const {
    streamSrc,
    streamHasFrame,
    streamRetries,
    imgKey,
    onFrame,
    onError,
    resetStream,
  } = useMjpegStream({
    streamUrl: recUrl,
    enabled: localActive,
  });

  const shouldRenderStream = localActive && Boolean(streamSrc);

  const stopLocalCamera = useCallback(() => {
    setWsError("");

    const stream =
      localStreamRef.current ||
      (localVideoRef.current?.srcObject as MediaStream | null);
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
    }
    localStreamRef.current = null;
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
      try {
        localVideoRef.current.load();
      } catch {}
    }

    if (imgRef.current) {
      try {
        imgRef.current.src = "about:blank";
      } catch {}
    }

    try {
      pcRef.current?.close();
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}

    pcRef.current = null;
    wsRef.current = null;
    pendingIceCandidatesRef.current = [];

    resetStream();
    setLocalActive(false);
  }, [resetStream]);

  useEffect(() => {
    onActiveChange?.(localActive);
  }, [localActive, onActiveChange]);

  useEffect(() => {
    return () => stopLocalCamera();
  }, [stopLocalCamera]);

  const prevKeyRef = useRef<string>(`${cameraId}|${companyId || ""}`);
  useEffect(() => {
    const key = `${cameraId}|${companyId || ""}`;
    const changed = prevKeyRef.current !== key;
    if (changed && localActive) stopLocalCamera();
    prevKeyRef.current = key;
  }, [cameraId, companyId, localActive, stopLocalCamera]);

  // First frame detection for MJPEG stream
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

  const startLocalCamera = async (targetDeviceId?: string) => {
    const deviceIdToUse = targetDeviceId ?? selectedDeviceId;

    try {
      setWsError("");
      resetStream();

      if (localActive) {
        stopLocalCamera();
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(
          deviceIdToUse
            ? {
                video: {
                  deviceId: { exact: deviceIdToUse },
                  width: { ideal: 640, max: 1280 },
                  height: { ideal: 480, max: 720 },
                },
                audio: false,
              }
            : {
                video: {
                  width: { ideal: 640, max: 1280 },
                  height: { ideal: 480, max: 720 },
                },
                audio: false,
              },
        );
      } catch (mediaErr) {
        console.warn("Exact deviceId failed, falling back to default:", mediaErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
          },
          audio: false,
        });
      }

      localStreamRef.current = stream;

      // Update device list if labels were unexposed
      void refreshDevices();

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        await localVideoRef.current.play().catch(() => {});
      }

      const pc = createPeerConnection();
      pcRef.current = pc;
      pendingIceCandidatesRef.current = [];

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        setWsError("WebSocket connection failed");
      };

      ws.onclose = () => {
        if (pcRef.current) setWsError("WebSocket connection closed");
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
        try {
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
        } catch (err) {
          console.error("Failed to create offer:", err);
          setWsError("WebRTC offer negotiation failed");
        }
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.sdp && data.cameraId === cameraId) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            // Drain queued ICE candidates
            while (pendingIceCandidatesRef.current.length > 0) {
              const cand = pendingIceCandidatesRef.current.shift();
              if (cand) {
                await pc.addIceCandidate(cand).catch(() => {});
              }
            }
          } else if (data.ice && data.cameraId === cameraId) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(data.ice).catch(() => {});
            } else {
              pendingIceCandidatesRef.current.push(data.ice);
            }
          }
        } catch (err) {
          console.error("WebRTC message processing error:", err);
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

  // Live device switching without interrupting WebRTC session
  const handleDeviceChange = async (newDeviceId: string) => {
    setSelectedDeviceId(newDeviceId);

    if (!localActive) return;

    try {
      let newStream: MediaStream;
      try {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: {
            deviceId: { exact: newDeviceId },
            width: { ideal: 640, max: 1280 },
            height: { ideal: 480, max: 720 },
          },
          audio: false,
        });
      } catch {
        newStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
      }

      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) return;

      const replaced = await replaceVideoTrack(pcRef.current, newTrack);

      if (replaced) {
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((t) => t.stop());
        }
        localStreamRef.current = newStream;
        if (localVideoRef.current) {
          localVideoRef.current.srcObject = newStream;
          await localVideoRef.current.play().catch(() => {});
        }
      } else {
        // Reconnection fallback
        await startLocalCamera(newDeviceId);
      }
    } catch (err) {
      console.error("Device switch failed:", err);
      setWsError("Failed to switch camera device");
    }
  };

  const shouldFillFrame = isFullscreen || fillContainer;
  const activeDeviceLabel = selectedDevice?.label || "Default Camera";

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
                alt="Recognition stream"
                className={cn(
                  "h-full w-full object-cover object-top-left transition-opacity duration-150",
                  streamHasFrame ? "opacity-100" : "opacity-0",
                )}
                width={1280}
                height={720}
                onLoad={onFrame}
                onError={onError}
              />
              {!streamHasFrame ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  {streamRetries > 0
                    ? "Reconnecting stream..."
                    : "Connecting WebRTC to AI..."}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-4 text-center text-sm text-zinc-500">
              <Video className="h-7 w-7 text-zinc-400" />
              <span>Start camera to view recognition overlay</span>
              {devices.length > 0 ? (
                <span className="text-[11px] text-zinc-400">
                  Selected: {activeDeviceLabel}
                </span>
              ) : null}
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

        {wsError ? (
          <div className="absolute bottom-2 left-2 rounded-md border border-red-300 bg-red-50/95 px-2 py-1 text-[11px] text-red-700">
            {wsError}
          </div>
        ) : null}
      </div>

      {!isFullscreen ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {cameraName}
            </div>
            {devices.length > 1 ? (
              <div className="flex items-center gap-1 text-[11px] text-zinc-500">
                <Camera className="h-3 w-3 shrink-0 text-zinc-400" />
                <span className="truncate" title={activeDeviceLabel}>
                  {activeDeviceLabel}
                </span>
              </div>
            ) : (
              <div className="truncate text-[11px] text-zinc-500">
                WebRTC + Recognition
              </div>
            )}
          </div>

          <div className="flex items-center gap-1">
            {/* Device selector shortcut button if multiple devices are available */}
            {devices.length > 1 ? (
              <Popover open={deviceMenuOpen} onOpenChange={setDeviceMenuOpen}>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 px-2 text-[11px] font-medium text-zinc-700 transition hover:bg-zinc-100 max-w-[130px]"
                    title="Switch camera device"
                  >
                    <Camera className="h-3 w-3 shrink-0 text-zinc-500" />
                    <span className="truncate">{activeDeviceLabel}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-zinc-400" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-56 p-1.5 shadow-lg">
                  <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400 border-b border-zinc-100 mb-1">
                    Select Camera Device
                  </div>
                  <div className="max-h-48 overflow-y-auto space-y-0.5">
                    {devices.map((device) => {
                      const isSelected = device.deviceId === selectedDeviceId;
                      return (
                        <button
                          key={device.deviceId}
                          type="button"
                          onClick={() => {
                            setDeviceMenuOpen(false);
                            void handleDeviceChange(device.deviceId);
                          }}
                          className={cn(
                            "flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition",
                            isSelected
                              ? "bg-purple-50 font-semibold text-purple-800"
                              : "text-zinc-700 hover:bg-zinc-100",
                          )}
                        >
                          <span className="truncate pr-2">{device.label}</span>
                          {isSelected && (
                            <Check className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>
            ) : null}

            {/* Actions Popover */}
            <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100"
                  aria-label={`Actions for ${cameraName}`}
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-56 p-1.5 shadow-lg">
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
                  {localActive ? "Stop Camera" : "Start Camera"}
                </button>

                {/* Devices listing in main action menu */}
                <div className="my-1 border-t border-zinc-100 pt-1">
                  <div className="px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                    Camera Device ({devices.length})
                  </div>
                  {devices.length === 0 ? (
                    <button
                      type="button"
                      onClick={() => {
                        void requestPermissionAndEnumerate();
                      }}
                      className="flex w-full items-center rounded-md px-2.5 py-1.5 text-left text-xs text-purple-700 hover:bg-purple-50"
                    >
                      Detect Connected Cameras
                    </button>
                  ) : (
                    <div className="max-h-40 overflow-y-auto space-y-0.5">
                      {devices.map((device) => {
                        const isSelected =
                          device.deviceId === selectedDeviceId;
                        return (
                          <button
                            key={device.deviceId}
                            type="button"
                            onClick={() => {
                              setActionsOpen(false);
                              void handleDeviceChange(device.deviceId);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-xs transition",
                              isSelected
                                ? "bg-purple-50 font-semibold text-purple-800"
                                : "text-zinc-700 hover:bg-zinc-100",
                            )}
                          >
                            <span className="truncate pr-2">
                              {device.label}
                            </span>
                            {isSelected && (
                              <Check className="h-3.5 w-3.5 shrink-0 text-purple-600" />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </div>
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

export default LocalCamera;
