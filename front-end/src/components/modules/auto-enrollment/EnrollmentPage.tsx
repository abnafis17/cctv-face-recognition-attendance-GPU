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

import { UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";

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
    <div className="flex w-full flex-col gap-4">
      <div className="flex w-full border border-zinc-100 bg-white rounded-md shadow-sm">
        <div className="w-full flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-3">
            <div className="h-10 w-10 rounded-md bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md shadow-violet-500/20">
              <UserPlus className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-zinc-900 tracking-tight">
                  {reEnroll ? "Employee Face Re-enrollment" : "Employee Auto Enrollment"}
                </h1>
                <Badge 
                  variant="outline" 
                  className="rounded-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider bg-violet-50 text-violet-700 border-violet-200"
                >
                  Auto Capture
                </Badge>
              </div>
              <p className="text-xs text-zinc-500 mt-0.5">
                Auto-capture: front, right, left, up, down, and blink to automatically save the face template.
              </p>
            </div>
          </div>

          <button
            className="h-9 px-4 rounded-md border border-zinc-200 bg-white text-zinc-655 hover:bg-zinc-50 hover:text-zinc-800 text-xs font-semibold uppercase tracking-wider transition-all cursor-pointer shadow-xs shrink-0"
            onClick={loadCameras}
            disabled={loading}
          >
            {loading ? "Refreshing..." : "Refresh Cameras"}
          </button>
        </div>
      </div>

      {err ? (
        <div className="rounded-md border border-red-100 bg-red-50/85 p-3.5 text-xs text-red-700">
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
