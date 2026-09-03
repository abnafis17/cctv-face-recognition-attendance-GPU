import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import type { HeadcountCameraOption, HeadcountType } from "@/types/headcount-types";
import { normalizeHeadcountCamera } from "@/components/modules/head-count/headcount-utils";

export function getApiErrorMessage(error: unknown, fallback: string) {
  const anyError = error as any;
  return (
    anyError?.response?.data?.message ||
    anyError?.response?.data?.error ||
    (error instanceof Error ? error.message : fallback)
  );
}

export function useHeadcountCameras(headcountType: HeadcountType) {
  const [companyId, setCompanyId] = useState("");
  const [cams, setCams] = useState<HeadcountCameraOption[]>([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [laptopActive, setLaptopActive] = useState(false);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  const selectedCam = useMemo(
    () => cams.find((camera) => camera.id === selectedCamId) || null,
    [cams, selectedCamId]
  );
  const usingLaptopCamera = !selectedCam;
  const selectedCameraName = selectedCam?.name ?? "Laptop Camera";
  const selectedCameraActive = selectedCam ? Boolean(selectedCam.isActive) : laptopActive;
  const selectedCameraBusy = selectedCam ? actionCamId === selectedCam.id : false;

  const totalSources = cams.length + 1;
  const activeSources = cams.filter((camera) => Boolean(camera.isActive)).length + Number(laptopActive);
  const offlineSources = Math.max(totalSources - activeSources, 0);

  const streamType = headcountType === "ot" ? "ot" : "headcount";
  const streamQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", streamType);
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId, streamType]);

  const getRemoteStreamUrl = useCallback(
    (camera: HeadcountCameraOption) =>
      `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
        camera.id
      )}/${encodeURIComponent(camera.name)}${streamQuery}`,
    [streamQuery]
  );

  const fetchCameras = useCallback(async () => {
    try {
      const response = await axiosInstance.get(API.HEADCOUNT_CAMERAS, {
        params: { task: "headcount" },
      });
      const list = Array.isArray(response?.data)
        ? response.data
        : Array.isArray(response?.data?.cameras)
        ? response.data.cameras
        : [];
      setCams(list.map(normalizeHeadcountCamera));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to load cameras"));
      setCams([]);
    }
  }, []);

  useEffect(() => {
    void fetchCameras();
  }, [fetchCameras]);

  useEffect(() => {
    const intervalId = window.setInterval(() => { void fetchCameras(); }, 10000);
    const handleFocus = () => { void fetchCameras(); };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void fetchCameras();
    };
    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchCameras]);

  useEffect(() => {
    if (!selectedCamId) return;
    if (!cams.some((camera) => camera.id === selectedCamId)) {
      setSelectedCamId("");
    }
  }, [cams, selectedCamId]);

  const setCameraPower = useCallback(
    async (cameraId: string, action: "start" | "stop") => {
      if (!cameraId) return;
      setActionCamId(cameraId);
      try {
        await axiosInstance.post(`${API.CAMERAS}/${action}/${cameraId}`);
        await fetchCameras();
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, `Failed to ${action} camera`));
      } finally {
        setActionCamId(null);
      }
    },
    [fetchCameras]
  );

  const startCamera = useCallback(
    async (cameraId: string) => { await setCameraPower(cameraId, "start"); },
    [setCameraPower]
  );

  const stopCamera = useCallback(
    async (cameraId: string) => { await setCameraPower(cameraId, "stop"); },
    [setCameraPower]
  );

  const handleCameraSelect = useCallback((cameraId: string) => { setSelectedCamId(cameraId); }, []);
  const handleLaptopActiveChange = useCallback((active: boolean) => { setLaptopActive(active); }, []);

  return {
    companyId,
    cams,
    selectedCamId,
    setSelectedCamId,
    actionCamId,
    setActionCamId,
    laptopActive,
    setLaptopActive,
    selectedCam,
    usingLaptopCamera,
    selectedCameraName,
    selectedCameraActive,
    selectedCameraBusy,
    activeSources,
    totalSources,
    offlineSources,
    streamType,
    getRemoteStreamUrl,
    fetchCameras,
    handleCameraSelect,
    handleLaptopActiveChange,
    startCamera,
    stopCamera,
  };
}
