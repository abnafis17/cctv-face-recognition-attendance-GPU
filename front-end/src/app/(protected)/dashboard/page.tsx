"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axiosInstance, { API } from "@/config/axiosInstance";
import type { AttendanceRow, Employee } from "@/types";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";

import AppShell from "@/components/layout/AppShell";
import ErrorBox from "@/components/ui/ErrorBox";
import EmployeesList from "@/features/employees/EmployeesList";
import AttendanceList from "@/features/attendance/AttendanceList";

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [err, setErr] = useState("");

  const employeesInFlightRef = useRef(false);
  const attendanceInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const loadEmployees = useCallback(async () => {
    if (employeesInFlightRef.current) return;
    employeesInFlightRef.current = true;

    try {
      const empsRes = await axiosInstance.get(`${API.EMPLOYEE_LIST}`);
      if (!mountedRef.current) return;
      if (empsRes?.status === 200)
        setEmployees((empsRes.data || []) as Employee[]);
      setErr("");
    } catch (error) {
      if (!mountedRef.current) return;
      const msg =
        (error as any)?.response?.data?.message ||
        "Failed to load dashboard data";
      setErr(msg);
    } finally {
      employeesInFlightRef.current = false;
    }
  }, []);

  const loadAttendance = useCallback(async () => {
    if (attendanceInFlightRef.current) return;
    attendanceInFlightRef.current = true;

    try {
      const attRes = await axiosInstance.get(`${API.ATTENDANCE_LIST}`);
      if (!mountedRef.current) return;
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
      attendanceInFlightRef.current = false;
    }
  }, []);

  const loadAll = useCallback(async () => {
    await Promise.all([loadEmployees(), loadAttendance()]);
  }, [loadEmployees, loadAttendance]);

  useEffect(() => {
    mountedRef.current = true;

    // ✅ initial load via timer callback (avoids "setState inside effect" warning)
    const first = window.setTimeout(() => {
      loadAll();
    }, 0);

    const poll = window.setInterval(() => {
      loadEmployees();
    }, 3000);

    return () => {
      mountedRef.current = false;
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [loadAll, loadEmployees]);

  // Refresh attendance list only when a new attendance record is created (no interval polling)
  useAttendanceEvents({ onEvents: loadAttendance });

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
