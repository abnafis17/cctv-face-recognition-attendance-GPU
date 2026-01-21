import { Router } from "express";
import axios from "axios";

const r = Router();
const AI = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

function readCameraId(req: any): string {
  const raw =
    req?.body?.cameraId ??
    req?.body?.camera_id ??
    req?.query?.cameraId ??
    req?.query?.camera_id ??
    "";
  return String(raw || "").trim();
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
    });
    return res.status(ai.status).json(ai.data);
  } catch (err: any) {
    console.error("attendance toggle failed:");
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
    });
    const enabled = Boolean((ai.data as any)?.enabled);
    return res.status(ai.status).json({ ...ai.data, running: enabled });
  } catch (err: any) {
    console.error("attendance status failed");
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
    });
    return res.status(ai.status).json(ai.data);
  } catch (err: any) {
    if (err?.code === "ECONNREFUSED") {
      console.error("attendance voice-events failed");
    }

    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch attendance voice events" });
  }
});

export default r;
