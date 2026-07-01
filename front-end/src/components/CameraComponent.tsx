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
import {
  DEFAULT_LOCAL_CAMERA_ID,
  getLocalCameraStopTarget,
  LOCAL_CAMERA_STOP_EVENT,
} from "@/lib/localCameraEvents";
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
  active?: boolean;
  showFooter?: boolean;
  objectFit?: "cover" | "contain";
}

function stopMediaTrack(track: MediaStreamTrack | null | undefined) {
  try {
    if (track) track.enabled = false;
  } catch {}

  try {
    track?.stop();
  } catch {}
}

function stopMediaTracks(stream: MediaStream | null | undefined) {
  if (!stream) return;

  stream.getTracks().forEach(stopMediaTrack);
}

const LocalCamera: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName = "Laptop Camera",
  className,
  isFullscreen = false,
  fillContainer = false,
  onScreenDoubleClick,
  onActiveChange,
  active,
  showFooter = true,
  objectFit = "cover",
}) => {
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const recognitionImgRef = useRef<HTMLImageElement | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);

  const isMountedRef = useRef(true);
  const shouldRunRef = useRef(false);
  const startTokenRef = useRef(0);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const [localActive, setLocalActive] = useState(false);
  const [localActiveCount, setLocalActiveCount] = useState(0);
  const [wsError, setWsError] = useState<string>("");
  const [actionsOpen, setActionsOpen] = useState(false);

  const cameraId = useMemo(() => {
    if (userId?.trim()) return userId.trim();
    if (companyId?.trim()) return `laptop-${companyId.trim()}`;
    return DEFAULT_LOCAL_CAMERA_ID;
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
    const sep = recQuery.includes("?") ? "&" : "?";
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      cameraId,
    )}/${encodeURIComponent(cameraName)}${recQuery}${sep}t=${localActiveCount}`;
  }, [cameraId, cameraName, recQuery, localActiveCount]);

  const wsSignalUrl = useMemo(() => {
    // keep WS host consistent with AI_HOST (avoid hard-coding)
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);
  console.log(wsSignalUrl, "====================");
  console.log(recUrl, "=============REC=======");

  const stopLocalCamera = useCallback(() => {
    console.log("stopLocalCamera execution started");
    shouldRunRef.current = false;
    startTokenRef.current += 1;
    if (isMountedRef.current) {
      setWsError("");
    }

    try {
      if (recognitionImgRef.current) {
        recognitionImgRef.current.src = "about:blank";
      }
    } catch {}

    // 1. Close WebRTC PeerConnection and its senders/tracks
    try {
      if (pcRef.current) {
        pcRef.current.onicecandidate = null;
        pcRef.current.onconnectionstatechange = null;
        pcRef.current.oniceconnectionstatechange = null;
        pcRef.current.getSenders().forEach((sender) => {
          stopMediaTrack(sender.track);
          try {
            void sender.replaceTrack(null);
          } catch {}
          try {
            pcRef.current?.removeTrack(sender);
          } catch {}
        });
        pcRef.current.getTransceivers().forEach((transceiver) => {
          try {
            transceiver.stop();
          } catch {}
        });
        pcRef.current.close();
      }
    } catch (e) {
      console.warn("Error closing RTCPeerConnection:", e);
    }
    pcRef.current = null;

    // 2. Close WebSignal WebSocket
    try {
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    } catch {}
    wsRef.current = null;

    // 3. Stop MediaStream tracks
    stopMediaTracks(localStreamRef.current);
    localStreamRef.current = null;

    const videoStream = localVideoRef.current?.srcObject as MediaStream | null;
    stopMediaTracks(videoStream);
    if (localVideoRef.current) {
      try {
        localVideoRef.current.pause();
      } catch {}
      localVideoRef.current.srcObject = null;
      try {
        localVideoRef.current.removeAttribute("src");
        localVideoRef.current.load();
      } catch {}
    }

    if (isMountedRef.current) {
      setLocalActive(false);
    }
    console.log("stopLocalCamera completed, webcam tracks stopped.");
  }, []);

  useEffect(() => {
    onActiveChange?.(localActive);
  }, [localActive, onActiveChange]);

  // Ensure no stale streams when component unmounts
  useEffect(() => {
    return () => stopLocalCamera();
  }, [stopLocalCamera]);

  useEffect(() => {
    const handleStop = (event: Event) => {
      const targetCameraId = getLocalCameraStopTarget(event);
      if (targetCameraId && targetCameraId !== cameraId) return;
      stopLocalCamera();
    };

    window.addEventListener(LOCAL_CAMERA_STOP_EVENT, handleStop);

    return () => {
      window.removeEventListener(LOCAL_CAMERA_STOP_EVENT, handleStop);
    };
  }, [cameraId, stopLocalCamera]);

  // If cameraId/companyId changes while active, stop cleanly (user can Start again)
  const prevKeyRef = useRef<string>(`${cameraId}|${companyId || ""}`);
  useEffect(() => {
    const key = `${cameraId}|${companyId || ""}`;
    const changed = prevKeyRef.current !== key;
    if (
      changed &&
      (localActive ||
        shouldRunRef.current ||
        Boolean(localStreamRef.current) ||
        Boolean(pcRef.current) ||
        Boolean(wsRef.current))
    ) {
      stopLocalCamera();
    }
    prevKeyRef.current = key;
  }, [cameraId, companyId, localActive, stopLocalCamera]);

  const startLocalCamera = useCallback(async () => {
    console.log("startLocalCamera execution started: cameraId =", cameraId);
    let startToken = 0;
    const isCurrentStart = () =>
      isMountedRef.current &&
      shouldRunRef.current &&
      startTokenRef.current === startToken;

    try {
      setWsError("");

      // if already running, restart cleanly
      if (
        shouldRunRef.current ||
        localStreamRef.current ||
        pcRef.current ||
        wsRef.current
      ) {
        console.log("Webcam stream or RTCPeerConnection already active, stopping first...");
        stopLocalCamera();
      }

      shouldRunRef.current = true;
      startToken = startTokenRef.current + 1;
      startTokenRef.current = startToken;

      setLocalActiveCount((c) => c + 1);

      console.log("Requesting getUserMedia...");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // Race condition check after async call
      if (!isCurrentStart()) {
        console.log("Component unmounted or inactive during getUserMedia. Stopping stream tracks.");
        stopMediaTracks(stream);
        if (localStreamRef.current === stream) localStreamRef.current = null;
        return;
      }

      console.log("getUserMedia successful! Stream ID =", stream.id);
      localStreamRef.current = stream;

      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
        localVideoRef.current.playsInline = true;
        try {
          await localVideoRef.current.play();
        } catch {}
      }

      // Race condition check after play
      if (!isCurrentStart()) {
        console.log("Component unmounted or inactive during play. Stopping stream tracks.");
        stopMediaTracks(stream);
        if (localVideoRef.current) localVideoRef.current.srcObject = null;
        localStreamRef.current = null;
        return;
      }

      const iceConfig: RTCConfiguration = {
        iceServers: [
          { urls: "stun:stun.l.google.com:19302" },
        ],
      };

      try {
        const envIce = process.env.NEXT_PUBLIC_MEDIA_WEBRTC_ICE_SERVERS;
        if (envIce) {
          iceConfig.iceServers = JSON.parse(envIce);
        } else {
          // Dynamic fallback to the current hostname for TURN server
          const turnHost = typeof window !== "undefined" ? window.location.hostname : "localhost";
          iceConfig.iceServers = [
            { urls: "stun:stun.l.google.com:19302" },
            {
              urls: `turn:${turnHost}:3478?transport=udp`,
              username: "testuser",
              credential: "testpass",
            },
            {
              urls: `turn:${turnHost}:3478?transport=tcp`,
              username: "testuser",
              credential: "testpass",
            },
          ];
        }
      } catch (err) {
        console.warn("Failed to parse iceServers env, using default stun:", err);
      }

      const pc = new RTCPeerConnection(iceConfig);
      pcRef.current = pc;

      stream.getTracks().forEach((track) => pc.addTrack(track, stream));

      console.log("Connecting WebSocket to", wsSignalUrl);
      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = (e) => {
        console.error("WebSignal WebSocket error:", e);
        if (isCurrentStart()) {
          setWsError("WebSocket connection failed");
        }
      };

      ws.onclose = (e) => {
        console.log("WebSignal WebSocket closed:", e.code, e.reason);
        if (isCurrentStart() && pcRef.current === pc) {
          setWsError("WebSocket connection closed");
        }
      };

      ws.onopen = async () => {
        console.log("WebSignal WebSocket opened. Creating SDP offer...");
        const offer = await pc.createOffer();

        if (!isCurrentStart()) {
          pc.close();
          ws.close();
          stopMediaTracks(stream);
          if (localStreamRef.current === stream) localStreamRef.current = null;
          return;
        }

        await pc.setLocalDescription(offer);

        if (!isCurrentStart()) {
          pc.close();
          ws.close();
          stopMediaTracks(stream);
          if (localStreamRef.current === stream) localStreamRef.current = null;
          return;
        }

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
        if (!isCurrentStart()) return;
        const data = JSON.parse(event.data);
        console.log("WebSignal WebSocket message received:", data.type || "ice/sdp");

        if (data.sdp && data.cameraId === cameraId) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.ice && data.cameraId === cameraId) {
          await pc.addIceCandidate(data.ice);
        }
      };

      pc.onicecandidate = (event) => {
        if (
          isCurrentStart() &&
          event.candidate &&
          ws.readyState === WebSocket.OPEN
        ) {
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

      if (!isCurrentStart()) {
        pc.close();
        ws.close();
        stopMediaTracks(stream);
        if (localStreamRef.current === stream) localStreamRef.current = null;
        return;
      }

      setLocalActive(true);
      console.log("startLocalCamera completed successfully. localActive set to true.");
    } catch (err) {
      console.error("Camera start failed with error:", err);
      if (isCurrentStart()) {
        setWsError("Camera access failed");
        stopLocalCamera();
      }
    }
  }, [cameraId, companyId, stopLocalCamera, wsSignalUrl]);

  useEffect(() => {
    console.log("LocalCamera active effect triggered:", { active, localActive, cameraId });
    if (active !== undefined) {
      if (active && !localActive && !shouldRunRef.current) {
        console.log("Calling startLocalCamera from active effect");
        void startLocalCamera();
      } else if (
        !active &&
        (localActive ||
          shouldRunRef.current ||
          Boolean(localStreamRef.current) ||
          Boolean(pcRef.current) ||
          Boolean(wsRef.current))
      ) {
        console.log("Calling stopLocalCamera from active effect");
        stopLocalCamera();
      }
    }
  }, [active, localActive, startLocalCamera, stopLocalCamera, cameraId]);

  useEffect(() => {
    if (!localActive) return;

    const img = recognitionImgRef.current;
    return () => {
      try {
        if (img) img.src = "about:blank";
      } catch {}
    };
  }, [localActive, recUrl]);

  const shouldFillFrame = isFullscreen || fillContainer;

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
          localActive ? "bg-zinc-950" : "bg-zinc-100",
        )}
      >
        <div
          className={cn("w-full", shouldFillFrame ? "h-full" : "aspect-video")}
        >
          {localActive ? (
            // MJPEG stream (not compatible with next/image optimizations)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={recognitionImgRef}
              src={recUrl}
              alt="Recognition stream"
              className={cn(
                "h-full w-full",
                objectFit === "contain"
                  ? "object-contain object-center"
                  : "object-cover object-top-left"
              )}
              width={1280}
              height={720}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Start camera to view recognition overlay
            </div>
          )}
        </div>
        <video
          ref={localVideoRef}
          className="hidden"
          muted
          playsInline
          aria-hidden="true"
        />
        <div
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white",
            localActive ? "bg-red-600/90" : "bg-black/70",
          )}
        >
          {localActive ? "LIVE" : "OFFLINE"}
        </div>
        {localActive ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
        {wsError ? (
          <div className="absolute bottom-2 left-2 rounded-md border border-red-300 bg-red-50/95 px-2 py-1 text-[11px] text-red-700">
            {wsError}
          </div>
        ) : null}
      </div>

      {!isFullscreen && showFooter ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {cameraName}
            </div>
          </div>

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
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  if (localActive) stopLocalCamera();
                  else startLocalCamera();
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
    </article>
  );
};

export default LocalCamera;
