import { Request, Response } from "express";
import { prisma } from "../prisma";
import { getHeadcountEvents } from "../services/headcountEvents";

function getCompanyId(req: Request): string | null {
  const fromReq = (req as any)?.companyId;
  const fromUser = (req as any)?.user?.companyId;
  const fromHeader = req.header("x-company-id");
  return (fromReq || fromUser || fromHeader || null) as any;
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

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function toISOStringOrNull(value?: Date | null) {
  return value ? value.toISOString() : null;
}

type HeadcountStatus = "MATCH" | "UNMATCH" | "MISSING" | "ABSENT";

function parseFirstSeenFromNotes(notes?: string | null): Date | null {
  if (!notes) return null;
  try {
    const parsed = JSON.parse(notes);
    const raw = String(
      parsed?.firstSeen ??
        parsed?.first_seen ??
        parsed?.first ??
        parsed?.headcountFirst ??
        "",
    ).trim();
    if (!raw) return null;
    const d = new Date(raw);
    return Number.isNaN(d.getTime()) ? null : d;
  } catch {
    // If notes isn't JSON, try treating it as a raw datetime string
    const d = new Date(String(notes));
    return Number.isNaN(d.getTime()) ? null : d;
  }
}

/**
 * GET /attendance/headcount/cameras
 * Returns company cameras to populate the dropdown
 */
export async function listHeadcountCameras(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const cams = await prisma.camera.findMany({
      // Laptop cameras are rendered separately on the headcount page; keep dropdown for DB cameras.
      where: { companyId, NOT: { id: { startsWith: "laptop-" } } },
      select: { id: true, name: true, rtspUrl: true, isActive: true },
      orderBy: [{ name: "asc" }],
      take: 5000,
    });

    return res.json(cams);
  } catch (e: any) {
    console.error("listHeadcountCameras failed:", e);
    return res.status(500).json({
      error: "Failed to load cameras",
      detail: e?.message ?? String(e),
    });
  }
}

/**
 * GET /headcount?date=YYYY-MM-DD&q=...
 *
 * Important: camera selection on the headcount page is ONLY for capture/streaming.
 * The table is computed company-wide for the selected date (no camera filtering).
  *
  * Returns MATCH rows only:
  * - "Headcount" = entries in the Headcount table (written when stream type=headcount)
  * - "Attendance (this day)" = entries in the Attendance table (all cameras)
  * - MATCH = employee appears in BOTH headcount and attendance for the selected day
  */
export async function listHeadcount(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const dateStrRaw = String(req.query?.date || "").trim();
    const dateStr = dateStrRaw || dhakaTodayYYYYMMDD();

    if (!isYYYYMMDD(dateStr)) {
      return res.status(400).json({
        error: "Invalid date. Expected YYYY-MM-DD",
        example: "2026-01-19",
      });
    }

    const q = String(req.query?.q ?? "").trim();

    const { start, end } = dhakaDayRange(dateStr);

    // 1) Search -> resolve matching employees first
    let searchEmployeeIds: string[] | null = null;
    if (q.length > 0) {
      const matchedEmployees = await prisma.employee.findMany({
        where: {
          companyId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { empId: { contains: q, mode: "insensitive" } },
            { id: { equals: q } },
          ],
        },
        select: { id: true },
        take: 5000,
      });

      if (matchedEmployees.length === 0) return res.json([]);

      searchEmployeeIds = matchedEmployees.map((e) => e.id);
    }

    const baseDayWhere: any = {
      companyId,
      timestamp: { gte: start, lt: end },
      ...(searchEmployeeIds ? { employeeId: { in: searchEmployeeIds } } : {}),
    };

    // 2) Attendance today (all cameras) - distinct-by-employee
    // orderBy must start with employeeId for Postgres determinism (same pattern as daily controller)
    const attLastByEmployee = await prisma.attendance.findMany({
      where: baseDayWhere,
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { timestamp: "desc" }],
      select: { employeeId: true, timestamp: true, cameraId: true },
    });

    const attFirstByEmployee = await prisma.attendance.findMany({
      where: baseDayWhere,
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { timestamp: "asc" }],
      select: { employeeId: true, timestamp: true, cameraId: true },
    });

    // 3) Headcount events today (already persisted by createAttendance when type=headcount)
    const headLastByEmployee = await prisma.headcount.findMany({
      where: {
        companyId,
        timestamp: { gte: start, lt: end },
        employeeId: { not: null },
        ...(searchEmployeeIds ? { employeeId: { in: searchEmployeeIds } } : {}),
      },
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
      select: {
        employeeId: true,
        timestamp: true,
        cameraId: true,
        confidence: true,
        status: true,
        notes: true,
      },
    });

    const attIds = new Set(attLastByEmployee.map((x) => x.employeeId));
    const headIds = new Set(
      headLastByEmployee
        .map((x) => x.employeeId)
        .filter((x): x is string => Boolean(x)),
    );

    // MATCH-only mode: return ONLY employees present in BOTH:
    // - Attendance table for the day
    // - Headcount table for the day
    const employeeIds = Array.from(headIds).filter((id) => attIds.has(id));
    if (employeeIds.length === 0) return res.json([]);

    const employees = await prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: { id: true, name: true, empId: true },
      take: 50000,
    });

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const attLastMap = new Map(attLastByEmployee.map((x) => [x.employeeId, x]));
    const attFirstMap = new Map(attFirstByEmployee.map((x) => [x.employeeId, x]));
    const headLastMap = new Map(
      headLastByEmployee
        .filter((x): x is typeof x & { employeeId: string } => Boolean(x.employeeId))
        .map((x) => [x.employeeId, x]),
    );

    // 5) Camera names (previous attendance + headcount camera)
    const allCamIds: string[] = [];
    for (const employeeId of employeeIds) {
      const prevCamId = attLastMap.get(employeeId)?.cameraId;
      const headCamId = headLastMap.get(employeeId)?.cameraId;
      if (prevCamId) allCamIds.push(String(prevCamId));
      if (headCamId) allCamIds.push(String(headCamId));
    }

    const cams = allCamIds.length
      ? await prisma.camera.findMany({
           where: { id: { in: allCamIds } },
          select: { id: true, name: true },
        })
      : [];

    const camName = new Map(cams.map((c) => [c.id, c.name]));

    // 6) Build rows
    type Row = {
      id: string;
      date: string;

      name: string;
      employeeId: string;

      headcountCameraId: string | null;
      headcountCameraName: string | null;
      headcountFirstEntryTime: string | null;
      headcountLastEntryTime: string | null;
      headcountTime: string | null;
      headcountConfidence: number | null;

      previousCameraName: string | null;
      previousFirstEntryTime: string | null;
      previousLastEntryTime: string | null;
      previousTime: string | null;

      status: "MATCH" | "UNMATCH" | "MISSING" | "ABSENT";
      timestamp: string | null;
    };

    const rows: Row[] = employeeIds.map((employeePkId) => {
      const emp = employeeMap.get(employeePkId);
      const publicEmployeeId = emp?.empId ?? employeePkId;

      const head = headLastMap.get(employeePkId);
      const attLast = attLastMap.get(employeePkId);
      const attFirst = attFirstMap.get(employeePkId);

      const hasHead =
        Boolean(head) && ["MATCH", "UNMATCH"].includes(String(head?.status || ""));
      const hasPrev = Boolean(attLast);

      let status: Row["status"];
      if (hasHead && hasPrev) status = "MATCH";
      else if (hasHead && !hasPrev) status = "UNMATCH";
      else if (!hasHead && hasPrev) status = "MISSING";
      else status = "ABSENT";

      const headFirst = parseFirstSeenFromNotes(head?.notes ?? null);
      const headLast = head?.timestamp ?? null;
      const timestamp = headLast ?? attLast?.timestamp ?? null;

      return {
        id: `${employeePkId}:${dateStr}`,
        date: dateStr,

        name: emp?.name ?? "Unknown",
        employeeId: publicEmployeeId,

        headcountCameraId: hasHead ? (head?.cameraId ?? null) : null,
        headcountCameraName:
          hasHead && head?.cameraId ? camName.get(String(head.cameraId)) ?? null : null,
        headcountFirstEntryTime: hasHead ? toISOStringOrNull(headFirst) : null,
        headcountLastEntryTime: hasHead ? toISOStringOrNull(headLast) : null,
        headcountTime: hasHead ? toISOStringOrNull(headLast) : null,
        headcountConfidence:
          hasHead && typeof head?.confidence === "number" ? head.confidence : null,

        previousCameraName: attLast?.cameraId
          ? camName.get(String(attLast.cameraId)) ?? null
          : null,
        previousFirstEntryTime: toISOStringOrNull(attFirst?.timestamp ?? null),
        previousLastEntryTime: toISOStringOrNull(attLast?.timestamp ?? null),
        previousTime: toISOStringOrNull(attLast?.timestamp ?? null),
        timestamp:
          status === "ABSENT" ? null : toISOStringOrNull(timestamp ?? null),

        status,
      };
    });

    // Return only matches
    const filteredRows = rows.filter((r) => r.status === "MATCH");

    // Sort: MATCH first, then UNMATCH, then ABSENT; within group by name/id
    const rank = (s: Row["status"]) =>
      s === "MATCH"
        ? 0
        : s === "UNMATCH"
        ? 1
        : s === "MISSING"
        ? 2
        : 3;

    filteredRows.sort((a, b) => {
      const ra = rank(a.status);
      const rb = rank(b.status);
      if (ra !== rb) return ra - rb;

      const na = (a.name || "").toLowerCase();
      const nb = (b.name || "").toLowerCase();
      if (na !== nb) return na.localeCompare(nb);

      return String(a.employeeId || "").localeCompare(
        String(b.employeeId || ""),
      );
    });

    return res.json(filteredRows);
  } catch (e: any) {
    console.error("listHeadcount failed:", e);
    return res.status(500).json({
      error: "Failed to load headcount",
      detail: e?.message ?? String(e),
    });
  }
}

export async function headcountEvents(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ ok: false, error: "Missing company id" });

    const afterSeqRaw = (req.query.afterSeq ?? req.query.after_seq ?? 0) as any;
    const limitRaw = (req.query.limit ?? 50) as any;
    const waitMsRaw = (req.query.waitMs ?? req.query.wait_ms ?? 0) as any;

    const afterSeq = Number(afterSeqRaw || 0) || 0;
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const waitMs = Math.min(Math.max(Number(waitMsRaw || 0) || 0, 0), 300_000);

    const ac = new AbortController();
    req.on("close", () => ac.abort());

    const payload = await getHeadcountEvents({
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
      error: "Failed to fetch headcount events",
      detail: e?.message ?? String(e),
    });
  }
}
