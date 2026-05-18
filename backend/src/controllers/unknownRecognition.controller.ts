import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";

const cameraHasAttendanceField = Prisma.dmmf.datamodel.models
  .find((m) => m.name === "Camera")
  ?.fields.some((f) => f.name === "attendance");

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toNullableString(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export async function createUnknownRecognition(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "").trim();
    if (!companyId) {
      return res.status(400).json({ error: "Missing company id" });
    }

    const timestampInput = String(req.body?.timestamp ?? "").trim();
    const timestamp = timestampInput ? new Date(timestampInput) : new Date();
    if (Number.isNaN(timestamp.getTime())) {
      return res.status(400).json({ error: "Invalid timestamp" });
    }

    const confidence = toNullableNumber(req.body?.confidence);
    const recognizedName = toNullableString(req.body?.name ?? req.body?.recognizedName);
    const normalizedCameraId = String(req.body?.cameraId ?? "").trim();
    const cameraName = String(req.body?.cameraName ?? "").trim();

    let cam = normalizedCameraId
      ? await findCameraByAnyId(normalizedCameraId, companyId)
      : null;



    const row = await prisma.unknownRecognition.create({
      data: {
        companyId,
        cameraId: cam?.id ?? null,
        timestamp,
        confidence,
        recognizedName,
      },
      include: {
        camera: {
          select: {
            id: true,
            camId: true,
            name: true,
          },
        },
      },
    });

    return res.json({
      ok: true,
      unknownRecognition: {
        id: row.id,
        name: row.recognizedName ?? "Unknown",
        timestamp: row.timestamp.toISOString(),
        cameraId: row.cameraId,
        cameraName: row.camera?.name ?? null,
        confidence: row.confidence,
      },
    });
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to create unknown recognition",
      detail: e?.message ?? String(e),
    });
  }
}

export async function listUnknownRecognitions(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "").trim();
    if (!companyId) {
      return res.status(400).json({ error: "Missing company id" });
    }

    const limit = Math.min(Math.max(Number(req.query.limit || 100), 1), 500);
    const fromRaw = String(req.query.from ?? "").trim();
    const toRaw = String(req.query.to ?? "").trim();

    const fromDate = fromRaw ? new Date(fromRaw) : null;
    const toDate = toRaw ? new Date(toRaw) : null;

    if (fromDate && Number.isNaN(fromDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'from' datetime" });
    }
    if (toDate && Number.isNaN(toDate.getTime())) {
      return res.status(400).json({ error: "Invalid 'to' datetime" });
    }
    if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
      return res
        .status(400)
        .json({ error: "'from' datetime must be earlier than 'to'" });
    }

    const timestampWhere =
      fromDate || toDate
        ? {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          }
        : undefined;

    const rows = await prisma.unknownRecognition.findMany({
      where: {
        companyId,
        ...(timestampWhere ? { timestamp: timestampWhere } : {}),
      },
      include: {
        camera: {
          select: {
            id: true,
            camId: true,
            name: true,
          },
        },
      },
      orderBy: { timestamp: "desc" },
      take: limit,
    });

    return res.json(
      rows.map((r) => ({
        id: r.id,
        name: r.recognizedName ?? "Unknown",
        timestamp: r.timestamp.toISOString(),
        cameraId: r.cameraId,
        cameraName: r.camera?.name ?? null,
        confidence: r.confidence,
      }))
    );
  } catch (e: any) {
    return res.status(500).json({
      error: "Failed to load unknown recognitions",
      detail: e?.message ?? String(e),
    });
  }
}
