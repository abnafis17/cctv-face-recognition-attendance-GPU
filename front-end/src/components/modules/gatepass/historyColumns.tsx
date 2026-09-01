import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Eye } from "lucide-react";

import type { GatepassRecord, GatepassStatus } from "@/types/gatepass-types";

function statusLabel(status: GatepassStatus) {
  return status === "returned" ? "Returned" : "Out";
}

function extractDhakaDatePart(isoString: string): string {
  try {
    const parsed = new Date(isoString);
    if (isNaN(parsed.getTime())) return "";
    
    const dhakaTime = new Date(parsed.getTime() + 6 * 60 * 60 * 1000);
    const day = String(dhakaTime.getUTCDate()).padStart(2, "0");
    const month = String(dhakaTime.getUTCMonth() + 1).padStart(2, "0");
    const year = dhakaTime.getUTCFullYear();
    return `${day}/${month}/${year}`;
  } catch {
    return "";
  }
}

export function getHistoryColumns(
  historySkip: number,
  onViewReport?: (record: GatepassRecord) => void,
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
      cell: ({ row }) => {
        const rec = row.original;
        const outDateStr = rec.rawOutTime ? extractDhakaDatePart(rec.rawOutTime) : "";
        const inDateStr = rec.rawInTime ? extractDhakaDatePart(rec.rawInTime) : "";
        const dateChanged = outDateStr && inDateStr && outDateStr !== inDateStr;

        return (
          <div className="flex flex-col items-center justify-center px-1 py-1 font-medium">
            <span className="text-zinc-900">{rec.inTime}</span>
            {dateChanged && (
              <span className="text-[10px] text-zinc-400 font-normal mt-0.5 whitespace-nowrap">
                {inDateStr}
              </span>
            )}
          </div>
        );
      },
      size: 110,
    },
    {
      id: "duration",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Duration</div>
      ),
      cell: ({ row }) => {
        const rec = row.original;
        if (rec.status !== "returned" || !rec.rawOutTime || !rec.rawInTime) {
          return (
            <div className="px-1 py-2 text-center text-zinc-400 font-medium">
              --
            </div>
          );
        }

        const outDate = new Date(rec.rawOutTime);
        const inDate = new Date(rec.rawInTime);
        if (isNaN(outDate.getTime()) || isNaN(inDate.getTime())) {
          return (
            <div className="px-1 py-2 text-center text-zinc-400 font-medium">
              --
            </div>
          );
        }

        const diffMs = inDate.getTime() - outDate.getTime();
        if (diffMs <= 0) {
          return (
            <div className="px-1 py-2 text-center font-medium text-zinc-900">
              0 min
            </div>
          );
        }

        const diffMins = Math.round(diffMs / (1000 * 60));
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;

        let displayVal = "";
        if (hours > 0) {
          displayVal = `${hours} hr ${mins} min`;
        } else {
          displayVal = `${diffMins} min`;
        }

        const overtimeMins = rec.returnTime && diffMins > rec.returnTime ? diffMins - rec.returnTime : 0;
        let displayOvertime = "";
        if (overtimeMins > 0) {
          const otHours = Math.floor(overtimeMins / 60);
          const otMins = overtimeMins % 60;
          if (otHours > 0) {
            displayOvertime = `+${otHours} hr ${otMins} min`;
          } else {
            displayOvertime = `+${overtimeMins} min`;
          }
        }

        return (
          <div className="flex flex-col items-center justify-center px-1 py-1">
            <span className="font-medium text-zinc-900">{displayVal}</span>
            {overtimeMins > 0 && (
              <span className="text-[10px] text-red-500 font-bold mt-1 bg-rose-50 border border-rose-100 rounded-full px-2 py-0.5 whitespace-nowrap">
                {displayOvertime} Overtime
              </span>
            )}
          </div>
        );
      },
      size: 110,
    },
    {
      id: "status",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Status</div>
      ),
      cell: ({ row }) => {
        const rec = row.original;
        return (
          <div className="flex justify-center px-1 py-2">
            <Badge
              variant="outline"
              className={cn(
                "rounded-full bg-white font-semibold px-2.5 py-0.5 shadow-sm",
                rec.status === "returned"
                  ? "border-emerald-200 text-emerald-700"
                  : "border-rose-200 text-rose-700"
              )}
            >
              {rec.status === "returned" ? "Returned" : "Out"}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      id: "erpStatus",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">ERP Status</div>
      ),
      cell: ({ row }) => {
        const rec = row.original;
        const erpStatus = (rec.erpStatus || "pending").toLowerCase();
        let badgeClass = "border-amber-200 bg-amber-50 text-amber-700";
        if (erpStatus === "approved") {
          badgeClass = "border-emerald-200 bg-emerald-50 text-emerald-700";
        } else if (erpStatus === "rejected") {
          badgeClass = "border-rose-200 bg-rose-50 text-rose-700";
        } else if (erpStatus === "failed") {
          badgeClass = "border-zinc-300 bg-zinc-100 text-zinc-600";
        }

        return (
          <div className="flex flex-col items-center justify-center px-1 py-2 gap-0.5">
            <Badge variant="outline" className={cn("rounded-full font-semibold px-2 py-0.5", badgeClass)}>
              {erpStatus.toUpperCase()}
            </Badge>
            {erpStatus === "pending" && (rec.approvedByName || rec.approvedByDesignation) && (
              <div className="flex flex-col items-center text-center leading-normal mt-1">
                <span className="text-[9px] uppercase font-bold text-zinc-400 tracking-wider whitespace-nowrap">
                  Submitted To
                </span>
                {rec.approvedByName && (
                  <span className="text-xs font-semibold text-zinc-700 mt-0.5 whitespace-nowrap">
                    {rec.approvedByName}
                  </span>
                )}
                {rec.approvedByDesignation && (
                  <span className="text-[10px] text-zinc-500 font-medium whitespace-nowrap">
                    {rec.approvedByDesignation}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      },
      size: 180,
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
    {
      id: "action",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Action</div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center px-1 py-2">
          <button
            onClick={() => onViewReport?.(row.original)}
            className="p-1.5 rounded-lg text-zinc-500 hover:text-indigo-600 hover:bg-zinc-100 transition-all cursor-pointer"
            title="View Gatepass Report"
          >
            <Eye className="w-4 h-4" />
          </button>
        </div>
      ),
      size: 80,
    },
  ];
}
