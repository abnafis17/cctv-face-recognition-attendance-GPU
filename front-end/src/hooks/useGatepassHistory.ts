import { useCallback, useEffect, useMemo, useState } from "react";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { getHistoryColumns } from "@/components/modules/gatepass/historyColumns";
import type { GatepassApiRecord, GatepassRecord } from "@/types/gatepass-types";
import {
  formatGatepassDate,
  formatGatepassTime,
  formatGatepassDateTime,
  GATEPASS_HISTORY_PAGE_LIMIT,
  normalizeApiError,
} from "./useGatepassUtils";

export function useGatepassHistory() {
  const [historyRows, setHistoryRows] = useState<GatepassRecord[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [historyFromDate, setHistoryFromDate] = useState("");
  const [historyToDate, setHistoryToDate] = useState("");
  const [historyLeaveTypeCategory, setHistoryLeaveTypeCategory] = useState<
    "all" | "long" | "short"
  >("all");
  const [historyPurposeId, setHistoryPurposeId] = useState("all");
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPaginationResetKey, setHistoryPaginationResetKey] = useState("0");

  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [selectedReportRecord, setSelectedReportRecord] = useState<GatepassRecord | null>(null);

  const handleOpenReport = useCallback((record: GatepassRecord) => {
    setSelectedReportRecord(record);
    setIsReportModalOpen(true);
  }, []);

  const fetchHistoryRecords = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const res = await axiosInstance.get(API.GATEPASS_TABLE, {
        params: {
          search: historySearch.trim() || undefined,
          fromDate: historyFromDate || undefined,
          toDate: historyToDate || undefined,
          category: historyLeaveTypeCategory !== "all" ? historyLeaveTypeCategory : undefined,
          purposeId: historyPurposeId !== "all" ? historyPurposeId : undefined,
        },
      });
      const items: GatepassApiRecord[] = Array.isArray(res?.data?.items)
        ? res.data.items
        : Array.isArray(res?.data)
        ? res.data
        : [];

      const records: GatepassRecord[] = items.map((item, index) => {
        const empName = item.employeeName || "Unknown Employee";
        const empCode = item.employeeId || "N/A";
        const empUnit = item.unit || "Unassigned Unit";
        const empDept = item.department || "Unassigned Department";
        const empSec = item.section || "Unassigned Section";

        return {
          id: item.id || `record-${index}`,
          employee: {
            id: String(item.employeeId || empCode),
            employeeCode: empCode,
            name: empName,
            section: empSec,
            department: empDept,
            unit: empUnit,
            shift: "General Shift",
            headcountNote: "Gatepass history record",
          },
          type: item.leaveType || "Gatepass",
          outDate: formatGatepassDate(item.outTime),
          outTime: formatGatepassTime(item.outTime),
          inTime: formatGatepassTime(item.inTime),
          status: item.inTime ? "returned" : "out",
          note: item.purpose || "N/A",
          requestedAt: formatGatepassDateTime(item.outTime),
          purpose: item.purpose || "N/A",
          destination: item.destination || "N/A",
        };
      });

      setHistoryRows(records);
      setHistoryError("");
    } catch (err) {
      setHistoryError(normalizeApiError(err, "Failed to load history records"));
      setHistoryRows([]);
    } finally {
      setHistoryLoading(false);
    }
  }, [
    historySearch,
    historyFromDate,
    historyToDate,
    historyLeaveTypeCategory,
    historyPurposeId,
  ]);

  useEffect(() => {
    fetchHistoryRecords();
  }, [fetchHistoryRecords]);

  const historyColumns = useMemo(
    () => getHistoryColumns(0, handleOpenReport),
    [handleOpenReport]
  );

  const paginatedHistoryRows = useMemo(() => {
    const start = (historyPage - 1) * GATEPASS_HISTORY_PAGE_LIMIT;
    return historyRows.slice(start, start + GATEPASS_HISTORY_PAGE_LIMIT);
  }, [historyRows, historyPage]);

  const resetHistoryFilters = useCallback(() => {
    setHistorySearch("");
    setHistoryFromDate("");
    setHistoryToDate("");
    setHistoryLeaveTypeCategory("all");
    setHistoryPurposeId("all");
    setHistoryPage(1);
    setHistoryPaginationResetKey((prev) => String(Number(prev) + 1));
  }, []);

  return {
    historyRows,
    historyLoading,
    historyError,
    historySearch,
    setHistorySearch,
    historyFromDate,
    setHistoryFromDate,
    historyToDate,
    setHistoryToDate,
    historyLeaveTypeCategory,
    setHistoryLeaveTypeCategory,
    historyPurposeId,
    setHistoryPurposeId,
    historyPage,
    setHistoryPage,
    historyPaginationResetKey,
    paginatedHistoryRows,
    historyColumns,
    pageLimit: GATEPASS_HISTORY_PAGE_LIMIT,
    isReportModalOpen,
    setIsReportModalOpen,
    selectedReportRecord,
    resetHistoryFilters,
    fetchHistoryRecords,
    handleOpenReport,
  };
}
