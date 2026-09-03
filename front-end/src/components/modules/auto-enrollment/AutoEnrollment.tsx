"use client";

import React, { useMemo, useState, useCallback } from "react";
import type { Camera, Step } from "./types";
import { SCAN_1, SCAN_2, STEPS } from "./constants";
import { stepLabel } from "./utils";
import { SetupPanel } from "./components/SetupPanel";
import { EnrollmentPanel } from "./components/EnrollmentPanel";
import { useErpEmployees, type ErpEmployee } from "@/hooks/useErpEmployees";
import { useErpDepartments } from "@/hooks/useErpDepartments";
import { useAutoEnrollmentContainer } from "./useAutoEnrollmentContainer";

export default function AutoEnrollment({
  cameras,
  loadCameras,
  initialEmployeeId = "",
  initialName = "",
  reEnroll = false,
}: {
  cameras: Camera[];
  loadCameras: () => Promise<void>;
  initialEmployeeId?: string;
  initialName?: string;
  reEnroll?: boolean;
}) {
  const container = useAutoEnrollmentContainer({
    cameras,
    loadCameras,
    initialEmployeeId,
    initialName,
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

  const { employees, loading: erpLoading, error: erpError, setSearch: setErpSearch } = useErpEmployees({
    debounceMs: 350,
    initialSearch: "",
    pageSize: 20,
    pageNumber: 1,
  });

  const [selectedErpEmployeeId, setSelectedErpEmployeeId] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<ErpEmployee | null>(null);
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const { departments: erpDepartments } = useErpDepartments();
  const lockEmployeeIdentity = reEnroll && !!initialEmployeeId;

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

  const handleReset = useCallback(() => {
    setSelectedErpEmployeeId("");
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setErpSearch("");
    container.setEmployeeId("");
    container.setName("");
  }, [container, setErpSearch]);

  const erpItems = useMemo(
    () =>
      employees.map((e) => ({
        value: e.employeeId,
        label: `${e.employeeName} (${e.employeeId})`,
        keywords: `${e.employeeName} ${e.employeeId} ${e.unit} ${e.department} ${e.section} ${e.line}`,
      })),
    [employees]
  );

  return (
    <div className="flex flex-col gap-4 w-full">
      {container.screen === "setup" && (
        <SetupPanel
          cameraId={container.cameraId}
          setCameraId={container.setCameraId}
          camerasWithLaptop={container.camerasWithLaptop}
          selectedCamIsActive={container.selectedCamIsActive}
          busy={container.busy}
          selectedErpEmployeeId={selectedErpEmployeeId}
          setSelectedErpEmployeeId={setSelectedErpEmployeeId}
          departmentFilter={departmentFilter}
          setDepartmentFilter={setDepartmentFilter}
          departmentsList={erpDepartments}
          erpLoading={erpLoading}
          unit={container.unit}
          setUnit={container.setUnit}
          department={container.department}
          setDepartment={container.setDepartment}
          section={container.section}
          setSection={container.setSection}
          line={container.line}
          setLine={container.setLine}
          erpItems={erpItems}
          erpError={erpError}
          erpSearch={employeeSearch}
          setErpSearch={setEmployeeSearch}
          onPickEmployee={onPickEmployee}
          employeeId={container.employeeId}
          setEmployeeId={container.setEmployeeId}
          name={container.name}
          setName={container.setName}
          reEnroll={reEnroll}
          lockEmployeeIdentity={lockEmployeeIdentity}
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
