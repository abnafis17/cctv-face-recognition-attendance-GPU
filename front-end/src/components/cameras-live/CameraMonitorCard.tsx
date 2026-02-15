"use client";

import React, { useEffect, useState } from "react";
import { MoreHorizontal } from "lucide-react";
import type { Camera } from "@/types";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

type Props = {
  camera: Camera;
  streamUrl: string;
  busy?: boolean;
  attendanceEnabled?: boolean;
  attendanceBusy?: boolean;
  onStart: (camera: Camera) => void;
  onStop: (camera: Camera) => void;
  onEnableAttendance: (camera: Camera) => Promise<void> | void;
  onDisableAttendance: (camera: Camera) => Promise<void> | void;
};

const CameraMonitorCard: React.FC<Props> = ({
  camera,
  streamUrl,
  busy = false,
  attendanceEnabled,
  attendanceBusy = false,
  onStart,
  onStop,
  onEnableAttendance,
  onDisableAttendance,
}) => {
  const active = Boolean(camera.isActive);
  const attendanceMode =
    attendanceEnabled === true
      ? "enabled"
      : attendanceEnabled === false
        ? "disabled"
        : "unknown";
  const [streamHasFrame, setStreamHasFrame] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);

  // Reset loading state when camera state/url changes.
  useEffect(() => {
    setStreamHasFrame(false);
  }, [active, streamUrl]);

  return (
    <article className="self-start overflow-hidden rounded-sm border border-zinc-200 bg-white pt-2 shadow-sm">
      <div className="flex items-center justify-between gap-2 px-2.5 pb-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {camera.name}
          </div>
        </div>

        <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100"
              aria-label={`Actions for ${camera.name}`}
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-48 p-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setActionsOpen(false);
                if (active) onStop(camera);
                else onStart(camera);
              }}
              className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                active
                  ? "text-red-700 hover:bg-red-50"
                  : "text-emerald-700 hover:bg-emerald-50"
              }`}
            >
              {busy ? "Working..." : active ? "Stop" : "Start"}
            </button>
            <button
              type="button"
              disabled={attendanceBusy || attendanceMode === "enabled"}
              onClick={() => {
                setActionsOpen(false);
                onEnableAttendance(camera);
              }}
              className={`mt-0.5 flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                attendanceMode === "enabled"
                  ? "text-sky-700"
                  : "text-sky-700 hover:bg-sky-50"
              }`}
            >
              {attendanceBusy ? "Updating..." : "Enable Attendance"}
            </button>
            <button
              type="button"
              disabled={attendanceBusy || attendanceMode === "disabled"}
              onClick={() => {
                setActionsOpen(false);
                onDisableAttendance(camera);
              }}
              className={`mt-0.5 flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
                attendanceMode === "disabled"
                  ? "text-zinc-600"
                  : "text-zinc-700 hover:bg-zinc-100"
              }`}
            >
              {attendanceBusy ? "Updating..." : "Disable Attendance"}
            </button>
          </PopoverContent>
        </Popover>
      </div>

      <div
        className={`relative w-full overflow-hidden ${
          streamHasFrame ? "bg-zinc-950" : "bg-zinc-100"
        }`}
      >
        <div className="aspect-video w-full">
          {active ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={streamUrl}
                alt={`Camera ${camera.name} Stream`}
                className={`h-full w-full object-cover object-left-top transition-opacity duration-200 ${
                  streamHasFrame ? "opacity-100" : "opacity-0"
                }`}
                width={1280}
                height={720}
                onLoad={() => setStreamHasFrame(true)}
                onError={() => setStreamHasFrame(false)}
              />
              {!streamHasFrame ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  Loading stream...
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Camera OFF
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {active ? "LIVE" : "OFFLINE"}
        </div>
        {streamHasFrame ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
      </div>
    </article>
  );
};

export default CameraMonitorCard;
