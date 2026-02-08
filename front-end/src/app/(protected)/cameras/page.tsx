"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CircleDot,
  ListVideo,
  RefreshCw,
  ShieldCheck,
  Video,
} from "lucide-react";
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
  const [refreshing, setRefreshing] = useState(false);
  const [actionCamId, setActionCamId] = useState<string | null>(null);

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

  const totalScreens = cams.length + 1; // +1 for laptop camera
  const activeScreens = cams.filter((c) => c.isActive).length;
  const offlineScreens = cams.length - activeScreens;

  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : "cmkdpsq300000j7284bwluxh2";

  const refreshCameras = async () => {
    try {
      setRefreshing(true);
      await load();
    } finally {
      setRefreshing(false);
    }
  };

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

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Camera Control Panel</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live CCTV monitor wall with face recognition overlay (AI: {AI_HOST})
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={refreshCameras}
              disabled={refreshing}
              className="inline-flex items-center rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            <Link
              href="/camera-list"
              className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
            >
              <ListVideo className="mr-2 h-4 w-4" />
              Camera List
            </Link>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border bg-zinc-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Total Screens</div>
            <div className="mt-1 text-2xl font-bold text-zinc-900">{totalScreens}</div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-emerald-700">Active Streams</div>
            <div className="mt-1 text-2xl font-bold text-emerald-700">{activeScreens}</div>
          </div>
          <div className="rounded-xl border border-zinc-200 bg-white px-4 py-3">
            <div className="text-xs uppercase tracking-wide text-zinc-500">Offline Streams</div>
            <div className="mt-1 text-2xl font-bold text-zinc-700">{offlineScreens}</div>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-zinc-600">
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 font-medium">
            <Video className="mr-1 h-3.5 w-3.5" />
            Aspect Ratio: 16:9
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 font-medium">
            <ShieldCheck className="mr-1 h-3.5 w-3.5" />
            Attendance Controls Enabled
          </span>
          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 font-medium">
            <CircleDot className="mr-1 h-3.5 w-3.5 text-red-500" />
            CCTV Monitor View
          </span>
        </div>
      </section>

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
        />

        {cams.map((camera) => (
          <CameraMonitorCard
            key={camera.id}
            camera={camera}
            streamUrl={`${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
              camera.id,
            )}/${encodeURIComponent(camera.name)}${streamQuery}`}
            busy={actionCamId === camera.id}
            onStart={startCamera}
            onStop={stopCamera}
            onEnableAttendance={enableAttendance}
            onDisableAttendance={disableAttendance}
          />
        ))}
      </section>
    </div>
  );
}
