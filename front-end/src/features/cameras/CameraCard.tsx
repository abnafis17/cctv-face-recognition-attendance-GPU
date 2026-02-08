"use client";

import { Camera } from "@/types";
import { postJSON } from "@/lib/api";

export default function CameraCard({
  camera,
  aiPublicBase,
  onChanged,
}: {
  camera: Camera;
  aiPublicBase: string;
  onChanged: () => void;
}) {
  async function start() {
    await postJSON(`/cameras/${camera.id}/start`);
    onChanged();
  }

  async function stop() {
    await postJSON(`/cameras/${camera.id}/stop`);
    onChanged();
  }

  const streamUrl = `${aiPublicBase}/camera/stream/${camera.id}`;

  return (
    <div className="rounded-xl border bg-white p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-semibold">{camera.name}</div>
          <div className="text-xs text-gray-500">{camera.id}</div>
        </div>

        <div className="flex gap-2">
          {camera.isActive ? (
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={stop}
            >
              Stop
            </button>
          ) : (
            <button
              className="rounded-md border px-3 py-1 text-sm"
              onClick={start}
            >
              Start
            </button>
          )}
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border bg-gray-100">
        {camera.isActive ? (
          // MJPEG stream (not compatible with next/image optimizations)
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamUrl}
            alt={`${camera.name} stream`}
            className="h-64 w-full object-cover"
          />
        ) : (
          <div className="flex h-64 items-center justify-center text-sm text-gray-600">
            Camera OFF
          </div>
        )}
      </div>
    </div>
  );
}
