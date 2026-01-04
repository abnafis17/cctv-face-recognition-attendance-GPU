import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  findEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";

export async function getEmployees(_req: Request, res: Response) {
  try {
    const employees = await prisma.employee.findMany({
      orderBy: { createdAt: "desc" },
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
