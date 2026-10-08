"use client";

import React, { useMemo, useState, useCallback } from "react";
import type { Camera, Step } from "./types";
import { SCAN_1, SCAN_2, STEPS } from "./constants";
import { stepLabel } from "./utils";
import { SetupPanel } from "./components/SetupPanel";
import { EnrollmentPanel } from "./components/EnrollmentPanel";
import { useErpEmployees, type ErpEmployee } from "@/hooks/useErpEmployees";
import { useErpDepartments } from "@/hooks/useErpDepartments";
import { useHrmEmployees } from "@/hooks/useHrmEmployees";
import { useAutoEnrollmentContainer } from "./useAutoEnrollmentContainer";

export default function AutoEnrollment({
  cameras,
  loadCameras,
  initialEmployeeId = "",
  initialName = "",
  initialUnit = "",
  initialDepartment = "",
  initialSection = "",
  initialLine = "",
  reEnroll = false,
}: {
  cameras: Camera[];
  loadCameras: () => Promise<void>;
  initialEmployeeId?: string;
  initialName?: string;
  initialUnit?: string;
  initialDepartment?: string;
  initialSection?: string;
  initialLine?: string;
  reEnroll?: boolean;
}) {
  const container = useAutoEnrollmentContainer({
    cameras,
    loadCameras,
    initialEmployeeId,
    initialName,
    initialUnit,
    initialDepartment,
    initialSection,
    initialLine,
    reEnroll,
  });

  const {
    session,
    collected = {},
    doneCount = 0,
    pct = 0,
    scan1Done = 0,
    scan2Done = 0,
    phase = "First scan",
    currentStep = "front" as Step,
    title = "",
    hint = "",
    multiWarn = false,
  } = useMemo(() => {
    const collectedData = container.session?.collected ?? {};
    const done = STEPS.filter((s) => (collectedData?.[s] || 0) > 0).length;
    const progressPct = Math.round((done / STEPS.length) * 100);
    const s1Done = SCAN_1.filter((s) => (collectedData?.[s] || 0) > 0).length;
    const s2Done = SCAN_2.filter((s) => (collectedData?.[s] || 0) > 0).length;

    const currentPhase =
      s1Done < SCAN_1.length
        ? "First scan"
        : s2Done < SCAN_2.length
        ? "Second scan"
        : "Finishing";

    const step = (container.session?.current_step as Step) || "front";
    const statusTitle =
      container.session?.status === "saved"
        ? "Setup complete"
        : container.session?.status === "saving"
        ? "Saving…"
        : container.session?.status === "error"
        ? "Something went wrong"
        : stepLabel(step);

    const statusHint =
      container.session?.status === "saved"
        ? "Enrollment saved. This person can now be recognized."
        : container.session?.status === "saving"
        ? "Please keep still for a moment."
        : container.session?.status === "error"
        ? container.session?.last_message || "Please try again."
        : container.session?.last_message || "Position your face in the frame.";

    return {
      session: container.session,
      collected: collectedData,
      doneCount: done,
      pct: progressPct,
      scan1Done: s1Done,
      scan2Done: s2Done,
      phase: currentPhase,
      currentStep: step,
      title: statusTitle,
      hint: statusHint,
      multiWarn: !!container.session?.overlay_multi_in_roi,
    };
  }, [container.session]);

  // Mode: "hrm" (New HRM Module) or "erp" (Old ERP)
  const [sourceMode, setSourceMode] = useState<"hrm" | "erp">("hrm");

  // =========================================================================
  // HRM Module Hook & State
  // =========================================================================
  const hrm = useHrmEmployees({
    debounceMs: 350,
    initialSearch: initialEmployeeId || "",
  });

  const [selectedHrmEmployeeId, setSelectedHrmEmployeeId] = useState(initialEmployeeId || "");

  // =========================================================================
  // Old ERP Hook & State
  // =========================================================================
  const { employees, loading: erpLoading, error: erpError, setSearch: setErpSearch } = useErpEmployees({
    debounceMs: 350,
    initialSearch: initialEmployeeId || "",
    pageSize: 100,
    pageNumber: 1,
  });

  const [selectedErpEmployeeId, setSelectedErpEmployeeId] = useState(initialEmployeeId || "");
  const [selectedEmployee, setSelectedEmployee] = useState<ErpEmployee | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState(initialEmployeeId || "");
  const { departments: erpDepartments } = useErpDepartments();
  const lockEmployeeIdentity = reEnroll && !!initialEmployeeId;

  React.useEffect(() => {
    if (!initialEmployeeId) return;
    setSelectedErpEmployeeId(initialEmployeeId);
    setSelectedHrmEmployeeId(initialEmployeeId);
    setEmployeeSearch(initialEmployeeId);
    setErpSearch(initialEmployeeId);
    hrm.setSearch(initialEmployeeId);
  }, [initialEmployeeId, setErpSearch, hrm]);

  // Sync initial ERP employee
  React.useEffect(() => {
    if (!initialEmployeeId) return;
    const picked = employees.find((e) => e.employeeId === initialEmployeeId);
    if (!picked) return;
    setSelectedEmployee(picked);
    container.setEmployeeId(picked.employeeId);
    if (picked.employeeName) container.setName(picked.employeeName);
    if (picked.unit) container.setUnit(picked.unit);
    if (picked.department) container.setDepartment(picked.department);
    if (picked.section) container.setSection(picked.section);
    if (picked.line) container.setLine(picked.line);
    if (picked.deptId) container.setDeptId(picked.deptId);
    if (picked.sectionId) container.setSectionId(picked.sectionId);
    if (picked.designationId) container.setDesignationId(picked.designationId);
    if (picked.designation) container.setDesignation(picked.designation);
    if (picked.unitId) container.setUnitId(picked.unitId);
    if (picked.lineId) container.setLineId(picked.lineId);
    if (picked.picUrl) container.setEmpPicUrl(picked.picUrl);
  }, [employees, initialEmployeeId, container]);

  // Sync initial HRM employee
  React.useEffect(() => {
    if (!initialEmployeeId) return;
    const picked = hrm.employees.find(
      (e) =>
        e.employee_id_system === initialEmployeeId ||
        e.employee_code === initialEmployeeId ||
        e.employee_id === initialEmployeeId ||
        e.employee_id_company === initialEmployeeId ||
        e.id === initialEmployeeId
    );
    if (!picked) return;
    const resolvedEmpId = picked.employee_id_system || picked.employee_id || picked.employee_code || picked.id;
    const resolvedName = picked.name || picked.name_in_english || picked.name_in_bengali || "";
    const resolvedDeptId = picked.department_id || "";
    const resolvedDeptName =
      picked.department_name ||
      hrm.departments.find((d) => d.id === resolvedDeptId)?.department_name ||
      "";
    const resolvedUnitId = picked.unit_id || "";
    const resolvedUnitName =
      picked.unit_name ||
      hrm.units.find((u) => u.id === resolvedUnitId)?.unit_name ||
      "";
    const resolvedSectionId = picked.section_id || "";
    const resolvedSectionName =
      picked.section_name ||
      hrm.sections.find((s) => s.id === resolvedSectionId)?.section_name ||
      "";
    const resolvedLineId = picked.line_id || "";
    const resolvedLineName =
      picked.line_name ||
      hrm.lines.find((l) => l.id === resolvedLineId)?.line_name ||
      "";
    const resolvedCompanyId = picked.company_id || "";
    const resolvedCompanyName =
      picked.company_name ||
      hrm.companies.find((c) => c.id === resolvedCompanyId)?.company_name ||
      "";
    const resolvedAreaId = picked.area_id || picked.working_area_id || "";
    const resolvedAreaName =
      picked.area_name ||
      hrm.areas.find((a) => a.id === resolvedAreaId)?.area_name ||
      "";

    container.setEmployeeId(resolvedEmpId);
    if (resolvedName) container.setName(resolvedName);
    if (resolvedUnitName) container.setUnit(resolvedUnitName);
    if (resolvedDeptName) container.setDepartment(resolvedDeptName);
    if (resolvedSectionName) container.setSection(resolvedSectionName);
    if (resolvedLineName) container.setLine(resolvedLineName);
    if (resolvedDeptId) container.setDeptId(resolvedDeptId);
    if (resolvedSectionId) container.setSectionId(resolvedSectionId);
    if (resolvedUnitId) container.setUnitId(resolvedUnitId);
    if (resolvedLineId) container.setLineId(resolvedLineId);
    if (picked.designation_id) container.setDesignationId(picked.designation_id);
    if (picked.designation) container.setDesignation(picked.designation);
    if (picked.profile_pic || picked.employee_portrait) container.setEmpPicUrl(picked.profile_pic || picked.employee_portrait || "");
    if (resolvedCompanyId) container.setErpCompanyId(resolvedCompanyId);
    if (resolvedCompanyName) container.setErpCompanyName(resolvedCompanyName);
    if (resolvedAreaId) container.setErpAreaId(resolvedAreaId);
    if (resolvedAreaName) container.setErpAreaName(resolvedAreaName);
  }, [hrm.employees, hrm.departments, hrm.units, hrm.sections, hrm.lines, hrm.companies, hrm.areas, initialEmployeeId, container]);

  // Reactive sync when master lists load after an employee ID was already set
  React.useEffect(() => {
    if (container.deptId && !container.department && hrm.departments.length > 0) {
      const match = hrm.departments.find((d) => d.id === container.deptId);
      if (match?.department_name) container.setDepartment(match.department_name);
    }
    if (container.unitId && !container.unit && hrm.units.length > 0) {
      const match = hrm.units.find((u) => u.id === container.unitId);
      if (match?.unit_name) container.setUnit(match.unit_name);
    }
    if (container.sectionId && !container.section && hrm.sections.length > 0) {
      const match = hrm.sections.find((s) => s.id === container.sectionId);
      if (match?.section_name) container.setSection(match.section_name);
    }
    if (container.lineId && !container.line && hrm.lines.length > 0) {
      const match = hrm.lines.find((l) => l.id === container.lineId);
      if (match?.line_name) container.setLine(match.line_name);
    }
    if (container.erpCompanyId && !container.erpCompanyName && hrm.companies.length > 0) {
      const match = hrm.companies.find((c) => c.id === container.erpCompanyId);
      if (match?.company_name) container.setErpCompanyName(match.company_name);
    }
    if (container.erpAreaId && !container.erpAreaName && hrm.areas.length > 0) {
      const match = hrm.areas.find((a) => a.id === container.erpAreaId);
      if (match?.area_name) container.setErpAreaName(match.area_name);
    }
  }, [
    container.deptId,
    container.department,
    container.unitId,
    container.unit,
    container.sectionId,
    container.section,
    container.lineId,
    container.line,
    container.erpCompanyId,
    container.erpCompanyName,
    container.erpAreaId,
    container.erpAreaName,
    hrm.departments,
    hrm.units,
    hrm.sections,
    hrm.lines,
    hrm.companies,
    hrm.areas,
    container,
  ]);

  // ERP Search & Department handlers
  const handleErpSearchChange = useCallback(
    (q: string) => {
      setEmployeeSearch(q);
      if (q) {
        setErpSearch(q);
      } else if (departmentFilter) {
        const selectedDeptObj = erpDepartments.find(
          (d) => d.id === departmentFilter || d.name === departmentFilter
        );
        setErpSearch(selectedDeptObj?.name || departmentFilter);
      } else {
        setErpSearch("");
      }
    },
    [departmentFilter, erpDepartments, setErpSearch]
  );

  const handleDepartmentChange = useCallback(
    (deptVal: string) => {
      setDepartmentFilter(deptVal);
      setSelectedErpEmployeeId("");
      if (deptVal) {
        const selectedDeptObj = erpDepartments.find(
          (d) => d.id === deptVal || d.name === deptVal
        );
        const targetName = selectedDeptObj?.name || deptVal;
        setErpSearch(targetName);
      } else {
        setErpSearch(employeeSearch || "");
      }
    },
    [erpDepartments, employeeSearch, setErpSearch]
  );

  const onPickEmployee = useCallback(
    (empId: string) => {
      const picked =
        employees.find((e) => e.employeeId === empId) ||
        (selectedEmployee?.employeeId === empId ? selectedEmployee : null);
      if (!picked) return;
      setSelectedEmployee(picked);
      container.setEmployeeId(picked.employeeId);
      container.setName(picked.employeeName);
      container.setUnit(picked.unit || "");
      container.setDepartment(picked.department || "");
      container.setSection(picked.section || "");
      container.setLine(picked.line || "");
      container.setDeptId(picked.deptId || "");
      container.setSectionId(picked.sectionId || "");
      container.setDesignationId(picked.designationId || "");
      container.setDesignation(picked.designation || "");
      container.setUnitId(picked.unitId || "");
      container.setLineId(picked.lineId || "");
      container.setEmpPicUrl(picked.picUrl || "");
    },
    [container, employees, selectedEmployee]
  );

  // HRM Employee Pick handler
  const onPickHrmEmployee = useCallback(
    (empId: string) => {
      const picked = hrm.employees.find(
        (e) =>
          e.employee_id_system === empId ||
          e.employee_code === empId ||
          e.employee_id === empId ||
          e.employee_id_company === empId ||
          e.id === empId
      );
      if (!picked) return;

      const resolvedEmpId = picked.employee_id_system || picked.employee_id || picked.employee_code || picked.id;
      const resolvedName = picked.name || picked.name_in_english || picked.name_in_bengali || "";
      const resolvedDeptId = picked.department_id || "";
      const resolvedDeptName =
        picked.department_name ||
        hrm.departments.find((d) => d.id === resolvedDeptId)?.department_name ||
        "";
      const resolvedUnitId = picked.unit_id || "";
      const resolvedUnitName =
        picked.unit_name ||
        hrm.units.find((u) => u.id === resolvedUnitId)?.unit_name ||
        "";
      const resolvedSectionId = picked.section_id || "";
      const resolvedSectionName =
        picked.section_name ||
        hrm.sections.find((s) => s.id === resolvedSectionId)?.section_name ||
        "";
      const resolvedLineId = picked.line_id || "";
      const resolvedLineName =
        picked.line_name ||
        hrm.lines.find((l) => l.id === resolvedLineId)?.line_name ||
        "";
      const resolvedCompanyId = picked.company_id || "";
      const resolvedCompanyName =
        picked.company_name ||
        hrm.companies.find((c) => c.id === resolvedCompanyId)?.company_name ||
        "";
      const resolvedAreaId = picked.area_id || picked.working_area_id || "";
      const resolvedAreaName =
        picked.area_name ||
        hrm.areas.find((a) => a.id === resolvedAreaId)?.area_name ||
        "";

      container.setEmployeeId(resolvedEmpId);
      container.setName(resolvedName);
      container.setUnit(resolvedUnitName);
      container.setDepartment(resolvedDeptName);
      container.setSection(resolvedSectionName);
      container.setLine(resolvedLineName);
      container.setDeptId(resolvedDeptId);
      container.setSectionId(resolvedSectionId);
      container.setUnitId(resolvedUnitId);
      container.setLineId(resolvedLineId);
      container.setDesignationId(picked.designation_id || "");
      container.setDesignation(picked.designation || "");
      container.setEmpPicUrl(picked.profile_pic || picked.employee_portrait || "");
      container.setErpCompanyId(resolvedCompanyId);
      container.setErpCompanyName(resolvedCompanyName);
      container.setErpAreaId(resolvedAreaId);
      container.setErpAreaName(resolvedAreaName);
    },
    [container, hrm.departments, hrm.units, hrm.sections, hrm.lines, hrm.companies, hrm.areas, hrm.employees]
  );

  const handleReset = useCallback(() => {
    // Reset ERP
    setSelectedErpEmployeeId("");
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setErpSearch("");
    setDepartmentFilter("");

    // Reset HRM
    setSelectedHrmEmployeeId("");
    hrm.resetFilters();

    // Reset form fields
    container.setEmployeeId("");
    container.setName("");
    container.setUnit("");
    container.setDepartment("");
    container.setSection("");
    container.setLine("");
    container.setDeptId("");
    container.setSectionId("");
    container.setDesignationId("");
    container.setDesignation("");
    container.setUnitId("");
    container.setLineId("");
    container.setEmpPicUrl("");
    container.setErpCompanyId("");
    container.setErpCompanyName("");
    container.setErpAreaId("");
    container.setErpAreaName("");
  }, [container, setErpSearch, hrm]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (departmentFilter) {
      const selectedDeptObj = erpDepartments.find(
        (d) => d.id === departmentFilter || d.name === departmentFilter
      );
      const targetName = (selectedDeptObj?.name || departmentFilter).toLowerCase().trim();
      const targetId = (selectedDeptObj?.id || departmentFilter).toLowerCase().trim();

      list = list.filter((e) => {
        const empDeptName = (e.department || e.deptName || "").toLowerCase().trim();
        const empDeptId = (e.deptId || e.mainDeptId || "").toLowerCase().trim();
        return (
          empDeptName === targetName ||
          (targetId && empDeptId === targetId) ||
          (targetName && empDeptName.includes(targetName)) ||
          (targetName && targetName.includes(empDeptName))
        );
      });
    }
    return list;
  }, [employees, departmentFilter, erpDepartments]);

  const erpItems = useMemo(() => {
    const options = filteredEmployees.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId} ${e.unit} ${e.department} ${e.section} ${e.line}`,
    }));

    const targetEmpId = selectedEmployee?.employeeId || initialEmployeeId;
    const targetEmpName = selectedEmployee?.employeeName || initialName || container.name;

    if (targetEmpId && !options.some((o) => o.value === targetEmpId)) {
      options.unshift({
        value: targetEmpId,
        label: targetEmpName ? `${targetEmpName} (${targetEmpId})` : targetEmpId,
        keywords: `${targetEmpName} ${targetEmpId}`,
      });
    }

    return options;
  }, [filteredEmployees, selectedEmployee, initialEmployeeId, initialName, container.name]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {container.screen === "setup" && (
        <SetupPanel
          cameraId={container.cameraId}
          setCameraId={container.setCameraId}
          camerasWithLaptop={container.camerasWithLaptop}
          selectedCamIsActive={container.selectedCamIsActive}
          busy={container.busy}

          // Source mode
          sourceMode={sourceMode}
          setSourceMode={setSourceMode}

          // HRM props
          selectedHrmEmployeeId={selectedHrmEmployeeId}
          setSelectedHrmEmployeeId={setSelectedHrmEmployeeId}
          hrmCompanyId={hrm.companyId}
          setHrmCompanyId={hrm.setCompanyId}
          hrmAreaId={hrm.areaId}
          setHrmAreaId={hrm.setAreaId}
          hrmDepartmentId={hrm.departmentId}
          setHrmDepartmentId={hrm.setDepartmentId}
          hrmSectionId={hrm.sectionId}
          setHrmSectionId={hrm.setSectionId}
          hrmUnitId={hrm.unitId}
          setHrmUnitId={hrm.setUnitId}
          hrmLineId={hrm.lineId}
          setHrmLineId={hrm.setLineId}
          hrmCompanies={hrm.companies}
          hrmCompaniesLoading={hrm.companiesLoading}
          hrmAreas={hrm.areas}
          hrmAreasLoading={hrm.areasLoading}
          hrmDepartments={hrm.departments}
          hrmDepartmentsLoading={hrm.departmentsLoading}
          hrmSections={hrm.sections}
          hrmSectionsLoading={hrm.sectionsLoading}
          hrmUnits={hrm.units}
          hrmUnitsLoading={hrm.unitsLoading}
          hrmLines={hrm.lines}
          hrmLinesLoading={hrm.linesLoading}
          hrmItems={hrm.hrmItems}
          hrmLoading={hrm.loading}
          hrmError={hrm.error}
          hrmSearch={hrm.search}
          setHrmSearch={hrm.setSearch}
          onPickHrmEmployee={onPickHrmEmployee}

          // ERP props
          selectedErpEmployeeId={selectedErpEmployeeId}
          setSelectedErpEmployeeId={setSelectedErpEmployeeId}
          departmentFilter={departmentFilter}
          setDepartmentFilter={handleDepartmentChange}
          departmentsList={erpDepartments}
          erpLoading={erpLoading}
          erpItems={erpItems}
          erpError={erpError}
          erpSearch={employeeSearch}
          setErpSearch={handleErpSearchChange}
          onPickEmployee={onPickEmployee}

          // Form fields
          unit={container.unit}
          setUnit={container.setUnit}
          department={container.department}
          setDepartment={container.setDepartment}
          section={container.section}
          setSection={container.setSection}
          line={container.line}
          setLine={container.setLine}
          employeeId={container.employeeId}
          setEmployeeId={container.setEmployeeId}
          name={container.name}
          setName={container.setName}
          reEnroll={reEnroll}
          lockEmployeeIdentity={lockEmployeeIdentity}

          // Actions
          start={container.start}
          startDisabled={container.startDisabled}
          tts={container.tts}
          setTts={container.setTts}
          handleReset={handleReset}
        />
      )}

      {container.screen === "enrolling" && (
        <EnrollmentPanel
          cameraId={container.cameraId}
          laptopCameraId={container.laptopCameraId}
          laptopActive={container.laptopActive}
          previewVideoRef={container.previewVideoRef}
          streamSrc={container.streamSrc}
          imgKey={container.imgKey}
          streamHasFrame={container.streamHasFrame}
          streamRetries={container.streamRetries}
          onFrame={container.onFrame}
          onError={container.onError}
          session={session}
          pct={pct}
          phase={phase}
          doneCount={doneCount}
          scan1Done={scan1Done}
          scan2Done={scan2Done}
          title={title}
          hint={hint}
          currentStep={currentStep}
          multiWarn={multiWarn}
          busy={container.busy}
          stop={container.stop}
          tts={container.tts}
          setTts={container.setTts}
        />
      )}
    </div>
  );
}
