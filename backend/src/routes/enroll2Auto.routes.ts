import { Router } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { findEmployeeByAnyId } from "../utils/employee";

const r = Router();
const AI_BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

function toBoolean(value: unknown): boolean {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }
  return false;
}

function normalizeOptionalHierarchy(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const normalized = text.toLowerCase();
  if (
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

// POST /api/v1/enroll2-auto/session/start
r.post("/session/start", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { employeeId, name, cameraId, reEnroll, unit, department, section, line } =
      req.body || {};
    const isReEnroll = toBoolean(reEnroll);

    const identifier = String(employeeId ?? "").trim();
    const employeeName = String(name ?? "").trim();
    const body = req.body || {};
    const hasUnit = Object.prototype.hasOwnProperty.call(body, "unit");
    const hasDepartment = Object.prototype.hasOwnProperty.call(
      body,
      "department",
    );
    const hasSection = Object.prototype.hasOwnProperty.call(body, "section");
    const hasLine = Object.prototype.hasOwnProperty.call(body, "line");

    let employee = null as Awaited<ReturnType<typeof findEmployeeByAnyId>> | null;
    if (identifier) {
      employee = await findEmployeeByAnyId(identifier, companyId);

      const hierarchyData: {
        unit?: string | null;
        department?: string | null;
        section?: string | null;
        line?: string | null;
      } = {};

      if (hasUnit) hierarchyData.unit = normalizeOptionalHierarchy(unit);
      if (hasDepartment)
        hierarchyData.department = normalizeOptionalHierarchy(department);
      if (hasSection) hierarchyData.section = normalizeOptionalHierarchy(section);
      if (hasLine) hierarchyData.line = normalizeOptionalHierarchy(line);

      if (employee) {
        employee = await prisma.employee.update({
          where: { id: employee.id },
          data: {
            ...(employeeName ? { name: employeeName } : {}),
            ...(employee.empId ? {} : { empId: identifier }),
            ...hierarchyData,
          },
        });

        const hasTemplate = await prisma.faceTemplate.findFirst({
          where: { employeeId: employee.id, companyId },
          select: { id: true },
        });
        if (hasTemplate) {
          if (!isReEnroll) {
            return res.status(409).json({
              ok: false,
              error: "Already enrolled",
              employee: { id: employee.id, empId: employee.empId, name: employee.name },
            });
          }

          await prisma.faceTemplate.deleteMany({
            where: { employeeId: employee.id },
          });
        }
      } else {
        employee = await prisma.employee.create({
          data: {
            companyId,
            empId: identifier,
            name: employeeName || "Unknown",
            ...(hasUnit ? { unit: normalizeOptionalHierarchy(unit) } : {}),
            ...(hasDepartment
              ? { department: normalizeOptionalHierarchy(department) }
              : {}),
            ...(hasSection ? { section: normalizeOptionalHierarchy(section) } : {}),
            ...(hasLine ? { line: normalizeOptionalHierarchy(line) } : {}),
          },
        });
      }
    }

    const resp = await axios.post(
      `${AI_BASE}/enroll2/auto/session/start`,
      {
        employeeId,
        name: employeeName || name,
        cameraId,
      },
      {
        headers: companyId ? { "x-company-id": companyId } : undefined,
      }
    );
    return res.status(resp.status).json(resp.data);
  } catch (err: any) {
    console.error("enroll2-auto start failed:", err?.response?.data || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to start enroll2-auto" });
  }
});

// POST /api/v1/enroll2-auto/session/stop
r.post("/session/stop", async (_req, res) => {
  try {
    const companyId = String((_req as any).companyId ?? "");
    const resp = await axios.post(`${AI_BASE}/enroll2/auto/session/stop`, null, {
      headers: companyId ? { "x-company-id": companyId } : undefined,
    });
    return res.status(resp.status).json(resp.data);
  } catch (err: any) {
    console.error("enroll2-auto stop failed:", err?.response?.data || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to stop enroll2-auto" });
  }
});

// GET /api/v1/enroll2-auto/session/status
r.get("/session/status", async (_req, res) => {
  try {
    const companyId = String((_req as any).companyId ?? "");
    const resp = await axios.get(`${AI_BASE}/enroll2/auto/session/status`, {
      headers: companyId ? { "x-company-id": companyId } : undefined,
    });
    return res.status(resp.status).json(resp.data);
  } catch (err: any) {
    console.error("enroll2-auto status failed:", err?.response?.data || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch enroll2-auto status" });
  }
});

export default r;
