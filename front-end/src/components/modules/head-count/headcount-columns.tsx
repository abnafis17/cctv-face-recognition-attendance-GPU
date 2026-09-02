import type { ColumnDef } from "@tanstack/react-table";
import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  HeadcountCrosscheckRow,
  HeadcountDynamicRun,
  HeadcountOtRow,
  HeadcountStatus,
} from "@/types/headcount-types";
import {
  safeTimeOnly,
  safeTimeRange,
} from "@/components/modules/head-count/headcount-utils";

function getCellBg(status: HeadcountStatus) {
  if (status === "MATCH") return "bg-green-50";
  if (status === "UNMATCH") return "bg-red-50";
  return "bg-yellow-50";
}

function renderRunStatus(status: HeadcountStatus) {
  if (status === "MATCH") {
    return <Check className="h-4 w-4 text-green-600" />;
  }
  if (status === "UNMATCH") {
    return <X className="h-4 w-4 text-red-600" />;
  }
  return <span className="text-xs font-medium text-gray-400">ABSENT</span>;
}

export function createHeadcountColumns(
  dynamicHeadcountRuns: HeadcountDynamicRun[],
): ColumnDef<HeadcountCrosscheckRow>[] {
  const baseColumns: ColumnDef<HeadcountCrosscheckRow>[] = [
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
            getCellBg(row.original.status),
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
        <div
          className={cn("text-left px-1 py-2", getCellBg(row.original.status))}
        >
          {row.original.name}
        </div>
      ),
      size: 320,
    },
    {
      header: () => (
        <div className="text-left font-bold w-full px-1 py-2">Unit</div>
      ),
      accessorKey: "unit",
      cell: ({ row }) => (
        <div
          className={cn("text-left px-1 py-2", getCellBg(row.original.status))}
        >
          {row.original.unit || "-"}
        </div>
      ),
      size: 200,
    },
    {
      header: () => (
        <div className="text-left font-bold w-full px-1 py-2">Department</div>
      ),
      accessorKey: "department",
      cell: ({ row }) => (
        <div
          className={cn("text-left px-1 py-2", getCellBg(row.original.status))}
        >
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
        <div
          className={cn("text-left px-1 py-2", getCellBg(row.original.status))}
        >
          {row.original.section || "-"}
        </div>
      ),
      size: 220,
    },
    {
      header: () => (
        <div className="text-left font-bold w-full px-1 py-2">Line</div>
      ),
      accessorKey: "line",
      cell: ({ row }) => (
        <div
          className={cn("text-left px-1 py-2", getCellBg(row.original.status))}
        >
          {row.original.line || "-"}
        </div>
      ),
      size: 220,
    },
    {
      id: "crossCheckStatus",
      header: () => (
        <div className="text-center font-bold w-full px-1 py-2">Overall</div>
      ),
      cell: ({ row }) => (
        <div
          className={cn(
            "flex items-center justify-center gap-1 px-1 py-2",
            getCellBg(row.original.status),
          )}
        >
          {renderRunStatus(row.original.status)}
        </div>
      ),
      size: 150,
    },
  ];

  const runColumns: ColumnDef<HeadcountCrosscheckRow>[] =
    dynamicHeadcountRuns.map((run) => ({
      id: `headcount-run-${run.runKey}`,
      header: () => (
        <div className="w-full px-1 py-2 text-center">
          <div className="font-bold">Headcount {run.runIndex}</div>
          <div className="text-[10px] font-medium text-zinc-500">
            {safeTimeRange(run.runStartTime, run.runEndTime)}
          </div>
        </div>
      ),
      cell: ({ row }) => {
        const runResult = row.original.headcountRuns.find(
          (value) => value.runKey === run.runKey,
        );
        const runStatus: HeadcountStatus = runResult?.status ?? "ABSENT";

        return (
          <div className={cn("px-1 py-2", getCellBg(runStatus))}>
            <div className="flex items-center justify-center gap-1">
              {renderRunStatus(runStatus)}
            </div>
            <div className="mt-0.5 text-center text-[10px] text-zinc-500">
              {safeTimeOnly(runResult?.headcountTime)}
            </div>
          </div>
        );
      },
      size: 190,
    }));

  return [...baseColumns, ...runColumns];
}

export const otColumns: ColumnDef<HeadcountOtRow>[] = [
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
      <div className="text-center font-bold w-full px-1 py-2">Employee ID</div>
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
      <div className="text-left font-bold w-full px-1 py-2">Employee Name</div>
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
];
