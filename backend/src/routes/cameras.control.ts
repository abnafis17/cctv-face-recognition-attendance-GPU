import { Router } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";

const r = Router();

const AI_BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

type AiCameraStartResponse = {
  ok: boolean;
  startedNow?: boolean;
  camera_id?: string;
  rtsp_url?: string;
};

type AiCameraStopResponse = {
  ok: boolean;
  stoppedNow?: boolean;
  camera_id?: string;
};

/**
 * START CAMERA
 * POST /api/v1/cameras/start/:id
 */
r.post("/start/:id", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { id } = req.params;

    const cam = await findCameraByAnyId(String(id), companyId);
    if (!cam) {
      return res.status(404).json({ error: "Camera not found" });
    }

    // Call AI server
    const priorActive = cam.isActive === true;
    const ai = await axios.post<AiCameraStartResponse>(`${AI_BASE}/camera/start`, null, {
      params: {
        camera_id: cam.id,
        rtsp_url: cam.rtspUrl,
      },
    });
    const startedNow =
      typeof ai.data?.startedNow === "boolean" ? ai.data.startedNow : !priorActive;

    // Update DB
    await prisma.camera.update({
      where: { id: cam.id },
      data: { isActive: true },
    });

    return res.json({ ok: true, startedNow, isActive: true });
  } catch (error) {
    console.error("START CAMERA FAILED:", error);
    return res.status(500).json({ error: "Failed to start camera" });
  }
});

/**
 * STOP CAMERA
 * POST /api/v1/cameras/stop/:id
 */
r.post("/stop/:id", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { id } = req.params;

    const cam = await findCameraByAnyId(String(id), companyId);
    if (!cam) {
      return res.status(404).json({ error: "Camera not found" });
    }
    const priorActive = cam.isActive === true;

    let aiError: string | null = null;
    let stoppedNow = priorActive;
    try {
      const ai = await axios.post<AiCameraStopResponse>(
        `${AI_BASE}/camera/stop`,
        null,
        {
          params: { camera_id: cam.id },
        },
      );
      stoppedNow =
        typeof ai.data?.stoppedNow === "boolean" ? ai.data.stoppedNow : priorActive;
    } catch (error: any) {
      aiError =
        (error as any)?.response?.data?.error ||
        (error as any)?.response?.data?.message ||
        String(error);
      console.error("AI STOP CAMERA FAILED:", aiError, error);
    }

    await prisma.camera.update({
      where: { id: cam.id },
      data: { isActive: false },
    });

    const payload: any = { ok: true, stoppedNow, isActive: false };
    if (aiError) payload.warning = aiError;

    return res.status(200).json(payload);
  } catch (error) {
    console.error("STOP CAMERA FAILED:", error);
    return res.status(500).json({ error: "Failed to stop camera" });
  }
});

export default r;
