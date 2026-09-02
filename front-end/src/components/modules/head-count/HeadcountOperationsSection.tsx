"use client";

import { memo } from "react";
import HeadcountCameraPreview from "@/components/modules/head-count/HeadcountCameraPreview";
import HeadcountFiltersPanel from "@/components/modules/head-count/HeadcountFiltersPanel";
import HeadcountSourcePanel from "@/components/modules/head-count/HeadcountSourcePanel";
import { DEFAULT_LAPTOP_CAMERA_ID } from "@/components/modules/head-count/headcount-utils";
import type {
  HeadcountCameraOption,
  HeadcountCounts,
  HeadcountHierarchyFilters,
  HeadcountHierarchyResult,
  HeadcountOtRow,
  HeadcountStatusFilter,
  HeadcountType,
} from "@/types/headcount-types";

type HeadcountOperationsSectionProps = {
  activeSources: number;
  cams: HeadcountCameraOption[];
  canExport: boolean;
  companyId: string;
  counts: HeadcountCounts;
  dateStr: string;
  dynamicHeadcountRunCount: number;
  getRemoteStreamUrl: (camera: HeadcountCameraOption) => string;
  headcountType: HeadcountType;
  hierarchy: HeadcountHierarchyResult;
  hierarchyFilters: HeadcountHierarchyFilters;
  loading: boolean;
  offlineSources: number;
  onCameraSelect: (cameraId: string) => void;
  onDateChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onExport: () => void;
  onHeadcountTypeChange: (value: HeadcountType) => void;
  onLaptopActiveChange: (active: boolean) => void;
  onLineChange: (value: string) => void;
  onRefresh: () => void;
  onRunWindowChange: (value: number) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSectionChange: (value: string) => void;
  onStartCamera: (cameraId: string) => void;
  onStatusFilterChange: (value: HeadcountStatusFilter) => void;
  onStopCamera: (cameraId: string) => void;
  onUnitChange: (value: string) => void;
  otRows: HeadcountOtRow[];
  runWindowMinutes: number;
  search: string;
  selectedCam: HeadcountCameraOption | null;
  selectedCamId: string;
  selectedCameraActive: boolean;
  selectedCameraBusy: boolean;
  selectedCameraName: string;
  statusFilter: HeadcountStatusFilter;
  streamType: string;
  totalSources: number;
  usingLaptopCamera: boolean;
  clearSearch: () => void;
};

const HeadcountOperationsSection = memo(function HeadcountOperationsSection({
  activeSources,
  cams,
  canExport,
  companyId,
  counts,
  dateStr,
  dynamicHeadcountRunCount,
  getRemoteStreamUrl,
  headcountType,
  hierarchy,
  hierarchyFilters,
  loading,
  offlineSources,
  onCameraSelect,
  onDateChange,
  onDepartmentChange,
  onExport,
  onHeadcountTypeChange,
  onLaptopActiveChange,
  onLineChange,
  onRefresh,
  onRunWindowChange,
  onSearchChange,
  onSearchSubmit,
  onSectionChange,
  onStartCamera,
  onStatusFilterChange,
  onStopCamera,
  onUnitChange,
  otRows,
  runWindowMinutes,
  search,
  selectedCam,
  selectedCamId,
  selectedCameraActive,
  selectedCameraBusy,
  selectedCameraName,
  statusFilter,
  streamType,
  totalSources,
  usingLaptopCamera,
  clearSearch,
}: HeadcountOperationsSectionProps) {
  const laptopCameraId = companyId
    ? `laptop-${companyId}`
    : DEFAULT_LAPTOP_CAMERA_ID;

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-3 shadow-sm">
      <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-zinc-900">
            Live Camera + Controls
          </h2>
          <p className="text-xs text-zinc-500">
            Compact layout with camera on the left and two-row controls on the
            right.
          </p>
        </div>

        <span className="inline-flex items-center rounded-lg border border-zinc-200 bg-zinc-100 px-3 py-2 text-xs font-medium text-zinc-700">
          Remote cameras: {cams.length}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:min-h-[360px] xl:grid-cols-[500px_minmax(0,1fr)] xl:items-stretch">
        <div className="min-w-0 xl:flex xl:h-full xl:max-w-[500px]">
          <HeadcountCameraPreview
            companyId={companyId}
            getRemoteStreamUrl={getRemoteStreamUrl}
            laptopCameraId={laptopCameraId}
            onLaptopActiveChange={onLaptopActiveChange}
            onStartCamera={onStartCamera}
            onStopCamera={onStopCamera}
            selectedCam={selectedCam}
            selectedCameraBusy={selectedCameraBusy}
            streamType={streamType}
            usingLaptopCamera={usingLaptopCamera}
          />
        </div>

        <aside className="flex h-full min-w-0 flex-col rounded-2xl bg-zinc-50/40 p-3">
          <HeadcountSourcePanel
            activeSources={activeSources}
            cams={cams}
            offlineSources={offlineSources}
            onCameraSelect={onCameraSelect}
            selectedCam={selectedCam}
            selectedCamId={selectedCamId}
            selectedCameraActive={selectedCameraActive}
            selectedCameraName={selectedCameraName}
            totalSources={totalSources}
          />

          <HeadcountFiltersPanel
            canExport={canExport}
            counts={counts}
            dateStr={dateStr}
            dynamicHeadcountRunCount={dynamicHeadcountRunCount}
            headcountType={headcountType}
            hierarchy={hierarchy}
            hierarchyFilters={hierarchyFilters}
            loading={loading}
            onDateChange={onDateChange}
            onDepartmentChange={onDepartmentChange}
            onExport={onExport}
            onHeadcountTypeChange={onHeadcountTypeChange}
            onLineChange={onLineChange}
            onRefresh={onRefresh}
            onRunWindowChange={onRunWindowChange}
            onSearchChange={onSearchChange}
            onSearchSubmit={onSearchSubmit}
            onSectionChange={onSectionChange}
            onStatusFilterChange={onStatusFilterChange}
            onUnitChange={onUnitChange}
            otRowsLength={otRows.length}
            runWindowMinutes={runWindowMinutes}
            search={search}
            statusFilter={statusFilter}
            clearSearch={clearSearch}
          />
        </aside>
      </div>
    </section>
  );
});

HeadcountOperationsSection.displayName = "HeadcountOperationsSection";

export default HeadcountOperationsSection;
