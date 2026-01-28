"use client";

import React, { useEffect, useMemo, useState } from "react";
import { ColumnDef } from "@tanstack/react-table";
import toast from "react-hot-toast";
import axiosInstance, { API } from "@/config/axiosInstance";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { TanstackDataTable } from "../reusable/TanstackDataTable";
import { Input } from "@/components/ui/input";
import { RefreshCcw, Search, X } from "lucide-react";

type DailyAttendanceRow = {
  id: string;

  // existing attendance-like fields
  name: string;
  employeeId: string;
  cameraName?: string | null;
  confidence?: number | null;
  timestamp?: string | null; // last event timestamp

  // new daily summary fields
  firstEntryTime?: string | null;
  lastEntryTime?: string | null;

  date: string; // YYYY-MM-DD (Dhaka day)
};

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

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
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

const DailyAttendanceTable = () => {
  const [skip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<DailyAttendanceRow[]>([]);
  const [dateStr, setDateStr] = useState<string>(dhakaTodayYYYYMMDD());

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchDaily = async () => {
    try {
      setLoading(true);

      const res = await axiosInstance.get(`${API.DAILY_ATTENDANCE_LIST}`, {
        params: { date: dateStr, q: debouncedSearch || undefined },
      });

      if (res?.status === 200) {
        setRows((res.data || []) as DailyAttendanceRow[]);
      } else {
        setRows([]);
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.message ||
        error?.response?.data?.error ||
        "Failed to load daily attendance";
      toast.error(msg);
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDaily();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateStr, debouncedSearch]);

  const columns: ColumnDef<DailyAttendanceRow>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">SL</div>
        ),
        cell: (info: any) => (
          <div className="text-center px-1 py-2">
            {info.row.index + 1 + (skip || 0)}
          </div>
        ),
        size: 20,
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
        size: 160,
      },
      {
        header: () => (
          <div className="text-left font-bold w-full px-1 py-2">Name</div>
        ),
        accessorKey: "name",
        cell: ({ row }) => (
          <div className="text-left px-1 py-2">{row.original.name}</div>
        ),
        size: 260,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">Camera</div>
        ),
        accessorKey: "cameraName",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
            {row.original.cameraName ?? "N/A"}
          </div>
        ),
        size: 160,
      },
      //   {
      //     header: () => (
      //       <div className="text-center font-bold w-full px-1 py-2">
      //         Confidence
      //       </div>
      //     ),
      //     accessorKey: "confidence",
      //     cell: ({ row }) => {
      //       const conf =
      //         typeof row.original.confidence === "number"
      //           ? row.original.confidence
      //           : null;
      //       return (
      //         <div className="text-center px-1 py-2">
      //           {conf !== null ? conf.toFixed(3) : "N/A"}
      //         </div>
      //       );
      //     },
      //     size: 120,
      //   },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            First Entry
          </div>
        ),
        accessorKey: "firstEntryTime",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
            {safeTimeOnly(row.original.firstEntryTime)}
          </div>
        ),
        size: 140,
      },
      {
        header: () => (
          <div className="text-center font-bold w-full px-1 py-2">
            Last Entry
          </div>
        ),
        accessorKey: "lastEntryTime",
        cell: ({ row }) => (
          <div className="text-center px-1 py-2">
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
          <div className="text-center px-1 py-2 text-xs text-gray-600">
            {safeDateTime(row.original.timestamp)}
          </div>
        ),
        size: 200,
      },
    ],
    [skip],
  );

  return (
    <Card title="Daily Attendance" className="p-4">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="rounded-xl border bg-gradient-to-r from-gray-50 to-white px-3 py-2">
            <div className="text-xs text-gray-500">Selected Date</div>
            <div className="text-sm font-semibold text-gray-900">{dateStr}</div>
          </div>

          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-2 text-xs font-semibold text-gray-700">
            Total: {rows.length}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-[280px]">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />

            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or ID..."
              className="h-9 pl-8 pr-8"
              onKeyDown={(e) => {
                if (e.key === "Enter") fetchDaily(); // immediate
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

          {/* Date filter (native, bug-free) */}
          <div className="flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
            <label className="text-xs font-medium text-gray-600">Date</label>
            <input
              type="date"
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="text-sm outline-none bg-transparent"
            />
          </div>

          <button
            className="h-10 rounded-xl border bg-white px-4 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
            onClick={() => setDateStr(dhakaTodayYYYYMMDD())}
            disabled={loading}
            type="button"
          >
            Today
          </button>

          <button
            className="h-10 rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60 inline-flex items-center"
            onClick={fetchDaily}
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

      {/* Empty state */}
      {!loading && rows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No daily attendance for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Try a different date, or verify that recognition events exist for
            this company.
          </p>
        </div>
      ) : null}
    </Card>
  );
};

export default DailyAttendanceTable;
