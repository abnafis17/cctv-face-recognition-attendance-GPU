import { memo } from "react";
import { cn } from "@/lib/utils";
import { maskRtspUrl } from "@/components/modules/head-count/headcount-utils";
import type { HeadcountCameraOption } from "@/types/headcount-types";

type HeadcountSourcePanelProps = {
  activeSources: number;
  cams: HeadcountCameraOption[];
  offlineSources: number;
  onCameraSelect: (cameraId: string) => void;
  selectedCam: HeadcountCameraOption | null;
  selectedCamId: string;
  selectedCameraActive: boolean;
  selectedCameraName: string;
  totalSources: number;
};

const HeadcountSourcePanel = memo(function HeadcountSourcePanel({
  activeSources,
  cams,
  offlineSources,
  onCameraSelect,
  selectedCam,
  selectedCamId,
  selectedCameraActive,
  selectedCameraName,
  totalSources,
}: HeadcountSourcePanelProps) {
  return (
    <div className="rounded-xl bg-white/90 p-2.5 shadow-sm">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:flex-nowrap xl:overflow-x-auto xl:pb-0.5">
        <div className="shrink-0 text-sm font-semibold text-zinc-900">
          Camera Source
        </div>

        <div className="min-w-0 xl:w-[320px] xl:flex-none">
          <label htmlFor="camera-source-select" className="sr-only">
            Preview source
          </label>
          <select
            id="camera-source-select"
            value={selectedCamId}
            onChange={(event) => onCameraSelect(event.target.value)}
            className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
          >
            <option value="">Laptop Camera (WebRTC)</option>
            {cams.map((camera) => (
              <option
                key={camera.id}
                value={camera.id}
                disabled={
                  Boolean(camera.isActive) && camera.id !== selectedCamId
                }
              >
                {camera.name}
                {camera.isActive ? " (Active)" : ""}
              </option>
            ))}
          </select>
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-3 xl:flex-1 xl:flex-nowrap">
          <span className="inline-flex h-10 min-w-[180px] items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 xl:min-w-0 xl:flex-1">
            <span className="mr-1 text-zinc-500">Source:</span>
            <span className="truncate">{selectedCameraName}</span>
          </span>

          <span
            className={cn(
              "inline-flex h-10 items-center rounded-lg border px-3 text-xs font-semibold",
              selectedCameraActive
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-zinc-200 bg-zinc-50 text-zinc-600",
            )}
          >
            View:
            <span className="ml-1">
              {selectedCameraActive ? "LIVE" : "OFFLINE"}
            </span>
          </span>

          <span className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
            Sources: {totalSources}
          </span>

          <span className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
            Active/Off: {activeSources}/{offlineSources}
          </span>
        </div>
      </div>

      {selectedCam ? (
        <div className="mt-2 rounded-lg bg-zinc-50 px-3 py-1.5">
          <span className="text-[11px] font-medium text-zinc-500">RTSP: </span>
          <span
            className="font-mono text-[11px] text-zinc-700"
            title={selectedCam.rtspUrl ?? ""}
          >
            {maskRtspUrl(selectedCam.rtspUrl)}
          </span>
        </div>
      ) : null}
    </div>
  );
});

HeadcountSourcePanel.displayName = "HeadcountSourcePanel";

export default HeadcountSourcePanel;
