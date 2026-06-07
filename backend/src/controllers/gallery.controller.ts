import { Request, Response } from "express";
import { prisma } from "../prisma";
import {
  employeePublicId,
  findEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../utils/employee";

export async function getTemplates(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const templates = await prisma.faceTemplate.findMany({
      where: { companyId },
      include: { employee: true },
      orderBy: [{ employeeId: "asc" }, { angle: "asc" }],
    });

    res.json(
      templates.map((t) => ({
        id: t.id,
        employeeId: employeePublicId(t.employee),
        employeeName: t.employee.name,
        angle: t.angle,
        modelName: t.modelName,
        embedding: t.embedding,
        updatedAt: t.updatedAt,
      }))
    );
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to load templates",
      detail: e?.message ?? String(e),
    });
  }
}

export async function upsertTemplate(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { employeeId, angle, embedding, modelName } = req.body;

    const identifier = normalizeEmployeeIdentifier(employeeId);

    if (!identifier || !angle || !Array.isArray(embedding)) {
      return res.status(400).json({
        error: "employeeId, angle, embedding[] required",
      });
    }

    const employee = await findEmployeeByAnyId(identifier, companyId);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const tpl = await prisma.faceTemplate.upsert({
      where: { employeeId_angle: { employeeId: employee.id, angle } },
      update: {
        embedding,
        modelName: modelName ?? "unknown",
        companyId,
      },
      create: {
        employeeId: employee.id,
        angle,
        embedding,
        modelName: modelName ?? "unknown",
        companyId,
      },
    });

    res.json(tpl);
  } catch (e: any) {
    res.status(500).json({
      error: "Failed to upsert template",
      detail: e?.message ?? String(e),
    });
  }
}
