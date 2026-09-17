"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { Download, RefreshCw } from "lucide-react";
import { Employee } from "@/types";
import { fetchErpEmployeeById } from "@/hooks/useErpEmployees";
import {
  deriveEmployeeHierarchy,
  normalizeHierarchyValue,
} from "@/lib/employeeHierarchy";
import type { EmployeeRow } from "./useEmployeeTableState";

type Props = {
  selectedUser: Employee | null;
  setSelectedUser?: React.Dispatch<React.SetStateAction<Employee | null>>;
  allEmployees?: (Employee | EmployeeRow)[];
  loading: boolean;
  onClose: () => void;
  onSave: (payload: {
    name?: string;
    empId?: string | null;
    unit?: string | null;
    section?: string | null;
    department?: string | null;
    line?: string | null;
    deptId?: string | null;
    sectionId?: string | null;
    designationId?: string | null;
    designation?: string | null;
    unitId?: string | null;
    lineId?: string | null;
    empPicUrl?: string | null;
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

interface FormState {
  empId: string;
  name: string;
  designation: string;
  unit: string;
  department: string;
  section: string;
  line: string;
  deptId: string;
  sectionId: string;
  designationId: string;
  unitId: string;
  lineId: string;
  empPicUrl: string;
}

const EmployeeEditForm: React.FC<Props> = ({
  selectedUser,
  setSelectedUser,
  allEmployees = [],
  loading,
  onClose,
  onSave,
}) => {
  const [formData, setFormData] = useState<FormState>({
    empId: selectedUser?.empId ?? "",
    name: selectedUser?.name ?? "",
    designation: selectedUser?.designation ?? "",
    unit: selectedUser?.unit ?? "",
    department: selectedUser?.department ?? "",
    section: selectedUser?.section ?? "",
    line: selectedUser?.line ?? "",
    deptId: selectedUser?.deptId ?? "",
    sectionId: selectedUser?.sectionId ?? "",
    designationId: selectedUser?.designationId ?? "",
    unitId: selectedUser?.unitId ?? "",
    lineId: selectedUser?.lineId ?? "",
    empPicUrl: selectedUser?.empPicUrl ?? "",
  });

  const [isFetchingErp, setIsFetchingErp] = useState(false);
  const [customHierarchy, setCustomHierarchy] = useState({
    unit: false,
    department: false,
    section: false,
    line: false,
  });

  // Re-sync form state when selectedUser changes (e.g. editing a different employee)
  useEffect(() => {
    if (selectedUser) {
      setFormData({
        empId: selectedUser.empId ?? "",
        name: selectedUser.name ?? "",
        designation: selectedUser.designation ?? "",
        unit: selectedUser.unit ?? "",
        department: selectedUser.department ?? "",
        section: selectedUser.section ?? "",
        line: selectedUser.line ?? "",
        deptId: selectedUser.deptId ?? "",
        sectionId: selectedUser.sectionId ?? "",
        designationId: selectedUser.designationId ?? "",
        unitId: selectedUser.unitId ?? "",
        lineId: selectedUser.lineId ?? "",
        empPicUrl: selectedUser.empPicUrl ?? "",
      });
    }
  }, [selectedUser?.id]);

  const updateField = useCallback(
    (field: keyof FormState, value: string) => {
      setFormData((prev) => {
        const next = { ...prev, [field]: value };
        if (setSelectedUser) {
          setSelectedUser((curr) => (curr ? { ...curr, [field]: value } : curr));
        }
        return next;
      });
    },
    [setSelectedUser]
  );

  // Derive hierarchy options from existing organization employees
  const hierarchy = useMemo(
    () =>
      deriveEmployeeHierarchy(allEmployees, {
        unit: formData.unit,
        department: formData.department,
        section: formData.section,
        line: formData.line,
      }),
    [allEmployees, formData.unit, formData.department, formData.section, formData.line]
  );

  const unitOptions = useMemo(
    () => withCurrentOption(hierarchy.options.units, formData.unit),
    [hierarchy.options.units, formData.unit]
  );
  const departmentOptions = useMemo(
    () => withCurrentOption(hierarchy.options.departments, formData.department),
    [hierarchy.options.departments, formData.department]
  );
  const sectionOptions = useMemo(
    () => withCurrentOption(hierarchy.options.sections, formData.section),
    [hierarchy.options.sections, formData.section]
  );
  const lineOptions = useMemo(
    () => withCurrentOption(hierarchy.options.lines, formData.line),
    [hierarchy.options.lines, formData.line]
  );

  // Explicit user-triggered ERP fetch
  const handleFetchFromErp = async () => {
    const query = (formData.empId || formData.name).trim();
    if (!query) {
      toast.error("Please enter an Employee ID to search in ERP.");
      return;
    }

    setIsFetchingErp(true);
    try {
      const emp = await fetchErpEmployeeById(query);
      if (emp) {
        setFormData((prev) => {
          const next: FormState = {
            ...prev,
            empId: emp.employeeId || prev.empId,
            name: emp.employeeName || prev.name,
            unit: emp.unit || prev.unit,
            department: emp.department || prev.department,
            section: emp.section || prev.section,
            line: emp.line || prev.line,
            designation: emp.designation || prev.designation,
            deptId: emp.deptId ?? prev.deptId,
            sectionId: emp.sectionId ?? prev.sectionId,
            designationId: emp.designationId ?? prev.designationId,
            unitId: emp.unitId ?? prev.unitId,
            lineId: emp.lineId ?? prev.lineId,
            empPicUrl: emp.picUrl ?? prev.empPicUrl,
          };
          if (setSelectedUser) {
            setSelectedUser((curr) => (curr ? { ...curr, ...next } : curr));
          }
          return next;
        });
        toast.success(`Loaded ERP data for "${emp.employeeName}" (${emp.employeeId})`);
      } else {
        toast.error(`No ERP record found for Employee ID: ${query}`);
      }
    } catch (err: any) {
      toast.error(err?.message || "Failed to fetch employee from ERP.");
    } finally {
      setIsFetchingErp(false);
    }
  };

  const handleSave = () => {
    const trimmedName = formData.name.trim();
    if (!trimmedName) {
      toast.error("Employee Name is required.");
      return;
    }

    onSave({
      name: trimmedName,
      empId: formData.empId.trim() || null,
      unit: toHierarchyWriteValue(formData.unit),
      section: toHierarchyWriteValue(formData.section),
      department: toHierarchyWriteValue(formData.department),
      line: toHierarchyWriteValue(formData.line),
      deptId: toHierarchyWriteValue(formData.deptId),
      sectionId: toHierarchyWriteValue(formData.sectionId),
      designationId: toHierarchyWriteValue(formData.designationId),
      designation: toHierarchyWriteValue(formData.designation),
      unitId: toHierarchyWriteValue(formData.unitId),
      lineId: toHierarchyWriteValue(formData.lineId),
      empPicUrl: toHierarchyWriteValue(formData.empPicUrl),
    });
  };

  return (
    <div className="space-y-4">
      {/* Employee ID with ERP Sync Button */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-zinc-700">Employee ID</label>
          <button
            type="button"
            onClick={handleFetchFromErp}
            disabled={loading || isFetchingErp || !formData.empId.trim()}
            className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 transition cursor-pointer"
            title="Fetch latest details from ERP"
          >
            {isFetchingErp ? (
              <RefreshCw className="h-3 w-3 animate-spin" />
            ) : (
              <Download className="h-3 w-3" />
            )}
            {isFetchingErp ? "Fetching ERP..." : "Autofill from ERP"}
          </button>
        </div>
        <input
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
          value={formData.empId}
          onChange={(e) => updateField("empId", e.target.value)}
          placeholder="e.g. 20240501"
          disabled={loading || isFetchingErp}
        />
      </div>

      {/* Employee Name */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">
          Employee Name <span className="text-red-500">*</span>
        </label>
        <input
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
          value={formData.name}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Employee full name"
          disabled={loading || isFetchingErp}
        />
      </div>

      {/* Designation */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-zinc-700">Designation</label>
        <input
          className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
          value={formData.designation}
          onChange={(e) => updateField("designation", e.target.value)}
          placeholder="e.g. Software Engineer, Operator"
          disabled={loading || isFetchingErp}
        />
      </div>

      {/* Hierarchy Panel */}
      <div className="rounded-xl border border-zinc-200 bg-zinc-50/70 p-3.5 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-xs font-bold uppercase tracking-wider text-zinc-600">
            Hierarchy Attributes
          </div>
          <span className="text-[11px] text-zinc-500">Unit &bull; Department &bull; Section &bull; Line</span>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {/* Unit */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Unit</label>
              <button
                type="button"
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                onClick={() => setCustomHierarchy((prev) => ({ ...prev, unit: !prev.unit }))}
              >
                {customHierarchy.unit ? "Choose list" : "+ Custom"}
              </button>
            </div>
            {customHierarchy.unit ? (
              <input
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={formData.unit}
                onChange={(e) => updateField("unit", e.target.value)}
                placeholder="Type custom unit"
                disabled={loading || isFetchingErp}
              />
            ) : (
              <select
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
                value={formData.unit}
                onChange={(e) => updateField("unit", e.target.value)}
                disabled={loading || isFetchingErp}
              >
                <option value="">N/A (None)</option>
                {unitOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Department */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Department</label>
              <button
                type="button"
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                onClick={() => setCustomHierarchy((prev) => ({ ...prev, department: !prev.department }))}
              >
                {customHierarchy.department ? "Choose list" : "+ Custom"}
              </button>
            </div>
            {customHierarchy.department ? (
              <input
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={formData.department}
                onChange={(e) => updateField("department", e.target.value)}
                placeholder="Type custom department"
                disabled={loading || isFetchingErp}
              />
            ) : (
              <select
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
                value={formData.department}
                onChange={(e) => updateField("department", e.target.value)}
                disabled={loading || isFetchingErp}
              >
                <option value="">N/A (None)</option>
                {departmentOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Section */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Section</label>
              <button
                type="button"
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                onClick={() => setCustomHierarchy((prev) => ({ ...prev, section: !prev.section }))}
              >
                {customHierarchy.section ? "Choose list" : "+ Custom"}
              </button>
            </div>
            {customHierarchy.section ? (
              <input
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={formData.section}
                onChange={(e) => updateField("section", e.target.value)}
                placeholder="Type custom section"
                disabled={loading || isFetchingErp}
              />
            ) : (
              <select
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
                value={formData.section}
                onChange={(e) => updateField("section", e.target.value)}
                disabled={loading || isFetchingErp}
              >
                <option value="">N/A (None)</option>
                {sectionOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Line */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-zinc-700">Line</label>
              <button
                type="button"
                className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                onClick={() => setCustomHierarchy((prev) => ({ ...prev, line: !prev.line }))}
              >
                {customHierarchy.line ? "Choose list" : "+ Custom"}
              </button>
            </div>
            {customHierarchy.line ? (
              <input
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                value={formData.line}
                onChange={(e) => updateField("line", e.target.value)}
                placeholder="Type custom line"
                disabled={loading || isFetchingErp}
              />
            ) : (
              <select
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 disabled:bg-zinc-100"
                value={formData.line}
                onChange={(e) => updateField("line", e.target.value)}
                disabled={loading || isFetchingErp}
              >
                <option value="">N/A (None)</option>
                {lineOptions.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
        <button
          className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
          onClick={onClose}
          type="button"
          disabled={loading || isFetchingErp}
        >
          Cancel
        </button>

        <button
          className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white shadow-xs hover:bg-indigo-700 disabled:opacity-50 transition cursor-pointer"
          type="button"
          disabled={loading || isFetchingErp || !formData.name.trim()}
          onClick={handleSave}
        >
          {loading ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </div>
  );
};

export default EmployeeEditForm;

