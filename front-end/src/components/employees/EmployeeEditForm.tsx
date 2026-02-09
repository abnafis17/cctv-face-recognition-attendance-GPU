"use client";

import React, { useMemo } from "react";
import { Employee } from "@/types";
import { useErpEmployees } from "@/hooks/useErpEmployees";
import {
  deriveEmployeeHierarchy,
  normalizeHierarchyValue,
} from "@/lib/employeeHierarchy";

type Props = {
  selectedUser: Employee | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<Employee | null>>;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: {
    name?: string;
    empId?: string | null;
    unit?: string | null;
    section?: string | null;
    department?: string | null;
    line?: string | null;
  }) => void;
};

function withCurrentOption(options: string[], current?: string | null): string[] {
  const currentValue = normalizeHierarchyValue(current);
  if (!currentValue) return options;
  if (options.includes(currentValue)) return options;
  return [currentValue, ...options];
}

function toHierarchyWriteValue(value?: string | null): string {
  const normalized = normalizeHierarchyValue(value);
  return normalized || "";
}

const EmployeeEditForm: React.FC<Props> = ({
  selectedUser,
  setSelectedUser,
  loading,
  onClose,
  onSave,
}) => {
  const {
    employees: erpEmployees,
    loading: erpLoading,
    error: erpError,
  } = useErpEmployees({ debounceMs: 350, initialSearch: "", autoFetch: true });

  const hierarchy = useMemo(
    () =>
      deriveEmployeeHierarchy(erpEmployees, {
        unit: selectedUser?.unit ?? "",
        department: selectedUser?.department ?? "",
        section: selectedUser?.section ?? "",
        line: selectedUser?.line ?? "",
      }),
    [
      erpEmployees,
      selectedUser?.department,
      selectedUser?.line,
      selectedUser?.section,
      selectedUser?.unit,
    ],
  );

  const unitOptions = useMemo(
    () => withCurrentOption(hierarchy.options.units, selectedUser?.unit),
    [hierarchy.options.units, selectedUser?.unit],
  );
  const departmentOptions = useMemo(
    () =>
      withCurrentOption(
        hierarchy.options.departments,
        selectedUser?.department,
      ),
    [hierarchy.options.departments, selectedUser?.department],
  );
  const sectionOptions = useMemo(
    () => withCurrentOption(hierarchy.options.sections, selectedUser?.section),
    [hierarchy.options.sections, selectedUser?.section],
  );
  const lineOptions = useMemo(
    () => withCurrentOption(hierarchy.options.lines, selectedUser?.line),
    [hierarchy.options.lines, selectedUser?.line],
  );

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <label className="text-sm font-medium">Employee ID</label>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          value={selectedUser?.empId ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, empId: e.target.value } : prev,
            )
          }
          placeholder="Employee ID"
        />
      </div>

      <div className="space-y-1">
        <label className="text-sm font-medium">Name</label>
        <input
          className="w-full rounded border px-3 py-2 text-sm"
          value={selectedUser?.name ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, name: e.target.value } : prev,
            )
          }
          placeholder="Name"
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
        <div className="text-sm font-semibold text-slate-900">Hierarchy</div>
        <div className="mt-1 text-xs text-slate-600">
          ERP hierarchy: Unit, Department, Section, Line.
        </div>

        {erpError ? (
          <div className="mt-2 text-xs text-red-600">{erpError}</div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {hierarchy.availability.hasUnit ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Unit</label>
              <select
                className="w-full rounded border bg-white px-3 py-2 text-sm"
                value={selectedUser?.unit ?? ""}
                onChange={(e) =>
                  setSelectedUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          unit: e.target.value,
                        }
                      : prev,
                  )
                }
                disabled={loading || erpLoading}
              >
                <option value="">N/A</option>
                {unitOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {hierarchy.availability.hasDepartment ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Department</label>
              <select
                className="w-full rounded border bg-white px-3 py-2 text-sm"
                value={selectedUser?.department ?? ""}
                onChange={(e) =>
                  setSelectedUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          department: e.target.value,
                        }
                      : prev,
                  )
                }
                disabled={loading || erpLoading}
              >
                <option value="">N/A</option>
                {departmentOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {hierarchy.availability.hasSection ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Section</label>
              <select
                className="w-full rounded border bg-white px-3 py-2 text-sm"
                value={selectedUser?.section ?? ""}
                onChange={(e) =>
                  setSelectedUser((prev) =>
                    prev
                      ? {
                          ...prev,
                          section: e.target.value,
                        }
                      : prev,
                  )
                }
                disabled={loading || erpLoading}
              >
                <option value="">N/A</option>
                {sectionOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {hierarchy.availability.hasLine ? (
            <div className="space-y-1">
              <label className="text-sm font-medium">Line</label>
              <select
                className="w-full rounded border bg-white px-3 py-2 text-sm"
                value={selectedUser?.line ?? ""}
                onChange={(e) =>
                  setSelectedUser((prev) =>
                    prev ? { ...prev, line: e.target.value } : prev,
                  )
                }
                disabled={loading || erpLoading}
              >
                <option value="">N/A</option>
                {lineOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          className="rounded border px-4 py-2 text-sm"
          onClick={onClose}
          type="button"
          disabled={loading}
        >
          Cancel
        </button>

        <button
          className="rounded bg-blue-600 px-4 py-2 text-sm text-white disabled:opacity-60"
          type="button"
          disabled={loading || !selectedUser}
          onClick={() =>
            onSave({
              name: selectedUser?.name,
              empId: selectedUser?.empId ?? null,
              unit: toHierarchyWriteValue(selectedUser?.unit),
              section: toHierarchyWriteValue(selectedUser?.section),
              department: toHierarchyWriteValue(selectedUser?.department),
              line: toHierarchyWriteValue(selectedUser?.line),
            })
          }
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

export default EmployeeEditForm;
