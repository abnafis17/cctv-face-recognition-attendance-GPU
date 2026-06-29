import { Camera, Clock3, LoaderCircle } from "lucide-react";

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
    <section className="flex min-h-0 min-w-0 flex-col border-b border-zinc-100 bg-white">
      <div className="flex min-h-0 flex-1 flex-col p-3 md:px-5 md:py-4">
        
        {/* Centered camera block with standard size */}
        <div className="flex w-full justify-center">
          <div className="flex flex-col w-full max-w-[588px]">
            
            {/* Row with controls left and video preview right */}
            <div className="flex items-end gap-3 w-full">
              
              {/* Left Portion: Dropdown + Camera Preview */}
              <div className="flex-1 flex flex-col gap-2 min-w-0">
                {/* Camera Selection */}
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                    Select Camera
                  </label>
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
                    <SelectTrigger className="h-9 w-full rounded-xl border-zinc-200 bg-white text-sm text-zinc-800 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors">
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
                </div>

                {/* Camera Video Preview */}
                <div className="w-full">
                  {previewCamera ? (
                    <div className="w-full aspect-video overflow-hidden rounded-2xl border border-zinc-100 bg-zinc-50/40 p-1.5">
                      {isLaptop ? (
                        <LocalCamera
                          userId={previewCamera.id}
                          companyId={companyId}
                          cameraName={previewCamera.name}
                          active={previewCamera.isActive}
                          showFooter={false}
                          fillContainer
                          objectFit="contain"
                          className="h-full w-full rounded-[14px] border-zinc-200 shadow-none"
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
                          className="h-full w-full rounded-[14px] border-zinc-200 shadow-none"
                          onStart={() => onStart()}
                          onStop={() => onStop()}
                          onEnableAttendance={async () => undefined}
                          onDisableAttendance={async () => undefined}
                        />
                      )}
                    </div>
                  ) : (
                    <div className="flex aspect-video w-full items-center justify-center rounded-2xl border border-dashed border-zinc-200 bg-zinc-50/60 px-4 text-center text-sm text-zinc-500">
                      No gatepass camera found.
                    </div>
                  )}
                </div>
              </div>

              {/* Right Portion: Start & Stop buttons stacked vertically, bottom aligned */}
              <div className="flex flex-col gap-2 shrink-0 pb-1.5">
                <Button
                  type="button"
                  className="h-9 w-24 rounded-xl bg-zinc-900 text-white hover:bg-zinc-800 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-all"
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
                    <Camera className="h-3.5 w-3.5" />
                  )}
                  <span>Start</span>
                </Button>

                <Button
                  type="button"
                  variant="outline"
                  className="h-9 w-24 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-1.5 text-xs font-semibold uppercase tracking-wider transition-all"
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
                    <Clock3 className="h-3.5 w-3.5" />
                  )}
                  <span>Stop</span>
                </Button>
              </div>

            </div>

            {/* Error notifications */}
            <div className="space-y-1.5 w-full mt-3">
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

          </div>
        </div>
      </div>
    </section>
  );
}
