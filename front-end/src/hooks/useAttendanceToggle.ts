"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Camera } from "@/types";
import axiosInstance from "@/config/axiosInstance";

type UseAttendanceToggleArgs = {
  setErr: Dispatch<SetStateAction<string>>;
};

export function useAttendanceToggle({ setErr }: UseAttendanceToggleArgs) {
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

  return { enableAttendance, disableAttendance };
}
