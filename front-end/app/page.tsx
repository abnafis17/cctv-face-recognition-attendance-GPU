"use client";

import { useEffect, useState } from "react";
import { fetchJSON } from "@/lib/api";

type Employee = { id: string; name: string };
type AttendanceRow = {
  id: string;
  employeeId: string;
  name: string;
  timestamp: string;
  cameraId?: string | null;
  confidence?: number | null;
};

export default function Home() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [err, setErr] = useState<string>("");

  async function load() {
    try {
      setErr("");
      const [emps, att] = await Promise.all([
        fetchJSON<Employee[]>("/api/employees"),
        fetchJSON<AttendanceRow[]>("/api/attendance"),
      ]);
      setEmployees(emps);
      setAttendance(att);
    } catch (e: any) {
      setErr(e?.message ?? "Unknown error");
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 3000); // refresh like “live”
    return () => clearInterval(t);
  }, []);

  return (
    <main style={{ padding: 24, fontFamily: "system-ui" }}>
      <h1 style={{ fontSize: 24, fontWeight: 700 }}>
        CCTV Face Recognition Dashboard
      </h1>

      <p style={{ marginTop: 8, opacity: 0.8 }}>
        Backend:{" "}
        {process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:4000"}
      </p>

      {err ? (
        <div style={{ marginTop: 16, padding: 12, border: "1px solid #f00" }}>
          <b>Error:</b> {err}
        </div>
      ) : null}

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 16,
          marginTop: 20,
        }}
      >
        <section
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Employees</h2>
          <p style={{ marginTop: 4, opacity: 0.7 }}>
            Total: {employees.length}
          </p>

          <ul style={{ marginTop: 12 }}>
            {employees.map((e) => (
              <li key={e.id}>
                <b>{e.name}</b> <span style={{ opacity: 0.7 }}>({e.id})</span>
              </li>
            ))}
          </ul>
        </section>

        <section
          style={{ border: "1px solid #ddd", borderRadius: 10, padding: 16 }}
        >
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Recent Attendance</h2>
          <p style={{ marginTop: 4, opacity: 0.7 }}>
            Showing latest {attendance.length}
          </p>

          <div
            style={{
              marginTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 10,
            }}
          >
            {attendance.map((a) => (
              <div
                key={a.id}
                style={{
                  border: "1px solid #eee",
                  borderRadius: 10,
                  padding: 10,
                }}
              >
                <div
                  style={{ display: "flex", justifyContent: "space-between" }}
                >
                  <div>
                    <b>{a.name}</b>{" "}
                    <span style={{ opacity: 0.7 }}>({a.employeeId})</span>
                  </div>
                  <div style={{ opacity: 0.8 }}>
                    {new Date(a.timestamp).toLocaleString()}
                  </div>
                </div>

                <div style={{ marginTop: 6, opacity: 0.75, fontSize: 13 }}>
                  Camera: {a.cameraId ?? "N/A"} | Confidence:{" "}
                  {typeof a.confidence === "number"
                    ? a.confidence.toFixed(3)
                    : "N/A"}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
