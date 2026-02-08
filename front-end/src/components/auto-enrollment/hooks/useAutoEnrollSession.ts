"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import type { Screen, Session } from "../types";
import { friendlyAxiosError } from "../utils";

type UseAutoEnrollSessionArgs = {
  cameraId: string;
  employeeId: string;
  name: string;
  ensureCameraOn: (camId: string) => Promise<boolean>;
  stopCamera: (camId: string) => Promise<void>;
  onStopCleanup: () => void;
};

export function useAutoEnrollSession({
  cameraId,
  employeeId,
  name,
  ensureCameraOn,
  stopCamera,
  onStopCleanup,
}: UseAutoEnrollSessionArgs) {
  const [session, setSession] = useState<Session | null>(null);
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState(false);
  const [screen, setScreen] = useState<Screen>("setup");

  const sessionStatus = session?.status;

  // ---- status refresh (via backend proxy, avoids CORS) ----
  const refreshStatus = useCallback(async () => {
    try {
      const res = await axiosInstance.get<{
        ok: boolean;
        session: Session | null;
      }>("/enroll2-auto/session/status");

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
        "/enroll2-auto/session/start",
        { employeeId: employeeId.trim(), name: name.trim(), cameraId }
      );

      setSession(res.data.session);
      setRunning(true);
      setScreen("enrolling");
      toast.success("Enrollment started");
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
  }, [cameraId, employeeId, ensureCameraOn, name, stopCamera]);

  const stop = useCallback(async () => {
    setBusy(true);
    try {
      // 1) stop session
      await axiosInstance.post("/enroll2-auto/session/stop");

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
      // 400ms while running, 1500ms while idle
      const wait = running ? 400 : 1500;
      t = setTimeout(loop, wait);
    };

    loop();
    return () => {
      alive = false;
      if (t) clearTimeout(t);
      window.speechSynthesis.cancel();
    };
  }, [refreshStatus, running]);

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
