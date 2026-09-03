"use client";

import React from "react";
import { FilterX, Plus, Search, Trash2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { boxColorForIndex, formatEmployeeLabel, sortDistinctIds } from "./boundingBoxUtils";
import type { BoundingBoxEmployeeOption, EditableBoundingBox } from "./types";
import { useBoundingBoxSidebarState } from "./useBoundingBoxSidebarState";

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
  const {
    search,
    setSearch,
    selectedBox,
    selectedEmployeeSet,
    filteredEmployees,
    allVisibleSelected,
    hasActiveFilter,
    handleToggleEmployee,
    handleAssignFiltered,
    handleUnassignFiltered,
    handleClearAssignment,
    handleResetFilters,
  } = useBoundingBoxSidebarState(
    boxes,
    employees,
    selectedBoxId,
    onUpdateBoxEmployeeIds
  );

  return (
    <aside className="space-y-4">
      {/* Box List Card */}
      <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">Boxes</h3>
            <p className="text-xs text-zinc-500">Configure regions for this camera.</p>
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
                    "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition cursor-pointer",
                    isSelected
                      ? "border-violet-600 bg-violet-50/50"
                      : "border-zinc-200 bg-white hover:bg-zinc-50"
                  )}
                  onClick={() => onSelectBox(box.id)}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-full border border-white shrink-0"
                      style={{ backgroundColor: boxColorForIndex(index) }}
                    />
                    <span className="text-xs font-semibold text-zinc-800">{displayName}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    {assignedCount} Assigned
                  </Badge>
                </button>
              );
            })
          )}
        </div>
      </section>

      {/* Selected Box Employees Assignment */}
      {selectedBox && (
        <section className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-zinc-700 tracking-wider">
              Assigned Employees
            </h4>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-[11px]"
                onClick={allVisibleSelected ? handleUnassignFiltered : handleAssignFiltered}
              >
                {allVisibleSelected ? "Deselect All" : "Select Filtered"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-[11px] text-rose-600"
                onClick={handleClearAssignment}
              >
                Clear
              </Button>
            </div>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search employee to assign..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 text-xs"
            />
          </div>

          <div className="max-h-60 overflow-y-auto space-y-1 pr-1 border border-zinc-100 rounded-lg p-2 bg-zinc-50/50">
            {filteredEmployees.length === 0 ? (
              <div className="text-center py-4 text-xs text-zinc-400">No matching employees</div>
            ) : (
              filteredEmployees.map((emp) => {
                const isChecked = selectedEmployeeSet.has(emp.id);
                return (
                  <label
                    key={emp.id}
                    className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-white text-xs cursor-pointer border border-transparent hover:border-zinc-200"
                  >
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => handleToggleEmployee(emp.id)}
                        className="rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                      />
                      <span className="font-medium text-zinc-800">{emp.name}</span>
                    </div>
                    <span className="font-mono text-[10px] text-zinc-400">{emp.empId || emp.id}</span>
                  </label>
                );
              })
            )}
          </div>
        </section>
      )}
    </aside>
  );
}
