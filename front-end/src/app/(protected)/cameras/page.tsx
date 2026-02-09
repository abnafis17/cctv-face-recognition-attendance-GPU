"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ListVideo } from "lucide-react";
import { AI_HOST } from "@/config/axiosInstance";
import type { Camera } from "@/types";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useAttendanceToggle } from "@/hooks/useAttendanceToggle";
import { useCamerasLoader } from "@/hooks/useCamerasLoader";
import axiosInstance from "@/config/axiosInstance";
import LocalCamera from "@/components/CameraComponent";
import CameraMonitorCard from "@/components/cameras-live/CameraMonitorCard";

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
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState<string>("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [attendanceActionCamId, setAttendanceActionCamId] = useState<string | null>(null);
  const [attendanceEnabledByCamId, setAttendanceEnabledByCamId] = useState<Record<string, boolean>>({});
  const [laptopActive, setLaptopActive] = useState(false);

  const companyId = getCompanyIdFromToken();

  const streamQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "attendance");
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId]);

  const { load } = useCamerasLoader({ setCams, setErr });
  const { enableAttendance, disableAttendance } = useAttendanceToggle({ setErr });

  const totalScreens = cams.length + 1; // +1 for laptop camera card
  const activeScreens =
    cams.filter((c) => c.isActive).length + (laptopActive ? 1 : 0);
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);

  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : "cmkdpsq300000j7284bwluxh2";

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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Camera Control Panel</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Live camera view with recognition overlay (AI: {AI_HOST})
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600">
            <span>
              Total: <span className="font-semibold text-zinc-900">{totalScreens}</span>
            </span>
            <span className="h-3 w-px bg-zinc-200" />
            <span>
              Active: <span className="font-semibold text-emerald-700">{activeScreens}</span>
            </span>
            <span className="h-3 w-px bg-zinc-200" />
            <span>
              Offline: <span className="font-semibold text-zinc-700">{offlineScreens}</span>
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

      <section className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        <LocalCamera
          userId={laptopCameraId}
          companyId={companyId || ""}
          cameraName="Laptop Camera"
          onActiveChange={setLaptopActive}
        />

        {cams.map((camera) => {
          const attendanceEnabled =
            attendanceEnabledByCamId[camera.id] ?? Boolean(camera.attendance);
          const streamUrl = attendanceEnabled
            ? `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
                camera.id,
              )}/${encodeURIComponent(camera.name)}${streamQuery}`
            : `${AI_HOST}/camera/stream/${encodeURIComponent(camera.id)}`;

          return (
          <CameraMonitorCard
            key={camera.id}
            camera={camera}
            streamUrl={streamUrl}
            busy={actionCamId === camera.id}
            attendanceEnabled={attendanceEnabled}
            attendanceBusy={attendanceActionCamId === camera.id}
            onStart={startCamera}
            onStop={stopCamera}
            onEnableAttendance={handleEnableAttendance}
            onDisableAttendance={handleDisableAttendance}
          />
          );
        })}
      </section>
    </div>
  );
}
