"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { fetchJSON, postJSON } from "@/lib/api";
import { API } from "@/constant/API_PATH";

export default function AttendanceControls() {
  const [running, setRunning] = useState(false);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    // prevent overlapping refresh calls (interval + button)
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const s = await fetchJSON<{ running: boolean }>(
        API.ATTENDANCE_CONTROL_STATUS
      );
      setRunning(Boolean(s?.running));
    } catch {
      // optional: keep last state, or setRunning(false)
      // setRunning(false);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  const start = useCallback(async () => {
    await postJSON(API.ATTENDANCE_CONTROL_START);
    await refresh();
  }, [refresh]);

  const stop = useCallback(async () => {
    await postJSON(API.ATTENDANCE_CONTROL_STOP);
    await refresh();
  }, [refresh]);

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      if (cancelled) return;
      await refresh();
    };

    // ✅ run once safely
    tick();

    // ✅ then poll
    const t = window.setInterval(() => {
      tick();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(t);
    };
  }, [refresh]);

  return (
    <div className="rounded-xl border bg-white p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="font-semibold">Attendance Scanning</div>
          <div className="text-sm text-gray-500">
            Status: {running ? "Running" : "Stopped"}
          </div>
        </div>

        <div className="flex gap-2">
          <button
            className="rounded-md border px-3 py-1 text-sm"
            onClick={start}
            type="button"
          >
            Start
          </button>
          <button
            className="rounded-md border px-3 py-1 text-sm"
            onClick={stop}
            type="button"
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
}
