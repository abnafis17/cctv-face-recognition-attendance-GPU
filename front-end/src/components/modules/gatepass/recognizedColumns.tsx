import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

import type {
  GatepassStatus,
  GatepassRecord,
  RecognizedGatepassRow,
} from "@/types/gatepass-types";

function statusLabel(status: GatepassStatus) {
  return status === "returned" ? "Returned" : "Out";
}

function formatRecognizedAt(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  return formatter.format(value);
}

function formatRecognitionAsOutTime(value: Date) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Dhaka",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  return formatter.format(value);
}

function getDisplayRecord(record: GatepassRecord | null) {
  if (!record) return null;
  if (record.status === "returned") return null;
  if (String(record.inTime ?? "").trim() !== "--") return null;
  return record;
}

export const getRecognizedColumns = (
  onRemove: (key: string) => void,
): ColumnDef<RecognizedGatepassRow>[] => [
  {
    id: "sl",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">SL</div>
    ),
    cell: (info) => (
      <div className="px-1 py-2 text-center text-zinc-500">
        {info.row.index + 1}
      </div>
    ),
    size: 56,
  },
  {
    id: "employeeName",
    header: () => (
      <div className="w-full px-1 py-2 text-left font-bold">Name</div>
    ),
    cell: ({ row }) => (
      <div className="px-1 py-2">
        <div className="truncate font-medium text-zinc-900">
          {row.original.employee.name}
        </div>
      </div>
    ),
    size: 260,
  },
  {
    id: "employeeCode",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">ID</div>
    ),
    cell: ({ row }) => (
      <div className="px-1 py-2 text-center text-zinc-700">
        {row.original.employee.employeeCode}
      </div>
    ),
    size: 130,
  },
  {
    id: "department",
    header: () => (
      <div className="w-full px-1 py-2 text-left font-bold">Department</div>
    ),
    cell: ({ row }) => (
      <div className="px-1 py-2 text-zinc-700">
        {row.original.employee.department}
      </div>
    ),
    size: 170,
  },
  {
    id: "section",
    header: () => (
      <div className="w-full px-1 py-2 text-left font-bold">Section</div>
    ),
    cell: ({ row }) => (
      <div className="px-1 py-2 text-zinc-700">
        {row.original.employee.section || "N/A"}
      </div>
    ),
    size: 170,
  },
  {
    id: "outTime",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">Out Time</div>
    ),
    cell: ({ row }) => {
      const displayRecord = getDisplayRecord(row.original.latestRecord);
      return (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {displayRecord?.outTime ||
             formatRecognitionAsOutTime(row.original.recognizedAt)}
        </div>
      );
    },
    size: 120,
  },
  {
    id: "inTime",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">In Time</div>
    ),
    cell: ({ row }) => {
      const displayRecord = getDisplayRecord(row.original.latestRecord);
      return (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {displayRecord?.inTime || "--"}
        </div>
      );
    },
    size: 120,
  },
  {
    id: "status",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">Status</div>
    ),
    cell: ({ row }) => {
      const displayRecord = getDisplayRecord(row.original.latestRecord);
      return (
        <div className="flex justify-center px-1 py-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full",
              displayRecord?.status === "returned"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : displayRecord?.status === "out"
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600",
            )}
          >
            {displayRecord ? statusLabel(displayRecord.status) : "No Record"}
          </Badge>
        </div>
      );
    },
    size: 130,
  },
  {
    id: "recognizedAt",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">Recognized</div>
    ),
    cell: ({ row }) => (
      <div className="px-1 py-2 text-center font-medium text-zinc-900">
        {formatRecognizedAt(row.original.recognizedAt)}
      </div>
    ),
    size: 130,
  },
  {
    id: "action",
    header: () => (
      <div className="w-full px-1 py-2 text-center font-bold">Action</div>
    ),
    cell: ({ row }) => (
      <div className="flex justify-center px-1 py-2">
        <Button
          variant="ghost"
          size="icon-sm"
          className="h-8 w-8 text-zinc-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
          onClick={() => onRemove(row.original.key)}
          title="Remove"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    ),
    size: 80,
  },
];
