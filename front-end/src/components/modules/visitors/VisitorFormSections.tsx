"use client";

import React from "react";
import {
  User,
  Phone,
  Mail,
  Building,
  Briefcase,
  Shield,
  CreditCard,
  Car,
  Users,
  Clock,
  HelpCircle,
  FileText,
  RotateCcw,
  Ticket,
  CalendarDays,
  UserCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import { Button } from "@/components/ui/button";
import { Controller } from "react-hook-form";
import type { UseFormReturn } from "react-hook-form";
import type { VisitorFormValues } from "@/lib/validation/visitor-schema";

type VisitorFormSectionsProps = {
  form: UseFormReturn<VisitorFormValues>;
  lookupAvatarUrl: string | null;
  recognitionStatus?: "idle" | "scanning" | "recognized" | "unrecognized";
  activeVisitorTypes: string[];
  activePurposes: string[];
  idProofTypes: string[];
  extraGuestsOptions: string[];
  visitorPassPlaceholder?: string;
  departmentOptions: { value: string; label: string }[];
  hostOptions: { value: string; label: string; keywords?: string; image?: string }[];
  erpLoading: boolean;
  setDeptSearch?: (q: string) => void;
  setHostSearch?: (q: string) => void;
  handleHostSelect: (val: string) => void;
  handleResetHostAndDepartment: () => void;
};

export function VisitorFormSections({
  form,
  lookupAvatarUrl,
  recognitionStatus = "idle",
  activeVisitorTypes,
  activePurposes,
  idProofTypes,
  extraGuestsOptions,
  visitorPassPlaceholder = "Pass / badge number",
  departmentOptions,
  hostOptions,
  erpLoading,
  setDeptSearch,
  setHostSearch,
  handleHostSelect,
  handleResetHostAndDepartment,
}: VisitorFormSectionsProps) {
  const selectedDepartment = form.watch("department");
  const selectedHostId = form.watch("hostEmployeeId");

  return (
    <div className="space-y-6">
      {/* Personal Information */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="flex items-center justify-between bg-[#0c1b33] px-5 py-2 text-xs font-semibold uppercase tracking-wider text-white">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4" />
            Personal Information
          </div>
          {lookupAvatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
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
                <Select value={field.value} onValueChange={field.onChange}>
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
                <Select value={field.value} onValueChange={field.onChange}>
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
                  onSearchChange={(q) => setDeptSearch?.(q)}
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
              Host Name / Employee Name <span className="text-rose-500">*</span>
            </label>
            <Controller
              control={form.control}
              name="hostEmployeeId"
              render={({ field }) => (
                <div className="flex gap-2 w-full">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect
                      value={field.value}
                      onChange={(val) => handleHostSelect(val)}
                      items={hostOptions}
                      placeholder="Select host / employee"
                      searchPlaceholder="Search name or ID..."
                      loading={erpLoading}
                      onSearchChange={(q) => setHostSearch?.(q)}
                      className="h-10 rounded-xl border-zinc-200 bg-white pl-4 text-left font-normal shadow-none hover:bg-zinc-50"
                    />
                  </div>
                  {(field.value || selectedDepartment) && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResetHostAndDepartment}
                      className="h-10 px-3 rounded-xl border-zinc-200 text-zinc-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50/50 transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer"
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
                  onValueChange={(val) => field.onChange(val === "0" ? "" : val)}
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
  );
}

