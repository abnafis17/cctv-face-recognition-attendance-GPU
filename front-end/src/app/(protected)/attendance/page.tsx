"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpDown } from "lucide-react";
import axiosInstance, { API } from "@/config/axiosInstance";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";

type AttendanceRow = {
  id: string;
  employeeId: string;
  name: string;
  timestamp: string;
  cameraId?: string | null;
  cameraName?: string | null;
  confidence?: number | null;
};

type AttendanceSortOrder = "asc" | "desc";

export default function AttendancePage() {
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [err, setErr] = useState("");
  const [sortOrder, setSortOrder] = useState<AttendanceSortOrder>("desc");

  const inFlightRef = useRef(false);

  const fetchAttendance = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const response = await axiosInstance.get(`${API.ATTENDANCE_LIST}`);
      if (response?.status === 200) {
        setRows((response?.data || []) as AttendanceRow[]);
        setErr("");
      }
    } catch (error) {
      const errorMessage =
        (error as any)?.response?.data?.message || "Failed to load attendance";
      setErr(errorMessage);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    // ✅ avoids "setState inside effect" warning in newer React dev
    const first = window.setTimeout(() => fetchAttendance(), 0);

    return () => {
      window.clearTimeout(first);
    };
  }, [fetchAttendance]);

  // Refresh attendance only when new attendance is created (no interval polling)
  useAttendanceEvents({ onEvents: fetchAttendance });

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      const aTime = Date.parse(a.timestamp || "");
      const bTime = Date.parse(b.timestamp || "");

      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);

      if (!aValid && !bValid) return a.id.localeCompare(b.id);
      if (!aValid) return 1;
      if (!bValid) return -1;

      const diff = aTime - bTime;
      if (diff !== 0) return sortOrder === "asc" ? diff : -diff;

      return a.id.localeCompare(b.id);
    });
    return next;
  }, [rows, sortOrder]);

  return (
    <div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="page-header">
          <h1 className="page-title">Attendance History</h1>
          <p className="page-subtitle">
            Live attendance records from database
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))
          }
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
          title="Toggle attendance time order"
          aria-label="Toggle attendance time sort order"
        >
          <ArrowUpDown className="h-3.5 w-3.5" />
          {sortOrder === "asc" ? "Ascending" : "Descending"}
        </button>
      </div>

      {err ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-100 text-left">
            <tr>
              <th className="px-4 py-3">Employee</th>
              <th className="px-4 py-3">Employee ID</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Camera</th>
              <th className="px-4 py-3">Confidence</th>
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-4 py-2 font-medium">{r.name}</td>
                <td className="px-4 py-2 text-gray-600">{r.employeeId}</td>
                <td className="px-4 py-2">
                  {new Date(r.timestamp).toLocaleString()}
                </td>
                <td className="px-4 py-2">{r.cameraName ?? "N/A"}</td>
                <td className="px-4 py-2">
                  {typeof r.confidence === "number"
                    ? r.confidence.toFixed(3)
                    : "—"}
                </td>
              </tr>
            ))}

            {sortedRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                  No attendance records found
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
