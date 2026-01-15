"use client";

import { useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";
import type { Camera } from "@/types";
import Image from "next/image";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useAttendanceVoice } from "@/hooks/useAttendanceVoice";
import { useCameraCrud } from "@/hooks/useCameraCrud";
import { useAttendanceToggle } from "@/hooks/useAttendanceToggle";
import { useCamerasLoader } from "@/hooks/useCamerasLoader";

export default function CamerasPage() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState<string>("");

  // ✅ Voice functionality moved to hook (same behavior as before)
  useAttendanceVoice();

  // Add camera form
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const companyId = getCompanyIdFromToken();
  const streamQuery = companyId
    ? `?companyId=${encodeURIComponent(companyId)}`
    : "";

  // prevent overlapping loads
  // Shared loader (only for user-triggered refresh
  const { load } = useCamerasLoader({ setCams, setErr });

  // Camera CRUD and Start/Stop
  const { addCamera, startCamera, stopCamera } = useCameraCrud({
    newId,
    newName,
    newUrl,
    setNewId,
    setNewName,
    setNewUrl,
    setErr,
    load,
  });

  // ---------- Attendance toggle ----------
  const { enableAttendance, disableAttendance } = useAttendanceToggle({
    setErr,
  });

  return (
    <div>
      {/* Header */}
      <h1 className="text-2xl font-bold">Camera Control Panel</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live face recognition + attendance (AI: {AI_HOST})
      </p>

      {err ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      {/* Add Camera */}
      <div className="mt-6 rounded-xl border bg-white p-4">
        <div className="font-semibold">Add CCTV Camera (RTSP)</div>
        <p className="mt-1 text-xs text-gray-500">
          Add your RTSP camera details to connect a live stream.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Camera ID (optional, ex: cam2)"
            value={newId}
            onChange={(e) => setNewId(e.target.value)}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Camera Name (ex: Gate 1)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
          />
          <input
            className="rounded-md border px-3 py-2 text-sm md:col-span-2"
            placeholder="RTSP URL (rtsp://user:pass@ip:554/...)"
            value={newUrl}
            onChange={(e) => setNewUrl(e.target.value)}
          />
        </div>

        <button
          className="mt-4 rounded-md border px-4 py-2 text-sm"
          onClick={addCamera}
          disabled={!newName.trim() || !newUrl.trim()}
        >
          Add Camera
        </button>
      </div>

      {/* Camera Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cams.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-3 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="mt-1 break-all text-xs text-gray-400">
                  {c.rtspUrl}
                </div>
              </div>

              <div className="flex flex-col gap-2">
                {c.isActive ? (
                  <button
                    className="rounded-md border px-3 py-1 text-sm"
                    onClick={() => stopCamera(c)}
                  >
                    Stop
                  </button>
                ) : (
                  <button
                    className="rounded-md border px-3 py-1 text-sm"
                    onClick={() => startCamera(c)}
                  >
                    Start
                  </button>
                )}
              </div>
            </div>

            {/* Stream */}
            <div className="mt-3 overflow-hidden rounded-lg border bg-gray-100">
              {c.isActive ? (
                <div className="aspect-video w-full">
                  <Image
                    src={`${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
                      c.id
                    )}/${encodeURIComponent(c.name)}${streamQuery}`}
                    alt={`Camera ${c.name} Stream`}
                    className="h-full w-full object-cover"
                    width={1280}
                    height={720}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center text-sm text-gray-600">
                  Camera OFF
                </div>
              )}
            </div>

            {/* Attendance Control */}
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-md border px-3 py-1 text-xs"
                onClick={() => enableAttendance(c)}
              >
                Enable Attendance
              </button>
              <button
                className="rounded-md border px-3 py-1 text-xs"
                onClick={() => disableAttendance(c)}
              >
                Disable Attendance
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
