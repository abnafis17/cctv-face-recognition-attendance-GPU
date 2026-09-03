"use client";

import React from "react";
import type { HierarchyFilters } from "./useEmployeeTableState";

type EmployeeHierarchyFiltersProps = {
  hierarchyFilters: HierarchyFilters;
  setHierarchyFilters: React.Dispatch<React.SetStateAction<HierarchyFilters>>;
  hierarchy: any;
  filteredCount: number;
  totalCount: number;
};

export function EmployeeHierarchyFilters({
  hierarchyFilters,
  setHierarchyFilters,
  hierarchy,
  filteredCount,
  totalCount,
}: EmployeeHierarchyFiltersProps) {
  const hasActiveFilter = Boolean(hierarchyFilters.unit || hierarchyFilters.department || hierarchyFilters.section || hierarchyFilters.line);

  return (
    <div className="flex flex-col gap-3 bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
      <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-4 gap-3">
        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-600">Unit</label>
          <select
            value={hierarchyFilters.unit}
            onChange={(e) => setHierarchyFilters({ unit: e.target.value, department: "", section: "", line: "" })}
            disabled={!hierarchy.availability.hasUnit}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-zinc-100"
          >
            <option value="">All units</option>
            {hierarchy.options.units.map((val: string) => <option key={val} value={val}>{val}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-600">Department</label>
          <select
            value={hierarchyFilters.department}
            onChange={(e) => setHierarchyFilters((prev) => ({ ...prev, department: e.target.value, section: "", line: "" }))}
            disabled={!hierarchy.availability.hasDepartment}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-zinc-100"
          >
            <option value="">All departments</option>
            {hierarchy.options.departments.map((val: string) => <option key={val} value={val}>{val}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-600">Section</label>
          <select
            value={hierarchyFilters.section}
            onChange={(e) => setHierarchyFilters((prev) => ({ ...prev, section: e.target.value, line: "" }))}
            disabled={!hierarchy.availability.hasSection}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-zinc-100"
          >
            <option value="">All sections</option>
            {hierarchy.options.sections.map((val: string) => <option key={val} value={val}>{val}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-medium text-zinc-600">Line</label>
          <select
            value={hierarchyFilters.line}
            onChange={(e) => setHierarchyFilters((prev) => ({ ...prev, line: e.target.value }))}
            disabled={!hierarchy.availability.hasLine}
            className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-3 text-xs text-zinc-900 outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-zinc-100"
          >
            <option value="">All lines</option>
            {hierarchy.options.lines.map((val: string) => <option key={val} value={val}>{val}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100">
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
          Total Employees: {filteredCount}
        </span>
        <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1 text-xs font-semibold text-zinc-700">
          All Data: {totalCount}
        </span>
        {hasActiveFilter && (
          <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700">
            Filtered View
          </span>
        )}
      </div>
    </div>
  );
}
