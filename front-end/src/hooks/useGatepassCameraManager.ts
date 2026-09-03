import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { DEFAULT_LOCAL_CAMERA_ID, isLocalCameraId, dispatchLocalCameraStop } from "@/lib/localCameraEvents";
import type { Camera as CameraOption } from "@/types";
import { normalizeApiError, normalizeTask, GATEPASS_ACTIVE_CAMERA_STORAGE_KEY } from "./useGatepassUtils";

export function useGatepassCameraManager() {
  const [companyId, setCompanyId] = useState("");
  const [gatepassCameras, setGatepassCameras] = useState<CameraOption[]>([]);
  const [gatepassCamerasLoading, setGatepassCamerasLoading] = useState(false);
  const [gatepassCameraError, setGatepassCameraError] = useState("");
  const [selectedGatepassCameraId, setSelectedGatepassCameraId] = useState("");
  const [cameraAction, setCameraAction] = useState<"start" | "stop" | null>(null);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  const fetchGatepassCameras = useCallback(async () => {
    try {
      setGatepassCamerasLoading(true);
      const res = await axiosInstance.get(API.CAMERAS, {
        params: { task: "gatepass" },
      });

      const list = Array.isArray(res?.data)
        ? res.data
        : Array.isArray(res?.data?.cameras)
        ? res.data.cameras
        : [];

      const normalizedList = list.map((cam: any) => ({
        id: String(cam.id),
        name: String(cam.name ?? "Camera"),
        ip: cam.ip ? String(cam.ip) : undefined,
        isActive: Boolean(cam.isActive),
        isStreaming: Boolean(cam.isStreaming),
        status: cam.status ? String(cam.status) : undefined,
        task: cam.task ? normalizeTask(cam.task) : undefined,
      }));

      setGatepassCameras(normalizedList);
      setGatepassCameraError("");
    } catch (err: unknown) {
      setGatepassCameraError(normalizeApiError(err, "Failed to load cameras"));
      setGatepassCameras([]);
    } finally {
      setGatepassCamerasLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGatepassCameras();
  }, [fetchGatepassCameras]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(GATEPASS_ACTIVE_CAMERA_STORAGE_KEY);
    if (stored) setSelectedGatepassCameraId(stored);
  }, []);

  const handleCameraChange = async (cameraId: string) => {
    setSelectedGatepassCameraId(cameraId);
    if (typeof window !== "undefined") {
      localStorage.setItem(GATEPASS_ACTIVE_CAMERA_STORAGE_KEY, cameraId);
    }
  };

  const selectedGatepassCamera = useMemo(
    () => gatepassCameras.find((c) => c.id === selectedGatepassCameraId) || null,
    [gatepassCameras, selectedGatepassCameraId]
  );

  const previewCamera = useMemo(() => {
    if (selectedGatepassCamera) return selectedGatepassCamera;
    return { id: DEFAULT_LOCAL_CAMERA_ID, name: "Laptop Camera", isActive: false };
  }, [selectedGatepassCamera]);

  const isSelectedCameraRunning = selectedGatepassCamera
    ? Boolean(selectedGatepassCamera.isActive)
    : false;

  const recognitionStreamUrl = useMemo(() => {
    if (!selectedGatepassCamera) return "";
    const params = new URLSearchParams({ type: "gatepass" });
    if (companyId) params.set("companyId", companyId);
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      selectedGatepassCamera.id
    )}/${encodeURIComponent(selectedGatepassCamera.name)}?${params.toString()}`;
  }, [companyId, selectedGatepassCamera]);

  const startSelectedCamera = useCallback(async () => {
    if (!selectedGatepassCameraId) return;
    try {
      setCameraAction("start");
      await axiosInstance.post(`${API.CAMERAS}/${selectedGatepassCameraId}/start`, {
        task: "gatepass",
      });
      await fetchGatepassCameras();
      toast.success("Gatepass camera started");
    } catch (err) {
      toast.error(normalizeApiError(err, "Failed to start camera"));
    } finally {
      setCameraAction(null);
    }
  }, [fetchGatepassCameras, selectedGatepassCameraId]);

  const stopSelectedCamera = useCallback(async () => {
    if (!selectedGatepassCameraId) return;
    try {
      setCameraAction("stop");
      await axiosInstance.post(`${API.CAMERAS}/${selectedGatepassCameraId}/stop`, {
        task: "gatepass",
      });
      await fetchGatepassCameras();
      toast.success("Gatepass camera stopped");
    } catch (err) {
      toast.error(normalizeApiError(err, "Failed to stop camera"));
    } finally {
      setCameraAction(null);
    }
  }, [fetchGatepassCameras, selectedGatepassCameraId]);

  return {
    companyId,
    gatepassCameras,
    gatepassCamerasLoading,
    gatepassCameraError,
    directoryError: "",
    panelError: "",
    selectedGatepassCameraId,
    setSelectedGatepassCameraId,
    cameraAction,
    selectedGatepassCamera,
    previewCamera,
    isSelectedCameraRunning,
    recognitionStreamUrl,
    handleCameraChange,
    startSelectedCamera,
    stopSelectedCamera,
    fetchGatepassCameras,
  };
}
