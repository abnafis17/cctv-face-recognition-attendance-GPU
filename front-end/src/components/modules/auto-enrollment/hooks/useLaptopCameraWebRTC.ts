"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseLaptopCameraWebRTCArgs = {
  laptopCameraId: string;
  companyId: string | null;
  aiHost: string;
};

type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionInfo;
};

export function useLaptopCameraWebRTC({
  laptopCameraId,
  companyId,
  aiHost,
}: UseLaptopCameraWebRTCArgs) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);

  const [laptopActive, setLaptopActive] = useState(false);
  const isMountedRef = useRef(true);
  const shouldRunRef = useRef(false);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const wsSignalUrl = useMemo(() => {
    const base = String(aiHost || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, [aiHost]);

  const stopLaptopCamera = useCallback(() => {
    shouldRunRef.current = false;

    // 1. Close WebRTC PeerConnection and its senders/tracks
    try {
      if (pcRef.current) {
        pcRef.current.getSenders().forEach((sender) => {
          try {
            sender.track?.stop();
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
      wsRef.current?.close();
    } catch {}
    wsRef.current = null;

    // 3. Stop MediaStream tracks
    try {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      }
    } catch {}
    localStreamRef.current = null;

    try {
      if (previewVideoRef.current) {
        const stream = previewVideoRef.current.srcObject as MediaStream | null;
        if (stream) {
          stream.getTracks().forEach((t) => {
            try {
              t.stop();
            } catch {}
          });
        }
        previewVideoRef.current.srcObject = null;
      }
    } catch {}

    setLaptopActive(false);
  }, []);

  useEffect(() => {
    return () => stopLaptopCamera();
  }, [stopLaptopCamera]);

  const startLaptopCamera = useCallback(async () => {
    shouldRunRef.current = true;

    // if already running, restart cleanly
    if (localStreamRef.current || pcRef.current) {
      stopLaptopCamera();
    }

    const nav = navigator as NavigatorWithConnection;
    const effectiveType = String(
      nav.connection?.effectiveType ?? "",
    ).toLowerCase();
    const constrainedNetwork =
      !!nav.connection?.saveData ||
      effectiveType === "slow-2g" ||
      effectiveType === "2g" ||
      effectiveType === "3g";

    const maxFps = constrainedNetwork ? 10 : 25;
    const idealFps = constrainedNetwork ? 8 : 20;
    const maxBitrate = constrainedNetwork ? 350_000 : 1_500_000;

    const videoConstraints: MediaTrackConstraints = constrainedNetwork
      ? {
          facingMode: "user",
          width: { ideal: 480, max: 640 },
          height: { ideal: 360, max: 480 },
          frameRate: { ideal: idealFps, max: maxFps },
        }
      : {
          facingMode: "user",
          width: { ideal: 1280, max: 1920 },
          height: { ideal: 720, max: 1080 },
          frameRate: { ideal: idealFps, max: maxFps },
        };

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });

      // Race condition check after async call
      if (!isMountedRef.current || !shouldRunRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          videoTrack.contentHint = "motion";
        } catch {}
        try {
          await videoTrack.applyConstraints(videoConstraints);
        } catch {
          // ignore unsupported constraints
        }
      }

      // Race condition check after constraints
      if (!isMountedRef.current || !shouldRunRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      localStreamRef.current = stream;

      // Show local preview immediately (MJPEG may take a moment to appear)
      try {
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          previewVideoRef.current.muted = true;
          await previewVideoRef.current.play();
        }
      } catch {}

      // Race condition check after play
      if (!isMountedRef.current || !shouldRunRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
        localStreamRef.current = null;
        return;
      }

      setLaptopActive(true);

      let iceConfig: RTCConfiguration = {
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

      stream.getTracks().forEach((track) => {
        const sender = pc.addTrack(track, stream);
        if (track.kind !== "video") return;

        try {
          const params = sender.getParameters();
          const firstEncoding = params.encodings?.[0] ?? {};
          params.encodings = [
            {
              ...firstEncoding,
              maxBitrate,
              maxFramerate: maxFps,
            },
          ];
          sender.setParameters(params).catch(() => {
            // browser may reject encoding hints; continue with defaults
          });
        } catch {
          // ignore sender tuning failures
        }
      });

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        if (isMountedRef.current && shouldRunRef.current) {
          stopLaptopCamera();
        }
      };

      ws.onclose = () => {
        // if we didn't explicitly stop, close resources
        if (isMountedRef.current && shouldRunRef.current && pcRef.current) {
          stopLaptopCamera();
        }
      };

      ws.onopen = async () => {
        const offer = await pc.createOffer();

        if (!isMountedRef.current || !shouldRunRef.current) {
          pc.close();
          ws.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        await pc.setLocalDescription(offer);

        if (!isMountedRef.current || !shouldRunRef.current) {
          pc.close();
          ws.close();
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        ws.send(
          JSON.stringify({
            sdp: pc.localDescription,
            cameraId: laptopCameraId,
            companyId: companyId || undefined,
            type: "attendance",
            purpose: "enroll",
          }),
        );
      };

      ws.onmessage = async (event) => {
        if (!isMountedRef.current || !shouldRunRef.current) return;
        const data = JSON.parse(event.data);

        if (data.sdp && data.cameraId === laptopCameraId) {
          await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        } else if (data.ice && data.cameraId === laptopCameraId) {
          await pc.addIceCandidate(data.ice);
        }
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(
            JSON.stringify({
              ice: event.candidate,
              cameraId: laptopCameraId,
              companyId: companyId || undefined,
              type: "attendance",
              purpose: "enroll",
            }),
          );
        }
      };
    } catch (err) {
      console.error("startLaptopCamera failed:", err);
      stopLaptopCamera();
    }
  }, [companyId, laptopCameraId, stopLaptopCamera, wsSignalUrl]);

  const attachPreviewIfNeeded = useCallback(async () => {
    const stream = localStreamRef.current;
    const video = previewVideoRef.current;
    if (!stream || !video) return;

    if (video.srcObject !== stream) {
      video.srcObject = stream;
      video.muted = true;
      video.play().catch(() => {});
    }
  }, []);

  return {
    previewVideoRef,
    laptopActive,
    startLaptopCamera,
    stopLaptopCamera,
    attachPreviewIfNeeded,
  };
}
