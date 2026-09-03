import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AI_HOST } from "@/config/axiosInstance";
import { getCompanyIdFromToken } from "@/lib/authStorage";
import { useErpEmployees, type ErpEmployee } from "@/hooks/useErpEmployees";
import { useErpDepartments } from "@/hooks/useErpDepartments";
import type { Camera, Step } from "./types";
import { DEFAULT_LAPTOP_CAMERA_ID, SCAN_1, SCAN_2, STEPS } from "./constants";
import { stepLabel } from "./utils";
import { useTTS } from "./hooks/useTTS";
import { useMjpegStream } from "./hooks/useMjpegStream";
import { useLaptopCameraWebRTC } from "./hooks/useLaptopCameraWebRTC";
import { useCameraControls } from "./hooks/useCameraControls";
import { useAutoEnrollSession } from "./hooks/useAutoEnrollSession";
import { useEnrollmentVoice } from "./hooks/useEnrollmentVoice";

export function useAutoEnrollmentContainer({
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

  const { camerasWithLaptop, ensureCameraOn, stopCamera } = useCameraControls({
    cameras,
    loadCameras,
    laptopCameraId,
    laptopActive,
    startLaptopCamera,
    stopLaptopCamera,
  });

  useEffect(() => {
    if (!cameraId && camerasWithLaptop?.length) setCameraId(camerasWithLaptop[0].id);
  }, [camerasWithLaptop, cameraId]);

  const selectedCam = useMemo(
    () => camerasWithLaptop.find((c) => c.id === cameraId),
    [camerasWithLaptop, cameraId]
  );

  const selectedCamIsActive = useMemo(() => {
    if (!cameraId) return false;
    if (cameraId === laptopCameraId) return laptopActive;
    return selectedCam?.isActive === true;
  }, [cameraId, laptopActive, laptopCameraId, selectedCam?.isActive]);

  const streamUrl = useMemo(() => {
    if (!cameraId) return "";
    return `${AI_HOST}/camera/enroll2/auto/stream/${encodeURIComponent(cameraId)}`;
  }, [cameraId]);

  const [tts, setTts] = useState(true);
  const speak = useTTS(tts);

  const onStopCleanup = useCallback(() => {
    window.speechSynthesis.cancel();
  }, []);

  const sessionState = useAutoEnrollSession({
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

  const mjpegState = useMjpegStream({
    streamUrl,
    enabled: sessionState.screen === "enrolling",
  });

  useEnrollmentVoice({
    session: sessionState.session,
    sessionStatus: sessionState.sessionStatus,
    speak,
  });

  return {
    companyId,
    laptopCameraId,
    cameraId,
    setCameraId,
    employeeId,
    setEmployeeId,
    name,
    setName,
    unit,
    setUnit,
    department,
    setDepartment,
    section,
    setSection,
    line,
    setLine,
    deptId,
    setDeptId,
    sectionId,
    setSectionId,
    designationId,
    setDesignationId,
    designation,
    setDesignation,
    unitId,
    setUnitId,
    lineId,
    setLineId,
    empPicUrl,
    setEmpPicUrl,
    previewVideoRef,
    laptopActive,
    camerasWithLaptop,
    selectedCamIsActive,
    streamUrl,
    tts,
    setTts,
    ...sessionState,
    ...mjpegState,
  };
}
