import { prisma } from "../prisma";

export function normalizeCameraIdentifier(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

export async function findCameraByAnyId(identifier: string) {
  const key = String(identifier ?? "").trim();
  if (!key) return null;

  return (
    (await prisma.camera.findUnique({ where: { camId: key } })) ??
    (await prisma.camera.findUnique({ where: { id: key } }))
  );
}

export function cameraPublicId(c: { id: string; camId?: string | null }) {
  const v = String(c.camId ?? "").trim();
  return v || c.id;
}

