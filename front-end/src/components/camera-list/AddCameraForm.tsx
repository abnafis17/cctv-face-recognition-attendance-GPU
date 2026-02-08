"use client";

import React, { useState } from "react";
import { Plus, Save } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance, { API } from "@/config/axiosInstance";

type Props = {
  onAdded: () => Promise<void> | void;
};

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

const AddCameraForm: React.FC<Props> = ({ onAdded }) => {
  const [camId, setCamId] = useState("");
  const [name, setName] = useState("");
  const [rtspUrl, setRtspUrl] = useState("");
  const [saving, setSaving] = useState(false);

  const clear = () => {
    setCamId("");
    setName("");
    setRtspUrl("");
  };

  const submit = async () => {
    const cameraName = name.trim();
    const url = rtspUrl.trim();

    if (!cameraName || !url) {
      toast.error("Camera Name and RTSP URL are required");
      return;
    }

    try {
      setSaving(true);
      await axiosInstance.post(API.CAMERAS, {
        camId: camId.trim() ? camId.trim() : undefined,
        name: cameraName,
        rtspUrl: url,
      });
      toast.success("Camera added successfully");
      clear();
      await onAdded();
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to add camera"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">Add New Camera</h2>
          <p className="text-sm text-zinc-500">
            Create CCTV camera entries here, then monitor live from Camera Control Panel.
          </p>
        </div>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
          <Plus className="mr-1 h-3.5 w-3.5" />
          Camera Registration
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <input
          value={camId}
          onChange={(event) => setCamId(event.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="Camera ID (optional, e.g. gate-1)"
        />
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="rounded-lg border px-3 py-2 text-sm"
          placeholder="Camera Name"
        />
        <input
          value={rtspUrl}
          onChange={(event) => setRtspUrl(event.target.value)}
          className="rounded-lg border px-3 py-2 font-mono text-sm"
          placeholder="RTSP URL (rtsp://user:pass@ip:554/...)"
        />
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={clear}
          disabled={saving}
          className="rounded-lg border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={saving || !name.trim() || !rtspUrl.trim()}
          className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Adding..." : "Add Camera"}
        </button>
      </div>
    </section>
  );
};

export default AddCameraForm;
