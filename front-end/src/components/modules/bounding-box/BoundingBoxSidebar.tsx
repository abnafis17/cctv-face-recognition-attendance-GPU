"use client";

import { useEffect, useMemo, useState } from "react";
import { FilterX, Plus, Search, Trash2, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { deriveEmployeeHierarchy } from "@/lib/employeeHierarchy";
import { cn } from "@/lib/utils";

import {
  boxColorForIndex,
  formatEmployeeLabel,
  searchMatchesEmployee,
  sortDistinctIds,
} from "./boundingBoxUtils";
import type { BoundingBoxEmployeeOption, EditableBoundingBox } from "./types";

type HierarchyFilters = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

type BoundingBoxSidebarProps = {
  boxes: EditableBoundingBox[];
  employees: BoundingBoxEmployeeOption[];
  selectedBoxId: string | null;
  onSelectBox: (boxId: string) => void;
  onAddBox: () => void;
  onDeleteBox: (boxId: string) => void;
  onUpdateBoxName: (boxId: string, name: string) => void;
  onUpdateBoxEmployeeIds: (boxId: string, employeeIds: string[]) => void;
};

const EMPTY_FILTERS: HierarchyFilters = {
  unit: "",
  department: "",
  section: "",
  line: "",
};

export default function BoundingBoxSidebar({
  boxes,
  employees,
  selectedBoxId,
  onSelectBox,
  onAddBox,
  onDeleteBox,
  onUpdateBoxName,
  onUpdateBoxEmployeeIds,
}: BoundingBoxSidebarProps) {
  const [search, setSearch] = useState("");
  const [hierarchyFilters, setHierarchyFilters] =
    useState<HierarchyFilters>(EMPTY_FILTERS);

  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId],
  );

  useEffect(() => {
    setSearch("");
    setHierarchyFilters(EMPTY_FILTERS);
  }, [selectedBoxId]);

  const hierarchy = useMemo(
    () => deriveEmployeeHierarchy(employees, hierarchyFilters),
    [employees, hierarchyFilters],
  );

  useEffect(() => {
    const next = hierarchy.normalizedSelection;
    setHierarchyFilters((prev) => {
      if (
        prev.unit === next.unit &&
        prev.department === next.department &&
        prev.section === next.section &&
        prev.line === next.line
      ) {
        return prev;
      }

      return next;
    });
  }, [hierarchy.normalizedSelection]);

  const selectedEmployeeSet = useMemo(
    () => new Set(selectedBox?.employeeIds ?? []),
    [selectedBox?.employeeIds],
  );

  const filteredEmployees = useMemo(
    () =>
      hierarchy.filteredRows.filter((employee) =>
        searchMatchesEmployee(employee, search),
      ),
    [hierarchy.filteredRows, search],
  );

  const visibleEmployeeIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees],
  );

  const allVisibleSelected = useMemo(() => {
    if (visibleEmployeeIds.length === 0) return false;
    return visibleEmployeeIds.every((employeeId) =>
      selectedEmployeeSet.has(employeeId),
    );
  }, [selectedEmployeeSet, visibleEmployeeIds]);

  const hasActiveFilter = Boolean(
    search.trim() ||
      hierarchyFilters.unit ||
      hierarchyFilters.department ||
      hierarchyFilters.section ||
      hierarchyFilters.line,
  );

  const handleToggleEmployee = (employeeId: string) => {
    if (!selectedBox) return;

    const nextSet = new Set(selectedBox.employeeIds);
    if (nextSet.has(employeeId)) {
      nextSet.delete(employeeId);
    } else {
      nextSet.add(employeeId);
    }

    onUpdateBoxEmployeeIds(selectedBox.id, Array.from(nextSet));
  };

  const handleAssignFiltered = () => {
    if (!selectedBox) return;

    const nextSet = new Set(selectedBox.employeeIds);
    for (const employeeId of visibleEmployeeIds) {
      nextSet.add(employeeId);
    }

    onUpdateBoxEmployeeIds(selectedBox.id, Array.from(nextSet));
  };

  const handleUnassignFiltered = () => {
    if (!selectedBox) return;

    const nextSet = new Set(selectedBox.employeeIds);
    for (const employeeId of visibleEmployeeIds) {
      nextSet.delete(employeeId);
    }

    onUpdateBoxEmployeeIds(selectedBox.id, Array.from(nextSet));
  };

  const handleClearAssignment = () => {
    if (!selectedBox) return;
    onUpdateBoxEmployeeIds(selectedBox.id, []);
  };

  const handleResetFilters = () => {
    setSearch("");
    setHierarchyFilters(EMPTY_FILTERS);
  };

  return (
    <aside className="space-y-4">
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Boxes</h3>
            <p className="text-xs text-zinc-500">
              Add, update, and delete multiple boxes for this camera.
            </p>
          </div>
          <Button type="button" size="sm" onClick={onAddBox}>
            <Plus className="h-4 w-4" />
            Add Box
          </Button>
        </div>

        <div className="mt-4 space-y-2">
          {boxes.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-6 text-center text-sm text-zinc-500">
              No boxes yet.
            </div>
          ) : (
            boxes.map((box, index) => {
              const isSelected = box.id === selectedBoxId;
              const assignedCount = sortDistinctIds(box.employeeIds).length;
              const displayName = box.name.trim() || `Box ${index + 1}`;

              return (
                <button
                  key={box.id}
                  type="button"
                  className={cn(
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition",
                    isSelected
                      ? "border-zinc-900 bg-zinc-50"
                      : "border-zinc-200 hover:bg-zinc-50",
                  )}
                  onClick={() => onSelectBox(box.id)}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full"
                        style={{ backgroundColor: boxColorForIndex(index) }}
                      />
                      <span className="truncate text-sm font-medium text-zinc-900">
                        {displayName}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {assignedCount}{" "}
                      {assignedCount === 1 ? "employee" : "employees"} assigned
                    </div>
                  </div>
                  <Badge variant={isSelected ? "default" : "outline"}>
                    {index + 1}
                  </Badge>
                </button>
              );
            })
          )}
        </div>
      </section>

      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm">
        {!selectedBox ? (
          <div className="rounded-lg border border-dashed border-zinc-200 bg-zinc-50 px-4 py-8 text-center text-sm text-zinc-500">
            Select a box to rename it, assign employees, or delete it.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-zinc-900">
                  Box Details
                </h3>
                <p className="text-xs text-zinc-500">
                  Single checkbox toggles individual employees. Batch buttons
                  work on the current filtered employee list.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => onDeleteBox(selectedBox.id)}
              >
                <Trash2 className="h-4 w-4" />
                Delete
              </Button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-700">
                Box Name
              </label>
              <Input
                value={selectedBox.name}
                onChange={(event) =>
                  onUpdateBoxName(selectedBox.id, event.target.value)
                }
                placeholder="Reception Entry"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">
                <Users className="h-3.5 w-3.5" />
                Assigned: {selectedBox.employeeIds.length}
              </Badge>
              <Badge variant="outline">Enrolled: {employees.length}</Badge>
              <Badge variant="outline">Filtered: {filteredEmployees.length}</Badge>
              {hasActiveFilter ? <Badge>Filtered View</Badge> : null}
            </div>

            <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
              Search by employee name or ID and narrow the list with unit,
              department, section, and line filters like the employee page.
            </div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by employee name or ID..."
                className="pl-9"
              />
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Unit
                </label>
                <select
                  value={hierarchyFilters.unit}
                  onChange={(event) =>
                    setHierarchyFilters({
                      unit: event.target.value,
                      department: "",
                      section: "",
                      line: "",
                    })
                  }
                  disabled={!hierarchy.availability.hasUnit}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All units</option>
                  {hierarchy.options.units.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Department
                </label>
                <select
                  value={hierarchyFilters.department}
                  onChange={(event) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      department: event.target.value,
                      section: "",
                      line: "",
                    }))
                  }
                  disabled={!hierarchy.availability.hasDepartment}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All departments</option>
                  {hierarchy.options.departments.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Section
                </label>
                <select
                  value={hierarchyFilters.section}
                  onChange={(event) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      section: event.target.value,
                      line: "",
                    }))
                  }
                  disabled={!hierarchy.availability.hasSection}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All sections</option>
                  {hierarchy.options.sections.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">
                  Line
                </label>
                <select
                  value={hierarchyFilters.line}
                  onChange={(event) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      line: event.target.value,
                    }))
                  }
                  disabled={!hierarchy.availability.hasLine}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All lines</option>
                  {hierarchy.options.lines.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAssignFiltered}
                disabled={filteredEmployees.length === 0 || allVisibleSelected}
              >
                Assign Filtered
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleUnassignFiltered}
                disabled={filteredEmployees.length === 0}
              >
                Unassign Filtered
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleClearAssignment}
                disabled={selectedBox.employeeIds.length === 0}
              >
                Unassign All
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilters}
                disabled={!hasActiveFilter}
              >
                <FilterX className="h-4 w-4" />
                Clear Filters
              </Button>
            </div>

            <div className="max-h-[360px] overflow-y-auto rounded-lg border border-zinc-200">
              {employees.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  No enrolled employees found.
                </div>
              ) : filteredEmployees.length === 0 ? (
                <div className="px-4 py-8 text-center text-sm text-zinc-500">
                  No employees match the current search/filter.
                </div>
              ) : (
                filteredEmployees.map((employee) => {
                  const checked = selectedEmployeeSet.has(employee.id);

                  return (
                    <label
                      key={employee.id}
                      className="flex cursor-pointer items-start gap-3 border-b border-zinc-200 px-3 py-2 last:border-b-0 hover:bg-zinc-50"
                    >
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4"
                        checked={checked}
                        onChange={() => handleToggleEmployee(employee.id)}
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-zinc-900">
                          {employee.name}
                        </div>
                        <div className="truncate text-xs text-zinc-500">
                          ID: {formatEmployeeLabel(employee)}
                        </div>
                        <div className="truncate text-xs text-zinc-400">
                          {[employee.unit, employee.department, employee.section, employee.line]
                            .filter(Boolean)
                            .join(" / ") || "No hierarchy data"}
                        </div>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          </div>
        )}
      </section>
    </aside>
  );
}
