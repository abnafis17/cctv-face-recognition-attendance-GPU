import axios from "axios";
import { getCompanyErpSettings, resolveConfiguredErpUrl } from "./erpSettings.service";

const GATEPASS_ERP_URL_TYPES = ["gatepasstypes", "gatepass"] as const;
const DEFAULT_TIMEOUT_MS = 10_000;

export type GatepassTypeOptionDto = {
  id: string;
  label: string;
  companyId: string | null;
};

function normalizeGatepassTypeRow(row: unknown): GatepassTypeOptionDto | null {
  if (!row || typeof row !== "object") return null;

  const anyRow = row as Record<string, unknown>;
  const id = String(anyRow.id ?? "").trim();
  const label = String(anyRow.passtitle ?? anyRow.passTitle ?? "").trim();
  const companyId =
    String(anyRow.companyID ?? anyRow.companyId ?? "").trim() || null;

  if (!id || !label) return null;

  return {
    id,
    label,
    companyId,
  };
}

function normalizeGatepassTypesPayload(payload: unknown): GatepassTypeOptionDto[] {
  const source = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.data)
      ? (payload as any).data
      : [];

  const rows = source
    .map(normalizeGatepassTypeRow)
    .filter((row: GatepassTypeOptionDto | null): row is GatepassTypeOptionDto =>
      Boolean(row),
    );

  return rows.sort((a: GatepassTypeOptionDto, b: GatepassTypeOptionDto) =>
    a.label.localeCompare(b.label, undefined, {
      numeric: true,
      sensitivity: "base",
    }),
  );
}

async function resolveGatepassTypesUrl(companyId: string): Promise<string | null> {
  for (const urlType of GATEPASS_ERP_URL_TYPES) {
    const settings = await getCompanyErpSettings(companyId, urlType);
    const url = resolveConfiguredErpUrl(settings);
    if (url) {
      return url;
    }
  }

  return null;
}

export async function listCompanyGatepassTypes(
  companyId: string,
): Promise<GatepassTypeOptionDto[]> {
  const url = await resolveGatepassTypesUrl(companyId);

  if (!url) {
    throw new Error(
      'ERP gatepass settings are incomplete. Configure urlType "gatepasstypes" or "gatepass" with base URL, prefix, and endpoint.',
    );
  }

  const response = await axios.post(url, "", {
    headers: {
      Accept: "*/*",
      "Content-Type": "application/x-www-form-urlencoded",
      "x-api-version": "2.0",
    },
    timeout: DEFAULT_TIMEOUT_MS,
    validateStatus: () => true,
  });

  if (response.status < 200 || response.status >= 300) {
    const detail =
      typeof response.data === "string"
        ? response.data
        : JSON.stringify(response.data ?? {});

    throw new Error(
      `ERP gatepass type request failed with status ${response.status}: ${detail}`,
    );
  }

  return normalizeGatepassTypesPayload(response.data);
}
