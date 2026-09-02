"use client";

import { useEffect, useRef } from "react";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";

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
  syncLatestOnStart?: boolean; // default true; false starts from seq=0/current ref without sync jump
  startSeq?: number;
  onEvents?: (events: AttendanceEvent[]) => void;
};

export function useAttendanceEvents(options: UseAttendanceEventsOptions = {}) {
  const {
    enabled = true,
    pollIntervalMs = 600,
    waitMs = 300000,
    limit = 50,
    syncLatestOnStart = true,
    startSeq,
    onEvents,
  } = options;

  const onEventsRef = useRef(onEvents);
  useEffect(() => {
    onEventsRef.current = onEvents;
  }, [onEvents]);

  const seqRef = useRef<number>(0);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    if (startSeq !== undefined && startSeq > 0) {
      seqRef.current = startSeq;
    }

    const sleep = (ms: number) =>
      new Promise<void>((resolve) => {
        window.setTimeout(resolve, ms);
      });

    async function syncLatest() {
      try {
        const resp = await axiosInstance.get(API.ATTENDANCE_EVENTS, {
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
          const resp = await axiosInstance.get(API.ATTENDANCE_EVENTS, {
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

          if (events.length) onEventsRef.current?.(events);
        } catch {
          if (!cancelled) await sleep(Math.max(250, pollIntervalMs));
        } finally {
          inFlightRef.current = false;
        }
      }
    }

    const first = window.setTimeout(() => {
      if (startSeq !== undefined && startSeq > 0) {
        pollLoop();
      } else if (syncLatestOnStart) {
        syncLatest().finally(() => pollLoop());
      } else {
        pollLoop();
      }
    }, 0);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [enabled, pollIntervalMs, waitMs, limit, syncLatestOnStart, startSeq]);
}

