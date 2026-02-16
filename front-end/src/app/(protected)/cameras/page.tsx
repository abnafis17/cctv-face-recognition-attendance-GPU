"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ListVideo } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { AI_HOST } from "@/config/axiosInstance";
import type { Camera } from "@/types";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useAttendanceToggle } from "@/hooks/useAttendanceToggle";
import { useCamerasLoader } from "@/hooks/useCamerasLoader";
import axiosInstance from "@/config/axiosInstance";
import LocalCamera from "@/components/CameraComponent";
import CameraMonitorCard from "@/components/cameras-live/CameraMonitorCard";
import { cn } from "@/lib/utils";

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

function getCameraGridConfig(total: number, mode: ViewportMode): CameraGridConfig {
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
  Record<"--camera-columns" | "--camera-rows" | "--camera-wall-height", string> {
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

export default function CamerasPage() {
  const cameraWallRef = useRef<HTMLElement | null>(null);
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState<string>("");
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
  const [cameraWallHeight, setCameraWallHeight] = useState<number>(
    MIN_WALL_HEIGHT_PX,
  );

  const companyId = getCompanyIdFromToken();

  const streamQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "attendance");
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId]);

  const { load } = useCamerasLoader({ setCams, setErr });
  const { enableAttendance, disableAttendance } = useAttendanceToggle({
    setErr,
  });

  const totalScreens = cams.length + 1; // +1 for laptop camera card
  const gridConfig = useMemo(
    () => getCameraGridConfig(totalScreens, viewportMode),
    [totalScreens, viewportMode],
  );
  const isDesktop = viewportMode !== "mobile";
  const shouldEnableGridScroll = isDesktop && gridConfig.shouldScroll;
  const shouldFillViewportGrid = isDesktop && !gridConfig.shouldScroll;
  const activeScreens =
    cams.filter((c) => c.isActive).length + (laptopActive ? 1 : 0);
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);

  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : "cmkdpsq300000j7284bwluxh2";
  const laptopCardId = `laptop:${laptopCameraId}`;

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      load();
    }, 10000);

    const onFocus = () => {
      load();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
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

  const startCamera = async (cam: Camera) => {
    try {
      setActionCamId(cam.id);
      await axiosInstance.post(`/cameras/start/${cam.id}`);
      await load();
    } catch (error: unknown) {
      setErr(normalizeApiError(error, "Failed to start camera"));
    } finally {
      setActionCamId(null);
    }
  };

  const stopCamera = async (cam: Camera) => {
    try {
      setActionCamId(cam.id);
      await axiosInstance.post(`/cameras/stop/${cam.id}`);
      await load();
    } catch (error: unknown) {
      setErr(normalizeApiError(error, "Failed to stop camera"));
    } finally {
      setActionCamId(null);
    }
  };

  const handleEnableAttendance = async (cam: Camera) => {
    try {
      setAttendanceActionCamId(cam.id);
      const ok = await enableAttendance(cam);
      if (ok) {
        setAttendanceEnabledByCamId((prev) => ({ ...prev, [cam.id]: true }));
      }
    } finally {
      setAttendanceActionCamId(null);
    }
  };

  const handleDisableAttendance = async (cam: Camera) => {
    try {
      setAttendanceActionCamId(cam.id);
      const ok = await disableAttendance(cam);
      if (ok) {
        setAttendanceEnabledByCamId((prev) => ({ ...prev, [cam.id]: false }));
      }
    } finally {
      setAttendanceActionCamId(null);
    }
  };

  const toggleFullscreen = (cardId: string) => {
    setFullscreenCardId((prev) => (prev === cardId ? null : cardId));
  };

  const closeFullscreen = () => {
    setFullscreenCardId(null);
  };

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
  }, [totalScreens, err, viewportMode]);

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Camera View</h1>
          {/* <p className="mt-1 text-sm text-zinc-500">
            Live camera view with recognition overlay (AI: {AI_HOST})
          </p> */}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600">
            <span>
              Total:{" "}
              <span className="font-semibold text-zinc-900">
                {totalScreens}
              </span>
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

          <Link
            href="/camera-list"
            className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
          >
            <ListVideo className="mr-2 h-4 w-4" />
            Camera List
          </Link>
        </div>
      </header>

      {err ? (
        <div className="rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

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
          ...wallGridStyle(gridConfig.columns, gridConfig.rows, cameraWallHeight),
          ...(shouldFillViewportGrid && isDesktop
            ? { height: `${cameraWallHeight}px` }
            : {}),
          ...(shouldEnableGridScroll && isDesktop
            ? { maxHeight: `${cameraWallHeight}px` }
            : {}),
        }}
      >
        <div className={cn("camera-wall-item", shouldFillViewportGrid && "h-full")}>
          <LocalCamera
            userId={laptopCameraId}
            companyId={companyId || ""}
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

        {cams.map((camera) => {
          const cardId = `camera:${camera.id}`;
          const isFullscreen = fullscreenCardId === cardId;
          const attendanceEnabled =
            attendanceEnabledByCamId[camera.id] ?? Boolean(camera.attendance);
          const streamUrl = attendanceEnabled
            ? `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
                camera.id,
              )}/${encodeURIComponent(camera.name)}${streamQuery}`
            : `${AI_HOST}/camera/stream/${encodeURIComponent(camera.id)}`;

          return (
            <div
              key={camera.id}
              className={cn("camera-wall-item", shouldFillViewportGrid && "h-full")}
            >
              <CameraMonitorCard
                camera={camera}
                streamUrl={streamUrl}
                busy={actionCamId === camera.id}
                attendanceEnabled={attendanceEnabled}
                attendanceBusy={attendanceActionCamId === camera.id}
                isFullscreen={isFullscreen}
                fillContainer={shouldFillViewportGrid}
                onScreenDoubleClick={() => toggleFullscreen(cardId)}
                className={cn(
                  shouldFillViewportGrid && "h-full",
                  "transition-all duration-300 ease-out",
                  isFullscreen &&
                    "fixed inset-4 z-[70] rounded-md shadow-2xl ring-1 ring-white/10",
                )}
                onStart={startCamera}
                onStop={stopCamera}
                onEnableAttendance={handleEnableAttendance}
                onDisableAttendance={handleDisableAttendance}
              />
            </div>
          );
        })}
      </section>
    </div>
  );
}
