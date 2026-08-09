import { z } from "zod";

export const DEFAULT_RELAY_URL_TYPE = "door";
export const DEFAULT_ERP_URL_TYPE = "attendance";

function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

const relayUrlField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  .refine(
    (value) => value === undefined || value === null || isHttpUrl(value),
    "Must be a valid http(s) URL"
  );

const idField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined || value === null) return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  });

function urlTypeField(defaultValue: string) {
  return z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === undefined || value === null) return undefined;
      const trimmed = value.trim().toLowerCase();
      return trimmed.length > 0 ? trimmed : undefined;
    })
    .transform((value) => value ?? defaultValue);
}

const relayUrlTypeField = urlTypeField(DEFAULT_RELAY_URL_TYPE);

export const relaySettingsCreateSchema = z
  .object({
    relayOnUrl: relayUrlField.optional(),
    relaySilentUrl: relayUrlField.optional(),
    urlType: relayUrlTypeField.optional(),
    url_type: relayUrlTypeField.optional(),
    relay_on_url: relayUrlField.optional(),
    relay_silent_url: relayUrlField.optional(),
  })
  .transform((value) => ({
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
    relayOnUrl:
      value.relayOnUrl !== undefined ? value.relayOnUrl : value.relay_on_url,
    relaySilentUrl:
      value.relaySilentUrl !== undefined
        ? value.relaySilentUrl
        : value.relay_silent_url,
  }))
  .refine(
    (value) =>
      value.relayOnUrl !== undefined || value.relaySilentUrl !== undefined,
    { message: "Nothing to save" }
  );

export type RelaySettingsCreateInput = z.infer<typeof relaySettingsCreateSchema>;

export const relaySettingsUpdateSchema = z
  .object({
    id: idField.optional(),
    urlType: relayUrlTypeField.optional(),
    url_type: relayUrlTypeField.optional(),
    relayOnUrl: relayUrlField.optional(),
    relaySilentUrl: relayUrlField.optional(),
    relay_on_url: relayUrlField.optional(),
    relay_silent_url: relayUrlField.optional(),
  })
  .transform((value) => ({
    id: value.id,
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
    relayOnUrl:
      value.relayOnUrl !== undefined ? value.relayOnUrl : value.relay_on_url,
    relaySilentUrl:
      value.relaySilentUrl !== undefined
        ? value.relaySilentUrl
        : value.relay_silent_url,
  }))
  .refine(
    (value) =>
      value.relayOnUrl !== undefined || value.relaySilentUrl !== undefined,
    { message: "Nothing to save" }
  );

export type RelaySettingsUpdateInput = z.infer<typeof relaySettingsUpdateSchema>;

export const relaySettingsDeleteSchema = z
  .object({
    id: idField.optional(),
    urlType: relayUrlTypeField.optional(),
    url_type: relayUrlTypeField.optional(),
  })
  .transform((value) => ({
    id: value.id,
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
  }));

export type RelaySettingsDeleteInput = z.infer<typeof relaySettingsDeleteSchema>;

const erpUrlField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  })
  .refine(
    (value) => value === undefined || value === null || isHttpUrl(value),
    "Must be a valid http(s) URL"
  );

const erpPrefixField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  });

const erpEndpointField = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (value === undefined) return undefined;
    if (value === null) return null;
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (isHttpUrl(trimmed)) return trimmed;
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  })
  .refine(
    (value) =>
      value === undefined ||
      value === null ||
      isHttpUrl(value) ||
      value.startsWith("/"),
    "Must be a valid http(s) URL or path starting with '/'"
  );

const erpUrlTypeField = urlTypeField(DEFAULT_ERP_URL_TYPE);

export const erpSettingsCreateSchema = z
  .object({
    erpBaseUrl: erpUrlField.optional(),
    erpPrefix: erpPrefixField.optional(),
    erpAttendanceEndpoint: erpEndpointField.optional(),
    urlType: erpUrlTypeField.optional(),
    url_type: erpUrlTypeField.optional(),
    erp_base_url: erpUrlField.optional(),
    erp_prefix: erpPrefixField.optional(),
    erp_attendance_endpoint: erpEndpointField.optional(),
  })
  .transform((value) => ({
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
    erpBaseUrl:
      value.erpBaseUrl !== undefined ? value.erpBaseUrl : value.erp_base_url,
    erpPrefix:
      value.erpPrefix !== undefined ? value.erpPrefix : value.erp_prefix,
    erpAttendanceEndpoint:
      value.erpAttendanceEndpoint !== undefined
        ? value.erpAttendanceEndpoint
        : value.erp_attendance_endpoint,
  }))
  .refine(
    (value) =>
      value.erpBaseUrl !== undefined ||
      value.erpPrefix !== undefined ||
      value.erpAttendanceEndpoint !== undefined,
    { message: "Nothing to save" }
  );

export type ErpSettingsCreateInput = z.infer<typeof erpSettingsCreateSchema>;

export const erpSettingsUpdateSchema = z
  .object({
    id: idField.optional(),
    urlType: erpUrlTypeField.optional(),
    url_type: erpUrlTypeField.optional(),
    erpBaseUrl: erpUrlField.optional(),
    erpPrefix: erpPrefixField.optional(),
    erpAttendanceEndpoint: erpEndpointField.optional(),
    erp_base_url: erpUrlField.optional(),
    erp_prefix: erpPrefixField.optional(),
    erp_attendance_endpoint: erpEndpointField.optional(),
  })
  .transform((value) => ({
    id: value.id,
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
    erpBaseUrl:
      value.erpBaseUrl !== undefined ? value.erpBaseUrl : value.erp_base_url,
    erpPrefix:
      value.erpPrefix !== undefined ? value.erpPrefix : value.erp_prefix,
    erpAttendanceEndpoint:
      value.erpAttendanceEndpoint !== undefined
        ? value.erpAttendanceEndpoint
        : value.erp_attendance_endpoint,
  }))
  .refine(
    (value) =>
      value.erpBaseUrl !== undefined ||
      value.erpPrefix !== undefined ||
      value.erpAttendanceEndpoint !== undefined,
    { message: "Nothing to save" }
  );

export type ErpSettingsUpdateInput = z.infer<typeof erpSettingsUpdateSchema>;

export const erpSettingsDeleteSchema = z
  .object({
    id: idField.optional(),
    urlType: erpUrlTypeField.optional(),
    url_type: erpUrlTypeField.optional(),
  })
  .transform((value) => ({
    id: value.id,
    urlType: value.urlType !== undefined ? value.urlType : value.url_type,
  }));

export type ErpSettingsDeleteInput = z.infer<typeof erpSettingsDeleteSchema>;
