"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";
import {
  DEFAULT_LOCAL_CAMERA_ID,
  getLocalCameraStopTarget,
  LOCAL_CAMERA_STOP_EVENT,
} from "@/lib/localCameraEvents";

interface UseLocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
  cameraName?: string;
  onActiveChange?: (active: boolean) => void;
  active?: boolean;
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

export function useLocalCamera({
  userId,
  companyId,
  cameraName = "Laptop Camera",
  onActiveChange,
  active,
}: UseLocalCameraProps = {}) {
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
      cameraId
    )}/${encodeURIComponent(cameraName)}${recQuery}${sep}t=${localActiveCount}`;
  }, [cameraId, cameraName, recQuery, localActiveCount]);

  const wsSignalUrl = useMemo(() => {
    const base = String(AI_HOST || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, []);

  const stopLocalCamera = useCallback(() => {
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

  // If cameraId/companyId changes while active, stop cleanly
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
        stopLocalCamera();
      }

      shouldRunRef.current = true;
      startToken = startTokenRef.current + 1;
      startTokenRef.current = startToken;

      setLocalActiveCount((c) => c + 1);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      // Race condition check after async call
      if (!isCurrentStart()) {
        stopMediaTracks(stream);
        if (localStreamRef.current === stream) localStreamRef.current = null;
        return;
      }

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

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = (e) => {
        console.error("WebSignal WebSocket error:", e);
        if (isCurrentStart()) {
          setWsError("WebSocket connection failed");
        }
      };

      ws.onclose = (e) => {
        if (isCurrentStart() && pcRef.current === pc) {
          setWsError("WebSocket connection closed");
        }
      };

      ws.onopen = async () => {
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
          })
        );
      };

      ws.onmessage = async (event) => {
        if (!isCurrentStart()) return;
        const data = JSON.parse(event.data);

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
            })
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
    } catch (err) {
      console.error("Camera start failed with error:", err);
      if (isCurrentStart()) {
        setWsError("Camera access failed");
        stopLocalCamera();
      }
    }
  }, [cameraId, companyId, stopLocalCamera, wsSignalUrl]);

  useEffect(() => {
    if (active !== undefined) {
      if (active && !localActive && !shouldRunRef.current) {
        void startLocalCamera();
      } else if (
        !active &&
        (localActive ||
          shouldRunRef.current ||
          Boolean(localStreamRef.current) ||
          Boolean(pcRef.current) ||
          Boolean(wsRef.current))
      ) {
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

  return {
    localActive,
    wsError,
    recUrl,
    localVideoRef,
    recognitionImgRef,
    startLocalCamera,
    stopLocalCamera,
    actionsOpen,
    setActionsOpen,
  };
}
