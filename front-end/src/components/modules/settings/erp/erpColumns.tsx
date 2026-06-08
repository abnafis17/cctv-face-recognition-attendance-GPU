"use client";

import { ColumnDef } from "@tanstack/react-table";
import { SquarePen, Trash } from "lucide-react";
import type { ErpApiRow } from "../types";
import { formatDateTime } from "../utils";

type BuildErpColumnsArgs = {
  onEdit: (row: ErpApiRow) => void;
  onDelete: (row: ErpApiRow) => void;
};

function displayValue(value: string | null): string {
  return value && value.trim() ? value : "-";
}

export function buildErpColumns({
  onEdit,
  onDelete,
}: BuildErpColumnsArgs): ColumnDef<ErpApiRow>[] {
  return [
    {
      id: "sl",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">SL</div>
      ),
      cell: (info) => (
        <div className="px-1 py-2 text-center">{info.row.index + 1}</div>
      ),
      size: 40,
    },
    {
      id: "urlType",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">URL Type</div>
      ),
      cell: ({ row }) => (
        <div
          className="max-w-36 truncate px-1 py-2 text-xs font-medium uppercase text-zinc-700"
          title={row.original.urlType ?? ""}
        >
          {displayValue(row.original.urlType)}
        </div>
      ),
      size: 120,
    },
    {
      id: "erpBaseUrl",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">ERP Base URL</div>
      ),
      cell: ({ row }) => (
        <div
          className="max-w-115 truncate px-1 py-2 font-mono text-xs"
          title={row.original.erpBaseUrl ?? ""}
        >
          {displayValue(row.original.erpBaseUrl)}
        </div>
      ),
      size: 460,
    },
    {
      id: "erpPrefix",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">ERP Prefix</div>
      ),
      cell: ({ row }) => (
        <div
          className="max-w-115 truncate px-1 py-2 font-mono text-xs"
          title={row.original.erpPrefix ?? ""}
        >
          {displayValue(row.original.erpPrefix)}
        </div>
      ),
      size: 460,
    },
    {
      id: "erpAttendanceEndpoint",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">
          ERP Endpoint
        </div>
      ),
      cell: ({ row }) => (
        <div
          className="max-w-115 truncate px-1 py-2 font-mono text-xs"
          title={row.original.erpAttendanceEndpoint ?? ""}
        >
          {displayValue(row.original.erpAttendanceEndpoint)}
        </div>
      ),
      size: 460,
    },
    {
      id: "createdAt",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Created</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-xs text-zinc-600">
          {formatDateTime(row.original.createdAt)}
        </div>
      ),
      size: 170,
    },
    {
      id: "updatedAt",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Updated</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-xs text-zinc-600">
          {formatDateTime(row.original.updatedAt)}
        </div>
      ),
      size: 170,
    },
    {
      id: "actions",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Actions</div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1 px-1 py-2">
          <button
            title="Edit"
            className="cursor-pointer rounded p-1 hover:bg-gray-200"
            onClick={() => onEdit(row.original)}
          >
            <SquarePen className="h-4 w-4 text-blue-700" />
          </button>
          <button
            title="Delete"
            className="cursor-pointer rounded p-1 hover:bg-gray-200"
            onClick={() => onDelete(row.original)}
          >
            <Trash className="h-4 w-4 text-red-600" />
          </button>
        </div>
      ),
      size: 100,
    },
  ];
}
