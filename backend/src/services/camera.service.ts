import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { findCameraByAnyId } from "../utils/camera";
import type {
  CameraCreateInput as CameraCreatePayload,
  CameraUpdateInput as CameraUpdatePayload,
} from "../validators/camera.validators";

type ListCompanyCamerasOptions = {
  includeVirtual?: boolean;
};

function cameraListWhere(
  companyId: string,
  options?: ListCompanyCamerasOptions
): Prisma.CameraWhereInput {
  const includeVirtual = Boolean(options?.includeVirtual);

  if (includeVirtual) return { companyId };

  return {
    companyId,
    NOT: {
      OR: [{ camId: { startsWith: "laptop-" } }, { id: { startsWith: "laptop-" } }],
    },
  };
}

export async function listCompanyCameras(
  companyId: string,
  options?: ListCompanyCamerasOptions
) {
  return prisma.camera.findMany({
    where: cameraListWhere(companyId, options),
    orderBy: [{ isActive: "desc" }, { name: "asc" }, { createdAt: "desc" }],
  });
}

export async function createCompanyCamera(
  companyId: string,
  payload: CameraCreatePayload
) {
  return prisma.camera.create({
    data: {
      name: payload.name,
      rtspUrl: payload.rtspUrl,
      companyId,
      isActive: false,
      ...(payload.camId ? { camId: payload.camId } : {}),
      ...(payload.relayAgentId !== undefined
        ? { relayAgentId: payload.relayAgentId }
        : {}),
      ...(payload.rtspUrlEnc !== undefined ? { rtspUrlEnc: payload.rtspUrlEnc } : {}),
      ...(payload.sendFps !== undefined ? { sendFps: payload.sendFps } : {}),
      ...(payload.sendWidth !== undefined ? { sendWidth: payload.sendWidth } : {}),
      ...(payload.sendHeight !== undefined ? { sendHeight: payload.sendHeight } : {}),
      ...(payload.jpegQuality !== undefined
        ? { jpegQuality: payload.jpegQuality }
        : {}),
    },
  });
}

export async function updateCompanyCamera(
  companyId: string,
  anyId: string,
  payload: CameraUpdatePayload
) {
  const existing = await findCameraByAnyId(anyId, companyId);
  if (!existing) return null;

  const data: Prisma.CameraUncheckedUpdateInput = {};

  if (payload.camId !== undefined) data.camId = payload.camId;
  if (payload.name !== undefined) data.name = payload.name;
  if (payload.rtspUrl !== undefined) data.rtspUrl = payload.rtspUrl;
  if (payload.relayAgentId !== undefined) data.relayAgentId = payload.relayAgentId;
  if (payload.rtspUrlEnc !== undefined) data.rtspUrlEnc = payload.rtspUrlEnc;
  if (payload.sendFps !== undefined) data.sendFps = payload.sendFps;
  if (payload.sendWidth !== undefined) data.sendWidth = payload.sendWidth;
  if (payload.sendHeight !== undefined) data.sendHeight = payload.sendHeight;
  if (payload.jpegQuality !== undefined) data.jpegQuality = payload.jpegQuality;
  if (payload.isActive !== undefined) data.isActive = payload.isActive;

  return prisma.camera.update({
    where: { id: existing.id },
    data,
  });
}

export async function deleteCompanyCamera(companyId: string, anyId: string) {
  const existing = await findCameraByAnyId(anyId, companyId);
  if (!existing) return null;

  await prisma.camera.delete({ where: { id: existing.id } });
  return existing;
}
