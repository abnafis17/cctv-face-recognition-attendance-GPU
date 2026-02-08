import { z } from "zod";

const QUERY_TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const QUERY_FALSE_VALUES = new Set(["0", "false", "no", "off", ""]);

function coerceBooleanQuery(value: unknown): unknown {
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return coerceBooleanQuery(value[0]);
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();
  if (QUERY_TRUE_VALUES.has(raw)) return true;
  if (QUERY_FALSE_VALUES.has(raw)) return false;
  return value;
}

function normalizedOptionalString(maxLength: number) {
  return z.preprocess((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }, z.string().min(1).max(maxLength).nullable().optional());
}

const cameraNameSchema = z.string().trim().min(1).max(120);
const cameraIdSchema = z.string().trim().min(1).max(191);
const rtspUrlSchema = z.string().trim().min(1).max(4096);
const rtspUrlOptionalSchema = normalizedOptionalString(4096);
const optionalRelayAgentSchema = normalizedOptionalString(191);
const optionalRtspEncSchema = normalizedOptionalString(100000);

const optionalSendFpsSchema = z.coerce.number().int().min(1).max(30).optional();
const optionalSendWidthSchema = z.coerce.number().int().min(160).max(3840).optional();
const optionalSendHeightSchema = z.coerce.number().int().min(120).max(2160).optional();
const optionalJpegQualitySchema = z.coerce.number().int().min(1).max(100).optional();
const optionalIsActiveSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  return coerceBooleanQuery(value);
}, z.boolean().optional());

export const cameraListQuerySchema = z.object({
  includeVirtual: z.preprocess(coerceBooleanQuery, z.boolean().optional()),
});

export const cameraCreateSchema = z.object({
  camId: normalizedOptionalString(191),
  name: cameraNameSchema,
  rtspUrl: rtspUrlSchema,
  relayAgentId: optionalRelayAgentSchema,
  rtspUrlEnc: optionalRtspEncSchema,
  sendFps: optionalSendFpsSchema,
  sendWidth: optionalSendWidthSchema,
  sendHeight: optionalSendHeightSchema,
  jpegQuality: optionalJpegQualitySchema,
});

export const cameraUpdateSchema = z
  .object({
    camId: normalizedOptionalString(191),
    name: cameraNameSchema.optional(),
    rtspUrl: rtspUrlOptionalSchema,
    relayAgentId: optionalRelayAgentSchema,
    rtspUrlEnc: optionalRtspEncSchema,
    sendFps: optionalSendFpsSchema,
    sendWidth: optionalSendWidthSchema,
    sendHeight: optionalSendHeightSchema,
    jpegQuality: optionalJpegQualitySchema,
    isActive: optionalIsActiveSchema,
  })
  .refine(
    (value) =>
      value.camId !== undefined ||
      value.name !== undefined ||
      value.rtspUrl !== undefined ||
      value.relayAgentId !== undefined ||
      value.rtspUrlEnc !== undefined ||
      value.sendFps !== undefined ||
      value.sendWidth !== undefined ||
      value.sendHeight !== undefined ||
      value.jpegQuality !== undefined ||
      value.isActive !== undefined,
    { message: "Nothing to update" }
  );

export const cameraParamSchema = z.object({
  id: cameraIdSchema,
});

export type CameraListQueryInput = z.infer<typeof cameraListQuerySchema>;
export type CameraCreateInput = {
  camId?: string | null;
  name: string;
  rtspUrl: string;
  relayAgentId?: string | null;
  rtspUrlEnc?: string | null;
  sendFps?: number;
  sendWidth?: number;
  sendHeight?: number;
  jpegQuality?: number;
};
export type CameraUpdateInput = {
  camId?: string | null;
  name?: string;
  rtspUrl?: string | null;
  relayAgentId?: string | null;
  rtspUrlEnc?: string | null;
  sendFps?: number;
  sendWidth?: number;
  sendHeight?: number;
  jpegQuality?: number;
  isActive?: boolean;
};
