"use client";

import { useEffect, useRef, useState } from "react";
import axiosInstance, { AI_HOST } from "@/config/axiosInstance";
import type { Camera } from "@/types";
import Image from "next/image";

export default function CamerasPage() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState<string>("");

  // Add camera form
  const [newId, setNewId] = useState("");
  const [newName, setNewName] = useState("");
  const [newUrl, setNewUrl] = useState("");

  // prevent overlapping loads
  const inFlightRef = useRef(false);

  // ---------- Shared loader (only for user-triggered refresh) ----------
  async function load() {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      setErr("");
      const response = await axiosInstance.get("/cameras"); // baseURL includes /api
      if (response?.status === 200) setCams((response?.data || []) as Camera[]);
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to load cameras");
      setErr(msg);
    } finally {
      inFlightRef.current = false;
    }
  }

  // ---------- Initial load ----------
  useEffect(() => {
    let cancelled = false;

    async function fetchCameras() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        setErr("");
        const response = await axiosInstance.get("/cameras");
        if (!cancelled && response?.status === 200) {
          setCams((response?.data || []) as Camera[]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            (e as any)?.response?.data?.message ||
            (e instanceof Error ? e.message : "Failed to load cameras");
          setErr(msg);
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    const first = window.setTimeout(() => fetchCameras(), 0);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, []);

  // ---------- Camera CRUD ----------
  async function addCamera() {
    try {
      setErr("");
      await axiosInstance.post("/cameras", {
        camId: newId.trim() ? newId.trim() : undefined,
        name: newName.trim(),
        rtspUrl: newUrl.trim(),
      });

      setNewId("");
      setNewName("");
      setNewUrl("");

      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to add camera");
      setErr(msg);
    }
  }

  async function startCamera(cam: Camera) {
    try {
      await axiosInstance.post(`/cameras/start/${cam.id}`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to start camera");
      setErr(msg);
    }
  }

  async function stopCamera(cam: Camera) {
    try {
      await axiosInstance.post(`/cameras/stop/${cam.id}`);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to stop camera");
      setErr(msg);
    }
  }

  // ---------- Attendance toggle ----------
  async function enableAttendance(cam: Camera) {
    try {
      await axiosInstance.post("/attendance-control/enable", {
        cameraId: cam.id,
      });
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to enable attendance");
      setErr(msg);
    }
  }

  async function disableAttendance(cam: Camera) {
    try {
      await axiosInstance.post("/attendance-control/disable", {
        cameraId: cam.id,
      });
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to disable attendance");
      setErr(msg);
    }
  }

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
          Laptop camera <b>cam1</b> is created automatically.
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
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {cams.map((c) => (
          <div key={c.id} className="rounded-xl border bg-white p-3 shadow-sm">
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{c.name}</div>
                <div className="text-xs text-gray-500">{c.camId ?? c.id}</div>
                {c.camId ? (
                  <div className="text-[10px] text-gray-400">ID: {c.id}</div>
                ) : null}
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
                    src={`${AI_HOST}/camera/recognition/stream/${c.id}/${c.name}`}
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
