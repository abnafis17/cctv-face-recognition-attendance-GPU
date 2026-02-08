"use client";

import { ColumnDef } from "@tanstack/react-table";
import { SquarePen, Trash } from "lucide-react";
import { CameraRow } from "./types";
import {
  cameraPublicId,
  formatDateTime,
  isVirtualLaptopCamera,
  maskRtspUrl,
} from "./utils";

type BuildCameraColumnsArgs = {
  onEdit: (camera: CameraRow) => void;
  onDelete: (camera: CameraRow) => void;
};

export function buildCameraColumns({
  onEdit,
  onDelete,
}: BuildCameraColumnsArgs): ColumnDef<CameraRow>[] {
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
      accessorKey: "name",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Camera Name</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2">
          <div className="font-medium text-zinc-800">{row.original.name}</div>
          {isVirtualLaptopCamera(row.original) ? (
            <div className="text-[11px] text-amber-700">Default Laptop Camera</div>
          ) : null}
        </div>
      ),
      size: 240,
    },
    {
      id: "publicId",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Camera ID</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-mono text-xs">
          {cameraPublicId(row.original)}
        </div>
      ),
      size: 220,
    },
    {
      accessorKey: "id",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">DB ID</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-mono text-[11px] text-zinc-500">
          {row.original.id}
        </div>
      ),
      size: 260,
    },
    {
      id: "rtspUrl",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">RTSP URL</div>
      ),
      cell: ({ row }) => (
        <div className="max-w-[360px] truncate px-1 py-2 font-mono text-xs" title={row.original.rtspUrl ?? ""}>
          {row.original.rtspUrl ? maskRtspUrl(row.original.rtspUrl) : "-"}
        </div>
      ),
      size: 360,
    },
    {
      id: "streamConfig",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Stream Config</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center text-xs text-zinc-700">
          {row.original.sendFps} FPS | {row.original.sendWidth}x{row.original.sendHeight} | Q{row.original.jpegQuality}
        </div>
      ),
      size: 220,
    },
    {
      id: "relayAgent",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Relay Agent</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-center font-mono text-xs text-zinc-600">
          {row.original.relayAgentId || "-"}
        </div>
      ),
      size: 220,
    },
    {
      id: "status",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Status</div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center px-1 py-2">
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              row.original.isActive
                ? "bg-emerald-100 text-emerald-700"
                : "bg-zinc-100 text-zinc-500"
            }`}
          >
            {row.original.isActive ? "Active" : "Inactive"}
          </span>
        </div>
      ),
      size: 100,
    },
    {
      accessorKey: "createdAt",
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
      accessorKey: "updatedAt",
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
      cell: ({ row }) => {
        const locked = isVirtualLaptopCamera(row.original);
        return (
          <div className="flex items-center justify-center gap-1 px-1 py-2">
            <button
              title={locked ? "Default laptop camera ID is protected" : "Edit"}
              className="cursor-pointer rounded p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onEdit(row.original)}
              disabled={locked}
            >
              <SquarePen className="h-4 w-4 text-blue-700" />
            </button>
            <button
              title={locked ? "Default laptop camera cannot be deleted" : "Delete"}
              className="cursor-pointer rounded p-1 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => onDelete(row.original)}
              disabled={locked}
            >
              <Trash className="h-4 w-4 text-red-600" />
            </button>
          </div>
        );
      },
      size: 100,
    },
  ];
}
