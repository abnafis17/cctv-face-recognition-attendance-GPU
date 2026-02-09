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

function normalizeHierarchyValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (
    normalized === "all" ||
    normalized === "__all__" ||
    normalized === "n/a" ||
    normalized === "na" ||
    normalized === "none" ||
    normalized === "null" ||
    normalized === "-"
  ) {
    return null;
  }

  return text;
}

type HeadcountStatus = "MATCH" | "UNMATCH" | "ABSENT";

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
      where: {
        companyId,
        NOT: {
          OR: [
            { camId: { startsWith: "laptop-" } },
            { id: { startsWith: "laptop-" } },
          ],
        },
      },
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
 * Optional:
 * - &view=headcount|ot
 * - hierarchy filters: &unit=...&department=...&section=...&line=...
 * - legacy fallback: &groupBy=unit|section|department|line&groupValue=...
 *
 * Important: camera selection on the headcount page is ONLY for capture/streaming.
 * The table is computed for the selected date (no camera filtering).
 *
 * view=headcount:
 * - MATCH   => employee appears in BOTH headcount and attendance for the selected day
 * - UNMATCH => employee appears in headcount but NOT in attendance for the selected day
 * - ABSENT  => employee appears in attendance but NOT in headcount for the selected day
 *
 * view=ot: returns only headcount rows (no attendance cross-check)
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

    const viewRaw = String(
      req.query?.view ?? req.query?.view_type ?? req.query?.mode ?? ""
    )
      .trim()
      .toLowerCase();
    const view: "headcount" | "ot" =
      viewRaw === "ot" ||
      viewRaw === "ot-requisition" ||
      viewRaw === "ot_requisition" ||
      viewRaw === "otrequisition"
        ? "ot"
        : "headcount";

    const unitRaw = normalizeHierarchyValue(
      req.query?.unit ?? req.query?.unit_name ?? ""
    );
    const departmentRaw = normalizeHierarchyValue(
      req.query?.department ?? req.query?.department_name ?? ""
    );
    const sectionRaw = normalizeHierarchyValue(
      req.query?.section ?? req.query?.section_name ?? ""
    );
    const lineRaw = normalizeHierarchyValue(
      req.query?.line ?? req.query?.line_name ?? ""
    );

    const groupByRaw = String(
      req.query?.groupBy ?? req.query?.group_by ?? req.query?.by ?? ""
    )
      .trim()
      .toLowerCase();
    const groupValueRaw = String(
      req.query?.groupValue ?? req.query?.group_value ?? req.query?.value ?? ""
    ).trim();

    const allowedGroupBys = new Set(["unit", "section", "department", "line"]);

    if (groupByRaw && !allowedGroupBys.has(groupByRaw)) {
      return res.status(400).json({
        error: "Invalid groupBy",
        allowed: Array.from(allowedGroupBys),
        example: "/headcount?groupBy=department&groupValue=Business%20Innovation",
      });
    }

    const groupBy = groupByRaw as "" | "unit" | "section" | "department" | "line";
    const groupValue = normalizeHierarchyValue(groupValueRaw);

    if (groupBy && !groupValue && !unitRaw && !departmentRaw && !sectionRaw && !lineRaw) {
      return res.status(400).json({
        error: "groupValue is required when groupBy is provided",
      });
    }

    const unitFilter = unitRaw ?? (groupBy === "unit" ? groupValue : null);
    const departmentFilter =
      departmentRaw ?? (groupBy === "department" ? groupValue : null);
    const sectionFilter =
      sectionRaw ?? (groupBy === "section" ? groupValue : null);
    const lineFilter = lineRaw ?? (groupBy === "line" ? groupValue : null);

    const employeeWhere: any = {
      companyId,
      ...(unitFilter ? { unit: unitFilter } : {}),
      ...(departmentFilter ? { department: departmentFilter } : {}),
      ...(sectionFilter ? { section: sectionFilter } : {}),
      ...(lineFilter ? { line: lineFilter } : {}),
      ...(q.length
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" } },
              { empId: { contains: q, mode: "insensitive" } },
              { id: { equals: q } },
            ],
          }
        : {}),
    };

    if (view === "ot") {
      const headLastByEmployee = await prisma.otRequisition.findMany({
        where: {
          companyId,
          timestamp: { gte: start, lt: end },
        },
        distinct: ["employeeId"],
        orderBy: [{ employeeId: "asc" }, { updatedAt: "desc" }],
        select: {
          employeeId: true,
          timestamp: true,
          cameraId: true,
          confidence: true,
          notes: true,
        },
      });

      const headIds = headLastByEmployee
        .map((x) => x.employeeId)
        .filter((x): x is string => Boolean(x));

      if (headIds.length === 0) return res.json([]);

      const employees = await prisma.employee.findMany({
        where: { ...employeeWhere, id: { in: headIds } },
        select: {
          id: true,
          name: true,
          empId: true,
          unit: true,
          department: true,
          section: true,
          line: true,
        },
        take: 50000,
      });

      if (employees.length === 0) return res.json([]);

      const employeeMap = new Map(employees.map((e) => [e.id, e]));
      const employeeIds = new Set(employees.map((e) => e.id));

      const headLastMap = new Map(
        headLastByEmployee
          .filter(
            (x): x is typeof x & { employeeId: string } =>
              Boolean(x.employeeId) && employeeIds.has(String(x.employeeId)),
          )
          .map((x) => [String(x.employeeId), x]),
      );

      const allCamIds: string[] = [];
      for (const employeeId of headLastMap.keys()) {
        const camId = headLastMap.get(employeeId)?.cameraId;
        if (camId) allCamIds.push(String(camId));
      }

      const cams = allCamIds.length
        ? await prisma.camera.findMany({
            where: { id: { in: allCamIds } },
            select: { id: true, name: true },
          })
        : [];

      const camName = new Map(cams.map((c) => [c.id, c.name]));

      type OtRow = {
        id: string;
        date: string;

        name: string;
        employeeId: string;
        unit: string | null;
        department: string | null;
        section: string | null;
        line: string | null;

        headcountCameraId: string | null;
        headcountCameraName: string | null;
        headcountFirstEntryTime: string | null;
        headcountLastEntryTime: string | null;
        headcountTime: string | null;
        headcountConfidence: number | null;

        timestamp: string | null;
      };

      const rows: OtRow[] = Array.from(headLastMap.keys()).map(
        (employeePkId) => {
          const emp = employeeMap.get(employeePkId);
          const publicEmployeeId = emp?.empId ?? employeePkId;

          const head = headLastMap.get(employeePkId) as any;
          const headFirst = parseFirstSeenFromNotes(head?.notes ?? null);
          const headLast = head?.timestamp ?? null;

          return {
            id: `${employeePkId}:${dateStr}`,
            date: dateStr,

            name: emp?.name ?? "Unknown",
            employeeId: publicEmployeeId,
            unit: emp?.unit ?? null,
            department: emp?.department ?? null,
            section: emp?.section ?? null,
            line: emp?.line ?? null,

            headcountCameraId: head?.cameraId ?? null,
            headcountCameraName:
              head?.cameraId ? camName.get(String(head.cameraId)) ?? null : null,
            headcountFirstEntryTime: toISOStringOrNull(headFirst),
            headcountLastEntryTime: toISOStringOrNull(headLast),
            headcountTime: toISOStringOrNull(headLast),
            headcountConfidence:
              typeof head?.confidence === "number" ? head.confidence : null,

            timestamp: toISOStringOrNull(headLast),
          };
        },
      );

      rows.sort((a, b) => {
        const ta = a.headcountTime ? Date.parse(a.headcountTime) : 0;
        const tb = b.headcountTime ? Date.parse(b.headcountTime) : 0;
        if (ta !== tb) return tb - ta;

        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        if (na !== nb) return na.localeCompare(nb);

        return String(a.employeeId || "").localeCompare(
          String(b.employeeId || ""),
        );
      });

      return res.json(rows);
    }

    // 1) Employees to include (company + optional group + optional search)
    const candidates = await prisma.employee.findMany({
      where: employeeWhere,
      select: { id: true },
      take: 50000,
    });

    if (candidates.length === 0) return res.json([]);

    const candidateIds = candidates.map((e) => e.id);

    const baseDayWhere: any = {
      companyId,
      timestamp: { gte: start, lt: end },
      employeeId: { in: candidateIds },
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
        employeeId: { in: candidateIds },
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

    const attLastMap = new Map(attLastByEmployee.map((x) => [x.employeeId, x]));
    const attFirstMap = new Map(attFirstByEmployee.map((x) => [x.employeeId, x]));
    const headLastMap = new Map(
      headLastByEmployee
        .filter((x): x is typeof x & { employeeId: string } => Boolean(x.employeeId))
        .map((x) => [String(x.employeeId), x]),
    );

    const attendanceIds = new Set(attLastByEmployee.map((x) => x.employeeId));
    const headIds = new Set(Array.from(headLastMap.keys()));
    const employeeIds = Array.from(
      new Set([...Array.from(attendanceIds), ...Array.from(headIds)]),
    );

    if (employeeIds.length === 0) return res.json([]);

    const employees = await prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: {
        id: true,
        name: true,
        empId: true,
        unit: true,
        department: true,
        section: true,
        line: true,
      },
      take: 50000,
    });

    const employeeMap = new Map(employees.map((e) => [e.id, e]));

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
      unit: string | null;
      department: string | null;
      section: string | null;
      line: string | null;

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

      status: HeadcountStatus;
      timestamp: string | null;
    };

    const rows: Row[] = employeeIds.map((employeePkId) => {
      const emp = employeeMap.get(employeePkId);
      const publicEmployeeId = emp?.empId ?? employeePkId;

      const head = headLastMap.get(employeePkId);
      const attLast = attLastMap.get(employeePkId);
      const attFirst = attFirstMap.get(employeePkId);

      const hasHead = Boolean(head);
      const hasAttendance = Boolean(attLast);

      let status: Row["status"];
      if (hasHead && hasAttendance) status = "MATCH";
      else if (hasHead && !hasAttendance) status = "UNMATCH";
      else status = "ABSENT";

      const headFirst = parseFirstSeenFromNotes(head?.notes ?? null);
      const headLast = head?.timestamp ?? null;
      const timestamp = headLast ?? attLast?.timestamp ?? null;

      return {
        id: `${employeePkId}:${dateStr}`,
        date: dateStr,

        name: emp?.name ?? "Unknown",
        employeeId: publicEmployeeId,
        unit: emp?.unit ?? null,
        department: emp?.department ?? null,
        section: emp?.section ?? null,
        line: emp?.line ?? null,

        headcountCameraId: hasHead ? (head?.cameraId ?? null) : null,
        headcountCameraName:
          hasHead && head?.cameraId
            ? camName.get(String(head.cameraId)) ?? null
            : null,
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
        timestamp: toISOStringOrNull(timestamp ?? null),

        status,
      };
    });

    // Sort: MATCH first, then UNMATCH, then ABSENT; within group by name/id
    const rank = (s: Row["status"]) =>
      s === "MATCH" ? 0 : s === "UNMATCH" ? 1 : 2;

    rows.sort((a, b) => {
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

    return res.json(rows);
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
