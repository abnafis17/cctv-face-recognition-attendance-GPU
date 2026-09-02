"use client";

import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { maskRtspUrl } from "@/components/modules/head-count/headcount-utils";
import type { HeadcountCameraOption } from "@/types/headcount-types";

type HeadcountRemoteCameraPreviewProps = {
  camera: HeadcountCameraOption;
  streamUrl: string;
  busy: boolean;
  onStart: (cameraId: string) => void;
  onStop: (cameraId: string) => void;
  className?: string;
  viewportClassName?: string;
  fillHeight?: boolean;
};

const HeadcountRemoteCameraPreview = memo(
  function HeadcountRemoteCameraPreview({
    camera,
    streamUrl,
    busy,
    onStart,
    onStop,
    className,
    viewportClassName,
    fillHeight = false,
  }: HeadcountRemoteCameraPreviewProps) {
    const active = Boolean(camera.isActive);
    const [streamHasFrame, setStreamHasFrame] = useState(false);

    useEffect(() => {
      setStreamHasFrame(false);
    }, [active, streamUrl]);

    return (
      <article
        className={cn(
          "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition",
          fillHeight && "flex flex-col xl:h-full",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">
              {camera.name}
            </div>
            <div
              className="mt-1 truncate font-mono text-[11px] text-zinc-500"
              title={camera.rtspUrl ?? ""}
            >
              {maskRtspUrl(camera.rtspUrl)}
            </div>
          </div>

          <button
            type="button"
            disabled={busy}
            onClick={() => (active ? onStop(camera.id) : onStart(camera.id))}
            className={cn(
              "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
              active
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
                : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
            )}
          >
            {busy ? "Working..." : active ? "Stop" : "Start"}
          </button>
        </div>

        <div
          className={cn(
            "relative mt-3 overflow-hidden rounded-xl border border-zinc-200",
            fillHeight && "xl:flex-1",
            streamHasFrame ? "bg-zinc-950" : "bg-zinc-100",
          )}
        >
          <div
            className={cn(
              "w-full",
              viewportClassName ||
                (fillHeight
                  ? "aspect-video xl:h-full xl:min-h-[340px] xl:aspect-auto"
                  : "aspect-video"),
            )}
          >
            {active ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={streamUrl}
                  alt={`Camera ${camera.name} stream`}
                  className={cn(
                    "h-full w-full object-cover transition-opacity duration-200",
                    streamHasFrame ? "opacity-100" : "opacity-0",
                  )}
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
                Camera is offline. Start camera to view recognition stream.
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

        <div className="mt-3 flex items-center justify-between gap-2">
          <span className="truncate rounded-md bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-600">
            {camera.id}
          </span>
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold",
              active
                ? "bg-emerald-100 text-emerald-700"
                : "bg-zinc-100 text-zinc-500",
            )}
          >
            {active ? "ACTIVE" : "OFF"}
          </span>
        </div>
      </article>
    );
  },
);

HeadcountRemoteCameraPreview.displayName = "HeadcountRemoteCameraPreview";

export default HeadcountRemoteCameraPreview;
