import { Camera } from "@/types";
import { CameraRow } from "./types";

function toNullableTrimmed(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function toSafeInt(value: unknown, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.round(n);
}

export function clampInt(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)));
}

export function normalizeCameraRow(input: Camera): CameraRow {
  return {
    id: String(input.id ?? "").trim(),
    camId: toNullableTrimmed(input.camId),
    name: String(input.name ?? "").trim(),
    rtspUrl: toNullableTrimmed(input.rtspUrl),
    isActive: Boolean(input.isActive),
    relayAgentId: toNullableTrimmed(input.relayAgentId),
    rtspUrlEnc: toNullableTrimmed(input.rtspUrlEnc),
    sendFps: clampInt(toSafeInt(input.sendFps, 2), 1, 30),
    sendWidth: clampInt(toSafeInt(input.sendWidth, 640), 160, 3840),
    sendHeight: clampInt(toSafeInt(input.sendHeight, 360), 120, 2160),
    jpegQuality: clampInt(toSafeInt(input.jpegQuality, 70), 1, 100),
    createdAt: String(input.createdAt ?? ""),
    updatedAt: String(input.updatedAt ?? ""),
  };
}

export function cameraPublicId(camera: Pick<CameraRow, "id" | "camId">): string {
  const camId = String(camera.camId ?? "").trim();
  return camId || String(camera.id ?? "").trim();
}

export function isVirtualLaptopCamera(camera: Pick<CameraRow, "id" | "camId">): boolean {
  const publicId = cameraPublicId(camera).toLowerCase();
  const dbId = String(camera.id ?? "").trim().toLowerCase();
  return publicId.startsWith("laptop-") || dbId.startsWith("laptop-");
}

export function formatDateTime(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function maskRtspUrl(url?: string | null): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "-";
  const protocolEnd = raw.indexOf("://");
  const atIndex = raw.indexOf("@");
  if (protocolEnd < 0 || atIndex < 0 || atIndex < protocolEnd) return raw;

  const protocol = raw.slice(0, protocolEnd + 3);
  const host = raw.slice(atIndex + 1);

  return `${protocol}***:***@${host}`;
}

export function searchMatchesCamera(camera: CameraRow, query: string): boolean {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;

  const haystack = [
    camera.id,
    camera.camId ?? "",
    camera.name,
    camera.rtspUrl ?? "",
    camera.relayAgentId ?? "",
  ]
    .join(" ")
    .toLowerCase();

  return haystack.includes(q);
}

export function toOptionalUpdateString(value: string | null | undefined): string | null {
  if (value === undefined) return null;
  return toNullableTrimmed(value);
}
