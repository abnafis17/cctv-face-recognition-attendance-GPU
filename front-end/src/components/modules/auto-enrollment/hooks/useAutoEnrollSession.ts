"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import type { Screen, Session } from "../types";
import { friendlyAxiosError } from "../utils";

type ConnectionInfo = {
  effectiveType?: string;
  saveData?: boolean;
};

type NavigatorWithConnection = Navigator & {
  connection?: ConnectionInfo;
};

type UseAutoEnrollSessionArgs = {
  cameraId: string;
  employeeId: string;
  name: string;
  unit: string;
  department: string;
  section: string;
  line: string;
  reEnroll: boolean;
  ensureCameraOn: (camId: string) => Promise<boolean>;
  stopCamera: (camId: string) => Promise<void>;
  onStopCleanup: () => void;
};

export function useAutoEnrollSession({
  cameraId,
  employeeId,
  name,
  unit,
  department,
  section,
  line,
  reEnroll,
  ensureCameraOn,
  stopCamera,
  onStopCleanup,
}: UseAutoEnrollSessionArgs) {
  const [session, setSession] = useState<Session | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>("setup");

  const sessionStatus = session?.status;
  const getPollDelayMs = useCallback((isRunning: boolean) => {
    const hidden =
      typeof document !== "undefined" && document.visibilityState !== "visible";

    let constrainedNetwork = false;
    if (typeof navigator !== "undefined") {
      const nav = navigator as NavigatorWithConnection;
      const effectiveType = String(
        nav.connection?.effectiveType ?? "",
      ).toLowerCase();
      constrainedNetwork =
        !!nav.connection?.saveData ||
        effectiveType === "slow-2g" ||
        effectiveType === "2g" ||
        effectiveType === "3g";
    }

    if (isRunning) {
      if (hidden) return 1200;
      return constrainedNetwork ? 800 : 550;
    }

    if (hidden) return 3000;
    return constrainedNetwork ? 2200 : 1700;
  }, []);

  // ---- status refresh (via backend proxy, avoids CORS) ----
  const refreshStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get<{
        ok: boolean;
        session: Session | null;
      }>(API.AUTO_ENROLL_SESSION_STATUS);

      const s = res.data?.session || null;
      setSession(s);
      setRunning(!!s && s.status === "running");

      if (s && s.status !== "stopped") setScreen("enrolling");
      if (!s) setScreen("setup");
    } catch {
      // keep silent in polling
    }
  }, []);

  const start = useCallback(async () => {
    if (!employeeId.trim() || !name.trim() || !cameraId) {
      toast.error("Please select camera, employee ID, and name.");
      return;
    }

    setBusy(true);
    let startedCamera = false;

    try {
      startedCamera = await ensureCameraOn(cameraId);

      // Start auto-enroll session via backend proxy (NO CORS)
      const res = await axiosInstance.post<{ ok: boolean; session: Session }>(
        API.AUTO_ENROLL_SESSION_START,
        {
          employeeId: employeeId.trim(),
          name: name.trim(),
          ...(unit.trim() ? { unit: unit.trim() } : {}),
          ...(department.trim() ? { department: department.trim() } : {}),
          ...(section.trim() ? { section: section.trim() } : {}),
          ...(line.trim() ? { line: line.trim() } : {}),
          cameraId,
          ...(reEnroll ? { reEnroll: true } : {}),
        }
      );

      setSession(res.data.session);
      setRunning(true);
      setScreen("enrolling");
      toast.success(reEnroll ? "Re-enrollment started" : "Enrollment started");
    } catch (e: any) {
      toast.error(friendlyAxiosError(e));
      if (startedCamera && cameraId) {
        try {
          await stopCamera(cameraId);
        } catch {
          // ignore camera stop failure
        }
      }
    } finally {
      setBusy(false);
    }
  }, [
    cameraId,
    department,
    employeeId,
    ensureCameraOn,
    line,
    name,
    reEnroll,
    section,
    stopCamera,
    unit,
  ]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      // 1) stop session
      await axiosInstance.post(API.AUTO_ENROLL_SESSION_STOP);

      // 2) stop camera (stop fully stops everything)
      if (cameraId) {
        await stopCamera(cameraId);
      }

      // 3) refresh session + clear
      await refreshStatus();
      setSession(null);
      setRunning(false);
      setScreen("setup");

      onStopCleanup();

      toast.success("Stopped");
    } catch (e: any) {
      toast.error(friendlyAxiosError(e));
    } finally {
      setBusy(false);
    }
  }, [cameraId, onStopCleanup, refreshStatus, stopCamera]);

  // ---- Polling (fast when running, slow when idle) ----
  useEffect(() => {
    let alive = true;
    let t: any;

    const loop = async () => {
      if (!alive) return;
      await refreshStatus();
      const wait = getPollDelayMs(running);
      t = setTimeout(loop, wait);
    };

    loop();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
      window.speechSynthesis.cancel();
    };
  }, [getPollDelayMs, refreshStatus, running]);

  const startDisabled = useMemo(
    () => busy || running || !cameraId || !employeeId.trim() || !name.trim(),
    [busy, cameraId, employeeId, name, running]
  );

  return {
    session,
    setSession,
    running,
    busy,
    screen,
    setScreen,
    sessionStatus,
    refreshStatus,
    start,
    stop,
    startDisabled,
  };
}
