"use client";

import { useCallback, useMemo } from "react";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import type { Camera } from "../types";

type UseCameraControlsArgs = {
  cameras: Camera[];
  loadCameras: () => Promise<void>;
  laptopCameraId: string;
  laptopActive: boolean;
  startLaptopCamera: () => Promise<void>;
  stopLaptopCamera: () => void;
};

export function useCameraControls({
  cameras,
  loadCameras,
  laptopCameraId,
  laptopActive,
  startLaptopCamera,
  stopLaptopCamera,
}: UseCameraControlsArgs) {
  const camerasWithLaptop = useMemo(() => {
    const hasLaptop = (cameras || []).some((c) => c.id === laptopCameraId);
    if (hasLaptop) return cameras || [];
    return [
      { id: laptopCameraId, name: "Laptop Camera", isActive: laptopActive },
      ...(cameras || []),
    ];
  }, [cameras, laptopCameraId, laptopActive]);

  const ensureCameraOn = useCallback(
    async (camId: string) => {
      if (!camId) return false;

      if (camId === laptopCameraId) {
        const wasActive = laptopActive;
        await startLaptopCamera();
        return !wasActive;
      }

      const wasActive = cameras.find((c) => c.id === camId)?.isActive === true;

      const res = await axiosInstance.post<{
        ok: boolean;
        startedNow?: boolean;
        isActive?: boolean;
      }>(`${API.CAMERAS}/start/${camId}`);

      await loadCameras();

      return typeof res.data?.startedNow === "boolean"
        ? res.data.startedNow
        : !wasActive;
    },
    [cameras, loadCameras, laptopActive, laptopCameraId, startLaptopCamera]
  );

  const stopCamera = useCallback(
    async (camId: string) => {
      if (!camId) return;

      if (camId === laptopCameraId) {
        stopLaptopCamera();
        return;
      }

      await axiosInstance.post(`${API.CAMERAS}/stop/${camId}`);
      await loadCameras();
    },
    [laptopCameraId, loadCameras, stopLaptopCamera]
  );

  return {
    camerasWithLaptop,
    ensureCameraOn,
    stopCamera,
  };
}
