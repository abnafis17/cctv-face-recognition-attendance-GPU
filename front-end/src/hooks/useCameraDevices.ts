"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type CameraDeviceInfo = {
  deviceId: string;
  label: string;
  groupId?: string;
};

const STORAGE_KEY = "preferred_camera_device_id";

export function useCameraDevices(preferredDeviceId?: string) {
  const [devices, setDevices] = useState<CameraDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string>(() => {
    if (preferredDeviceId) return preferredDeviceId;
    if (typeof window !== "undefined") {
      return localStorage.getItem(STORAGE_KEY) || "";
    }
    return "";
  });
  const [loading, setLoading] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const isMountedRef = useRef(true);

  const setSelectedDeviceId = useCallback((id: string) => {
    setSelectedDeviceIdState(id);
    if (typeof window !== "undefined") {
      try {
        if (id) {
          localStorage.setItem(STORAGE_KEY, id);
        } else {
          localStorage.removeItem(STORAGE_KEY);
        }
      } catch {}
    }
  }, []);

  const enumerate = useCallback(async (): Promise<CameraDeviceInfo[]> => {
    if (
      typeof window === "undefined" ||
      !navigator.mediaDevices?.enumerateDevices
    ) {
      return [];
    }

    try {
      setLoading(true);
      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = allDevices.filter((d) => d.kind === "videoinput");

      const list: CameraDeviceInfo[] = videoInputs.map((d, index) => ({
        deviceId: d.deviceId,
        label: d.label?.trim() || `Camera ${index + 1}`,
        groupId: d.groupId,
      }));

      if (isMountedRef.current) {
        setDevices(list);
        const labelsKnown = list.some(
          (d) => d.label && !d.label.startsWith("Camera "),
        );
        if (labelsKnown) {
          setHasPermission(true);
        }

        // Validate selected device: if selected device is no longer plugged in, fallback
        setSelectedDeviceIdState((current) => {
          if (!current && list.length > 0) {
            return list[0].deviceId;
          }
          if (current && !list.some((d) => d.deviceId === current)) {
            return list[0]?.deviceId || "";
          }
          return current;
        });
      }

      return list;
    } catch (err) {
      console.warn("Failed to enumerate camera devices:", err);
      return [];
    } finally {
      if (isMountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  // Request permission to expose real hardware labels
  const requestPermissionAndEnumerate =
    useCallback(async (): Promise<CameraDeviceInfo[]> => {
      if (
        typeof window === "undefined" ||
        !navigator.mediaDevices?.getUserMedia
      ) {
        return [];
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false,
        });
        stream.getTracks().forEach((t) => t.stop());
        setHasPermission(true);
      } catch (err) {
        console.warn("Camera permission request failed:", err);
      }

      return enumerate();
    }, [enumerate]);

  useEffect(() => {
    isMountedRef.current = true;
    void enumerate();

    const handleDeviceChange = () => {
      void enumerate();
    };

    navigator.mediaDevices?.addEventListener?.(
      "devicechange",
      handleDeviceChange,
    );

    return () => {
      isMountedRef.current = false;
      navigator.mediaDevices?.removeEventListener?.(
        "devicechange",
        handleDeviceChange,
      );
    };
  }, [enumerate]);

  const selectedDevice = useMemo(() => {
    return devices.find((d) => d.deviceId === selectedDeviceId);
  }, [devices, selectedDeviceId]);

  const getMediaConstraints = useCallback(
    (
      deviceId?: string,
      customConstraints?: MediaTrackConstraints,
    ): MediaStreamConstraints => {
      const targetId = deviceId ?? selectedDeviceId;
      const baseConstraints: MediaTrackConstraints = {
        width: { ideal: 640, max: 1280 },
        height: { ideal: 480, max: 720 },
        frameRate: { ideal: 15, max: 30 },
        ...customConstraints,
      };

      if (targetId) {
        return {
          video: {
            ...baseConstraints,
            deviceId: { exact: targetId },
          },
          audio: false,
        };
      }

      return {
        video: baseConstraints,
        audio: false,
      };
    },
    [selectedDeviceId],
  );

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    selectedDevice,
    loading,
    hasPermission,
    refreshDevices: enumerate,
    requestPermissionAndEnumerate,
    getMediaConstraints,
  };
}
