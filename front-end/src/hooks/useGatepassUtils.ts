import type { Camera as CameraOption, Employee } from "@/types";
import type {
  EmployeeDirectoryRow,
  GatepassEmployee,
  GatepassRecord,
} from "@/types/gatepass-types";

export const DHAKA_TIMEZONE = "Asia/Dhaka";
export const GATEPASS_ACTIVE_CAMERA_STORAGE_KEY = "gatepass.active.cameraId";
export const GATEPASS_HISTORY_PAGE_LIMIT = 10;

export function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

export function normalizeTask(value: unknown): string {
  const normalized = String(value ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  if (normalized === "gatepass") return "gate_pass";
  return normalized;
}

export function toNullableTrimmed(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeEmployeeRow(input: Employee): EmployeeDirectoryRow {
  const row = input as EmployeeDirectoryRow;
  return {
    ...row,
    id: String(input.id ?? "").trim(),
    empId: toNullableTrimmed(input.empId),
    name: String(input.name ?? "").trim() || "Unknown Employee",
    unit: toNullableTrimmed(input.unit),
    section: toNullableTrimmed(input.section),
    department: toNullableTrimmed(input.department),
    line: toNullableTrimmed(input.line),
    designation: toNullableTrimmed(row.designation),
    shift: toNullableTrimmed(row.shift),
  };
}

export function mapEmployeeToGatepassEmployee(
  employee: EmployeeDirectoryRow,
  cameraName: string
): GatepassEmployee {
  const employeeCode =
    toNullableTrimmed(employee.empId) ?? toNullableTrimmed(employee.id) ?? "UNKNOWN";
  const section = toNullableTrimmed(employee.section) ?? "";
  const department = toNullableTrimmed(employee.department) ?? "Unassigned Department";
  const unit = toNullableTrimmed(employee.unit) ?? "Unassigned Unit";
  const shift = toNullableTrimmed(employee.shift) ?? "General Shift";

  return {
    id: employee.id,
    employeeCode,
    name: employee.name || "Unknown Employee",
    section,
    department,
    unit,
    shift,
    headcountNote: `Recognized from ${cameraName} live stream`,
  };
}

export function fallbackGatepassEmployee(
  employeeId: string,
  cameraName: string
): GatepassEmployee {
  const normalizedId = String(employeeId ?? "").trim() || "UNKNOWN";
  return {
    id: normalizedId,
    employeeCode: normalizedId,
    name: "Unknown Employee",
    section: "Unassigned Section",
    department: "Unassigned Department",
    unit: "Unassigned Unit",
    shift: "General Shift",
    headcountNote: `Recognized from ${cameraName} live stream`,
  };
}

export function extractGatepassTimestampParts(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  let parsed: Date;
  if (/^\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(normalized)) {
    parsed = new Date(normalized + "Z");
  } else {
    parsed = new Date(normalized);
  }

  if (Number.isNaN(parsed.getTime())) return null;

  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: DHAKA_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(parsed);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(getPart("year"));
    const month = Number(getPart("month"));
    const day = Number(getPart("day"));
    let hour = Number(getPart("hour"));
    const minute = Number(getPart("minute"));
    const second = Number(getPart("second"));
    if (hour === 24) hour = 0;
    return { year, month, day, hour, minute, second };
  } catch {
    const dhakaTime = new Date(parsed.getTime() + 6 * 60 * 60 * 1000);
    return {
      year: dhakaTime.getUTCFullYear(),
      month: dhakaTime.getUTCMonth() + 1,
      day: dhakaTime.getUTCDate(),
      hour: dhakaTime.getUTCHours(),
      minute: dhakaTime.getUTCMinutes(),
      second: dhakaTime.getUTCSeconds(),
    };
  }
}

export function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: DHAKA_TIMEZONE });
}

export function padTimestampPart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatGatepassDate(value: unknown) {
  const parts = extractGatepassTimestampParts(value);
  if (!parts) return "--";
  return `${padTimestampPart(parts.day)}/${padTimestampPart(parts.month)}/${parts.year}`;
}

export function formatGatepassTime(value: unknown) {
  const parts = extractGatepassTimestampParts(value);
  if (!parts) return "--";
  return `${padTimestampPart(parts.hour)}:${padTimestampPart(parts.minute)}:${padTimestampPart(parts.second)}`;
}

export function formatGatepassDateTime(value: unknown) {
  const date = formatGatepassDate(value);
  const time = formatGatepassTime(value);
  if (date === "--" || time === "--") return "--";
  return `${date} ${time}`;
}

export function hasOpenOutRecord(record: GatepassRecord | null | undefined): boolean {
  if (!record) return false;
  return record.status === "out" || !record.inTime;
}
