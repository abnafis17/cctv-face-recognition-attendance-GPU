"use client";

import React, {
  useState,
  useMemo,
  useEffect,
  useRef,
  useCallback,
} from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  User,
  Phone,
  Mail,
  Building,
  Search,
  Users,
  Briefcase,
  Shield,
  CreditCard,
  Car,
  Ticket,
  Clock,
  Calendar,
  UserCheck,
  FileText,
  Camera,
  RotateCcw,
  CheckCircle,
  HelpCircle,
  ArrowRightLeft,
  CalendarDays,
  Keyboard,
  Loader2,
  Scan,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  extractFaceDescriptor,
  analyzeCapturedImage,
  loadFaceApiModels,
  detectFacesLive,
} from "@/lib/faceApi";
import { cn } from "@/lib/utils";
import {
  visitorSchema,
  type VisitorFormValues,
} from "@/lib/validation/visitor-schema";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import toast from "react-hot-toast";
import { useErpEmployees } from "@/hooks/useErpEmployees";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import axiosInstance, { API } from "@/config/axiosInstance";
import Webcam from "react-webcam";
import { VirtualKeyboard } from "@/components/reusable/VirtualKeyboard";

const fallbackVisitorTypes = [
  "Guest",
  "Contractor",
  "Official",
  "Interviewee",
  "Other",
];
const fallbackPurposes = [
  "Meeting",
  "Interview",
  "Delivery",
  "Audit",
  "Maintenance",
  "Other",
];
const idProofTypes = [
  "Employee ID",
  "NID",
  "Passport",
  "Driving License",
  "Other",
];
const extraGuestsOptions = Array.from({ length: 15 }, (_, i) => String(i + 1));

export default function AddVisitorPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [visitorTypesList, setVisitorTypesList] = useState<string[]>([]);
  const [purposesList, setPurposesList] = useState<string[]>([]);
  const [kbEnabled, setKbEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setKbEnabled(
        localStorage.getItem("virtual-keyboard-enabled") !== "false",
      );
    }
  }, []);

  useEffect(() => {
    let active = true;
    async function loadMasterData() {
      try {
        const [vtRes, povRes] = await Promise.all([
          axiosInstance.get(API.MASTER_DATA_VISITOR_TYPES, {
            params: { limit: 1000 },
          }),
          axiosInstance.get(API.MASTER_DATA_PURPOSES_OF_VISIT, {
            params: { limit: 1000 },
          }),
        ]);
        if (!active) return;
        const vtNames = (vtRes.data?.items || []).map((x: any) => x.name);
        const povNames = (povRes.data?.items || []).map((x: any) => x.name);
        setVisitorTypesList(vtNames);
        setPurposesList(povNames);
      } catch (error) {
        console.error("Failed to load visitor master data options", error);
      }
    }
    void loadMasterData();
    return () => {
      active = false;
    };
  }, []);

  const activeVisitorTypes =
    visitorTypesList.length > 0 ? visitorTypesList : fallbackVisitorTypes;
  const activePurposes =
    purposesList.length > 0 ? purposesList : fallbackPurposes;

  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [lookupAvatarUrl, setLookupAvatarUrl] = useState<string | null>(null);
  const [isLookupEmployee, setIsLookupEmployee] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [isPhoneReadOnly, setIsPhoneReadOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Live face detection state: idle=camera not started, ok=face in box, no_face, multi_face, out_of_box
  const [liveDetectionStatus, setLiveDetectionStatus] = useState<
    "idle" | "ok" | "no_face" | "multi_face" | "out_of_box"
  >("idle");
  const liveDetectionRafRef = useRef<number | null>(null);
  const liveDetectionActiveRef = useRef(false);

  useEffect(() => {
    setIsMounted(true);
    void loadFaceApiModels().catch((e) =>
      console.warn("Failed to pre-warm face-api models:", e),
    );
  }, []);

  // ── Real-time live face detection loop ──────────────────────────────────
  // Box zone (must match overlay): top 18%→82%, left 20%→80% of video dims
  const FACE_BOX_TOP = 0.18;
  const FACE_BOX_BOTTOM = 0.82;
  const FACE_BOX_LEFT = 0.2;
  const FACE_BOX_RIGHT = 0.8;
  // How much of the face bbox must be inside the guide box (0–1)
  const OVERLAP_THRESHOLD = 0.72;

  useEffect(() => {
    if (!isCameraActive) {
      // Cancel any running loop and reset
      liveDetectionActiveRef.current = false;
      if (liveDetectionRafRef.current !== null) {
        cancelAnimationFrame(liveDetectionRafRef.current);
        liveDetectionRafRef.current = null;
      }
      setLiveDetectionStatus("idle");
      return;
    }

    // Wait a tick for Webcam to mount and models to load
    let frameSkip = 0;
    liveDetectionActiveRef.current = true;

    const detectLoop = async () => {
      if (!liveDetectionActiveRef.current) return;

      // Throttle: run detection every ~8 frames (~133 ms at 60fps)
      frameSkip++;
      if (frameSkip < 8) {
        liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
        return;
      }
      frameSkip = 0;

      try {
        // Grab live video element from the webcam ref
        const video = (webcamRef.current as any)
          ?.video as HTMLVideoElement | null;
        if (!video || video.readyState < 2 || video.videoWidth === 0) {
          if (liveDetectionActiveRef.current)
            liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
          return;
        }

        // Use the lightweight detectFacesLive helper (no landmarks/descriptors)
        const detections = await detectFacesLive(video);

        if (!liveDetectionActiveRef.current) return;

        const vw = video.videoWidth;
        const vh = video.videoHeight;

        if (detections.length === 0) {
          setLiveDetectionStatus("no_face");
        } else if (detections.length > 1) {
          setLiveDetectionStatus("multi_face");
        } else {
          // Single face — check if it's inside the guide box
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
            overlapRatio >= OVERLAP_THRESHOLD ? "ok" : "out_of_box",
          );
        }
      } catch {
        // silently ignore detection errors in the live loop
      }

      if (liveDetectionActiveRef.current)
        liveDetectionRafRef.current = requestAnimationFrame(detectLoop);
    };

    // Delay 600 ms to let webcam stream initialise before first detection
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCameraActive]);

  const today = new Date();
  const dateString = today
    .toLocaleDateString("en-GB")
    .split("/")
    .reverse()
    .join("-"); // YYYY-MM-DD
  const timeString = today.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      visitorName: "",
      contactNumber: "",
      emailAddress: "",
      companyAddress: "",
      visitorType: "",
      purposeOfVisit: "",
      department: "",
      hostEmployeeId: "",
      hostEmployeeName: "",
      hostPicUrl: "",
      hostDesignationId: "",
      hostDesignationName: "",
      idProofType: "",
      idProofNumber: "",
      vehicleNumber: "",
      extraGuest: "",
      visitorPassNo: "",
      dateOfVisit: dateString,
      timeIn: timeString,
      entryAuthorizedBy: "",
      remarks: "",
      visitorPhoto: "",
    },
  });

  const [capturedEmbedding, setCapturedEmbedding] = useState<number[] | null>(
    null,
  );
  const [recognitionStatus, setRecognitionStatus] = useState<
    "idle" | "scanning" | "recognized" | "unrecognized"
  >("idle");
  const [recognizedVisitorName, setRecognizedVisitorName] = useState<
    string | null
  >(null);
  const [isExtractingFace, setIsExtractingFace] = useState(false);
  const isScanningRef = useRef(false);
  const isRecognizedRef = useRef(false);

  useEffect(() => {
    if (!isCameraActive) {
      if (recognitionStatus === "scanning") {
        setRecognitionStatus("idle");
      }
    }
  }, [isCameraActive, recognitionStatus]);

  const {
    employees: erpEmployees,
    loading: erpLoading,
    setSearch: setErpSearch,
  } = useErpEmployees({
    debounceMs: 350,
    initialSearch: "",
    autoFetch: true,
    filterByOrg: true,
  });

  const [departmentsList, setDepartmentsList] = useState<string[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [hostSearch, setHostSearch] = useState("");
  const [deptSearch, setDeptSearch] = useState("");

  const selectedDepartment = form.watch("department");
  const selectedHostId = form.watch("hostEmployeeId");

  // Extract and accumulate unique departments from fetched employees
  const derivedDepartments = useMemo(() => {
    const depts = erpEmployees
      .map((e) => e.department)
      .filter(Boolean)
      .map((d) => d.trim());
    return Array.from(new Set(depts)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [erpEmployees]);

  useEffect(() => {
    if (erpEmployees.length > 0) {
      const depts = erpEmployees
        .map((e) => e.department)
        .filter(Boolean)
        .map((d) => d.trim());
      const uniqueDepts = Array.from(new Set(depts));
      if (uniqueDepts.length > 0) {
        setDepartmentsList((prev) => {
          const combined = Array.from(new Set([...prev, ...uniqueDepts])).sort(
            (a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }),
          );
          return combined;
        });
      }
    }
  }, [erpEmployees]);

  const activeDepartments =
    departmentsList.length > 0 ? departmentsList : derivedDepartments;

  const filteredDepartments = useMemo(() => {
    const list = activeDepartments;
    const q = deptSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((d) => d.toLowerCase().includes(q));
  }, [activeDepartments, deptSearch]);

  const departmentOptions = useMemo(() => {
    return filteredDepartments.map((d) => ({
      value: d,
      label: d,
    }));
  }, [filteredDepartments]);

  const showDepartmentsLoading = erpLoading && departmentsList.length === 0;

  // Trigger ERP search based on host search input, department search input, or selected department
  useEffect(() => {
    // If we have a selected employee and the department matches their department,
    // and there is no active host or department search input, skip fetching the employee list again.
    if (
      selectedEmployee &&
      (selectedEmployee.department || "").trim().toLowerCase() ===
        (selectedDepartment || "").trim().toLowerCase() &&
      !hostSearch.trim() &&
      !deptSearch.trim()
    ) {
      return;
    }

    const q =
      hostSearch.trim() || deptSearch.trim() || selectedDepartment || "";
    setErpSearch(q);
  }, [
    hostSearch,
    deptSearch,
    selectedDepartment,
    selectedEmployee,
    setErpSearch,
  ]);

  // Synchronize department change with host clearing
  useEffect(() => {
    if (!selectedDepartment || !selectedHostId) return;

    const currentHost =
      selectedEmployee && selectedEmployee.employeeId === selectedHostId
        ? selectedEmployee
        : erpEmployees.find((e) => e.employeeId === selectedHostId);

    if (currentHost) {
      if (
        currentHost.department.toLowerCase() !==
        selectedDepartment.toLowerCase()
      ) {
        form.setValue("hostEmployeeId", "");
        setSelectedEmployee(null);
      }
    }
  }, [
    selectedDepartment,
    selectedHostId,
    selectedEmployee,
    erpEmployees,
    form,
  ]);

  const filteredHostEmployees = useMemo(() => {
    let list = erpEmployees;
    if (selectedDepartment) {
      list = list.filter(
        (e) => e.department.toLowerCase() === selectedDepartment.toLowerCase(),
      );
    }
    const q = hostSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.employeeName.toLowerCase().includes(q) ||
          e.employeeId.toLowerCase().includes(q),
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

    if (
      selectedEmployee &&
      !options.some((o) => o.value === selectedEmployee.employeeId)
    ) {
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setCapturedFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setPhotoPreview(base64);
        form.setValue("visitorPhoto", base64);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLookup = async () => {
    const queryVal = lookupPhone.trim();
    if (!queryVal) {
      toast.error(
        isLookupEmployee
          ? "Please enter an employee ID to search"
          : "Please enter a phone number to search",
      );
      return;
    }
    if (!isLookupEmployee && !/^(\+88)?01[3-9]\d{8}$/.test(queryVal)) {
      toast.error("Invalid mobile number format");
      return;
    }

    const toastId = toast.loading("Searching for visitor/employee record...");
    try {
      const response = await axiosInstance.get(`/visitors/lookup`, {
        params: { phone: queryVal, isEmployee: isLookupEmployee },
      });

      if (response.data?.found && response.data?.data) {
        const row = response.data.data;
        form.setValue("visitorName", row.visitorName || "");

        // Ensure contactNumber is only pre-filled if it is a valid mobile format, otherwise leave empty for user entry
        let returnedContact = row.contactNumber || "";
        if (!isLookupEmployee && !returnedContact) {
          returnedContact = queryVal;
        }
        const isValidMobile = /^(\+88)?01[3-9]\d{8}$/.test(returnedContact);
        form.setValue("contactNumber", isValidMobile ? returnedContact : "");

        form.setValue("emailAddress", row.emailAddress || "");
        form.setValue("companyAddress", row.companyAddress || "");
        // Show the ERP/visitor photo in the Personal Information header avatar
        // but do NOT update the camera preview — visitor must capture a fresh live photo.
        const returnedPhoto = row.visitorPhoto || row.picUrl || "";
        setLookupAvatarUrl(returnedPhoto || null);
        form.setValue("visitorPhoto", "");
        setIsPhoneReadOnly(false);
        toast.success(
          `${response.data.type === "employee" ? "Employee" : "Visitor"} record loaded successfully!`,
          { id: toastId },
        );
      } else {
        toast.error(
          isLookupEmployee
            ? "No employee record found matching this ID"
            : "No visitor record found matching this phone number",
          { id: toastId },
        );
        if (!isLookupEmployee) {
          form.setValue("contactNumber", queryVal);
          setIsPhoneReadOnly(false);
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Lookup search failed", {
        id: toastId,
      });
    }
  };

  const capturePhoto = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (!imageSrc) {
      toast.error("Failed to capture screenshot from camera");
      return;
    }

    setIsExtractingFace(true);
    const toastId = toast.loading(
      "Processing photo & verifying face on backend...",
    );

    try {
      setPhotoPreview(imageSrc);
      form.setValue("visitorPhoto", imageSrc);

      const response = await fetch(imageSrc);
      const blob = await response.blob();
      const file = new File([blob], "visitor_photo.jpg", {
        type: "image/jpeg",
      });
      setCapturedFile(file);

      // Perform backend-based face recognition & face quality verification
      const formData = new FormData();
      formData.append("visitorPhoto", file);

      const res = await axiosInstance.post(
        "/visitors/recognize-face",
        formData,
        {
          headers: {
            "Content-Type": "multipart/form-data",
          },
        },
      );

      if (res.data?.recognized && res.data?.visitor) {
        const v = res.data.visitor;
        isRecognizedRef.current = true;
        setRecognitionStatus("recognized");
        setRecognizedVisitorName(v.visitorName);
        form.setValue("visitorName", v.visitorName || "");
        form.setValue("contactNumber", v.contactNumber || "");
        form.setValue("emailAddress", v.emailAddress || "");
        form.setValue("companyAddress", v.companyAddress || "");
        setLookupAvatarUrl(v.visitorPhoto || v.picUrl || null);
        setIsPhoneReadOnly(false);
        toast.success(
          `Recognized Visitor: ${v.visitorName}! Submission will update stored profile image.`,
          { id: toastId },
        );
      } else {
        setRecognitionStatus("unrecognized");
        toast.success(
          "Photo captured & verified by backend. Ready for submission!",
          { id: toastId },
        );
      }

      setIsCameraActive(false);
    } catch (error: any) {
      console.error("Failed analyzing captured photo on backend", error);
      const errMsg =
        error?.response?.data?.error || "Captured photo rejected by backend";
      toast.error(errMsg, { id: toastId });
    } finally {
      setIsExtractingFace(false);
    }
  }, [webcamRef, form]);

  const onSubmit = async (data: VisitorFormValues) => {
    setIsSubmitting(true);
    try {
      const formData = new FormData();
      Object.entries(data).forEach(([key, val]) => {
        if (key === "visitorPhoto") {
          if (capturedFile) {
            formData.append("visitorPhoto", capturedFile);
          } else if (val) {
            formData.append("visitorPhoto", val);
          }
        } else {
          formData.append(key, val || "");
        }
      });

      if (capturedEmbedding && capturedEmbedding.length > 0) {
        formData.append("faceEmbedding", JSON.stringify(capturedEmbedding));
      }

      const response = await axiosInstance.post("/visitors", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data?.ok) {
        toast.success(
          "Visitor registered & face template processed by backend!",
        );
        handleReset(false);
      } else {
        toast.error(response.data?.error || "Registration failed");
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Submission failed");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = (showToast = true) => {
    form.reset({
      visitorName: "",
      contactNumber: "",
      emailAddress: "",
      companyAddress: "",
      visitorType: "",
      purposeOfVisit: "",
      department: "",
      hostEmployeeId: "",
      hostEmployeeName: "",
      hostPicUrl: "",
      hostDesignationId: "",
      hostDesignationName: "",
      idProofType: "",
      idProofNumber: "",
      vehicleNumber: "",
      extraGuest: "",
      visitorPassNo: "",
      dateOfVisit: dateString,
      timeIn: timeString,
      entryAuthorizedBy: "",
      remarks: "",
      visitorPhoto: "",
    });
    setPhotoPreview(null);
    setLookupAvatarUrl(null);
    setLookupPhone("");
    setCapturedFile(null);
    setCapturedEmbedding(null);
    setRecognitionStatus("idle");
    setRecognizedVisitorName(null);
    setIsCameraActive(false);
    setIsPhoneReadOnly(false);
    setSelectedEmployee(null);
    setHostSearch("");
    setDeptSearch("");
    if (showToast) {
      toast.success("Form cleared");
    }
  };

  const handleCameraOpen = () => {
    setIsCameraActive(true);
  };

  // Camera/photo preview: only show photos actually captured via the live camera.
  // lookupAvatarUrl is intentionally excluded here — it's only used in the Personal
  // Information header avatar, not in the camera box.
  const displayPhotoPreview = photoPreview;

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Top Banner Header */}
      <div className="mb-6 flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Add Visitor</h1>
            <p className="text-xs text-zinc-300">
              Register a new or returning visitor
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {/* Virtual Keyboard Toggle Switch */}
          <div className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 select-none">
            <Keyboard className="h-4 w-4 text-zinc-200" />
            <span className="text-xs font-bold text-zinc-200 uppercase tracking-wider">
              Keyboard
            </span>
            <button
              type="button"
              onClick={() => {
                const current =
                  localStorage.getItem("virtual-keyboard-enabled") !== "false";
                localStorage.setItem(
                  "virtual-keyboard-enabled",
                  current ? "false" : "true",
                );
                window.dispatchEvent(
                  new Event("virtualKeyboardSettingsChanged"),
                );
                setKbEnabled(!current);
              }}
              className={cn(
                "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                kbEnabled ? "bg-emerald-500" : "bg-zinc-650",
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  kbEnabled ? "translate-x-5" : "translate-x-0",
                )}
              />
            </button>
          </div>

          <div className="hidden items-center gap-2 text-base font-semibold text-zinc-200 md:flex">
            <Calendar className="h-5 w-5 text-zinc-300" />
            <span>
              {today.toLocaleDateString("en-US", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
            </span>
          </div>
        </div>
      </div>

      {/* Top Verification Status Banner */}
      <div className="mb-2">
        {recognitionStatus === "idle" && (
          <div className="flex items-center gap-3.5 rounded-xl bg-gradient-to-r from-red-950 via-rose-950 to-slate-900 border border-rose-600/70 p-4 text-white shadow-lg ring-1 ring-rose-500/30">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-600/20 text-rose-300 border border-rose-500/40">
              <Scan className="h-5 w-5 animate-pulse text-rose-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2 tracking-wide uppercase">
                FACE VERIFICATION REQUIRED
                <span className="rounded-full bg-rose-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-rose-200 uppercase tracking-normal">
                  ATTENTION
                </span>
              </h3>
              <p className="text-xs text-rose-100/90 font-medium mt-0.5 leading-relaxed">
                Please verify your face via the camera box on the right layout
                before submission. If recognized, personal details auto-fill. If
                new, capture your face photo to proceed.
              </p>
            </div>
          </div>
        )}

        {recognitionStatus === "recognized" && (
          <div className="flex items-center gap-3.5 rounded-xl bg-gradient-to-r from-emerald-950 via-teal-950 to-slate-900 border border-emerald-500/50 p-4 text-white shadow-lg ring-1 ring-emerald-500/30">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
              <CheckCircle className="h-5 w-5 text-emerald-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-emerald-100 flex items-center gap-2 uppercase tracking-wide">
                RECOGNIZED RETURNING VISITOR:{" "}
                {recognizedVisitorName || "Visitor"}
                <span className="rounded-full bg-emerald-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-200 uppercase tracking-normal">
                  VERIFIED
                </span>
              </h3>
              <p className="text-xs text-emerald-100/90 font-medium mt-0.5 leading-relaxed">
                Personal information auto-filled. Select your remaining visit
                details and enter Visitor Pass No. to complete registration.
              </p>
            </div>
          </div>
        )}

        {recognitionStatus === "unrecognized" && (
          <div className="flex items-center gap-3.5 rounded-xl bg-gradient-to-r from-amber-950 via-amber-900 to-slate-900 border border-amber-500/50 p-4 text-white shadow-lg ring-1 ring-amber-500/30">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
              <HelpCircle className="h-5 w-5 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-100 flex items-center gap-2 uppercase tracking-wide">
                NEW VISITOR — FACE CAPTURE REQUIRED
                <span className="rounded-full bg-amber-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-200 uppercase tracking-normal">
                  ACTION REQUIRED
                </span>
              </h3>
              <p className="text-xs text-amber-100/90 font-medium mt-0.5 leading-relaxed">
                Your face template is not found in the database. Please align
                your face in the camera box on the right and click 'Capture
                Photo' to register.
              </p>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Left Columns - Form Fields */}
          <div className="space-y-6 lg:col-span-3">
            {/* Quick Lookup Card */}
            <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*"
              />
              <div className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#0c1b33]">
                <ArrowRightLeft className="h-4 w-4" />
                Quick Lookup — Returning Visitor
              </div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <Input
                    placeholder="Enter phone number or employee id"
                    value={lookupPhone}
                    onChange={(e) => setLookupPhone(e.target.value)}
                    className="h-10 pl-10 rounded-xl border-zinc-200 bg-slate-50/50"
                  />
                </div>
                <div className="flex items-center gap-2 px-1">
                  <input
                    type="checkbox"
                    id="isEmployee"
                    checked={isLookupEmployee}
                    onChange={(e) => setIsLookupEmployee(e.target.checked)}
                    className="h-4 w-4 rounded border-zinc-300 text-[#0c1b33] focus:ring-[#0c1b33] cursor-pointer"
                  />
                  <label
                    htmlFor="isEmployee"
                    className="text-sm font-medium text-zinc-700 cursor-pointer select-none"
                  >
                    Is Employee
                  </label>
                </div>
                <Button
                  type="button"
                  onClick={handleLookup}
                  className="h-10 rounded-xl bg-[#0c1b33] px-6 text-white hover:bg-[#11274c] cursor-pointer flex items-center justify-center"
                >
                  <Search className="mr-2 h-4 w-4" />
                  Search
                </Button>
              </div>
            </div>

            {/* Personal Information */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-[#0c1b33] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4" />
                  Personal Information
                </div>
                {lookupAvatarUrl && (
                  <img
                    src={lookupAvatarUrl}
                    alt="Profile Avatar"
                    className="h-14 w-14 rounded-full border-2 border-emerald-400 object-cover shadow-md ring-2 ring-white/20 my-1 transition-all"
                  />
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Visitor Name <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("visitorName")}
                      placeholder="Full name"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.visitorName && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.visitorName.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Contact Number <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("contactNumber")}
                      placeholder="e.g. 01711234567"
                      className="h-10 pl-10 rounded-xl border-zinc-200 bg-slate-50/50"
                    />
                  </div>
                  {form.formState.errors.contactNumber && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.contactNumber.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Email Address
                  </label>
                  <div className="relative">
                    <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("emailAddress")}
                      type="email"
                      placeholder="email@example.com"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.emailAddress && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.emailAddress.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Company / Address <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Building className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("companyAddress")}
                      placeholder="Company name or address"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.companyAddress && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.companyAddress.message}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Visit Information */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <Briefcase className="h-4 w-4" />
                Visit Information
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Visitor Type <span className="text-rose-500">*</span>
                  </label>
                  <Controller
                    control={form.control}
                    name="visitorType"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <HelpCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {activeVisitorTypes.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.visitorType && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.visitorType.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Purpose of Visit <span className="text-rose-500">*</span>
                  </label>
                  <Controller
                    control={form.control}
                    name="purposeOfVisit"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          {activePurposes.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.purposeOfVisit && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.purposeOfVisit.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Department <span className="text-rose-500">*</span>
                  </label>
                  <Controller
                    control={form.control}
                    name="department"
                    render={({ field }) => (
                      <SearchableSelect
                        value={field.value}
                        onChange={field.onChange}
                        items={departmentOptions}
                        placeholder="Select department"
                        searchPlaceholder="Search department..."
                        loading={erpLoading}
                        onSearchChange={(q) => setDeptSearch(q)}
                        className="h-10 rounded-xl border-zinc-200 bg-white pl-4 text-left font-normal shadow-none hover:bg-zinc-50"
                      />
                    )}
                  />
                  {form.formState.errors.department && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.department.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Host Name / Employee Name{" "}
                    <span className="text-rose-500">*</span>
                  </label>
                  <Controller
                    control={form.control}
                    name="hostEmployeeId"
                    render={({ field }) => (
                      <div className="flex gap-2 w-full">
                        <div className="flex-1 min-w-0">
                          <SearchableSelect
                            value={field.value}
                            onChange={(val) => {
                              field.onChange(val);
                              if (!val) {
                                setSelectedEmployee(null);
                                form.setValue("hostEmployeeName", "");
                                form.setValue("hostPicUrl", "");
                                form.setValue("hostDesignationId", "");
                                form.setValue("hostDesignationName", "");
                                return;
                              }
                              const emp =
                                erpEmployees.find(
                                  (e) => e.employeeId === val,
                                ) ||
                                (selectedEmployee &&
                                selectedEmployee.employeeId === val
                                  ? selectedEmployee
                                  : null);
                              if (emp) {
                                setSelectedEmployee(emp);
                                if (emp.department) {
                                  form.setValue("department", emp.department);
                                }
                                form.setValue(
                                  "hostEmployeeName",
                                  emp.employeeName,
                                );
                                form.setValue("hostPicUrl", emp.picUrl || "");
                                form.setValue(
                                  "hostDesignationId",
                                  emp.designationId || "",
                                );
                                form.setValue(
                                  "hostDesignationName",
                                  emp.designation || "",
                                );
                              }
                            }}
                            items={hostOptions}
                            placeholder="Select host / employee"
                            searchPlaceholder="Search name or ID..."
                            loading={erpLoading}
                            onSearchChange={(q) => setHostSearch(q)}
                            className="h-10 rounded-xl border-zinc-200 bg-white pl-4 text-left font-normal shadow-none hover:bg-zinc-50"
                          />
                        </div>
                        {(field.value || selectedDepartment) && (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              form.setValue("hostEmployeeId", "");
                              form.setValue("hostEmployeeName", "");
                              form.setValue("hostPicUrl", "");
                              form.setValue("hostDesignationId", "");
                              form.setValue("hostDesignationName", "");
                              form.setValue("department", "");
                              setSelectedEmployee(null);
                              setHostSearch("");
                              toast.success(
                                "Host and department selection reset",
                              );
                            }}
                            className="h-10 px-3 rounded-xl border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 transition-colors shrink-0 flex items-center gap-1.5"
                            title="Reset host & department selection"
                          >
                            <RotateCcw className="h-3.5 w-3.5" />
                            <span className="text-xs font-semibold">Reset</span>
                          </Button>
                        )}
                      </div>
                    )}
                  />
                  {form.formState.errors.hostEmployeeId && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.hostEmployeeId.message}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* ID & Security */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4" />
                  ID & Security
                </div>
                {recognitionStatus === "recognized" && (
                  <span className="rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300 normal-case">
                    Optional for Verified Visitor
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    ID Proof Type
                  </label>
                  <Controller
                    control={form.control}
                    name="idProofType"
                    render={({ field }) => (
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                      >
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select ID type" />
                        </SelectTrigger>
                        <SelectContent>
                          {idProofTypes.map((i) => (
                            <SelectItem key={i} value={i}>
                              {i}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.idProofType && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.idProofType.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    ID Proof Number
                  </label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("idProofNumber")}
                      placeholder="ID document number"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.idProofNumber && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.idProofNumber.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Vehicle Number
                  </label>
                  <div className="relative">
                    <Car className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("vehicleNumber")}
                      placeholder="e.g. MH12AB1234"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.vehicleNumber && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.vehicleNumber.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Extra Guest
                  </label>
                  <Controller
                    control={form.control}
                    name="extraGuest"
                    render={({ field }) => (
                      <Select
                        value={field.value || "0"}
                        onValueChange={(val) =>
                          field.onChange(val === "0" ? "" : val)
                        }
                      >
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="0">None</SelectItem>
                          {extraGuestsOptions.map((opt) => (
                            <SelectItem key={opt} value={opt}>
                              {opt}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.extraGuest && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.extraGuest.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Visitor Pass No. <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Ticket className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("visitorPassNo")}
                      placeholder={visitorPassPlaceholder}
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.visitorPassNo && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.visitorPassNo.message}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Entry & Timing */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <Clock className="h-4 w-4" />
                Entry & Timing
              </div>
              <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Date of Visit <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <CalendarDays className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("dateOfVisit")}
                      type="date"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.dateOfVisit && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.dateOfVisit.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Time In <span className="text-rose-500">*</span>
                  </label>
                  <div className="relative">
                    <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("timeIn")}
                      type="time"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.timeIn && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.timeIn.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Entry Authorized By
                  </label>
                  <div className="relative">
                    <UserCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                    <Input
                      {...form.register("entryAuthorizedBy")}
                      placeholder="Authorizing officer name"
                      className="h-10 pl-10 rounded-xl border-zinc-200"
                    />
                  </div>
                  {form.formState.errors.entryAuthorizedBy && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.entryAuthorizedBy.message}
                    </span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Remarks
                  </label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-4.5 h-4 w-4 text-zinc-400" />
                    <textarea
                      {...form.register("remarks")}
                      placeholder="Any additional notes..."
                      rows={2}
                      className="w-full rounded-xl border border-zinc-200 bg-transparent py-2 pl-10 pr-3 text-sm transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  {form.formState.errors.remarks && (
                    <span className="text-xs text-rose-500">
                      {form.formState.errors.remarks.message}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - In-Place Camera & Photo Preview Container */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center justify-between bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <div className="flex items-center gap-2">
                  <Camera className="h-4 w-4" />
                  Visitor Photo
                </div>
                {isCameraActive && (
                  <span className="flex items-center gap-1.5 text-[10px] text-emerald-400 font-bold normal-case">
                    <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                    LIVE CAMERA
                  </span>
                )}
              </div>

              <div className="p-5 flex flex-col gap-4">
                <div className="relative aspect-square w-full rounded-2xl border-2 border-dashed border-zinc-200 bg-slate-950 overflow-hidden flex items-center justify-center shadow-inner">
                  {isCameraActive ? (
                    <>
                      <Webcam
                        audio={false}
                        ref={webcamRef}
                        screenshotFormat="image/jpeg"
                        className="h-full w-full object-cover"
                        videoConstraints={{
                          width: 640,
                          height: 640,
                          facingMode: "user",
                        }}
                      />

                      {/* ══ Professional Face-Alignment Overlay ══ */}
                      {(() => {
                        const isOk = liveDetectionStatus === "ok";
                        const isMulti = liveDetectionStatus === "multi_face";
                        const isNoFace = liveDetectionStatus === "no_face";
                        const isOutOfBox = liveDetectionStatus === "out_of_box";
                        const isError = isMulti || isNoFace || isOutOfBox;

                        // Colors
                        const boxColor = isOk
                          ? "rgba(34,197,94,0.85)"
                          : isError
                            ? "rgba(239,68,68,0.90)"
                            : "rgba(34,211,238,0.65)";
                        const glowColor = isOk
                          ? "rgba(34,197,94,0.35)"
                          : isError
                            ? "rgba(239,68,68,0.40)"
                            : "rgba(34,211,238,0.25)";
                        const bracketClr = isOk
                          ? "#22c55e"
                          : isError
                            ? "#ef4444"
                            : "#22d3ee";
                        const scanClr = isOk
                          ? "rgba(34,197,94,0.95)"
                          : isError
                            ? "rgba(239,68,68,0.90)"
                            : "rgba(34,211,238,0.95)";
                        const chipBg = isOk
                          ? "rgba(21,128,61,0.85)"
                          : isError
                            ? "rgba(153,27,27,0.85)"
                            : "rgba(0,0,0,0.80)";
                        const chipBorder = isOk
                          ? "rgba(34,197,94,0.50)"
                          : isError
                            ? "rgba(239,68,68,0.50)"
                            : "rgba(34,211,238,0.30)";
                        const dotClr = isOk
                          ? "#22c55e"
                          : isError
                            ? "#ef4444"
                            : "#22d3ee";

                        const statusMsg = isOk
                          ? "Face detected — Ready to capture"
                          : isMulti
                            ? `Multiple faces (${liveDetectionStatus}) — 1 person only`
                            : isNoFace
                              ? "No face detected — Move closer"
                              : isOutOfBox
                                ? "Face out of frame — Centre yourself"
                                : "Place face inside the box";

                        // Hacky but accurate label for multi
                        const chipLabel = isMulti
                          ? "Multiple faces — 1 person only"
                          : statusMsg;

                        return (
                          <div className="absolute inset-0 pointer-events-none z-10">
                            {/* ── 4-panel dark cutout mask ── */}
                            <div
                              style={{
                                position: "absolute",
                                top: 0,
                                left: 0,
                                right: 0,
                                height: "18%",
                                background: "rgba(0,0,0,0.72)",
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                bottom: 0,
                                left: 0,
                                right: 0,
                                height: "18%",
                                background: "rgba(0,0,0,0.72)",
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: "18%",
                                left: 0,
                                width: "20%",
                                bottom: "18%",
                                background: "rgba(0,0,0,0.72)",
                              }}
                            />
                            <div
                              style={{
                                position: "absolute",
                                top: "18%",
                                right: 0,
                                width: "20%",
                                bottom: "18%",
                                background: "rgba(0,0,0,0.72)",
                              }}
                            />

                            {/* ── Face guide rectangle (color-reactive) ── */}
                            <div
                              style={{
                                position: "absolute",
                                top: "18%",
                                left: "20%",
                                right: "20%",
                                bottom: "18%",
                                borderRadius: 6,
                                border: `2px solid ${boxColor}`,
                                boxShadow: `0 0 14px 3px ${glowColor}, inset 0 0 10px ${glowColor}`,
                                transition:
                                  "border-color 0.25s, box-shadow 0.25s",
                              }}
                            />

                            {/* ── L-bracket corners (color-reactive) ── */}
                            {/* top-left */}
                            <div
                              style={{
                                position: "absolute",
                                top: "18%",
                                left: "20%",
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: 30,
                                  height: 30,
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: 30,
                                    height: 3.5,
                                    background: bracketClr,
                                    borderRadius: "3px 0 0 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    left: 0,
                                    width: 3.5,
                                    height: 30,
                                    background: bracketClr,
                                    borderRadius: "3px 0 0 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                              </div>
                            </div>
                            {/* top-right */}
                            <div
                              style={{
                                position: "absolute",
                                top: "18%",
                                right: "20%",
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: 30,
                                  height: 30,
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    right: 0,
                                    width: 30,
                                    height: 3.5,
                                    background: bracketClr,
                                    borderRadius: "0 3px 0 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    top: 0,
                                    right: 0,
                                    width: 3.5,
                                    height: 30,
                                    background: bracketClr,
                                    borderRadius: "0 3px 0 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                              </div>
                            </div>
                            {/* bottom-left */}
                            <div
                              style={{
                                position: "absolute",
                                bottom: "18%",
                                left: "20%",
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: 30,
                                  height: 30,
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: 0,
                                    left: 0,
                                    width: 30,
                                    height: 3.5,
                                    background: bracketClr,
                                    borderRadius: "0 0 0 3px",
                                    transition: "background 0.25s",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: 0,
                                    left: 0,
                                    width: 3.5,
                                    height: 30,
                                    background: bracketClr,
                                    borderRadius: "0 0 0 3px",
                                    transition: "background 0.25s",
                                  }}
                                />
                              </div>
                            </div>
                            {/* bottom-right */}
                            <div
                              style={{
                                position: "absolute",
                                bottom: "18%",
                                right: "20%",
                              }}
                            >
                              <div
                                style={{
                                  position: "relative",
                                  width: 30,
                                  height: 30,
                                }}
                              >
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: 0,
                                    right: 0,
                                    width: 30,
                                    height: 3.5,
                                    background: bracketClr,
                                    borderRadius: "0 0 3px 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                                <div
                                  style={{
                                    position: "absolute",
                                    bottom: 0,
                                    right: 0,
                                    width: 3.5,
                                    height: 30,
                                    background: bracketClr,
                                    borderRadius: "0 0 3px 0",
                                    transition: "background 0.25s",
                                  }}
                                />
                              </div>
                            </div>

                            {/* ── Scan line (only when ok / idle) ── */}
                            {!isError && (
                              <div
                                style={{
                                  position: "absolute",
                                  left: "20%",
                                  right: "20%",
                                  height: 2,
                                  background: `linear-gradient(90deg,transparent 0%,${scanClr} 35%,${scanClr} 65%,transparent 100%)`,
                                  boxShadow: `0 0 8px 2px ${glowColor}`,
                                  animation: "scanLineBox 2.4s linear infinite",
                                  top: "18%",
                                }}
                              />
                            )}

                            {/* ── Top status chip ── */}
                            <div
                              style={{
                                position: "absolute",
                                top: "7%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                background: chipBg,
                                backdropFilter: "blur(6px)",
                                border: `1px solid ${chipBorder}`,
                                borderRadius: 20,
                                padding: "5px 12px",
                                whiteSpace: "nowrap",
                                transition:
                                  "background 0.25s, border-color 0.25s",
                              }}
                            >
                              <span
                                style={{
                                  display: "inline-block",
                                  width: 7,
                                  height: 7,
                                  borderRadius: "50%",
                                  background: dotClr,
                                  boxShadow: `0 0 6px 2px ${dotClr}`,
                                  animation:
                                    "dotBlink 1.4s ease-in-out infinite",
                                  flexShrink: 0,
                                  transition: "background 0.25s",
                                }}
                              />
                              <span
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  color: "#f0fdf4",
                                  letterSpacing: "0.05em",
                                  textTransform: "uppercase",
                                }}
                              >
                                {chipLabel}
                              </span>
                            </div>

                            {/* ── Error detail badge (only when error) ── */}
                            {isError && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "83%",
                                  left: "10%",
                                  right: "10%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                  background: "rgba(127,29,29,0.88)",
                                  backdropFilter: "blur(6px)",
                                  border: "1px solid rgba(239,68,68,0.40)",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                }}
                              >
                                <AlertTriangle
                                  style={{
                                    width: 12,
                                    height: 12,
                                    color: "#fca5a5",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#fca5a5",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  {isMulti
                                    ? "Multiple faces detected — only 1 person allowed"
                                    : isNoFace
                                      ? "No face found — move closer & improve lighting"
                                      : "Face outside guide box — centre your face"}
                                </span>
                              </div>
                            )}

                            {/* ── OK confirmation badge ── */}
                            {isOk && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "83%",
                                  left: "10%",
                                  right: "10%",
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: 6,
                                  background: "rgba(5,46,22,0.88)",
                                  backdropFilter: "blur(6px)",
                                  border: "1px solid rgba(34,197,94,0.40)",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                }}
                              >
                                <CheckCircle
                                  style={{
                                    width: 12,
                                    height: 12,
                                    color: "#86efac",
                                    flexShrink: 0,
                                  }}
                                />
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 700,
                                    color: "#86efac",
                                    letterSpacing: "0.03em",
                                  }}
                                >
                                  Face aligned — click{" "}
                                  <span style={{ color: "#4ade80" }}>
                                    Capture Photo
                                  </span>
                                </span>
                              </div>
                            )}

                            {/* ── Bottom hint (idle only) ── */}
                            {liveDetectionStatus === "idle" && (
                              <div
                                style={{
                                  position: "absolute",
                                  top: "83%",
                                  left: "10%",
                                  right: "10%",
                                  display: "flex",
                                  flexDirection: "column",
                                  alignItems: "center",
                                  gap: 2,
                                  background: "rgba(0,0,0,0.78)",
                                  backdropFilter: "blur(6px)",
                                  border: "1px solid rgba(255,255,255,0.08)",
                                  borderRadius: 8,
                                  padding: "6px 10px",
                                  textAlign: "center",
                                }}
                              >
                                <span
                                  style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: "rgba(255,255,255,0.45)",
                                    letterSpacing: "0.04em",
                                    textTransform: "uppercase",
                                  }}
                                >
                                  Keep face centred &amp; look straight
                                </span>
                              </div>
                            )}

                            {/* ── Keyframes ── */}
                            <style>{`
                          @keyframes scanLineBox {
                            0%   { top: 18%; opacity:0; }
                            8%   { opacity:1; }
                            92%  { opacity:1; }
                            100% { top: 82%; opacity:0; }
                          }
                          @keyframes dotBlink {
                            0%,100% { opacity:1; }
                            50%     { opacity:0.35; }
                          }
                        `}</style>
                          </div>
                        );
                      })()}
                    </>
                  ) : displayPhotoPreview ? (
                    <div className="relative h-full w-full">
                      <img
                        src={displayPhotoPreview}
                        alt="Visitor Preview"
                        className="h-full w-full object-cover"
                      />
                      <div className="absolute bottom-2 left-2 right-2 rounded-lg bg-emerald-950/90 backdrop-blur-xs p-1.5 text-center text-[11px] font-bold text-emerald-300 border border-emerald-500/30">
                        ✓ Photo Available
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsCameraActive(true)}
                      className="flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer group"
                    >
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/10 text-zinc-300 border border-white/10 group-hover:scale-105 group-hover:bg-white/20 transition-all">
                        <Camera className="h-7 w-7 text-zinc-300" />
                      </div>
                      <div>
                        <span className="text-xs font-bold text-zinc-200 block">
                          Visitor Photo
                        </span>
                        <span className="text-[11px] text-zinc-400 block mt-0.5">
                          Click below to start live camera
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Control Buttons */}
                {isCameraActive ? (
                  <div className="flex flex-col gap-2">
                    {/* Capture is only allowed when exactly 1 face is in-box */}
                    <Button
                      type="button"
                      onClick={capturePhoto}
                      disabled={
                        isExtractingFace || liveDetectionStatus !== "ok"
                      }
                      title={
                        liveDetectionStatus === "multi_face"
                          ? "Multiple faces detected — only 1 person allowed"
                          : liveDetectionStatus === "no_face"
                            ? "No face detected — align your face in the box"
                            : liveDetectionStatus === "out_of_box"
                              ? "Face is outside the guide box — centre yourself"
                              : liveDetectionStatus === "idle"
                                ? "Initialising camera detection…"
                                : "Capture Photo"
                      }
                      className={cn(
                        "w-full h-11 rounded-xl flex items-center justify-center gap-2 font-bold shadow-md transition-all duration-200",
                        liveDetectionStatus === "ok" && !isExtractingFace
                          ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
                          : "bg-red-700/80 text-red-100 cursor-not-allowed opacity-80",
                      )}
                    >
                      {isExtractingFace ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />{" "}
                          Extracting Face...
                        </>
                      ) : liveDetectionStatus === "ok" ? (
                        <>
                          <Camera className="h-4 w-4" /> Capture Photo
                        </>
                      ) : liveDetectionStatus === "multi_face" ? (
                        <>
                          <AlertTriangle className="h-4 w-4" /> Multiple Faces
                          Detected
                        </>
                      ) : liveDetectionStatus === "no_face" ? (
                        <>
                          <AlertTriangle className="h-4 w-4" /> No Face Detected
                        </>
                      ) : liveDetectionStatus === "out_of_box" ? (
                        <>
                          <AlertTriangle className="h-4 w-4" /> Face Out of
                          Frame
                        </>
                      ) : (
                        <>
                          <Camera className="h-4 w-4" /> Initialising...
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      onClick={() => setIsCameraActive(false)}
                      variant="outline"
                      className="w-full h-9 rounded-xl border-zinc-300 text-zinc-600 hover:bg-zinc-100 flex items-center justify-center gap-1.5 text-xs font-semibold cursor-pointer"
                    >
                      <X className="h-3.5 w-3.5" />
                      Close Camera
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    onClick={() => setIsCameraActive(true)}
                    className="w-full h-11 rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c] flex items-center justify-center gap-2 font-bold cursor-pointer shadow-sm"
                  >
                    <Camera className="h-4 w-4 text-cyan-400" />
                    {photoPreview
                      ? "Retake / Verify Camera"
                      : "Open Camera to Verify"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-200/80 pt-5 sm:flex-row">
          <span className="text-xs text-zinc-400">
            Entry is time-stamped automatically on submission.
          </span>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Button
              type="button"
              onClick={() => handleReset()}
              className="h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-[#0c1b33] px-6 text-sm font-semibold text-white hover:bg-[#11274c] flex items-center justify-center gap-2 shadow-sm cursor-pointer"
            >
              <CheckCircle className="h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit Entry"}
            </Button>
          </div>
        </div>
      </form>
      <VirtualKeyboard />
    </div>
  );
}
