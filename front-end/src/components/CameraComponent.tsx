import React from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useLocalCamera } from "@/hooks/useLocalCamera";

interface LocalCameraProps {
  userId?: string; // cameraId
  companyId?: string; // for recognition gallery
  cameraName?: string;
  className?: string;
  isFullscreen?: boolean;
  fillContainer?: boolean;
  onScreenDoubleClick?: () => void;
  onActiveChange?: (active: boolean) => void;
  active?: boolean;
  showFooter?: boolean;
  objectFit?: "cover" | "contain";
}

const LocalCamera: React.FC<LocalCameraProps> = ({
  userId,
  companyId,
  cameraName = "Laptop Camera",
  className,
  isFullscreen = false,
  fillContainer = false,
  onScreenDoubleClick,
  onActiveChange,
  active,
  showFooter = true,
  objectFit = "cover",
}) => {
  const {
    localActive,
    wsError,
    recUrl,
    localVideoRef,
    recognitionImgRef,
    startLocalCamera,
    stopLocalCamera,
    actionsOpen,
    setActionsOpen,
  } = useLocalCamera({
    userId,
    companyId,
    cameraName,
    onActiveChange,
    active,
  });

  const shouldFillFrame = isFullscreen || fillContainer;

  return (
    <article
      className={cn(
        "self-start overflow-hidden rounded-sm border border-zinc-200 bg-white shadow-sm",
        shouldFillFrame && "flex h-full flex-col",
        className
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
          localActive ? "bg-zinc-950" : "bg-zinc-100"
        )}
      >
        <div className={cn("w-full", shouldFillFrame ? "h-full" : "aspect-video")}>
          {localActive ? (
            // MJPEG stream (not compatible with next/image optimizations)
            // eslint-disable-next-line @next/next/no-img-element
            <img
              ref={recognitionImgRef}
              src={recUrl}
              alt="Recognition stream"
              className={cn(
                "h-full w-full",
                objectFit === "contain"
                  ? "object-contain object-center"
                  : "object-cover object-top-left"
              )}
              width={1280}
              height={720}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Start camera to view recognition overlay
            </div>
          )}
        </div>
        <video ref={localVideoRef} className="hidden" muted playsInline aria-hidden="true" />
        <div
          className={cn(
            "pointer-events-none absolute right-2 top-2 rounded-md px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white",
            localActive ? "bg-red-600/90" : "bg-black/70"
          )}
        >
          {localActive ? "LIVE" : "OFFLINE"}
        </div>
        {localActive ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
        {wsError ? (
          <div className="absolute bottom-2 left-2 rounded-md border border-red-300 bg-red-50/95 px-2 py-1 text-[11px] text-red-700">
            {wsError}
          </div>
        ) : null}
      </div>

      {!isFullscreen && showFooter ? (
        <div className="flex items-center justify-between gap-2 px-2.5 py-2">
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-zinc-900">{cameraName}</div>
          </div>

          <Popover open={actionsOpen} onOpenChange={setActionsOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200 text-zinc-600 transition hover:bg-zinc-100"
                aria-label={`Actions for ${cameraName}`}
              >
                <MoreHorizontal className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-48 p-1">
              <button
                type="button"
                onClick={() => {
                  setActionsOpen(false);
                  if (localActive) stopLocalCamera();
                  else startLocalCamera();
                }}
                className={`flex w-full items-center rounded-md px-2.5 py-2 text-left text-xs font-medium transition ${
                  localActive ? "text-red-700 hover:bg-red-50" : "text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {localActive ? "Stop" : "Start"}
              </button>
            </PopoverContent>
          </Popover>
        </div>
      ) : null}
    </article>
  );
};

export default LocalCamera;
