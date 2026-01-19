"use client";

import { useEffect, useRef } from "react";
import axiosInstance, { API } from "@/config/axiosInstance";

type AttendanceEvent = {
  seq?: number;
  at?: string;
  attendanceId?: string;
  employeeId?: string;
  timestamp?: string;
  cameraId?: string | null;
};

type UseAttendanceEventsOptions = {
  enabled?: boolean;
  pollIntervalMs?: number; // default 600 (retry/backoff delay)
  waitMs?: number; // default 300000 (server long-poll wait)
  limit?: number; // default 50
  onEvents?: (events: AttendanceEvent[]) => void;
};

export function useAttendanceEvents(options: UseAttendanceEventsOptions = {}) {
  const {
    enabled = true,
    pollIntervalMs = 600,
    waitMs = 300000,
    limit = 50,
    onEvents,
  } = options;

  const seqRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    async function syncLatest() {
      try {
        const resp = await axiosInstance.get(`${API.ATTENDANCE_LIST}/events`, {
          params: { afterSeq: 0, limit: 1, waitMs: 0 },
        });
        const latest = Number(resp?.data?.latest_seq || 0) || 0;
        if (!cancelled) seqRef.current = Math.max(seqRef.current, latest);
      } catch {
        // ignore sync errors; long-poll is best-effort
      }
    }

    async function pollLoop() {
      while (!cancelled) {
        if (inFlightRef.current) {
          await sleep(Math.max(50, pollIntervalMs));
          continue;
        }
        inFlightRef.current = true;

        try {
          const resp = await axiosInstance.get(`${API.ATTENDANCE_LIST}/events`, {
            params: { afterSeq: seqRef.current, limit, waitMs },
          });
          if (cancelled) return;

          const events = (resp?.data?.events || []) as AttendanceEvent[];
          const latest = Number(resp?.data?.latest_seq || 0) || 0;

          let maxSeq = Math.max(seqRef.current, latest);
          for (const ev of events) {
            const seq = Number(ev?.seq || 0) || 0;
            if (seq > maxSeq) maxSeq = seq;
          }
          seqRef.current = maxSeq;

          if (events.length) onEvents?.(events);
        } catch {
          if (!cancelled) await sleep(Math.max(250, pollIntervalMs));
        } finally {
          inFlightRef.current = false;
        }
      }
    }

    const first = window.setTimeout(() => {
      syncLatest().finally(() => pollLoop());
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, pollIntervalMs, waitMs, limit, onEvents]);
}

