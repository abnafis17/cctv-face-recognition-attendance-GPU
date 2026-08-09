import { prisma } from "../../../prisma";
import {
  DEFAULT_RELAY_URL_TYPE,
  type RelaySettingsCreateInput,
  type RelaySettingsUpdateInput,
} from "./dto";

export const RELAY_DEFAULT_URL_TYPE = DEFAULT_RELAY_URL_TYPE;

export type RelaySettingsDto = {
  id: string | null;
  urlType: string | null;
  relayOnUrl: string | null;
  relaySilentUrl: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

type RelaySettingsTarget = {
  id?: string | null;
  urlType?: string | null;
};

function normalizeRelayUrlType(value: unknown): string {
  const text = String(value ?? "").trim().toLowerCase();
  return text || RELAY_DEFAULT_URL_TYPE;
}

function toRelaySettingsDto(row: {
  id: string;
  urlType: string;
  relayOnUrl: string | null;
  relaySilentUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}): RelaySettingsDto {
  return {
    id: row.id,
    urlType: row.urlType,
    relayOnUrl: row.relayOnUrl ?? null,
    relaySilentUrl: row.relaySilentUrl ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function emptyRelaySettingsDto(urlType: string): RelaySettingsDto {
  return {
    id: null,
    urlType,
    relayOnUrl: null,
    relaySilentUrl: null,
    createdAt: null,
    updatedAt: null,
  };
}

export async function listCompanyRelaySettings(
  companyId: string
): Promise<RelaySettingsDto[]> {
  const rows = await prisma.companyRelaySetting.findMany({
    where: { companyId },
    orderBy: [{ urlType: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      urlType: true,
      relayOnUrl: true,
      relaySilentUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return rows.map(toRelaySettingsDto);
}

export async function getCompanyRelaySettings(
  companyId: string,
  urlType?: string | null
): Promise<RelaySettingsDto> {
  const resolvedUrlType = normalizeRelayUrlType(urlType);
  const row = await prisma.companyRelaySetting.findUnique({
    where: {
      companyId_urlType: {
        companyId,
        urlType: resolvedUrlType,
      },
    },
    select: {
      id: true,
      urlType: true,
      relayOnUrl: true,
      relaySilentUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!row) {
    return emptyRelaySettingsDto(resolvedUrlType);
  }

  const relayOnUrl = row.relayOnUrl ?? null;
  const relaySilentUrl = row.relaySilentUrl ?? null;
  const hasRelayConfig =
    Boolean(String(relayOnUrl ?? "").trim()) ||
    Boolean(String(relaySilentUrl ?? "").trim());

  if (!hasRelayConfig) {
    return emptyRelaySettingsDto(resolvedUrlType);
  }

  return toRelaySettingsDto(row);
}

export async function createCompanyRelaySettings(
  companyId: string,
  payload: RelaySettingsCreateInput
): Promise<RelaySettingsDto> {
  const row = await prisma.companyRelaySetting.create({
    data: {
      companyId,
      urlType: normalizeRelayUrlType(payload.urlType),
      relayOnUrl:
        payload.relayOnUrl !== undefined ? payload.relayOnUrl : null,
      relaySilentUrl:
        payload.relaySilentUrl !== undefined ? payload.relaySilentUrl : null,
    },
    select: {
      id: true,
      urlType: true,
      relayOnUrl: true,
      relaySilentUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toRelaySettingsDto(row);
}

async function findCompanyRelaySettingTarget(
  companyId: string,
  target: RelaySettingsTarget
): Promise<{ id: string } | null> {
  const id = String(target.id ?? "").trim();
  if (id) {
    const row = await prisma.companyRelaySetting.findFirst({
      where: { id, companyId },
      select: { id: true },
    });
    return row ? { id: row.id } : null;
  }

  const row = await prisma.companyRelaySetting.findUnique({
    where: {
      companyId_urlType: {
        companyId,
        urlType: normalizeRelayUrlType(target.urlType),
      },
    },
    select: { id: true },
  });
  return row ? { id: row.id } : null;
}

export async function updateCompanyRelaySettings(
  companyId: string,
  payload: RelaySettingsUpdateInput
): Promise<RelaySettingsDto | null> {
  const target = await findCompanyRelaySettingTarget(companyId, payload);
  if (!target) return null;

  const row = await prisma.companyRelaySetting.update({
    where: { id: target.id },
    data: {
      urlType: normalizeRelayUrlType(payload.urlType),
      ...(payload.relayOnUrl !== undefined
        ? { relayOnUrl: payload.relayOnUrl }
        : {}),
      ...(payload.relaySilentUrl !== undefined
        ? { relaySilentUrl: payload.relaySilentUrl }
        : {}),
    },
    select: {
      id: true,
      urlType: true,
      relayOnUrl: true,
      relaySilentUrl: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return toRelaySettingsDto(row);
}

export async function deleteCompanyRelaySettings(
  companyId: string,
  target?: RelaySettingsTarget
): Promise<boolean> {
  const resolvedTarget = await findCompanyRelaySettingTarget(companyId, target ?? {});
  if (!resolvedTarget) return false;

  await prisma.companyRelaySetting.delete({
    where: { id: resolvedTarget.id },
  });

  return true;
}
