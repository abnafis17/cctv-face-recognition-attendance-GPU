import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  employeePublicId,
  getOrCreateEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";
import { findCameraByAnyId } from "../utils/camera";
import axios from "axios";
import {
  getAttendanceEvents,
  pushAttendanceEvent,
} from "../services/attendanceEvents";
import { pushHeadcountEvent } from "../services/headcountEvents";

function parseFirstSeenIsoFromNotes(notes?: string | null): string | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    const existingFirst = String(parsed?.firstSeen || "").trim();
    return existingFirst || null;
  } catch {
    return null;
  }
}

export async function createAttendance(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const {
      employeeId,
      timestamp,
      cameraId,
      confidence,
      snapshotPath,
      type,
      mode,
    } = req.body;

    // "type" comes from the recognition stream query param (attendance/headcount)
    // Keep "mode" as an alias for compatibility.
    const eventType = String(type ?? mode ?? "")
      .trim()
      .toLowerCase();
    const identifier = normalizeEmployeeIdentifier(employeeId);
    if (!identifier || !timestamp)
      return res
        .status(400)
        .json({ error: "employeeId and timestamp required" });

    const employee = await getOrCreateEmployeeByAnyId(identifier, companyId, {
      nameIfCreate: "Unknown",
    });

    let cam = cameraId
      ? await findCameraByAnyId(String(cameraId), companyId)
      : null;
    if (cameraId && !cam) {
      // Auto-register laptop/adhoc cameras so attendance is not blocked
      try {
        cam = await prisma.camera.create({
          data: {
            id: String(cameraId),
            camId: String(cameraId),
            name: "Laptop Camera",
            companyId,
            // This is a virtual/browser camera; do not mark it as an active RTSP camera.
            isActive: false,
          },
        });
      } catch (err) {
        // If create fails (race/duplicate), try to read again before failing.
        cam = await findCameraByAnyId(String(cameraId), companyId);
        if (!cam) return res.status(404).json({ error: "Camera not found" });
      }
    }

    // OT requisition mode: DO NOT write to Attendance table.
    // Instead, upsert a per-employee/day OtRequisition row.
    if (
      eventType === "ot" ||
      eventType === "ot-requisition" ||
      eventType === "ot_requisition" ||
      eventType === "otrequisition"
    ) {
      const ts = new Date(timestamp);
      if (Number.isNaN(ts.getTime())) {
        return res.status(400).json({ error: "Invalid timestamp" });
      }

      const dateStr = ts.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
      const otId = `${employee.id}:${dateStr}`;

      // Preserve firstSeen across updates (stored in notes JSON)
      let firstSeenIso = ts.toISOString();
      try {
        const existing = await prisma.otRequisition.findUnique({
          where: { id: otId },
          select: { notes: true },
        });
        const existingFirst = parseFirstSeenIsoFromNotes(existing?.notes ?? null);
        if (existingFirst) firstSeenIso = existingFirst;
      } catch {
        // ignore malformed notes
      }

      const notes = JSON.stringify({ firstSeen: firstSeenIso });

      const row = await prisma.otRequisition.upsert({
        where: { id: otId },
        create: {
          id: otId,
          companyId,
          cameraId: cam ? cam.id : null,
          employeeId: employee.id,
          timestamp: ts,
          confidence: confidence ?? null,
          notes,
        },
        update: {
          cameraId: cam ? cam.id : null,
          timestamp: ts,
          confidence: confidence ?? null,
          notes,
        },
      });

      // Push an event so OT clients can refresh without polling.
      pushHeadcountEvent(companyId, {
        at: new Date().toISOString(),
        headcountId: row.id,
        employeeId: employeePublicId(employee),
        status: "OT",
        timestamp: row.timestamp.toISOString(),
        cameraId: row.cameraId,
      });

      return res.json({
        ok: true,
        otRequisition: {
          id: row.id,
          timestamp: row.timestamp.toISOString(),
          cameraId: row.cameraId,
        },
        employeeId: employeePublicId(employee),
        snapshotPath: snapshotPath ?? null,
      });
    }

    // Headcount mode: DO NOT write to Attendance table.
    // Instead, upsert a per-employee/day Headcount row so the headcount page can
    // compare "attendance (today)" vs "headcount (now)".
    if (eventType === "headcount") {
      const ts = new Date(timestamp);
      if (Number.isNaN(ts.getTime())) {
        return res.status(400).json({ error: "Invalid timestamp" });
      }

      // Dhaka-day id so the headcount page can query by date without camera filtering.
      const dateStr = ts.toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
      const dayStart = new Date(`${dateStr}T00:00:00+06:00`);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const hadAttendanceToday = await prisma.attendance.findFirst({
        where: {
          companyId,
          employeeId: employee.id,
          timestamp: { gte: dayStart, lt: dayEnd },
        },
        select: { id: true },
      });

      const status = hadAttendanceToday ? "MATCH" : "UNMATCH";
      const headcountId = `${employee.id}:${dateStr}`;

      // Preserve firstSeen across updates (stored in notes JSON)
      let firstSeenIso = ts.toISOString();
      try {
        const existing = await prisma.headcount.findUnique({
          where: { id: headcountId },
          select: { notes: true },
        });
        const existingFirst = parseFirstSeenIsoFromNotes(existing?.notes ?? null);
        if (existingFirst) firstSeenIso = existingFirst;
      } catch {
        // ignore malformed notes
      }

      const notes = JSON.stringify({ firstSeen: firstSeenIso });

      const row = await prisma.headcount.upsert({
        where: { id: headcountId },
        create: {
          id: headcountId,
          companyId,
          cameraId: cam ? cam.id : null,
          employeeId: employee.id,
          timestamp: ts,
          status,
          confidence: confidence ?? null,
          notes,
        },
        update: {
          cameraId: cam ? cam.id : null,
          timestamp: ts,
          status,
          confidence: confidence ?? null,
          notes,
        },
      });

      // Push an event so headcount clients can refresh without polling.
      pushHeadcountEvent(companyId, {
        at: new Date().toISOString(),
        headcountId: row.id,
        employeeId: employeePublicId(employee),
        status: row.status,
        timestamp: row.timestamp.toISOString(),
        cameraId: row.cameraId,
      });

      return res.json({
        ok: true,
        headcount: {
          id: row.id,
          status: row.status,
          timestamp: row.timestamp.toISOString(),
          cameraId: row.cameraId,
        },
        employeeId: employeePublicId(employee),
        snapshotPath: snapshotPath ?? null,
      });
    }

    const row = await prisma.attendance.create({
      data: {
        employeeId: employee.id,
        timestamp: new Date(timestamp),
        cameraId: cam ? cam.id : null,
        confidence: confidence ?? null,
        companyId,
      },
    });

    // Push a lightweight event so clients can refresh attendance without polling.
    pushAttendanceEvent(companyId, {
      at: new Date().toISOString(),
      attendanceId: row.id,
      employeeId: employeePublicId(employee),
      timestamp: row.timestamp.toISOString(),
      cameraId: row.cameraId,
    });

    res.json({
      ok: true,
      attendance: row,
      employeeId: employeePublicId(employee),
      snapshotPath: snapshotPath ?? null,
    });
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to create attendance",
      detail: e?.message ?? String(e),
    });
  }
}

export async function listAttendance(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const limit = Math.min(Number(req.query.limit || 100), 500);

    const rows = await prisma.attendance.findMany({
      where: { companyId },
      include: { employee: true, camera: true },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    res.json(
      rows.map((r) => ({
        id: r.id,
        employeeId: employeePublicId(r.employee),
        name: r.employee.name,
        timestamp: r.timestamp.toISOString(),
        cameraId: r.cameraId,
        cameraName: r.camera ? r.camera.name : null,
        confidence: r.confidence,
      }))
    );
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load attendance",
      detail: e?.message ?? String(e),
    });
  }
}

// ✅ matches your ERP format: "DD/MM/YYYY"
function toDDMMYYYY(d: Date) {
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

// ✅ BD time "HH:MM:SS" from timestamp (keeps Dhaka timezone)
function toBDTimeHHMMSS(d: Date) {
  // uses Asia/Dhaka locale formatting
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(d);

  const hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mi = parts.find((p) => p.type === "minute")?.value ?? "00";
  const ss = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${hh}:${mi}:${ss}`;
}

export async function attendanceEvents(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const afterSeqRaw = (req.query.afterSeq ?? req.query.after_seq ?? 0) as any;
    const limitRaw = (req.query.limit ?? 50) as any;
    const waitMsRaw = (req.query.waitMs ?? req.query.wait_ms ?? 0) as any;

    const afterSeq = Number(afterSeqRaw || 0) || 0;
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const waitMs = Math.min(Math.max(Number(waitMsRaw || 0) || 0, 0), 300_000);

    const ac = new AbortController();
    req.on("close", () => ac.abort());

    const payload = await getAttendanceEvents({
      companyId,
      afterSeq,
      limit,
      waitMs,
      signal: ac.signal,
    });

    // Client disconnected before we could respond
    if (ac.signal.aborted) return;

    return res.json({ ok: true, ...payload });
  } catch (e: any) {
    return res.status(500).json({
      ok: false,
      error: "Failed to fetch attendance events",
      detail: e?.message ?? String(e),
    });
  }
}

export async function dataSync(req: Request, res: Response) {
  try {
    // Example: return count of attendance records for data sync (Dhaka day range)
    const start = new Date("2026-01-13T00:00:00+06:00"); // Dhaka start
    const end = new Date("2026-01-14T00:00:00+06:00"); // next day start

    const attendanceCount = await prisma.attendance.findMany({
      where: {
        companyId: "cmk9dp01a0000vpskicoq1gj0",
        createdAt: {
          gte: start,
          lt: end,
        },
      },
      include: {
        employee: true,
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    console.log("Range:", start.toISOString(), "->", end.toISOString());
    console.log("Records:", attendanceCount.length);

    for (const emp of attendanceCount) {
      const empId = emp.employee?.empId;

      if (!empId) {
        console.log(`⚠️ Skipped: missing empId for attendanceId=${emp.id}`);
        continue;
      }

      try {
        // ✅ EXACT ERP payload shape (same keys)
        const payload = {
          attendanceDate: toDDMMYYYY(emp.timestamp),
          empId: empId,
          inTime: toBDTimeHHMMSS(emp.timestamp), // "HH:MM:SS" in Asia/Dhaka
          inLocation: "Reception_Camera",
        };

        const response = await axios.post(
          "http://172.20.60.101:7001/api/v2/Attendance/manual-attendance",
          payload,
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-api-version": "2.0",
            },
            timeout: 10000,
          }
        );

        console.log(
          `✅ Attendance marked for ${empId}`,
          `✅ Attendance TIME ${payload.inTime}`,
          `✅ Attendance DATE ${payload.attendanceDate}`
        );
      } catch (error) {
        console.log(`❌ Failed to mark attendance for ${empId}`, error);
      }
    }

    return res.status(200).json({
      ok: true,
      results: {
        attendanceCount: attendanceCount.length,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to sync attendance data",
      detail: e?.message ?? String(e),
    });
  }
}

// export async function dataSync(req: Request, res: Response) {
//   try {
//     // const companyId = String((req as any).companyId ?? "");

//     // Example: return count of attendance records for data sync
//     const start = new Date("2026-01-13T00:00:00+06:00"); // Dhaka start
//     const end = new Date("2026-01-14T00:00:00+06:00"); // next day start

//     const attendanceCount = await prisma.attendance.findMany({
//       where: {
//         companyId: "cmk9dp01a0000vpskicoq1gj0",
//         createdAt: {
//           gte: start,
//           lt: end,
//         },
//       },
//       include: {
//         employee: true,
//       },
//       orderBy: {
//         timestamp: "asc",
//       },
//     });

//     console.log(
//       attendanceCount.length,
//       new Date(Date.now() - 4 * 24 * 60 * 60 * 1000)
//     );

//     for (const emp of attendanceCount) {
//       try {
//         const response = await axios.post(
//           "http://172.20.60.101:7001/api/v2/Attendance/manual-attendance",
//           {
//             attendanceDate: toDDMMYYYY(emp.timestamp),
//             empId: emp.employee?.empId,
//             inTime: emp.timestamp.toISOString().slice(11, 19),
//             inLocation: "Reception_Camera",
//           },
//           {
//             headers: {
//               Accept: "application/json",
//               "Content-Type": "application/json",
//               "x-api-version": "2.0",
//             },
//             timeout: 10000,
//           }
//         );

//         console.log(
//           `✅ Attendance marked for ${emp.employee?.empId}`,
//           `✅ Attendance tIME  ${emp.timestamp.toISOString().slice(11, 19)}`,
//           `✅ Attendance DATE  ${toDDMMYYYY(emp.timestamp)}`
//         );
//       } catch (error) {
//         console.log(
//           `❌ Failed to mark attendance for ${emp.employee?.empId}`,
//           error
//         );
//       }
//     }

//     return res.status(200).json({
//       ok: true,
//       results: {
//         attendanceCount: attendanceCount.length,
//       },
//     });
//   } catch (e: any) {
//     res.status(500).json({
//       error: "Failed to sync attendance data",
//       detail: e?.message ?? String(e),
//     });
//   }
// }

// function toDDMMYYYY(dateTimeStr: any) {
//   // accept Date object too
//   if (dateTimeStr instanceof Date) {
//     const dd = String(dateTimeStr.getDate()).padStart(2, "0");
//     const mm = String(dateTimeStr.getMonth() + 1).padStart(2, "0");
//     const yyyy = dateTimeStr.getFullYear();
//     return `${dd}/${mm}/${yyyy}`;
//   }

//   // normalize to string (handles "string-like" values safely)
//   const s = String(dateTimeStr).trim();

//   // take only date part before space/T
//   const datePart = s.split(/[ T]/)[0]; // "2026-01-04"
//   const [yyyy, mm, dd] = datePart.split("-");

//   if (!yyyy || !mm || !dd) {
//     throw new Error(`Invalid datetime format: ${s}`);
//   }

//   return `${dd}/${mm}/${yyyy}`;
// }

// Test
// console.log(toDDMMYYYY("2026-01-04 11:21:42")); // 04/01/2026
