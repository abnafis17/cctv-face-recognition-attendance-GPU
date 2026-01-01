"use client";

import React, { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/config/axiosInstance";
import AutoEnrollment from "@/features/enroll/AutoEnrollment";

type Camera = {
  id: string;
  name?: string;
  isActive?: boolean;
};

export default function Page() {
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const loadCameras = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await axiosInstance.get<Camera[]>("/cameras");
      setCams(res.data || []);
    } catch (e: any) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to load cameras"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  return (
    <div className="p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-lg font-semibold">Employee Auto Enrollment</div>
          <div className="text-xs text-gray-500">
            Auto-capture: front / right / left / up / down / blink → auto-save.
          </div>
        </div>
        <button
          className="rounded-md border bg-white px-3 py-1 text-sm"
          onClick={loadCameras}
          disabled={loading}
        >
          {loading ? "Refreshing..." : "Refresh Cameras"}
        </button>
      </div>

      {err ? (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <AutoEnrollment cameras={cams} loadCameras={loadCameras} />
    </div>
  );
}
