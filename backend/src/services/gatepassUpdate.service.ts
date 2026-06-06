import axios from "axios";
import { getCompanyErpSettings } from "./erpSettings.service";

const GATEPASS_UPDATE_ERP_URL_TYPE = "updategatepass";
const DEFAULT_TIMEOUT_MS = 10_000;

export type GatepassUpdateSyncInput = {
  empId?: string | null;
  outTime: Date;
  inTime: Date;
  outTimeClock?: string | null;
  inTimeClock?: string | null;
  inDateDDMMYYYY?: string | null;
};

export type GatepassUpdateSyncResult = {
  attempted: boolean;
  acknowledged: boolean;
  ackAt: Date | null;
  payload: Record<string, unknown>;
  errorMessage: string | null;
};

type ErpGatepassUpdatePayloadRow = {
  empId: string;
  timeStart: string;
  date: string;
  timeEnd: string;
};

function normalizeClock(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;

  const match = text.match(/^(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
  if (!match) return null;

  const hh = Number(match[1]);
  const mm = Number(match[2]);
  const ss = Number(match[3]);
  if (
    !Number.isFinite(hh) ||
    !Number.isFinite(mm) ||
    !Number.isFinite(ss) ||
    hh < 0 ||
    hh > 23 ||
    mm < 0 ||
    mm > 59 ||
    ss < 0 ||
    ss > 59
  ) {
    return null;
  }

  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(
    ss,
  ).padStart(2, "0")}`;
}

function normalizeDateDDMMYYYY(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(text)) return null;
  return text;
}

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

function resolveConfiguredErpUrl(input: {
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

function toDhakaTimeHHMMSS(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(value);

  const hh = parts.find((part) => part.type === "hour")?.value ?? "00";
  const mm = parts.find((part) => part.type === "minute")?.value ?? "00";
  const ss = parts.find((part) => part.type === "second")?.value ?? "00";

  return `${hh}:${mm}:${ss}`;
}

function toDhakaDateDDMMYYYY(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).formatToParts(value);

  const dd = parts.find((part) => part.type === "day")?.value ?? "01";
  const mm = parts.find((part) => part.type === "month")?.value ?? "01";
  const yyyy = parts.find((part) => part.type === "year")?.value ?? "1970";

  return `${dd}/${mm}/${yyyy}`;
}

function toJsonSafeValue(value: unknown): unknown {
  if (value === undefined) return null;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function buildRequestBody(
  input: GatepassUpdateSyncInput,
): ErpGatepassUpdatePayloadRow[] {
  const outTimeClock =
    normalizeClock(input.outTimeClock) ?? toDhakaTimeHHMMSS(input.outTime);
  const inTimeClock =
    normalizeClock(input.inTimeClock) ?? toDhakaTimeHHMMSS(input.inTime);
  const inDate =
    normalizeDateDDMMYYYY(input.inDateDDMMYYYY) ?? toDhakaDateDDMMYYYY(input.inTime);

  return [
    {
      empId: String(input.empId ?? "").trim(),
      timeStart: outTimeClock,
      date: inDate,
      timeEnd: inTimeClock,
    },
  ];
}

function buildFailureResult(
  requestBody: ErpGatepassUpdatePayloadRow[],
  detail: string,
  extras?: Record<string, unknown>,
): GatepassUpdateSyncResult {
  return {
    attempted: false,
    acknowledged: false,
    ackAt: null,
    errorMessage: detail,
    payload: {
      ok: false,
      detail,
      requestBody,
      urlType: GATEPASS_UPDATE_ERP_URL_TYPE,
      ...(extras ?? {}),
    },
  };
}

export async function updateGatepassReturnToErp(
  companyId: string,
  input: GatepassUpdateSyncInput,
): Promise<GatepassUpdateSyncResult> {
  const requestBody = buildRequestBody(input);

  try {
    const empId = String(input.empId ?? "").trim();
    if (!empId) {
      return buildFailureResult(
        requestBody,
        "Employee empId is missing. ERP gatepass return update skipped.",
      );
    }

    const settings = await getCompanyErpSettings(
      companyId,
      GATEPASS_UPDATE_ERP_URL_TYPE,
    );
    const url = resolveConfiguredErpUrl(settings);

    if (!url) {
      return buildFailureResult(
        requestBody,
        'ERP update gatepass settings are incomplete. Configure urlType "updategatepass" with base URL, prefix, and endpoint.',
      );
    }

    const response = await axios.post(url, requestBody, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json; x-api-version=1.0",
        "x-api-version": "1.0",
      },
      timeout: DEFAULT_TIMEOUT_MS,
      validateStatus: () => true,
    });

    if (response.status >= 200 && response.status < 300) {
      const ackAt = new Date();

      return {
        attempted: true,
        acknowledged: true,
        ackAt,
        errorMessage: null,
        payload: {
          ok: true,
          url,
          urlType: GATEPASS_UPDATE_ERP_URL_TYPE,
          requestBody,
          responseStatus: response.status,
          responseData: toJsonSafeValue(response.data),
        },
      };
    }

    const detail = `ERP update gatepass request failed with status ${response.status}`;

    return {
      attempted: true,
      acknowledged: false,
      ackAt: null,
      errorMessage: detail,
      payload: {
        ok: false,
        detail,
        url,
        urlType: GATEPASS_UPDATE_ERP_URL_TYPE,
        requestBody,
        responseStatus: response.status,
        responseData: toJsonSafeValue(response.data),
      },
    };
  } catch (error: unknown) {
    const detail =
      error instanceof Error
        ? error.message
        : "Unknown error while calling ERP update gatepass API";

    return {
      attempted: true,
      acknowledged: false,
      ackAt: null,
      errorMessage: detail,
      payload: {
        ok: false,
        detail,
        urlType: GATEPASS_UPDATE_ERP_URL_TYPE,
        requestBody,
        error: axios.isAxiosError(error)
          ? {
              code: error.code ?? null,
              status: error.response?.status ?? null,
              data: toJsonSafeValue(error.response?.data),
            }
          : toJsonSafeValue(error),
      },
    };
  }
}
