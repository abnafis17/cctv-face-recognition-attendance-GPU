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
          {row.original.destination && (
            <div className="truncate text-xs text-zinc-500">
              Destination: {row.original.destination}
            </div>
          )}
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
      cell: ({ row }) => {
        const pType = row.original.passType ||
          (row.original.typeId === "Long Leave" || row.original.type === "Long Leave" ? "Long Leave" : "short leave");
        const isShort = String(pType).toLowerCase() === "short leave";
        return (
          <div className="flex justify-center px-1 py-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-full font-semibold border-none px-2.5 py-0.5",
                isShort
                  ? "bg-amber-100/70 text-amber-800"
                  : "bg-purple-100/70 text-purple-800"
              )}
            >
              {isShort ? "Short Leave" : "Long Leave"}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      id: "purpose",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Purpose</div>
      ),
      cell: ({ row }) => {
        const pType = row.original.passType ||
          (row.original.typeId === "Long Leave" || row.original.type === "Long Leave" ? "Long Leave" : "short leave");
        const isShort = String(pType).toLowerCase() === "short leave";
        const purposeText = isShort
          ? (row.original.purpose || row.original.type || "N/A")
          : "N/A";
        return (
          <div className="px-1 py-2 text-left text-zinc-700 truncate max-w-[200px]" title={purposeText}>
            {purposeText}
          </div>
        );
      },
      size: 180,
    },
    {
      id: "returnTime",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Approx. Return</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-zinc-700 font-medium">
          {row.original.returnTime ? `${row.original.returnTime} min` : "--"}
        </div>
      ),
      size: 130,
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
      id: "erpStatus",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">ERP Status</div>
      ),
      cell: ({ row }) => {
        const erpStatus = (row.original.erpStatus || "pending").toLowerCase();
        let badgeClass = "border-amber-200 bg-amber-50 text-amber-700";
        if (erpStatus === "approved") {
          badgeClass = "border-emerald-200 bg-emerald-50 text-emerald-700";
        } else if (erpStatus === "rejected") {
          badgeClass = "border-rose-200 bg-rose-50 text-rose-700";
        } else if (erpStatus === "failed") {
          badgeClass = "border-zinc-300 bg-zinc-100 text-zinc-600";
        }

        return (
          <div className="flex justify-center px-1 py-2">
            <Badge variant="outline" className={cn("rounded-full font-semibold px-2 py-0.5", badgeClass)}>
              {erpStatus.toUpperCase()}
            </Badge>
          </div>
        );
      },
      size: 130,
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
