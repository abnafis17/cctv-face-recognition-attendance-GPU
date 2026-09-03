"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { useHeadcountEvents } from "@/hooks/useHeadcountEvents";
import { deriveEmployeeHierarchy } from "@/lib/employeeHierarchy";
import { exportJsonToXlsx } from "@/lib/exportXlsx";
import type {
  HeadcountCrosscheckRow,
  HeadcountFilterEmployee,
  HeadcountHierarchyFilters,
  HeadcountOtRow,
  HeadcountStatusFilter,
  HeadcountType,
} from "@/types/headcount-types";
import {
  dhakaTodayYYYYMMDD,
  getDynamicHeadcountRuns,
  getHeadcountCounts,
  normalizeHeadcountCrosscheckRow,
  normalizeHeadcountOtRow,
  safeTimeOnly,
  safeTimeRange,
} from "@/components/modules/head-count/headcount-utils";
import { getApiErrorMessage, useHeadcountCameras } from "./useHeadcountCameras";

const EMPTY_HIERARCHY: HeadcountHierarchyFilters = { unit: "", department: "", section: "", line: "" };

export function useHeadcountPage() {
  const [dateStr, setDateStr] = useState<string>(() => dhakaTodayYYYYMMDD());
  const [headcountType, setHeadcountType] = useState<HeadcountType>("");
  const [hcRows, setHcRows] = useState<HeadcountCrosscheckRow[]>([]);
  const [otRows, setOtRows] = useState<HeadcountOtRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [runWindowMinutes, setRunWindowMinutes] = useState(15);
  const [statusFilter, setStatusFilter] = useState<HeadcountStatusFilter>("ALL");
  const [hierarchyFilters, setHierarchyFilters] = useState<HeadcountHierarchyFilters>(EMPTY_HIERARCHY);
  const [filterEmployees, setFilterEmployees] = useState<HeadcountFilterEmployee[]>([]);

  const headcountInFlightRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  const cameraState = useHeadcountCameras(headcountType);

  useEffect(() => {
    const timerId = window.setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => window.clearTimeout(timerId);
  }, [search]);

  useEffect(() => {
    setHcRows([]);
    setOtRows([]);
    setStatusFilter("ALL");
  }, [headcountType]);

  const fetchFilterEmployees = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API.EMPLOYEE_LIST);
      const list = Array.isArray(res?.data) ? res.data : [];
      setFilterEmployees(list.map((r: any) => ({ unit: r?.unit, department: r?.department, section: r?.section, line: r?.line })));
    } catch {
      setFilterEmployees([]);
    }
  }, []);

  useEffect(() => { void fetchFilterEmployees(); }, [fetchFilterEmployees]);

  const hierarchy = useMemo(() => deriveEmployeeHierarchy(filterEmployees, hierarchyFilters), [filterEmployees, hierarchyFilters]);

  useEffect(() => {
    const next = hierarchy.normalizedSelection;
    setHierarchyFilters((prev) => (prev.unit === next.unit && prev.department === next.department && prev.section === next.section && prev.line === next.line ? prev : next));
  }, [hierarchy.normalizedSelection]);

  const fetchHeadcount = useCallback(async (opts?: { showSpinner?: boolean }) => {
    const showSpinner = opts?.showSpinner ?? false;
    if (!headcountType) { setHcRows([]); setOtRows([]); return; }
    if (headcountInFlightRef.current) return;
    headcountInFlightRef.current = true;

    try {
      if (showSpinner) setLoading(true);
      const params: Record<string, string | number | undefined> = {
        date: dateStr, q: debouncedSearch || undefined, view: headcountType === "ot" ? "ot" : "headcount",
      };
      if (headcountType === "headcount") params.runGapMinutes = runWindowMinutes;
      if (hierarchyFilters.unit) params.unit = hierarchyFilters.unit;
      if (hierarchyFilters.department) params.department = hierarchyFilters.department;
      if (hierarchyFilters.section) params.section = hierarchyFilters.section;
      if (hierarchyFilters.line) params.line = hierarchyFilters.line;

      const res = await axiosInstance.get(API.HEADCOUNT_LIST, { params });
      const data = Array.isArray(res?.data) ? res.data : Array.isArray(res?.data?.records) ? res.data.records : Array.isArray(res?.data?.data) ? res.data.data : [];

      if (headcountType === "headcount") {
        setOtRows([]);
        setHcRows(data.map((r: any) => normalizeHeadcountCrosscheckRow(r, dateStr)));
      } else {
        setHcRows([]);
        setOtRows(data.map((r: any) => normalizeHeadcountOtRow(r, dateStr)));
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err, "Failed to load headcount"));
      setHcRows([]); setOtRows([]);
    } finally {
      if (showSpinner) setLoading(false);
      headcountInFlightRef.current = false;
    }
  }, [dateStr, debouncedSearch, headcountType, hierarchyFilters, runWindowMinutes]);

  useEffect(() => { void fetchHeadcount({ showSpinner: true }); }, [fetchHeadcount]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchHeadcount();
    }, 400);
  }, [fetchHeadcount]);

  const isToday = dateStr === dhakaTodayYYYYMMDD();
  useHeadcountEvents({ enabled: isToday && Boolean(headcountType), onEvents: scheduleRefresh });
  useAttendanceEvents({ enabled: isToday && headcountType === "headcount", onEvents: scheduleRefresh });

  useEffect(() => () => { if (refreshTimerRef.current) window.clearTimeout(refreshTimerRef.current); }, []);

  const counts = useMemo(() => getHeadcountCounts(hcRows), [hcRows]);
  const dynamicHeadcountRuns = useMemo(() => getDynamicHeadcountRuns(hcRows), [hcRows]);

  const filteredHcRows = useMemo(() => {
    const base = statusFilter === "ALL" ? [...hcRows] : hcRows.filter((r) => r.status === statusFilter);
    base.sort((a, b) => {
      const rank = (s: string) => (s === "MATCH" ? 0 : s === "UNMATCH" ? 1 : 2);
      const diff = rank(a.status) - rank(b.status);
      return diff !== 0 ? diff : String(a.name ?? "").localeCompare(String(b.name ?? ""));
    });
    return base;
  }, [hcRows, statusFilter]);

  const canExport = useMemo(() => {
    if (loading) return false;
    return headcountType === "headcount" ? filteredHcRows.length > 0 : headcountType === "ot" ? otRows.length > 0 : false;
  }, [filteredHcRows.length, headcountType, loading, otRows.length]);

  const handleExport = useCallback(async () => {
    try {
      if (!canExport) return;
      if (headcountType === "headcount") {
        const filterLabel = [hierarchyFilters.unit || "all-unit", hierarchyFilters.department || "all-department", hierarchyFilters.section || "all-section", hierarchyFilters.line || "all-line"].join("_").replace(/\s+/g, "-");
        const exportRows = filteredHcRows.map((row, idx) => {
          const runCols = dynamicHeadcountRuns.reduce((acc, run) => {
            const res = row.headcountRuns.find((v) => v.runKey === run.runKey);
            const st = res?.status ?? "ABSENT";
            const lbl = `Headcount ${run.runIndex} (${safeTimeRange(run.runStartTime, run.runEndTime)})`;
            const tm = safeTimeOnly(res?.headcountTime);
            acc[lbl] = st === "ABSENT" ? "ABSENT" : tm === "-" ? st : `${st} @ ${tm}`;
            return acc;
          }, {} as Record<string, string>);
          return { SL: idx + 1, "Employee ID": row.employeeId, Name: row.name, Unit: row.unit ?? "", Department: row.department ?? "", Section: row.section ?? "", Line: row.line ?? "", Status: row.status, ...runCols, Date: dateStr };
        });
        await exportJsonToXlsx({ data: exportRows, sheetName: "Headcount", fileName: `headcount_${dateStr}_${filterLabel}_${statusFilter}.xlsx` });
        return;
      }
      const exportRows = otRows.map((row, idx) => ({ SL: idx + 1, "Employee ID": row.employeeId, Name: row.name, Unit: row.unit ?? "", Department: row.department ?? "", Section: row.section ?? "", Line: row.line ?? "", Camera: row.cameraName ?? "", "Headcount Time": row.headcountTime ?? "", Date: dateStr }));
      await exportJsonToXlsx({ data: exportRows, sheetName: "OT", fileName: `ot_headcount_${dateStr}.xlsx` });
    } catch (err) { toast.error(getApiErrorMessage(err, "Failed to export Excel")); }
  }, [canExport, dateStr, dynamicHeadcountRuns, filteredHcRows, headcountType, hierarchyFilters, otRows, statusFilter]);

  const handleUnitChange = useCallback((v: string) => setHierarchyFilters({ unit: v, department: "", section: "", line: "" }), []);
  const handleDepartmentChange = useCallback((v: string) => setHierarchyFilters((prev) => ({ ...prev, department: v, section: "", line: "" })), []);
  const handleSectionChange = useCallback((v: string) => setHierarchyFilters((prev) => ({ ...prev, section: v, line: "" })), []);
  const handleLineChange = useCallback((v: string) => setHierarchyFilters((prev) => ({ ...prev, line: v })), []);

  return {
    ...cameraState, dateStr, setDateStr, headcountType, setHeadcountType, hcRows, otRows, filteredHcRows, loading, search, setSearch, debouncedSearch, runWindowMinutes, setRunWindowMinutes, statusFilter, setStatusFilter, hierarchyFilters, setHierarchyFilters, hierarchy, dynamicHeadcountRuns, counts, canExport, handleDateChange: (v: string) => setDateStr(v), handleHeadcountTypeChange: (v: HeadcountType) => setHeadcountType(v), handleSearchChange: (v: string) => setSearch(v), handleSearchSubmit: () => void fetchHeadcount(), clearSearch: () => setSearch(""), handleStatusFilterChange: (v: HeadcountStatusFilter) => setStatusFilter(v), handleRunWindowChange: (v: number) => setRunWindowMinutes(v), handleUnitChange, handleDepartmentChange, handleSectionChange, handleLineChange, handleRefresh: () => void fetchHeadcount({ showSpinner: true }), handleExport,
  };
}
