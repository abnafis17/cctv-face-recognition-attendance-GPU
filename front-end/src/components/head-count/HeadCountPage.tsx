"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import toast from "react-hot-toast";
import { ColumnDef } from "@tanstack/react-table";
import { Search, RefreshCcw, X, Check, Download } from "lucide-react";

import axiosInstance, { API, AI_HOST } from "@/config/axiosInstance";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { useHeadcountEvents } from "@/hooks/useHeadcountEvents";
import { exportJsonToXlsx } from "@/lib/exportXlsx";
import {
  deriveEmployeeHierarchy,
} from "@/lib/employeeHierarchy";

import HeadCountCameraComponent from "./HeadCountCameraComponent";

type CameraOption = {
  id: string;
  name: string;

  // optional but very helpful if your backend returns them
  rtspUrl?: string | null;
  rtspUrlEnc?: string | null;
  relayAgentId?: string | null;
  isActive?: boolean;
};

type HeadcountType = "" | "headcount" | "ot";
type HeadcountStatus = "MATCH" | "UNMATCH" | "ABSENT";
type StatusFilter = "ALL" | HeadcountStatus;
type HierarchyFilters = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

type CrosscheckRow = {
  id: string;
  employeeId: string;
  name: string;
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
  status: HeadcountStatus;
};

type OtRow = {
  id: string;
  employeeId: string;
  name: string;
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
  cameraName?: string | null;
  headcountTime?: string | null;
};

type HeadcountRemoteCameraPreviewProps = {
  camera: CameraOption;
  streamUrl: string;
  busy: boolean;
  onStart: (cameraId: string) => void;
  onStop: (cameraId: string) => void;
  className?: string;
  viewportClassName?: string;
};

const DEFAULT_LAPTOP_CAMERA_ID = "cmkdpsql0000112nsd5gcesq4";

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function safeTimeOnly(ts?: string | number | Date | null) {
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

function maskRtspUrl(url?: string | null): string {
  const raw = String(url ?? "").trim();
  if (!raw) return "-";

  const protocolEnd = raw.indexOf("://");
  const atIndex = raw.indexOf("@");
  if (protocolEnd < 0 || atIndex < 0 || atIndex < protocolEnd) return raw;

  const protocol = raw.slice(0, protocolEnd + 3);
  const host = raw.slice(atIndex + 1);
  return `${protocol}***:***@${host}`;
}

function TableLoading() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
    </div>
  );
}

function HeadcountRemoteCameraPreview({
  camera,
  streamUrl,
  busy,
  onStart,
  onStop,
  className,
  viewportClassName,
}: HeadcountRemoteCameraPreviewProps) {
  const active = Boolean(camera.isActive);
  const [streamHasFrame, setStreamHasFrame] = useState(false);

  useEffect(() => {
    setStreamHasFrame(false);
  }, [active, streamUrl]);

  return (
    <article
      className={cn(
        "rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm transition",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-zinc-900">
            {camera.name}
          </div>
          <div
            className="mt-1 truncate font-mono text-[11px] text-zinc-500"
            title={camera.rtspUrl ?? ""}
          >
            {maskRtspUrl(camera.rtspUrl)}
          </div>
        </div>

        <button
          type="button"
          disabled={busy}
          onClick={() => (active ? onStop(camera.id) : onStart(camera.id))}
          className={cn(
            "rounded-lg border px-3 py-1.5 text-xs font-medium transition disabled:opacity-60",
            active
              ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          )}
        >
          {busy ? "Working..." : active ? "Stop" : "Start"}
        </button>
      </div>

      <div
        className={cn(
          "relative mt-3 overflow-hidden rounded-xl border border-zinc-200",
          streamHasFrame ? "bg-zinc-950" : "bg-zinc-100",
        )}
      >
        <div className={cn("w-full", viewportClassName || "aspect-video")}>
          {active ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={streamUrl}
                alt={`Camera ${camera.name} stream`}
                className={cn(
                  "h-full w-full object-cover transition-opacity duration-200",
                  streamHasFrame ? "opacity-100" : "opacity-0",
                )}
                width={1280}
                height={720}
                onLoad={() => setStreamHasFrame(true)}
                onError={() => setStreamHasFrame(false)}
              />
              {!streamHasFrame ? (
                <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">
                  Loading stream...
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-sm text-zinc-500">
              Camera is offline. Start camera to view recognition stream.
            </div>
          )}
        </div>

        <div className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/70 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-white">
          {active ? "LIVE" : "OFFLINE"}
        </div>

        {streamHasFrame ? (
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_0,rgba(255,255,255,0.05)_50%,transparent_100%)] bg-[length:100%_6px] opacity-20" />
        ) : null}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="truncate rounded-md bg-zinc-100 px-2 py-1 font-mono text-[10px] text-zinc-600">
          {camera.id}
        </span>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-semibold",
            active
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-500",
          )}
        >
          {active ? "ACTIVE" : "OFF"}
        </span>
      </div>
    </article>
  );
}

export default function HeadcountPage() {
  const [companyId, setCompanyId] = useState<string>("");

  const [cams, setCams] = useState<CameraOption[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>("");
  const [actionCamId, setActionCamId] = useState<string | null>(null);
  const [laptopActive, setLaptopActive] = useState(false);

  const [dateStr, setDateStr] = useState<string>(dhakaTodayYYYYMMDD());
  const [headcountType, setHeadcountType] = useState<HeadcountType>("");
  const [hcRows, setHcRows] = useState<CrosscheckRow[]>([]);
  const [otRows, setOtRows] = useState<OtRow[]>([]);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  const [hierarchyFilters, setHierarchyFilters] = useState<HierarchyFilters>({
    unit: "",
    department: "",
    section: "",
    line: "",
  });
  const [filterEmployees, setFilterEmployees] = useState<
    Array<{
      unit?: string | null;
      department?: string | null;
      section?: string | null;
      line?: string | null;
    }>
  >([]);

  const selectedCam = useMemo(
    () => cams.find((c) => c.id === selectedCamId) || null,
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
    (camera: CameraOption) =>
      `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
        camera.id,
      )}/${encodeURIComponent(camera.name)}${streamQuery}`,
    [streamQuery],
  );
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

  useEffect(() => {
    setHcRows([]);
    setOtRows([]);
    setStatusFilter("ALL");
  }, [headcountType]);

  const fetchCameras = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API.HEADCOUNT_CAMERAS);
      const list = (res.data || []) as any[];

      // Works whether API returns only id/name OR returns extra fields too
      setCams(
        list.map((x) => ({
          id: String(x.id),
          name: String(x.name ?? "Camera"),
          rtspUrl: x.rtspUrl ?? x.rtsp_url ?? null,
          rtspUrlEnc: x.rtspUrlEnc ?? x.rtsp_url_enc ?? null,
          relayAgentId: x.relayAgentId ?? x.relay_agent_id ?? null,
          isActive: Boolean(x.isActive),
        })),
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to load cameras");
      setCams([]);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      fetchCameras();
    }, 10000);

    const onFocus = () => fetchCameras();
    const onVisibility = () => {
      if (document.visibilityState === "visible") fetchCameras();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [fetchCameras]);

  useEffect(() => {
    if (!selectedCamId) return;
    if (!cams.some((cam) => cam.id === selectedCamId)) {
      setSelectedCamId("");
    }
  }, [cams, selectedCamId]);

  const fetchFilterEmployees = useCallback(async () => {
    try {
      const res = await axiosInstance.get(API.EMPLOYEE_LIST);
      const list = Array.isArray(res.data) ? res.data : [];
      setFilterEmployees(
        list.map((row: any) => ({
          unit: row?.unit ?? null,
          department: row?.department ?? null,
          section: row?.section ?? null,
          line: row?.line ?? null,
        })),
      );
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to load employee filters");
      setFilterEmployees([]);
    }
  }, []);

  useEffect(() => {
    fetchFilterEmployees();
  }, [fetchFilterEmployees]);

  const hierarchy = useMemo(
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
      } catch (error: any) {
        const msg =
          error?.response?.data?.message ||
          (error instanceof Error ? error.message : `Failed to ${action} camera`);
        toast.error(msg);
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
    async (opts?: { showSpinner?: boolean }) => {
      const showSpinner = opts?.showSpinner ?? false;

      if (!headcountType) {
        setHcRows([]);
        setOtRows([]);
        return;
      }

      if (inflightRef.current) return;
      inflightRef.current = true;

      try {
        if (showSpinner) setLoading(true);

        const params: any = {
          date: dateStr,
          q: debouncedSearch || undefined,
          view: headcountType === "ot" ? "ot" : "headcount",
        };
        if (hierarchyFilters.unit) params.unit = hierarchyFilters.unit;
        if (hierarchyFilters.department)
          params.department = hierarchyFilters.department;
        if (hierarchyFilters.section) params.section = hierarchyFilters.section;
        if (hierarchyFilters.line) params.line = hierarchyFilters.line;

        const res = await axiosInstance.get(API.HEADCOUNT_LIST, {
          params,
        });

        const data = (res.data || []) as any[];

        if (headcountType === "headcount") {
          const normalized: CrosscheckRow[] = data.map((r) => {
            const rawStatus = String(r.status ?? "ABSENT")
              .trim()
              .toUpperCase();
            const status: HeadcountStatus =
              rawStatus === "MATCH"
                ? "MATCH"
                : rawStatus === "UNMATCH"
                  ? "UNMATCH"
                  : "ABSENT";

            return {
              id: String(r.id ?? `${r.employeeId}-${dateStr}`),
              employeeId: String(r.employeeId ?? ""),
              name: String(r.name ?? ""),
              unit: r.unit ?? r.employeeUnit ?? null,
              department:
                r.department ??
                r.employeeDepartment ??
                r.dept ??
                null,
              section: r.section ?? r.employeeSection ?? null,
              line: r.line ?? r.employeeLine ?? null,
              status,
            };
          });

          setOtRows([]);
          setHcRows(normalized);
        } else {
          const normalized: OtRow[] = data.map((r) => ({
            id: String(r.id ?? `${r.employeeId}-${dateStr}`),
            employeeId: String(r.employeeId ?? ""),
            name: String(r.name ?? ""),
            unit: r.unit ?? r.employeeUnit ?? null,
            department: r.department ?? r.employeeDepartment ?? null,
            section: r.section ?? r.employeeSection ?? null,
            line: r.line ?? r.employeeLine ?? null,
            cameraName: r.headcountCameraName ?? r.cameraName ?? null,
            headcountTime:
              r.headcountLastEntryTime ??
              r.headcountTime ??
              r.timestamp ??
              r.lastSeen ??
              null,
          }));

          setHcRows([]);
          setOtRows(normalized);
        }
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to load headcount";
        toast.error(msg);
        setHcRows([]);
        setOtRows([]);
      } finally {
        if (showSpinner) setLoading(false);
        inflightRef.current = false;
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
    ],
  );

  useEffect(() => {
    fetchHeadcount({ showSpinner: true });
  }, [fetchHeadcount]);

  const refreshTimerRef = useRef<number | null>(null);

  const scheduleRefresh = useCallback(() => {
    if (refreshTimerRef.current) return;
    refreshTimerRef.current = window.setTimeout(() => {
      refreshTimerRef.current = null;
      fetchHeadcount();
    }, 400);
  }, [fetchHeadcount]);

  const isToday = dateStr === dhakaTodayYYYYMMDD();

  // Refresh headcount when either headcount scans or attendance marks happen (same day only).
  useHeadcountEvents({
    enabled: isToday && Boolean(headcountType),
    onEvents: () => scheduleRefresh(),
  });
  useAttendanceEvents({
    enabled: isToday && headcountType === "headcount",
    onEvents: () => scheduleRefresh(),
  });

  useEffect(() => {
    return () => {
      if (refreshTimerRef.current) clearTimeout(refreshTimerRef.current);
    };
  }, []);

  const counts = useMemo(() => {
    let match = 0;
    let unmatch = 0;
    let absent = 0;
    for (const r of hcRows) {
      if (r.status === "MATCH") match++;
      else if (r.status === "UNMATCH") unmatch++;
      else absent++;
    }
    return { total: hcRows.length, match, unmatch, absent };
  }, [hcRows]);

  const filteredHcRows = useMemo(() => {
    if (statusFilter === "ALL") return hcRows;
    return hcRows.filter((r) => r.status === statusFilter);
  }, [hcRows, statusFilter]);

  const canExport = useMemo(() => {
    if (loading) return false;
    if (headcountType === "headcount") return filteredHcRows.length > 0;
    if (headcountType === "ot") return otRows.length > 0;
    return false;
  }, [
    filteredHcRows.length,
    headcountType,
    loading,
    otRows.length,
  ]);

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

        const exportRows = filteredHcRows.map((r, idx) => ({
          SL: idx + 1,
          "Employee ID": r.employeeId,
          Name: r.name,
          Unit: r.unit ?? "",
          Department: r.department ?? "",
          Section: r.section ?? "",
          Line: r.line ?? "",
          Status: r.status,
          Date: dateStr,
        }));

        await exportJsonToXlsx({
          data: exportRows,
          sheetName: "Headcount",
          fileName: `headcount_${dateStr}_${filterLabel}_${statusFilter}.xlsx`,
        });
        return;
      }

      const exportRows = otRows.map((r, idx) => ({
        SL: idx + 1,
        "Employee ID": r.employeeId,
        Name: r.name,
        Unit: r.unit ?? "",
        Department: r.department ?? "",
        Section: r.section ?? "",
        Line: r.line ?? "",
        Camera: r.cameraName ?? "",
        "Headcount Time": r.headcountTime ?? "",
        Date: dateStr,
      }));

      await exportJsonToXlsx({
        data: exportRows,
        sheetName: "OT",
        fileName: `ot_headcount_${dateStr}.xlsx`,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to export Excel");
    }
  }, [
    canExport,
    dateStr,
    filteredHcRows,
    headcountType,
    hierarchyFilters.department,
    hierarchyFilters.line,
    hierarchyFilters.section,
    hierarchyFilters.unit,
    otRows,
    statusFilter,
  ]);

  const cellBg = (s: HeadcountStatus) => {
    if (s === "MATCH") return "bg-green-50";
    if (s === "UNMATCH") return "bg-red-50";
    return "bg-yellow-50";
  };

  const headcountColumns: ColumnDef<CrosscheckRow>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">SL</div>
        ),
        cell: (info: any) => (
          <div className="text-center px-1 py-2">{info.row.index + 1}</div>
        ),
        size: 40,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Employee ID
          </div>
        ),
        accessorKey: "employeeId",
        cell: ({ row }) => (
          <div
            className={cn(
              "text-center px-1 py-2 font-medium",
              cellBg(row.original.status),
            )}
          >
            {row.original.employeeId}
          </div>
        ),
        size: 180,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Employee Name
          </div>
        ),
        accessorKey: "name",
        cell: ({ row }) => (
          <div className={cn("text-left px-1 py-2", cellBg(row.original.status))}>
            {row.original.name}
          </div>
        ),
        size: 320,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Unit
          </div>
        ),
        accessorKey: "unit",
        cell: ({ row }) => (
          <div className={cn("text-left px-1 py-2", cellBg(row.original.status))}>
            {row.original.unit || "-"}
          </div>
        ),
        size: 200,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Department
          </div>
        ),
        accessorKey: "department",
        cell: ({ row }) => (
          <div className={cn("text-left px-1 py-2", cellBg(row.original.status))}>
            {row.original.department || "-"}
          </div>
        ),
        size: 220,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Section
          </div>
        ),
        accessorKey: "section",
        cell: ({ row }) => (
          <div className={cn("text-left px-1 py-2", cellBg(row.original.status))}>
            {row.original.section || "-"}
          </div>
        ),
        size: 220,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Line
          </div>
        ),
        accessorKey: "line",
        cell: ({ row }) => (
          <div className={cn("text-left px-1 py-2", cellBg(row.original.status))}>
            {row.original.line || "-"}
          </div>
        ),
        size: 220,
      },
      {
        id: "crossCheckStatus",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Cross Check
          </div>
        ),
        cell: ({ row }) => (
          <div
            className={cn(
              "flex items-center justify-center gap-1 px-1 py-2",
              cellBg(row.original.status),
            )}
          >
            {row.original.status === "MATCH" ? (
              <Check className="h-4 w-4 text-green-600" />
            ) : row.original.status === "UNMATCH" ? (
              <X className="h-4 w-4 text-red-600" />
            ) : (
              <span className="text-xs font-medium text-gray-400">ABSENT</span>
            )}
          </div>
        ),
        size: 150,
      },
    ],
    [],
  );

  const otColumns: ColumnDef<OtRow>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">SL</div>
        ),
        cell: (info: any) => (
          <div className="text-center px-1 py-2">{info.row.index + 1}</div>
        ),
        size: 40,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Employee ID
          </div>
        ),
        accessorKey: "employeeId",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2 font-medium">
            {row.original.employeeId}
          </div>
        ),
        size: 180,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">
            Employee Name
          </div>
        ),
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.name}</div>
        ),
        size: 320,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Unit</div>
        ),
        accessorKey: "unit",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.unit || "-"}</div>
        ),
        size: 200,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Department</div>
        ),
        accessorKey: "department",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">
            {row.original.department || "-"}
          </div>
        ),
        size: 220,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Section</div>
        ),
        accessorKey: "section",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.section || "-"}</div>
        ),
        size: 220,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Line</div>
        ),
        accessorKey: "line",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.line || "-"}</div>
        ),
        size: 220,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Headcount Time
          </div>
        ),
        accessorKey: "headcountTime",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2 text-xs text-gray-600">
            {safeTimeOnly(row.original.headcountTime)}
          </div>
        ),
        size: 160,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">Camera</div>
        ),
        accessorKey: "cameraName",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
            {row.original.cameraName ?? "-"}
          </div>
        ),
        size: 200,
      },
    ],
    [],
  );

  const totalSources = cams.length + 1;
  const activeSources =
    cams.filter((camera) => Boolean(camera.isActive)).length +
    (laptopActive ? 1 : 0);
  const offlineSources = Math.max(totalSources - activeSources, 0);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm backdrop-blur">
        <h1 className="page-title">Headcount Operations</h1>
        <p className="page-subtitle">
          Live headcount capture, camera monitoring, and cross-check reporting.
        </p>
        <p className="page-meta">AI Host: {AI_HOST}</p>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Live Camera + Controls</h2>
            <p className="text-xs text-zinc-500">
              Compact layout with camera on the left and two-row controls on the right.
            </p>
          </div>
          <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700">
            Remote cameras: {cams.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:min-h-[360px] xl:grid-cols-[500px_minmax(0,1fr)]">
          <div className="min-w-0 xl:max-w-[500px]">
            {usingLaptopCamera ? (
              <HeadCountCameraComponent
                userId={companyId ? `laptop-${companyId}` : DEFAULT_LAPTOP_CAMERA_ID}
                companyId={companyId}
                cameraName="Laptop Camera"
                streamType={streamType}
                onActiveChange={setLaptopActive}
                className="mx-auto w-full max-w-[500px]"
                viewportClassName="aspect-video"
              />
            ) : selectedCam ? (
              <HeadcountRemoteCameraPreview
                camera={selectedCam}
                streamUrl={getRemoteStreamUrl(selectedCam)}
                busy={selectedCameraBusy}
                onStart={startCamera}
                onStop={stopCamera}
                className="mx-auto w-full max-w-[500px]"
                viewportClassName="aspect-video"
              />
            ) : null}
          </div>

          <aside className="min-w-0 h-full rounded-2xl border border-zinc-200 bg-zinc-50/60 p-4 flex flex-col">
            <div className="min-h-[96px] rounded-xl border border-zinc-200 bg-white p-4">
              <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:flex-nowrap xl:overflow-x-auto xl:pb-1">
                <div className="shrink-0 text-sm font-semibold text-zinc-900">
                  Camera Source
                </div>

                <div className="min-w-0 xl:w-[320px] xl:flex-none">
                  <label htmlFor="camera-source-select" className="sr-only">
                    Preview source
                  </label>
                  <select
                    id="camera-source-select"
                    value={selectedCamId}
                    onChange={(e) => setSelectedCamId(e.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                  >
                    <option value="">Laptop Camera (WebRTC)</option>
                    {cams.map((camera) => (
                      <option
                        key={camera.id}
                        value={camera.id}
                        disabled={Boolean(camera.isActive) && camera.id !== selectedCamId}
                      >
                        {camera.name}
                        {camera.isActive ? " (Active)" : ""}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex min-w-0 flex-wrap items-center gap-3 xl:flex-1 xl:flex-nowrap">
                  <span className="inline-flex h-10 min-w-[180px] items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700 xl:min-w-0 xl:flex-1">
                    <span className="mr-1 text-zinc-500">Source:</span>
                    <span className="truncate">{selectedCameraName}</span>
                  </span>
                  <span
                    className={cn(
                      "inline-flex h-10 items-center rounded-lg border px-3 text-xs font-semibold",
                      selectedCameraActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-zinc-50 text-zinc-600",
                    )}
                  >
                    View: <span className="ml-1">{selectedCameraActive ? "LIVE" : "OFFLINE"}</span>
                  </span>
                  <span className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
                    Sources: {totalSources}
                  </span>
                  <span className="inline-flex h-10 items-center rounded-lg border border-zinc-200 bg-zinc-50 px-3 text-xs font-semibold text-zinc-700">
                    Active/Off: {activeSources}/{offlineSources}
                  </span>
                </div>
              </div>

              {selectedCam ? (
                <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2">
                  <span className="text-[11px] font-medium text-zinc-500">RTSP: </span>
                  <span
                    className="font-mono text-[11px] text-zinc-700"
                    title={selectedCam.rtspUrl ?? ""}
                  >
                    {maskRtspUrl(selectedCam.rtspUrl)}
                  </span>
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex min-h-[220px] flex-1 flex-col rounded-xl border border-zinc-200 bg-white p-4">
              <div className="text-sm font-semibold text-zinc-900">Headcount Filters</div>
              <div className="mt-3 flex flex-col gap-3 xl:flex-row xl:items-end xl:flex-nowrap xl:overflow-x-auto xl:pb-1">
                <div className="w-full xl:w-[170px] xl:flex-none">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                    Type
                  </label>
                  <select
                    value={headcountType}
                    onChange={(e) => setHeadcountType(e.target.value as HeadcountType)}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                  >
                    <option value="">Select...</option>
                    <option value="headcount">Head count</option>
                    <option value="ot">OT requisition</option>
                  </select>
                </div>

                <div className="w-full xl:w-[190px] xl:flex-none">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                    Date
                  </label>
                  <input
                    type="date"
                    value={dateStr}
                    onChange={(e) => setDateStr(e.target.value)}
                    className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                  />
                </div>

                {hierarchy.availability.hasUnit ? (
                  <div className="w-full xl:w-[190px] xl:flex-none">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                      Unit
                    </label>
                    <select
                      value={hierarchyFilters.unit}
                      onChange={(e) =>
                        setHierarchyFilters({
                          unit: e.target.value,
                          department: "",
                          section: "",
                          line: "",
                        })
                      }
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                    >
                      <option value="">All units</option>
                      {hierarchy.options.units.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {hierarchy.availability.hasDepartment ? (
                  <div className="w-full xl:w-[220px] xl:flex-none">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                      Department
                    </label>
                    <select
                      value={hierarchyFilters.department}
                      onChange={(e) =>
                        setHierarchyFilters((prev) => ({
                          ...prev,
                          department: e.target.value,
                          section: "",
                          line: "",
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                    >
                      <option value="">All departments</option>
                      {hierarchy.options.departments.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {hierarchy.availability.hasSection ? (
                  <div className="w-full xl:w-[220px] xl:flex-none">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                      Section
                    </label>
                    <select
                      value={hierarchyFilters.section}
                      onChange={(e) =>
                        setHierarchyFilters((prev) => ({
                          ...prev,
                          section: e.target.value,
                          line: "",
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                    >
                      <option value="">All sections</option>
                      {hierarchy.options.sections.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {hierarchy.availability.hasLine ? (
                  <div className="w-full xl:w-[190px] xl:flex-none">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                      Line
                    </label>
                    <select
                      value={hierarchyFilters.line}
                      onChange={(e) =>
                        setHierarchyFilters((prev) => ({
                          ...prev,
                          line: e.target.value,
                        }))
                      }
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                    >
                      <option value="">All lines</option>
                      {hierarchy.options.lines.map((v) => (
                        <option key={v} value={v}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : null}

                {headcountType === "headcount" ? (
                  <div className="w-full xl:w-[150px] xl:flex-none">
                    <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                      Status
                    </label>
                    <select
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                      className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                    >
                      <option value="ALL">All</option>
                      <option value="MATCH">MATCH</option>
                      <option value="UNMATCH">UNMATCH</option>
                      <option value="ABSENT">ABSENT</option>
                    </select>
                  </div>
                ) : null}

                <div className="w-full xl:min-w-[260px] xl:flex-1">
                  <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Name or ID"
                      className="h-10 pl-8 pr-8"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") fetchHeadcount();
                      }}
                    />
                    {search ? (
                      <button
                        type="button"
                        onClick={() => setSearch("")}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        title="Clear"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    ) : null}
                  </div>
                </div>

                <button
                  className="h-10 rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center xl:flex-none xl:justify-center"
                  onClick={() => fetchHeadcount({ showSpinner: true })}
                  disabled={loading || !headcountType}
                  type="button"
                  title="Refresh"
                >
                  <RefreshCcw className={cn("mr-2 h-4 w-4", loading && "animate-spin")} />
                  Refresh
                </button>

                <button
                  className="h-10 rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center xl:flex-none xl:justify-center"
                  onClick={handleExport}
                  disabled={!canExport}
                  type="button"
                  title={canExport ? "Export to Excel" : "No data to export"}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </button>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2.5">
                <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                  Date: {dateStr}
                </span>
                {hierarchyFilters.unit ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                    Unit: {hierarchyFilters.unit}
                  </span>
                ) : null}
                {hierarchyFilters.department ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                    Department: {hierarchyFilters.department}
                  </span>
                ) : null}
                {hierarchyFilters.section ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                    Section: {hierarchyFilters.section}
                  </span>
                ) : null}
                {hierarchyFilters.line ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                    Line: {hierarchyFilters.line}
                  </span>
                ) : null}
                {headcountType === "headcount" ? (
                  <>
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                      Total: {counts.total}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
                      MATCH: {counts.match}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800">
                      UNMATCH: {counts.unmatch}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800">
                      ABSENT: {counts.absent}
                    </span>
                  </>
                ) : headcountType === "ot" ? (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
                    Total: {otRows.length}
                  </span>
                ) : null}
              </div>
            </div>
          </aside>
        </div>
      </section>

      {/* Table */}
      {headcountType === "" ? null : (
        <div className="mt-4 rounded-md border bg-white">
          {loading ? (
            <TableLoading />
          ) : headcountType === "headcount" ? (
            <TanstackDataTable data={filteredHcRows} columns={headcountColumns} />
          ) : (
            <TanstackDataTable data={otRows} columns={otColumns} />
          )}
        </div>
      )}

      {!loading && headcountType === "" ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select Head count or OT requisition to show the table
          </p>
        </div>
      ) : null}

      {!loading &&
      headcountType === "headcount" &&
      hcRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No data for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Clear search, change date, or start headcount capture to generate
            headcount events.
          </p>
        </div>
      ) : !loading && headcountType === "ot" && otRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No headcount data for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Start headcount capture to generate headcount events.
          </p>
        </div>
      ) : null}
    </div>
  );
}


