import { Request, Response } from "express";
import { prisma } from "../../../prisma";
import {
  employeePublicId,
  findEmployeeByAnyId,
  getOrCreateEmployeeByAnyId,
  normalizeEmployeeIdentifier,
} from "../../../utils/employee";

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
    const { employeeId, angle, embedding, modelName, replace } = req.body;

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

    if (replace) {
      // If replace is requested, purge all prior templates for this employee first
      await prisma.faceTemplate.deleteMany({
        where: { employeeId: employee.id },
      });
    }

    // Check for existing template by employee ID and angle
    const existing = await prisma.faceTemplate.findFirst({
      where: { employeeId: employee.id, angle },
    });

    let tpl;
    if (existing) {
      tpl = await prisma.faceTemplate.update({
        where: { id: existing.id },
        data: {
          embedding,
          modelName: modelName ?? "unknown",
          companyId,
        },
      });
    } else {
      tpl = await prisma.faceTemplate.create({
        data: {
          employeeId: employee.id,
          angle,
          embedding,
          modelName: modelName ?? "unknown",
          companyId,
        },
      });
    }

    res.json(tpl);
  } catch (e: any) {
    console.error("upsertTemplate error:", e);
    res.status(500).json({
      error: "Failed to upsert template",
      detail: e?.message ?? String(e),
    });
  }
}

/**
 * Atomically replaces all face templates for an employee.
 * Deletes all previous templates and writes the new template set,
 * guaranteeing zero stale or mismatched angle vectors.
 */
export async function replaceEmployeeTemplates(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { employeeId, templates, modelName } = req.body;

    const identifier = normalizeEmployeeIdentifier(employeeId);
    if (!identifier) {
      return res.status(400).json({ error: "employeeId required" });
    }

    const employee = await getOrCreateEmployeeByAnyId(identifier, companyId, {
      nameIfCreate: "Unknown",
    });

    // 1. Wipe all existing face templates for this employee
    await prisma.faceTemplate.deleteMany({
      where: { employeeId: employee.id },
    });

    // 2. Insert the fresh template set
    const created = [];
    if (Array.isArray(templates)) {
      for (const item of templates) {
        if (!item?.angle || !Array.isArray(item?.embedding)) continue;
        const record = await prisma.faceTemplate.create({
          data: {
            employeeId: employee.id,
            angle: String(item.angle),
            embedding: item.embedding,
            modelName: String(item.modelName || modelName || "insightface"),
            companyId,
          },
        });
        created.push(record);
      }
    } else if (templates && typeof templates === "object") {
      for (const [angle, emb] of Object.entries(templates)) {
        if (!angle || !Array.isArray(emb)) continue;
        const record = await prisma.faceTemplate.create({
          data: {
            employeeId: employee.id,
            angle: String(angle),
            embedding: emb as number[],
            modelName: String(modelName || "insightface"),
            companyId,
          },
        });
        created.push(record);
      }
    }

    res.json({
      ok: true,
      count: created.length,
      employeeId: employeePublicId(employee),
      templates: created.map((t) => ({
        id: t.id,
        angle: t.angle,
        modelName: t.modelName,
        updatedAt: t.updatedAt,
      })),
    });
  } catch (e: any) {
    console.error("replaceEmployeeTemplates error:", e);
    res.status(500).json({
      error: "Failed to replace employee templates",
      detail: e?.message ?? String(e),
    });
  }
}

/**
 * Deletes all face templates for a given employee identifier.
 */
export async function deleteEmployeeTemplates(req: Request, res: Response) {
  try {
    const companyId = String((req as any).companyId ?? "");
    const { employeeId } = req.params;

    const identifier = normalizeEmployeeIdentifier(employeeId);
    if (!identifier) {
      return res.status(400).json({ error: "employeeId required" });
    }

    const employee = await getOrCreateEmployeeByAnyId(identifier, companyId);
    if (!employee) {
      return res.status(404).json({ error: "Employee not found" });
    }

    const result = await prisma.faceTemplate.deleteMany({
      where: { employeeId: employee.id },
    });

    res.json({ ok: true, deletedCount: result.count });
  } catch (e: any) {
    console.error("deleteEmployeeTemplates error:", e);
    res.status(500).json({
      error: "Failed to delete employee templates",
      detail: e?.message ?? String(e),
    });
  }
}
