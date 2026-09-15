import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { prisma } from "../../../prisma";
import {
  employeePublicId,
  findEmployeeByAnyId,
  getOrCreateEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../../../utils/employee";
import { findCameraByAnyId } from "../../../utils/camera";
import axios from "axios";
import { getAttendanceEvents, pushAttendanceEvent } from "./service";
import { pushHeadcountEvent } from "../../../services/headcountEvents";

const cameraHasAttendanceField = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Camera")
  ?.fields.some((f) => f.name === "attendance");

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

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function isYYYYMMDD(s: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

function dhakaDayRange(dateStr: string) {
  const start = new Date(`${dateStr}T00:00:00+06:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

export async function createAttendance(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    if (!companyId) {
      return res.status(400).json({ error: "Missing company id" });
    }
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

    const parsedTimestamp = new Date(timestamp);
    if (Number.isNaN(parsedTimestamp.getTime())) {
      return res.status(400).json({ error: "Invalid timestamp" });
    }

    const confVal = Number(confidence ?? 0);
    const reqMinConf = 0.45;
    if (confVal > 0 && confVal < reqMinConf) {
      return res.status(400).json({ error: `Rejected: low confidence score for ${eventType || "attendance"}` });
    }

    const employee = await getOrCreateEmployeeByAnyId(identifier, companyId, {
      nameIfCreate: req.body.employeeName || req.body.name || "Unknown",
    });
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const normalizedCameraId = String(cameraId ?? "").trim();
    let cam = normalizedCameraId
      ? await findCameraByAnyId(normalizedCameraId, companyId)
      : null;

    // OT requisition mode: DO NOT write to Attendance table.
    // Instead, upsert a per-employee/day OtRequisition row.
    if (
      eventType === "ot" ||
      eventType === "ot-requisition" ||
      eventType === "ot_requisition" ||
      eventType === "otrequisition"
    ) {
      const ts = parsedTimestamp;

      const dateStr = ts.toLocaleDateString("en-CA", {
        timeZone: "Asia/Dhaka",
      });
      const otId = `${employee.id}:${dateStr}`;

      // Preserve firstSeen across updates (stored in notes JSON)
      let firstSeenIso = ts.toISOString();
      try {
        const existing = await prisma.otRequisition.findUnique({
          where: { id: otId },
          select: { notes: true },
        });
        const existingFirst = parseFirstSeenIsoFromNotes(
          existing?.notes ?? null,
        );
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

      pushHeadcountEvent(companyId, {
        at: new Date().toISOString(),
        headcountId: row.id,
        employeeId: employeePublicId(employee),
        timestamp: row.timestamp.toISOString(),
        cameraId: cam ? cam.camId || cam.id : normalizedCameraId,
        status: "OT",
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

    // Deduplicate against duplicate HTTP requests within 10 seconds for the same employee/company
    const tenSecondsAgo = new Date(parsedTimestamp.getTime() - 10000);
    const existingRecent = await prisma.attendance.findFirst({
      where: {
        employeeId: employee.id,
        companyId,
        timestamp: {
          gte: tenSecondsAgo,
        },
      },
      orderBy: {
        timestamp: "desc",
      },
    });

    let row = existingRecent;
    if (!row) {
      row = await prisma.attendance.create({
        data: {
          employeeId: employee.id,
          timestamp: parsedTimestamp,
          cameraId: cam ? cam.id : null,
          confidence: confidence ?? null,
          companyId,
        },
      });

      pushAttendanceEvent(companyId, {
        at: new Date().toISOString(),
        attendanceId: row.id,
        employeeId: employeePublicId(employee),
        timestamp: row.timestamp.toISOString(),
        cameraId: cam ? cam.camId || cam.id : normalizedCameraId,
      });
    }

    // ONLY create Headcount entry and push real-time Headcount Event if eventType is "headcount"!
    if (eventType === "headcount") {
      try {
        const hcNotes = JSON.stringify({ firstSeen: parsedTimestamp.toISOString() });
        const hcRow = await prisma.headcount.create({
          data: {
            companyId,
            employeeId: employee.id,
            timestamp: parsedTimestamp,
            cameraId: cam ? cam.id : null,
            confidence: confidence ?? null,
            status: "MATCH",
            notes: hcNotes,
          },
        });

        pushHeadcountEvent(companyId, {
          at: new Date().toISOString(),
          headcountId: hcRow.id,
          employeeId: employeePublicId(employee),
          timestamp: hcRow.timestamp.toISOString(),
          cameraId: cam ? cam.camId || cam.id : normalizedCameraId,
          status: "MATCH",
        });
      } catch (hcErr) {
        console.warn("Failed to create headcount record or event:", hcErr);
      }
    }

    res.json({
      ok: true,
      attendance: row,
      employeeId: employeePublicId(employee),
      snapshotPath: snapshotPath ?? null,
      deduplicated: Boolean(existingRecent),
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
      })),
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
    const companyId = String((req as any).companyId ?? "").trim();
    if (!companyId) {
      return res.status(400).json({ error: "Missing company id" });
    }

    const dateInput = String(req.query?.date ?? "").trim();
    const dateStr = dateInput || dhakaTodayYYYYMMDD();
    if (!isYYYYMMDD(dateStr)) {
      return res.status(400).json({
        error: "Invalid date. Expected YYYY-MM-DD",
        example: "2026-02-09",
      });
    }

    const { start, end } = dhakaDayRange(dateStr);

    const attendanceRows = await prisma.attendance.findMany({
      where: {
        companyId,
        timestamp: {
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

    let pushedCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (const row of attendanceRows) {
      const empId = row.employee?.empId;
      if (!empId) {
        skippedCount += 1;
        continue;
      }

      try {
        const payload = {
          attendanceDate: toDDMMYYYY(row.timestamp),
          empId,
          inTime: toBDTimeHHMMSS(row.timestamp),
          inLocation: "Reception_Camera",
        };

        await axios.post(
          "http://172.20.60.101:7001/api/v2/Attendance/manual-attendance",
          payload,
          {
            headers: {
              Accept: "application/json",
              "Content-Type": "application/json",
              "x-api-version": "2.0",
            },
            timeout: 10000,
          },
        );

        pushedCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    return res.status(200).json({
      ok: true,
      results: {
        date: dateStr,
        attendanceCount: attendanceRows.length,
        pushedCount,
        failedCount,
        skippedCount,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to sync attendance data",
      detail: e?.message ?? String(e),
    });
  }
}
