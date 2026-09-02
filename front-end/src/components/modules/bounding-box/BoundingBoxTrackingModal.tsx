"use client";

import { useMemo } from "react";
import { RefreshCw, Rows3 } from "lucide-react";

import Pagination from "@/components/reusable/Pagination";
import ReusableModal from "@/components/reusable/ReusableModal";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Camera } from "@/types";

import { getTrackingColumns } from "./trackingColumns";
import { useCameraBoundingBoxTracking } from "./useCameraBoundingBoxTracking";

type BoundingBoxTrackingModalProps = {
  open: boolean;
  camera: Camera | null;
  onClose: () => void;
};

export default function BoundingBoxTrackingModal({
  open,
  camera,
  onClose,
}: BoundingBoxTrackingModalProps) {
  const tracking = useCameraBoundingBoxTracking({ camera, open });
  const columns = useMemo(
    () => getTrackingColumns(tracking.skip),
    [tracking.skip],
  );

  return (
    <ReusableModal
      open={open}
      onClose={onClose}
      title="Bounding Box Tracking"
      description={camera ? `Camera: ${camera.name}` : ""}
      maxWidth="7xl"
      overflowAuto
      maxHeight="max-h-[92vh]"
    >
      <div className="flex min-h-[620px] flex-col gap-4">
        <div className="flex flex-col gap-3 rounded-xl border border-zinc-100 bg-zinc-50 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Badge
              variant="outline"
              className="rounded-full border-zinc-200 bg-white text-zinc-700"
            >
              <Rows3 className="h-3.5 w-3.5" />
              Total {tracking.records.length}
            </Badge>
            <Badge variant="outline">Boxes: {tracking.boxes.length}</Badge>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={tracking.resetFilters}
            >
              Today
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-white"
              onClick={() => void tracking.fetchRecords()}
              disabled={tracking.loading}
            >
              <RefreshCw
                className={tracking.loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1.25fr)_repeat(3,minmax(150px,1fr))]">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500">
              Search
            </label>
            <Input
              value={tracking.search}
              onChange={(event) => tracking.setSearch(event.target.value)}
              placeholder="Search by employee name or ID"
              className="h-10 rounded-xl border-zinc-100 bg-white"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500">
              From Date
            </label>
            <input
              type="date"
              value={tracking.fromDate}
              onChange={(event) => tracking.setFromDate(event.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-100 bg-white px-3 text-sm text-zinc-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500">
              To Date
            </label>
            <input
              type="date"
              value={tracking.toDate}
              onChange={(event) => tracking.setToDate(event.target.value)}
              className="h-10 w-full rounded-xl border border-zinc-100 bg-white px-3 text-sm text-zinc-900 outline-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-zinc-500">
              Box
            </label>
            <Select
              value={tracking.selectedBoxId || "all"}
              onValueChange={(value) =>
                tracking.setSelectedBoxId(value === "all" ? "" : value)
              }
            >
              <SelectTrigger className="h-10 w-full rounded-xl border-zinc-100 bg-white text-sm text-zinc-900">
                <SelectValue placeholder="All boxes" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="all">All Boxes</SelectItem>
                {tracking.boxes.map((box) => (
                  <SelectItem key={box.id} value={box.id}>
                    {box.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {tracking.error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {tracking.error}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border border-zinc-100 bg-white">
          <TanstackDataTable
            data={tracking.paginatedRecords}
            columns={columns}
            loading={tracking.loading}
            className="h-full min-h-0"
            freezeClassName="h-full min-h-0 max-h-full overflow-x-auto overflow-y-auto [scrollbar-gutter:stable]"
            emptyState="No bounding box tracking records found."
          />
        </div>

        {tracking.records.length ? (
          <div className="shrink-0 border-t border-zinc-100 bg-white pt-3">
            <Pagination
              numberOfData={tracking.records.length}
              limits={tracking.pageLimit}
              getCurrentPage={tracking.setPage}
              activeTab2={tracking.paginationResetKey}
            />
          </div>
        ) : null}
      </div>
    </ReusableModal>
  );
}
