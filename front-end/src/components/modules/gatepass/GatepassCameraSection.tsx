import { Camera, Clock3, LoaderCircle } from "lucide-react";

import CameraMonitorCard from "@/components/modules/cameras-live/CameraMonitorCard";
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
  return (
    <section className="flex min-h-0 min-w-0 flex-col border-b border-zinc-100 xl:overflow-y-auto xl:border-b-0 xl:border-r xl:border-r-zinc-100">
      <div className="flex min-h-0 flex-1 flex-col gap-2.5 p-3">
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
          <SelectTrigger className="h-10 w-full rounded-xl border-zinc-100 bg-white text-sm text-zinc-900 shadow-none">
            <SelectValue
              placeholder={
                gatepassCamerasLoading
                  ? "Loading gate pass cameras..."
                  : "Select gate pass camera"
              }
            />
          </SelectTrigger>
          <SelectContent align="start">
            {gatepassCameras.map((camera) => (
              <SelectItem key={camera.id} value={camera.id}>
                {camera.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="min-h-[220px] w-full flex-1 sm:min-h-[240px] xl:min-h-0">
          {previewCamera ? (
            <div className="h-full w-full overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/40 p-1.5">
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
                className="h-full w-full rounded-[14px] border-zinc-200 shadow-none"
                onStart={() => onStart()}
                onStop={() => onStop()}
                onEnableAttendance={async () => undefined}
                onDisableAttendance={async () => undefined}
              />
            </div>
          ) : (
            <div className="flex h-full min-h-[220px] w-full items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 text-center text-sm text-zinc-500 xl:min-h-0">
              No gatepass camera found.
            </div>
          )}
        </div>

        <div className="grid w-full grid-cols-2 gap-2">
          <Button
            type="button"
            className="h-10 flex-1 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 xl:h-9"
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
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Camera className="h-4 w-4" />
            )}
            Start
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1 rounded-xl border-zinc-100 bg-white text-zinc-700 xl:h-9"
            onClick={() => {
              void onStop();
            }}
            disabled={
              cameraAction !== null || submitting || !isSelectedCameraRunning
            }
          >
            {cameraAction === "stop" ? (
              <LoaderCircle className="h-4 w-4 animate-spin" />
            ) : (
              <Clock3 className="h-4 w-4" />
            )}
            Stop
          </Button>
        </div>

        {gatepassCameraError ? (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {gatepassCameraError}
          </div>
        ) : null}

        {directoryError ? (
          <div className="w-full rounded-xl border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-700">
            {directoryError}
          </div>
        ) : null}

        {panelError ? (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 px-2.5 py-2 text-xs text-red-700">
            {panelError}
          </div>
        ) : null}
      </div>
    </section>
  );
}
