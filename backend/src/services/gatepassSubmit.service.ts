import axios from "axios";
import { getCompanyErpSettings } from "./erpSettings.service";

const GATEPASS_SUBMIT_ERP_URL_TYPE = "addgatepass";
const DEFAULT_TIMEOUT_MS = 10_000;

export type GatepassSubmitSyncInput = {
  empId?: string | null;
  passTitle: string;
  passTitleId: string;
  destination?: string | null;
  outTime: Date;
  remarks: string;
};

export type GatepassSubmitSyncResult = {
  attempted: boolean;
  acknowledged: boolean;
  ackAt: Date | null;
  payload: Record<string, unknown>;
  errorMessage: string | null;
};

type ErpGatepassPayloadRow = {
  empId: string;
  passTitle: string;
  passTitleId: string;
  destination: string;
  timeStart: string;
  remarks: string;
  isApp: string;
};

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

function toJsonSafeValue(value: unknown): unknown {
  if (value === undefined) return null;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return String(value);
  }
}

function buildRequestBody(
  input: GatepassSubmitSyncInput,
): ErpGatepassPayloadRow[] {
  return [
    {
      empId: String(input.empId ?? "").trim(),
      passTitle: String(input.passTitle ?? "").trim(),
      passTitleId: String(input.passTitleId ?? "").trim(),
      destination: String(input.destination ?? "").trim(),
      timeStart: toDhakaTimeHHMMSS(input.outTime),
      remarks: String(input.remarks ?? "").trim(),
      isApp: "1",
    },
  ];
}

function buildFailureResult(
  requestBody: ErpGatepassPayloadRow[],
  detail: string,
  extras?: Record<string, unknown>,
): GatepassSubmitSyncResult {
  return {
    attempted: false,
    acknowledged: false,
    ackAt: null,
    errorMessage: detail,
    payload: {
      ok: false,
      detail,
      requestBody,
      urlType: GATEPASS_SUBMIT_ERP_URL_TYPE,
      ...(extras ?? {}),
    },
  };
}

export async function submitGatepassToErp(
  companyId: string,
  input: GatepassSubmitSyncInput,
): Promise<GatepassSubmitSyncResult> {
  const requestBody = buildRequestBody(input);

  try {
    const empId = String(input.empId ?? "").trim();
    if (!empId) {
      return buildFailureResult(
        requestBody,
        "Employee empId is missing. ERP gatepass submit skipped.",
      );
    }

    const settings = await getCompanyErpSettings(
      companyId,
      GATEPASS_SUBMIT_ERP_URL_TYPE,
    );
    const url = resolveConfiguredErpUrl(settings);

    if (!url) {
      return buildFailureResult(
        requestBody,
        'ERP add gatepass settings are incomplete. Configure urlType "addgatepass" with base URL, prefix, and endpoint.',
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
          urlType: GATEPASS_SUBMIT_ERP_URL_TYPE,
          requestBody,
          responseStatus: response.status,
          responseData: toJsonSafeValue(response.data),
        },
      };
    }

    const detail = `ERP add gatepass request failed with status ${response.status}`;

    return {
      attempted: true,
      acknowledged: false,
      ackAt: null,
      errorMessage: detail,
      payload: {
        ok: false,
        detail,
        url,
        urlType: GATEPASS_SUBMIT_ERP_URL_TYPE,
        requestBody,
        responseStatus: response.status,
        responseData: toJsonSafeValue(response.data),
      },
    };
  } catch (error: unknown) {
    const detail =
      error instanceof Error
        ? error.message
        : "Unknown error while calling ERP add gatepass API";

    return {
      attempted: true,
      acknowledged: false,
      ackAt: null,
      errorMessage: detail,
      payload: {
        ok: false,
        detail,
        urlType: GATEPASS_SUBMIT_ERP_URL_TYPE,
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
