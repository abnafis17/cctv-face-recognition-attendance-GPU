import { prisma } from "../prisma";
import {
  DEFAULT_ERP_URL_TYPE,
  type ErpSettingsCreateInput,
  type ErpSettingsUpdateInput,
} from "../validators/settings.validators";

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
    where: { companyId },
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

  return rows.map(toErpSettingsDto);
}

export async function getCompanyErpSettings(
  companyId: string,
  urlType?: string | null
): Promise<ErpSettingsDto> {
  const resolvedUrlType = normalizeErpUrlType(urlType);
  const row = await prisma.companyErpSetting.findUnique({
    where: {
      companyId_urlType: {
        companyId,
        urlType: resolvedUrlType,
      },
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
  const row = await prisma.companyErpSetting.create({
    data: {
      companyId,
      urlType: normalizeErpUrlType(payload.urlType),
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
      where: { id, companyId },
      select: { id: true },
    });
    return row ? { id: row.id } : null;
  }

  const row = await prisma.companyErpSetting.findUnique({
    where: {
      companyId_urlType: {
        companyId,
        urlType: normalizeErpUrlType(target.urlType),
      },
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
