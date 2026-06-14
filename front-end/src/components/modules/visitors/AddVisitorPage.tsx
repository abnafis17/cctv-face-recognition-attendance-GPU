"use client";

import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
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
} from "lucide-react";
import { visitorSchema, type VisitorFormValues } from "@/lib/validation/visitor-schema";
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
import axiosInstance from "@/config/axiosInstance";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import Webcam from "react-webcam";

const visitorTypes = ["Guest", "Contractor", "Official", "Interviewee", "Other"];
const purposes = ["Meeting", "Interview", "Delivery", "Audit", "Maintenance", "Other"];
const idProofTypes = ["NID", "Passport", "Driving License", "Employee Card", "Other"];
const extraGuestsOptions = Array.from({ length: 15 }, (_, i) => String(i + 1));

export default function AddVisitorPage() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isLookupEmployee, setIsLookupEmployee] = useState(false);
  const [lookupPhone, setLookupPhone] = useState("");
  const [isPhoneReadOnly, setIsPhoneReadOnly] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const webcamRef = useRef<Webcam>(null);

  const [capturedFile, setCapturedFile] = useState<File | null>(null);
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const today = new Date();
  const dateString = today.toLocaleDateString("en-GB").split("/").reverse().join("-"); // YYYY-MM-DD
  const timeString = today.toTimeString().split(" ")[0].substring(0, 5); // HH:MM

  const form = useForm<VisitorFormValues>({
    resolver: zodResolver(visitorSchema),
    defaultValues: {
      visitorName: "",
      contactNumber: "",
      emailAddress: "",
      companyAddress: "",
      visitorType: "Guest",
      purposeOfVisit: "Meeting",
      department: "",
      hostEmployeeId: "",
      idProofType: "NID",
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

  const {
    employees: erpEmployees,
    loading: erpLoading,
  } = useErpEmployees({ debounceMs: 350, initialSearch: "", autoFetch: true });

  const derivedDepartments = useMemo(() => {
    const depts = erpEmployees
      .map((e) => e.department)
      .filter(Boolean)
      .map((d) => d.trim());
    return Array.from(new Set(depts)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" })
    );
  }, [erpEmployees]);

  const [hostSearch, setHostSearch] = useState("");

  const selectedDepartment = form.watch("department");
  const selectedHostId = form.watch("hostEmployeeId");

  useEffect(() => {
    if (!selectedDepartment || !selectedHostId) return;
    const currentHost = erpEmployees.find((e) => e.employeeId === selectedHostId);
    if (!currentHost || currentHost.department.toLowerCase() !== selectedDepartment.toLowerCase()) {
      form.setValue("hostEmployeeId", "");
    }
  }, [selectedDepartment, selectedHostId, erpEmployees, form]);

  const filteredHostEmployees = useMemo(() => {
    let list = erpEmployees;
    if (selectedDepartment) {
      list = list.filter(
        (e) => e.department.toLowerCase() === selectedDepartment.toLowerCase()
      );
    }
    const q = hostSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (e) =>
          e.employeeName.toLowerCase().includes(q) ||
          e.employeeId.toLowerCase().includes(q)
      );
    }
    return list;
  }, [erpEmployees, selectedDepartment, hostSearch]);

  const hostOptions = useMemo(() => {
    return filteredHostEmployees.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId}`,
    }));
  }, [filteredHostEmployees]);

  const extraGuestValue = form.watch("extraGuest");
  const extraGuestsCount = extraGuestValue ? parseInt(extraGuestValue, 10) : 0;

  const visitorPassPlaceholder = extraGuestsCount > 0
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
      toast.error(isLookupEmployee ? "Please enter an employee ID to search" : "Please enter a phone number to search");
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
        if (row.visitorPhoto) {
          form.setValue("visitorPhoto", row.visitorPhoto);
          setPhotoPreview(row.visitorPhoto);
          setCapturedFile(null);
        } else {
          form.setValue("visitorPhoto", "");
          setPhotoPreview(null);
          setCapturedFile(null);
        }
        setIsPhoneReadOnly(true);
        toast.success(`${response.data.type === "employee" ? "Employee" : "Visitor"} record loaded successfully!`, { id: toastId });
      } else {
        toast.error(isLookupEmployee ? "No employee record found matching this ID" : "No visitor record found matching this phone number", { id: toastId });
        if (!isLookupEmployee) {
          form.setValue("contactNumber", queryVal);
          setIsPhoneReadOnly(true);
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.error || "Lookup search failed", { id: toastId });
    }
  };

  const capturePhoto = useCallback(async () => {
    const imageSrc = webcamRef.current?.getScreenshot();
    if (imageSrc) {
      setPhotoPreview(imageSrc);
      try {
        const response = await fetch(imageSrc);
        const blob = await response.blob();
        const file = new File([blob], "visitor_photo.jpg", { type: "image/jpeg" });
        setCapturedFile(file);
        form.setValue("visitorPhoto", imageSrc);
        setIsCameraModalOpen(false);
        toast.success("Photo captured successfully!");
      } catch (error) {
        console.error("Failed to parse captured photo", error);
        toast.error("Failed to parse captured photo");
      }
    } else {
      toast.error("Failed to capture screenshot from camera");
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

      const response = await axiosInstance.post("/visitors", formData, {
        headers: {
          "Content-Type": "multipart/form-data",
        },
      });

      if (response.data?.ok) {
        toast.success("Visitor registered successfully!");
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
      visitorType: "Guest",
      purposeOfVisit: "Meeting",
      department: "",
      hostEmployeeId: "",
      idProofType: "NID",
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
    setLookupPhone("");
    setCapturedFile(null);
    setIsCameraModalOpen(false);
    setIsPhoneReadOnly(false);
    if (showToast) {
      toast.success("Form cleared");
    }
  };

  const handleCameraOpen = () => {
    setIsCameraModalOpen(true);
  };

  return (
    <div className="mx-auto max-w-7xl px-2 pb-10">
      {/* Top Banner Header */}
      <div className="mb-6 flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Add Visitor</h1>
            <p className="text-xs text-zinc-300">Register a new or returning visitor</p>
          </div>
        </div>
        <div className="hidden items-center gap-2 text-xs font-semibold text-zinc-300 md:flex">
          <Calendar className="h-4 w-4" />
          <span>{today.toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>
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
                  <label htmlFor="isEmployee" className="text-sm font-medium text-zinc-700 cursor-pointer select-none">
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
              <div className="flex items-center gap-2 bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <User className="h-4 w-4" />
                Personal Information
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
                    <span className="text-xs text-rose-500">{form.formState.errors.visitorName.message}</span>
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
                      className="h-10 pl-10 rounded-xl border-zinc-200 bg-slate-50/50 read-only:bg-zinc-100 read-only:text-zinc-500 read-only:cursor-not-allowed"
                      readOnly={isPhoneReadOnly}
                    />
                  </div>
                  {form.formState.errors.contactNumber && (
                    <span className="text-xs text-rose-500">{form.formState.errors.contactNumber.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.emailAddress.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.companyAddress.message}</span>
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <HelpCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          {visitorTypes.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.visitorType && (
                    <span className="text-xs text-rose-500">{form.formState.errors.visitorType.message}</span>
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select purpose" />
                        </SelectTrigger>
                        <SelectContent>
                          {purposes.map((p) => (
                            <SelectItem key={p} value={p}>
                              {p}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.purposeOfVisit && (
                    <span className="text-xs text-rose-500">{form.formState.errors.purposeOfVisit.message}</span>
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
                      <Select value={field.value} onValueChange={field.onChange}>
                        <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10">
                          <Building className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                          <SelectValue placeholder="Select department" />
                        </SelectTrigger>
                        <SelectContent>
                          {erpLoading ? (
                            <SelectItem value="loading-depts" disabled>
                              Loading departments...
                            </SelectItem>
                          ) : derivedDepartments.length === 0 ? (
                            <SelectItem value="no-depts" disabled>
                              No departments found
                            </SelectItem>
                          ) : (
                            derivedDepartments.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    )}
                  />
                  {form.formState.errors.department && (
                    <span className="text-xs text-rose-500">{form.formState.errors.department.message}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Host Name / Employee Name <span className="text-rose-500">*</span>
                  </label>
                  <Controller
                    control={form.control}
                    name="hostEmployeeId"
                    render={({ field }) => (
                      <div className="relative w-full">
                        <UserCheck className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                        <SearchableSelect
                          value={field.value}
                          onChange={field.onChange}
                          items={hostOptions}
                          placeholder="Select host / employee"
                          searchPlaceholder="Search name or ID..."
                          loading={erpLoading}
                          onSearchChange={(q) => setHostSearch(q)}
                          className="h-10 rounded-xl border-zinc-200 bg-white pl-10 text-left font-normal shadow-none hover:bg-zinc-50"
                        />
                      </div>
                    )}
                  />
                  {form.formState.errors.hostEmployeeId && (
                    <span className="text-xs text-rose-500">{form.formState.errors.hostEmployeeId.message}</span>
                  )}
                </div>
              </div>
            </div>

            {/* ID & Security */}
            <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <Shield className="h-4 w-4" />
                ID & Security
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
                      <Select value={field.value} onValueChange={field.onChange}>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.idProofType.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.idProofNumber.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.vehicleNumber.message}</span>
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
                      <Select value={field.value || "0"} onValueChange={(val) => field.onChange(val === "0" ? "" : val)}>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.extraGuest.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.visitorPassNo.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.dateOfVisit.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.timeIn.message}</span>
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
                    <span className="text-xs text-rose-500">{form.formState.errors.entryAuthorizedBy.message}</span>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
                    Remarks
                  </label>
                  <div className="relative">
                    <FileText className="pointer-events-none absolute left-3 top-[18px] h-4 w-4 text-zinc-400" />
                    <textarea
                      {...form.register("remarks")}
                      placeholder="Any additional notes..."
                      rows={2}
                      className="w-full rounded-xl border border-zinc-200 bg-transparent py-2 pl-10 pr-3 text-sm transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50"
                    />
                  </div>
                  {form.formState.errors.remarks && (
                    <span className="text-xs text-rose-500">{form.formState.errors.remarks.message}</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column - Photo capturing placeholder */}
          <div className="lg:col-span-1">
            <div className="sticky top-6 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 bg-[#0c1b33] px-5 py-3 text-xs font-semibold uppercase tracking-wider text-white">
                <Camera className="h-4 w-4" />
                Visitor Photo
              </div>
              <div className="p-5 flex flex-col gap-4">
                <div
                  onClick={handleCameraOpen}
                  className="group relative flex aspect-square w-full flex-col items-center justify-center rounded-2xl border-2 border-dashed border-zinc-200 bg-slate-50/50 text-zinc-400 cursor-pointer hover:bg-slate-50 hover:border-zinc-300 transition-all duration-200"
                >
                  {photoPreview ? (
                    <img
                      src={photoPreview}
                      alt="Visitor Preview"
                      className="h-full w-full rounded-xl object-cover"
                    />
                  ) : (
                    <div className="flex flex-col items-center gap-2 text-center">
                      <Camera className="h-8 w-8 text-zinc-400 group-hover:text-zinc-500 group-hover:scale-105 transition-all" />
                      <span className="text-xs font-medium text-zinc-500">Visitor Photo</span>
                    </div>
                  )}
                </div>
                <Button
                  type="button"
                  onClick={handleCameraOpen}
                  className="w-full h-11 rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c] flex items-center justify-center gap-2 font-medium"
                >
                  <Camera className="h-4 w-4" />
                  Open Camera
                </Button>
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
              className="h-11 rounded-xl border border-zinc-200 bg-white px-5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 flex items-center justify-center gap-2"
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting}
              className="h-11 rounded-xl bg-[#0c1b33] px-6 text-sm font-semibold text-white hover:bg-[#11274c] flex items-center justify-center gap-2 shadow-sm"
            >
              <CheckCircle className="h-4 w-4" />
              {isSubmitting ? "Submitting..." : "Submit Entry"}
            </Button>
          </div>
        </div>
      </form>

      {isMounted && isCameraModalOpen && (
        <Dialog open={isCameraModalOpen} onOpenChange={setIsCameraModalOpen}>
          <DialogContent className="sm:max-w-md bg-white rounded-2xl border border-zinc-200">
            <DialogHeader>
              <DialogTitle className="text-zinc-900">Capture Visitor Photo</DialogTitle>
            </DialogHeader>
            <div className="flex flex-col items-center gap-4 py-4">
              <div className="overflow-hidden rounded-xl border border-zinc-200 bg-zinc-950 aspect-video w-full relative">
                <Webcam
                  audio={false}
                  ref={webcamRef}
                  screenshotFormat="image/jpeg"
                  videoConstraints={{
                    width: 640,
                    height: 480,
                    facingMode: "user"
                  }}
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="flex justify-between items-center w-full">
                <button
                  type="button"
                  onClick={() => {
                    setIsCameraModalOpen(false);
                    fileInputRef.current?.click();
                  }}
                  className="text-xs font-semibold text-[#0c1b33] hover:underline cursor-pointer"
                >
                  Or Upload File
                </button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsCameraModalOpen(false)}
                    className="rounded-xl border-zinc-200 text-zinc-700"
                  >
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={capturePhoto}
                    className="rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c]"
                  >
                    Capture Photo
                  </Button>
                </div>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
