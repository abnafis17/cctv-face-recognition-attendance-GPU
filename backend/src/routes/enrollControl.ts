import { Router } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { employeePublicId, findEmployeeByAnyId } from "../utils/employee";
import { findCameraByAnyId } from "../utils/camera";

const r = Router();
const AI = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

type AllowedAngle = "front" | "left" | "right" | "up" | "down";
const ALLOWED_ANGLES: AllowedAngle[] = ["front", "left", "right", "up", "down"];

function isAllowedAngle(v: any): v is AllowedAngle {
  return (
    typeof v === "string" &&
    (ALLOWED_ANGLES as string[]).includes(v.toLowerCase())
  );
}

/**
 * START ENROLL SESSION
 * - Supports:
 *   1) New employee scan: { name, cameraId }
 *   2) Existing employee scan: { employeeId, cameraId }
 *   3) Create employee without scanning: { name, allowNoScan: true }
 *
 * IMPORTANT FIX:
 * - If employeeId is missing, reuse employee by exact name to prevent duplicates.
 */
r.post("/start", async (req, res) => {
  try {
    const { name, employeeId, cameraId, allowNoScan } = req.body as {
      name?: string;
      employeeId?: string | null;
      cameraId?: string;
      allowNoScan?: boolean;
    };

    const empId = (employeeId ?? "").toString().trim();
    const camId = (cameraId ?? "").toString().trim();
    const nm = (name ?? "").toString().trim();

    // Case: "Enroll without scanning" -> create/reuse employee only
    if (allowNoScan) {
      if (!nm)
        return res
          .status(400)
          .json({ error: "name is required for no-scan enrollment" });

      // ✅ reuse by name first
      const existing = await prisma.employee.findFirst({ where: { name: nm } });
      if (existing)
        return res.json({ ok: true, mode: "no-scan", employee: existing });

      const emp = await prisma.employee.create({ data: { name: nm } });
      return res.json({ ok: true, mode: "no-scan", employee: emp });
    }

    // Scanning requires a camera
    if (!camId) return res.status(400).json({ error: "cameraId is required" });

    const cam = await findCameraByAnyId(String(camId));
    if (!cam) return res.status(404).json({ error: "Camera not found" });

    // Resolve employee
    let employee = null;

    if (empId) {
      employee = await findEmployeeByAnyId(empId);
      if (!employee)
        return res.status(404).json({ error: "Employee not found" });
    } else {
      if (!nm)
        return res
          .status(400)
          .json({ error: "name is required for new employee enrollment" });

      // ✅ reuse by name first to prevent duplicates
      const existing = await prisma.employee.findFirst({ where: { name: nm } });
      employee =
        existing ?? (await prisma.employee.create({ data: { name: nm } }));
    }

    // Prevent overwriting an already-enrolled employee (templates already exist)
    const hasTemplate = await prisma.faceTemplate.findFirst({
      where: { employeeId: employee.id },
      select: { id: true },
    });
    if (hasTemplate) {
      return res
        .status(409)
        .json({ ok: false, error: "Already enrolled", employee });
    }

    // Start AI enroll session (AI will capture + save templates via BackendClient)
    const ai = await axios.post(`${AI}/enroll/session/start`, {
      name: employee.name,
      employeeId: employeePublicId(employee),
      cameraId: cam.id,
    });

    return res.json({ ok: true, employee, ai: ai.data });
  } catch (e: any) {
    return res
      .status(500)
      .json({ error: e?.message ?? "Failed to start enroll" });
  }
});

r.post("/stop", async (_req, res) => {
  try {
    const ai = await axios.post(`${AI}/enroll/session/stop`);
    res.json(ai.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to stop enroll" });
  }
});

r.get("/status", async (_req, res) => {
  try {
    const ai = await axios.get(`${AI}/enroll/session/status`);
    res.json(ai.data);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: e?.message ?? "Failed to get enroll status" });
  }
});

r.post("/angle", async (req, res) => {
  try {
    const angleRaw = req.body?.angle;
    if (!isAllowedAngle(angleRaw)) {
      return res.status(400).json({
        error: `Invalid angle. Allowed: ${ALLOWED_ANGLES.join(", ")}`,
      });
    }
    const angle = angleRaw.toLowerCase();
    const ai = await axios.post(`${AI}/enroll/session/angle`, { angle });
    res.json(ai.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to set angle" });
  }
});

r.post("/capture", async (req, res) => {
  try {
    const angleRaw = req.body?.angle;
    if (angleRaw && !isAllowedAngle(angleRaw)) {
      return res.status(400).json({
        error: `Invalid angle. Allowed: ${ALLOWED_ANGLES.join(", ")}`,
      });
    }
    const payload = angleRaw ? { angle: angleRaw.toLowerCase() } : undefined;
    const ai = await axios.post(`${AI}/enroll/session/capture`, payload);
    res.json(ai.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to capture" });
  }
});

r.post("/save", async (_req, res) => {
  try {
    const ai = await axios.post(`${AI}/enroll/session/save`);
    res.json(ai.data);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: e?.message ?? "Failed to save enrollment templates" });
  }
});

r.post("/cancel", async (_req, res) => {
  try {
    const ai = await axios.post(`${AI}/enroll/session/cancel`);
    res.json(ai.data);
  } catch (e: any) {
    res
      .status(500)
      .json({ error: e?.message ?? "Failed to cancel enrollment captures" });
  }
});

r.post("/clear-angle", async (req, res) => {
  try {
    const angle = String(req.body?.angle || "").toLowerCase();
    const ai = await axios.post(`${AI}/enroll/session/clear-angle`, { angle });
    res.json(ai.data);
  } catch (e: any) {
    res.status(500).json({ error: e?.message ?? "Failed to clear angle" });
  }
});

export default r;
