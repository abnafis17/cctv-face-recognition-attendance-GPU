import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

import type { GatepassRecord, GatepassStatus } from "@/types/gatepass-types";

function statusLabel(status: GatepassStatus) {
  return status === "returned" ? "Returned" : "Out";
}

export function getHistoryColumns(
  historySkip: number,
): ColumnDef<GatepassRecord>[] {
  return [
    {
      id: "sl",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">SL</div>
      ),
      cell: (info) => (
        <div className="px-1 py-2 text-center text-zinc-500">
          {historySkip + info.row.index + 1}
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
          <div className="truncate text-xs text-zinc-500">
            {row.original.note}
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
      size: 120,
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
      size: 160,
    },
    {
      id: "outDate",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Date</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-zinc-700">
          {row.original.outDate}
        </div>
      ),
      size: 120,
    },
    {
      id: "type",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Leave Type</div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center px-1 py-2">
          <Badge
            variant="outline"
            className="rounded-full border-zinc-200 bg-zinc-50 text-zinc-700"
          >
            {row.original.type}
          </Badge>
        </div>
      ),
      size: 120,
    },
    {
      id: "outTime",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Out Time</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {row.original.outTime}
        </div>
      ),
      size: 110,
    },
    {
      id: "inTime",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">In Time</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {row.original.inTime}
        </div>
      ),
      size: 110,
    },
    {
      id: "status",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Status</div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center px-1 py-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full",
              row.original.status === "returned"
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700",
            )}
          >
            {statusLabel(row.original.status)}
          </Badge>
        </div>
      ),
      size: 120,
    },
    {
      id: "requestedAt",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">
          Requested At
        </div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-medium text-zinc-900">
          {row.original.requestedAt}
        </div>
      ),
      size: 130,
    },
  ];
}
