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
const optionalBoundingBoxIdSchema = normalizedOptionalString(191);
const boundingBoxNameSchema = z.string().trim().min(1).max(120);
const optionalTrackingQueryTextSchema = normalizedOptionalString(120);
const optionalTrackingDateSchema = normalizedOptionalString(20);
const optionalTrackingDateTimeSchema = normalizedOptionalString(64);
const optionalTrackingStatusSchema = z.preprocess((value) => {
  if (value === undefined || value === null) return undefined;
  const normalized = String(value).trim().toLowerCase();
  return normalized || undefined;
}, z.enum(["out", "in"]).optional());

const optionalSendFpsSchema = z.coerce.number().int().min(1).max(30).optional();
const optionalSendWidthSchema = z.coerce.number().int().min(160).max(3840).optional();
const optionalSendHeightSchema = z.coerce.number().int().min(120).max(2160).optional();
const optionalJpegQualitySchema = z.coerce.number().int().min(1).max(100).optional();
const optionalIsActiveSchema = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === null) return undefined;
  return coerceBooleanQuery(value);
}, z.boolean().optional());

function normalizeCameraTask(value: unknown, fallback?: string): string | undefined {
  if (value === undefined || value === null) return fallback;

  const normalized = String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (!normalized) return fallback;
  if (normalized === "gatepass") return "gate_pass";
  return normalized;
}

const createTaskSchema = z.preprocess((value) => {
  return normalizeCameraTask(value, "attendance") ?? "attendance";
}, z.string().min(1).max(64));
const optionalTaskSchema = z.preprocess((value) => {
  return normalizeCameraTask(value);
}, z.string().min(1).max(64).optional());
const cameraAuthorizedEmployeeIdsSchema = z.preprocess(
  (value) => {
    if (value === undefined || value === null) return [];
    if (!Array.isArray(value)) return value;
    return value.map((item) => String(item ?? "").trim());
  },
  z.array(z.string().min(1).max(191)).max(5000)
);
const boundingBoxPointSchema = z.object({
  x: z.coerce.number().min(0).max(1),
  y: z.coerce.number().min(0).max(1),
});
const cameraBoundingBoxInputSchema = z.object({
  id: optionalBoundingBoxIdSchema,
  name: boundingBoxNameSchema,
  topLeft: boundingBoxPointSchema,
  topRight: boundingBoxPointSchema,
  bottomLeft: boundingBoxPointSchema,
  bottomRight: boundingBoxPointSchema,
  employeeIds: cameraAuthorizedEmployeeIdsSchema,
});
const trackingLimitSchema = z.preprocess((value) => {
  if (value === undefined || value === null || value === "") return 500;
  return value;
}, z.coerce.number().int().min(1).max(2000).default(500));

export const cameraListQuerySchema = z.object({
  includeVirtual: z.preprocess(coerceBooleanQuery, z.boolean().optional()),
  task: optionalTaskSchema,
});

export const cameraCreateSchema = z.object({
  camId: normalizedOptionalString(191),
  name: cameraNameSchema,
  rtspUrl: rtspUrlSchema,
  task: createTaskSchema,
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
    task: optionalTaskSchema,
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
      value.isActive !== undefined ||
      value.task !== undefined,
    { message: "Nothing to update" }
  );

export const cameraParamSchema = z.object({
  id: cameraIdSchema,
});

export const cameraAuthorizedEmployeesUpdateSchema = z.object({
  employeeIds: cameraAuthorizedEmployeeIdsSchema,
});
export const cameraBoundingBoxesUpdateSchema = z.object({
  boxes: z.array(cameraBoundingBoxInputSchema).max(100),
});
export const cameraBoundingBoxTrackingListQuerySchema = z.object({
  date: optionalTrackingDateSchema,
  fromDate: optionalTrackingDateSchema,
  toDate: optionalTrackingDateSchema,
  q: optionalTrackingQueryTextSchema,
  boundingBoxId: optionalBoundingBoxIdSchema,
  status: optionalTrackingStatusSchema,
  limit: trackingLimitSchema,
});
export const cameraBoundingBoxTrackingEventSchema = z.object({
  boundingBoxId: z.string().trim().min(1).max(191),
  employeeId: z.string().trim().min(1).max(191),
  eventType: z.preprocess((value) => {
    const normalized = String(value ?? "")
      .trim()
      .toLowerCase();
    if (normalized === "inside" || normalized === "return") return "in";
    if (normalized === "outside") return "out";
    return normalized;
  }, z.enum(["out", "in"])),
  occurredAt: optionalTrackingDateTimeSchema,
  confidence: z.coerce.number().min(0).max(1).nullable().optional(),
});

export type CameraListQueryInput = z.infer<typeof cameraListQuerySchema>;
export type CameraCreateInput = {
  camId?: string | null;
  name: string;
  rtspUrl: string;
  task?: string;
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
  task?: string;
  relayAgentId?: string | null;
  rtspUrlEnc?: string | null;
  sendFps?: number;
  sendWidth?: number;
  sendHeight?: number;
  jpegQuality?: number;
  isActive?: boolean;
};
export type CameraAuthorizedEmployeesUpdateInput = z.infer<
  typeof cameraAuthorizedEmployeesUpdateSchema
>;
export type CameraBoundingBoxesUpdateInput = z.infer<
  typeof cameraBoundingBoxesUpdateSchema
>;
export type CameraBoundingBoxTrackingListQueryInput = z.infer<
  typeof cameraBoundingBoxTrackingListQuerySchema
>;
export type CameraBoundingBoxTrackingEventInput = z.infer<
  typeof cameraBoundingBoxTrackingEventSchema
>;
