import { Request, Response } from "express";
import { prisma } from "../../../prisma";
import { getHeadcountEvents } from "../../../services/headcountEvents";

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
    const d = new Date(String(notes));
    return Number.isNaN(d.getTime()) ? null : d;
  }
}

export async function listHeadcountCameras(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const cams = await prisma.camera.findMany({
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

    return res.json({
      cameras: cams.map((c) => ({
        id: c.id,
        name: c.name,
        rtspUrl: c.rtspUrl,
        isActive: Boolean(c.isActive),
      })),
    });
  } catch (err: any) {
    console.error("listHeadcountCameras error:", err);
    return res.status(500).json({ error: "Failed to load headcount cameras" });
  }
}

export async function headcountEvents(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId)
      return res.status(400).json({ error: "Missing company id" });

    const afterId = Number.parseInt(String(req.query.afterId ?? "0"), 10) || 0;
    const limit = Math.min(
      500,
      Math.max(1, Number.parseInt(String(req.query.limit ?? "50"), 10) || 50),
    );

    const data = await getHeadcountEvents({ companyId, afterSeq: afterId, limit });
    return res.json({
      events: data.events,
      latestId: data.latest_seq,
    });
  } catch (err: any) {
    console.error("headcountEvents error:", err);
    return res.status(500).json({ error: "Failed to fetch headcount events" });
  }
}

export async function listHeadcount(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) {
      return res.status(400).json({ error: "Missing company id" });
    }

    const dateStrRaw = String(req.query.date ?? "").trim();
    const dateStr =
      dateStrRaw && isYYYYMMDD(dateStrRaw)
        ? dateStrRaw
        : dhakaTodayYYYYMMDD();
    const { start, end } = dhakaDayRange(dateStr);

    const selectedDepartment = normalizeHierarchyValue(req.query.department);
    const selectedLine = normalizeHierarchyValue(req.query.line);
    const selectedSection = normalizeHierarchyValue(req.query.section);
    const selectedUnit = normalizeHierarchyValue(req.query.unit);

    const employeeFilter: any = { companyId };
    if (selectedDepartment) employeeFilter.department = selectedDepartment;
    if (selectedLine) employeeFilter.line = selectedLine;
    if (selectedSection) employeeFilter.section = selectedSection;
    if (selectedUnit) employeeFilter.unit = selectedUnit;

    const [allCompanyEmployees, attRecords, headcountRecords, otRecords] =
      await Promise.all([
        prisma.employee.findMany({
          where: employeeFilter,
          select: {
            id: true,
            empId: true,
            name: true,
            department: true,
            line: true,
            section: true,
            unit: true,
          },
          take: 10000,
        }),
        prisma.attendance.findMany({
          where: {
            companyId,
            timestamp: { gte: start, lt: end },
          },
          select: {
            employeeId: true,
            timestamp: true,
            camera: { select: { id: true, name: true } },
          },
          take: 50000,
        }),
        prisma.headcount.findMany({
          where: {
            companyId,
            timestamp: { gte: start, lt: end },
          },
          select: {
            employeeId: true,
            timestamp: true,
            notes: true,
            camera: { select: { id: true, name: true } },
          },
          take: 50000,
        }),
        prisma.otRequisition.findMany({
          where: {
            companyId,
            timestamp: { gte: start, lt: end },
          },
          select: {
            employeeId: true,
            notes: true,
            timestamp: true,
          },
          take: 50000,
        }),
      ]);

    const attMap = new Map<string, { inTime: Date; outTime: Date | null }>();
    for (const r of attRecords) {
      const existing = attMap.get(r.employeeId);
      if (!existing) {
        attMap.set(r.employeeId, { inTime: r.timestamp, outTime: null });
      } else {
        if (r.timestamp < existing.inTime) existing.inTime = r.timestamp;
        if (!existing.outTime || r.timestamp > existing.outTime) {
          existing.outTime = r.timestamp;
        }
      }
    }

    const headcountMap = new Map<
      string,
      { count: number; lastSeen: Date; cameraName: string | null; firstSeen: Date | null }
    >();

    for (const hc of headcountRecords) {
      if (!hc.employeeId) continue;
      const existing = headcountMap.get(hc.employeeId);
      const fs = parseFirstSeenFromNotes(hc.notes) ?? hc.timestamp;
      const camName = hc.camera?.name ?? null;

      if (!existing) {
        headcountMap.set(hc.employeeId, {
          count: 1,
          lastSeen: hc.timestamp,
          cameraName: camName,
          firstSeen: fs,
        });
      } else {
        existing.count += 1;
        if (hc.timestamp > existing.lastSeen) {
          existing.lastSeen = hc.timestamp;
          if (camName) existing.cameraName = camName;
        }
        if (!existing.firstSeen || fs < existing.firstSeen) {
          existing.firstSeen = fs;
        }
      }
    }

    const otMap = new Map<string, { hours: number; approved: boolean; status: string }>();
    for (const ot of otRecords) {
      if (ot.employeeId) {
        let hours = 0;
        let approved = false;
        let status = "PENDING";
        if (ot.notes) {
          try {
            const parsed = JSON.parse(ot.notes);
            hours = Number(parsed.hours ?? 0);
            approved = Boolean(parsed.approved);
            status = String(parsed.status ?? "PENDING");
          } catch {
            // fallback
          }
        }
        otMap.set(ot.employeeId, { hours, approved, status });
      }
    }

    const rows = allCompanyEmployees.map((emp) => {
      const att = attMap.get(emp.id);
      const hc = headcountMap.get(emp.id);
      const ot = otMap.get(emp.id);

      const inTime = att ? att.inTime : null;
      const outTime = att && att.outTime && att.outTime > att.inTime ? att.outTime : null;
      const headcountCount = hc ? hc.count : 0;
      const headcountLastSeen = hc ? hc.lastSeen : null;

      let status: HeadcountStatus = "ABSENT";
      if (inTime && headcountCount > 0) {
        status = "MATCH";
      } else if (inTime && headcountCount === 0) {
        status = "UNMATCH";
      }

      return {
        id: emp.id,
        empId: emp.empId ?? emp.id,
        name: emp.name,
        department: emp.department ?? "N/A",
        line: emp.line ?? "N/A",
        section: emp.section ?? "N/A",
        unit: emp.unit ?? "N/A",
        inTime: toISOStringOrNull(inTime),
        outTime: toISOStringOrNull(outTime),
        headcountCount,
        headcountFirstSeen: toISOStringOrNull(hc?.firstSeen ?? null),
        headcountLastSeen: toISOStringOrNull(headcountLastSeen),
        cameraName: hc?.cameraName ?? null,
        status,
        otRequisition: ot
          ? { hours: ot.hours, approved: ot.approved, status: ot.status }
          : null,
      };
    });

    return res.json({
      date: dateStr,
      totalEmployees: allCompanyEmployees.length,
      matchedCount: rows.filter((r) => r.status === "MATCH").length,
      unmatchedCount: rows.filter((r) => r.status === "UNMATCH").length,
      absentCount: rows.filter((r) => r.status === "ABSENT").length,
      records: rows,
    });
  } catch (err: any) {
    console.error("listHeadcount error:", err);
    return res.status(500).json({ error: "Failed to load headcount records" });
  }
}
