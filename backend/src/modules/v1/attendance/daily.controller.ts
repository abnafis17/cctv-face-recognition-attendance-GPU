import { Request, Response } from "express";
import { prisma } from "../../../prisma";

function getCompanyId(req: Request): string | null {
  // ✅ consistent with your other controllers
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

/**
 * GET /attendance/daily?date=YYYY-MM-DD&q=searchText
 * q matches Employee.name OR Employee.empId (case-insensitive)
 */
export async function listDailyAttendance(req: Request, res: Response) {
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

    // ✅ If search is provided, resolve matching employees first (best perf + simplest logic)
    let searchEmployeeIds: string[] | null = null;

    if (q.length > 0) {
      const matchedEmployees = await prisma.employee.findMany({
        where: {
          companyId,
          OR: [
            { name: { contains: q, mode: "insensitive" } },
            { empId: { contains: q, mode: "insensitive" } },
            // optional exact match on internal id if someone pastes it
            { id: { equals: q } },
          ],
        },
        select: { id: true },
        take: 5000, // safety cap
      });

      if (matchedEmployees.length === 0) return res.json([]);

      searchEmployeeIds = matchedEmployees.map((e) => e.id);
    }

    const baseWhere: any = {
      companyId,
      timestamp: { gte: start, lt: end },
      ...(searchEmployeeIds ? { employeeId: { in: searchEmployeeIds } } : {}),
    };

    // ✅ Correct distinct ordering for Postgres:
    // orderBy must start with the distinct field to be deterministic.
    const firstByEmployee = await prisma.attendance.findMany({
      where: baseWhere,
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { timestamp: "asc" }],
      select: { employeeId: true, timestamp: true },
    });

    const lastByEmployee = await prisma.attendance.findMany({
      where: baseWhere,
      distinct: ["employeeId"],
      orderBy: [{ employeeId: "asc" }, { timestamp: "desc" }],
      select: {
        id: true,
        employeeId: true,
        timestamp: true,
        cameraId: true,
        confidence: true,
      },
    });

    const employeeIds = Array.from(
      new Set([
        ...firstByEmployee.map((x) => x.employeeId),
        ...lastByEmployee.map((x) => x.employeeId),
      ]),
    );

    if (employeeIds.length === 0) return res.json([]);

    const employees = await prisma.employee.findMany({
      where: { companyId, id: { in: employeeIds } },
      select: { id: true, name: true, empId: true },
    });
    const employeeMap = new Map(employees.map((e) => [e.id, e]));

    const cameraIds = Array.from(
      new Set(lastByEmployee.map((x) => x.cameraId).filter(Boolean)),
    ) as string[];

    const cameras = cameraIds.length
      ? await prisma.camera.findMany({
          where: { id: { in: cameraIds } },
          select: { id: true, name: true },
        })
      : [];

    const cameraMap = new Map(cameras.map((c) => [c.id, c.name]));

    const firstMap = new Map(firstByEmployee.map((x) => [x.employeeId, x]));
    const lastMap = new Map(lastByEmployee.map((x) => [x.employeeId, x]));

    const rows = employeeIds
      .map((employeePkId) => {
        const emp = employeeMap.get(employeePkId);
        const first = firstMap.get(employeePkId);
        const last = lastMap.get(employeePkId);

        const publicEmployeeId = emp?.empId ?? employeePkId;

        return {
          id: `${employeePkId}:${dateStr}`,

          name: emp?.name ?? "Unknown",
          employeeId: publicEmployeeId,
          cameraName: last?.cameraId
            ? (cameraMap.get(last.cameraId) ?? null)
            : null,
          confidence:
            typeof last?.confidence === "number" ? last.confidence : null,
          timestamp: last?.timestamp ? last.timestamp.toISOString() : null,

          firstEntryTime: first?.timestamp
            ? first.timestamp.toISOString()
            : null,
          lastEntryTime: last?.timestamp ? last.timestamp.toISOString() : null,

          date: dateStr,
        };
      })
      .sort((a, b) => {
        const ta = a.firstEntryTime
          ? Date.parse(a.firstEntryTime)
          : Number.POSITIVE_INFINITY;
        const tb = b.firstEntryTime
          ? Date.parse(b.firstEntryTime)
          : Number.POSITIVE_INFINITY;

        // 1) earliest firstEntryTime first
        if (ta !== tb) return ta - tb;

        // 2) stable tie-breaker by name
        const na = (a.name || "").toLowerCase();
        const nb = (b.name || "").toLowerCase();
        if (na !== nb) return na.localeCompare(nb);

        // 3) stable tie-breaker by employeeId
        return String(a.employeeId || "").localeCompare(
          String(b.employeeId || ""),
        );
      });

    return res.json(rows);
  } catch (e: any) {
    console.error("listDailyAttendance failed:", e);
    return res.status(500).json({
      error: "Failed to load daily attendance",
      detail: e?.message ?? String(e),
    });
  }
}
