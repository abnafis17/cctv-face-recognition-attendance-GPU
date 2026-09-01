"use client";

import React, { useEffect, useState } from "react";
import { CameraRow, CameraUpdatePayload } from "./types";
import { clampInt, isVirtualLaptopCamera } from "./utils";
import { CAMERA_TASK_OPTIONS, DEFAULT_CAMERA_TASK } from "./taskOptions";

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

function parseNumber(
  val: string | number,
  min: number,
  max: number,
  fallback: number
): number {
  const str = String(val ?? "").trim();
  if (!str) return fallback;
  const n = Number(str);
  if (!Number.isFinite(n)) return fallback;
  return clampInt(n, min, max);
}

const RESOLUTION_PRESETS = [
  { label: "1080p (1920×1080)", width: 1920, height: 1080 },
  { label: "720p (1280×720)", width: 1280, height: 720 },
  { label: "360p (640×360)", width: 640, height: 360 },
];

const CameraEditForm: React.FC<Props> = ({
  selectedCamera,
  setSelectedCamera,
  loading,
  onClose,
  onSave,
}) => {
  // Local state for free typing and clearing without destructive per-keystroke clamping
  const [name, setName] = useState(selectedCamera?.name ?? "");
  const [camId, setCamId] = useState(selectedCamera?.camId ?? "");
  const [task, setTask] = useState(selectedCamera?.task ?? DEFAULT_CAMERA_TASK);
  const [rtspUrl, setRtspUrl] = useState(selectedCamera?.rtspUrl ?? "");
  const [relayAgentId, setRelayAgentId] = useState(selectedCamera?.relayAgentId ?? "");
  const [jpegQuality, setJpegQuality] = useState<string>(
    String(selectedCamera?.jpegQuality ?? 70)
  );
  const [sendFps, setSendFps] = useState<string>(
    String(selectedCamera?.sendFps ?? 2)
  );
  const [sendWidth, setSendWidth] = useState<string>(
    String(selectedCamera?.sendWidth ?? 640)
  );
  const [sendHeight, setSendHeight] = useState<string>(
    String(selectedCamera?.sendHeight ?? 360)
  );

  // Sync state if selected camera changes externally
  useEffect(() => {
    if (selectedCamera) {
      setName(selectedCamera.name ?? "");
      setCamId(selectedCamera.camId ?? "");
      setTask(selectedCamera.task ?? DEFAULT_CAMERA_TASK);
      setRtspUrl(selectedCamera.rtspUrl ?? "");
      setRelayAgentId(selectedCamera.relayAgentId ?? "");
      setJpegQuality(String(selectedCamera.jpegQuality ?? 70));
      setSendFps(String(selectedCamera.sendFps ?? 2));
      setSendWidth(String(selectedCamera.sendWidth ?? 640));
      setSendHeight(String(selectedCamera.sendHeight ?? 360));
    }
  }, [selectedCamera]);

  if (!selectedCamera) return null;

  const virtualLaptop = isVirtualLaptopCamera(selectedCamera);

  const applyPreset = (width: number, height: number) => {
    setSendWidth(String(width));
    setSendHeight(String(height));
  };

  const handleBlurNumber = (
    value: string,
    setter: (v: string) => void,
    min: number,
    max: number,
    fallback: number
  ) => {
    const trimmed = value.trim();
    if (!trimmed) {
      setter(String(fallback));
      return;
    }
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      setter(String(fallback));
      return;
    }
    setter(String(clampInt(num, min, max)));
  };

  const submit = () => {
    const finalFps = parseNumber(sendFps, 1, 30, 2);
    const finalWidth = parseNumber(sendWidth, 160, 3840, 640);
    const finalHeight = parseNumber(sendHeight, 120, 2160, 360);
    const finalQuality = parseNumber(jpegQuality, 1, 100, 70);

    const payload: CameraUpdatePayload = {
      camId: virtualLaptop
        ? selectedCamera.camId
        : toNullableTrimmed(camId),
      name: name.trim(),
      rtspUrl: toNullableTrimmed(rtspUrl),
      task: toNullableTrimmed(task) ?? DEFAULT_CAMERA_TASK,
      relayAgentId: toNullableTrimmed(relayAgentId),
      sendFps: finalFps,
      sendWidth: finalWidth,
      sendHeight: finalHeight,
      jpegQuality: finalQuality,
      isActive: Boolean(selectedCamera.isActive),
    };

    // Update parent state so any local references stay in sync
    setSelectedCamera((prev) =>
      prev
        ? {
            ...prev,
            ...payload,
            name: payload.name ?? prev.name,
            task: payload.task ?? prev.task,
            sendFps: finalFps,
            sendWidth: finalWidth,
            sendHeight: finalHeight,
            jpegQuality: finalQuality,
          }
        : prev
    );

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
          <label className="text-sm font-medium text-zinc-700">Camera Name</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Camera Name"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Camera ID (Public)</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-zinc-50 disabled:text-zinc-500 focus:border-zinc-800 focus:outline-none"
            value={camId}
            onChange={(e) => setCamId(e.target.value)}
            placeholder="cam-gate-1"
            disabled={virtualLaptop}
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Task</label>
          <select
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={task}
            onChange={(e) => setTask(e.target.value)}
          >
            {CAMERA_TASK_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1 md:col-span-2">
          <label className="text-sm font-medium text-zinc-700">RTSP URL</label>
          <input
            className="w-full rounded-lg border px-3 py-2 font-mono text-sm focus:border-zinc-800 focus:outline-none"
            value={rtspUrl}
            onChange={(e) => setRtspUrl(e.target.value)}
            placeholder="rtsp://user:pass@ip:554/stream"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Relay Agent ID</label>
          <input
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={relayAgentId}
            onChange={(e) => setRelayAgentId(e.target.value)}
            placeholder="Optional relay agent id"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">JPEG Quality (1-100)</label>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={jpegQuality}
            onChange={(e) => setJpegQuality(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => handleBlurNumber(jpegQuality, setJpegQuality, 1, 100, 70)}
            placeholder="70"
          />
        </div>

        <div className="space-y-1">
          <label className="text-sm font-medium text-zinc-700">Send FPS (1-30)</label>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={sendFps}
            onChange={(e) => setSendFps(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => handleBlurNumber(sendFps, setSendFps, 1, 30, 2)}
            placeholder="2"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700">Send Width (px)</label>
            <span className="text-[11px] text-zinc-400">160 - 3840</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={sendWidth}
            onChange={(e) => setSendWidth(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => handleBlurNumber(sendWidth, setSendWidth, 160, 3840, 640)}
            placeholder="640"
          />
        </div>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-zinc-700">Send Height (px)</label>
            <span className="text-[11px] text-zinc-400">120 - 2160</span>
          </div>
          <input
            type="text"
            inputMode="numeric"
            className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-800 focus:outline-none"
            value={sendHeight}
            onChange={(e) => setSendHeight(e.target.value.replace(/[^0-9]/g, ""))}
            onBlur={() => handleBlurNumber(sendHeight, setSendHeight, 120, 2160, 360)}
            placeholder="360"
          />
        </div>
      </div>

      {/* Resolution Quick Presets */}
      <div className="rounded-lg border bg-zinc-50 p-3">
        <div className="mb-2 text-xs font-medium text-zinc-600">Quick Resolution Presets:</div>
        <div className="flex flex-wrap gap-2">
          {RESOLUTION_PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.width, preset.height)}
              className="rounded-md border bg-white px-2.5 py-1 text-xs font-medium text-zinc-700 hover:border-zinc-400 hover:bg-zinc-100 transition-colors"
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t pt-3">
        <button
          className="rounded-lg border px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 transition-colors"
          onClick={onClose}
          type="button"
          disabled={loading}
        >
          Cancel
        </button>

        <button
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 transition-colors"
          type="button"
          disabled={loading || !name.trim()}
          onClick={submit}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default CameraEditForm;
