"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Badge } from "@/components/ui/badge";

import { AI_HOST } from "@/config/axiosInstance";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useErpEmployees, type ErpEmployee } from "@/hooks/useErpEmployees";
import { useErpDepartments, type ErpDepartment } from "@/hooks/useErpDepartments";

import type { Camera, Step } from "./types";
import { DEFAULT_LAPTOP_CAMERA_ID, SCAN_1, SCAN_2, STEPS } from "./constants";
import { stepLabel } from "./utils";

import { useTTS } from "./hooks/useTTS";
import { useMjpegStream } from "./hooks/useMjpegStream";
import { useLaptopCameraWebRTC } from "./hooks/useLaptopCameraWebRTC";
import { useCameraControls } from "./hooks/useCameraControls";
import { useAutoEnrollSession } from "./hooks/useAutoEnrollSession";
import { useEnrollmentVoice } from "./hooks/useEnrollmentVoice";

import { SetupPanel } from "./components/SetupPanel";
import { EnrollmentPanel } from "./components/EnrollmentPanel";

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
  const companyId = getCompanyIdFromToken();
  const laptopCameraId = companyId ? `laptop-${companyId}` : DEFAULT_LAPTOP_CAMERA_ID;

  const [cameraId, setCameraId] = useState<string>(laptopCameraId);
  const [employeeId, setEmployeeId] = useState(initialEmployeeId);
  const [name, setName] = useState(initialName);
  const [unit, setUnit] = useState("");
  const [department, setDepartment] = useState("");
  const [section, setSection] = useState("");
  const [line, setLine] = useState("");
  const [deptId, setDeptId] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [designation, setDesignation] = useState("");
  const [unitId, setUnitId] = useState("");
  const [lineId, setLineId] = useState("");
  const [empPicUrl, setEmpPicUrl] = useState("");

  // ---- Laptop camera WebRTC publisher (to AI server) ----
  const {
    previewVideoRef,
    laptopActive,
    startLaptopCamera,
    stopLaptopCamera,
    attachPreviewIfNeeded,
  } = useLaptopCameraWebRTC({
    laptopCameraId,
    companyId,
    aiHost: AI_HOST,
  });

  // ---- Cameras list + controls ----
  const { camerasWithLaptop, ensureCameraOn, stopCamera } = useCameraControls({
    cameras,
    loadCameras,
    laptopCameraId,
    laptopActive,
    startLaptopCamera,
    stopLaptopCamera,
  });

  // when cameras load async, set initial camera once (safe + lint clean)
  useEffect(() => {
    if (!cameraId && camerasWithLaptop?.length) setCameraId(camerasWithLaptop[0].id);
  }, [camerasWithLaptop, cameraId]);

  useEffect(() => {
    if (!initialEmployeeId) return;
    setEmployeeId(initialEmployeeId);
  }, [initialEmployeeId]);

  useEffect(() => {
    if (!initialName) return;
    setName(initialName);
  }, [initialName]);

  const selectedCam = useMemo(
    () => camerasWithLaptop.find((c) => c.id === cameraId),
    [camerasWithLaptop, cameraId]
  );

  const selectedCamIsActive = useMemo(() => {
    if (!cameraId) return false;
    if (cameraId === laptopCameraId) return laptopActive;
    return selectedCam?.isActive === true;
  }, [cameraId, laptopActive, laptopCameraId, selectedCam?.isActive]);

  // ---- Stream URL (AI server) ----
  const streamUrl = useMemo(() => {
    if (!cameraId) return "";
    return `${AI_HOST}/camera/enroll2/auto/stream/${encodeURIComponent(cameraId)}`;
  }, [cameraId]);

  // ---- TTS ----
  const [tts, setTts] = useState(true);
  const speak = useTTS(tts);

  // ---- Session state (start/stop/poll) ----
  const onStopCleanup = useCallback(() => {
    // clear MJPEG (done by resetStream effect below)
    // stop any speaking
    window.speechSynthesis.cancel();
  }, []);

  const {
    session,
    running,
    busy,
    screen,
    sessionStatus,
    start,
    stop,
    startDisabled,
  } = useAutoEnrollSession({
    cameraId,
    employeeId,
    name,
    unit,
    department,
    section,
    line,
    deptId,
    sectionId,
    designationId,
    designation,
    unitId,
    lineId,
    empPicUrl,
    reEnroll,
    ensureCameraOn,
    stopCamera,
    onStopCleanup,
  });

  // ---- MJPEG stream management (enabled only on enrolling screen) ----
  const {
    streamSrc,
    streamHasFrame,
    streamRetries,
    imgKey,
    onFrame,
    onError,
    resetStream,
  } = useMjpegStream({
    streamUrl,
    enabled: screen === "enrolling",
  });

  // When enrolling (or camera changes), force a fresh MJPEG connection
  useEffect(() => {
    if (screen !== "enrolling") return;
    resetStream();
  }, [cameraId, resetStream, screen]);

  // If the local stream starts before the enrolling UI mounts, attach it once the <video> exists.
  useEffect(() => {
    if (screen !== "enrolling") return;
    if (cameraId !== laptopCameraId) return;
    if (streamHasFrame) return;

    attachPreviewIfNeeded();
  }, [attachPreviewIfNeeded, cameraId, laptopCameraId, screen, streamHasFrame]);

  // ---- Voice behavior (identical logic) ----
  useEnrollmentVoice({ session, sessionStatus, speak });

  // ---- Progress calculations (memoized) ----
  const collected = useMemo(() => session?.collected ?? {}, [session?.collected]);

  const doneCount = useMemo(() => {
    return STEPS.filter((s) => (collected?.[s] || 0) > 0).length;
  }, [collected]);

  const pct = useMemo(() => Math.round((doneCount / STEPS.length) * 100), [doneCount]);

  const scan1Done = useMemo(() => SCAN_1.filter((s) => (collected?.[s] || 0) > 0).length, [
    collected,
  ]);

  const scan2Done = useMemo(() => SCAN_2.filter((s) => (collected?.[s] || 0) > 0).length, [
    collected,
  ]);

  const phase =
    scan1Done < SCAN_1.length
      ? "First scan"
      : scan2Done < SCAN_2.length
      ? "Second scan"
      : "Finishing";

  const currentStep = (session?.current_step as Step) || "front";

  const title =
    session?.status === "saved"
      ? "Setup complete"
      : session?.status === "saving"
      ? "Saving…"
      : session?.status === "error"
      ? "Something went wrong"
      : stepLabel(currentStep);

  const hint =
    session?.status === "saved"
      ? "Enrollment saved. This person can now be recognized."
      : session?.status === "saving"
      ? "Please keep still for a moment."
      : session?.status === "error"
      ? session?.last_message || "Please try again."
      : session?.last_message || "Position your face in the frame.";

  const multiWarn = !!session?.overlay_multi_in_roi;

  // ---- ERP employee search & picker ----
  const {
    search: erpSearch,
    setSearch: setErpSearch,
    employees,
    loading: erpLoading,
    error: erpError,
  } = useErpEmployees({
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
  const clearedAfterSuccessRef = useRef(false);

  const selectedDeptName = useMemo(() => {
    if (!departmentFilter) return "";
    return erpDepartments.find((d) => d.id === departmentFilter)?.name || "";
  }, [departmentFilter, erpDepartments]);

  // Trigger ERP search based on department filter selection or employeeSearch
  useEffect(() => {
    if (selectedDeptName) {
      // If a department is selected, search the ERP API by department name
      setErpSearch(selectedDeptName);
    } else {
      // If no department is selected, search by the typed query (or empty string for full list)
      setErpSearch(employeeSearch.trim());
    }
  }, [employeeSearch, selectedDeptName, setErpSearch]);

  useEffect(() => {
    if (sessionStatus !== "saved") {
      clearedAfterSuccessRef.current = false;
      return;
    }
    if (clearedAfterSuccessRef.current) return;
    if (lockEmployeeIdentity) return;

    setEmployeeId("");
    setName("");
    setUnit("");
    setDepartment("");
    setSection("");
    setLine("");
    setDeptId("");
    setSectionId("");
    setDesignationId("");
    setDesignation("");
    setUnitId("");
    setLineId("");
    setEmpPicUrl("");
    setSelectedErpEmployeeId("");
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setErpSearch("");
    setDepartmentFilter("");
    clearedAfterSuccessRef.current = true;
  }, [lockEmployeeIdentity, sessionStatus, setErpSearch]);

  useEffect(() => {
    if (!initialEmployeeId) return;
    setSelectedErpEmployeeId(initialEmployeeId);
  }, [initialEmployeeId]);

  useEffect(() => {
    if (!initialEmployeeId) return;
    const picked = employees.find((e) => e.employeeId === initialEmployeeId);
    if (!picked) return;
    setSelectedEmployee(picked);
    if (!initialName) setName(picked.employeeName);
    setUnit(picked.unit || "");
    setDepartment(picked.department || "");
    setSection(picked.section || "");
    setLine(picked.line || "");
    setDeptId(picked.deptId || "");
    setSectionId(picked.sectionId || "");
    setDesignationId(picked.designationId || "");
    setDesignation(picked.designation || "");
    setUnitId(picked.unitId || "");
    setLineId(picked.lineId || "");
    setEmpPicUrl(picked.picUrl || "");
  }, [employees, initialEmployeeId, initialName, setName]);

  const filteredEmployees = useMemo(() => {
    let list = employees;
    if (departmentFilter) {
      // When a department is selected, we filter the employees locally by the typed search query
      const q = employeeSearch.trim().toLowerCase();
      if (q) {
        list = list.filter(
          (e) =>
            e.employeeName.toLowerCase().includes(q) ||
            e.employeeId.toLowerCase().includes(q)
        );
      }
    }
    return list;
  }, [employees, departmentFilter, employeeSearch]);

  const erpItems = useMemo(() => {
    const options = filteredEmployees.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId} ${e.unit} ${e.department} ${e.section} ${e.line}`,
    }));

    if (selectedEmployee && !options.some((o) => o.value === selectedEmployee.employeeId)) {
      options.unshift({
        value: selectedEmployee.employeeId,
        label: `${selectedEmployee.employeeName} (${selectedEmployee.employeeId})`,
        keywords: `${selectedEmployee.employeeName} ${selectedEmployee.employeeId} ${selectedEmployee.unit} ${selectedEmployee.department} ${selectedEmployee.section} ${selectedEmployee.line}`,
      });
    }

    return options;
  }, [filteredEmployees, selectedEmployee]);

  const onPickEmployee = useCallback(
    (empId: string) => {
      const picked = employees.find((e) => e.employeeId === empId) ||
                     (selectedEmployee?.employeeId === empId ? selectedEmployee : null);
      if (!picked) return;
      setSelectedEmployee(picked);
      setEmployeeId(picked.employeeId);
      setName(picked.employeeName);
      setUnit(picked.unit || "");
      setDepartment(picked.department || "");
      setSection(picked.section || "");
      setLine(picked.line || "");
      setDeptId(picked.deptId || "");
      setSectionId(picked.sectionId || "");
      setDesignationId(picked.designationId || "");
      setDesignation(picked.designation || "");
      setUnitId(picked.unitId || "");
      setLineId(picked.lineId || "");
      setEmpPicUrl(picked.picUrl || "");
    },
    [employees, selectedEmployee]
  );

  const handleReset = useCallback(() => {
    setSelectedErpEmployeeId("");
    setSelectedEmployee(null);
    setEmployeeSearch("");
    setErpSearch("");
    setEmployeeId("");
    setName("");
    setUnit("");
    setDepartment("");
    setSection("");
    setLine("");
    setDeptId("");
    setSectionId("");
    setDesignationId("");
    setDesignation("");
    setUnitId("");
    setLineId("");
    setEmpPicUrl("");
    setDepartmentFilter("");
  }, [setErpSearch]);

  return (
    <div className="flex flex-col gap-4 w-full">
      {screen === "setup" && (
        <SetupPanel
          cameraId={cameraId}
          setCameraId={setCameraId}
          camerasWithLaptop={camerasWithLaptop}
          selectedCamIsActive={selectedCamIsActive}
          busy={busy}
          selectedErpEmployeeId={selectedErpEmployeeId}
          setSelectedErpEmployeeId={setSelectedErpEmployeeId}
          departmentFilter={departmentFilter}
          setDepartmentFilter={setDepartmentFilter}
          departmentsList={erpDepartments}
          erpLoading={erpLoading}
          unit={unit}
          setUnit={setUnit}
          department={department}
          setDepartment={setDepartment}
          section={section}
          setSection={setSection}
          line={line}
          setLine={setLine}
          erpItems={erpItems}
          erpError={erpError}
          erpSearch={employeeSearch}
          setErpSearch={setEmployeeSearch}
          onPickEmployee={onPickEmployee}
          employeeId={employeeId}
          setEmployeeId={setEmployeeId}
          name={name}
          setName={setName}
          reEnroll={reEnroll}
          lockEmployeeIdentity={lockEmployeeIdentity}
          start={start}
          startDisabled={startDisabled}
          tts={tts}
          setTts={setTts}
          handleReset={handleReset}
        />
      )}

      {screen === "enrolling" && (
        <EnrollmentPanel
          cameraId={cameraId}
          laptopCameraId={laptopCameraId}
          laptopActive={laptopActive}
          previewVideoRef={previewVideoRef}
          streamSrc={streamSrc}
          imgKey={imgKey}
          streamHasFrame={streamHasFrame}
          streamRetries={streamRetries}
          onFrame={onFrame}
          onError={onError}
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
          busy={busy}
          stop={stop}
          tts={tts}
          setTts={setTts}
        />
      )}
    </div>
  );
}
