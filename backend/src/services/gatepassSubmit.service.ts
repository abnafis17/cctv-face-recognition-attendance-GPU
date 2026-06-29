import axios from "axios";
import { getCompanyErpSettings, resolveConfiguredErpUrl } from "./erpSettings.service";

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
  gatePassId?: string | null;
};

type ErpGatepassPayloadRow = {
  empId: string;
  passTitle?: string;
  passTitleId?: string;
  destination: string;
  timeStart: string;
  date: string;
  timeEnd: string;
  remarks: string;
  passType: string;
};

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

function addHours(date: Date, hours: number): Date {
  const next = new Date(date.getTime());
  next.setTime(next.getTime() + hours * 60 * 60 * 1000);
  return next;
}

function buildRequestBody(
  input: GatepassSubmitSyncInput,
): ErpGatepassPayloadRow[] {
  const isShortLeave =
    input.passTitleId !== "Long Leave" &&
    input.passTitle !== "Long Leave";
  const timeStart = toDhakaTimeHHMMSS(input.outTime);
  const date = toDhakaDateDDMMYYYY(input.outTime);

  if (isShortLeave) {
    const end = addHours(input.outTime, 2);
    const timeEnd = toDhakaTimeHHMMSS(end);
    return [
      {
        empId: String(input.empId ?? "").trim(),
        passTitle: String(input.passTitle ?? "").trim(),
        passTitleId: String(input.passTitleId ?? "").trim(),
        destination: String(input.destination ?? "").trim(),
        timeStart,
        date,
        timeEnd,
        remarks: "okay",
        passType: "short leave",
      },
    ];
  } else {
    const end = addHours(input.outTime, 1);
    const timeEnd = toDhakaTimeHHMMSS(end);
    return [
      {
        empId: String(input.empId ?? "").trim(),
        destination: String(input.destination ?? "").trim(),
        timeStart,
        date,
        timeEnd,
        remarks: "ok",
        passType: "Long Leave",
      },
    ];
  }
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

    console.log(`[ERP GATEPASS SYNC] Sending request to ${url} with body:`, JSON.stringify(requestBody, null, 2));
    const response = await axios.post(url, requestBody, {
      headers: {
        Accept: "*/*",
        "Content-Type": "application/json; x-api-version=1.0",
        "x-api-version": "1.0",
      },
      timeout: DEFAULT_TIMEOUT_MS,
      validateStatus: () => true,
    });
    console.log(`[ERP GATEPASS SYNC] Received response: Status ${response.status}`, JSON.stringify(response.data, null, 2));

    if (response.status >= 200 && response.status < 300) {
      const ackAt = new Date();
      let gatePassId: string | null = null;
      const respData = response.data;
      if (respData && Array.isArray(respData.data)) {
        const matching = respData.data.find(
          (item: any) => String(item.empId) === String(input.empId)
        );
        if (matching && matching.gatePassId) {
          gatePassId = String(matching.gatePassId);
        } else if (respData.data[0] && respData.data[0].gatePassId) {
          gatePassId = String(respData.data[0].gatePassId);
        }
      } else if (respData && respData.gatePassId) {
        gatePassId = String(respData.gatePassId);
      }

      return {
        attempted: true,
        acknowledged: true,
        ackAt,
        errorMessage: null,
        gatePassId,
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
    console.error(`[ERP GATEPASS SYNC] Error occurred:`, error);
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
