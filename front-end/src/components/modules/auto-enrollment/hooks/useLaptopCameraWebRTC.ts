"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPeerConnection, replaceVideoTrack } from "@/lib/webrtc";

type UseLaptopCameraWebRTCArgs = {
  laptopCameraId: string;
  companyId: string | null;
  aiHost: string;
  selectedDeviceId?: string;
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
  selectedDeviceId,
}: UseLaptopCameraWebRTCArgs) {
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

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
      if (previewVideoRef.current) {
        previewVideoRef.current.srcObject = null;
        try {
          previewVideoRef.current.load();
        } catch {}
      }
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
    pendingIceCandidatesRef.current = [];

    setLaptopActive(false);
  }, []);

  useEffect(() => {
    return () => stopLaptopCamera();
  }, [stopLaptopCamera]);

  const startLaptopCamera = useCallback(
    async (overrideDeviceId?: string) => {
      // if already running, restart cleanly
      if (laptopActive) stopLaptopCamera();

      const deviceIdToUse = overrideDeviceId ?? selectedDeviceId;

      const nav = navigator as NavigatorWithConnection;
      const effectiveType = String(
        nav.connection?.effectiveType ?? "",
      ).toLowerCase();
      const constrainedNetwork =
        !!nav.connection?.saveData ||
        effectiveType === "slow-2g" ||
        effectiveType === "2g" ||
        effectiveType === "3g";

      const maxFps = constrainedNetwork ? 10 : 15;
      const idealFps = constrainedNetwork ? 8 : 12;
      const maxBitrate = constrainedNetwork ? 350_000 : 650_000;

      const baseConstraints: MediaTrackConstraints = constrainedNetwork
        ? {
            width: { ideal: 480, max: 640 },
            height: { ideal: 360, max: 480 },
            frameRate: { ideal: idealFps, max: maxFps },
          }
        : {
            width: { ideal: 640, max: 960 },
            height: { ideal: 480, max: 540 },
            frameRate: { ideal: idealFps, max: maxFps },
          };

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: deviceIdToUse
            ? {
                ...baseConstraints,
                deviceId: { exact: deviceIdToUse },
              }
            : baseConstraints,
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({
          video: baseConstraints,
          audio: false,
        });
      }

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        try {
          videoTrack.contentHint = "motion";
        } catch {}
      }

      localStreamRef.current = stream;

      // Show local preview immediately
      try {
        if (previewVideoRef.current) {
          previewVideoRef.current.srcObject = stream;
          previewVideoRef.current.muted = true;
          await previewVideoRef.current.play().catch(() => {});
        }
      } catch {}

      setLaptopActive(true);

      const pc = createPeerConnection();
      pcRef.current = pc;
      pendingIceCandidatesRef.current = [];

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
          sender.setParameters(params).catch(() => {});
        } catch {}
      });

      const ws = new WebSocket(wsSignalUrl);
      wsRef.current = ws;

      ws.onerror = () => {
        stopLaptopCamera();
      };

      ws.onclose = () => {
        if (pcRef.current) stopLaptopCamera();
      };

      ws.onopen = async () => {
        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);

          ws.send(
            JSON.stringify({
              sdp: pc.localDescription,
              cameraId: laptopCameraId,
              companyId: companyId || undefined,
              type: "attendance",
              purpose: "enroll",
            }),
          );
        } catch {
          stopLaptopCamera();
        }
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.sdp && data.cameraId === laptopCameraId) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

            while (pendingIceCandidatesRef.current.length > 0) {
              const cand = pendingIceCandidatesRef.current.shift();
              if (cand) {
                await pc.addIceCandidate(cand).catch(() => {});
              }
            }
          } else if (data.ice && data.cameraId === laptopCameraId) {
            if (pc.remoteDescription) {
              await pc.addIceCandidate(data.ice).catch(() => {});
            } else {
              pendingIceCandidatesRef.current.push(data.ice);
            }
          }
        } catch (err) {
          console.error("AutoEnroll WebRTC message error:", err);
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
    },
    [companyId, laptopActive, laptopCameraId, selectedDeviceId, stopLaptopCamera, wsSignalUrl],
  );

  const switchDevice = useCallback(
    async (newDeviceId: string) => {
      if (!laptopActive) return;

      try {
        let newStream: MediaStream;
        try {
          newStream = await navigator.mediaDevices.getUserMedia({
            video: {
              deviceId: { exact: newDeviceId },
              width: { ideal: 640, max: 960 },
              height: { ideal: 480, max: 540 },
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
          if (previewVideoRef.current) {
            previewVideoRef.current.srcObject = newStream;
            await previewVideoRef.current.play().catch(() => {});
          }
        } else {
          await startLaptopCamera(newDeviceId);
        }
      } catch (err) {
        console.error("Device switch in AutoEnroll failed:", err);
      }
    },
    [laptopActive, startLaptopCamera],
  );

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
    switchDevice,
    attachPreviewIfNeeded,
  };
}
