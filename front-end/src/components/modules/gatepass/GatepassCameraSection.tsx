import { Camera, Play, Square, LoaderCircle, VideoOff, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

import CameraMonitorCard from "@/components/modules/cameras-live/CameraMonitorCard";
import LocalCamera from "@/components/CameraComponent";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { GatepassCamera } from "@/types/gatepass-types";

type Props = {
  selectedGatepassCameraId: string;
  gatepassCameras: GatepassCamera[];
  gatepassCamerasLoading: boolean;
  cameraAction: "start" | "stop" | null;
  submitting: boolean;
  selectedGatepassCamera: GatepassCamera | null;
  previewCamera: GatepassCamera | null;
  recognitionStreamUrl: string;
  isSelectedCameraRunning: boolean;
  gatepassCameraError: string;
  directoryError: string;
  panelError: string;
  onCameraChange: (cameraId: string) => Promise<void>;
  onStart: () => Promise<void>;
  onStop: () => Promise<void>;
};

export default function GatepassCameraSection({
  selectedGatepassCameraId,
  gatepassCameras,
  gatepassCamerasLoading,
  cameraAction,
  submitting,
  selectedGatepassCamera,
  previewCamera,
  recognitionStreamUrl,
  isSelectedCameraRunning,
  gatepassCameraError,
  directoryError,
  panelError,
  onCameraChange,
  onStart,
  onStop,
}: Props) {
  const companyId = getCompanyIdFromToken() || undefined;
  const isLaptop =
    previewCamera &&
    (previewCamera.id.startsWith("laptop-") ||
      previewCamera.id === "cmkdpsq300000j7284bwluxh2");

  return (
    <div className={`flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 transition-all duration-300 ${
      isSelectedCameraRunning ? "border-t-emerald-500" : "border-t-zinc-300"
    }`}>
      
      {/* Card Header with Camera Selector and Start/Stop Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-100 bg-zinc-50/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-lg bg-zinc-900/5 flex items-center justify-center">
            <Camera className="h-4 w-4 text-zinc-700" />
          </div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Live Monitor</h2>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          {/* Camera Selection */}
          <div className="w-full sm:w-[220px]">
            <Select
              value={selectedGatepassCameraId}
              onValueChange={(value) => {
                void onCameraChange(value);
              }}
              disabled={
                gatepassCamerasLoading ||
                gatepassCameras.length === 0 ||
                cameraAction !== null
              }
            >
              <SelectTrigger className="h-9 w-full rounded-md border-zinc-200 bg-white text-xs text-zinc-700 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors">
                <SelectValue
                  placeholder={
                    gatepassCamerasLoading
                      ? "Loading cameras..."
                      : "Select gate pass camera"
                  }
                />
              </SelectTrigger>
              <SelectContent align="end">
                {gatepassCameras.map((camera) => (
                  <SelectItem key={camera.id} value={camera.id} className="text-xs">
                    {camera.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Start/Stop Buttons */}
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 flex-1 sm:flex-none px-4 rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm",
                !selectedGatepassCamera || cameraAction !== null || submitting || isSelectedCameraRunning
                  ? "bg-zinc-100 text-zinc-400 cursor-not-allowed border border-zinc-200"
                  : "bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/10"
              )}
              onClick={() => {
                void onStart();
              }}
              disabled={
                !selectedGatepassCamera ||
                cameraAction !== null ||
                submitting ||
                isSelectedCameraRunning
              }
            >
              {cameraAction === "start" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              <span>Start</span>
            </Button>

            <Button
              type="button"
              size="sm"
              className={cn(
                "h-9 flex-1 sm:flex-none px-4 rounded-md flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-all shadow-sm border",
                cameraAction !== null || submitting || !isSelectedCameraRunning
                  ? "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
                  : "bg-rose-600 hover:bg-rose-700 text-white border-rose-600 shadow-rose-600/10"
              )}
              onClick={() => {
                void onStop();
              }}
              disabled={
                cameraAction !== null || submitting || !isSelectedCameraRunning
              }
            >
              {cameraAction === "stop" ? (
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Square className="h-3.5 w-3.5 fill-current" />
              )}
              <span>Stop</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Camera Video Area */}
      <div className="p-4 flex-1 flex flex-col min-h-0 items-center justify-center">
        <div className="relative w-full max-w-[480px] aspect-video overflow-hidden rounded-md border border-zinc-100 bg-zinc-950 shadow-inner flex items-center justify-center mx-auto">
          
          {previewCamera ? (
            <>
              {isSelectedCameraRunning ? (
                // Active Camera Stream
                <div className="absolute inset-0 w-full h-full">
                  {isLaptop ? (
                    <LocalCamera
                      userId={previewCamera.id}
                      companyId={companyId}
                      cameraName={previewCamera.name}
                      active={previewCamera.isActive}
                      showFooter={false}
                      fillContainer
                      objectFit="contain"
                      className="absolute inset-0 border-none shadow-none bg-zinc-950"
                    />
                  ) : (
                    <CameraMonitorCard
                      camera={previewCamera}
                      streamUrl={recognitionStreamUrl}
                      busy={cameraAction !== null}
                      attendanceEnabled={Boolean(previewCamera.attendance)}
                      attendanceBusy={false}
                      showActionMenu={false}
                      showAttendanceActions={false}
                      showFooter={false}
                      fillContainer
                      objectFit="contain"
                      className="absolute inset-0 border-none shadow-none bg-zinc-950"
                      onStart={() => onStart()}
                      onStop={() => onStop()}
                      onEnableAttendance={async () => undefined}
                      onDisableAttendance={async () => undefined}
                    />
                  )}
                  
                  {/* Floating Pulsing LIVE Badge */}
                  <div className="absolute top-4 left-4 z-10 flex items-center gap-2 bg-black/60 backdrop-blur-md border border-white/10 px-3 py-1.5 rounded-full shadow-lg">
                    <span className="h-2 w-2 rounded-full bg-red-500 animate-ping" />
                    <span className="h-2 w-2 rounded-full bg-red-600 absolute left-3" />
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest">LIVE</span>
                    <span className="h-3 w-px bg-white/20 mx-0.5" />
                    <span className="text-[10px] font-medium text-zinc-300 truncate max-w-[120px]">
                      {previewCamera.name}
                    </span>
                  </div>
                </div>
              ) : (
                // Camera selected but not running (Offline state)
                <div className="flex flex-col items-center text-center gap-4 p-6 select-none z-10">
                  <div className="relative flex items-center justify-center">
                    <div className="absolute h-16 w-16 rounded-full bg-zinc-800/40 animate-pulse border border-zinc-700/30" />
                    <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800 shadow-lg">
                      <Camera className="h-5 w-5 text-zinc-400" />
                    </div>
                  </div>
                  <div className="space-y-1 max-w-[280px]">
                    <h3 className="text-sm font-semibold text-zinc-200">Camera Standby</h3>
                    <p className="text-xs text-zinc-400">
                      Camera <strong>{previewCamera.name}</strong> is ready. Click the <strong className="text-zinc-200">Start</strong> button to begin face recognition.
                    </p>
                  </div>
                </div>
              )}
            </>
          ) : (
            // No camera found
            <div className="flex flex-col items-center text-center gap-4 p-6 select-none z-10">
              <div className="h-12 w-12 rounded-full bg-zinc-900 flex items-center justify-center border border-zinc-800">
                <VideoOff className="h-5 w-5 text-zinc-500" />
              </div>
              <div className="space-y-1 max-w-[260px]">
                <h3 className="text-sm font-semibold text-zinc-300">No Camera Configured</h3>
                <p className="text-xs text-zinc-500">
                  There are no gate pass cameras configured in your system yet.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Error notifications */}
        {(gatepassCameraError || directoryError || panelError) && (
          <div className="space-y-2 mt-4">
            {gatepassCameraError && (
              <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50/50 px-3.5 py-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold">Camera Error</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-relaxed">{gatepassCameraError}</div>
                </div>
              </div>
            )}
            {directoryError && (
              <div className="flex items-start gap-2 rounded-md border border-amber-100 bg-amber-50/50 px-3.5 py-2.5 text-xs text-amber-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="font-bold">Directory Config Error</div>
                  <div className="mt-0.5 text-[11px] font-medium leading-relaxed">{directoryError}</div>
                </div>
              </div>
            )}
            {panelError && (
              <div className="flex items-start gap-2 rounded-md border border-red-100 bg-red-50/50 px-3.5 py-2.5 text-xs text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
                <span>{panelError}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
