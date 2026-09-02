"use client";

import { memo } from "react";
import { Download, RefreshCcw, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { HEADCOUNT_RUN_WINDOW_OPTIONS } from "@/components/modules/head-count/headcount-utils";
import { cn } from "@/lib/utils";
import type {
  HeadcountCounts,
  HeadcountHierarchyFilters,
  HeadcountHierarchyResult,
  HeadcountStatusFilter,
  HeadcountType,
} from "@/types/headcount-types";

type HeadcountFiltersPanelProps = {
  canExport: boolean;
  counts: HeadcountCounts;
  dateStr: string;
  dynamicHeadcountRunCount: number;
  headcountType: HeadcountType;
  hierarchy: HeadcountHierarchyResult;
  hierarchyFilters: HeadcountHierarchyFilters;
  loading: boolean;
  onDateChange: (value: string) => void;
  onDepartmentChange: (value: string) => void;
  onExport: () => void;
  onHeadcountTypeChange: (value: HeadcountType) => void;
  onLineChange: (value: string) => void;
  onRefresh: () => void;
  onRunWindowChange: (value: number) => void;
  onSearchChange: (value: string) => void;
  onSearchSubmit: () => void;
  onSectionChange: (value: string) => void;
  onStatusFilterChange: (value: HeadcountStatusFilter) => void;
  onUnitChange: (value: string) => void;
  otRowsLength: number;
  runWindowMinutes: number;
  search: string;
  statusFilter: HeadcountStatusFilter;
  clearSearch: () => void;
};

const HeadcountFiltersPanel = memo(function HeadcountFiltersPanel({
  canExport,
  counts,
  dateStr,
  dynamicHeadcountRunCount,
  headcountType,
  hierarchy,
  hierarchyFilters,
  loading,
  onDateChange,
  onDepartmentChange,
  onExport,
  onHeadcountTypeChange,
  onLineChange,
  onRefresh,
  onRunWindowChange,
  onSearchChange,
  onSearchSubmit,
  onSectionChange,
  onStatusFilterChange,
  onUnitChange,
  otRowsLength,
  runWindowMinutes,
  search,
  statusFilter,
  clearSearch,
}: HeadcountFiltersPanelProps) {
  return (
    <div className="mt-2.5 flex min-h-[220px] flex-1 flex-col rounded-xl bg-white p-3 shadow-sm">
      <div className="text-sm font-semibold text-zinc-900">
        Headcount Filters
      </div>

      <div className="mt-2.5 space-y-2.5">
        <div className="rounded-lg bg-zinc-50/80 px-3 py-2.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Primary Filters
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                Type
              </label>
              <select
                value={headcountType}
                onChange={(event) =>
                  onHeadcountTypeChange(event.target.value as HeadcountType)
                }
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
              >
                <option value="">Select...</option>
                <option value="headcount">Head count</option>
                <option value="ot">OT requisition</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                Date
              </label>
              <input
                type="date"
                value={dateStr}
                onChange={(event) => onDateChange(event.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
              />
            </div>

            {headcountType === "headcount" ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Status
                </label>
                <select
                  value={statusFilter}
                  onChange={(event) =>
                    onStatusFilterChange(
                      event.target.value as HeadcountStatusFilter,
                    )
                  }
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  <option value="ALL">All</option>
                  <option value="MATCH">MATCH</option>
                  <option value="UNMATCH">UNMATCH</option>
                  <option value="ABSENT">ABSENT</option>
                </select>
              </div>
            ) : null}

            {headcountType === "headcount" ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  New Column Every
                </label>
                <select
                  value={runWindowMinutes}
                  onChange={(event) =>
                    onRunWindowChange(Number(event.target.value))
                  }
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-gradient-to-r from-white to-zinc-50 px-3 text-sm font-medium text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  {HEADCOUNT_RUN_WINDOW_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-50/80 px-3 py-2.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Hierarchy Filters
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            {hierarchy.availability.hasUnit ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Unit
                </label>
                <select
                  value={hierarchyFilters.unit}
                  onChange={(event) => onUnitChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  <option value="">All units</option>
                  {hierarchy.options.units.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchy.availability.hasDepartment ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Department
                </label>
                <select
                  value={hierarchyFilters.department}
                  onChange={(event) => onDepartmentChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  <option value="">All departments</option>
                  {hierarchy.options.departments.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchy.availability.hasSection ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Section
                </label>
                <select
                  value={hierarchyFilters.section}
                  onChange={(event) => onSectionChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  <option value="">All sections</option>
                  {hierarchy.options.sections.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchy.availability.hasLine ? (
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Line
                </label>
                <select
                  value={hierarchyFilters.line}
                  onChange={(event) => onLineChange(event.target.value)}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
                >
                  <option value="">All lines</option>
                  {hierarchy.options.lines.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-lg bg-zinc-50/80 px-3 py-2.5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-zinc-500">
            Search & Actions
          </div>

          <div className="grid grid-cols-1 gap-2.5 xl:grid-cols-[minmax(0,1fr)_auto_auto] xl:items-end">
            <div>
              <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(event) => onSearchChange(event.target.value)}
                  placeholder="Name or ID"
                  className="h-10 pl-8 pr-8"
                  onKeyDown={(event) => {
                    if (event.key === "Enter") onSearchSubmit();
                  }}
                />
                {search ? (
                  <button
                    type="button"
                    onClick={clearSearch}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    title="Clear"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
            </div>

            <button
              className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              onClick={onRefresh}
              disabled={loading || !headcountType}
              type="button"
              title="Refresh"
            >
              <RefreshCcw
                className={cn("mr-2 h-4 w-4", loading && "animate-spin")}
              />
              Refresh
            </button>

            <button
              className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-lg border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={onExport}
              disabled={!canExport}
              type="button"
              title={canExport ? "Export to Excel" : "No data to export"}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
          Date: {dateStr}
        </span>
        {hierarchyFilters.unit ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Unit: {hierarchyFilters.unit}
          </span>
        ) : null}
        {hierarchyFilters.department ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Department: {hierarchyFilters.department}
          </span>
        ) : null}
        {hierarchyFilters.section ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Section: {hierarchyFilters.section}
          </span>
        ) : null}
        {hierarchyFilters.line ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Line: {hierarchyFilters.line}
          </span>
        ) : null}
        {headcountType === "headcount" ? (
          <>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
              Total: {counts.total}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
              Runs: {dynamicHeadcountRunCount}
            </span>
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700">
              Column window: {runWindowMinutes} min
            </span>
            <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1.5 text-xs font-semibold text-green-800">
              MATCH: {counts.match}
            </span>
            <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1.5 text-xs font-semibold text-red-800">
              UNMATCH: {counts.unmatch}
            </span>
            <span className="inline-flex items-center rounded-full bg-yellow-100 px-3 py-1.5 text-xs font-semibold text-yellow-800">
              ABSENT: {counts.absent}
            </span>
          </>
        ) : headcountType === "ot" ? (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-3 py-1.5 text-xs font-semibold text-gray-700">
            Total: {otRowsLength}
          </span>
        ) : null}
      </div>
    </div>
  );
});

HeadcountFiltersPanel.displayName = "HeadcountFiltersPanel";

export default HeadcountFiltersPanel;
