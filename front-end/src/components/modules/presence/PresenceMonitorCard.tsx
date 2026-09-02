"use client";

import React, { useEffect, useRef, useState } from "react";
import { MoreHorizontal } from "lucide-react";

import type { Camera } from "@/types";
import { cn } from "@/lib/utils";
import { useMjpegStream } from "@/hooks/useMjpegStream";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

const FIRST_FRAME_DETECT_WINDOW_MS = 20000;

type PresenceMonitorCardProps = {
  camera: Camera;
  streamUrl: string;
  busy?: boolean;
  className?: string;
  isFullscreen?: boolean;
  fillContainer?: boolean;
  onScreenDoubleClick?: () => void;
  onStart: (camera: Camera) => void;
  onStop: (camera: Camera) => void;
};

const PresenceMonitorCard: React.FC<PresenceMonitorCardProps> = ({
  camera,
  streamUrl,
  busy = false,
  className,
  isFullscreen = false,
  fillContainer = false,
  onScreenDoubleClick,
  onStart,
  onStop,
}) => {
  const active = Boolean(camera.isActive);
  const [actionsOpen, setActionsOpen] = useState(false);

  const {
    streamSrc,
    streamHasFrame,
    streamRetries,
    imgKey,
    onFrame,
    onError,
  } = useMjpegStream({
    streamUrl,
    enabled: active,
  });

  const shouldRenderStream = active && Boolean(streamSrc);
  const shouldFillFrame = isFullscreen || fillContainer;
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!shouldRenderStream) return;

    const img = imgRef.current;
    if (!img) return;

    return () => {
      try {
        img.src = "about:blank";
      } catch {}
    };
  }, [imgKey, shouldRenderStream]);

  useEffect(() => {
    if (!shouldRenderStream) return;

    let raf = 0;
    const deadline = window.performance.now() + FIRST_FRAME_DETECT_WINDOW_MS;

    const check = () => {
      const img = imgRef.current;
      if (img && img.naturalWidth > 0 && img.naturalHeight > 0) {
        onFrame();
        return;
      }
      if (window.performance.now() < deadline) {
        raf = window.requestAnimationFrame(check);
      }
    };

    raf = window.requestAnimationFrame(check);
    return () => window.cancelAnimationFrame(raf);
  }, [imgKey, onFrame, shouldRenderStream]);

  return (
    <article
      className={cn(
        "self-start overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-sm",
        shouldFillFrame && "flex h-full flex-col",
        className,
      )}
    >
      <div
        onDoubleClick={onScreenDoubleClick}
        title={
          onScreenDoubleClick
            ? isFullscreen
              ? "Double-click to exit full screen"
              : "Double-click to view full screen"
            : undefined
        }
        className={cn(
          "relative w-full overflow-hidden",
          shouldFillFrame && "flex-1",
          isFullscreen ? "cursor-zoom-out" : "cursor-zoom-in",
          streamHasFrame ? "bg-zinc-950" : "bg-zinc-100",
        )}
      >
        <div className={cn("w-full", shouldFillFrame ? "h-full" : "aspect-video")}>
          {shouldRenderStream ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={imgKey}
                ref={imgRef}
                src={streamSrc}
                alt={`Presence stream for ${camera.name}`}
                className="h-full w-full object-cover object-center"
                width={1280}
                height={720}
                onLoad={onFrame}
                onError={onError}
              />
              {!streamHasFrame ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  {streamRetries > 0 ? "Reconnecting stream..." : "Loading stream..."}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Camera OFF
            </div>
          )}
        </div>

        <div
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white",
            active ? "bg-red-600/90" : "bg-black/70",
          )}
        >
          {active ? "LIVE" : "OFFLINE"}
        </div>
        {streamHasFrame ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
      </div>

      {!isFullscreen ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
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
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </article>
  );
};

export default PresenceMonitorCard;
