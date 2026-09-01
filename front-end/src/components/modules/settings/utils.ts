import type {
  ErpApiRow,
  ErpSettingsResponse,
  RelayApiRow,
  RelaySettingsResponse,
} from "./types";

function toNullableTrimmed(value: unknown): string | null {
  const text = String(value ?? "").trim();
  return text.length > 0 ? text : null;
}

export function normalizeRelayApiRow(
  input: RelaySettingsResponse
): RelayApiRow | null {
  const id = String(input?.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    urlType: toNullableTrimmed(input?.urlType),
    relayOnUrl: toNullableTrimmed(input?.relayOnUrl),
    relaySilentUrl: toNullableTrimmed(input?.relaySilentUrl),
    createdAt: String(input?.createdAt ?? "").trim(),
    updatedAt: String(input?.updatedAt ?? "").trim(),
  };
}

export function formatDateTime(iso?: string | null): string {
  const text = String(iso ?? "").trim();
  if (!text) return "-";
  const date = new Date(text);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function searchMatchesRelayRow(row: RelayApiRow, query: string): boolean {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    row.id,
    row.urlType ?? "",
    row.relayOnUrl ?? "",
    row.relaySilentUrl ?? "",
    row.createdAt,
    row.updatedAt,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function normalizeErpApiRow(input: ErpSettingsResponse): ErpApiRow | null {
  const id = String(input?.id ?? "").trim();
  if (!id) return null;

  return {
    id,
    urlType: toNullableTrimmed(input?.urlType),
    erpBaseUrl: toNullableTrimmed(input?.erpBaseUrl),
    erpPrefix: toNullableTrimmed(input?.erpPrefix),
    erpAttendanceEndpoint: toNullableTrimmed(input?.erpAttendanceEndpoint),
    isActive: input?.isActive ?? true,
    createdAt: String(input?.createdAt ?? "").trim(),
    updatedAt: String(input?.updatedAt ?? "").trim(),
  };
}

export function searchMatchesErpRow(row: ErpApiRow, query: string): boolean {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    row.id,
    row.urlType ?? "",
    row.erpBaseUrl ?? "",
    row.erpPrefix ?? "",
    row.erpAttendanceEndpoint ?? "",
    row.createdAt,
    row.updatedAt,
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}
