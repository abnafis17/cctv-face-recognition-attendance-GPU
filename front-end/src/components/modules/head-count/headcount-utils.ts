import type {
  HeadcountCameraOption,
  HeadcountCounts,
  HeadcountCrosscheckRow,
  HeadcountDynamicRun,
  HeadcountOtRow,
  HeadcountRunResult,
  HeadcountStatus,
} from "@/types/headcount-types";

export const DEFAULT_LAPTOP_CAMERA_ID = "cmkdpsql0000112nsd5gcesq4";

export const HEADCOUNT_RUN_WINDOW_OPTIONS = [
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
  { value: 30, label: "30 min" },
  { value: 45, label: "45 min" },
  { value: 60, label: "1 hour" },
] as const;

export function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function safeTimeOnly(ts?: string | number | Date | null) {
  try {
    if (!ts) return "-";
    return new Date(ts).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour12: false,
    });
  } catch {
    return "-";
  }
}

export function safeTimeRange(start?: string | null, end?: string | null) {
  const from = safeTimeOnly(start);
  const to = safeTimeOnly(end);
  if (from === "-" && to === "-") return "-";
  return `${from} - ${to}`;
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

export function normalizeHeadcountStatus(value: unknown): HeadcountStatus {
  const raw = String(value ?? "ABSENT")
    .trim()
    .toUpperCase();
  if (raw === "MATCH") return "MATCH";
  if (raw === "UNMATCH") return "UNMATCH";
  return "ABSENT";
}

export function normalizeHeadcountCamera(value: any): HeadcountCameraOption {
  return {
    id: String(value?.id),
    name: String(value?.name ?? "Camera"),
    rtspUrl: value?.rtspUrl ?? value?.rtsp_url ?? null,
    rtspUrlEnc: value?.rtspUrlEnc ?? value?.rtsp_url_enc ?? null,
    relayAgentId: value?.relayAgentId ?? value?.relay_agent_id ?? null,
    isActive: Boolean(value?.isActive),
  };
}

export function normalizeHeadcountRunResult(
  value: any,
  index: number,
): HeadcountRunResult {
  const runIndexValue = Number(value?.runIndex);
  const runIndex =
    Number.isFinite(runIndexValue) && runIndexValue > 0
      ? Math.floor(runIndexValue)
      : index + 1;
  const runStartTime =
    value?.runStartTime != null ? String(value.runStartTime) : null;
  const runEndTime =
    value?.runEndTime != null ? String(value.runEndTime) : null;

  return {
    runKey: String(
      value?.runKey ?? `run-${runIndex}-${runStartTime ?? runEndTime ?? index}`,
    ),
    runIndex,
    runStartTime,
    runEndTime,
    headcountTime:
      value?.headcountTime != null ? String(value.headcountTime) : null,
    headcountCameraId:
      value?.headcountCameraId != null ? String(value.headcountCameraId) : null,
    headcountCameraName:
      value?.headcountCameraName != null
        ? String(value.headcountCameraName)
        : null,
    headcountConfidence:
      typeof value?.headcountConfidence === "number"
        ? value.headcountConfidence
        : null,
    status: normalizeHeadcountStatus(value?.status),
  };
}

export function normalizeHeadcountCrosscheckRow(
  value: any,
  dateStr: string,
): HeadcountCrosscheckRow {
  return {
    id: String(value?.id ?? `${value?.employeeId}-${dateStr}`),
    employeeId: String(value?.employeeId ?? ""),
    name: String(value?.name ?? ""),
    unit: value?.unit ?? value?.employeeUnit ?? null,
    department:
      value?.department ?? value?.employeeDepartment ?? value?.dept ?? null,
    section: value?.section ?? value?.employeeSection ?? null,
    line: value?.line ?? value?.employeeLine ?? null,
    status: normalizeHeadcountStatus(value?.status),
    headcountRuns: Array.isArray(value?.headcountRuns)
      ? value.headcountRuns.map(normalizeHeadcountRunResult)
      : [],
  };
}

export function normalizeHeadcountOtRow(
  value: any,
  dateStr: string,
): HeadcountOtRow {
  return {
    id: String(value?.id ?? `${value?.employeeId}-${dateStr}`),
    employeeId: String(value?.employeeId ?? ""),
    name: String(value?.name ?? ""),
    unit: value?.unit ?? value?.employeeUnit ?? null,
    department: value?.department ?? value?.employeeDepartment ?? null,
    section: value?.section ?? value?.employeeSection ?? null,
    line: value?.line ?? value?.employeeLine ?? null,
    cameraName: value?.headcountCameraName ?? value?.cameraName ?? null,
    headcountTime:
      value?.headcountLastEntryTime ??
      value?.headcountTime ??
      value?.timestamp ??
      value?.lastSeen ??
      null,
  };
}

function parseEpoch(value?: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  const epoch = Date.parse(value);
  return Number.isNaN(epoch) ? Number.POSITIVE_INFINITY : epoch;
}

export function getDynamicHeadcountRuns(
  rows: HeadcountCrosscheckRow[],
): HeadcountDynamicRun[] {
  const byKey = new Map<string, HeadcountDynamicRun>();

  for (const row of rows) {
    for (const run of row.headcountRuns || []) {
      const current = byKey.get(run.runKey);
      if (!current) {
        byKey.set(run.runKey, {
          runKey: run.runKey,
          runIndex: run.runIndex,
          runStartTime: run.runStartTime ?? null,
          runEndTime: run.runEndTime ?? null,
        });
        continue;
      }

      if (run.runIndex < current.runIndex) {
        current.runIndex = run.runIndex;
      }

      const nextStart = run.runStartTime ?? null;
      if (
        nextStart &&
        (!current.runStartTime ||
          parseEpoch(nextStart) < parseEpoch(current.runStartTime))
      ) {
        current.runStartTime = nextStart;
      }

      const nextEnd = run.runEndTime ?? null;
      if (
        nextEnd &&
        (!current.runEndTime ||
          parseEpoch(nextEnd) > parseEpoch(current.runEndTime))
      ) {
        current.runEndTime = nextEnd;
      }
    }
  }

  return Array.from(byKey.values()).sort((a, b) => {
    if (a.runIndex !== b.runIndex) return a.runIndex - b.runIndex;
    const startDiff = parseEpoch(a.runStartTime) - parseEpoch(b.runStartTime);
    if (startDiff !== 0) return startDiff;
    return a.runKey.localeCompare(b.runKey);
  });
}

export function getHeadcountCounts(
  rows: HeadcountCrosscheckRow[],
): HeadcountCounts {
  let match = 0;
  let unmatch = 0;
  let absent = 0;

  for (const row of rows) {
    if (row.status === "MATCH") match += 1;
    else if (row.status === "UNMATCH") unmatch += 1;
    else absent += 1;
  }

  return {
    match,
    unmatch,
    absent,
    total: rows.length,
  };
}
