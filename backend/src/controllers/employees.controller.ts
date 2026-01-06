import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  findEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";

export async function getEmployees(_req: Request, res: Response) {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: "asc" },
    });
    res.json(employees);
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load employees",
      detail: e?.message ?? String(e),
    });
  }
}

export async function upsertEmployee(req: Request, res: Response) {
  try {
    const name = String(req.body?.name ?? "").trim();
    if (!name) return res.status(400).json({ error: "name is required" });

    const identifier =
      normalizeEmployeeIdentifier(
        req.body?.empId ??
          req.body?.emp_id ??
          req.body?.employeeId ??
          req.body?.id
      ) ?? null;

    if (identifier) {
      const existing = await findEmployeeByAnyId(identifier);
      if (existing) {
        const employee = await prisma.employee.update({
          where: { id: existing.id },
          data: {
            name,
            ...(existing.empId ? {} : { empId: identifier }),
          },
        });
        return res.json(employee);
      }

      const created = await prisma.employee.create({
        data: { name, empId: identifier },
      });
      return res.json(created);
    }

    const created = await prisma.employee.create({ data: { name } });
    return res.json(created);
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to upsert employee",
      detail: e?.message ?? String(e),
    });
  }
}

/**
 * Update/edit employee (only name and/or empId).
 * FaceTemplate relation stays as-is automatically.
 */
export async function updateEmployee(req: Request, res: Response) {
  try {
    const id = String(req.params?.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id param is required" });

    const nameRaw = req.body?.name;
    const empIdRaw =
      req.body?.empId ?? req.body?.emp_id ?? req.body?.employeeId ?? undefined;

    const data: { name?: string; empId?: string | null } = {};

    if (nameRaw !== undefined) {
      const name = String(nameRaw ?? "").trim();
      if (!name) return res.status(400).json({ error: "name cannot be empty" });
      data.name = name;
    }

    if (empIdRaw !== undefined) {
      // allow clearing empId by sending null/empty string
      const normalized = normalizeEmployeeIdentifier(empIdRaw);
      data.empId = normalized ?? null;
    }

    if (Object.keys(data).length === 0) {
      return res.status(400).json({ error: "Nothing to update" });
    }

    const updated = await prisma.employee.update({
      where: { id },
      data,
    });

    return res.json(updated);
  } catch (e: any) {
    // Prisma unique violation
    if (e?.code === "P2002") {
      return res.status(409).json({
        error: "Employee ID already exists",
        detail: e?.message ?? String(e),
      });
    }

    // Prisma not found
    if (e?.code === "P2025") {
      return res.status(404).json({ error: "Employee not found" });
    }

    res.status(500).json({
      error: "Failed to update employee",
      detail: e?.message ?? String(e),
    });
  }
}

export async function deleteEmployee(req: Request, res: Response) {
  try {
    const id = String(req.params?.id ?? "").trim();
    if (!id) return res.status(400).json({ error: "id param is required" });

    await prisma.employee.delete({
      where: { id },
    });

    return res.json({ success: true, id });
  } catch (e: any) {
    // Prisma not found
    if (e?.code === "P2025") {
      return res.status(404).json({ error: "Employee not found" });
    }

    // FK constraint, etc.
    res.status(500).json({
      error: "Failed to delete employee",
      detail: e?.message ?? String(e),
    });
  }
}
