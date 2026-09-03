import { useEffect, useMemo, useState } from "react";
import { deriveEmployeeHierarchy } from "@/lib/employeeHierarchy";
import { searchMatchesEmployee } from "./boundingBoxUtils";
import type { BoundingBoxEmployeeOption, EditableBoundingBox } from "./types";

export type HierarchyFilters = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

export const EMPTY_FILTERS: HierarchyFilters = {
  unit: "",
  department: "",
  section: "",
  line: "",
};

export function useBoundingBoxSidebarState(
  boxes: EditableBoundingBox[],
  employees: BoundingBoxEmployeeOption[],
  selectedBoxId: string | null,
  onUpdateBoxEmployeeIds: (boxId: string, employeeIds: string[]) => void
) {
  const [search, setSearch] = useState("");
  const [hierarchyFilters, setHierarchyFilters] = useState<HierarchyFilters>(EMPTY_FILTERS);

  const selectedBox = useMemo(
    () => boxes.find((box) => box.id === selectedBoxId) ?? null,
    [boxes, selectedBoxId]
  );

  useEffect(() => {
    setSearch("");
    setHierarchyFilters(EMPTY_FILTERS);
  }, [selectedBoxId]);

  const hierarchy = useMemo(
    () => deriveEmployeeHierarchy(employees, hierarchyFilters),
    [employees, hierarchyFilters]
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
    [selectedBox?.employeeIds]
  );

  const filteredEmployees = useMemo(
    () =>
      hierarchy.filteredRows.filter((employee) =>
        searchMatchesEmployee(employee, search)
      ),
    [hierarchy.filteredRows, search]
  );

  const visibleEmployeeIds = useMemo(
    () => filteredEmployees.map((employee) => employee.id),
    [filteredEmployees]
  );

  const allVisibleSelected = useMemo(() => {
    if (visibleEmployeeIds.length === 0) return false;
    return visibleEmployeeIds.every((employeeId) =>
      selectedEmployeeSet.has(employeeId)
    );
  }, [selectedEmployeeSet, visibleEmployeeIds]);

  const hasActiveFilter = Boolean(
    search.trim() ||
      hierarchyFilters.unit ||
      hierarchyFilters.department ||
      hierarchyFilters.section ||
      hierarchyFilters.line
  );

  const handleToggleEmployee = (employeeId: string) => {
    if (!selectedBox) return;
    const nextSet = new Set(selectedBox.employeeIds);
    if (nextSet.has(employeeId)) nextSet.delete(employeeId);
    else nextSet.add(employeeId);
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

  return {
    search,
    setSearch,
    hierarchyFilters,
    setHierarchyFilters,
    selectedBox,
    hierarchy,
    selectedEmployeeSet,
    filteredEmployees,
    allVisibleSelected,
    hasActiveFilter,
    handleToggleEmployee,
    handleAssignFiltered,
    handleUnassignFiltered,
    handleClearAssignment,
    handleResetFilters,
  };
}
