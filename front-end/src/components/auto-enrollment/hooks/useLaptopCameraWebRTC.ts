"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type UseLaptopCameraWebRTCArgs = {
  laptopCameraId: string;
  companyId: string | null;
  aiHost: string;
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

  const wsSignalUrl = useMemo(() => {
    const base = String(aiHost || "")
      .replace(/^http/i, "ws")
      .replace(/\/$/, "");
    return `${base}/webrtc/signal`;
  }, [aiHost]);

  const stopLaptopCamera = useCallback(() => {
    try {
      localStreamRef.current?.getTracks().forEach((t) => t.stop());
    } catch {}

    try {
      if (previewVideoRef.current) previewVideoRef.current.srcObject = null;
    } catch {}

    try {
      pcRef.current?.close();
    } catch {}

    try {
      wsRef.current?.close();
    } catch {}

    localStreamRef.current = null;
    pcRef.current = null;
    wsRef.current = null;

    setLaptopActive(false);
  }, []);

  useEffect(() => {
    return () => stopLaptopCamera();
  }, [stopLaptopCamera]);

  const startLaptopCamera = useCallback(async () => {
    // if already running, restart cleanly
    if (laptopActive) stopLaptopCamera();

    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
    localStreamRef.current = stream;

    // Show local preview immediately (MJPEG may take a moment to appear)
    try {
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.muted = true;
        await previewVideoRef.current.play();
      }
    } catch {}

    setLaptopActive(true);

    const pc = new RTCPeerConnection();
    pcRef.current = pc;
    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    const ws = new WebSocket(wsSignalUrl);
    wsRef.current = ws;

    ws.onerror = () => {
      stopLaptopCamera();
    };

    ws.onclose = () => {
      // if we didn't explicitly stop, close resources
      if (pcRef.current) stopLaptopCamera();
    };

    ws.onopen = async () => {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      ws.send(
        JSON.stringify({
          sdp: pc.localDescription,
          cameraId: laptopCameraId,
          companyId: companyId || undefined,
          type: "attendance",
          purpose: "enroll",
        })
      );
    };

    ws.onmessage = async (event) => {
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
          })
        );
      }
    };
  }, [companyId, laptopActive, laptopCameraId, stopLaptopCamera, wsSignalUrl]);

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
