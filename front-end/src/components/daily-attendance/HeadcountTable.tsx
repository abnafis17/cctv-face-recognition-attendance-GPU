"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import toast from "react-hot-toast";
import { ColumnDef } from "@tanstack/react-table";
import axiosInstance, { API } from "@/config/axiosInstance";
import { Card } from "@/components/ui/Card";
import { TanstackDataTable } from "../reusable/TanstackDataTable";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { RefreshCcw, Search, X } from "lucide-react";

export type HeadcountRow = {
  id: string;
  date: string;

  name: string;
  employeeId: string;

  headcountCameraId: string;
  headcountCameraName?: string | null;
  headcountTime?: string | null;
  headcountConfidence?: number | null;

  previousCameraName?: string | null;
  previousTime?: string | null;

  status: "MATCH" | "UNMATCH" | "ABSENT";
};

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

function StatusPill({ v }: { v: HeadcountRow["status"] }) {
  const cls =
    v === "MATCH"
      ? "bg-green-100 text-green-700"
      : v === "UNMATCH"
        ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
        cls,
      )}
    >
      {v}
    </span>
  );
}

export default function HeadcountTable({
  cameraId,
  dateStr,
  onCounts,
}: {
  cameraId: string;
  dateStr: string;
  onCounts?: (c: {
    match: number;
    unmatch: number;
    absent: number;
    total: number;
  }) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<HeadcountRow[]>([]);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [includeAbsent, setIncludeAbsent] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const inflight = useRef(false);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchHeadcount = async () => {
    if (!cameraId) return;
    if (inflight.current) return;

    inflight.current = true;
    try {
      setLoading(true);
      const res = await axiosInstance.get(`${API.HEADCOUNT_LIST}`, {
        params: {
          date: dateStr,
          cameraId,
          q: debouncedSearch || undefined,
          includeAbsent: includeAbsent ? 1 : 0,
        },
      });

      if (res?.status === 200) {
        const data = (res.data || []) as HeadcountRow[];
        setRows(data);

        const counts = data.reduce(
          (acc, r) => {
            acc.total += 1;
            if (r.status === "MATCH") acc.match += 1;
            else if (r.status === "UNMATCH") acc.unmatch += 1;
            else acc.absent += 1;
            return acc;
          },
          { match: 0, unmatch: 0, absent: 0, total: 0 },
        );

        onCounts?.(counts);
      } else {
        setRows([]);
        onCounts?.({ match: 0, unmatch: 0, absent: 0, total: 0 });
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        error?.response?.data?.detail ||
        "Failed to load headcount";
      toast.error(msg);
      setRows([]);
      onCounts?.({ match: 0, unmatch: 0, absent: 0, total: 0 });
    } finally {
      setLoading(false);
      inflight.current = false;
    }
  };

  // load on inputs change
  useEffect(() => {
    fetchHeadcount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameraId, dateStr, debouncedSearch, includeAbsent]);

  // auto refresh polling (table updates as attendance is recorded)
  useEffect(() => {
    if (!autoRefresh) return;
    const t = setInterval(() => {
      fetchHeadcount();
    }, 2000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRefresh, cameraId, dateStr, debouncedSearch, includeAbsent]);

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
        accessorKey: "employeeId",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Employee ID
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-center px-1 py-2 font-medium">
            {row.original.employeeId}
          </div>
        ),
        size: 160,
      },
      {
        accessorKey: "name",
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Name</div>
        ),
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.name}</div>
        ),
        size: 260,
      },
      {
        accessorKey: "status",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">Status</div>
        ),
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
            <StatusPill v={row.original.status} />
          </div>
        ),
        size: 120,
      },
      {
        accessorKey: "headcountTime",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Headcount Time
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-center px-1 py-2 text-xs text-gray-600">
            {safeDateTime(row.original.headcountTime)}
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: "previousTime",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Previous Attendance
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-center px-1 py-2 text-xs text-gray-600">
            {safeDateTime(row.original.previousTime)}
          </div>
        ),
        size: 200,
      },
      {
        accessorKey: "previousCameraName",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Previous Camera
          </div>
        ),
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
            {row.original.previousCameraName ?? "—"}
          </div>
        ),
        size: 160,
      },
    ],
    [],
  );

  return (
    <Card title="Headcount" className="p-4">
      {/* Filters */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
            Total: {rows.length}
          </span>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={includeAbsent}
              onChange={(e) => setIncludeAbsent(e.target.checked)}
            />
            Include ABSENT (based on previous attendance)
          </label>

          <label className="inline-flex items-center gap-2 text-xs text-gray-700">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto refresh (2s)
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[280px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID."
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

          <button
            className="h-10 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center"
            onClick={fetchHeadcount}
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
        <TanstackDataTable data={rows} columns={columns} />
      </div>

      {!loading && rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">No headcount data</p>
          <p className="mt-1 text-xs text-gray-500">
            Ensure attendance is being recorded for this camera and date.
          </p>
        </div>
      ) : null}
    </Card>
  );
}
