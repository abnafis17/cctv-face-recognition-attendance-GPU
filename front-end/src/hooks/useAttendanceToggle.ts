"use client";

import type { Dispatch, SetStateAction } from "react";
import type { Camera } from "@/types";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";

type UseAttendanceToggleArgs = {
  setErr: Dispatch<SetStateAction<string>>;
};

export function useAttendanceToggle({ setErr }: UseAttendanceToggleArgs) {
  function parseApiError(e: unknown, fallback: string): string {
    const anyErr = e as any;
    return (
      anyErr?.response?.data?.error ||
      anyErr?.response?.data?.message ||
      (e instanceof Error ? e.message : fallback)
    );
  }

  // ---------- Attendance toggle ----------
  async function enableAttendance(cam: Camera): Promise<boolean> {
    try {
      await axiosInstance.post(API.ATTENDANCE_CONTROL_ENABLE, {
        cameraId: cam.id,
      });
      return true;
    } catch (e: unknown) {
      setErr(parseApiError(e, "Failed to enable attendance"));
      return false;
    }
  }

  async function disableAttendance(cam: Camera): Promise<boolean> {
    try {
      await axiosInstance.post(API.ATTENDANCE_CONTROL_DISABLE, {
        cameraId: cam.id,
      });
      return true;
    } catch (e: unknown) {
      setErr(parseApiError(e, "Failed to disable attendance"));
      return false;
    }
  }

  return { enableAttendance, disableAttendance };
}
