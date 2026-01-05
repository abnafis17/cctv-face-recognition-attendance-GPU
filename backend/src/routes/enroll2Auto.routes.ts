import { Router } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { findEmployeeByAnyId } from "../utils/employee";

const r = Router();
const AI_BASE = process.env.AI_BASE_URL || "http://127.0.0.1:8000";

// POST /api/v1/enroll2-auto/session/start
r.post("/session/start", async (req, res) => {
  try {
    const { employeeId, name, cameraId } = req.body || {};

    const identifier = String(employeeId ?? "").trim();
    if (identifier) {
      const employee = await findEmployeeByAnyId(identifier);
      if (employee) {
        const hasTemplate = await prisma.faceTemplate.findFirst({
          where: { employeeId: employee.id },
          select: { id: true },
        });
        if (hasTemplate) {
          return res.status(409).json({
            ok: false,
            error: "Already enrolled",
            employee: { id: employee.id, empId: employee.empId, name: employee.name },
          });
        }
      }
    }

    const resp = await axios.post(`${AI_BASE}/enroll2/auto/session/start`, {
      employeeId,
      name,
      cameraId,
    });
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
    const resp = await axios.post(`${AI_BASE}/enroll2/auto/session/stop`);
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
    const resp = await axios.get(`${AI_BASE}/enroll2/auto/session/status`);
    return res.status(resp.status).json(resp.data);
  } catch (err: any) {
    console.error("enroll2-auto status failed:", err?.response?.data || err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch enroll2-auto status" });
  }
});

export default r;
