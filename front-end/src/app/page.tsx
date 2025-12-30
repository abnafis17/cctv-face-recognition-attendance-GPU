"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axiosInstance, { API } from "@/config/axiosInstance";
import type { AttendanceRow, Employee } from "@/types";

import AppShell from "@/components/layout/AppShell";
import ErrorBox from "@/components/ui/ErrorBox";
import EmployeesList from "@/features/employees/EmployeesList";
import AttendanceList from "@/features/attendance/AttendanceList";

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [err, setErr] = useState("");

  const inFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const loadAll = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      const [empsRes, attRes] = await Promise.all([
        axiosInstance.get(`${API.EMPLOYEE_LIST}`),
        axiosInstance.get(`${API.ATTENDANCE_LIST}`),
      ]);

      if (!mountedRef.current) return;

      if (empsRes?.status === 200)
        setEmployees((empsRes.data || []) as Employee[]);
      if (attRes?.status === 200)
        setAttendance((attRes.data || []) as AttendanceRow[]);

      setErr("");
    } catch (error) {
      if (!mountedRef.current) return;
      const msg =
        (error as any)?.response?.data?.message ||
        "Failed to load dashboard data";
      setErr(msg);
    } finally {
      inFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    // ✅ initial load via timer callback (avoids "setState inside effect" warning)
    const first = window.setTimeout(() => {
      loadAll();
    }, 0);

    const poll = window.setInterval(() => {
      loadAll();
    }, 3000);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [loadAll]);

  return (
    <AppShell>
      {err ? <ErrorBox message={err} /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <EmployeesList employees={employees} />
        <AttendanceList attendance={attendance} />
      </div>
    </AppShell>
  );
}
