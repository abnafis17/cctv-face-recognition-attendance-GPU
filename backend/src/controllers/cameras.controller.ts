import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  cameraCreateSchema,
  cameraListQuerySchema,
  cameraParamSchema,
  cameraUpdateSchema,
} from "../validators/camera.validators";
import {
  createCompanyCamera,
  deleteCompanyCamera,
  listCompanyCameras,
  updateCompanyCamera,
} from "../services/camera.service";

function companyIdFromReq(req: Request): string {
  return String((req as any).companyId ?? "").trim();
}

function respondValidationError(res: Response, error: ZodError) {
  const first = error.issues?.[0];
  const message =
    first?.message ||
    (first?.path?.length ? `${first.path.join(".")} is invalid` : "Invalid input");

  return res.status(400).json({
    error: message,
    issues: error.issues,
  });
}

function respondPrismaError(res: Response, error: Prisma.PrismaClientKnownRequestError) {
  if (error.code === "P2002") {
    return res.status(409).json({
      error: "Camera ID already exists for this company",
      detail: error.message,
    });
  }

  if (error.code === "P2003") {
    return res.status(400).json({
      error: "Invalid relation field provided",
      detail: error.message,
    });
  }

  if (error.code === "P2025") {
    return res.status(404).json({ error: "Camera not found" });
  }

  return res.status(500).json({
    error: "Database error",
    detail: error.message,
  });
}

export async function listCameras(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const query = cameraListQuerySchema.parse(req.query ?? {});
    const cameras = await listCompanyCameras(companyId, {
      includeVirtual: Boolean(query.includeVirtual),
    });

    return res.json(cameras);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to load cameras",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createCamera(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = cameraCreateSchema.parse({
      camId: req.body?.camId ?? req.body?.cameraId ?? req.body?.cam_id ?? req.body?.id,
      name: req.body?.name,
      rtspUrl: req.body?.rtspUrl ?? req.body?.rtsp_url,
      relayAgentId: req.body?.relayAgentId ?? req.body?.relay_agent_id,
      rtspUrlEnc: req.body?.rtspUrlEnc ?? req.body?.rtsp_url_enc,
      sendFps: req.body?.sendFps ?? req.body?.send_fps,
      sendWidth: req.body?.sendWidth ?? req.body?.send_width,
      sendHeight: req.body?.sendHeight ?? req.body?.send_height,
      jpegQuality: req.body?.jpegQuality ?? req.body?.jpeg_quality,
    });

    const camera = await createCompanyCamera(companyId, payload);
    return res.status(201).json(camera);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return respondPrismaError(res, error);
    }
    return res.status(500).json({
      error: "Failed to create camera",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateCamera(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const payload = cameraUpdateSchema.parse({
      camId:
        req.body?.camId !== undefined ||
        req.body?.cameraId !== undefined ||
        req.body?.cam_id !== undefined
          ? req.body?.camId ?? req.body?.cameraId ?? req.body?.cam_id
          : undefined,
      name: req.body?.name,
      rtspUrl: req.body?.rtspUrl ?? req.body?.rtsp_url,
      relayAgentId: req.body?.relayAgentId ?? req.body?.relay_agent_id,
      rtspUrlEnc: req.body?.rtspUrlEnc ?? req.body?.rtsp_url_enc,
      sendFps: req.body?.sendFps ?? req.body?.send_fps,
      sendWidth: req.body?.sendWidth ?? req.body?.send_width,
      sendHeight: req.body?.sendHeight ?? req.body?.send_height,
      jpegQuality: req.body?.jpegQuality ?? req.body?.jpeg_quality,
      isActive: req.body?.isActive,
    });

    const camera = await updateCompanyCamera(companyId, anyId, payload);
    if (!camera) return res.status(404).json({ error: "Camera not found" });

    return res.json(camera);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return respondPrismaError(res, error);
    }
    return res.status(500).json({
      error: "Failed to update camera",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteCamera(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const camera = await deleteCompanyCamera(companyId, anyId);
    if (!camera) return res.status(404).json({ error: "Camera not found" });

    return res.json({
      ok: true,
      id: camera.id,
      camId: camera.camId,
      name: camera.name,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return respondPrismaError(res, error);
    }
    return res.status(500).json({
      error: "Failed to delete camera",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
