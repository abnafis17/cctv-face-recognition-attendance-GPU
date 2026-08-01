"use client";

import { useCallback, useEffect, useState } from "react";
import axiosInstance from "@/config/axiosInstance";
import AutoEnrollment from "@/components/modules/auto-enrollment/AutoEnrollment";
import { useSearchParams } from "next/navigation";

type Camera = {
  id: string;
  name?: string;
  isActive?: boolean;
};

import { UserPlus, RefreshCw } from "lucide-react";

export default function EnrollmentPage() {
  const searchParams = useSearchParams();
  const [cams, setCams] = useState<Camera[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);

  const initialEmployeeId = String(searchParams.get("employeeId") ?? "").trim();
  const initialName = String(searchParams.get("name") ?? "").trim();
  const reEnroll = ["1", "true", "yes", "on"].includes(
    String(searchParams.get("reEnroll") ?? "")
      .trim()
      .toLowerCase(),
  );

  const loadCameras = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const res = await axiosInstance.get<Camera[]>("/cameras");
      setCams(res.data || []);
    } catch (e: any) {
      setErr(
        e?.response?.data?.message || e?.message || "Failed to load cameras",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCameras();
  }, [loadCameras]);

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white shadow-sm">
            <UserPlus className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900">
                {reEnroll
                  ? "Employee Face Re-enrollment"
                  : "Employee Auto Enrollment"}
              </h1>
              <span className="inline-flex items-center rounded-full bg-purple-100 border border-purple-200 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 uppercase tracking-wide">
                AUTO CAPTURE
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Auto-capture: front, right, left, up, down, and blink to automatically save the face template.
            </p>
          </div>
        </div>

        <button
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-300 bg-white px-4 py-2 text-xs font-bold text-gray-700 tracking-wider uppercase hover:bg-gray-50 transition-colors shadow-sm disabled:opacity-50"
          onClick={loadCameras}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          {loading ? "REFRESHING..." : "REFRESH CAMERAS"}
        </button>
      </div>

      {err ? (
        <div className="mb-3 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <AutoEnrollment
        cameras={cams}
        loadCameras={loadCameras}
        initialEmployeeId={initialEmployeeId}
        initialName={initialName}
        reEnroll={reEnroll}
      />
    </div>
  );
}
