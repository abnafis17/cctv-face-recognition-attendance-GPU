"use client";

import React, { useEffect, useMemo, useState } from "react";
import { Employee } from "@/types";
import { useHrmEmployees } from "@/hooks/useHrmEmployees";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import { Label } from "@/components/ui/label";
import { Building2, Layers, Save, X } from "lucide-react";
import toast from "react-hot-toast";

import { EmployeeUpdatePayload } from "./useEmployeeTableState";

type Props = {
  selectedUser: Employee | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<Employee | null>>;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: EmployeeUpdatePayload) => void;
};

const EmployeeEditForm: React.FC<Props> = ({
  selectedUser,
  loading,
  onClose,
  onSave,
}) => {
  const {
    companies,
    companiesLoading,
    areas,
    areasLoading,
    departments,
    departmentsLoading,
    sections,
    sectionsLoading,
    units,
    unitsLoading,
    lines,
    linesLoading,
    fetchAreas,
    fetchDepartments,
    fetchSections,
    fetchUnits,
    fetchLines,
  } = useHrmEmployees();

  // Local form state initialized from selectedUser
  const [empName, setEmpName] = useState(selectedUser?.name ?? "");
  const [empId, setEmpId] = useState(selectedUser?.empId ?? "");

  const [companyId, setCompanyId] = useState(selectedUser?.erpCompanyId ?? "");
  const [companyName, setCompanyName] = useState(selectedUser?.erpCompanyName ?? "");

  const [areaId, setAreaId] = useState(selectedUser?.erpAreaId ?? "");
  const [areaName, setAreaName] = useState(selectedUser?.erpAreaName ?? "");

  const [unitId, setUnitId] = useState(selectedUser?.unitId ?? "");
  const [unitName, setUnitName] = useState(selectedUser?.unit ?? "");

  const [departmentId, setDepartmentId] = useState(selectedUser?.deptId ?? "");
  const [departmentName, setDepartmentName] = useState(selectedUser?.department ?? "");

  const [sectionId, setSectionId] = useState(selectedUser?.sectionId ?? "");
  const [sectionName, setSectionName] = useState(selectedUser?.section ?? "");

  const [lineId, setLineId] = useState(selectedUser?.lineId ?? "");
  const [lineName, setLineName] = useState(selectedUser?.line ?? "");

  const [designationId] = useState(selectedUser?.designationId ?? "");
  const [designationName] = useState(selectedUser?.designation ?? "");
  const [empPicUrl] = useState(selectedUser?.empPicUrl ?? "");

  // Auto-match current employee names with HRM IDs (and vice-versa) once HRM master lists load
  useEffect(() => {
    if (companyName && !companyId && companies.length > 0) {
      const match = companies.find(
        (c) =>
          c.company_name?.trim().toLowerCase() === companyName.trim().toLowerCase() ||
          c.company_code?.trim().toLowerCase() === companyName.trim().toLowerCase() ||
          c.short_name?.trim().toLowerCase() === companyName.trim().toLowerCase()
      );
      if (match) setCompanyId(match.id);
    } else if (companyId && !companyName && companies.length > 0) {
      const match = companies.find((c) => c.id === companyId);
      if (match?.company_name) setCompanyName(match.company_name);
    }
  }, [companies, companyName, companyId]);

  useEffect(() => {
    if (areaName && !areaId && areas.length > 0) {
      const match = areas.find(
        (a) =>
          a.area_name?.trim().toLowerCase() === areaName.trim().toLowerCase() ||
          a.area_name_in_english?.trim().toLowerCase() === areaName.trim().toLowerCase() ||
          a.area_code?.trim().toLowerCase() === areaName.trim().toLowerCase()
      );
      if (match) setAreaId(match.id);
    } else if (areaId && !areaName && areas.length > 0) {
      const match = areas.find((a) => a.id === areaId);
      if (match?.area_name) setAreaName(match.area_name);
    }
  }, [areas, areaName, areaId]);

  useEffect(() => {
    if (unitName && !unitId && units.length > 0) {
      const match = units.find(
        (u) =>
          u.unit_name?.trim().toLowerCase() === unitName.trim().toLowerCase() ||
          u.unit_code?.trim().toLowerCase() === unitName.trim().toLowerCase()
      );
      if (match) setUnitId(match.id);
    } else if (unitId && !unitName && units.length > 0) {
      const match = units.find((u) => u.id === unitId);
      if (match?.unit_name) setUnitName(match.unit_name);
    }
  }, [units, unitName, unitId]);

  useEffect(() => {
    if (departmentName && !departmentId && departments.length > 0) {
      const match = departments.find(
        (d) =>
          d.department_name?.trim().toLowerCase() === departmentName.trim().toLowerCase() ||
          d.name_in_english?.trim().toLowerCase() === departmentName.trim().toLowerCase()
      );
      if (match) setDepartmentId(match.id);
    } else if (departmentId && !departmentName && departments.length > 0) {
      const match = departments.find((d) => d.id === departmentId);
      if (match?.department_name) setDepartmentName(match.department_name);
    }
  }, [departments, departmentName, departmentId]);

  useEffect(() => {
    if (sectionName && !sectionId && sections.length > 0) {
      const match = sections.find(
        (s) =>
          s.section_name?.trim().toLowerCase() === sectionName.trim().toLowerCase() ||
          s.section_name_in_english?.trim().toLowerCase() === sectionName.trim().toLowerCase()
      );
      if (match) setSectionId(match.id);
    } else if (sectionId && !sectionName && sections.length > 0) {
      const match = sections.find((s) => s.id === sectionId);
      if (match?.section_name) setSectionName(match.section_name);
    }
  }, [sections, sectionName, sectionId]);

  useEffect(() => {
    if (lineName && !lineId && lines.length > 0) {
      const match = lines.find(
        (l) =>
          l.line_name?.trim().toLowerCase() === lineName.trim().toLowerCase() ||
          l.line_name_in_english?.trim().toLowerCase() === lineName.trim().toLowerCase()
      );
      if (match) setLineId(match.id);
    } else if (lineId && !lineName && lines.length > 0) {
      const match = lines.find((l) => l.id === lineId);
      if (match?.line_name) setLineName(match.line_name);
    }
  }, [lines, lineName, lineId]);

  // Handle Company Selection
  const handleCompanyChange = (id: string) => {
    setCompanyId(id);
    const found = companies.find((c) => c.id === id);
    setCompanyName(found?.company_name || (id ? found?.short_name || "" : ""));
    setAreaId("");
    setAreaName("");
    fetchAreas(id || undefined);
    fetchDepartments(id || undefined);
    fetchSections(id || undefined, departmentId || undefined);
    fetchUnits(id || undefined);
    fetchLines(id || undefined);
  };

  // Handle Area Selection
  const handleAreaChange = (id: string) => {
    setAreaId(id);
    const found = areas.find((a) => a.id === id);
    setAreaName(found?.area_name || (id ? found?.area_name_in_english || "" : ""));
  };

  // Handle Unit Selection
  const handleUnitChange = (id: string) => {
    setUnitId(id);
    const found = units.find((u) => u.id === id);
    setUnitName(found?.unit_name || (id ? found?.unit_name_in_english || "" : ""));
  };

  // Handle Department Selection
  const handleDepartmentChange = (id: string) => {
    setDepartmentId(id);
    const found = departments.find((d) => d.id === id);
    setDepartmentName(found?.department_name || (id ? found?.name_in_english || "" : ""));
    fetchSections(companyId || undefined, id || undefined);
  };

  // Handle Section Selection
  const handleSectionChange = (id: string) => {
    setSectionId(id);
    const found = sections.find((s) => s.id === id);
    setSectionName(found?.section_name || (id ? found?.section_name_in_english || "" : ""));
  };

  // Handle Line Selection
  const handleLineChange = (id: string) => {
    setLineId(id);
    const found = lines.find((l) => l.id === id);
    setLineName(found?.line_name || (id ? found?.line_name_in_english || "" : ""));
  };

  // 1. Company Options
  const companyOptions = useMemo(() => {
    const list = companies.map((c) => ({
      value: c.id,
      label: c.company_name || c.short_name || c.company_code || c.id,
      keywords: `${c.company_name} ${c.company_code || ""} ${c.short_name || ""}`,
    }));

    if (companyName && !list.some((item) => item.value === companyId || item.label.toLowerCase() === companyName.toLowerCase())) {
      list.unshift({
        value: companyId || companyName,
        label: companyName,
        keywords: companyName,
      });
    }

    return [{ value: "", label: "None / Not specified" }, ...list];
  }, [companies, companyId, companyName]);

  // 2. Area Options
  const areaOptions = useMemo(() => {
    const list = areas.map((a) => {
      const label = a.area_name || a.area_name_in_english || a.short_name || a.area_code || a.id;
      return {
        value: a.id,
        label,
        keywords: `${label} ${a.area_code || ""} ${a.short_name || ""}`,
      };
    });

    if (areaName && !list.some((item) => item.value === areaId || item.label.toLowerCase() === areaName.toLowerCase())) {
      list.unshift({
        value: areaId || areaName,
        label: areaName,
        keywords: areaName,
      });
    }

    return [{ value: "", label: "None / Not specified" }, ...list];
  }, [areas, areaId, areaName]);

  // 3. Unit Options
  const unitOptions = useMemo(() => {
    const list = units.map((u) => {
      const label = u.unit_name || u.unit_name_in_english || u.unit_code || u.id;
      return {
        value: u.id,
        label,
        keywords: `${label} ${u.unit_code || ""}`,
      };
    });

    // Ensure the current employee unit value is available in the dropdown
    if (unitName && !list.some((item) => item.value === unitId || item.label.toLowerCase() === unitName.toLowerCase())) {
      list.unshift({
        value: unitId || unitName,
        label: unitName,
        keywords: unitName,
      });
    }

    return [{ value: "", label: "None / Clear" }, ...list];
  }, [units, unitId, unitName]);

  // 4. Department Options
  const departmentOptions = useMemo(() => {
    const list = departments.map((d) => {
      const label = d.department_name || d.name_in_english || d.code || d.id;
      return {
        value: d.id,
        label,
        keywords: `${label} ${d.code || ""} ${d.short_name || ""}`,
      };
    });

    if (departmentName && !list.some((item) => item.value === departmentId || item.label.toLowerCase() === departmentName.toLowerCase())) {
      list.unshift({
        value: departmentId || departmentName,
        label: departmentName,
        keywords: departmentName,
      });
    }

    return [{ value: "", label: "None / Clear" }, ...list];
  }, [departments, departmentId, departmentName]);

  // 5. Section Options
  const sectionOptions = useMemo(() => {
    const list = sections.map((s) => {
      const label = s.section_name || s.section_name_in_english || s.section_code || s.id;
      return {
        value: s.id,
        label,
        keywords: `${label} ${s.section_code || ""}`,
      };
    });

    if (sectionName && !list.some((item) => item.value === sectionId || item.label.toLowerCase() === sectionName.toLowerCase())) {
      list.unshift({
        value: sectionId || sectionName,
        label: sectionName,
        keywords: sectionName,
      });
    }

    return [{ value: "", label: "None / Clear" }, ...list];
  }, [sections, sectionId, sectionName]);

  // 6. Line Options
  const lineOptions = useMemo(() => {
    const list = lines.map((l) => {
      const label = l.line_name || l.line_name_in_english || l.line_code || l.id;
      return {
        value: l.id,
        label,
        keywords: `${label} ${l.line_code || ""}`,
      };
    });

    if (lineName && !list.some((item) => item.value === lineId || item.label.toLowerCase() === lineName.toLowerCase())) {
      list.unshift({
        value: lineId || lineName,
        label: lineName,
        keywords: lineName,
      });
    }

    return [{ value: "", label: "None / Clear" }, ...list];
  }, [lines, lineId, lineName]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!empName.trim()) {
      toast.error("Employee Name cannot be empty");
      return;
    }

    onSave({
      name: empName.trim(),
      empId: empId.trim() || null,
      unit: unitName.trim() || null,
      unitId: unitId.trim() || null,
      department: departmentName.trim() || null,
      deptId: departmentId.trim() || null,
      section: sectionName.trim() || null,
      sectionId: sectionId.trim() || null,
      line: lineName.trim() || null,
      lineId: lineId.trim() || null,
      designation: designationName.trim() || null,
      designationId: designationId.trim() || null,
      empPicUrl: empPicUrl.trim() || null,
      erpCompanyId: companyId.trim() || null,
      erpCompanyName: companyName.trim() || null,
      erpAreaId: areaId.trim() || null,
      erpAreaName: areaName.trim() || null,
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Basic Info */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-id" className="text-xs font-semibold text-zinc-700">
            Employee ID
          </Label>
          <input
            id="edit-emp-id"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-colors font-mono"
            value={empId}
            onChange={(e) => setEmpId(e.target.value)}
            placeholder="e.g. 2025054707"
            disabled={loading}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="edit-emp-name" className="text-xs font-semibold text-zinc-700">
            Employee Name <span className="text-red-500">*</span>
          </Label>
          <input
            id="edit-emp-name"
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 focus:ring-1 focus:ring-zinc-400 transition-colors"
            value={empName}
            onChange={(e) => setEmpName(e.target.value)}
            placeholder="e.g. Allama Bakhtiyar Nafis"
            required
            disabled={loading}
          />
        </div>
      </div>

      {/* HRM Hierarchy Section */}
      <div className="rounded-xl border border-zinc-200/90 bg-zinc-50/60 p-4 space-y-3.5">
        <div className="flex items-center justify-between border-b border-zinc-200/70 pb-2.5">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-200/80 text-zinc-700">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-zinc-800">
                HRM Hierarchy & Department Assignment
              </div>
              <div className="text-[11px] text-zinc-500">
                Select Company, Area, Department, Section, Unit, or Line from HRM master data.
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 1. Company */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Company</Label>
            <SearchableSelect
              value={companyId}
              onChange={handleCompanyChange}
              items={companyOptions}
              placeholder="Select Company..."
              searchPlaceholder="Search company..."
              disabled={loading}
              loading={companiesLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>

          {/* 2. Area */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Area</Label>
            <SearchableSelect
              value={areaId}
              onChange={handleAreaChange}
              items={areaOptions}
              placeholder="Select Area..."
              searchPlaceholder="Search area..."
              disabled={loading}
              loading={areasLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>

          {/* 3. Unit */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Unit</Label>
            <SearchableSelect
              value={unitId || unitName}
              onChange={handleUnitChange}
              items={unitOptions}
              placeholder="Select Unit..."
              searchPlaceholder="Search unit..."
              disabled={loading}
              loading={unitsLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>

          {/* 4. Department */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Department</Label>
            <SearchableSelect
              value={departmentId || departmentName}
              onChange={handleDepartmentChange}
              items={departmentOptions}
              placeholder="Select Department..."
              searchPlaceholder="Search department..."
              disabled={loading}
              loading={departmentsLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>

          {/* 5. Section */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Section</Label>
            <SearchableSelect
              value={sectionId || sectionName}
              onChange={handleSectionChange}
              items={sectionOptions}
              placeholder="Select Section..."
              searchPlaceholder="Search section..."
              disabled={loading}
              loading={sectionsLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>

          {/* 6. Line */}
          <div className="space-y-1">
            <Label className="text-[11px] font-semibold text-zinc-600 block">Line</Label>
            <SearchableSelect
              value={lineId || lineName}
              onChange={handleLineChange}
              items={lineOptions}
              placeholder="Select Line..."
              searchPlaceholder="Search line..."
              disabled={loading}
              loading={linesLoading}
              className="h-9.5 text-xs bg-white"
            />
          </div>
        </div>
      </div>

      {/* Footer Buttons */}
      <div className="flex justify-end gap-2.5 pt-2 border-t border-zinc-100">
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer disabled:opacity-50"
          onClick={onClose}
          disabled={loading}
        >
          <X className="h-3.5 w-3.5" />
          Cancel
        </button>

        <button
          type="submit"
          className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4.5 py-2 text-xs font-semibold text-white hover:bg-zinc-800 transition cursor-pointer disabled:opacity-60 shadow-sm"
          disabled={loading || !empName.trim()}
        >
          <Save className="h-3.5 w-3.5" />
          {loading ? "Saving Changes..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
};

export default EmployeeEditForm;
