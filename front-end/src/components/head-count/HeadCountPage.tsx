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
import { Search, RefreshCcw, X } from "lucide-react";

import axiosInstance, { API, AI_HOST } from "@/config/axiosInstance";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useAttendanceEvents } from "@/hooks/useAttendanceEvents";
import { useHeadcountEvents } from "@/hooks/useHeadcountEvents";
import Image from "next/image";

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

type HeadcountStatus = "MATCH" | "UNMATCH" | "MISSING" | "ABSENT";

type HeadcountRow = {
  id: string;
  employeeId: string;
  name: string;
  status: HeadcountStatus;
  cameraName?: string | null;

  prevFirstEntryTime?: string | null;
  prevLastEntryTime?: string | null;

  firstEntryTime?: string | null;
  lastEntryTime?: string | null;
  timestamp?: string | null;
};

const DEFAULT_LAPTOP_CAMERA_ID = "cmkdpsql0000112nsd5gcesq4";

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function safeTimeOnly(ts?: string | number | Date | null) {
  try {
    if (!ts) return "—";
    return new Date(ts).toLocaleTimeString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour12: false,
    });
  } catch {
    return "—";
  }
}

function safeDateTime(ts?: string | number | Date | null) {
  try {
    if (!ts) return "—";
    return new Date(ts).toLocaleString("en-GB", {
      timeZone: "Asia/Dhaka",
      hour12: false,
    });
  } catch {
    return "—";
  }
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

export default function HeadcountPage() {
  const [companyId, setCompanyId] = useState<string>("");

  const [cams, setCams] = useState<CameraOption[]>([]);
  const [selectedCamId, setSelectedCamId] = useState<string>("");

  const [dateStr, setDateStr] = useState<string>(dhakaTodayYYYYMMDD());
  const [rows, setRows] = useState<HeadcountRow[]>([]);
  const [loading, setLoading] = useState(false);
  const inflightRef = useRef(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<HeadcountStatus | "">("");

  const selectedCam = useMemo(
    () => cams.find((c) => c.id === selectedCamId) || null,
    [cams, selectedCamId],
  );

  const remoteStreamUrl = useMemo(() => {
    if (!selectedCam) return "";
    const params = new URLSearchParams();
    params.set("type", "headcount");
    if (companyId) params.set("companyId", companyId);
    const query = params.toString();
    return `${AI_HOST}/camera/recognition/stream/${encodeURIComponent(
      selectedCam.id,
    )}/${encodeURIComponent(selectedCam.name)}${query ? `?${query}` : ""}`;
  }, [selectedCam, companyId]);

  const selectedCamIsActive = Boolean(selectedCam?.isActive);


  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    setCompanyId(getCompanyIdFromToken() || "");
  }, []);

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

  const [cameraActionLoading, setCameraActionLoading] = useState(false);

  const startSelectedCamera = useCallback(async () => {
    if (!selectedCamId) return;
    setCameraActionLoading(true);
    try {
      await axiosInstance.post(`/cameras/start/${selectedCamId}`);
      await fetchCameras();
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        (error instanceof Error ? error.message : "Failed to start camera");
      toast.error(msg);
    } finally {
      setCameraActionLoading(false);
    }
  }, [fetchCameras, selectedCamId]);

  const stopSelectedCamera = useCallback(async () => {
    if (!selectedCamId) return;
    setCameraActionLoading(true);
    try {
      await axiosInstance.post(`/cameras/stop/${selectedCamId}`);
      await fetchCameras();
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        (error instanceof Error ? error.message : "Failed to stop camera");
      toast.error(msg);
    } finally {
      setCameraActionLoading(false);
    }
  }, [fetchCameras, selectedCamId]);

  const handleCameraSelect = useCallback((newId: string) => {
    setSelectedCamId(newId);
  }, []);

  const fetchHeadcount = useCallback(
    async (opts?: { showSpinner?: boolean }) => {
      if (inflightRef.current) return;
      inflightRef.current = true;
      const showSpinner = opts?.showSpinner ?? false;

      try {
        if (showSpinner) setLoading(true);

        const res = await axiosInstance.get(API.HEADCOUNT_LIST, {
          params: {
            date: dateStr,
            q: debouncedSearch || undefined,
            status: statusFilter || undefined,
          },
        });

        const data = (res.data || []) as any[];

        const normalized: HeadcountRow[] = data.map((r) => ({
          id: String(r.id ?? `${r.employeeId}-${dateStr}`),
          employeeId: String(r.employeeId ?? ""),
          name: String(r.name ?? ""),
          status: (r.status ?? "ABSENT") as HeadcountStatus,
          cameraName:
            r.headcountCameraName ?? r.cameraName ?? null,

          prevFirstEntryTime:
            r.prevFirstEntryTime ??
            r.prevFirst ??
            r.previousFirstEntryTime ??
            null,
          prevLastEntryTime:
            r.prevLastEntryTime ??
            r.prevLast ??
            r.previousLastEntryTime ??
            null,

          firstEntryTime:
            r.firstEntryTime ??
            r.hcFirst ??
            r.headcountFirstSeen ??
            r.headcountFirstEntryTime ??
            r.headcountTime ??
            null,
          lastEntryTime:
            r.lastEntryTime ??
            r.hcLast ??
            r.headcountLastSeen ??
            r.headcountLastEntryTime ??
            r.headcountTime ??
            null,
          timestamp: r.timestamp ?? r.lastSeen ?? null,
        }));

        setRows(normalized);
      } catch (e: any) {
        const msg =
          e?.response?.data?.message ||
          e?.response?.data?.error ||
          "Failed to load headcount";
        toast.error(msg);
        setRows([]);
      } finally {
        if (showSpinner) setLoading(false);
        inflightRef.current = false;
      }
    },
    [dateStr, debouncedSearch, statusFilter],
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
    enabled: isToday,
    onEvents: () => scheduleRefresh(),
  });
  useAttendanceEvents({
    enabled: isToday,
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
    let missing = 0;
    let absent = 0;
    for (const r of rows) {
      if (r.status === "MATCH") match++;
      else if (r.status === "UNMATCH") unmatch++;
      else if (r.status === "MISSING") missing++;
      else absent++;
    }
    return { total: rows.length, match, unmatch, missing, absent };
  }, [rows]);

  const statusPill = (s: HeadcountStatus) => {
    if (s === "MATCH") return "bg-green-100 text-green-800";
    if (s === "UNMATCH") return "bg-red-100 text-red-800";
    if (s === "MISSING") return "bg-orange-100 text-orange-800";
    return "bg-yellow-100 text-yellow-800";
  };

  const cellBg = (s: HeadcountStatus) => {
    if (s === "MATCH") return "bg-green-50";
    if (s === "UNMATCH") return "bg-red-50";
    if (s === "MISSING") return "bg-orange-50";
    return "bg-yellow-50";
  };

  const columns: ColumnDef<HeadcountRow>[] = useMemo(
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
        size: 160,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Name</div>
        ),
        accessorKey: "name",
        cell: ({ row }) => (
          <div
            className={cn("text-left px-1 py-2", cellBg(row.original.status))}
          >
            {row.original.name}
          </div>
        ),
        size: 260,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">Status</div>
        ),
        accessorKey: "status",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                statusPill(row.original.status),
              )}
            >
              {row.original.status}
            </span>
          </div>
        ),
        size: 120,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">Camera</div>
        ),
        accessorKey: "cameraName",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            {row.original.cameraName ?? "N/A"}
          </div>
        ),
        size: 160,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Prev First
          </div>
        ),
        accessorKey: "prevFirstEntryTime",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            {safeTimeOnly(row.original.prevFirstEntryTime)}
          </div>
        ),
        size: 140,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Prev Last
          </div>
        ),
        accessorKey: "prevLastEntryTime",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            {safeTimeOnly(row.original.prevLastEntryTime)}
          </div>
        ),
        size: 140,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">HC First</div>
        ),
        accessorKey: "firstEntryTime",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            {safeTimeOnly(row.original.firstEntryTime)}
          </div>
        ),
        size: 140,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">HC Last</div>
        ),
        accessorKey: "lastEntryTime",
        cell: ({ row }) => (
          <div
            className={cn("text-center px-1 py-2", cellBg(row.original.status))}
          >
            {safeTimeOnly(row.original.lastEntryTime)}
          </div>
        ),
        size: 140,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Last Seen (DateTime)
          </div>
        ),
        accessorKey: "timestamp",
        cell: ({ row }) => (
          <div
            className={cn(
              "text-center px-1 py-2 text-xs text-gray-600",
              cellBg(row.original.status),
            )}
          >
            {safeDateTime(row.original.timestamp)}
          </div>
        ),
        size: 200,
      },
    ],
    [],
  );

  return (
    <Card title="Headcount" className="p-4">
      {/* Two-grid layout always: Laptop + Selected DB Camera */}
      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <HeadCountCameraComponent
          userId={companyId ? `laptop-${companyId}` : DEFAULT_LAPTOP_CAMERA_ID}
          companyId={companyId}
          cameraName="Laptop Camera"
        />

        {selectedCam ? (
          <div className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-semibold">{selectedCam.name}</div>
                {selectedCam.rtspUrl ? (
                  <div className="mt-1 break-all text-xs text-gray-400">
                    {selectedCam.rtspUrl}
                  </div>
                ) : null}
              </div>
              <span
                className={cn(
                  "text-xs px-2 py-0.5 rounded-full",
                  selectedCamIsActive
                    ? "bg-green-100 text-green-700"
                    : "bg-gray-100 text-gray-500",
                )}
              >
                {selectedCamIsActive ? "ACTIVE" : "OFF"}
              </span>
            </div>

            <div className="mt-3 overflow-hidden rounded-lg border bg-gray-100">
              {selectedCamIsActive && remoteStreamUrl ? (
                <div className="aspect-video w-full">
                  <Image
                    src={remoteStreamUrl}
                    alt={`Camera ${selectedCam.name} stream`}
                    className="h-full w-full object-cover"
                    width={1280}
                    height={720}
                    unoptimized
                  />
                </div>
              ) : (
                <div className="aspect-video flex items-center justify-center text-sm text-gray-600">
                  Camera OFF
                </div>
              )}
            </div>

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  selectedCamIsActive ? stopSelectedCamera : startSelectedCamera
                }
                className={cn(
                  "rounded-md border px-3 py-1 text-xs font-semibold transition",
                  selectedCamIsActive
                    ? "border-red-300 bg-red-50 text-red-600"
                    : "border-green-300 bg-green-50 text-green-700",
                )}
                disabled={!selectedCamId || cameraActionLoading}
              >
                {selectedCamIsActive ? "Stop Camera" : "Start Camera"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center flex items-center justify-center">
            <div>
              <p className="text-sm font-medium text-gray-700">
                Select a camera from dropdown
              </p>
              <p className="mt-1 text-xs text-gray-500">
                Start a camera to view its recognition stream here.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Filters + counts */}
      <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border bg-gradient-to-r from-gray-50 to-white px-3 py-2">
            <div className="text-xs text-gray-500">Selected Date</div>
            <div className="text-sm font-semibold text-gray-900">{dateStr}</div>
          </div>

          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
            Total: {counts.total}
          </span>
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-2 text-xs font-semibold text-green-800">
            MATCH: {counts.match}
          </span>
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-2 text-xs font-semibold text-red-800">
            UNMATCH: {counts.unmatch}
          </span>
          <span className="inline-flex items-center rounded-full bg-orange-100 px-3 py-2 text-xs font-semibold text-orange-800">
            MISSING: {counts.missing}
          </span>
          <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-2 text-xs font-semibold text-yellow-800">
            ABSENT: {counts.absent}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
              onChange={(e) => handleCameraSelect(e.target.value)}
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

          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <label className="text-xs font-medium text-gray-600">Status</label>
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(
                  e.target.value
                    ? (e.target.value as HeadcountStatus)
                    : "",
                )
              }
              className="text-sm outline-none bg-transparent"
            >
              <option value="">All</option>
              <option value="MATCH">MATCH</option>
              <option value="UNMATCH">UNMATCH</option>
              <option value="MISSING">MISSING</option>
              <option value="ABSENT">ABSENT</option>
            </select>
          </div>

          <button
            className="h-10 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center"
            onClick={() => fetchHeadcount({ showSpinner: true })}
            disabled={loading}
            type="button"
            title="Refresh"
          >
            <RefreshCcw
              className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="mt-4 rounded-md border bg-white">
        {loading ? (
          <TableLoading />
        ) : (
          <TanstackDataTable data={rows} columns={columns} />
        )}
      </div>

      {!loading && !selectedCamId ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            Select a camera to start headcount capture
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Camera selection is only used for capture/streaming (table is
            company-wide for the selected date).
          </p>
        </div>
      ) : null}

      {!loading && rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No headcount data for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Clear search, change date, or start headcount capture to generate
            headcount events.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
