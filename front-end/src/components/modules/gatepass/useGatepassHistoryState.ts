import { useState, useEffect, useCallback, useMemo } from "react";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import toast from "react-hot-toast";
import type { GatepassRecord, GatepassLeaveTypeOption } from "@/types/gatepass-types";

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
      timeZone: "Asia/Dhaka",
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

export function toRecordNote(purpose: string, destination?: string | null) {
  const trimmedPurpose = String(purpose ?? "").trim();
  const trimmedDestination = String(destination ?? "").trim();
  if (trimmedPurpose && trimmedDestination) {
    return `${trimmedPurpose} (Destination: ${trimmedDestination})`;
  }
  if (trimmedPurpose) return trimmedPurpose;
  if (trimmedDestination) return `Destination: ${trimmedDestination}`;
  return "No purpose provided";
}

export function mapGatepassApiRecordToViewRecord(row: any): GatepassRecord {
  const employeeCode = String(row.employeeId ?? "").trim() || "UNKNOWN";
  const leaveTypeLabel = String(row.leaveType ?? "").trim() || "Unknown Leave Type";

  return {
    id: row.id,
    employee: {
      id: employeeCode,
      employeeCode,
      name: String(row.employeeName ?? "").trim() || "Unknown Employee",
      section: String(row.section ?? "").trim() || "Unassigned Section",
      department: String(row.department ?? "").trim() || "Unassigned Department",
      unit: String(row.unit ?? "").trim() || "Unassigned Unit",
      shift: "General Shift",
      headcountNote: "Loaded from gatepass request table",
      designation: row.designation ? String(row.designation).trim() : null,
    },
    type: leaveTypeLabel,
    typeId: row.leaveTypeId ? String(row.leaveTypeId).trim() : null,
    outDate: formatGatepassDate(row.outTime),
    outTime: formatGatepassTime(row.outTime),
    inTime: row.inTime ? formatGatepassTime(row.inTime) : "--",
    status: row.status === "returned" ? "returned" : "out",
    note: toRecordNote(row.purpose, row.destination),
    requestedAt: formatGatepassDateTime(row.requestedAt ?? row.outTime),
    passType: row.passType,
    remarks: row.remarks,
    purpose: row.purpose,
    destination: row.destination,
    externalGatepassId: row.externalGatepassId,
    erpStatus: row.erpStatus,
    returnTime: row.returnTime ? Number(row.returnTime) : null,
    rawOutTime: row.rawOutTime || row.outTime,
    rawInTime: row.rawInTime || row.inTime,
    approvedByName: row.approvedByName,
    approvedByDesignation: row.approvedByDesignation,
    updatedAt: row.updatedAt,
  };
}

export function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function useGatepassHistoryState() {
  const [rows, setRows] = useState<GatepassRecord[]>([]);
  const [now, setNow] = useState(Date.now());
  const [selectedReportRecord, setSelectedReportRecord] = useState<GatepassRecord | null>(null);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<GatepassLeaveTypeOption[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());
  const [leaveTypeCategory, setLeaveTypeCategory] = useState<"all" | "short" | "long">("all");
  const [purposeId, setPurposeId] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 15;

  const handleViewReport = useCallback((record: GatepassRecord) => {
    setSelectedReportRecord(record);
    setIsReportModalOpen(true);
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchHistory = useCallback(async () => {
    try {
      setLoading(true);
      const params: any = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (leaveTypeCategory !== "all") params.leaveTypeCategory = leaveTypeCategory;
      if (purposeId !== "all") params.purposeId = purposeId;
      if (debouncedSearch) params.search = debouncedSearch;

      const res = await axiosInstance.get(API.GATEPASS_TABLE, { params });
      if (Array.isArray(res.data?.data)) {
        setRows(res.data.data.map(mapGatepassApiRecordToViewRecord));
      }
    } catch (err) {
      console.error("Failed to load gatepass history:", err);
      toast.error("Failed to load gatepass history");
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, leaveTypeCategory, purposeId, debouncedSearch]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  return {
    rows,
    now,
    selectedReportRecord,
    isReportModalOpen,
    setIsReportModalOpen,
    loading,
    leaveTypes,
    search,
    setSearch,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    leaveTypeCategory,
    setLeaveTypeCategory,
    purposeId,
    setPurposeId,
    currentPage,
    setCurrentPage,
    pageLimit,
    handleViewReport,
    fetchHistory,
  };
}
