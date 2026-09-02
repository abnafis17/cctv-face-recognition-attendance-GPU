import { Router } from "express";
import axios from "axios";
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";

const r = Router();

const AI_BASE = (process.env.AI_BASE_URL || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

const cameraHasTaskField = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Camera")
  ?.fields.some((f) => f.name === "task");

function isPresenceTask(camera: { task?: string | null }) {
  const task = String((camera as any)?.task ?? "")
    .trim()
    .toLowerCase();
  return task === "presence";
}

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
    .post(`${AI_BASE}/camera/stop`, null, {
      params: { camera_id: cameraId },
      timeout: timeoutMs,
    })
    .catch((error: unknown) => {
      const detail = normalizeAiError(error);
      console.warn(`PRESENCE STOP: camera stop failed camera=${cameraId} detail=${detail}`);
    });
}

r.post("/start/:id", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { id } = req.params;

    const cam = await findCameraByAnyId(String(id), companyId);
    if (!cam) return res.status(404).json({ error: "Camera not found" });

    if (cameraHasTaskField && !isPresenceTask(cam as any)) {
      return res
        .status(400)
        .json({ error: "This camera is not assigned to presence task" });
    }

    const rtspUrl = String(cam.rtspUrl ?? "").trim();
    if (!rtspUrl) {
      return res.status(400).json({ error: "Camera RTSP URL is required" });
    }

    const presenceStart = await axios.post(
      `${AI_BASE}/presence/start`,
      null,
      {
        params: {
          camera_id: cam.id,
          camera_name: cam.name,
          companyId,
          rtsp_url: rtspUrl,
        },
        headers: companyId ? { "x-company-id": companyId } : undefined,
        timeout: Number(process.env.AI_START_TIMEOUT_MS || 30000),
      }
    );

    await prisma.camera.update({
      where: { id: cam.id },
      data: { isActive: true },
    });

    return res.json({
      ok: true,
      startedNow: Boolean((presenceStart.data as any)?.startedNow),
      isActive: true,
      presence: true,
    });
  } catch (error) {
    const detail = normalizeAiError(error);
    console.error("PRESENCE START FAILED:", detail);
    return res.status(500).json({
      ok: false,
      error: "Failed to start presence camera",
      detail,
    });
  }
});

r.post("/stop/:id", async (req, res) => {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { id } = req.params;

    const cam = await findCameraByAnyId(String(id), companyId);
    if (!cam) return res.status(404).json({ error: "Camera not found" });

    let warning: string | null = null;
    let stoppedNow = Boolean(cam.isActive);

    try {
      const ai = await axios.post(
        `${AI_BASE}/presence/stop`,
        null,
        {
          params: { camera_id: cam.id },
          timeout: Number(process.env.AI_START_TIMEOUT_MS || 30000),
        }
      );
      stoppedNow =
        typeof (ai.data as any)?.stoppedNow === "boolean"
          ? Boolean((ai.data as any).stoppedNow)
          : stoppedNow;
    } catch (error) {
      warning = normalizeAiError(error);
      console.warn("PRESENCE STOP: presence stop failed", warning);
    }

    if (Boolean(cam.isActive)) {
      try {
        requestAiCameraStop(cam.id);
      } catch (error) {
        const stopWarning = normalizeAiError(error);
        warning = warning ? `${warning}; ${stopWarning}` : stopWarning;
      }
    }

    await prisma.camera.update({
      where: { id: cam.id },
      data: { isActive: false },
    });

    return res.json({
      ok: true,
      stoppedNow,
      isActive: false,
      presence: false,
      ...(warning ? { warning } : {}),
    });
  } catch (error) {
    const detail = normalizeAiError(error);
    console.error("PRESENCE STOP FAILED:", detail);
    return res.status(500).json({
      ok: false,
      error: "Failed to stop presence camera",
      detail,
    });
  }
});

export default r;
