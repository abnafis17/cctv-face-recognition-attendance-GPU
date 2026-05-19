import { Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import {
  cameraAuthorizedEmployeesUpdateSchema,
  cameraBoundingBoxTrackingEventSchema,
  cameraBoundingBoxTrackingListQuerySchema,
  cameraBoundingBoxesUpdateSchema,
  cameraCreateSchema,
  cameraListQuerySchema,
  cameraParamSchema,
  cameraUpdateSchema,
} from "../validators/camera.validators";
import {
  CameraAuthorizedEmployeesValidationError,
  CameraBoundingBoxesValidationError,
  createCompanyCamera,
  deleteCompanyCamera,
  listCompanyCameraAuthorizedEmployees,
  listCompanyCameraBoundingBoxes,
  listCompanyCameras,
  replaceCompanyCameraBoundingBoxes,
  updateCompanyCameraAuthorizedEmployees,
  updateCompanyCamera,
} from "../services/camera.service";
import {
  BoundingBoxTrackingValidationError,
  listCompanyCameraBoundingBoxTracking,
  recordCompanyCameraBoundingBoxTrackingEvent,
} from "../services/boundingBoxTracking.service";
import {
  autoStartCameraById,
  syncCameraAuthorizedEmployeesToAi,
} from "../services/cameraAutostart.service";

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
      task: query.task,
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
      task: req.body?.task,
      relayAgentId: req.body?.relayAgentId ?? req.body?.relay_agent_id,
      rtspUrlEnc: req.body?.rtspUrlEnc ?? req.body?.rtsp_url_enc,
      sendFps: req.body?.sendFps ?? req.body?.send_fps,
      sendWidth: req.body?.sendWidth ?? req.body?.send_width,
      sendHeight: req.body?.sendHeight ?? req.body?.send_height,
      jpegQuality: req.body?.jpegQuality ?? req.body?.jpeg_quality,
    });

    const camera = await createCompanyCamera(companyId, payload);

    let responseCamera: any = camera;
    let warning: string | null = null;
    const task = String((camera as any)?.task ?? payload.task ?? "attendance")
      .trim()
      .toLowerCase();
    const shouldAutoStartAttendance = task === "attendance";

    if (
      shouldAutoStartAttendance &&
      camera.rtspUrl &&
      String(camera.rtspUrl).trim()
    ) {
      const result = await autoStartCameraById({
        id: camera.id,
        camId: camera.camId,
        name: camera.name,
        companyId,
        rtspUrl: camera.rtspUrl,
        sendWidth: (camera as any).sendWidth ?? null,
        sendHeight: (camera as any).sendHeight ?? null,
        sendFps: (camera as any).sendFps ?? null,
      });

      if (result.ok) {
        responseCamera = {
          ...camera,
          isActive: true,
          attendance: true,
        };
        if (result.warning && !warning) {
          warning = String(result.warning);
        }
      } else if (result.reason !== "missing_camera_or_stream") {
        warning = String(result.detail || "Auto-start failed");
      }
    }

    return res.status(201).json(
      warning ? { ...responseCamera, warning } : responseCamera
    );
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
      task: req.body?.task,
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

export async function listCameraAuthorizedEmployees(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const state = await listCompanyCameraAuthorizedEmployees(companyId, anyId);
    if (!state) return res.status(404).json({ error: "Camera not found" });

    return res.json(state);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to load camera authorized employees",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateCameraAuthorizedEmployees(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const payload = cameraAuthorizedEmployeesUpdateSchema.parse({
      employeeIds:
        req.body?.employeeIds ??
        req.body?.employee_ids ??
        req.body?.employees ??
        [],
    });

    const state = await updateCompanyCameraAuthorizedEmployees(
      companyId,
      anyId,
      payload.employeeIds
    );
    if (!state) return res.status(404).json({ error: "Camera not found" });

    let warning: string | null = null;
    const sync = await syncCameraAuthorizedEmployeesToAi({
      cameraId: state.camera.id,
      companyId,
      employeePublicIds: state.authorizedEmployeePublicIds,
    });
    if (!sync.ok) {
      warning = "Failed to sync assignments to AI";
    }

    return res.json(warning ? { ...state, warning } : state);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof CameraAuthorizedEmployeesValidationError) {
      return res.status(400).json({
        error: "Some employees are invalid or not enrolled",
        invalidEmployeeIds: error.invalidEmployeeIds,
      });
    }
    return res.status(500).json({
      error: "Failed to update camera authorized employees",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listCameraBoundingBoxes(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const state = await listCompanyCameraBoundingBoxes(companyId, anyId);
    if (!state) return res.status(404).json({ error: "Camera not found" });

    return res.json(state);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to load camera bounding boxes",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function replaceCameraBoundingBoxes(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const payload = cameraBoundingBoxesUpdateSchema.parse({
      boxes: req.body?.boxes ?? [],
    });

    const state = await replaceCompanyCameraBoundingBoxes(
      companyId,
      anyId,
      payload.boxes
    );
    if (!state) return res.status(404).json({ error: "Camera not found" });

    return res.json(state);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof CameraBoundingBoxesValidationError) {
      return res.status(400).json({
        error: "Bounding box payload is invalid",
        invalidEmployeeIds: error.invalidEmployeeIds,
        invalidBoxIds: error.invalidBoxIds,
        invalidBoxes: error.invalidBoxes,
      });
    }
    return res.status(500).json({
      error: "Failed to update camera bounding boxes",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function listCameraBoundingBoxTracking(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const query = cameraBoundingBoxTrackingListQuerySchema.parse(req.query ?? {});
    const state = await listCompanyCameraBoundingBoxTracking(
      companyId,
      anyId,
      query,
    );
    if (!state) return res.status(404).json({ error: "Camera not found" });

    return res.json(state);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof BoundingBoxTrackingValidationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({
      error: "Failed to load camera bounding box tracking records",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function recordCameraBoundingBoxTrackingEvent(
  req: Request,
  res: Response,
) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const { id: anyId } = cameraParamSchema.parse({
      id: req.params?.id,
    });

    const payload = cameraBoundingBoxTrackingEventSchema.parse({
      boundingBoxId: req.body?.boundingBoxId ?? req.body?.bounding_box_id,
      employeeId: req.body?.employeeId ?? req.body?.employee_id,
      eventType:
        req.body?.eventType ??
        req.body?.event_type ??
        req.body?.state ??
        req.body?.status,
      occurredAt:
        req.body?.occurredAt ??
        req.body?.occurred_at ??
        req.body?.timestamp ??
        req.body?.at,
      confidence: req.body?.confidence,
    });

    const result = await recordCompanyCameraBoundingBoxTrackingEvent(
      companyId,
      anyId,
      payload,
    );
    if (!result) return res.status(404).json({ error: "Camera not found" });

    return res.json(result);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof BoundingBoxTrackingValidationError) {
      return res.status(error.statusCode).json({ error: error.message });
    }
    return res.status(500).json({
      error: "Failed to record camera bounding box tracking event",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
