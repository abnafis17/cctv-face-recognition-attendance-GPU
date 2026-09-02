"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance, { AI_HOST, API } from "@/config/axiosInstance";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { useHeadcountEvents } from "@/hooks/useHeadcountEvents";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { deriveEmployeeHierarchy } from "@/lib/employeeHierarchy";
import { exportJsonToXlsx } from "@/lib/exportXlsx";
import type {
  HeadcountCameraOption,
  HeadcountCounts,
  HeadcountCrosscheckRow,
  HeadcountDynamicRun,
  HeadcountFilterEmployee,
  HeadcountHierarchyFilters,
  HeadcountHierarchyResult,
  HeadcountOtRow,
  HeadcountStatusFilter,
  HeadcountType,
} from "@/types/headcount-types";
import {
  dhakaTodayYYYYMMDD,
  getDynamicHeadcountRuns,
  getHeadcountCounts,
  normalizeHeadcountCamera,
  normalizeHeadcountCrosscheckRow,
  normalizeHeadcountOtRow,
  safeTimeOnly,
  safeTimeRange,
} from "@/components/modules/head-count/headcount-utils";

type FetchHeadcountOptions = {
  showSpinner?: boolean;
};

const EMPTY_HIERARCHY_FILTERS: HeadcountHierarchyFilters = {
  unit: "",
  department: "",
  section: "",
  line: "",
};

function getApiErrorMessage(error: unknown, fallback: string) {
  const anyError = error as any;
  return (
    anyError?.response?.data?.message ||
    anyError?.response?.data?.error ||
    (error instanceof Error ? error.message : fallback)
  );
}

export function useHeadcountPage() {
  const [companyId, setCompanyId] = useState("");
  const [cams, setCams] = useState<HeadcountCameraOption[]>([]);
  const [selectedCamId, setSelectedCamId] = useState("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [laptopActive, setLaptopActive] = useState(false);

  const [dateStr, setDateStr] = useState(dhakaTodayYYYYMMDD());
  const [headcountType, setHeadcountType] = useState<HeadcountType>("");
  const [hcRows, setHcRows] = useState<HeadcountCrosscheckRow[]>([]);
  const [otRows, setOtRows] = useState<HeadcountOtRow[]>([]);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [runWindowMinutes, setRunWindowMinutes] = useState(15);
  const [statusFilter, setStatusFilter] =
    useState<HeadcountStatusFilter>("ALL");
  const [hierarchyFilters, setHierarchyFilters] =
    useState<HeadcountHierarchyFilters>(EMPTY_HIERARCHY_FILTERS);
  const [filterEmployees, setFilterEmployees] = useState<
    HeadcountFilterEmployee[]
  >([]);

  const headcountInFlightRef = useRef(false);
  const refreshTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 350);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [search]);

  useEffect(() => {
    setHcRows([]);
    setOtRows([]);
    setStatusFilter("ALL");
  }, [headcountType]);

  const selectedCam = useMemo(
    () => cams.find((camera) => camera.id === selectedCamId) || null,
    [cams, selectedCamId],
  );
  const usingLaptopCamera = !selectedCam;
  const selectedCameraName = selectedCam?.name ?? "Laptop Camera";
  const selectedCameraActive = selectedCam
    ? Boolean(selectedCam.isActive)
    : laptopActive;
  const selectedCameraBusy = selectedCam
    ? actionCamId === selectedCam.id
    : false;
  const streamType = headcountType === "ot" ? "ot" : "headcount";
  const streamQuery = useMemo(() => {
    const params = new URLSearchParams();
    params.set("type", streamType);
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return query ? `?${query}` : "";
  }, [companyId, streamType]);

  const getRemoteStreamUrl = useCallback(
    (camera: HeadcountCameraOption) =>
      `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
        camera.id,
      )}/${encodeURIComponent(camera.name)}${streamQuery}`,
    [streamQuery],
  );

  const fetchCameras = useCallback(async () => {
    try {
      const response = await axiosInstance.get(API.HEADCOUNT_CAMERAS);
      const list = Array.isArray(response?.data) ? response.data : [];
      setCams(list.map(normalizeHeadcountCamera));
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to load cameras"));
      setCams([]);
    }
  }, []);

  useEffect(() => {
    void fetchCameras();
  }, [fetchCameras]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void fetchCameras();
    }, 10000);

    const handleFocus = () => {
      void fetchCameras();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void fetchCameras();
      }
    };

    window.addEventListener("focus", handleFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fetchCameras]);

  useEffect(() => {
    if (!selectedCamId) return;
    if (!cams.some((camera) => camera.id === selectedCamId)) {
      setSelectedCamId("");
    }
  }, [cams, selectedCamId]);

  const fetchFilterEmployees = useCallback(async () => {
    try {
      const response = await axiosInstance.get(API.EMPLOYEE_LIST);
      const list = Array.isArray(response?.data) ? response.data : [];
      setFilterEmployees(
        list.map((row: any) => ({
          unit: row?.unit ?? null,
          department: row?.department ?? null,
          section: row?.section ?? null,
          line: row?.line ?? null,
        })),
      );
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to load employee filters"));
      setFilterEmployees([]);
    }
  }, []);

  useEffect(() => {
    void fetchFilterEmployees();
  }, [fetchFilterEmployees]);

  const hierarchy = useMemo<HeadcountHierarchyResult>(
    () => deriveEmployeeHierarchy(filterEmployees, hierarchyFilters),
    [filterEmployees, hierarchyFilters],
  );

  useEffect(() => {
    const next = hierarchy.normalizedSelection;
    setHierarchyFilters((prev) => {
      if (
        prev.unit === next.unit &&
        prev.department === next.department &&
        prev.section === next.section &&
        prev.line === next.line
      ) {
        return prev;
      }

      return next;
    });
  }, [hierarchy.normalizedSelection]);

  const setCameraPower = useCallback(
    async (cameraId: string, action: "start" | "stop") => {
      if (!cameraId) return;

      setActionCamId(cameraId);
      try {
        await axiosInstance.post(`/cameras/${action}/${cameraId}`);
        await fetchCameras();
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, `Failed to ${action} camera`));
      } finally {
        setActionCamId(null);
      }
    },
    [fetchCameras],
  );

  const startCamera = useCallback(
    async (cameraId: string) => {
      await setCameraPower(cameraId, "start");
    },
    [setCameraPower],
  );

  const stopCamera = useCallback(
    async (cameraId: string) => {
      await setCameraPower(cameraId, "stop");
    },
    [setCameraPower],
  );

  const fetchHeadcount = useCallback(
    async (options?: FetchHeadcountOptions) => {
      const showSpinner = options?.showSpinner ?? false;

      if (!headcountType) {
        setHcRows([]);
        setOtRows([]);
        return;
      }

      if (headcountInFlightRef.current) return;
      headcountInFlightRef.current = true;

      try {
        if (showSpinner) setLoading(true);

        const params: Record<string, string | number | undefined> = {
          date: dateStr,
          q: debouncedSearch || undefined,
          view: headcountType === "ot" ? "ot" : "headcount",
        };

        if (headcountType === "headcount") {
          params.runGapMinutes = runWindowMinutes;
        }
        if (hierarchyFilters.unit) params.unit = hierarchyFilters.unit;
        if (hierarchyFilters.department) {
          params.department = hierarchyFilters.department;
        }
        if (hierarchyFilters.section) params.section = hierarchyFilters.section;
        if (hierarchyFilters.line) params.line = hierarchyFilters.line;

        const response = await axiosInstance.get(API.HEADCOUNT_LIST, {
          params,
        });
        const data = Array.isArray(response?.data) ? response.data : [];

        if (headcountType === "headcount") {
          setOtRows([]);
          setHcRows(
            data.map((row: any) =>
              normalizeHeadcountCrosscheckRow(row, dateStr),
            ),
          );
          return;
        }

        setHcRows([]);
        setOtRows(
          data.map((row: any) => normalizeHeadcountOtRow(row, dateStr)),
        );
      } catch (error: unknown) {
        toast.error(getApiErrorMessage(error, "Failed to load headcount"));
        setHcRows([]);
        setOtRows([]);
      } finally {
        if (showSpinner) setLoading(false);
        headcountInFlightRef.current = false;
      }
    },
    [
      dateStr,
      debouncedSearch,
      headcountType,
      hierarchyFilters.department,
      hierarchyFilters.line,
      hierarchyFilters.section,
      hierarchyFilters.unit,
      runWindowMinutes,
    ],
  );

  useEffect(() => {
    void fetchHeadcount({ showSpinner: true });
  }, [fetchHeadcount]);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      void fetchHeadcount();
    }, 400);
  }, [fetchHeadcount]);

  const isToday = dateStr === dhakaTodayYYYYMMDD();

  useHeadcountEvents({
    enabled: isToday && Boolean(headcountType),
    onEvents: scheduleRefresh,
  });

  useAttendanceEvents({
    enabled: isToday && headcountType === "headcount",
    onEvents: scheduleRefresh,
  });

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) {
        window.clearTimeout(refreshTimerRef.current);
      }
    };
  }, []);

  const counts = useMemo<HeadcountCounts>(
    () => getHeadcountCounts(hcRows),
    [hcRows],
  );

  const filteredHcRows = useMemo(() => {
    if (statusFilter === "ALL") return hcRows;
    return hcRows.filter((row) => row.status === statusFilter);
  }, [hcRows, statusFilter]);

  const dynamicHeadcountRuns = useMemo<HeadcountDynamicRun[]>(
    () => getDynamicHeadcountRuns(hcRows),
    [hcRows],
  );

  const canExport = useMemo(() => {
    if (loading) return false;
    if (headcountType === "headcount") return filteredHcRows.length > 0;
    if (headcountType === "ot") return otRows.length > 0;
    return false;
  }, [filteredHcRows.length, headcountType, loading, otRows.length]);

  const handleExport = useCallback(async () => {
    try {
      if (!canExport) return;

      if (headcountType === "headcount") {
        const filterLabel = [
          hierarchyFilters.unit || "all-unit",
          hierarchyFilters.department || "all-department",
          hierarchyFilters.section || "all-section",
          hierarchyFilters.line || "all-line",
        ]
          .join("_")
          .replace(/\s+/g, "-");

        const exportRows = filteredHcRows.map((row, index) => {
          const runExportColumns = dynamicHeadcountRuns.reduce(
            (acc, run) => {
              const runResult = row.headcountRuns.find(
                (value) => value.runKey === run.runKey,
              );
              const runStatus = runResult?.status ?? "ABSENT";
              const runLabel = `Headcount ${run.runIndex} (${safeTimeRange(
                run.runStartTime,
                run.runEndTime,
              )})`;
              const runTime = safeTimeOnly(runResult?.headcountTime);

              acc[runLabel] =
                runStatus === "ABSENT"
                  ? "ABSENT"
                  : runTime === "-"
                    ? runStatus
                    : `${runStatus} @ ${runTime}`;
              return acc;
            },
            {} as Record<string, string>,
          );

          return {
            SL: index + 1,
            "Employee ID": row.employeeId,
            Name: row.name,
            Unit: row.unit ?? "",
            Department: row.department ?? "",
            Section: row.section ?? "",
            Line: row.line ?? "",
            Status: row.status,
            ...runExportColumns,
            Date: dateStr,
          };
        });

        await exportJsonToXlsx({
          data: exportRows,
          sheetName: "Headcount",
          fileName: `headcount_${dateStr}_${filterLabel}_${statusFilter}.xlsx`,
        });
        return;
      }

      const exportRows = otRows.map((row, index) => ({
        SL: index + 1,
        "Employee ID": row.employeeId,
        Name: row.name,
        Unit: row.unit ?? "",
        Department: row.department ?? "",
        Section: row.section ?? "",
        Line: row.line ?? "",
        Camera: row.cameraName ?? "",
        "Headcount Time": row.headcountTime ?? "",
        Date: dateStr,
      }));

      await exportJsonToXlsx({
        data: exportRows,
        sheetName: "OT",
        fileName: `ot_headcount_${dateStr}.xlsx`,
      });
    } catch (error: unknown) {
      toast.error(getApiErrorMessage(error, "Failed to export Excel"));
    }
  }, [
    canExport,
    dateStr,
    dynamicHeadcountRuns,
    filteredHcRows,
    headcountType,
    hierarchyFilters.department,
    hierarchyFilters.line,
    hierarchyFilters.section,
    hierarchyFilters.unit,
    otRows,
    statusFilter,
  ]);

  const totalSources = cams.length + 1;
  const activeSources =
    cams.filter((camera) => Boolean(camera.isActive)).length +
    Number(laptopActive);
  const offlineSources = Math.max(totalSources - activeSources, 0);

  const handleCameraSelect = useCallback((cameraId: string) => {
    setSelectedCamId(cameraId);
  }, []);

  const handleHeadcountTypeChange = useCallback((value: HeadcountType) => {
    setHeadcountType(value);
  }, []);

  const handleDateChange = useCallback((value: string) => {
    setDateStr(value);
  }, []);

  const handleStatusFilterChange = useCallback(
    (value: HeadcountStatusFilter) => {
      setStatusFilter(value);
    },
    [],
  );

  const handleRunWindowChange = useCallback((value: number) => {
    setRunWindowMinutes(value);
  }, []);

  const handleSearchChange = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const clearSearch = useCallback(() => {
    setSearch("");
  }, []);

  const handleUnitChange = useCallback((value: string) => {
    setHierarchyFilters({
      unit: value,
      department: "",
      section: "",
      line: "",
    });
  }, []);

  const handleDepartmentChange = useCallback((value: string) => {
    setHierarchyFilters((prev) => ({
      ...prev,
      department: value,
      section: "",
      line: "",
    }));
  }, []);

  const handleSectionChange = useCallback((value: string) => {
    setHierarchyFilters((prev) => ({
      ...prev,
      section: value,
      line: "",
    }));
  }, []);

  const handleLineChange = useCallback((value: string) => {
    setHierarchyFilters((prev) => ({
      ...prev,
      line: value,
    }));
  }, []);

  const handleRefresh = useCallback(() => {
    void fetchHeadcount({ showSpinner: true });
  }, [fetchHeadcount]);

  const handleSearchSubmit = useCallback(() => {
    void fetchHeadcount();
  }, [fetchHeadcount]);

  const handleLaptopActiveChange = useCallback((active: boolean) => {
    setLaptopActive(active);
  }, []);

  return {
    activeSources,
    cams,
    canExport,
    companyId,
    counts,
    dateStr,
    dynamicHeadcountRuns,
    filteredHcRows,
    handleCameraSelect,
    handleDateChange,
    handleDepartmentChange,
    handleExport,
    handleHeadcountTypeChange,
    handleLaptopActiveChange,
    handleLineChange,
    handleRefresh,
    handleRunWindowChange,
    handleSearchChange,
    handleSearchSubmit,
    handleSectionChange,
    handleStatusFilterChange,
    handleUnitChange,
    hcRows,
    headcountType,
    hierarchy,
    hierarchyFilters,
    loading,
    offlineSources,
    otRows,
    runWindowMinutes,
    search,
    selectedCam,
    selectedCamId,
    selectedCameraActive,
    selectedCameraBusy,
    selectedCameraName,
    startCamera,
    statusFilter,
    stopCamera,
    streamType,
    totalSources,
    usingLaptopCamera,
    clearSearch,
    getRemoteStreamUrl,
  };
}
