import { prisma } from "../prisma";

export function normalizeCameraIdentifier(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

export async function findCameraByAnyId(
  identifier: string,
  companyId?: string | null
) {
  const key = String(identifier ?? "").trim();
  if (!key) return null;

  const cid = String(companyId ?? "").trim();
  if (cid) {
    const cam = await prisma.camera.findFirst({
      where: {
        companyId: cid,
        OR: [{ camId: key }, { id: key }],
      },
    });
    if (cam) return cam;

    return prisma.camera.findFirst({
      where: {
        companyId: null,
        OR: [{ camId: key }, { id: key }],
      },
    });
  }

  return prisma.camera.findFirst({
    where: {
      OR: [{ camId: key }, { id: key }],
    },
  });
}

export function cameraPublicId(c: { id: string; camId?: string | null }) {
  const v = String(c.camId ?? "").trim();
  return v || c.id;
}

