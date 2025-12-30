"use client";

import { useEffect, useState } from "react";
import { fetchJSON, postJSON } from "@/lib/api";
import type { Camera } from "@/types";
import Image from "next/image";

export default function CamerasPage() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState<string>("");

  // Add camera form
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  const aiBase = process.env.NEXT_PUBLIC_AI_URL || "http://127.0.0.1:8000";

  // ---------- Shared loader (only for user-triggered refresh) ----------
  async function load() {
    try {
      setErr("");
      const list = await fetchJSON<Camera[]>("/api/cameras");
      setCams(list);
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load cameras");
    }
  }

  // ---------- Initial load (recommended effect pattern) ----------
  useEffect(() => {
    let cancelled = false;

    async function fetchCameras() {
      try {
        setErr("");
        const list = await fetchJSON<Camera[]>("/api/cameras");
        if (!cancelled) setCams(list);
      } catch (e: unknown) {
        if (!cancelled) {
          setErr(e instanceof Error ? e.message : "Failed to load cameras");
        }
      }
    }

    fetchCameras();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---------- Camera CRUD ----------
  async function addCamera() {
    try {
      setErr("");
      await postJSON("/api/cameras", {
        id: newId,
        name: newName,
        rtspUrl: newUrl,
      });

      setNewId("");
      setNewName("");
      setNewUrl("");

      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to add camera");
    }
  }

  async function startCamera(cam: Camera) {
    try {
      await postJSON(`/api/cameras/${cam.id}/start`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to start camera");
    }
  }

  async function stopCamera(cam: Camera) {
    try {
      await postJSON(`/api/cameras/${cam.id}/stop`);
      await load();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to stop camera");
    }
  }

  // ---------- Attendance toggle ----------
  async function enableAttendance(cam: Camera) {
    try {
      await postJSON("/api/attendance-control/enable", {
        cameraId: cam.id,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to enable attendance");
    }
  }

  async function disableAttendance(cam: Camera) {
    try {
      await postJSON("/api/attendance-control/disable", {
        cameraId: cam.id,
      });
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to disable attendance");
    }
  }

  return (
    <div>
      {/* Header */}
      <h1 className="text-2xl font-bold">Camera Control Panel</h1>
      <p className="mt-1 text-sm text-gray-500">
        Live face recognition + attendance (AI: {aiBase})
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
          Laptop camera <b>cam1</b> is created automatically.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
          <input
            className="rounded-md border px-3 py-2 text-sm"
            placeholder="Camera ID (ex: cam2)"
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
          disabled={!newId || !newName || !newUrl}
        >
          Add Camera
        </button>
      </div>

      {/* Camera Grid */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cams.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-3 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-gray-500">{c.id}</div>
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
                    src={`${aiBase}/camera/recognition/stream/${c.id}`}
                    alt={`Camera ${c.name} Stream`}
                    className="w-full h-full object-cover"
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
