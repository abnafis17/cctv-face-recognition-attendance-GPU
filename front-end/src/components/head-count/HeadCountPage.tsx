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
type GroupBy = "" | "section" | "department" | "line";

type CrosscheckRow = {
  id: string;
  employeeId: string;
  name: string;
  status: HeadcountStatus;
};

type OtRow = {
  id: string;
  employeeId: string;
  name: string;
  cameraName?: string | null;
  headcountTime?: string | null;
};

type HeadcountRemoteCameraCardProps = {
  camera: CameraOption;
  streamUrl: string;
  selected: boolean;
  busy: boolean;
  onSelect: (cameraId: string) => void;
  onStart: (cameraId: string) => void;
  onStop: (cameraId: string) => void;
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

function HeadcountRemoteCameraCard({
  camera,
  streamUrl,
  selected,
  busy,
  onSelect,
  onStart,
  onStop,
}: HeadcountRemoteCameraCardProps) {
  const active = Boolean(camera.isActive);
  const [streamHasFrame, setStreamHasFrame] = useState(false);

  useEffect(() => {
    setStreamHasFrame(false);
  }, [active, streamUrl]);

  return (
    <article
      className={cn(
        "rounded-2xl border bg-white p-3 shadow-sm transition",
        selected
          ? "border-zinc-900 ring-2 ring-zinc-900/10"
          : "border-zinc-200 hover:border-zinc-300",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <button
          type="button"
          className="min-w-0 text-left"
          onClick={() => onSelect(camera.id)}
        >
          <div className="truncate text-sm font-semibold text-zinc-900">
            {camera.name}
          </div>
          <div
            className="mt-1 truncate font-mono text-[11px] text-zinc-500"
            title={camera.rtspUrl ?? ""}
          >
            {maskRtspUrl(camera.rtspUrl)}
          </div>
        </button>

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
        <div className="aspect-video w-full">
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
              Camera OFF
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
        <button
          type="button"
          onClick={() => onSelect(camera.id)}
          className={cn(
            "rounded-lg border px-3 py-1 text-xs font-medium transition",
            selected
              ? "border-zinc-900 bg-zinc-900 text-white"
              : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
          )}
        >
          {selected ? "Selected" : "Select Camera"}
        </button>

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

  const [groupBy, setGroupBy] = useState<GroupBy>("");
  const [groupValue, setGroupValue] = useState<string>("");
  const [groupValues, setGroupValues] = useState<string[]>([]);
  const [groupValuesLoading, setGroupValuesLoading] = useState(false);

  const selectedCam = useMemo(
    () => cams.find((c) => c.id === selectedCamId) || null,
    [cams, selectedCamId],
  );

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

    if (headcountType !== "headcount") {
      setGroupBy("");
      setGroupValue("");
      setGroupValues([]);
    }
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

  const fetchGroupValues = useCallback(async (field: Exclude<GroupBy, "">) => {
    setGroupValuesLoading(true);
    try {
      const res = await axiosInstance.get(API.EMPLOYEE_GROUP_VALUES, {
        params: { field },
      });
      const list = (res?.data?.values || []) as string[];
      setGroupValues(list.map((v) => String(v)).filter(Boolean));
    } catch (e: any) {
      toast.error(e?.response?.data?.error || "Failed to load group values");
      setGroupValues([]);
    } finally {
      setGroupValuesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (headcountType !== "headcount") {
      setGroupValue("");
      setGroupValues([]);
      return;
    }

    if (!groupBy) {
      setGroupValue("");
      setGroupValues([]);
      return;
    }

    setGroupValue("");
    fetchGroupValues(groupBy);
  }, [fetchGroupValues, groupBy, headcountType]);

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

      if (headcountType === "headcount") {
        // Wait until group is selected for headcount view
        if (!groupBy || !groupValue) {
          setHcRows([]);
          return;
        }
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
        if (headcountType === "headcount" && groupBy && groupValue) {
          params.groupBy = groupBy;
          params.groupValue = groupValue;
        }

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
    [dateStr, debouncedSearch, groupBy, groupValue, headcountType],
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
    if (headcountType === "headcount") return Boolean(groupBy && groupValue) && filteredHcRows.length > 0;
    if (headcountType === "ot") return otRows.length > 0;
    return false;
  }, [filteredHcRows.length, groupBy, groupValue, headcountType, loading, otRows.length]);

  const handleExport = useCallback(async () => {
    try {
      if (!canExport) return;

      if (headcountType === "headcount") {
        const exportRows = filteredHcRows.map((r, idx) => ({
          SL: idx + 1,
          "Employee ID": r.employeeId,
          Name: r.name,
          Status: r.status,
          Date: dateStr,
          GroupBy: groupBy || "",
          GroupValue: groupValue || "",
        }));

        await exportJsonToXlsx({
          data: exportRows,
          sheetName: "Headcount",
          fileName: `headcount_${dateStr}_${groupBy || "group"}_${groupValue || "all"}_${statusFilter}.xlsx`,
        });
        return;
      }

      const exportRows = otRows.map((r, idx) => ({
        SL: idx + 1,
        "Employee ID": r.employeeId,
        Name: r.name,
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
    groupBy,
    groupValue,
    headcountType,
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

  const totalScreens = cams.length + 1;
  const activeScreens =
    cams.filter((camera) => Boolean(camera.isActive)).length +
    (laptopActive ? 1 : 0);
  const offlineScreens = Math.max(totalScreens - activeScreens, 0);

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-zinc-200 bg-white/90 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-zinc-900">Headcount Operations</h1>
            <p className="mt-1 text-sm text-zinc-500">
              Live headcount capture, camera monitoring, and cross-check reporting.
            </p>
            <p className="mt-1 text-xs text-zinc-500">AI Host: {AI_HOST}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700">
              Screens: <span className="ml-1 font-semibold text-zinc-900">{totalScreens}</span>
            </span>
            <span className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700">
              Active: <span className="ml-1 font-semibold">{activeScreens}</span>
            </span>
            <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700">
              Offline: <span className="ml-1 font-semibold">{offlineScreens}</span>
            </span>
            {selectedCam ? (
              <span className="inline-flex max-w-[220px] items-center truncate rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700">
                Selected: <span className="ml-1 truncate font-semibold">{selectedCam.name}</span>
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="mb-4 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">Camera Grid</h2>
            <p className="text-xs text-zinc-500">
              Live camera cards with direct start/stop control for headcount capture.
            </p>
          </div>
          <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700">
            Remote cameras: {cams.length}
          </span>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          <HeadCountCameraComponent
            userId={companyId ? `laptop-${companyId}` : DEFAULT_LAPTOP_CAMERA_ID}
            companyId={companyId}
            cameraName="Laptop Camera"
            streamType={streamType}
            onActiveChange={setLaptopActive}
          />

          {cams.map((camera) => (
            <HeadcountRemoteCameraCard
              key={camera.id}
              camera={camera}
              streamUrl={getRemoteStreamUrl(camera)}
              selected={selectedCamId === camera.id}
              busy={actionCamId === camera.id}
              onSelect={setSelectedCamId}
              onStart={startCamera}
              onStop={stopCamera}
            />
          ))}

          {cams.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-zinc-50 p-6 text-center md:col-span-2 xl:col-span-2 2xl:col-span-3">
              <p className="text-sm font-medium text-zinc-700">No remote cameras found</p>
              <p className="mt-1 text-xs text-zinc-500">
                Add cameras in Camera List to start monitoring in this grid.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      {/* Filters + counts */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border bg-gradient-to-r from-gray-50 to-white px-3 py-2">
            <div className="text-xs text-gray-500">Selected Date</div>
            <div className="text-sm font-semibold text-gray-900">{dateStr}</div>
          </div>

          {headcountType === "headcount" && groupBy && groupValue ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
              {groupBy === "section"
                ? "Section"
                : groupBy === "department"
                  ? "Department"
                  : "Line"}
              : {groupValue}
            </span>
          ) : null}

          {headcountType === "headcount" ? (
            <>
              <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
                Total: {counts.total}
              </span>
              <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-2 text-xs font-semibold text-green-800">
                MATCH: {counts.match}
              </span>
              <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-2 text-xs font-semibold text-red-800">
                UNMATCH: {counts.unmatch}
              </span>
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-2 text-xs font-semibold text-yellow-800">
                ABSENT: {counts.absent}
              </span>
            </>
          ) : headcountType === "ot" ? (
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
              Total: {otRows.length}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <label className="text-xs font-medium text-gray-600">Type</label>
            <select
              value={headcountType}
              onChange={(e) => setHeadcountType(e.target.value as HeadcountType)}
              className="text-sm outline-none bg-transparent"
            >
              <option value="">Select...</option>
              <option value="headcount">Head count</option>
              <option value="ot">OT requisition</option>
            </select>
          </div>

          {headcountType === "headcount" ? (
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
              <label className="text-xs font-medium text-gray-600">
                Group by
              </label>
              <select
                value={groupBy}
                onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                className="text-sm outline-none bg-transparent"
              >
                <option value="">Select...</option>
                <option value="section">Section</option>
                <option value="department">Department</option>
                <option value="line">Line</option>
              </select>
            </div>
          ) : null}

          {headcountType === "headcount" && groupBy ? (
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
              <label className="text-xs font-medium text-gray-600">
                {groupBy === "section"
                  ? "Section"
                  : groupBy === "department"
                    ? "Department"
                    : "Line"}
              </label>
              <select
                value={groupValue}
                onChange={(e) => setGroupValue(e.target.value)}
                className="text-sm outline-none bg-transparent"
                disabled={groupValuesLoading}
              >
                <option value="">
                  {groupValuesLoading ? "Loading..." : "Select..."}
                </option>
                {!groupValuesLoading && groupValues.length === 0 ? (
                  <option value="" disabled>
                    No options
                  </option>
                ) : null}
                {groupValues.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {headcountType === "headcount" ? (
            <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
              <label className="text-xs font-medium text-gray-600">Status</label>
              <select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as StatusFilter)
                }
                className="text-sm outline-none bg-transparent"
              >
                <option value="ALL">All</option>
                <option value="MATCH">MATCH</option>
                <option value="UNMATCH">UNMATCH</option>
                <option value="ABSENT">ABSENT</option>
              </select>
            </div>
          ) : null}

          {/* Search */}
          <div className="relative w-[280px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className="h-9 pl-8 pr-8"
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

          {/* Date */}
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <label className="text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="text-sm outline-none bg-transparent"
            />
          </div>

          {/* Camera dropdown */}
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <label className="text-xs font-medium text-gray-600">Camera</label>
            <select
              value={selectedCamId}
              onChange={(e) => setSelectedCamId(e.target.value)}
              className="text-sm outline-none bg-transparent"
            >
              <option value="">Select...</option>
              {cams.map((c) => (
                <option
                  key={c.id}
                  value={c.id}
                  disabled={Boolean(c.isActive) && c.id !== selectedCamId}
                >
                  {c.name}
                  {c.isActive && c.id !== selectedCamId ? " (Active)" : ""}
                </option>
              ))}
            </select>
          </div>

          <button
            className="h-10 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center"
            onClick={() => fetchHeadcount({ showSpinner: true })}
            disabled={loading || !headcountType}
            type="button"
            title="Refresh"
          >
            <RefreshCcw
              className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
            />
            Refresh
          </button>

          <button
            className="h-10 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60 inline-flex items-center"
            onClick={handleExport}
            disabled={!canExport}
            type="button"
            title={canExport ? "Export to Excel" : "No data to export"}
          >
            <Download className="mr-2 h-4 w-4" />
            Export
          </button>
        </div>
      </div>

      {/* Table */}
      {headcountType === "" ? null : headcountType === "headcount" && !groupBy ? null : (
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

      {!loading && !selectedCamId ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select a camera to start headcount capture
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Camera selection is only used for capture/streaming.
          </p>
        </div>
      ) : null}

      {!loading && headcountType === "" ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select Head count or OT requisition to show the table
          </p>
        </div>
      ) : null}

      {!loading && headcountType === "headcount" && !groupBy ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select Section / Department / Line to show the table
          </p>
        </div>
      ) : null}

      {!loading && headcountType === "headcount" && groupBy && !groupValue ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select a{" "}
            {groupBy === "section"
              ? "section"
              : groupBy === "department"
                ? "department"
                : "line"}{" "}
            to load the attendance list
          </p>
          <p className="mt-1 text-xs text-gray-500">
            After selecting, the table will show MATCH/UNMATCH/ABSENT and update
            as headcount events come in.
          </p>
        </div>
      ) : !loading &&
        headcountType === "headcount" &&
        groupBy &&
        groupValue &&
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


