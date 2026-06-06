"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";

import axiosInstance, { AI_HOST, API } from "@/config/axiosInstance";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import type { Camera as CameraOption, Employee } from "@/types";

import { recognizedColumns } from "@/components/modules/gatepass/recognizedColumns";
import { getHistoryColumns } from "@/components/modules/gatepass/historyColumns";
import type {
  AttendanceEventPayload,
  EmployeeDirectoryRow,
  FormErrors,
  GatepassApiRecord,
  GatepassEmployee,
  GatepassLeaveTypeOption,
  GatepassRecord,
  RecognizedGatepassRow,
  RecognizedPerson,
} from "@/types/gatepass-types";

const DHAKA_TIMEZONE = "Asia/Dhaka";
const GATEPASS_ACTIVE_CAMERA_STORAGE_KEY = "gatepass.active.cameraId";
export const GATEPASS_HISTORY_PAGE_LIMIT = 10;

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

function normalizeTask(value: unknown): string {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

  if (normalized === "gatepass") return "gate_pass";
  return normalized;
}

function toNullableTrimmed(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeEmployeeRow(input: Employee): EmployeeDirectoryRow {
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

function mapEmployeeToGatepassEmployee(
  employee: EmployeeDirectoryRow,
  cameraName: string,
): GatepassEmployee {
  const employeeCode =
    toNullableTrimmed(employee.empId) ??
    toNullableTrimmed(employee.id) ??
    "UNKNOWN";

  const section = toNullableTrimmed(employee.section) ?? "";

  const department =
    toNullableTrimmed(employee.department) ?? "Unassigned Department";

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

function fallbackGatepassEmployee(
  employeeId: string,
  cameraName: string,
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

function extractGatepassTimestampParts(value: unknown) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return null;

  const directMatch = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2}):(\d{2}))/,
  );

  if (directMatch) {
    return {
      year: Number(directMatch[1]),
      month: Number(directMatch[2]),
      day: Number(directMatch[3]),
      hour: Number(directMatch[4]),
      minute: Number(directMatch[5]),
      second: Number(directMatch[6]),
    };
  }

  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) return null;

  return {
    year: parsed.getUTCFullYear(),
    month: parsed.getUTCMonth() + 1,
    day: parsed.getUTCDate(),
    hour: parsed.getUTCHours(),
    minute: parsed.getUTCMinutes(),
    second: parsed.getUTCSeconds(),
  };
}

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: DHAKA_TIMEZONE });
}

function toRecordNote(purpose: string, destination?: string | null) {
  const trimmedPurpose = String(purpose ?? "").trim();
  const trimmedDestination = String(destination ?? "").trim();

  if (trimmedPurpose && trimmedDestination) {
    return `${trimmedPurpose} (Destination: ${trimmedDestination})`;
  }
  if (trimmedPurpose) return trimmedPurpose;
  if (trimmedDestination) return `Destination: ${trimmedDestination}`;
  return "No purpose provided";
}

function padTimestampPart(value: number) {
  return String(value).padStart(2, "0");
}

function formatGatepassDate(value: unknown) {
  const parts = extractGatepassTimestampParts(value);
  if (!parts) return "--";
  return `${padTimestampPart(parts.day)}/${padTimestampPart(parts.month)}/${parts.year}`;
}

function formatGatepassTime(value: unknown) {
  const parts = extractGatepassTimestampParts(value);
  if (!parts) return "--";
  return `${padTimestampPart(parts.hour)}:${padTimestampPart(parts.minute)}:${padTimestampPart(parts.second)}`;
}

function formatGatepassDateTime(value: unknown) {
  const date = formatGatepassDate(value);
  const time = formatGatepassTime(value);
  if (date === "--" || time === "--") return "--";
  return `${date} ${time}`;
}

function normalizeGatepassLeaveTypeOption(
  input: GatepassLeaveTypeOption,
): GatepassLeaveTypeOption | null {
  const id = String(input?.id ?? "").trim();
  const label = String(input?.label ?? "").trim();
  const companyId = toNullableTrimmed(input?.companyId);

  if (!id || !label) return null;

  return {
    id,
    label,
    companyId,
  };
}

function mapGatepassApiRecordToViewRecord(
  row: GatepassApiRecord,
): GatepassRecord {
  const employeeCode = String(row.employeeId ?? "").trim() || "UNKNOWN";
  const leaveTypeLabel =
    String(row.leaveType ?? "").trim() || "Unknown Leave Type";

  return {
    id: row.id,
    employee: {
      id: employeeCode,
      employeeCode,
      name: String(row.employeeName ?? "").trim() || "Unknown Employee",
      section: String(row.section ?? "").trim() || "Unassigned Section",
      department:
        String(row.department ?? "").trim() || "Unassigned Department",
      unit: String(row.unit ?? "").trim() || "Unassigned Unit",
      shift: "General Shift",
      headcountNote: "Loaded from gatepass request table",
    },
    type: leaveTypeLabel,
    typeId: toNullableTrimmed(row.leaveTypeId),
    outDate: formatGatepassDate(row.outTime),
    outTime: formatGatepassTime(row.outTime),
    inTime: row.inTime ? formatGatepassTime(row.inTime) : "--",
    status: row.status === "returned" ? "returned" : "out",
    note: toRecordNote(row.purpose, row.destination),
    requestedAt: formatGatepassDateTime(row.requestedAt ?? row.outTime),
  };
}

function readStoredGatepassCameraId() {
  if (typeof window === "undefined") return "";
  return String(
    window.sessionStorage.getItem(GATEPASS_ACTIVE_CAMERA_STORAGE_KEY) ?? "",
  ).trim();
}

function writeStoredGatepassCameraId(cameraId: string) {
  if (typeof window === "undefined") return;
  const normalized = String(cameraId ?? "").trim();

  if (!normalized) {
    window.sessionStorage.removeItem(GATEPASS_ACTIVE_CAMERA_STORAGE_KEY);
    return;
  }

  window.sessionStorage.setItem(GATEPASS_ACTIVE_CAMERA_STORAGE_KEY, normalized);
}

function hasOpenOutRecord(record: GatepassRecord | null | undefined) {
  if (!record) return false;
  return record.status === "out" && String(record.inTime ?? "").trim() === "--";
}

function getRecognizedRowKey(employee: GatepassEmployee, fallbackKey = "") {
  return (
    String(employee.employeeCode ?? "").trim() ||
    String(employee.id ?? "").trim() ||
    fallbackKey
  );
}

export function useGatepassPage() {
  const [companyId, setCompanyId] = useState("");
  const [gatepassCameras, setGatepassCameras] = useState<CameraOption[]>([]);
  const [gatepassLeaveTypes, setGatepassLeaveTypes] = useState<
    GatepassLeaveTypeOption[]
  >([]);
  const [gatepassLeaveTypesLoading, setGatepassLeaveTypesLoading] =
    useState(false);
  const [gatepassLeaveTypesError, setGatepassLeaveTypesError] = useState("");
  const [selectedGatepassCameraId, setSelectedGatepassCameraId] = useState("");
  const [gatepassCamerasLoading, setGatepassCamerasLoading] = useState(false);
  const [gatepassCameraError, setGatepassCameraError] = useState("");
  const [employeeDirectory, setEmployeeDirectory] = useState<
    EmployeeDirectoryRow[]
  >([]);
  const [directoryError, setDirectoryError] = useState("");
  const [requestRecords, setRequestRecords] = useState<GatepassRecord[]>([]);
  const [, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState("");
  const [historyRecords, setHistoryRecords] = useState<GatepassRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [debouncedHistorySearch, setDebouncedHistorySearch] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState(() =>
    dhakaTodayYYYYMMDD(),
  );
  const [historyToDate, setHistoryToDate] = useState(() =>
    dhakaTodayYYYYMMDD(),
  );
  const [historyLeaveTypeId, setHistoryLeaveTypeId] = useState("");
  const [recognizedPeople, setRecognizedPeople] = useState<RecognizedPerson[]>(
    [],
  );
  const [leaveTypeId, setLeaveTypeId] = useState("");
  const [destination, setDestination] = useState("");
  const [purpose, setPurpose] = useState("");
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [recognitionActive, setRecognitionActive] = useState(false);
  const [recognitionStartSeq, setRecognitionStartSeq] = useState(0);
  const [activeCameraId, setActiveCameraId] = useState("");
  const [cameraAction, setCameraAction] = useState<"start" | "stop" | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [panelError, setPanelError] = useState("");
  const [historyPage, setHistoryPage] = useState(1);

  const activeCameraIdRef = useRef("");
  const lastRecognitionSignatureRef = useRef("");
  const returnSyncSignatureRef = useRef("");

  useEffect(() => {
    activeCameraIdRef.current = activeCameraId;
  }, [activeCameraId]);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedHistorySearch(historySearch.trim());
    }, 350);

    return () => {
      window.clearTimeout(timer);
    };
  }, [historySearch]);

  const selectedGatepassCamera = useMemo(
    () =>
      gatepassCameras.find(
        (camera) => camera.id === selectedGatepassCameraId,
      ) ?? null,
    [gatepassCameras, selectedGatepassCameraId],
  );

  const previewCamera = useMemo(() => {
    if (!selectedGatepassCamera) return null;

    const isLocallyActive =
      recognitionActive && activeCameraId === selectedGatepassCamera.id;

    return {
      ...selectedGatepassCamera,
      isActive: isLocallyActive,
      attendance: isLocallyActive,
    };
  }, [activeCameraId, recognitionActive, selectedGatepassCamera]);

  const employeeDirectoryByKey = useMemo(() => {
    const map = new Map<string, EmployeeDirectoryRow>();

    for (const employee of employeeDirectory) {
      const dbId = String(employee.id ?? "").trim();
      const empId = String(employee.empId ?? "").trim();

      if (dbId) map.set(dbId, employee);
      if (empId) map.set(empId, employee);
    }

    return map;
  }, [employeeDirectory]);

  const gatepassLeaveTypeById = useMemo(() => {
    const map = new Map<string, GatepassLeaveTypeOption>();

    for (const leaveType of gatepassLeaveTypes) {
      const id = String(leaveType.id ?? "").trim();
      if (!id) continue;
      map.set(id, leaveType);
    }

    return map;
  }, [gatepassLeaveTypes]);

  const latestRecordByEmployeeKey = useMemo(() => {
    const map = new Map<string, GatepassRecord>();

    for (const record of requestRecords) {
      const employeeCode = String(record.employee.employeeCode ?? "").trim();
      const employeeId = String(record.employee.id ?? "").trim();

      if (employeeCode) map.set(employeeCode, record);
      if (employeeId) map.set(employeeId, record);
    }

    return map;
  }, [requestRecords]);

  const recognizedRows = useMemo<RecognizedGatepassRow[]>(
    () =>
      recognizedPeople.map((person) => ({
        ...person,
        latestRecord:
          latestRecordByEmployeeKey.get(person.employee.employeeCode) ??
          latestRecordByEmployeeKey.get(person.employee.id) ??
          null,
      })),
    [latestRecordByEmployeeKey, recognizedPeople],
  );

  const historyRows = useMemo(
    () => [...historyRecords].reverse(),
    [historyRecords],
  );

  const historySkip = useMemo(
    () => (historyPage - 1) * GATEPASS_HISTORY_PAGE_LIMIT,
    [historyPage],
  );

  const paginatedHistoryRows = useMemo(
    () =>
      historyRows.slice(historySkip, historySkip + GATEPASS_HISTORY_PAGE_LIMIT),
    [historyRows, historySkip],
  );

  const historyPaginationResetKey = useMemo(() => {
    return `${historyFromDate}|${historyToDate}|${historyLeaveTypeId}|${debouncedHistorySearch}|${historyRows.length}`;
  }, [
    debouncedHistorySearch,
    historyFromDate,
    historyLeaveTypeId,
    historyRows.length,
    historyToDate,
  ]);

  useEffect(() => {
    setHistoryPage(1);
  }, [
    debouncedHistorySearch,
    historyFromDate,
    historyLeaveTypeId,
    historyToDate,
  ]);

  const historyColumns = useMemo(
    () => getHistoryColumns(historySkip),
    [historySkip],
  );

  const streamQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", "attendance");
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId]);

  const recognitionStreamUrl = useMemo(() => {
    if (!selectedGatepassCamera) return "";
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      selectedGatepassCamera.id,
    )}/${encodeURIComponent(selectedGatepassCamera.name)}${streamQuery}`;
  }, [selectedGatepassCamera, streamQuery]);

  const isSelectedCameraRunning =
    selectedGatepassCamera !== null &&
    recognitionActive &&
    activeCameraId === selectedGatepassCamera.id;

  const patchGatepassCameraState = useCallback(
    (cameraId: string, next: { isActive?: boolean; attendance?: boolean }) => {
      const normalized = String(cameraId ?? "").trim();
      if (!normalized) return;

      setGatepassCameras((current) =>
        current.map((camera) =>
          camera.id === normalized
            ? {
                ...camera,
                ...(next.isActive !== undefined
                  ? { isActive: next.isActive }
                  : {}),
                ...(next.attendance !== undefined
                  ? { attendance: next.attendance }
                  : {}),
              }
            : camera,
        ),
      );
    },
    [],
  );

  const fetchGatepassCameras = useCallback(async (silent = false) => {
    try {
      if (!silent) setGatepassCamerasLoading(true);
      setGatepassCameraError("");

      const response = await axiosInstance.get<CameraOption[]>(API.CAMERAS, {
        params: { task: "gate_pass" },
      });

      const list = Array.isArray(response.data) ? response.data : [];
      const filtered = list
        .filter((camera) => normalizeTask(camera.task) === "gate_pass")
        .sort((a, b) =>
          String(a.name ?? "").localeCompare(String(b.name ?? ""), undefined, {
            numeric: true,
            sensitivity: "base",
          }),
        );

      setGatepassCameras(filtered);
    } catch (error: unknown) {
      const message = normalizeApiError(
        error,
        "Failed to load gate pass cameras",
      );
      setGatepassCameraError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setGatepassCamerasLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGatepassCameras();
  }, [fetchGatepassCameras]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchGatepassCameras(true);
    }, 10000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchGatepassCameras]);

  useEffect(() => {
    setSelectedGatepassCameraId((current) => {
      if (!gatepassCameras.length) return "";
      if (current && gatepassCameras.some((camera) => camera.id === current)) {
        return current;
      }
      return gatepassCameras[0].id;
    });
  }, [gatepassCameras]);

  const fetchEmployeeDirectory = useCallback(async (silent = false) => {
    try {
      if (!silent) setDirectoryError("");
      const response = await axiosInstance.get<Employee[]>(API.EMPLOYEE_LIST);
      const rows = Array.isArray(response.data)
        ? response.data.map(normalizeEmployeeRow)
        : [];
      setEmployeeDirectory(rows);
    } catch (error: unknown) {
      const message = normalizeApiError(
        error,
        "Failed to load employee directory",
      );
      setDirectoryError(message);
      if (!silent) toast.error(message);
    }
  }, []);

  useEffect(() => {
    void fetchEmployeeDirectory();
  }, [fetchEmployeeDirectory]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchEmployeeDirectory(true);
    }, 30000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchEmployeeDirectory]);

  const fetchGatepassLeaveTypes = useCallback(async (silent = false) => {
    try {
      if (!silent) setGatepassLeaveTypesLoading(true);
      setGatepassLeaveTypesError("");

      const response = await axiosInstance.get<GatepassLeaveTypeOption[]>(
        API.GATEPASS_TYPES,
      );

      const rows = Array.isArray(response.data)
        ? response.data
            .map(normalizeGatepassLeaveTypeOption)
            .filter(
              (row): row is GatepassLeaveTypeOption => Boolean(row),
            )
        : [];

      setGatepassLeaveTypes(rows);
    } catch (error: unknown) {
      const message = normalizeApiError(
        error,
        "Failed to load gatepass leave types",
      );
      setGatepassLeaveTypes([]);
      setGatepassLeaveTypesError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setGatepassLeaveTypesLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchGatepassLeaveTypes();
  }, [fetchGatepassLeaveTypes]);

  useEffect(() => {
    setLeaveTypeId((current) => {
      if (!current) return "";
      return gatepassLeaveTypeById.has(current) ? current : "";
    });
  }, [gatepassLeaveTypeById]);

  useEffect(() => {
    setHistoryLeaveTypeId((current) => {
      if (!current) return "";
      return gatepassLeaveTypeById.has(current) ? current : "";
    });
  }, [gatepassLeaveTypeById]);

  const fetchGatepassRecords = useCallback(async (silent = false) => {
    try {
      if (!silent) setRecordsLoading(true);
      setRecordsError("");

      const response = await axiosInstance.get<GatepassApiRecord[]>(
        API.GATEPASS_TABLE,
        {
          params: {
            date: dhakaTodayYYYYMMDD(),
            limit: 500,
          },
        },
      );

      const rows = Array.isArray(response.data) ? response.data : [];
      setRequestRecords(rows.map(mapGatepassApiRecordToViewRecord));
    } catch (error: unknown) {
      const message = normalizeApiError(
        error,
        "Failed to load gatepass records",
      );
      setRecordsError(message);
      if (!silent) toast.error(message);
    } finally {
      if (!silent) setRecordsLoading(false);
    }
  }, []);

  const fetchHistoryRecords = useCallback(
    async (silent = false) => {
      if (historyFromDate > historyToDate) {
        setHistoryError("From date must be earlier than or equal to To date");
        setHistoryRecords([]);
        return;
      }

      try {
        if (!silent) setHistoryLoading(true);
        setHistoryError("");

        const response = await axiosInstance.get<GatepassApiRecord[]>(
          API.GATEPASS_TABLE,
          {
            params: {
              fromDate: historyFromDate,
              toDate: historyToDate,
              leaveTypeId: historyLeaveTypeId || undefined,
              q: debouncedHistorySearch || undefined,
              limit: 500,
            },
          },
        );

        const rows = Array.isArray(response.data) ? response.data : [];
        setHistoryRecords(rows.map(mapGatepassApiRecordToViewRecord));
      } catch (error: unknown) {
        const message = normalizeApiError(
          error,
          "Failed to load gatepass history",
        );
        setHistoryError(message);
        if (!silent) toast.error(message);
      } finally {
        if (!silent) setHistoryLoading(false);
      }
    },
    [debouncedHistorySearch, historyFromDate, historyLeaveTypeId, historyToDate],
  );

  useEffect(() => {
    void fetchGatepassRecords();
  }, [fetchGatepassRecords]);

  useEffect(() => {
    void fetchHistoryRecords();
  }, [fetchHistoryRecords]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchGatepassRecords(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchGatepassRecords]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchHistoryRecords(true);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [fetchHistoryRecords]);

  const stopRecognitionCameraApi = useCallback(async (cameraId: string) => {
    const normalized = String(cameraId ?? "").trim();
    if (!normalized) return;

    try {
      await axiosInstance.post("/attendance-control/disable", {
        cameraId: normalized,
      });
    } catch {
      // best effort
    }

    try {
      await axiosInstance.post(`/cameras/stop/${normalized}`);
    } catch {
      // best effort
    }
  }, []);

  const stopCurrentCamera = useCallback(
    async (cameraId?: string, refresh = true) => {
      const targetId =
        String(cameraId ?? "").trim() ||
        String(activeCameraIdRef.current ?? "").trim() ||
        String(selectedGatepassCamera?.id ?? "").trim() ||
        readStoredGatepassCameraId();

      if (!targetId) return;

      await stopRecognitionCameraApi(targetId);

      if (activeCameraIdRef.current === targetId) {
        activeCameraIdRef.current = "";
      }

      patchGatepassCameraState(targetId, {
        isActive: false,
        attendance: false,
      });
      setActiveCameraId((current) => (current === targetId ? "" : current));
      setRecognitionActive(false);
      setRecognitionStartSeq(0);

      if (readStoredGatepassCameraId() === targetId) {
        writeStoredGatepassCameraId("");
      }

      if (refresh) {
        await fetchGatepassCameras(true);
      }
    },
    [
      fetchGatepassCameras,
      patchGatepassCameraState,
      selectedGatepassCamera,
      stopRecognitionCameraApi,
    ],
  );

  useEffect(() => {
    const storedCameraId = readStoredGatepassCameraId();
    if (!storedCameraId) return;

    let cancelled = false;

    void (async () => {
      await stopRecognitionCameraApi(storedCameraId);
      writeStoredGatepassCameraId("");

      if (!cancelled) {
        patchGatepassCameraState(storedCameraId, {
          isActive: false,
          attendance: false,
        });
        await fetchGatepassCameras(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    fetchGatepassCameras,
    patchGatepassCameraState,
    stopRecognitionCameraApi,
  ]);

  useEffect(() => {
    return () => {
      const cameraId =
        String(activeCameraIdRef.current ?? "").trim() ||
        readStoredGatepassCameraId();

      if (!cameraId) return;

      void stopRecognitionCameraApi(cameraId);
      writeStoredGatepassCameraId("");
    };
  }, [stopRecognitionCameraApi]);

  const fetchAttendanceLatestSeq = useCallback(async () => {
    const response = await axiosInstance.get(`${API.ATTENDANCE_LIST}/events`, {
      params: { afterSeq: 0, limit: 1, waitMs: 0 },
    });

    return Number(response?.data?.latest_seq ?? 0) || 0;
  }, []);

  const matchesSelectedCamera = useCallback(
    (cameraKey: unknown) => {
      if (!selectedGatepassCamera) return false;

      const eventCameraKey = String(cameraKey ?? "").trim();
      if (!eventCameraKey) return false;

      const selectedCameraDbId = String(selectedGatepassCamera.id ?? "").trim();
      const selectedCameraPublicId = String(
        selectedGatepassCamera.camId ?? "",
      ).trim();
      const selectedCameraName = String(selectedGatepassCamera.name ?? "")
        .trim()
        .toLowerCase();

      if (eventCameraKey === selectedCameraDbId) return true;
      if (selectedCameraPublicId && eventCameraKey === selectedCameraPublicId) {
        return true;
      }
      if (
        selectedCameraName &&
        eventCameraKey.toLowerCase() === selectedCameraName
      ) {
        return true;
      }

      return false;
    },
    [selectedGatepassCamera],
  );

  const queueRecognizedPerson = useCallback(
    (employee: GatepassEmployee, recognizedAt: Date, fallbackKey = "") => {
      const rowKey = getRecognizedRowKey(employee, fallbackKey);

      setRecognizedPeople((current) => {
        const next = current.filter((row) => row.key !== rowKey);
        next.unshift({
          key: rowKey,
          employee,
          recognizedAt,
        });
        return next.slice(0, 100);
      });

      return rowKey;
    },
    [],
  );

  const autoMarkGatepassReturn = useCallback(
    async ({
      employee,
      recognizedAt,
      signature,
    }: {
      employee: GatepassEmployee;
      recognizedAt: Date;
      signature: string;
    }) => {
      if (!selectedGatepassCamera) return;
      if (returnSyncSignatureRef.current === signature) return;

      returnSyncSignatureRef.current = signature;
      const employeeId = employee.id || employee.employeeCode;
      const employeeName = employee.name || employee.employeeCode;
      const rowKey = getRecognizedRowKey(employee, signature);

      try {
        const response = await axiosInstance.post(
          `${API.GATEPASS_TABLE}/mark-return`,
          {
            employeeId,
            cameraId: selectedGatepassCamera.id,
            recognizedAt: recognizedAt.toISOString(),
          },
        );

        if (response?.data?.updated) {
          setRecognizedPeople((current) =>
            current.filter((row) => row.key !== rowKey),
          );

          await Promise.all([
            fetchGatepassRecords(true),
            fetchHistoryRecords(true),
          ]);

          toast.success(`Gatepass return submitted for ${employeeName}`);
          return;
        }

        const reason = String(response?.data?.reason ?? "").trim();
        if (reason === "no_open_gatepass") {
          await Promise.all([
            fetchGatepassRecords(true),
            fetchHistoryRecords(true),
          ]);
          queueRecognizedPerson(employee, recognizedAt, signature);
        }
      } catch (error: unknown) {
        const message = normalizeApiError(
          error,
          `Failed to submit return for ${employeeName}`,
        );
        setPanelError(message);
        toast.error(message);
      }
    },
    [
      fetchGatepassRecords,
      fetchHistoryRecords,
      queueRecognizedPerson,
      selectedGatepassCamera,
    ],
  );

  const applyRecognitionCandidate = useCallback(
    (candidate: AttendanceEventPayload) => {
      if (!selectedGatepassCamera || !recognitionActive) return false;

      const candidateSeq = Number(candidate.seq ?? 0) || 0;
      if (candidateSeq <= recognitionStartSeq) return false;

      const eventEmployeeId = String(candidate.employeeId ?? "").trim();
      if (!eventEmployeeId) return false;

      const candidateAt = "at" in candidate ? candidate.at : undefined;
      const eventTimeRaw = String(
        candidate.timestamp ?? candidateAt ?? "",
      ).trim();
      if (!eventTimeRaw) return false;

      const eventTime = new Date(eventTimeRaw);
      if (Number.isNaN(eventTime.getTime())) return false;

      const candidateAttendanceId = String(candidate.attendanceId ?? "").trim();
      const signature = [
        String(selectedGatepassCamera.id ?? "").trim(),
        eventEmployeeId,
        candidateSeq > 0 ? `seq:${candidateSeq}` : "",
        candidateAttendanceId,
        eventTime.toISOString(),
      ].join(":");

      if (lastRecognitionSignatureRef.current === signature) return false;
      lastRecognitionSignatureRef.current = signature;

      const directoryEmployee = employeeDirectoryByKey.get(eventEmployeeId);
      const matchedEmployee = directoryEmployee
        ? mapEmployeeToGatepassEmployee(
            directoryEmployee,
            selectedGatepassCamera.name,
          )
        : fallbackGatepassEmployee(
            eventEmployeeId,
            selectedGatepassCamera.name,
          );

      const latestRecord =
        latestRecordByEmployeeKey.get(matchedEmployee.employeeCode) ??
        latestRecordByEmployeeKey.get(matchedEmployee.id) ??
        null;

      if (hasOpenOutRecord(latestRecord)) {
        setPanelError("");
        void autoMarkGatepassReturn({
          employee: matchedEmployee,
          recognizedAt: eventTime,
          signature,
        });
        return true;
      }

      queueRecognizedPerson(matchedEmployee, eventTime, signature);
      setPanelError("");
      return true;
    },
    [
      autoMarkGatepassReturn,
      employeeDirectoryByKey,
      latestRecordByEmployeeKey,
      queueRecognizedPerson,
      recognitionActive,
      recognitionStartSeq,
      selectedGatepassCamera,
    ],
  );

  const handleAttendanceEvents = useCallback(
    (events: AttendanceEventPayload[]) => {
      if (!selectedGatepassCamera || !recognitionActive) return;

      const reversed = [...events].reverse();
      const latestScopedMatch = reversed.find((event) =>
        matchesSelectedCamera(event.cameraId),
      );

      const allEventsUnscoped =
        reversed.length > 0 &&
        reversed.every(
          (event) => String(event.cameraId ?? "").trim().length === 0,
        );

      const latestUnscopedMatch = allEventsUnscoped
        ? reversed.find(
            (event) => String(event.employeeId ?? "").trim().length > 0,
          )
        : undefined;

      const latestMatch = latestScopedMatch ?? latestUnscopedMatch;
      if (!latestMatch) return;

      applyRecognitionCandidate(latestMatch);
    },
    [
      applyRecognitionCandidate,
      matchesSelectedCamera,
      recognitionActive,
      selectedGatepassCamera,
    ],
  );

  useAttendanceEvents({
    enabled: Boolean(selectedGatepassCamera) && recognitionActive,
    syncLatestOnStart: false,
    onEvents: handleAttendanceEvents,
  });

  const clearRecognizedList = useCallback(() => {
    setRecognizedPeople([]);
    lastRecognitionSignatureRef.current = "";
    returnSyncSignatureRef.current = "";
  }, []);

  const resetGatepassForm = useCallback(() => {
    setLeaveTypeId("");
    setDestination("");
    setPurpose("");
    setFormErrors({});
  }, []);

  const resetHistoryFilters = useCallback(() => {
    const today = dhakaTodayYYYYMMDD();
    setHistorySearch("");
    setDebouncedHistorySearch("");
    setHistoryFromDate(today);
    setHistoryToDate(today);
    setHistoryLeaveTypeId("");
    setHistoryPage(1);
  }, []);

  const startSelectedCamera = useCallback(async () => {
    if (
      !selectedGatepassCamera ||
      cameraAction ||
      submitting ||
      (recognitionActive && activeCameraId === selectedGatepassCamera.id)
    ) {
      return;
    }

    const targetId = String(selectedGatepassCamera.id ?? "").trim();
    if (!targetId) {
      toast.error("Selected camera is invalid");
      return;
    }

    setCameraAction("start");
    setPanelError("");

    try {
      let latestSeqBaseline = 0;

      if (activeCameraIdRef.current && activeCameraIdRef.current !== targetId) {
        await stopCurrentCamera(activeCameraIdRef.current, false);
      }

      try {
        await Promise.all([
          fetchGatepassRecords(true),
          fetchHistoryRecords(true),
        ]);
      } catch {
        // best effort
      }

      clearRecognizedList();
      resetGatepassForm();

      try {
        latestSeqBaseline = await fetchAttendanceLatestSeq();
      } catch {
        latestSeqBaseline = 0;
      }

      await stopRecognitionCameraApi(targetId);
      await axiosInstance.post(`/cameras/start/${targetId}`);
      await axiosInstance.post("/attendance-control/enable", {
        cameraId: targetId,
      });

      patchGatepassCameraState(targetId, {
        isActive: true,
        attendance: true,
      });

      setRecognitionStartSeq(latestSeqBaseline);
      setRecognitionActive(true);
      setActiveCameraId(targetId);
      activeCameraIdRef.current = targetId;
      writeStoredGatepassCameraId(targetId);
      lastRecognitionSignatureRef.current = "";
      returnSyncSignatureRef.current = "";

      toast.success(`Recognition started on ${selectedGatepassCamera.name}`);
      setCameraAction(null);

      void (async () => {
        try {
          await fetchGatepassCameras(true);
        } catch {
          // best effort
        }
      })();
    } catch (error: unknown) {
      const message = normalizeApiError(error, "Failed to start camera");
      setPanelError(message);

      patchGatepassCameraState(targetId, {
        isActive: false,
        attendance: false,
      });

      setRecognitionActive(false);
      setRecognitionStartSeq(0);
      setActiveCameraId("");
      activeCameraIdRef.current = "";
      writeStoredGatepassCameraId("");

      try {
        await stopRecognitionCameraApi(targetId);
        await fetchGatepassCameras(true);
      } catch {
        // best effort
      }

      toast.error(message);
      setCameraAction(null);
    }
  }, [
    activeCameraId,
    cameraAction,
    clearRecognizedList,
    fetchAttendanceLatestSeq,
    fetchGatepassCameras,
    fetchGatepassRecords,
    fetchHistoryRecords,
    patchGatepassCameraState,
    recognitionActive,
    resetGatepassForm,
    selectedGatepassCamera,
    stopCurrentCamera,
    stopRecognitionCameraApi,
    submitting,
  ]);

  const stopSelectedCamera = useCallback(async () => {
    const targetId =
      String(activeCameraIdRef.current ?? "").trim() ||
      String(selectedGatepassCamera?.id ?? "").trim();

    if (!targetId || cameraAction || submitting) return;

    setCameraAction("stop");
    setPanelError("");

    try {
      await stopCurrentCamera(targetId, true);
      setRecognitionActive(false);
      clearRecognizedList();
      resetGatepassForm();
      toast.success("Gate pass camera stopped");
    } catch (error: unknown) {
      const message = normalizeApiError(error, "Failed to stop camera");
      setPanelError(message);
      toast.error(message);
    } finally {
      setCameraAction(null);
    }
  }, [
    cameraAction,
    clearRecognizedList,
    resetGatepassForm,
    selectedGatepassCamera,
    stopCurrentCamera,
    submitting,
  ]);

  const stopAndResetGatepassFlow = useCallback(
    async ({
      clearRecognitions = false,
    }: { clearRecognitions?: boolean } = {}) => {
      resetGatepassForm();
      setPanelError("");

      if (clearRecognitions) {
        clearRecognizedList();
      }

      const targetId =
        String(activeCameraIdRef.current ?? "").trim() ||
        String(selectedGatepassCamera?.id ?? "").trim();

      if (!targetId || (!activeCameraIdRef.current && !recognitionActive)) {
        return;
      }

      setCameraAction("stop");

      try {
        await stopCurrentCamera(targetId, true);
        setRecognitionActive(false);
      } catch (error: unknown) {
        const message = normalizeApiError(error, "Failed to stop camera");
        setPanelError(message);
        toast.error(message);
      } finally {
        setCameraAction(null);
      }
    },
    [
      clearRecognizedList,
      recognitionActive,
      resetGatepassForm,
      selectedGatepassCamera,
      stopCurrentCamera,
    ],
  );

  const handleCameraChange = useCallback(
    async (cameraId: string) => {
      if (cameraId === selectedGatepassCameraId) return;

      if (activeCameraIdRef.current && activeCameraIdRef.current !== cameraId) {
        setCameraAction("stop");
        try {
          await stopCurrentCamera(activeCameraIdRef.current, false);
        } finally {
          setCameraAction(null);
        }
      }

      clearRecognizedList();
      setPanelError("");
      setSelectedGatepassCameraId(cameraId);
    },
    [clearRecognizedList, selectedGatepassCameraId, stopCurrentCamera],
  );

  const submitRequest = useCallback(async () => {
    if (!selectedGatepassCamera) {
      toast.error("Select a gate pass camera first");
      return;
    }

    const trimmedPurpose = purpose.trim();
    const selectedLeaveType = leaveTypeId
      ? gatepassLeaveTypeById.get(leaveTypeId) ?? null
      : null;
    const nextErrors: FormErrors = {};
    const rowsNeedingOutSubmission = recognizedRows.filter(
      (row) => !hasOpenOutRecord(row.latestRecord),
    );

    if (!recognizedRows.length) {
      toast.error("No recognized person found to submit");
      return;
    }

    if (rowsNeedingOutSubmission.length > 0 && !selectedLeaveType) {
      nextErrors.leaveType = gatepassLeaveTypes.length
        ? "Select leave type"
        : "No gatepass leave type available";
    }

    if (rowsNeedingOutSubmission.length > 0 && !trimmedPurpose) {
      nextErrors.purpose = "Purpose is required";
    }

    if (nextErrors.leaveType || nextErrors.purpose) {
      setFormErrors(nextErrors);
      return;
    }

    setFormErrors({});
    setSubmitting(true);

    let successCount = 0;
    let firstSuccessfulName = "";
    const successfulKeys = new Set<string>();
    const failedNames: string[] = [];

    try {
      for (const row of recognizedRows) {
        try {
          const employeeId = row.employee.id || row.employee.employeeCode;
          const employeeName = row.employee.name || row.employee.employeeCode;

          if (hasOpenOutRecord(row.latestRecord)) {
            const response = await axiosInstance.post(
              `${API.GATEPASS_TABLE}/mark-return`,
              {
                employeeId,
                cameraId: selectedGatepassCamera.id,
                recognizedAt: row.recognizedAt.toISOString(),
              },
            );

            if (response?.data?.updated) {
              successCount += 1;
              if (!firstSuccessfulName) {
                firstSuccessfulName = employeeName;
              }
              successfulKeys.add(row.key);
              continue;
            }

            const reason = String(response?.data?.reason ?? "").trim();
            failedNames.push(employeeName);

            if (failedNames.length === 1) {
              toast.error(
                reason === "no_open_gatepass"
                  ? `No open gatepass found for ${employeeName}`
                  : `Failed to submit ${employeeName}`,
              );
            }

            continue;
          }

          await axiosInstance.post(API.GATEPASS_TABLE, {
            employeeId,
            cameraId: selectedGatepassCamera.id,
            leaveTypeId: selectedLeaveType?.id,
            leaveType: selectedLeaveType?.label,
            destination: destination.trim() || null,
            purpose: trimmedPurpose,
            recognizedAt: row.recognizedAt.toISOString(),
          });

          successCount += 1;
          if (!firstSuccessfulName) {
            firstSuccessfulName = employeeName;
          }
          successfulKeys.add(row.key);
        } catch (error: unknown) {
          failedNames.push(row.employee.name || row.employee.employeeCode);

          if (failedNames.length === 1) {
            toast.error(
              normalizeApiError(error, `Failed to submit ${row.employee.name}`),
            );
          }
        }
      }

      await Promise.all([
        fetchGatepassRecords(true),
        fetchHistoryRecords(true),
      ]);

      if (successCount > 0) {
        setRecognizedPeople((current) =>
          current.filter((row) => !successfulKeys.has(row.key)),
        );

        toast.success(
          successCount === 1
            ? `Gatepass submitted for ${firstSuccessfulName || "employee"}`
            : `Gatepass submitted for ${successCount} people`,
        );
      }

      if (failedNames.length > 1) {
        toast.error(
          `${failedNames.length} requests failed. Retry the remaining rows.`,
        );
      }

      if (successCount > 0) {
        await stopAndResetGatepassFlow({
          clearRecognitions: failedNames.length === 0,
        });
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    destination,
    fetchGatepassRecords,
    fetchHistoryRecords,
    gatepassLeaveTypeById,
    gatepassLeaveTypes.length,
    leaveTypeId,
    purpose,
    recognizedRows,
    selectedGatepassCamera,
    stopAndResetGatepassFlow,
  ]);

  const summaryCounts = useMemo(
    () => ({
      recognized: recognizedRows.length,
      records: requestRecords.length,
    }),
    [recognizedRows.length, requestRecords.length],
  );

  return {
    gatepassCameras,
    gatepassLeaveTypes,
    gatepassLeaveTypesLoading,
    gatepassLeaveTypesError,
    selectedGatepassCameraId,
    gatepassCamerasLoading,
    gatepassCameraError,
    directoryError,
    recordsError,
    historyRows,
    historyLoading,
    historyError,
    historySearch,
    historyFromDate,
    historyToDate,
    historyLeaveTypeId,
    recognizedRows,
    leaveTypeId,
    destination,
    purpose,
    formErrors,
    recognitionActive,
    activeCameraId,
    cameraAction,
    submitting,
    panelError,
    historyPage,
    selectedGatepassCamera,
    previewCamera,
    recognitionStreamUrl,
    isSelectedCameraRunning,
    historySkip,
    paginatedHistoryRows,
    historyPaginationResetKey,
    summaryCounts,
    recognizedColumns,
    historyColumns,
    setHistorySearch,
    setHistoryFromDate,
    setHistoryToDate,
    setHistoryLeaveTypeId,
    setHistoryPage,
    setLeaveTypeId,
    setDestination,
    setPurpose,
    setFormErrors,
    handleCameraChange,
    startSelectedCamera,
    stopSelectedCamera,
    submitRequest,
    resetHistoryFilters,
    fetchHistoryRecords,
    pageLimit: GATEPASS_HISTORY_PAGE_LIMIT,
  };
}
