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

// POST /api/v1/enroll2-auto/session/start
r.post("/session/start", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { employeeId, name, cameraId, reEnroll } = req.body || {};
    const isReEnroll = toBoolean(reEnroll);

    const identifier = String(employeeId ?? "").trim();
    if (identifier) {
      const employee = await findEmployeeByAnyId(identifier, companyId);
      if (employee) {
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
      }
    }

    const resp = await axios.post(
      `${AI_BASE}/enroll2/auto/session/start`,
      {
        employeeId,
        name,
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
