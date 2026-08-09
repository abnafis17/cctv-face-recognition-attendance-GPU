import { Prisma } from "@prisma/client";
import { Request, Response } from "express";
import { ZodError } from "zod";
import {
  relaySettingsCreateSchema,
  relaySettingsDeleteSchema,
  relaySettingsUpdateSchema,
} from "./dto";
import {
  createCompanyRelaySettings,
  deleteCompanyRelaySettings,
  getCompanyRelaySettings,
  listCompanyRelaySettings,
  updateCompanyRelaySettings,
} from "./relay.service";

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

export async function getRelaySettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    if (queryFlag(req, "all")) {
      const settings = await listCompanyRelaySettings(companyId);
      return res.json(settings);
    }

    const settings = await getCompanyRelaySettings(
      companyId,
      queryValue(req, "urlType", "url_type")
    );
    return res.json(settings);
  } catch (error: unknown) {
    return res.status(500).json({
      error: "Failed to load relay settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function createRelaySettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = relaySettingsCreateSchema.parse(req.body ?? {});
    const settings = await createCompanyRelaySettings(companyId, payload);
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
            "Relay URLs for this url_type already exist. Use the table action edit modal to update them.",
        });
      }
      if (error.code === "P2003") {
        return res.status(400).json({ error: "Invalid company id" });
      }
    }
    return res.status(500).json({
      error: "Failed to create relay settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function updateRelaySettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = relaySettingsUpdateSchema.parse(req.body ?? {});
    const settings = await updateCompanyRelaySettings(companyId, payload);
    if (!settings) {
      return res.status(404).json({
        error: "Relay URLs for the requested url_type were not found.",
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
            "Relay URLs for this url_type already exist. Choose a different url_type or edit that row.",
        });
      }
      if (error.code === "P2003") {
        return res.status(400).json({ error: "Invalid company id" });
      }
    }
    return res.status(500).json({
      error: "Failed to update relay settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}

export async function deleteRelaySettings(req: Request, res: Response) {
  try {
    const companyId = companyIdFromReq(req);
    if (!companyId) return res.status(400).json({ error: "Missing company id" });

    const payload = relaySettingsDeleteSchema.parse({
      ...(req.body ?? {}),
      id: req.body?.id ?? queryValue(req, "id"),
      urlType:
        req.body?.urlType ??
        req.body?.url_type ??
        queryValue(req, "urlType", "url_type"),
    });

    const deleted = await deleteCompanyRelaySettings(companyId, payload);
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
      error: "Failed to delete relay settings",
      detail: error instanceof Error ? error.message : String(error),
    });
  }
}
