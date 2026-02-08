"use client";

import React from "react";
import { CameraRow, CameraUpdatePayload } from "./types";
import { clampInt, isVirtualLaptopCamera } from "./utils";

type Props = {
  selectedCamera: CameraRow | null;
  setSelectedCamera: React.Dispatch<React.SetStateAction<CameraRow | null>>;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: CameraUpdatePayload) => void;
};

function toNullableTrimmed(value: string): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

const CameraEditForm: React.FC<Props> = ({
  selectedCamera,
  setSelectedCamera,
  loading,
  onClose,
  onSave,
}) => {
  if (!selectedCamera) return null;

  const virtualLaptop = isVirtualLaptopCamera(selectedCamera);

  const setTextField =
    (field: keyof CameraRow) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = event.target.value;
      setSelectedCamera((prev) => (prev ? { ...prev, [field]: value } : prev));
    };

  const setNumberField =
    (field: keyof CameraRow, min: number, max: number) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const value = Number(event.target.value);
      const safe = clampInt(Number.isFinite(value) ? value : min, min, max);
      setSelectedCamera((prev) => (prev ? { ...prev, [field]: safe } : prev));
    };

  const submit = () => {
    const payload: CameraUpdatePayload = {
      camId: virtualLaptop
        ? selectedCamera.camId
        : toNullableTrimmed(selectedCamera.camId ?? ""),
      name: selectedCamera.name.trim(),
      rtspUrl: toNullableTrimmed(selectedCamera.rtspUrl ?? ""),
      relayAgentId: toNullableTrimmed(selectedCamera.relayAgentId ?? ""),
      sendFps: clampInt(selectedCamera.sendFps, 1, 30),
      sendWidth: clampInt(selectedCamera.sendWidth, 160, 3840),
      sendHeight: clampInt(selectedCamera.sendHeight, 120, 2160),
      jpegQuality: clampInt(selectedCamera.jpegQuality, 1, 100),
      isActive: Boolean(selectedCamera.isActive),
    };

    onSave(payload);
  };

  return (
    <div className="space-y-4">
      {virtualLaptop ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This is the company default laptop camera. Camera ID is locked for safety.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-sm font-medium">Camera Name</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.name}
            onChange={setTextField("name")}
            placeholder="Camera Name"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Camera ID (Public)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500"
            value={selectedCamera.camId ?? ""}
            onChange={setTextField("camId")}
            placeholder="cam-gate-1"
            disabled={virtualLaptop}
          />
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium">RTSP URL</label>
          <input
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm"
            value={selectedCamera.rtspUrl ?? ""}
            onChange={setTextField("rtspUrl")}
            placeholder="rtsp://user:pass@ip:554/stream"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Relay Agent ID</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.relayAgentId ?? ""}
            onChange={setTextField("relayAgentId")}
            placeholder="Optional relay agent id"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">JPEG Quality (1-100)</label>
          <input
            type="number"
            min={1}
            max={100}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.jpegQuality}
            onChange={setNumberField("jpegQuality", 1, 100)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Send FPS (1-30)</label>
          <input
            type="number"
            min={1}
            max={30}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.sendFps}
            onChange={setNumberField("sendFps", 1, 30)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Send Width</label>
          <input
            type="number"
            min={160}
            max={3840}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.sendWidth}
            onChange={setNumberField("sendWidth", 160, 3840)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium">Send Height</label>
          <input
            type="number"
            min={120}
            max={2160}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            value={selectedCamera.sendHeight}
            onChange={setNumberField("sendHeight", 120, 2160)}
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <button
          className="rounded-lg border px-4 py-2 text-sm"
          onClick={onClose}
          type="button"
          disabled={loading}
        >
          Cancel
        </button>

        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loading || !selectedCamera.name.trim()}
          onClick={submit}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default CameraEditForm;
