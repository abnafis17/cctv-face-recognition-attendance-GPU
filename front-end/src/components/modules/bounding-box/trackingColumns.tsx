import type { ColumnDef } from "@tanstack/react-table";

import type { CameraBoundingBoxTrackingRecord } from "./types";

function getDateParts(value: unknown) {
  const normalized = String(value ?? "").trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)/,
  );
  if (!match) return null;

  return {
    year: match[1],
    month: match[2],
    day: match[3],
    hour: match[4],
    minute: match[5],
    second: match[6] ?? "00",
  };
}

function formatDateTime(value: unknown) {
  const parts = getDateParts(value);
  if (!parts) return "--";
  const hour24 = Number(parts.hour);
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  const hour = String(hour12).padStart(2, "0");
  return `${parts.day}/${parts.month}/${parts.year} ${hour}:${parts.minute}:${parts.second} ${suffix}`;
}

function timestampToMs(value: unknown) {
  const parts = getDateParts(value);
  if (!parts) return null;

  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

function formatDuration(totalSeconds: number | null | undefined) {
  if (typeof totalSeconds !== "number" || !Number.isFinite(totalSeconds)) {
    return "--";
  }

  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = seconds % 60;

  return [hours, minutes, remainingSeconds]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
}

function getOutsideDurationSeconds(row: CameraBoundingBoxTrackingRecord) {
  if (
    typeof row.durationSeconds === "number" &&
    Number.isFinite(row.durationSeconds) &&
    row.durationSeconds > 0
  ) {
    return row.durationSeconds;
  }

  if (!row.inTime) return row.durationSeconds;

  const outMs = timestampToMs(row.outTime);
  const inMs = timestampToMs(row.inTime);
  if (outMs === null || inMs === null) return row.durationSeconds;

  return Math.max(0, Math.floor((inMs - outMs) / 1000));
}

export function getTrackingColumns(
  skip: number,
): ColumnDef<CameraBoundingBoxTrackingRecord>[] {
  return [
    {
      id: "sl",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">SL</div>
      ),
      cell: (info) => (
        <div className="px-1 py-2 text-center text-zinc-500">
          {skip + info.row.index + 1}
        </div>
      ),
      size: 56,
    },
    {
      id: "employeeId",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">
          Employee ID
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {row.original.employeeId}
        </div>
      ),
      size: 140,
    },
    {
      id: "employeeName",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">
          Employee Name
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2">
          <div className="truncate font-medium text-zinc-900">
            {row.original.employeeName}
          </div>
          <div className="truncate text-xs text-zinc-500">
            {row.original.boundingBoxName}
          </div>
        </div>
      ),
      size: 260,
    },
    {
      id: "outTime",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Out-Time</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-zinc-700">
          {formatDateTime(row.original.outTime)}
        </div>
      ),
      size: 190,
    },
    {
      id: "inTime",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">In-Time</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-zinc-700">
          {row.original.inTime ? formatDateTime(row.original.inTime) : "--"}
        </div>
      ),
      size: 190,
    },
    {
      id: "durationSeconds",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">
          Total Outside
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-semibold text-zinc-900">
          {formatDuration(getOutsideDurationSeconds(row.original))}
        </div>
      ),
      size: 150,
    },
  ];
}
