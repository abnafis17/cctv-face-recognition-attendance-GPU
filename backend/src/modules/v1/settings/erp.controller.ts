import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  erpSettingsCreateSchema,
  erpSettingsDeleteSchema,
  erpSettingsUpdateSchema,
} from "./dto";
import {
  createCompanyErpSettings,
  deleteCompanyErpSettings,
  getCompanyErpSettings,
  listCompanyErpSettings,
  updateCompanyErpSettings,
} from "./erp.service";

function companyIdFromReq(req: Request): string {
  return String((req as any).companyId ?? "").trim();
}

function validationErrorMessage(error: ZodError): string {
  const first = error.issues?.[0];
  return (
    first?.message ||
    (first?.path?.length ? `${first.path.join(".")} is invalid` : "Invalid input")
  );
}

function queryValue(req: Request, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = req.query?.[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return undefined;
}

function queryFlag(req: Request, ...keys: string[]): boolean {
  const value = queryValue(req, ...keys);
  if (!value) return false;
  const normalized = value.toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export async function getErpSettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    if (queryFlag(req, "all")) {
      const settings = await listCompanyErpSettings(companyId);
      return res.json(settings);
    }

    const settings = await getCompanyErpSettings(
      companyId,
      queryValue(req, "urlType", "url_type")
    );
    return res.json(settings);
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to load ERP settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createErpSettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = erpSettingsCreateSchema.parse(req.body ?? {});
    const settings = await createCompanyErpSettings(companyId, payload);
    return res.status(201).json(settings);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: validationErrorMessage(error),
        issues: error.issues,
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error:
            "ERP URLs for this url_type already exist. Use the table action edit modal to update them.",
        });
      }
      if (error.code === "P2003") {
        return res.status(400).json({ error: "Invalid company id" });
      }
    }
    return res.status(500).json({
      error: "Failed to create ERP settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateErpSettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = erpSettingsUpdateSchema.parse(req.body ?? {});
    const settings = await updateCompanyErpSettings(companyId, payload);
    if (!settings) {
      return res.status(404).json({
        error: "ERP URLs for the requested url_type were not found.",
      });
    }
    return res.json(settings);
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: validationErrorMessage(error),
        issues: error.issues,
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return res.status(409).json({
          error:
            "ERP URLs for this url_type already exist. Choose a different url_type or edit that row.",
        });
      }
      if (error.code === "P2003") {
        return res.status(400).json({ error: "Invalid company id" });
      }
    }
    return res.status(500).json({
      error: "Failed to update ERP settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteErpSettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = erpSettingsDeleteSchema.parse({
      ...(req.body ?? {}),
      id: req.body?.id ?? queryValue(req, "id"),
      urlType:
        req.body?.urlType ??
        req.body?.url_type ??
        queryValue(req, "urlType", "url_type"),
    });

    const deleted = await deleteCompanyErpSettings(companyId, payload);
    return res.json({ ok: true, deleted });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({
        error: validationErrorMessage(error),
        issues: error.issues,
      });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2003") {
        return res.status(400).json({ error: "Invalid company id" });
      }
    }
    return res.status(500).json({
      error: "Failed to delete ERP settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
