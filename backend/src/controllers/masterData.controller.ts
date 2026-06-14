import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { ZodError } from "zod";
import { prisma } from "../prisma";
import {
  masterDataCreateSchema,
  masterDataUpdateSchema,
  masterDataListQuerySchema,
} from "../validators/masterData.validators";

function getCompanyId(req: Request): string {
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

// ==========================================
// Visitor Type Controllers
// ==========================================

export async function listVisitorTypes(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const query = masterDataListQuerySchema.parse(req.query);
    const { page, limit, q } = query;
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    let totalCount = await prisma.visitorType.count({ where });

    // Seed defaults if company has 0 visitor types and no search is active
    if (totalCount === 0 && !q) {
      const defaults = ["Guest", "Contractor", "Official", "Interviewee", "Other"];
      await prisma.visitorType.createMany({
        data: defaults.map((name) => ({ companyId, name })),
        skipDuplicates: true,
      });
      totalCount = await prisma.visitorType.count({ where });
    }

    const items = await prisma.visitorType.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.json({
      items,
      totalCount,
      totalPages,
      currentPage: page,
      limit,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to list visitor types",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createVisitorType(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const payload = masterDataCreateSchema.parse(req.body);

    const newItem = await prisma.visitorType.create({
      data: {
        companyId,
        name: payload.name,
      },
    });

    return res.status(201).json(newItem);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Visitor type with this name already exists.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to create visitor type",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateVisitorType(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    const payload = masterDataUpdateSchema.parse(req.body);

    const updatedItem = await prisma.visitorType.update({
      where: {
        id,
        companyId, // ensure scoped to the company
      },
      data: {
        name: payload.name,
      },
    });

    return res.json(updatedItem);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Visitor type with this name already exists.",
        });
      }
      if (error.code === "P2025") {
        return res.status(404).json({
          error: "Visitor type not found.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to update visitor type",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteVisitorType(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    await prisma.visitorType.delete({
      where: {
        id,
        companyId, // scope checks
      },
    });

    return res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return res.status(404).json({
          error: "Visitor type not found.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to delete visitor type",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

// ==========================================
// Purpose of Visit Controllers
// ==========================================

export async function listPurposesOfVisit(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const query = masterDataListQuerySchema.parse(req.query);
    const { page, limit, q } = query;
    const skip = (page - 1) * limit;

    const where: any = { companyId };
    if (q) {
      where.name = { contains: q, mode: "insensitive" };
    }

    let totalCount = await prisma.purposeOfVisit.count({ where });

    // Seed defaults if company has 0 purposes of visit and no search is active
    if (totalCount === 0 && !q) {
      const defaults = ["Meeting", "Interview", "Delivery", "Audit", "Maintenance", "Other"];
      await prisma.purposeOfVisit.createMany({
        data: defaults.map((name) => ({ companyId, name })),
        skipDuplicates: true,
      });
      totalCount = await prisma.purposeOfVisit.count({ where });
    }

    const items = await prisma.purposeOfVisit.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take: limit,
    });

    const totalPages = Math.ceil(totalCount / limit);

    return res.json({
      items,
      totalCount,
      totalPages,
      currentPage: page,
      limit,
    });
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    return res.status(500).json({
      error: "Failed to list purposes of visit",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createPurposeOfVisit(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const payload = masterDataCreateSchema.parse(req.body);

    const newItem = await prisma.purposeOfVisit.create({
      data: {
        companyId,
        name: payload.name,
      },
    });

    return res.status(201).json(newItem);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Purpose of visit with this name already exists.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to create purpose of visit",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updatePurposeOfVisit(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    const payload = masterDataUpdateSchema.parse(req.body);

    const updatedItem = await prisma.purposeOfVisit.update({
      where: {
        id,
        companyId,
      },
      data: {
        name: payload.name,
      },
    });

    return res.json(updatedItem);
  } catch (error: unknown) {
    if (error instanceof ZodError) return respondValidationError(res, error);
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error: "Purpose of visit with this name already exists.",
        });
      }
      if (error.code === "P2025") {
        return res.status(404).json({
          error: "Purpose of visit not found.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to update purpose of visit",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deletePurposeOfVisit(req: Request, res: Response) {
  try {
    const companyId = getCompanyId(req);
    if (!companyId) return res.status(400).json({ error: "Missing company ID" });

    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    await prisma.purposeOfVisit.delete({
      where: {
        id,
        companyId,
      },
    });

    return res.json({ ok: true });
  } catch (error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2025") {
        return res.status(404).json({
          error: "Purpose of visit not found.",
        });
      }
    }
    return res.status(500).json({
      error: "Failed to delete purpose of visit",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
