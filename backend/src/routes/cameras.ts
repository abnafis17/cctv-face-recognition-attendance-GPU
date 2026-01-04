import { Router } from "express";
import { prisma } from "../prisma";
import {
  cameraPublicId,
  findCameraByAnyId,
  normalizeCameraIdentifier,
} from "../utils/camera";

const r = Router();

// List
r.get("/", async (_req, res) => {
  const cams = await prisma.camera.findMany({ orderBy: { id: "asc" } });
  res.json(cams);
});

// Create
r.post("/", async (req, res) => {
  const name = String(req.body?.name ?? "").trim();
  const rtspUrl = String(req.body?.rtspUrl ?? "").trim();

  const camId =
    normalizeCameraIdentifier(
      req.body?.camId ?? req.body?.cameraId ?? req.body?.cam_id ?? req.body?.id
    ) ?? null;

  if (!name || !rtspUrl) {
    return res.status(400).json({ error: "name and rtspUrl are required" });
  }

  const cam = await prisma.camera.create({
    data: {
      ...(camId ? { camId } : {}),
      name,
      rtspUrl,
      isActive: false,
    },
  });

  res.json(cam);
});

// Update
r.put("/:id", async (req, res) => {
  const { id: anyId } = req.params;
  const body = req.body && typeof req.body === "object" ? req.body : {};
  const { name, rtspUrl, isActive } = body as any;

  const existing = await findCameraByAnyId(String(anyId));
  if (!existing) return res.status(404).json({ error: "Camera not found" });

  const camIdKey = "camId" in body || "cameraId" in body || "cam_id" in body;

  const camId = camIdKey
    ? normalizeCameraIdentifier(
        (body as any)?.camId ?? (body as any)?.cameraId ?? (body as any)?.cam_id
      )
    : undefined;

  const cam = await prisma.camera.update({
    where: { id: existing.id },
    data: {
      camId,
      name: name !== undefined ? String(name) : undefined,
      rtspUrl: rtspUrl !== undefined ? String(rtspUrl) : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
    },
  });

  res.json(cam);
});

// Delete (prevent deleting default laptop cam)
r.delete("/:id", async (req, res) => {
  const { id: anyId } = req.params;

  const cam = await findCameraByAnyId(String(anyId));
  if (!cam) return res.status(404).json({ error: "Camera not found" });

  if (cameraPublicId(cam) === "cam1") {
    return res
      .status(400)
      .json({ error: "Default laptop camera cannot be deleted" });
  }

  await prisma.camera.delete({ where: { id: cam.id } });
  res.json({ ok: true });
});

export default r;
