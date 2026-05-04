"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import { useAttendanceToggle } from "@/hooks/useAttendanceToggle";
import { useCamerasLoader } from "@/hooks/useCamerasLoader";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { cn } from "@/lib/utils";
import type { Camera } from "@/types";

const MAX_CAMERAS_PER_ROW = 4;
const MAX_VIEWPORT_CAMERA_COUNT_MEDIUM = 9;
const MAX_VIEWPORT_CAMERA_COUNT_LARGE = 16;
const VIEWPORT_BOTTOM_PADDING_PX = 12;
const MIN_WALL_HEIGHT_PX = 220;
const MOBILE_MAX_WIDTH = 767.98;
const MEDIUM_MAX_WIDTH = 1900;
const DEFAULT_LAPTOP_CAMERA_ID = "cmkdpsq300000j7284bwluxh2";

type ViewportMode = "mobile" | "medium" | "large";
type CameraSortOrder = "asc" | "desc";
type StreamProfileMode = "grid" | "focus";
type CameraGridConfig = {
  columns: number;
  rows: number;
  shouldScroll: boolean;
};
type CameraWallStyle = CSSProperties &
  Record<"--camera-columns" | "--camera-rows" | "--camera-wall-height", string>;

function getCameraGridConfig(
  total: number,
  mode: ViewportMode,
): CameraGridConfig {
  if (mode === "mobile") {
    return { columns: 1, rows: Math.max(total, 1), shouldScroll: false };
  }

  if (total === 1) return { columns: 1, rows: 1, shouldScroll: false };
  if (total <= 4) return { columns: 2, rows: 2, shouldScroll: false };
  if (total <= MAX_VIEWPORT_CAMERA_COUNT_MEDIUM) {
    if (mode === "medium") {
      return { columns: 2, rows: Math.ceil(total / 2), shouldScroll: true };
    }
    return { columns: 3, rows: 3, shouldScroll: true };
  }

  if (mode === "large" && total <= MAX_VIEWPORT_CAMERA_COUNT_LARGE) {
    return { columns: 4, rows: 4, shouldScroll: false };
  }

  const columns = mode === "medium" ? 1 : MAX_CAMERAS_PER_ROW;
  return {
    columns,
    rows: Math.ceil(total / columns),
    shouldScroll: true,
  };
}

function getCameraWallStyle(
  columns: number,
  rows: number,
  wallHeight: number,
): CameraWallStyle {
  return {
    "--camera-columns": String(columns),
    "--camera-rows": String(rows),
    "--camera-wall-height": `${wallHeight}px`,
  };
}

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

export function useCameraViewPage() {
  const cameraWallRef = useRef<HTMLElement | null>(null);
  const prewarmKeyRef = useRef("");

  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [attendanceActionCamId, setAttendanceActionCamId] = useState<
    string | null
  >(null);
  const [attendanceEnabledByCamId, setAttendanceEnabledByCamId] = useState<
    Record<string, boolean>
  >({});
  const [laptopActive, setLaptopActive] = useState(false);
  const [fullscreenCardId, setFullscreenCardId] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("mobile");
  const [cameraSortOrder, setCameraSortOrder] =
    useState<CameraSortOrder>("asc");
  const [cameraWallHeight, setCameraWallHeight] =
    useState<number>(MIN_WALL_HEIGHT_PX);

  const companyId = getCompanyIdFromToken();

  const { load } = useCamerasLoader({ setCams, setErr, task: "attendance" });
  const { enableAttendance, disableAttendance } = useAttendanceToggle({
    setErr,
  });

  const totalScreens = cams.length + 1;
  const gridConfig = useMemo(
    () => getCameraGridConfig(totalScreens, viewportMode),
    [totalScreens, viewportMode],
  );
  const isDesktop = viewportMode !== "mobile";
  const shouldEnableGridScroll = isDesktop && gridConfig.shouldScroll;
  const shouldFillViewportGrid = isDesktop && !gridConfig.shouldScroll;
  const activeScreens =
    cams.filter((camera) => camera.isActive).length + Number(laptopActive);
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);
  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : DEFAULT_LAPTOP_CAMERA_ID;
  const laptopCardId = `laptop:${laptopCameraId}`;

  const sortedCams = useMemo(() => {
    const next = [...cams];

    next.sort((a, b) => {
      const byName = a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      });
      if (byName !== 0) return byName;

      return a.id.localeCompare(b.id, undefined, {
        numeric: true,
        sensitivity: "base",
      });
    });

    if (cameraSortOrder === "desc") next.reverse();
    return next;
  }, [cams, cameraSortOrder]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void load();
    }, 10000);

    const handleFocus = () => {
      void load();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void load();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [load]);

  useEffect(() => {
    setAttendanceEnabledByCamId(() => {
      const next: Record<string, boolean> = {};
      for (const camera of cams) {
        next[camera.id] = Boolean(camera.attendance);
      }
      return next;
    });
  }, [cams]);

  useEffect(() => {
    if (!companyId) return;

    const activeCameraIds = cams
      .filter((camera) => camera.isActive)
      .map((camera) => camera.id)
      .filter(Boolean)
      .sort();

    if (activeCameraIds.length === 0) {
      prewarmKeyRef.current = "";
      return;
    }

    const key = `${companyId}:${activeCameraIds.join(",")}`;
    if (prewarmKeyRef.current === key) return;
    prewarmKeyRef.current = key;

    void fetch(`${AI_HOST}/camera/recognition/prewarm`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-company-id": companyId,
      },
      body: JSON.stringify({
        camera_ids: activeCameraIds,
        company_id: companyId,
        stream_type: "attendance",
      }),
      keepalive: true,
    }).catch(() => {
      // Stream routes still self-recover if prewarm fails.
    });
  }, [cams, companyId]);

  const toggleCameraSortOrder = useCallback(() => {
    setCameraSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const startCamera = useCallback(
    async (cam: Camera) => {
      try {
        setActionCamId(cam.id);
        await axiosInstance.post(`/cameras/start/${cam.id}`);
        await load();
      } catch (error: unknown) {
        setErr(normalizeApiError(error, "Failed to start camera"));
      } finally {
        setActionCamId(null);
      }
    },
    [load],
  );

  const stopCamera = useCallback(
    async (cam: Camera) => {
      try {
        setActionCamId(cam.id);
        await axiosInstance.post(`/cameras/stop/${cam.id}`);
        await load();
      } catch (error: unknown) {
        setErr(normalizeApiError(error, "Failed to stop camera"));
      } finally {
        setActionCamId(null);
      }
    },
    [load],
  );

  const handleEnableAttendance = useCallback(
    async (cam: Camera) => {
      try {
        setAttendanceActionCamId(cam.id);
        const ok = await enableAttendance(cam);
        if (ok) {
          setAttendanceEnabledByCamId((prev) => ({ ...prev, [cam.id]: true }));
        }
      } finally {
        setAttendanceActionCamId(null);
      }
    },
    [enableAttendance],
  );

  const handleDisableAttendance = useCallback(
    async (cam: Camera) => {
      try {
        setAttendanceActionCamId(cam.id);
        const ok = await disableAttendance(cam);
        if (ok) {
          setAttendanceEnabledByCamId((prev) => ({ ...prev, [cam.id]: false }));
        }
      } finally {
        setAttendanceActionCamId(null);
      }
    },
    [disableAttendance],
  );

  const handleLaptopActiveChange = useCallback((active: boolean) => {
    setLaptopActive(active);
  }, []);

  const toggleFullscreen = useCallback((cardId: string) => {
    setFullscreenCardId((prev) => (prev === cardId ? null : cardId));
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenCardId(null);
  }, []);

  useEffect(() => {
    if (!fullscreenCardId) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenCardId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [fullscreenCardId]);

  useEffect(() => {
    const updateViewportMode = () => {
      const width = window.innerWidth;
      if (width <= MOBILE_MAX_WIDTH) {
        setViewportMode("mobile");
      } else if (width <= MEDIUM_MAX_WIDTH) {
        setViewportMode("medium");
      } else {
        setViewportMode("large");
      }
    };

    updateViewportMode();
    window.addEventListener("resize", updateViewportMode);

    return () => {
      window.removeEventListener("resize", updateViewportMode);
    };
  }, []);

  useEffect(() => {
    const updateWallHeight = () => {
      const wallNode = cameraWallRef.current;
      if (!wallNode) return;

      const rect = wallNode.getBoundingClientRect();
      const nextHeight = Math.max(
        window.innerHeight - rect.top - VIEWPORT_BOTTOM_PADDING_PX,
        MIN_WALL_HEIGHT_PX,
      );

      setCameraWallHeight((prev) =>
        Math.abs(prev - nextHeight) < 1 ? prev : nextHeight,
      );
    };

    updateWallHeight();

    const observer = new ResizeObserver(updateWallHeight);
    if (cameraWallRef.current) {
      observer.observe(cameraWallRef.current);
    }
    window.addEventListener("resize", updateWallHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWallHeight);
    };
  }, [totalScreens, err, viewportMode]);

  const cameraWallClassName = useMemo(
    () =>
      cn(
        "camera-wall",
        shouldFillViewportGrid && "camera-wall-fit",
        shouldEnableGridScroll && "md:overflow-y-auto md:pr-1",
      ),
    [shouldEnableGridScroll, shouldFillViewportGrid],
  );

  const cameraWallStyle = useMemo(
    () => ({
      ...getCameraWallStyle(
        gridConfig.columns,
        gridConfig.rows,
        cameraWallHeight,
      ),
      ...(shouldFillViewportGrid && isDesktop
        ? { height: `${cameraWallHeight}px` }
        : {}),
      ...(shouldEnableGridScroll && isDesktop
        ? { maxHeight: `${cameraWallHeight}px` }
        : {}),
    }),
    [
      cameraWallHeight,
      gridConfig.columns,
      gridConfig.rows,
      isDesktop,
      shouldEnableGridScroll,
      shouldFillViewportGrid,
    ],
  );

  const getStreamUrl = useCallback(
    (camera: Camera, mode: StreamProfileMode = "grid") => {
      const attendanceEnabled =
        attendanceEnabledByCamId[camera.id] ?? Boolean(camera.attendance);
      const params = new URLSearchParams();
      params.set("type", "attendance");
      params.set("realtime", "1");
      if (companyId) params.set("companyId", companyId);

      if (mode === "grid") {
        params.set("profile", "grid");
        params.set(
          "send_fps",
          String(clampInt(camera.sendFps, 8, 12, 10)),
        );
        params.set(
          "send_width",
          String(clampInt(camera.sendWidth, 480, 960, 640)),
        );
        params.set(
          "send_height",
          String(clampInt(camera.sendHeight, 270, 540, 360)),
        );
        params.set(
          "jpeg_quality",
          String(clampInt(camera.jpegQuality, 38, 58, 45)),
        );
      } else {
        params.set("profile", "focus");
        params.set(
          "send_fps",
          String(clampInt(camera.sendFps, 10, 15, 12)),
        );
        params.set(
          "send_width",
          String(clampInt(camera.sendWidth, 960, 1920, 1280)),
        );
        params.set(
          "send_height",
          String(clampInt(camera.sendHeight, 540, 1080, 720)),
        );
        params.set(
          "jpeg_quality",
          String(clampInt(camera.jpegQuality, 55, 80, 65)),
        );
      }

      const query = params.toString();

      return attendanceEnabled
        ? `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
            camera.id,
          )}/${encodeURIComponent(camera.name)}?${query}`
        : `${AI_HOST}/camera/stream/${encodeURIComponent(camera.id)}?${query}`;
    },
    [attendanceEnabledByCamId, companyId],
  );

  return {
    actionCamId,
    activeScreens,
    attendanceActionCamId,
    attendanceEnabledByCamId,
    cameraSortOrder,
    cameraWallClassName,
    cameraWallRef,
    cameraWallStyle,
    closeFullscreen,
    companyId,
    err,
    fullscreenCardId,
    getStreamUrl,
    handleDisableAttendance,
    handleEnableAttendance,
    handleLaptopActiveChange,
    laptopCameraId,
    laptopCardId,
    offlineScreens,
    shouldFillViewportGrid,
    sortedCams,
    startCamera,
    stopCamera,
    toggleCameraSortOrder,
    toggleFullscreen,
    totalScreens,
  };
}
