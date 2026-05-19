import { Router } from "express";
import axios from "axios";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";
import { autoStartCameraById } from "../services/cameraAutostart.service";

const r = Router();

const AI_BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  "",
);

type AiCameraStartResponse = {
  ok: boolean;
  startedNow?: boolean;
  camera_id?: string;
  rtsp_url?: string;
  attendance_enabled?: boolean;
};

type AiCameraStopResponse = {
  ok: boolean;
  stoppedNow?: boolean;
  camera_id?: string;
};

function normalizeAiError(error: unknown): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    "Unknown AI error"
  );
}

function requestAiCameraStop(cameraId: string) {
  const timeoutMs = Number(process.env.AI_STOP_TIMEOUT_MS || 5000);
  void axios
    .post<AiCameraStopResponse>(`${AI_BASE}/camera/stop`, null, {
      params: { camera_id: cameraId },
      timeout: timeoutMs,
    })
    .catch((error: unknown) => {
      const detail = normalizeAiError(error);
      console.warn(
        `AI STOP CAMERA FAILED: camera=${cameraId} detail=${detail}`,
      );
    });
}

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
    const task = String((cam as any)?.task ?? "")
      .trim()
      .toLowerCase();
    const started = await autoStartCameraById({
      id: cam.id,
      camId: cam.camId,
      name: cam.name,
      companyId,
      rtspUrl: cam.rtspUrl,
      streamType: task,
      sendWidth: (cam as any).sendWidth ?? null,
      sendHeight: (cam as any).sendHeight ?? null,
      sendFps: (cam as any).sendFps ?? null,
    });

    if (!started.ok) {
      return res.status(502).json({
        ok: false,
        error: "Failed to start camera stream",
        detail: String(started.detail || started.reason),
      });
    }

    const startedNow =
      typeof started.startedNow === "boolean"
        ? started.startedNow
        : !priorActive;
    const isAttendanceTask = !task || task === "attendance";
    const attendanceEnabled =
      typeof (started as any)?.attendanceEnabled === "boolean"
        ? Boolean((started as any).attendanceEnabled)
        : isAttendanceTask;

    return res.json({
      ok: true,
      startedNow,
      isActive: true,
      attendance: attendanceEnabled,
      ...(started.warning ? { warning: String(started.warning) } : {}),
    });
  } catch (error) {
    console.error("START CAMERA FAILED:", normalizeAiError(error));
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

    let stoppedNow = priorActive;

    await prisma.camera.update({
      where: { id: cam.id },
      data: { isActive: false },
    });

    if (priorActive) {
      requestAiCameraStop(cam.id);
    }

    const payload: any = {
      ok: true,
      stoppedNow,
      isActive: false,
      aiStopRequested: Boolean(priorActive),
    };

    return res.status(200).json(payload);
  } catch (error) {
    console.error("STOP CAMERA FAILED:", normalizeAiError(error));
    return res.status(500).json({ error: "Failed to stop camera" });
  }
});

export default r;
