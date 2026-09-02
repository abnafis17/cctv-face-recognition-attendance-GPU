"use client";

import { RefreshCw, Save } from "lucide-react";

import ReusableModal from "@/components/reusable/ReusableModal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AI_HOST } from "@/config/axiosInstance";
import type { Camera } from "@/types";

import BoundingBoxCanvasEditor from "./BoundingBoxCanvasEditor";
import BoundingBoxSidebar from "./BoundingBoxSidebar";
import { useCameraBoundingBoxes } from "./useCameraBoundingBoxes";

type BoundingBoxSetupModalProps = {
  open: boolean;
  camera: Camera | null;
  onClose: () => void;
};

export default function BoundingBoxSetupModal({
  open,
  camera,
  onClose,
}: BoundingBoxSetupModalProps) {
  const {
    loading,
    saving,
    employees,
    boxes,
    selectedBoxId,
    isDirty,
    setSelectedBoxId,
    addBox,
    updateBoxRect,
    updateBoxName,
    updateBoxEmployeeIds,
    removeBox,
    refresh,
    saveBoxes,
  } = useCameraBoundingBoxes({
    camera,
    open,
  });

  const cameraId = String(camera?.id ?? "").trim();
  const streamUrl =
    cameraId && camera?.name
      ? `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(cameraId)}/${encodeURIComponent(camera.name)}`
      : "";

  return (
    <ReusableModal
      open={open}
      onClose={onClose}
      title="Set-up Bounding Boxes"
      description={camera ? `Camera: ${camera.name}` : ""}
      maxWidth="8xl"
      overflowAuto
      maxHeight="max-h-[95vh]"
    >
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline">Boxes: {boxes.length}</Badge>
              <Badge variant="outline">Enrolled: {employees.length}</Badge>
              {isDirty ? <Badge>Unsaved Changes</Badge> : null}
              {camera?.isActive ? (
                <Badge variant="outline">Camera Running</Badge>
              ) : (
                <Badge variant="outline">Camera Offline</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-600">
              Drag on the preview to create a box, adjust it with the corner
              handles, and assign single or multiple employees per box.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={loading || saving || !cameraId}
            >
              <RefreshCw className={loading ? "animate-spin" : ""} />
              Refresh
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void saveBoxes()}
              disabled={loading || saving || !cameraId || !isDirty}
            >
              <Save className="h-4 w-4" />
              {saving ? "Saving..." : "Save Boxes"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_420px]">
          <BoundingBoxCanvasEditor
            cameraName={camera?.name ?? "Camera"}
            streamUrl={streamUrl}
            streamEnabled={Boolean(camera?.isActive)}
            boxes={boxes}
            selectedBoxId={selectedBoxId}
            onSelectBox={setSelectedBoxId}
            onAddBox={addBox}
            onUpdateBoxRect={updateBoxRect}
            onRemoveBox={removeBox}
          />

          <BoundingBoxSidebar
            boxes={boxes}
            employees={employees}
            selectedBoxId={selectedBoxId}
            onSelectBox={setSelectedBoxId}
            onAddBox={() => {
              addBox();
            }}
            onDeleteBox={removeBox}
            onUpdateBoxName={updateBoxName}
            onUpdateBoxEmployeeIds={updateBoxEmployeeIds}
          />
        </div>
      </div>
    </ReusableModal>
  );
}
