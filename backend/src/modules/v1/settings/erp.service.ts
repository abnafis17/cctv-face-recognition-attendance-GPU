import { prisma } from "../../../prisma";
import {
  DEFAULT_ERP_URL_TYPE,
  type ErpSettingsCreateInput,
  type ErpSettingsUpdateInput,
} from "./dto";

export const ERP_DEFAULT_URL_TYPE = DEFAULT_ERP_URL_TYPE;

function isHttpUrl(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://");
}

function normalizeBaseUrl(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || !isHttpUrl(text)) return null;
  return text.replace(/\/+$/, "");
}

function normalizePath(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (isHttpUrl(text)) return text;

  const collapsed = text.replace(/\/+/g, "/");
  return collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
}

function joinUrlPath(...parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""));

  if (!normalized.length) return "/";
  return `/${normalized.join("/")}`;
}

export function resolveConfiguredErpUrl(input: {
  erpBaseUrl?: string | null;
  erpPrefix?: string | null;
  erpAttendanceEndpoint?: string | null;
}): string | null {
  const baseUrl = normalizeBaseUrl(input.erpBaseUrl);
  const prefix = normalizePath(input.erpPrefix);
  const endpoint = normalizePath(input.erpAttendanceEndpoint);

  if (endpoint && isHttpUrl(endpoint)) {
    return endpoint;
  }

  if (!baseUrl || !endpoint) {
    return null;
  }

  return new URL(joinUrlPath(prefix, endpoint), `${baseUrl}/`).toString();
}

export type ErpSettingsDto = {
  id: string | null;
  urlType: string | null;
  erpBaseUrl: string | null;
  erpPrefix: string | null;
  erpAttendanceEndpoint: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type ErpSettingsTarget = {
  id?: string | null;
  urlType?: string | null;
};

function normalizeErpUrlType(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  return text || ERP_DEFAULT_URL_TYPE;
}

function toErpSettingsDto(row: {
  id: string;
  urlType: string;
  erpBaseUrl: string | null;
  erpPrefix: string | null;
  erpAttendanceEndpoint: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ErpSettingsDto {
  return {
    id: row.id,
    urlType: row.urlType,
    erpBaseUrl: row.erpBaseUrl ?? null,
    erpPrefix: row.erpPrefix ?? null,
    erpAttendanceEndpoint: row.erpAttendanceEndpoint ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function emptyErpSettingsDto(urlType: string): ErpSettingsDto {
  return {
    id: null,
    urlType,
    erpBaseUrl: null,
    erpPrefix: null,
    erpAttendanceEndpoint: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function listCompanyErpSettings(
  companyId: string
): Promise<ErpSettingsDto[]> {
  const rows = await prisma.companyErpSetting.findMany({
    orderBy: [{ urlType: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      urlType: true,
      erpBaseUrl: true,
      erpPrefix: true,
      erpAttendanceEndpoint: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Deduplicate by urlType to ensure one config per type is returned globally
  const uniqueRows: typeof rows = [];
  const seenTypes = new Set<string>();
  for (const row of rows) {
    if (!seenTypes.has(row.urlType)) {
      seenTypes.add(row.urlType);
      uniqueRows.push(row);
    }
  }

  return uniqueRows.map(toErpSettingsDto);
}

export async function getCompanyErpSettings(
  companyId: string,
  urlType?: string | null
): Promise<ErpSettingsDto> {
  const rawType = String(urlType ?? "").trim();
  const resolvedUrlType = normalizeErpUrlType(urlType);
  const cleaned = rawType.toLowerCase().replace(/[^a-z0-9]/g, "");

  const rows = await prisma.companyErpSetting.findMany({
    select: {
      id: true,
      urlType: true,
      erpBaseUrl: true,
      erpPrefix: true,
      erpAttendanceEndpoint: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  let row = rows.find((r) => {
    const t = String(r.urlType ?? "").trim().toLowerCase();
    const tClean = t.replace(/[^a-z0-9]/g, "");
    return (
      t === rawType.toLowerCase() ||
      t === resolvedUrlType ||
      (cleaned.length > 0 && tClean === cleaned)
    );
  });

  if (!row && (cleaned.includes("gatepassdetail") || cleaned.includes("getgatepass") || cleaned.includes("details"))) {
    row = rows.find((r) => {
      const tClean = String(r.urlType ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      const epClean = String(r.erpAttendanceEndpoint ?? "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
      return (
        tClean.includes("getgatepassdetail") ||
        tClean.includes("gatepassdetail") ||
        tClean.includes("getallgatepassdetailsbyid") ||
        tClean === "getgatepassdetails" ||
        epClean.includes("getallgatepassdetailsbyid") ||
        epClean.includes("getgatepassdetails")
      );
    });
  }

  if (!row) {
    return emptyErpSettingsDto(resolvedUrlType);
  }

  const erpBaseUrl = row.erpBaseUrl ?? null;
  const erpPrefix = row.erpPrefix ?? null;
  const erpAttendanceEndpoint = row.erpAttendanceEndpoint ?? null;
  const hasErpConfig =
    Boolean(String(erpBaseUrl ?? "").trim()) ||
    Boolean(String(erpPrefix ?? "").trim()) ||
    Boolean(String(erpAttendanceEndpoint ?? "").trim());

  if (!hasErpConfig) {
    return emptyErpSettingsDto(resolvedUrlType);
  }

  return toErpSettingsDto(row);
}

export async function createCompanyErpSettings(
  companyId: string,
  payload: ErpSettingsCreateInput
): Promise<ErpSettingsDto> {
  const resolvedUrlType = normalizeErpUrlType(payload.urlType);

  const existing = await prisma.companyErpSetting.findFirst({
    where: {
      companyId,
      urlType: { equals: resolvedUrlType, mode: "insensitive" },
    },
  });

  if (existing) {
    const row = await prisma.companyErpSetting.update({
      where: { id: existing.id },
      data: {
        ...(payload.erpBaseUrl !== undefined ? { erpBaseUrl: payload.erpBaseUrl } : {}),
        ...(payload.erpPrefix !== undefined ? { erpPrefix: payload.erpPrefix } : {}),
        ...(payload.erpAttendanceEndpoint !== undefined
          ? { erpAttendanceEndpoint: payload.erpAttendanceEndpoint }
          : {}),
      },
      select: {
        id: true,
        urlType: true,
        erpBaseUrl: true,
        erpPrefix: true,
        erpAttendanceEndpoint: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return toErpSettingsDto(row);
  }

  const row = await prisma.companyErpSetting.create({
    data: {
      companyId,
      urlType: resolvedUrlType,
      erpBaseUrl: payload.erpBaseUrl !== undefined ? payload.erpBaseUrl : null,
      erpPrefix: payload.erpPrefix !== undefined ? payload.erpPrefix : null,
      erpAttendanceEndpoint:
        payload.erpAttendanceEndpoint !== undefined
          ? payload.erpAttendanceEndpoint
          : null,
    },
    select: {
      id: true,
      urlType: true,
      erpBaseUrl: true,
      erpPrefix: true,
      erpAttendanceEndpoint: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toErpSettingsDto(row);
}

async function findCompanyErpSettingTarget(
  companyId: string,
  target: ErpSettingsTarget
): Promise<{ id: string } | null> {
  const id = String(target.id ?? "").trim();
  if (id) {
    const row = await prisma.companyErpSetting.findFirst({
      where: { id },
      select: { id: true },
    });
    return row ? { id: row.id } : null;
  }

  const resolvedUrlType = normalizeErpUrlType(target.urlType);
  const row = await prisma.companyErpSetting.findFirst({
    where: {
      urlType: { equals: resolvedUrlType, mode: "insensitive" },
    },
    select: { id: true },
  });
  return row ? { id: row.id } : null;
}

export async function updateCompanyErpSettings(
  companyId: string,
  payload: ErpSettingsUpdateInput
): Promise<ErpSettingsDto | null> {
  const target = await findCompanyErpSettingTarget(companyId, payload);
  if (!target) return null;

  const row = await prisma.companyErpSetting.update({
    where: { id: target.id },
    data: {
      urlType: normalizeErpUrlType(payload.urlType),
      ...(payload.erpBaseUrl !== undefined
        ? { erpBaseUrl: payload.erpBaseUrl }
        : {}),
      ...(payload.erpPrefix !== undefined ? { erpPrefix: payload.erpPrefix } : {}),
      ...(payload.erpAttendanceEndpoint !== undefined
        ? { erpAttendanceEndpoint: payload.erpAttendanceEndpoint }
        : {}),
    },
    select: {
      id: true,
      urlType: true,
      erpBaseUrl: true,
      erpPrefix: true,
      erpAttendanceEndpoint: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toErpSettingsDto(row);
}

export async function deleteCompanyErpSettings(
  companyId: string,
  target?: ErpSettingsTarget
): Promise<boolean> {
  const resolvedTarget = await findCompanyErpSettingTarget(companyId, target ?? {});
  if (!resolvedTarget) return false;

  await prisma.companyErpSetting.delete({
    where: { id: resolvedTarget.id },
  });

  return true;
}
