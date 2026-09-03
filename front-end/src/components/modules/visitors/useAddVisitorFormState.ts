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

export const fallbackVisitorTypes = ["Guest", "Contractor", "Official", "Interviewee", "Other"];
export const fallbackPurposes = ["Meeting", "Interview", "Delivery", "Audit", "Maintenance", "Other"];
export const idProofTypes = ["Employee ID", "NID", "Passport", "Driving License", "Other"];
export const extraGuestsOptions = Array.from({ length: 15 }, (_, i) => String(i + 1));

export function dhakaTodayString() { return new Date().toLocaleDateString("en-GB").split("/").reverse().join("-"); }
export function dhakaTimeString() { return new Date().toTimeString().split(" ")[0].substring(0, 5); }

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
  const [liveDetectionStatus, setLiveDetectionStatus] = useState<"idle" | "ok" | "no_face" | "multi_face" | "out_of_box">("idle");
  const [recognitionStatus, setRecognitionStatus] = useState<"idle" | "recognized" | "unrecognized">("idle");
  const [recognizedVisitorName, setRecognizedVisitorName] = useState<string | null>(null);
  const [isExtractingFace, setIsExtractingFace] = useState(false);

  const [deptSearch, setDeptSearch] = useState("");
  const [hostSearch, setHostSearch] = useState("");
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  const webcamRef = useRef<Webcam>(null);
  const liveDetectionRafRef = useRef<number | null>(null);
  const liveDetectionActiveRef = useRef(false);

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
    if (typeof window !== "undefined") setKbEnabled(localStorage.getItem("virtual-keyboard-enabled") !== "false");
    void loadFaceApiModels();
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
      } catch { /* fallback */ }
    }
    void loadMasterData();
    return () => { active = false; };
  }, []);

  const activeVisitorTypes = visitorTypesList.length > 0 ? visitorTypesList : fallbackVisitorTypes;
  const activePurposes = purposesList.length > 0 ? purposesList : fallbackPurposes;

  const { employees: erpEmployees, loading: erpLoading, setSearch: setErpSearch } = useErpEmployees();

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

  const departmentsList = useMemo(() => {
    const set = new Set<string>();
    erpEmployees.forEach((e) => {
      if (e.department?.trim()) set.add(e.department.trim());
    });
    return Array.from(set).sort();
  }, [erpEmployees]);

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

  const filteredDepartments = useMemo(() => {
    const q = deptSearch.trim().toLowerCase();
    if (!q) return departmentsList;
    return departmentsList.filter((d) => d.toLowerCase().includes(q));
  }, [departmentsList, deptSearch]);

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

  const handleDepartmentSelect = useCallback((deptVal: string) => {
    form.setValue("department", deptVal, { shouldValidate: true });
    form.setValue("hostEmployeeId", "");
    form.setValue("hostEmployeeName", "");
    form.setValue("hostPicUrl", "");
    setSelectedEmployee(null);
  }, [form]);

  const handleHostSelect = useCallback((empId: string) => {
    if (!empId) {
      setSelectedEmployee(null);
      form.setValue("hostEmployeeId", "");
      form.setValue("hostEmployeeName", "");
      form.setValue("hostPicUrl", "");
      return;
    }
    const found = erpEmployees.find((e) => e.employeeId === empId) || (selectedEmployee?.employeeId === empId ? selectedEmployee : null);
    if (found) {
      setSelectedEmployee(found);
      form.setValue("hostEmployeeId", found.employeeId, { shouldValidate: true });
      form.setValue("hostEmployeeName", found.employeeName, { shouldValidate: true });
      if (found.picUrl) form.setValue("hostPicUrl", found.picUrl);
      if (found.department) form.setValue("department", found.department, { shouldValidate: true });
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

  const runLiveFaceDetection = useCallback(async () => {
    if (!liveDetectionActiveRef.current) return;
    const video = webcamRef.current?.video;
    if (video && video.readyState === 4) {
      const boxes = await detectFacesLive(video);
      if (!boxes || boxes.length === 0) {
        setLiveDetectionStatus("no_face");
      } else if (boxes.length > 1) {
        setLiveDetectionStatus("multi_face");
      } else {
        const box = boxes[0];
        const vWidth = video.videoWidth || 640;
        const vHeight = video.videoHeight || 640;
        const guideLeft = vWidth * 0.2;
        const guideRight = vWidth * 0.8;
        const guideTop = vHeight * 0.18;
        const guideBottom = vHeight * 0.82;
        const faceCenterX = box.left + box.width / 2;
        const faceCenterY = box.top + box.height / 2;
        const isInBox =
          faceCenterX >= guideLeft &&
          faceCenterX <= guideRight &&
          faceCenterY >= guideTop &&
          faceCenterY <= guideBottom;
        setLiveDetectionStatus(isInBox ? "ok" : "out_of_box");
      }
    } else {
      setLiveDetectionStatus("idle");
    }
    if (liveDetectionActiveRef.current) {
      liveDetectionRafRef.current = requestAnimationFrame(runLiveFaceDetection);
    }
  }, []);

  useEffect(() => {
    if (isCameraActive) {
      liveDetectionActiveRef.current = true;
      liveDetectionRafRef.current = requestAnimationFrame(runLiveFaceDetection);
    } else {
      liveDetectionActiveRef.current = false;
      if (liveDetectionRafRef.current) cancelAnimationFrame(liveDetectionRafRef.current);
      setLiveDetectionStatus("idle");
    }
    return () => {
      liveDetectionActiveRef.current = false;
      if (liveDetectionRafRef.current) cancelAnimationFrame(liveDetectionRafRef.current);
    };
  }, [isCameraActive, runLiveFaceDetection]);

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

      // Extract client face descriptor if live video is available
      if (webcamRef.current?.video) {
        try {
          const res = await analyzeCapturedImage(webcamRef.current.video);
          if (res?.descriptor && res.descriptor.length > 0) {
            setCapturedEmbedding(res.descriptor);
          }
        } catch { /* optional client descriptor fallback */ }
      }

      // Perform backend-based face recognition & quality check
      const formData = new FormData();
      formData.append("visitorPhoto", file);

      const res = await axiosInstance.post("/visitors/recognize-face", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      if (res.data?.recognized && res.data?.visitor) {
        const v = res.data.visitor;
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
    isSubmitting, kbEnabled, activeVisitorTypes, activePurposes, idProofTypes, extraGuestsOptions,
    photoPreview, lookupAvatarUrl, isLookupEmployee, setIsLookupEmployee, lookupPhone, setLookupPhone,
    isPhoneReadOnly, isCameraActive, setIsCameraActive, liveDetectionStatus, recognitionStatus, recognizedVisitorName,
    isExtractingFace, webcamRef, cameraDevices, selectedDeviceId, setSelectedDeviceId,
    deptSearch, setDeptSearch, hostSearch, setHostSearch, departmentOptions, hostOptions,
    handleDepartmentSelect, handleHostSelect, handleResetHostAndDepartment, selectedEmployee,
    form, handleLookup, capturePhoto, handleReset, onSubmit, departmentsList, erpEmployees, erpLoading,
  };
}
