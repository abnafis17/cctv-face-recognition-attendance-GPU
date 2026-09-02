"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import toast from "react-hot-toast";

import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import { cn } from "@/lib/utils";
import type { Camera } from "@/types";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import PresenceLaptopCamera from "./PresenceLaptopCamera";
import PresenceMonitorCard from "./PresenceMonitorCard";

const MAX_CAMERAS_PER_ROW = 4;
const MAX_VIEWPORT_CAMERA_COUNT_MEDIUM = 9;
const MAX_VIEWPORT_CAMERA_COUNT_LARGE = 16;
const VIEWPORT_BOTTOM_PADDING_PX = 12;
const MIN_WALL_HEIGHT_PX = 220;
const MOBILE_MAX_WIDTH = 767.98;
const MEDIUM_MAX_WIDTH = 1023.98;

type ViewportMode = "mobile" | "medium" | "large";

type CameraGridConfig = {
  columns: number;
  rows: number;
  shouldScroll: boolean;
};

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

function wallGridStyle(
  columns: number,
  rows: number,
  wallHeight: number,
): CSSProperties &
  Record<
    "--camera-columns" | "--camera-rows" | "--camera-wall-height",
    string
  > {
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

export default function PresencePage() {
  const cameraWallRef = useRef<HTMLElement | null>(null);
  const camsInFlightRef = useRef(false);

  const [companyId, setCompanyId] = useState<string>("");
  const [cams, setCams] = useState<Camera[]>([]);
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [laptopActive, setLaptopActive] = useState(false);
  const [fullscreenCardId, setFullscreenCardId] = useState<string | null>(null);
  const [viewportMode, setViewportMode] = useState<ViewportMode>("mobile");
  const [cameraWallHeight, setCameraWallHeight] =
    useState<number>(MIN_WALL_HEIGHT_PX);

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
    return next;
  }, [cams]);

  const totalScreens = sortedCams.length + 1;
  const gridConfig = useMemo(
    () => getCameraGridConfig(totalScreens, viewportMode),
    [totalScreens, viewportMode],
  );
  const isDesktop = viewportMode !== "mobile";
  const shouldEnableGridScroll = isDesktop && gridConfig.shouldScroll;
  const shouldFillViewportGrid = isDesktop && !gridConfig.shouldScroll;

  const activeScreens =
    sortedCams.filter((camera) => Boolean(camera.isActive)).length +
    Number(laptopActive);
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);

  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : "cmkdpsq300000j7284bwluxh2";
  const laptopCardId = `laptop:${laptopCameraId}`;

  const fetchCameras = useCallback(async () => {
    if (camsInFlightRef.current) return;
    camsInFlightRef.current = true;

    try {
      const response = await axiosInstance.get("/cameras", {
        params: { task: "presence" },
      });
      const list = (response?.data || []) as Camera[];
      setCams(list);
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to load cameras"));
      setCams([]);
    } finally {
      camsInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  useEffect(() => {
    fetchCameras();

    const intervalId = window.setInterval(() => {
      fetchCameras();
    }, 4000);

    const onFocus = () => {
      fetchCameras();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchCameras();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCameras]);

  const setCameraPower = useCallback(
    async (cameraId: string, action: "start" | "stop") => {
      if (!cameraId) return;
      setActionCamId(cameraId);
      try {
        await axiosInstance.post(`/presence-control/${action}/${cameraId}`);
        await fetchCameras();
      } catch (error: unknown) {
        toast.error(normalizeApiError(error, `Failed to ${action} camera`));
      } finally {
        setActionCamId(null);
      }
    },
    [fetchCameras],
  );

  const startCamera = useCallback(
    async (camera: Camera) => {
      await setCameraPower(camera.id, "start");
    },
    [setCameraPower],
  );

  const stopCamera = useCallback(
    async (camera: Camera) => {
      await setCameraPower(camera.id, "stop");
    },
    [setCameraPower],
  );

  const toggleFullscreen = useCallback((cardId: string) => {
    setFullscreenCardId((prev) => (prev === cardId ? null : cardId));
  }, []);

  const closeFullscreen = useCallback(() => {
    setFullscreenCardId(null);
  }, []);

  useEffect(() => {
    if (!fullscreenCardId) return;

    const prevOverflow = document.body.style.overflow;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setFullscreenCardId(null);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKeyDown);
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
    return () => window.removeEventListener("resize", updateViewportMode);
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

    const observer = new ResizeObserver(() => updateWallHeight());
    if (cameraWallRef.current) observer.observe(cameraWallRef.current);
    window.addEventListener("resize", updateWallHeight);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateWallHeight);
    };
  }, [totalScreens, viewportMode]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="page-header">
          <h1 className="page-title">Presence & Dwell</h1>
          <p className="mt-1 text-sm text-zinc-500">
            YOLO person detection with dwell-time tracking (AI: {AI_HOST})
          </p>
        </div>

        <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600">
          <span>
            Total:{" "}
            <span className="font-semibold text-zinc-900">{totalScreens}</span>
          </span>
          <span className="h-3 w-px bg-zinc-200" />
          <span>
            Active:{" "}
            <span className="font-semibold text-emerald-700">
              {activeScreens}
            </span>
          </span>
          <span className="h-3 w-px bg-zinc-200" />
          <span>
            Offline:{" "}
            <span className="font-semibold text-zinc-700">
              {offlineScreens}
            </span>
          </span>
        </div>
      </header>

      <AnimatePresence>
        {fullscreenCardId ? (
          <motion.button
            type="button"
            aria-label="Exit full screen camera"
            className="fixed inset-0 z-[60] bg-black/65 backdrop-blur-[1.5px]"
            onClick={closeFullscreen}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          />
        ) : null}
      </AnimatePresence>

      <section
        ref={cameraWallRef}
        className={cn(
          "camera-wall",
          shouldFillViewportGrid && "camera-wall-fit",
          shouldEnableGridScroll && "md:overflow-y-auto md:pr-1",
        )}
        style={{
          ...wallGridStyle(
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
        }}
      >
        {sortedCams.map((camera) => {
          const cardId = `presence:${camera.id}`;
          const streamUrl = `${AI_HOST}/presence/stream/${encodeURIComponent(camera.id)}`;
          const isFullscreen = fullscreenCardId === cardId;
          const cameraWithPresenceState: Camera = {
            ...camera,
            isActive: Boolean(camera.isActive),
          };

          return (
            <div
              key={camera.id}
              className={cn(
                "camera-wall-item",
                shouldFillViewportGrid && "h-full",
              )}
            >
              <PresenceMonitorCard
                camera={cameraWithPresenceState}
                streamUrl={streamUrl}
                busy={actionCamId === camera.id}
                onStart={startCamera}
                onStop={stopCamera}
                isFullscreen={isFullscreen}
                fillContainer={shouldFillViewportGrid}
                onScreenDoubleClick={() => toggleFullscreen(cardId)}
                className={cn(
                  shouldFillViewportGrid && "h-full",
                  "transition-all duration-300 ease-out",
                  isFullscreen &&
                    "fixed inset-4 z-[70] rounded-md shadow-2xl ring-1 ring-white/10",
                )}
              />
            </div>
          );
        })}

        <div
          className={cn("camera-wall-item", shouldFillViewportGrid && "h-full")}
        >
          <PresenceLaptopCamera
            userId={laptopCameraId}
            companyId={companyId}
            cameraName="Laptop Camera"
            isFullscreen={fullscreenCardId === laptopCardId}
            fillContainer={shouldFillViewportGrid}
            onScreenDoubleClick={() => toggleFullscreen(laptopCardId)}
            onActiveChange={setLaptopActive}
            className={cn(
              shouldFillViewportGrid && "h-full",
              "transition-all duration-300 ease-out",
              fullscreenCardId === laptopCardId &&
                "fixed inset-4 z-[70] rounded-md shadow-2xl ring-1 ring-white/10",
            )}
          />
        </div>
      </section>

      {sortedCams.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-6 text-center">
          <p className="text-sm font-medium text-zinc-700">
            No remote cameras available
          </p>
          <p className="mt-1 text-xs text-zinc-500">
            Add cameras in Camera List to monitor presence streams here.
          </p>
        </div>
      ) : null}
    </div>
  );
}
