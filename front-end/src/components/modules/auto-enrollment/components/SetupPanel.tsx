// src/components/modules/auto-enrollment/components/SetupPanel.tsx
"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import type { Camera } from "../types";
import { VideoOff, Play, RotateCcw, Building2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HrmCompany, HrmArea, HrmDepartment, HrmSection, HrmUnit, HrmLine } from "@/types/new-hrm-module";

export interface SetupPanelProps {
  cameraId: string;
  setCameraId: (v: string) => void;
  camerasWithLaptop: Camera[];
  selectedCamIsActive: boolean;
  busy: boolean;

  // Mode switcher ("hrm" | "erp")
  sourceMode: "hrm" | "erp";
  setSourceMode: (mode: "hrm" | "erp") => void;

  // New HRM Module props
  selectedHrmEmployeeId: string;
  setSelectedHrmEmployeeId: (v: string) => void;
  hrmCompanyId: string;
  setHrmCompanyId: (v: string) => void;
  hrmAreaId: string;
  setHrmAreaId: (v: string) => void;
  hrmDepartmentId: string;
  setHrmDepartmentId: (v: string) => void;
  hrmSectionId: string;
  setHrmSectionId: (v: string) => void;
  hrmUnitId: string;
  setHrmUnitId: (v: string) => void;
  hrmLineId: string;
  setHrmLineId: (v: string) => void;
  hrmCompanies: HrmCompany[];
  hrmCompaniesLoading?: boolean;
  hrmAreas: HrmArea[];
  hrmAreasLoading?: boolean;
  hrmDepartments: HrmDepartment[];
  hrmDepartmentsLoading?: boolean;
  hrmSections: HrmSection[];
  hrmSectionsLoading?: boolean;
  hrmUnits: HrmUnit[];
  hrmUnitsLoading?: boolean;
  hrmLines: HrmLine[];
  hrmLinesLoading?: boolean;
  hrmItems: Array<{ value: string; label: string; keywords?: string; image?: string }>;
  hrmLoading: boolean;
  hrmError: string | null;
  hrmSearch: string;
  setHrmSearch: (q: string) => void;
  onPickHrmEmployee: (empId: string) => void;

  // Old ERP employee selection props
  selectedErpEmployeeId: string;
  setSelectedErpEmployeeId: (v: string) => void;
  departmentFilter: string;
  setDepartmentFilter: (v: string) => void;
  departmentsList: Array<{ id: string; name: string }>;
  erpLoading: boolean;
  erpItems: Array<{ value: string; label: string; keywords?: string }>;
  erpError: string | null;
  erpSearch: string;
  setErpSearch: (q: string) => void;
  onPickEmployee: (empId: string) => void;

  // Common Form Fields
  unit: string;
  setUnit: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  section: string;
  setSection: (v: string) => void;
  line: string;
  setLine: (v: string) => void;
  employeeId: string;
  setEmployeeId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  reEnroll: boolean;
  lockEmployeeIdentity: boolean;

  // Actions
  start: () => void;
  startDisabled: boolean;
  tts: boolean;
  setTts: (v: boolean) => void;
  handleReset: () => void;
}

export const SetupPanel = React.memo(function SetupPanel({
  cameraId,
  setCameraId,
  camerasWithLaptop,
  selectedCamIsActive,
  busy,

  // Mode Switcher
  sourceMode,
  setSourceMode,

  // New HRM Module props
  selectedHrmEmployeeId,
  setSelectedHrmEmployeeId,
  hrmCompanyId,
  setHrmCompanyId,
  hrmAreaId,
  setHrmAreaId,
  hrmDepartmentId,
  setHrmDepartmentId,
  hrmSectionId,
  setHrmSectionId,
  hrmUnitId,
  setHrmUnitId,
  hrmLineId,
  setHrmLineId,
  hrmCompanies,
  hrmCompaniesLoading,
  hrmAreas,
  hrmAreasLoading,
  hrmDepartments,
  hrmDepartmentsLoading,
  hrmSections,
  hrmSectionsLoading,
  hrmUnits,
  hrmUnitsLoading,
  hrmLines,
  hrmLinesLoading,
  hrmItems,
  hrmLoading,
  hrmError,
  hrmSearch,
  setHrmSearch,
  onPickHrmEmployee,

  // Old ERP employee selection props
  selectedErpEmployeeId,
  setSelectedErpEmployeeId,
  departmentFilter,
  setDepartmentFilter,
  departmentsList,
  erpLoading,
  erpItems,
  erpError,
  erpSearch,
  setErpSearch,
  onPickEmployee,

  // Form fields
  unit,
  setUnit,
  department,
  setDepartment,
  section,
  setSection,
  line,
  setLine,
  employeeId,
  setEmployeeId,
  name,
  setName,
  reEnroll,
  lockEmployeeIdentity,

  // Action controls
  start,
  startDisabled,
  tts,
  setTts,
  handleReset,
}: SetupPanelProps) {
  // ERP Department search filter
  const [deptSearch, setDeptSearch] = React.useState("");

  const filteredDepartments = React.useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departmentsList;
    return departmentsList.filter((d) => d.name.toLowerCase().includes(q));
  }, [departmentsList, deptSearch]);

  const departmentOptions = React.useMemo(() => {
    const list = filteredDepartments.map((d) => ({
      value: d.id,
      label: d.name,
    }));
    return [{ value: "", label: "All departments" }, ...list];
  }, [filteredDepartments]);

  // HRM Select Options
  const companyOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Companies" },
      ...hrmCompanies.map((c) => ({
        value: c.id,
        label: c.company_name,
        keywords: `${c.company_name} ${c.company_code || ""} ${c.short_name || ""}`,
      })),
    ];
  }, [hrmCompanies]);

  const areaOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Areas" },
      ...hrmAreas.map((a) => {
        const name = a.area_name || a.area_name_in_english || a.short_name || a.area_code || a.id;
        return {
          value: a.id,
          label: name,
          keywords: `${name} ${a.area_code || ""} ${a.short_name || ""}`,
        };
      }),
    ];
  }, [hrmAreas]);

  const hrmDepartmentOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Departments" },
      ...hrmDepartments.map((d) => ({
        value: d.id,
        label: d.department_name,
      })),
    ];
  }, [hrmDepartments]);

  const sectionOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Sections" },
      ...hrmSections.map((s) => ({
        value: s.id,
        label: s.section_name,
      })),
    ];
  }, [hrmSections]);

  const unitOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Units" },
      ...hrmUnits.map((u) => ({
        value: u.id,
        label: u.unit_name,
      })),
    ];
  }, [hrmUnits]);

  const lineOptions = React.useMemo(() => {
    return [
      { value: "", label: "All Lines" },
      ...hrmLines.map((l) => ({
        value: l.id,
        label: l.line_name,
      })),
    ];
  }, [hrmLines]);

  const hasAnySelection =
    Boolean(selectedErpEmployeeId) ||
    Boolean(selectedHrmEmployeeId) ||
    Boolean(departmentFilter) ||
    Boolean(hrmCompanyId) ||
    Boolean(hrmAreaId) ||
    Boolean(hrmDepartmentId) ||
    Boolean(hrmSectionId) ||
    Boolean(hrmUnitId) ||
    Boolean(hrmLineId) ||
    Boolean(employeeId) ||
    Boolean(name) ||
    Boolean(unit) ||
    Boolean(department) ||
    Boolean(section) ||
    Boolean(line);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch w-full">
      {/* Left Column: Camera Config & Standby */}
      <div className="lg:col-span-5 flex flex-col gap-4">
        {/* Camera Selection Card */}
        <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-zinc-300">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-3.5">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">1) Camera Config</h2>
            <span
              className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${
                selectedCamIsActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-150"
                  : "bg-rose-50 text-rose-700 border-rose-150"
              }`}
            >
              {selectedCamIsActive ? "Active" : "Offline"}
            </span>
          </div>

          <div className="p-5">
            <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
              Select Camera
            </Label>
            <select
              className="mt-1.5 h-9 w-full rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-700 outline-none hover:border-zinc-300 focus:ring-1 focus:ring-zinc-400 transition-all"
              value={cameraId}
              onChange={(e) => setCameraId(e.target.value)}
              disabled={busy}
            >
              {camerasWithLaptop.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name ? `${c.name} (${c.id})` : c.id}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Standby Card */}
        <div className="flex-1 flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm p-6 items-center justify-center text-center min-h-[300px]">
          <div className="h-12 w-12 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 text-zinc-400 mb-3.5">
            <VideoOff className="h-5 w-5" />
          </div>
          <h3 className="text-xs font-bold text-zinc-800 uppercase tracking-wider">Camera Standby</h3>
          <p className="text-[11px] text-zinc-500 max-w-[260px] mt-2 leading-relaxed">
            Please complete the employee details on the right and click{" "}
            <b className="text-zinc-755">Start Setup</b> to activate the face capture session.
          </p>
        </div>
      </div>

      {/* Right Column: Employee Details */}
      <div className="lg:col-span-7 flex flex-col">
        <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-violet-500 h-full">
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-3.5">
            <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-wider">
              {reEnroll ? "2) Confirm Employee Details" : "2) Enter Employee Details"}
            </h2>

            {/* Source Mode Toggle */}
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="sourceModeSelection"
                  checked={sourceMode === "hrm"}
                  onChange={() => setSourceMode("hrm")}
                  className="h-3.5 w-3.5 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <span className={cn("text-[11px] font-bold", sourceMode === "hrm" ? "text-violet-700" : "text-zinc-500")}>
                  New HRM Module
                </span>
              </label>

              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="radio"
                  name="sourceModeSelection"
                  checked={sourceMode === "erp"}
                  onChange={() => setSourceMode("erp")}
                  className="h-3.5 w-3.5 text-violet-600 focus:ring-violet-500 cursor-pointer"
                />
                <span className={cn("text-[11px] font-bold", sourceMode === "erp" ? "text-violet-700" : "text-zinc-500")}>
                  Old ERP
                </span>
              </label>
            </div>
          </div>

          <div className="p-5 flex-1 space-y-4">
            {reEnroll && (
              <div className="rounded-md border border-emerald-150 bg-emerald-50/75 p-3 text-xs text-emerald-800 leading-relaxed">
                <b>Re-enrollment mode:</b> Starting this session will replace the existing face templates for this employee.
              </div>
            )}

            {/* ========================================================================= */}
            {/* NEW HRM MODULE SECTION */}
            {/* ========================================================================= */}
            {sourceMode === "hrm" && (
              <div className="space-y-4">
                {/* HRM Hierarchy Filters */}
                <div className="rounded-md border border-violet-100 bg-violet-50/30 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-zinc-800 flex items-center gap-1.5">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-violet-600" />
                        HRM Hierarchy Filter
                      </div>
                      <div className="text-[11px] text-zinc-500 mt-0.5">
                        Filter employee list by Company, Area, Department, Section, Unit, or Line.
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {/* 1. Company */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Company
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmCompanyId}
                          onChange={(val) => {
                            setHrmCompanyId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={companyOptions}
                          placeholder="All Companies"
                          searchPlaceholder="Search company..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmCompaniesLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>

                    {/* 2. Area */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Area
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmAreaId}
                          onChange={(val) => {
                            setHrmAreaId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={areaOptions}
                          placeholder="All Areas"
                          searchPlaceholder="Search area..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmAreasLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>

                    {/* 3. Department */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Department
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmDepartmentId}
                          onChange={(val) => {
                            setHrmDepartmentId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={hrmDepartmentOptions}
                          placeholder="All Departments"
                          searchPlaceholder="Search department..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmDepartmentsLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>

                    {/* 4. Section */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Section
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmSectionId}
                          onChange={(val) => {
                            setHrmSectionId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={sectionOptions}
                          placeholder="All Sections"
                          searchPlaceholder="Search section..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmSectionsLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>

                    {/* 5. Unit */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Unit
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmUnitId}
                          onChange={(val) => {
                            setHrmUnitId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={unitOptions}
                          placeholder="All Units"
                          searchPlaceholder="Search unit..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmUnitsLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>

                    {/* 6. Line */}
                    <div>
                      <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                        Line
                      </Label>
                      <div className="mt-1">
                        <SearchableSelect
                          value={hrmLineId}
                          onChange={(val) => {
                            setHrmLineId(val);
                            setSelectedHrmEmployeeId("");
                          }}
                          items={lineOptions}
                          placeholder="All Lines"
                          searchPlaceholder="Search line..."
                          disabled={busy || lockEmployeeIdentity}
                          loading={hrmLinesLoading}
                          minWidth="280px"
                          className="h-9 rounded-md border border-zinc-200 bg-white text-xs font-normal"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* HRM Employee Search Dropdown */}
                <div>
                  <Label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                    Select from HRM (search by Name or ID)
                  </Label>
                  <div className="mt-1.5 flex gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        value={selectedHrmEmployeeId}
                        items={hrmItems}
                        placeholder="Search employee in HRM..."
                        searchPlaceholder="Type name or employee code..."
                        disabled={busy || lockEmployeeIdentity}
                        loading={hrmLoading}
                        onSearchChange={(q) => setHrmSearch(q)}
                        onChange={(empId) => {
                          setSelectedHrmEmployeeId(empId);
                          onPickHrmEmployee(empId);
                        }}
                      />
                    </div>
                    {hasAnySelection && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        className="h-9 px-3 rounded-md border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                        title="Reset all fields"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Reset</span>
                      </Button>
                    )}
                  </div>
                  {hrmError ? (
                    <div className="text-xs text-red-600 mt-2">{hrmError}</div>
                  ) : (
                    <div className="text-[11px] text-zinc-450 mt-2">
                      Showing results for: <b className="text-zinc-600">{hrmSearch || "all employees"}</b>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* OLD ERP MODULE SECTION */}
            {/* ========================================================================= */}
            {sourceMode === "erp" && (
              <div className="space-y-4">
                {/* Department Filter */}
                <div className="rounded-md border border-zinc-150 bg-zinc-50/50 p-4 space-y-3">
                  <div>
                    <div className="text-xs font-bold text-zinc-700">Hierarchy Filter</div>
                    <div className="text-[11px] text-zinc-500 mt-0.5">
                      Select department to narrow down the employee search list.
                    </div>
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                      Department
                    </Label>
                    <div className="mt-1.5">
                      <SearchableSelect
                        value={departmentFilter}
                        onChange={(val) => {
                          setDepartmentFilter(val);
                          setSelectedErpEmployeeId("");
                        }}
                        items={departmentOptions}
                        placeholder="All departments"
                        searchPlaceholder="Search department..."
                        disabled={busy || lockEmployeeIdentity}
                        onSearchChange={(q) => setDeptSearch(q)}
                        minWidth="280px"
                        className="h-9 rounded-md border border-zinc-200 bg-white pl-3 text-left text-xs font-normal text-zinc-750 shadow-none hover:bg-zinc-50/50"
                      />
                    </div>
                  </div>
                </div>

                {/* ERP Search Dropdown */}
                <div>
                  <Label className="text-[10px] font-bold text-zinc-450 uppercase tracking-wider block">
                    Select from ERP (search by Name or ID)
                  </Label>
                  <div className="mt-1.5 flex gap-2">
                    <div className="flex-1 min-w-0">
                      <SearchableSelect
                        value={selectedErpEmployeeId}
                        items={erpItems}
                        placeholder="Search employee..."
                        searchPlaceholder="Type name or ID..."
                        disabled={busy || lockEmployeeIdentity}
                        loading={erpLoading}
                        onSearchChange={(q) => setErpSearch(q)}
                        onChange={(empId) => {
                          setSelectedErpEmployeeId(empId);
                          onPickEmployee(empId);
                        }}
                      />
                    </div>
                    {hasAnySelection && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleReset}
                        className="h-9 px-3 rounded-md border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
                        title="Reset all fields"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">Reset</span>
                      </Button>
                    )}
                  </div>
                  {erpError ? (
                    <div className="text-xs text-red-600 mt-2">{erpError}</div>
                  ) : (
                    <div className="text-[11px] text-zinc-450 mt-2">
                      Showing results for: <b className="text-zinc-600">{erpSearch || "all"}</b>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ========================================================================= */}
            {/* COMMON EMPLOYEE DETAILS FIELDS */}
            {/* ========================================================================= */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-zinc-100">
              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Employee ID
                </Label>
                <Input
                  value={employeeId}
                  onChange={(e) => setEmployeeId(e.target.value)}
                  placeholder="EMP001"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Name
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Unit
                </Label>
                <Input
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                  placeholder="e.g. Pakiza Apparels Limited"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Department
                </Label>
                <Input
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  placeholder="e.g. All over Printing"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Section
                </Label>
                <Input
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  placeholder="e.g. Printing (AOP)"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>

              <div className="space-y-1">
                <Label className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider block">
                  Line
                </Label>
                <Input
                  value={line}
                  onChange={(e) => setLine(e.target.value)}
                  placeholder="e.g. AOP"
                  disabled={busy || lockEmployeeIdentity}
                  className="h-9 rounded-md border-zinc-200 bg-white text-xs text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
                />
              </div>
            </div>
          </div>

          {/* Action Bar (Footer) */}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 bg-zinc-50/50 px-5 py-3.5 mt-auto">
            <Button
              onClick={start}
              disabled={startDisabled}
              className="h-9 px-4 rounded-md bg-violet-600 hover:bg-violet-700 text-white text-xs font-semibold uppercase tracking-wider transition-all shadow-md shadow-violet-600/10 flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="h-3.5 w-3.5" />
              <span>{busy ? "Starting..." : reEnroll ? "Start Re-enrollment" : "Start Setup"}</span>
            </Button>

            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={tts}
                onChange={(e) => setTts(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
              />
              <span className="text-xs font-semibold text-zinc-600">Voice instructions</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
});
