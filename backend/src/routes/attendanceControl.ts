import { Router } from "express";
import axios from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";

const r = Router();
const AI = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);
const AI_ATTENDANCE_TIMEOUT_MS = Number(
  process.env.AI_ATTENDANCE_TIMEOUT_MS || 5000,
);
const cameraHasAttendanceField = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Camera")
  ?.fields.some((f) => f.name === "attendance");
const attendanceStateCache = new Map<string, boolean>();

function attendanceCacheKeys(
  companyId: string,
  camera: { id: string; camId?: string | null },
  fallbackCameraId?: string
) {
  const keys = new Set<string>();
  if (companyId && camera.id) keys.add(`${companyId}:${camera.id}`);
  const camId = String(camera.camId ?? "").trim();
  if (companyId && camId) keys.add(`${companyId}:${camId}`);
  const raw = String(fallbackCameraId ?? "").trim();
  if (companyId && raw) keys.add(`${companyId}:${raw}`);
  return [...keys];
}

function readCameraId(req: any): string {
  const raw =
    req?.body?.cameraId ??
    req?.body?.camera_id ??
    req?.query?.cameraId ??
    req?.query?.camera_id ??
    "";
  return String(raw || "").trim();
}

async function persistCameraAttendance(
  companyId: string,
  cameraId: string,
  enabled: boolean
) {
  if (!companyId || !cameraId) return;

  const camera = await findCameraByAnyId(cameraId, companyId);
  if (!camera) return;

  for (const key of attendanceCacheKeys(companyId, camera, cameraId)) {
    attendanceStateCache.set(key, enabled);
  }

  if (!cameraHasAttendanceField) return;

  await prisma.camera.update({
    where: { id: camera.id },
    data: { attendance: enabled } as any,
  });
}

async function readPersistedAttendance(companyId: string, cameraId: string) {
  if (!companyId || !cameraId) return null;

  const camera = await findCameraByAnyId(cameraId, companyId);
  if (!camera) return null;

  if (cameraHasAttendanceField) {
    return Boolean((camera as any).attendance);
  }

  for (const key of attendanceCacheKeys(companyId, camera, cameraId)) {
    if (attendanceStateCache.has(key)) {
      return Boolean(attendanceStateCache.get(key));
    }
  }

  return null;
}

async function toggleAttendance(req: any, res: any, enabled: boolean) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const cameraId = readCameraId(req);
    if (!cameraId) {
      return res.status(400).json({ ok: false, error: "cameraId is required" });
    }
    const endpoint = enabled ? "/attendance/enable" : "/attendance/disable";
    const ai = await axios.post(`${AI}${endpoint}`, null, {
      params: { camera_id: cameraId },
      headers: companyId ? { "x-company-id": companyId } : undefined,
      timeout: AI_ATTENDANCE_TIMEOUT_MS,
    });

    await persistCameraAttendance(companyId, cameraId, enabled);

    return res.status(ai.status).json({
      ...ai.data,
      enabled,
      running: enabled,
      attendance: enabled,
    });
  } catch (err: any) {
    console.error("attendance toggle failed:", err?.message ?? err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to update attendance state" });
  }
}

r.post("/enable", async (req, res) => {
  return toggleAttendance(req, res, true);
});

r.post("/disable", async (req, res) => {
  return toggleAttendance(req, res, false);
});

r.get("/status", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const cameraId = readCameraId(req);
    if (!cameraId) {
      return res.status(400).json({ ok: false, error: "cameraId is required" });
    }
    const ai = await axios.get(`${AI}/attendance/enabled`, {
      params: { camera_id: cameraId },
      headers: companyId ? { "x-company-id": companyId } : undefined,
      timeout: AI_ATTENDANCE_TIMEOUT_MS,
    });
    const enabled = Boolean((ai.data as any)?.enabled);

    await persistCameraAttendance(companyId, cameraId, enabled);

    return res.status(ai.status).json({
      ...ai.data,
      enabled,
      running: enabled,
      attendance: enabled,
    });
  } catch (err: any) {
    const companyId = String((req as any).companyId ?? "");
    const cameraId = readCameraId(req);

    try {
      const enabled = await readPersistedAttendance(companyId, cameraId);
      if (enabled !== null) {
        return res.status(200).json({
          ok: true,
          enabled,
          running: enabled,
          attendance: enabled,
          source: cameraHasAttendanceField ? "db" : "cache",
        });
      }
    } catch (dbErr: any) {
      console.error("attendance status db fallback failed:", dbErr?.message ?? dbErr);
    }

    if (err?.code !== "ECONNREFUSED") {
      console.error("attendance status failed:", err?.message ?? err);
    }
    return res
      .status(500)
      .json({ ok: false, error: "Failed to get attendance status" });
  }
});

r.post("/start", async (req, res) => {
  return toggleAttendance(req, res, true);
});

r.post("/stop", async (req, res) => {
  return toggleAttendance(req, res, false);
});

r.get("/voice-events", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const afterSeqRaw = (req.query.afterSeq ?? req.query.after_seq ?? 0) as any;
    const limitRaw = (req.query.limit ?? 50) as any;
    const waitMsRaw = (req.query.waitMs ?? req.query.wait_ms ?? 0) as any;

    const after_seq = Number(afterSeqRaw || 0) || 0;
    const limit = Math.min(Math.max(Number(limitRaw || 50) || 50, 1), 200);
    const wait_ms = Math.min(Math.max(Number(waitMsRaw || 0) || 0, 0), 300_000);

    const ai = await axios.get(`${AI}/attendance/voice-events`, {
      params: { after_seq, limit, wait_ms },
      headers: companyId ? { "x-company-id": companyId } : undefined,
      timeout: Math.max(AI_ATTENDANCE_TIMEOUT_MS, wait_ms + 5000),
    });
    return res.status(ai.status).json(ai.data);
  } catch (err: any) {
    if (err?.code !== "ECONNREFUSED") {
      console.error("attendance voice-events failed:", err?.message ?? err);
    }

    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch attendance voice events" });
  }
});

export default r;
