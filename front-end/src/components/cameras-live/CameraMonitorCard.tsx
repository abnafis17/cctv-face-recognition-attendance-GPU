"use client";

import Image from "next/image";
import type { Camera } from "@/types";

function maskRtspUrl(url?: string | null): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "-";
  const protocolEnd = raw.indexOf("://");
  const atIndex = raw.indexOf("@");
  if (protocolEnd < 0 || atIndex < 0 || atIndex < protocolEnd) return raw;
  const protocol = raw.slice(0, protocolEnd + 3);
  const host = raw.slice(atIndex + 1);
  return `${protocol}***:***@${host}`;
}

type Props = {
  camera: Camera;
  streamUrl: string;
  busy?: boolean;
  onStart: (camera: Camera) => void;
  onStop: (camera: Camera) => void;
  onEnableAttendance: (camera: Camera) => void;
  onDisableAttendance: (camera: Camera) => void;
};

const CameraMonitorCard: React.FC<Props> = ({
  camera,
  streamUrl,
  busy = false,
  onStart,
  onStop,
  onEnableAttendance,
  onDisableAttendance,
}) => {
  const active = Boolean(camera.isActive);

  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">{camera.name}</div>
          <div className="mt-1 truncate font-mono text-[11px] text-zinc-500" title={camera.rtspUrl ?? ""}>
            {maskRtspUrl(camera.rtspUrl)}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => (active ? onStop(camera) : onStart(camera))}
          className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60 ${
            active
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          }`}
        >
          {busy ? "Working..." : active ? "Stop" : "Start"}
        </button>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950">
        <div className="aspect-video w-full">
          {active ? (
            <Image
              src={streamUrl}
              alt={`Camera ${camera.name} Stream`}
              className="h-full w-full object-cover"
              width={1280}
              height={720}
              unoptimized
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-300">
              Camera OFF
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {active ? "LIVE" : "OFFLINE"}
        </div>
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
          onClick={() => onEnableAttendance(camera)}
        >
          Enable Attendance
        </button>
        <button
          type="button"
          className="rounded-lg border border-zinc-300 bg-white px-3 py-1 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
          onClick={() => onDisableAttendance(camera)}
        >
          Disable Attendance
        </button>
      </div>
    </article>
  );
};

export default CameraMonitorCard;
