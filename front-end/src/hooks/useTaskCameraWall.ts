"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";

import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { useCamerasLoader } from "@/hooks/useCamerasLoader";
import { cn } from "@/lib/utils";
import type { Camera } from "@/types";

const MAX_CAMERAS_PER_ROW = 4;
const MAX_VIEWPORT_CAMERA_COUNT_MEDIUM = 9;
const MAX_VIEWPORT_CAMERA_COUNT_LARGE = 16;
const VIEWPORT_BOTTOM_PADDING_PX = 12;
const MIN_WALL_HEIGHT_PX = 220;
const MOBILE_MAX_WIDTH = 767.98;
const MEDIUM_MAX_WIDTH = 1023.98;

type ViewportMode = "mobile" | "medium" | "large";
type CameraSortOrder = "asc" | "desc";
type CameraGridConfig = {
  columns: number;
  rows: number;
  shouldScroll: boolean;
};
type CameraWallStyle = CSSProperties &
  Record<
    "--camera-columns" | "--camera-rows" | "--camera-wall-height",
    string
  >;

type UseTaskCameraWallArgs = {
  task: string;
  refreshIntervalMs?: number;
  onAfterStart?: (camera: Camera) => Promise<void> | void;
};

function getCameraGridConfig(
  total: number,
  mode: ViewportMode,
): CameraGridConfig {
  if (mode === "mobile") {
    return { columns: 1, rows: Math.max(total, 1), shouldScroll: false };
  }

  if (total <= 1) return { columns: 1, rows: 1, shouldScroll: false };
  if (total <= 4) return { columns: 2, rows: 2, shouldScroll: false };
  if (total <= MAX_VIEWPORT_CAMERA_COUNT_MEDIUM) {
    return { columns: 3, rows: 3, shouldScroll: false };
  }

  if (mode === "large" && total <= MAX_VIEWPORT_CAMERA_COUNT_LARGE) {
    return { columns: 4, rows: 4, shouldScroll: false };
  }

  const columns = mode === "medium" ? 3 : MAX_CAMERAS_PER_ROW;
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

export function useTaskCameraWall({
  task,
  refreshIntervalMs = 10000,
  onAfterStart,
}: UseTaskCameraWallArgs) {
  const cameraWallRef = useRef<HTMLElement | null>(null);

  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [fullscreenCardId, setFullscreenCardId] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("mobile");
  const [cameraSortOrder, setCameraSortOrder] =
    useState<CameraSortOrder>("asc");
  const [cameraWallHeight, setCameraWallHeight] =
    useState<number>(MIN_WALL_HEIGHT_PX);

  const { load } = useCamerasLoader({ setCams, setErr, task });

  const totalScreens = cams.length;
  const gridConfig = useMemo(
    () => getCameraGridConfig(totalScreens, viewportMode),
    [totalScreens, viewportMode],
  );
  const isDesktop = viewportMode !== "mobile";
  const shouldEnableGridScroll = isDesktop && gridConfig.shouldScroll;
  const shouldFillViewportGrid = isDesktop && !gridConfig.shouldScroll;
  const activeScreens = cams.filter((camera) => Boolean(camera.isActive)).length;
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);

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
    }, refreshIntervalMs);

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
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
    };
  }, [load, refreshIntervalMs]);

  const toggleCameraSortOrder = useCallback(() => {
    setCameraSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
  }, []);

  const startCamera = useCallback(
    async (camera: Camera) => {
      try {
        setActionCamId(camera.id);
        setErr("");
        await axiosInstance.post(`${API.CAMERAS}/start/${camera.id}`);
        if (onAfterStart) {
          try {
            await onAfterStart(camera);
          } catch (error: unknown) {
            setErr(
              normalizeApiError(
                error,
                "Camera started, but post-start sync failed",
              ),
            );
          }
        }
      } catch (error: unknown) {
        const message = normalizeApiError(error, "Failed to start camera");
        setErr(message);
      } finally {
        await load();
        setActionCamId(null);
      }
    },
    [load, onAfterStart],
  );

  const stopCamera = useCallback(
    async (camera: Camera) => {
      try {
        setActionCamId(camera.id);
        setErr("");
        await axiosInstance.post(`${API.CAMERAS}/stop/${camera.id}`);
        await load();
      } catch (error: unknown) {
        const message = normalizeApiError(error, "Failed to stop camera");
        await load();
        setErr(message);
      } finally {
        setActionCamId(null);
      }
    },
    [load],
  );

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

  return {
    actionCamId,
    activeScreens,
    cameraSortOrder,
    cameraWallClassName,
    cameraWallRef,
    cameraWallStyle,
    closeFullscreen,
    err,
    fullscreenCardId,
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
