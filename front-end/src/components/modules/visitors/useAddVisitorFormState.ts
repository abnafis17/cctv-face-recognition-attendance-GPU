import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import Webcam from "react-webcam";
import axiosInstance, { API } from "@/config/axiosInstance";
import { visitorSchema, type VisitorFormValues } from "@/lib/validation/visitor-schema";
import { loadFaceApiModels, detectFacesLive, analyzeCapturedImage } from "@/lib/faceApi";
import { useErpEmployees } from "@/hooks/useErpEmployees";
import { useCameraDevices } from "@/hooks/useCameraDevices";

export const fallbackVisitorTypes = [
  "Guest",
  "Contractor",
  "Official",
  "Interviewee",
  "Other",
];
export const fallbackPurposes = [
  "Meeting",
  "Interview",
  "Delivery",
  "Audit",
  "Maintenance",
  "Other",
];
export const idProofTypes = [
  "Employee ID",
  "NID",
  "Passport",
  "Driving License",
  "Other",
];
export const extraGuestsOptions = Array.from({ length: 15 }, (_, i) => String(i + 1));

export function dhakaTodayString() {
  const today = new Date();
  return today.toLocaleDateString("en-GB").split("/").reverse().join("-");
}
export function dhakaTimeString() {
  const today = new Date();
  return today.toTimeString().split(" ")[0].substring(0, 5);
}

export function useAddVisitorFormState() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visitorTypesList, setVisitorTypesList] = useState<string[]>([]);
  const [purposesList, setPurposesList] = useState<string[]>([]);
  const [kbEnabled, setKbEnabled] = useState(true);

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lookupAvatarUrl, setLookupAvatarUrl] = useState<string | null>(null);
  const [isLookupEmployee, setIsLookupEmployee] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [isPhoneReadOnly, setIsPhoneReadOnly] = useState(false);
  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [capturedEmbedding, setCapturedEmbedding] = useState<number[] | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [liveDetectionStatus, setLiveDetectionStatus] = useState<
    "idle" | "ok" | "no_face" | "multi_face" | "out_of_box"
  >("idle");
  const [recognitionStatus, setRecognitionStatus] = useState<
    "idle" | "scanning" | "recognized" | "unrecognized"
  >("idle");
  const [recognizedVisitorName, setRecognizedVisitorName] = useState<string | null>(null);
  const [isExtractingFace, setIsExtractingFace] = useState(false);

  const [deptSearch, setDeptSearch] = useState("");
  const [hostSearch, setHostSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [departmentsList, setDepartmentsList] = useState<string[]>([]);

  const webcamRef = useRef<Webcam>(null);
  const liveDetectionRafRef = useRef<number | null>(null);
  const liveDetectionActiveRef = useRef(false);
  const isRecognizedRef = useRef(false);

  const { devices: cameraDevices, selectedDeviceId, setSelectedDeviceId } = useCameraDevices();

  // Smart camera selection: If default device is iVCam/virtual, auto-switch to physical camera if available
  useEffect(() => {
    if (cameraDevices.length > 0) {
      const physicalDev = cameraDevices.find((d) => {
        const lbl = (d.label || "").toLowerCase();
        return !lbl.includes("ivcam") && !lbl.includes("obs") && !lbl.includes("virtual") && !lbl.includes("droidcam");
      });
      if (physicalDev && selectedDeviceId && (cameraDevices.find(d => d.deviceId === selectedDeviceId)?.label || "").toLowerCase().includes("ivcam")) {
        setSelectedDeviceId(physicalDev.deviceId);
      }
    }
  }, [cameraDevices, selectedDeviceId, setSelectedDeviceId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setKbEnabled(localStorage.getItem("virtual-keyboard-enabled") !== "false");
    }
    void loadFaceApiModels().catch((e) => console.warn("Failed to pre-warm face-api models:", e));
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMasterData() {
      try {
        const [vtRes, povRes] = await Promise.all([
          axiosInstance.get(API.MASTER_DATA_VISITOR_TYPES, { params: { limit: 1000 } }),
          axiosInstance.get(API.MASTER_DATA_PURPOSES_OF_VISIT, { params: { limit: 1000 } }),
        ]);
        if (!active) return;
        setVisitorTypesList((vtRes.data?.items || []).map((x: any) => x.name));
        setPurposesList((povRes.data?.items || []).map((x: any) => x.name));
      } catch (error) {
        console.error("Failed to load visitor master data options", error);
      }
    }
    void loadMasterData();
    return () => { active = false; };
  }, []);

  const activeVisitorTypes = visitorTypesList.length > 0 ? visitorTypesList : fallbackVisitorTypes;
  const activePurposes = purposesList.length > 0 ? purposesList : fallbackPurposes;

  const { employees: erpEmployees, loading: erpLoading, setSearch: setErpSearch } = useErpEmployees({
    debounceMs: 350,
    initialSearch: "",
    autoFetch: true,
    filterByOrg: true,
  });

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      visitorName: "", contactNumber: "", emailAddress: "", companyAddress: "", visitorType: "",
      purposeOfVisit: "", department: "", hostEmployeeId: "", hostEmployeeName: "", hostPicUrl: "",
      hostDesignationId: "", hostDesignationName: "", idProofType: "", idProofNumber: "", vehicleNumber: "",
      extraGuest: "", visitorPassNo: "", dateOfVisit: dhakaTodayString(), timeIn: dhakaTimeString(),
      entryAuthorizedBy: "", remarks: "", visitorPhoto: "",
    },
  });

  const selectedDepartment = form.watch("department");
  const selectedHostId = form.watch("hostEmployeeId");

  const derivedDepartments = useMemo(() => {
    const depts = erpEmployees
      .map((e) => e.department)
      .filter(Boolean)
      .map((d) => (d || "").trim());
    return Array.from(new Set(depts)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [erpEmployees]);

  useEffect(() => {
    if (erpEmployees.length > 0) {
      const depts = erpEmployees
        .map((e) => e.department)
        .filter(Boolean)
        .map((d) => (d || "").trim());
      const uniqueDepts = Array.from(new Set(depts));
      if (uniqueDepts.length > 0) {
        setDepartmentsList((prev) => {
          const combined = Array.from(new Set([...prev, ...uniqueDepts])).sort(
            (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" })
          );
          return combined;
        });
      }
    }
  }, [erpEmployees]);

  const activeDepartments = departmentsList.length > 0 ? departmentsList : derivedDepartments;

  useEffect(() => {
    if (
      selectedEmployee &&
      (selectedEmployee.department || "").trim().toLowerCase() === (selectedDepartment || "").trim().toLowerCase() &&
      !hostSearch.trim() &&
      !deptSearch.trim()
    ) {
      return;
    }
    const q = hostSearch.trim() || deptSearch.trim() || selectedDepartment || "";
    setErpSearch(q);
  }, [hostSearch, deptSearch, selectedDepartment, selectedEmployee, setErpSearch]);

  // Synchronize department change with host clearing (from Jetson-orin-nano logic)
  useEffect(() => {
    if (!selectedDepartment || !selectedHostId) return;
    const currentHost = selectedEmployee && selectedEmployee.employeeId === selectedHostId
      ? selectedEmployee
      : erpEmployees.find((e) => e.employeeId === selectedHostId);

    if (currentHost) {
      if ((currentHost.department || "").toLowerCase() !== selectedDepartment.toLowerCase()) {
        form.setValue("hostEmployeeId", "");
        form.setValue("hostEmployeeName", "");
        form.setValue("hostPicUrl", "");
        form.setValue("hostDesignationId", "");
        form.setValue("hostDesignationName", "");
        setSelectedEmployee(null);
      }
    }
  }, [selectedDepartment, selectedHostId, selectedEmployee, erpEmployees, form]);

  const filteredDepartments = useMemo(() => {
    const list = activeDepartments;
    const q = deptSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.toLowerCase().includes(q));
  }, [activeDepartments, deptSearch]);

  const departmentOptions = useMemo(() => {
    return filteredDepartments.map((d) => ({ value: d, label: d }));
  }, [filteredDepartments]);

  const filteredHostEmployees = useMemo(() => {
    let list = erpEmployees;
    if (selectedDepartment) {
      list = list.filter((e) => (e.department || "").toLowerCase() === selectedDepartment.toLowerCase());
    }
    const q = hostSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) => e.employeeName.toLowerCase().includes(q) || e.employeeId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [erpEmployees, selectedDepartment, hostSearch]);

  const hostOptions = useMemo(() => {
    const options = filteredHostEmployees.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId}`,
      image: e.picUrl || undefined,
    }));
    if (selectedEmployee && !options.some((o) => o.value === selectedEmployee.employeeId)) {
      options.unshift({
        value: selectedEmployee.employeeId,
        label: `${selectedEmployee.employeeName} (${selectedEmployee.employeeId})`,
        keywords: `${selectedEmployee.employeeName} ${selectedEmployee.employeeId}`,
        image: selectedEmployee.picUrl || undefined,
      });
    }
    return options;
  }, [filteredHostEmployees, selectedEmployee]);

  const extraGuestValue = form.watch("extraGuest");
  const extraGuestsCount = extraGuestValue ? parseInt(extraGuestValue, 10) : 0;

  const visitorPassPlaceholder =
    extraGuestsCount > 0
      ? `e.g. PASS123, ${Array.from({ length: extraGuestsCount }, (_, i) => `PASS${124 + i}`).join(", ")} (1 self + ${extraGuestsCount} extra guest${extraGuestsCount > 1 ? "s" : ""})`
      : "Pass / badge number";

  const handleDepartmentSelect = useCallback((deptVal: string) => {
    form.setValue("department", deptVal, { shouldValidate: true });
    form.setValue("hostEmployeeId", "");
    form.setValue("hostEmployeeName", "");
    form.setValue("hostPicUrl", "");
    form.setValue("hostDesignationId", "");
    form.setValue("hostDesignationName", "");
    setSelectedEmployee(null);
  }, [form]);

  const handleHostSelect = useCallback((empId: string) => {
    if (!empId) {
      setSelectedEmployee(null);
      form.setValue("hostEmployeeId", "");
      form.setValue("hostEmployeeName", "");
      form.setValue("hostPicUrl", "");
      form.setValue("hostDesignationId", "");
      form.setValue("hostDesignationName", "");
      return;
    }
    const found = erpEmployees.find((e) => e.employeeId === empId) || (selectedEmployee?.employeeId === empId ? selectedEmployee : null);
    if (found) {
      setSelectedEmployee(found);
      if (found.department) {
        form.setValue("department", found.department, { shouldValidate: true });
      }
      form.setValue("hostEmployeeId", found.employeeId, { shouldValidate: true });
      form.setValue("hostEmployeeName", found.employeeName, { shouldValidate: true });
      form.setValue("hostPicUrl", found.picUrl || "");
      form.setValue("hostDesignationId", found.designationId || "");
      form.setValue("hostDesignationName", found.designation || "");
    }
  }, [erpEmployees, selectedEmployee, form]);

  const handleResetHostAndDepartment = useCallback(() => {
    form.setValue("hostEmployeeId", "");
    form.setValue("hostEmployeeName", "");
    form.setValue("hostPicUrl", "");
    form.setValue("hostDesignationId", "");
    form.setValue("hostDesignationName", "");
    form.setValue("department", "");
    setSelectedEmployee(null);
    setHostSearch("");
    setDeptSearch("");
    toast.success("Host and department selection reset");
  }, [form]);

  // Exact Jetson-Orin-Nano Live Face Detection Algorithm (Box Zone 18%-82% & 72% Overlap Ratio)
  const FACE_BOX_TOP = 0.18;
  const FACE_BOX_BOTTOM = 0.82;
  const FACE_BOX_LEFT = 0.2;
  const FACE_BOX_RIGHT = 0.8;
  const OVERLAP_THRESHOLD = 0.72;

  useEffect(() => {
    if (!isCameraActive) {
      liveDetectionActiveRef.current = false;
      if (liveDetectionRafRef.current !== null) {
        cancelAnimationFrame(liveDetectionRafRef.current);
        liveDetectionRafRef.current = null;
      }
      setLiveDetectionStatus("idle");
      return;
    }

    let frameSkip = 0;
    liveDetectionActiveRef.current = true;

    const detectLoop = async () => {
      if (!liveDetectionActiveRef.current) return;

      frameSkip++;
      if (frameSkip < 8) {
        liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      frameSkip = 0;

      try {
        const video = (webcamRef.current as any)?.video as HTMLVideoElement | null;
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          if (liveDetectionActiveRef.current) {
            liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
          }
          return;
        }

        const detections = await detectFacesLive(video);
        if (!liveDetectionActiveRef.current) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (!detections || detections.length === 0) {
          setLiveDetectionStatus("no_face");
        } else if (detections.length > 1) {
          setLiveDetectionStatus("multi_face");
        } else {
          const box = detections[0];
          const gTop = FACE_BOX_TOP * vh;
          const gBottom = FACE_BOX_BOTTOM * vh;
          const gLeft = FACE_BOX_LEFT * vw;
          const gRight = FACE_BOX_RIGHT * vw;

          const overlapTop = Math.max(box.top, gTop);
          const overlapBottom = Math.min(box.bottom, gBottom);
          const overlapLeft = Math.max(box.left, gLeft);
          const overlapRight = Math.min(box.right, gRight);

          const overlapW = Math.max(0, overlapRight - overlapLeft);
          const overlapH = Math.max(0, overlapBottom - overlapTop);
          const overlapArea = overlapW * overlapH;
          const faceArea = box.width * box.height;
          const overlapRatio = faceArea > 0 ? overlapArea / faceArea : 0;

          setLiveDetectionStatus(
            overlapRatio >= OVERLAP_THRESHOLD ? "ok" : "out_of_box"
          );
        }
      } catch {
        /* ignore */
      }

      if (liveDetectionActiveRef.current) {
        liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
      }
    };

    const startTimer = setTimeout(() => {
      liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
    }, 600);

    return () => {
      clearTimeout(startTimer);
      liveDetectionActiveRef.current = false;
      if (liveDetectionRafRef.current !== null) {
        cancelAnimationFrame(liveDetectionRafRef.current);
        liveDetectionRafRef.current = null;
      }
    };
  }, [isCameraActive]);

  useEffect(() => {
    if (!isCameraActive) {
      if (recognitionStatus === "scanning") {
        setRecognitionStatus("idle");
      }
    }
  }, [isCameraActive, recognitionStatus]);

  const handleLookup = useCallback(async () => {
    const queryVal = lookupPhone.trim();
    if (!queryVal) {
      toast.error(isLookupEmployee ? "Please enter an employee ID to search" : "Please enter a phone number to search");
      return;
    }
    if (!isLookupEmployee && !/^(\+88)?01[3-9]\d{8}$/.test(queryVal)) {
      toast.error("Invalid mobile number format");
      return;
    }

    const toastId = toast.loading("Searching for visitor/employee record...");
    try {
      const response = await axiosInstance.get("/visitors/lookup", {
        params: { phone: queryVal, isEmployee: isLookupEmployee },
      });

      if (response.data?.found && response.data?.data) {
        const row = response.data.data;
        form.setValue("visitorName", row.visitorName || "");
        let returnedContact = row.contactNumber || "";
        if (!isLookupEmployee && !returnedContact) {
          returnedContact = queryVal;
        }
        const isValidMobile = /^(\+88)?01[3-9]\d{8}$/.test(returnedContact);
        form.setValue("contactNumber", isValidMobile ? returnedContact : "");
        form.setValue("emailAddress", row.emailAddress || "");
        form.setValue("companyAddress", row.companyAddress || "");

        const returnedPhoto = row.visitorPhoto || row.picUrl || "";
        setLookupAvatarUrl(returnedPhoto || null);
        form.setValue("visitorPhoto", "");
        setIsPhoneReadOnly(false);
        toast.success(
          `${response.data.type === "employee" ? "Employee" : "Visitor"} record loaded successfully!`,
          { id: toastId }
        );
      } else {
        toast.error(
          isLookupEmployee
            ? "No employee record found matching this ID"
            : "No visitor record found matching this phone number",
          { id: toastId }
        );
        if (!isLookupEmployee) {
          form.setValue("contactNumber", queryVal);
          setIsPhoneReadOnly(false);
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Lookup search failed", { id: toastId });
    }
  }, [lookupPhone, isLookupEmployee, form]);

  const capturePhoto = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) { toast.error("Failed to capture screenshot from camera"); return; }
    setIsExtractingFace(true);
    const toastId = toast.loading("Processing photo & verifying face on backend...");
    try {
      setPhotoPreview(imageSrc);
      form.setValue("visitorPhoto", imageSrc);
      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const file = new File([blob], "visitor_photo.jpg", { type: "image/jpeg" });
      setCapturedFile(file);

      // Perform backend-based face recognition & quality check
      const formData = new FormData();
      formData.append("visitorPhoto", file);

      const res = await axiosInstance.post("/visitors/recognize-face", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.recognized && res.data?.visitor) {
        const v = res.data.visitor;
        isRecognizedRef.current = true;
        setRecognitionStatus("recognized");
        setRecognizedVisitorName(v.visitorName || "Visitor");
        form.setValue("visitorName", v.visitorName || "");
        form.setValue("contactNumber", v.contactNumber || "");
        form.setValue("emailAddress", v.emailAddress || "");
        form.setValue("companyAddress", v.companyAddress || "");
        setLookupAvatarUrl(v.visitorPhoto || v.picUrl || null);
        setIsPhoneReadOnly(false);
        toast.success(
          `Recognized Visitor: ${v.visitorName}! Submission will update stored profile image.`,
          { id: toastId }
        );
      } else {
        setRecognitionStatus("unrecognized");
        setRecognizedVisitorName(null);
        toast.success("Photo captured & verified by backend. Ready for submission!", { id: toastId });
      }
      setIsCameraActive(false);
    } catch (err: any) {
      console.error("Failed analyzing captured photo on backend", err);
      const errMsg = err?.response?.data?.error || "Captured photo rejected by backend";
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsExtractingFace(false);
    }
  }, [form]);

  const handleReset = useCallback((showToast = true) => {
    form.reset({
      visitorName: "", contactNumber: "", emailAddress: "", companyAddress: "", visitorType: "",
      purposeOfVisit: "", department: "", hostEmployeeId: "", hostEmployeeName: "", hostPicUrl: "",
      hostDesignationId: "", hostDesignationName: "", idProofType: "", idProofNumber: "", vehicleNumber: "",
      extraGuest: "", visitorPassNo: "", dateOfVisit: dhakaTodayString(), timeIn: dhakaTimeString(),
      entryAuthorizedBy: "", remarks: "", visitorPhoto: "",
    });
    setPhotoPreview(null); setLookupAvatarUrl(null); setLookupPhone(""); setCapturedFile(null);
    setCapturedEmbedding(null); setRecognitionStatus("idle"); setRecognizedVisitorName(null);
    setIsCameraActive(false); setIsPhoneReadOnly(false); setSelectedEmployee(null);
    setHostSearch(""); setDeptSearch("");
    isRecognizedRef.current = false;
    if (showToast) toast.success("Form cleared");
  }, [form]);

  const onSubmit = useCallback(async (data: VisitorFormValues) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, val]) => {
        if (key === "visitorPhoto") {
          if (capturedFile) formData.append("visitorPhoto", capturedFile);
          else if (val) formData.append("visitorPhoto", val);
        } else formData.append(key, val || "");
      });
      if (capturedEmbedding && capturedEmbedding.length > 0) {
        formData.append("faceEmbedding", JSON.stringify(capturedEmbedding));
      }
      const res = await axiosInstance.post("/visitors", formData, { headers: { "Content-Type": "multipart/form-data" } });
      if (res.data?.ok) {
        toast.success("Visitor registered & face template processed by backend!");
        handleReset(false);
      } else toast.error(res.data?.error || "Registration failed");
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  }, [capturedFile, capturedEmbedding, handleReset]);

  return {
    isSubmitting, kbEnabled, setKbEnabled, activeVisitorTypes, activePurposes, idProofTypes, extraGuestsOptions,
    photoPreview, lookupAvatarUrl, isLookupEmployee, setIsLookupEmployee, lookupPhone, setLookupPhone,
    isPhoneReadOnly, isCameraActive, setIsCameraActive, liveDetectionStatus, recognitionStatus, recognizedVisitorName,
    isExtractingFace, webcamRef, cameraDevices, selectedDeviceId, setSelectedDeviceId,
    deptSearch, setDeptSearch, hostSearch, setHostSearch, departmentOptions, hostOptions,
    handleDepartmentSelect, handleHostSelect, handleResetHostAndDepartment, selectedEmployee,
    visitorPassPlaceholder, extraGuestsCount,
    form, handleLookup, capturePhoto, handleReset, onSubmit, departmentsList, erpEmployees, erpLoading,
  };
}
