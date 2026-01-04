import { prisma } from "../prisma";

export function normalizeEmployeeIdentifier(value: unknown): string | null {
  const v = String(value ?? "").trim();
  return v ? v : null;
}

export async function findEmployeeByAnyId(identifier: string) {
  const key = String(identifier ?? "").trim();
  if (!key) return null;

  return (
    (await prisma.employee.findUnique({ where: { empId: key } })) ??
    (await prisma.employee.findUnique({ where: { id: key } }))
  );
}

export async function getOrCreateEmployeeByAnyId(
  identifier: string,
  opts?: { nameIfCreate?: string; nameIfUpdate?: string }
) {
  const key = String(identifier ?? "").trim();
  if (!key) throw new Error("employee identifier is required");

  const existing = await findEmployeeByAnyId(key);
  if (existing) {
    if (opts?.nameIfUpdate && opts.nameIfUpdate !== existing.name) {
      return prisma.employee.update({
        where: { id: existing.id },
        data: { name: opts.nameIfUpdate },
      });
    }
    return existing;
  }

  return prisma.employee.create({
    data: { empId: key, name: opts?.nameIfCreate ?? "Unknown" },
  });
}

export function employeePublicId(e: { id: string; empId?: string | null }) {
  const v = String(e.empId ?? "").trim();
  return v || e.id;
}

