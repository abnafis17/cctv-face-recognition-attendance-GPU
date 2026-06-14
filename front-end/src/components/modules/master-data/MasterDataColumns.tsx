"use client";

import { ColumnDef } from "@tanstack/react-table";
import { SquarePen, Trash } from "lucide-react";

type BuildMasterDataColumnsArgs = {
  onEdit: (row: any) => void;
  onDelete: (row: any) => void;
  startIndex: number;
};

export function buildMasterDataColumns({
  onEdit,
  onDelete,
  startIndex,
}: BuildMasterDataColumnsArgs): ColumnDef<any>[] {
  return [
    {
      id: "sl",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">SL</div>
      ),
      cell: (info) => (
        <div className="px-1 py-2 text-center">{startIndex + info.row.index + 1}</div>
      ),
      size: 60,
    },
    {
      id: "name",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Name</div>
      ),
      cell: ({ row }) => (
        <div
          className="max-w-96 truncate px-1 py-2 text-sm font-medium text-zinc-800"
          title={row.original.name ?? ""}
        >
          {row.original.name ?? "-"}
        </div>
      ),
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
