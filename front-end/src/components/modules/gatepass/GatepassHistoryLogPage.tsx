"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  History,
  Search,
  RotateCcw,
  Calendar,
  Filter,
  RefreshCcw,
} from "lucide-react";
import { getHistoryColumns } from "./historyColumns";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import axiosInstance from "@/config/axiosInstance";
import toast from "react-hot-toast";
import type {
  GatepassRecord,
  GatepassLeaveTypeOption,
} from "@/types/gatepass-types";

function extractGatepassTimestampParts(value: unknown) {
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

function mapGatepassApiRecordToViewRecord(row: any): GatepassRecord {
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
  };
}

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export default function GatepassHistoryLogPage() {
  const [rows, setRows] = useState<GatepassRecord[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setNow(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);
  const [loading, setLoading] = useState(false);
  const [leaveTypes, setLeaveTypes] = useState<GatepassLeaveTypeOption[]>([]);

  // Filters State
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());
  const [leaveTypeCategory, setLeaveTypeCategory] = useState<
    "all" | "short" | "long"
  >("all");
  const [purposeId, setPurposeId] = useState("all");
  const [error, setError] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 15;

  // Search debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // Load Leave Types
  const fetchLeaveTypes = useCallback(async () => {
    try {
      const response =
        await axiosInstance.get<GatepassLeaveTypeOption[]>("/gatepass/types");
      const list = Array.isArray(response.data) ? response.data : [];
      setLeaveTypes(list);
    } catch (err) {
      console.error("[Gatepass Log] Failed to load leave types", err);
    }
  }, []);

  useEffect(() => {
    void fetchLeaveTypes();
  }, [fetchLeaveTypes]);

  // Fetch gatepass records
  const fetchRecords = useCallback(
    async (isSilent = false) => {
      if (fromDate > toDate) {
        setError("From date must be earlier than or equal to To date");
        setRows([]);
        return;
      }

      if (!isSilent) {
        setLoading(true);
      }
      setError("");

      try {
        const resolvedLeaveTypeId =
          leaveTypeCategory === "all"
            ? undefined
            : leaveTypeCategory === "long"
              ? "Long Leave"
              : purposeId === "all"
                ? "short leave"
                : purposeId;

        const params: any = {
          fromDate,
          toDate,
          leaveTypeId: resolvedLeaveTypeId,
          limit: 500,
        };

        if (debouncedSearch) {
          params.q = debouncedSearch;
        }

        const response = await axiosInstance.get<any[]>("/gatepass", {
          params,
        });
        const list = Array.isArray(response.data) ? response.data : [];
        setRows(list.map(mapGatepassApiRecordToViewRecord));
      } catch (err: any) {
        const msg =
          err?.response?.data?.error ||
          err?.response?.data?.message ||
          "Failed to load gatepass records";
        setError(msg);
        toast.error(msg);
        setRows([]);
      } finally {
        setLoading(false);
      }
    },
    [fromDate, toDate, leaveTypeCategory, purposeId, debouncedSearch],
  );

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const handleResetFilters = () => {
    const today = dhakaTodayYYYYMMDD();
    setSearch("");
    setDebouncedSearch("");
    setFromDate(today);
    setToDate(today);
    setLeaveTypeCategory("all");
    setPurposeId("all");
    setError("");
    setCurrentPage(1);
  };

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageLimit;
    return rows.slice(startIdx, startIdx + pageLimit);
  }, [rows, currentPage, pageLimit]);

  const paginationResetKey = useMemo(() => {
    return `${fromDate}-${toDate}-${leaveTypeCategory}-${purposeId}-${debouncedSearch}-${rows.length}`;
  }, [
    fromDate,
    toDate,
    leaveTypeCategory,
    purposeId,
    debouncedSearch,
    rows.length,
  ]);

  useEffect(() => {
    setCurrentPage(1);
  }, [debouncedSearch, fromDate, toDate, leaveTypeCategory, purposeId]);

  const columns = useMemo(() => {
    const skip = (currentPage - 1) * pageLimit;
    return getHistoryColumns(skip);
  }, [currentPage, pageLimit]);

  const isShortSelected = leaveTypeCategory === "short";

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between rounded-xl bg-linear-to-r from-indigo-950 via-slate-950 to-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <History className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold tracking-tight">
              Gatepass History Log
            </h1>
            <p className="text-xs text-zinc-300">
              View and manage logged employee gatepass events
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="rounded-full border-white/20 bg-white/10 text-white px-3 py-1 font-medium text-xs"
          >
            Total Logs: {rows.length}
          </Badge>
        </div>
      </div>

      {/* Filters Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[#0c1b33]">
          <Filter className="h-4 w-4 text-indigo-500" />
          Filter Gatepass Records
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 xl:gap-3 items-end">
          {/* Search Input */}
          <div
            className={`min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-2 ${isShortSelected ? "xl:col-span-2" : "xl:col-span-4"}`}
          >
            <label className="text-[11px] font-semibold text-zinc-400">
              Search
            </label>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Search by employee name or ID"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-10 rounded-xl border-zinc-200 text-xs shadow-none"
              />
            </div>
          </div>

          {/* From Date */}
          <div className="min-w-0 space-y-1.5 xl:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-400">
              From Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 w-full pl-10 pr-3 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-700 outline-none hover:border-zinc-300 focus:ring-1 focus:ring-zinc-400 transition-all shadow-none"
              />
            </div>
          </div>

          {/* To Date */}
          <div className="min-w-0 space-y-1.5 xl:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-400">
              To Date
            </label>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 w-full pl-10 pr-3 rounded-xl border border-zinc-200 bg-white text-xs text-zinc-700 outline-none hover:border-zinc-300 focus:ring-1 focus:ring-zinc-400 transition-all shadow-none"
              />
            </div>
          </div>

          {/* Leave Type Filter */}
          <div className="min-w-0 space-y-1.5 xl:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-400">
              Leave Type
            </label>
            <Select
              value={leaveTypeCategory}
              onValueChange={(value: "all" | "short" | "long") => {
                setLeaveTypeCategory(value);
                if (value !== "short") {
                  setPurposeId("all");
                }
              }}
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-zinc-200 bg-white text-xs shadow-none">
                <SelectValue placeholder="All Leave Types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">
                  All Leave Types
                </SelectItem>
                <SelectItem value="short" className="text-xs">
                  Short Leave
                </SelectItem>
                <SelectItem value="long" className="text-xs">
                  Long Leave
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Conditional Purpose Filter */}
          {isShortSelected && (
            <div className="min-w-0 space-y-1.5 xl:col-span-2">
              <label className="text-[11px] font-semibold text-zinc-400">
                Purpose
              </label>
              <Select value={purposeId} onValueChange={setPurposeId}>
                <SelectTrigger className="h-10 w-full rounded-xl border-zinc-200 bg-white text-xs shadow-none">
                  <SelectValue placeholder="All purposes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">
                    All Purposes
                  </SelectItem>
                  {leaveTypes.map((t) => (
                    <SelectItem key={t.id} value={t.id} className="text-xs">
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-2.5 sm:col-span-2 xl:col-span-2 xl:self-end">
            <Button
              type="button"
              onClick={handleResetFilters}
              className="h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-1 font-semibold uppercase text-[10px] tracking-wider cursor-pointer shadow-none w-full"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Today
            </Button>
            <Button
              type="button"
              onClick={() => void fetchRecords()}
              disabled={loading}
              className="h-10 rounded-xl bg-[#0c1b33] text-white hover:bg-slate-900 flex items-center justify-center gap-1 font-semibold uppercase text-[10px] tracking-wider cursor-pointer shadow-none w-full disabled:opacity-60"
            >
              <RefreshCcw
                className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </Button>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-red-100 bg-red-50/50 px-4 py-2.5 text-xs text-red-700 font-medium">
            {error}
          </div>
        )}
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="min-h-[300px] w-full max-w-full overflow-hidden">
          <TanstackDataTable
            data={paginatedRows}
            columns={columns}
            loading={loading}
            className="w-full"
            freezeClassName="w-full max-w-full overflow-x-auto overflow-y-hidden rounded-none"
            emptyState="No gatepass records found for the selected criteria."
            getRowClassName={() => ""}
            getCellClassName={(columnId, row) => {
              if (columnId !== "status") return "";
              const rec = row.original;
              if (!rec.returnTime || !rec.rawOutTime) return "";
              const outDate = new Date(rec.rawOutTime);
              if (isNaN(outDate.getTime())) return "";

              if (rec.status === "returned" && rec.rawInTime) {
                const inDate = new Date(rec.rawInTime);
                if (!isNaN(inDate.getTime())) {
                  const diffMins = (inDate.getTime() - outDate.getTime()) / (1000 * 60);
                  if (diffMins <= rec.returnTime) {
                    return "bg-emerald-200 text-emerald-950 font-semibold";
                  } else {
                    return "bg-rose-200 text-rose-950 font-semibold";
                  }
                }
              } else if (rec.status !== "returned") {
                const diffMins = (now - outDate.getTime()) / (1000 * 60);
                if (diffMins > rec.returnTime) {
                  return "bg-rose-200 text-rose-950 font-semibold";
                }
              }
              return "";
            }}
          />
        </div>

        {rows.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
            <Pagination
              numberOfData={rows.length}
              limits={pageLimit}
              getCurrentPage={setCurrentPage}
              activeTab2={paginationResetKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}
