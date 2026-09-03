"use client";

import React from "react";
import { User, Phone, Mail, Building, Briefcase, Shield, CreditCard, Car, Users, Clock, HelpCircle, FileText, RotateCcw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import { Button } from "@/components/ui/button";
import type { UseFormReturn } from "react-hook-form";
import type { VisitorFormValues } from "@/lib/validation/visitor-schema";

type VisitorFormSectionsProps = {
  form: UseFormReturn<VisitorFormValues>;
  lookupAvatarUrl: string | null;
  activeVisitorTypes: string[];
  activePurposes: string[];
  idProofTypes: string[];
  extraGuestsOptions: string[];
  departmentsList: string[];
  erpEmployees: any[];
  erpLoading: boolean;
  departmentOptions?: { value: string; label: string }[];
  hostOptions?: { value: string; label: string; keywords?: string; image?: string }[];
  setDeptSearch?: (q: string) => void;
  setHostSearch?: (q: string) => void;
  handleDepartmentSelect?: (val: string) => void;
  handleHostSelect?: (val: string) => void;
  handleResetHostAndDepartment?: () => void;
};

export function VisitorFormSections({
  form,
  lookupAvatarUrl,
  activeVisitorTypes,
  activePurposes,
  idProofTypes,
  extraGuestsOptions,
  departmentsList,
  erpEmployees,
  erpLoading,
  departmentOptions = [],
  hostOptions = [],
  setDeptSearch,
  setHostSearch,
  handleDepartmentSelect,
  handleHostSelect,
  handleResetHostAndDepartment,
}: VisitorFormSectionsProps) {
  const selectedDepartment = form.watch("department");
  const selectedHostId = form.watch("hostEmployeeId");

  const defaultDepartmentOptions = React.useMemo(
    () => (departmentOptions.length > 0 ? departmentOptions : departmentsList.map((d) => ({ value: d, label: d }))),
    [departmentOptions, departmentsList]
  );

  const defaultHostOptions = React.useMemo(() => {
    if (hostOptions.length > 0) return hostOptions;
    const filtered = selectedDepartment
      ? erpEmployees.filter((e) => (e.department || "").toLowerCase() === selectedDepartment.toLowerCase())
      : erpEmployees;
    return filtered.map((e) => ({
      value: e.employeeId,
      label: `${e.employeeName} (${e.employeeId})`,
      keywords: `${e.employeeName} ${e.employeeId}`,
      image: e.picUrl || undefined,
    }));
  }, [hostOptions, erpEmployees, selectedDepartment]);

  const onDeptChange = (val: string) => {
    if (handleDepartmentSelect) handleDepartmentSelect(val);
    else {
      form.setValue("department", val, { shouldValidate: true });
      form.setValue("hostEmployeeId", "");
      form.setValue("hostEmployeeName", "");
    }
  };

  const onHostChange = (val: string) => {
    if (handleHostSelect) handleHostSelect(val);
    else {
      const found = erpEmployees.find((e) => e.employeeId === val);
      if (found) {
        form.setValue("hostEmployeeId", found.employeeId, { shouldValidate: true });
        form.setValue("hostEmployeeName", found.employeeName, { shouldValidate: true });
        if (found.department) form.setValue("department", found.department, { shouldValidate: true });
      } else {
        form.setValue("hostEmployeeId", "");
        form.setValue("hostEmployeeName", "");
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* ── SECTION 1: PERSONAL INFORMATION ── */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-[#0c1b33] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <User className="h-4 w-4 text-cyan-400" /> PERSONAL INFORMATION
          </div>
          {lookupAvatarUrl && (
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-cyan-300 font-medium">Record Avatar Loaded</span>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={lookupAvatarUrl} alt="Avatar" className="h-6 w-6 rounded-full object-cover border border-cyan-400/50" />
            </div>
          )}
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">VISITOR NAME *</label>
            <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="Full name" {...form.register("visitorName")} className="pl-9 text-xs h-10 rounded-xl" /></div>
            {form.formState.errors.visitorName && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorName.message}</p>}
          </div>
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">CONTACT NUMBER *</label>
            <div className="relative"><Phone className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="e.g. 01711234567" {...form.register("contactNumber")} className="pl-9 text-xs h-10 rounded-xl" /></div>
            {form.formState.errors.contactNumber && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.contactNumber.message}</p>}
          </div>
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">EMAIL ADDRESS</label>
            <div className="relative"><Mail className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="email@example.com" {...form.register("emailAddress")} className="pl-9 text-xs h-10 rounded-xl" /></div>
          </div>
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">COMPANY / ADDRESS *</label>
            <div className="relative"><Building className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="Company name or address" {...form.register("companyAddress")} className="pl-9 text-xs h-10 rounded-xl" /></div>
            {form.formState.errors.companyAddress && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.companyAddress.message}</p>}
          </div>
        </div>
      </div>

      {/* ── SECTION 2: VISIT INFORMATION ── */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-[#0c1b33] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Briefcase className="h-4 w-4 text-cyan-400" /> VISIT INFORMATION
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">VISITOR TYPE *</label>
            <div className="relative">
              <Select value={form.watch("visitorType") || ""} onValueChange={(val) => form.setValue("visitorType", val, { shouldValidate: true })}>
                <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10 text-xs">
                  <HelpCircle className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>{activeVisitorTypes.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.formState.errors.visitorType && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorType.message}</p>}
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">PURPOSE OF VISIT *</label>
            <div className="relative">
              <Select value={form.watch("purposeOfVisit") || ""} onValueChange={(val) => form.setValue("purposeOfVisit", val, { shouldValidate: true })}>
                <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10 text-xs">
                  <FileText className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <SelectValue placeholder="Select purpose" />
                </SelectTrigger>
                <SelectContent>{activePurposes.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            {form.formState.errors.purposeOfVisit && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.purposeOfVisit.message}</p>}
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">DEPARTMENT *</label>
            <SearchableSelect
              items={defaultDepartmentOptions}
              value={selectedDepartment || ""}
              onChange={onDeptChange}
              placeholder={erpLoading ? "Loading departments..." : "Select department"}
              searchPlaceholder="Search department..."
              loading={erpLoading}
              onSearchChange={(q) => setDeptSearch?.(q)}
            />
            {form.formState.errors.department && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.department.message}</p>}
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">HOST NAME / EMPLOYEE NAME *</label>
            <div className="flex gap-2 w-full">
              <div className="flex-1 min-w-0">
                <SearchableSelect
                  items={defaultHostOptions}
                  value={selectedHostId || ""}
                  onChange={onHostChange}
                  placeholder={erpLoading ? "Loading employees..." : "Select host / employee"}
                  searchPlaceholder="Search name or ID..."
                  loading={erpLoading}
                  onSearchChange={(q) => setHostSearch?.(q)}
                />
              </div>
              {(selectedHostId || selectedDepartment) && handleResetHostAndDepartment && (
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
            {form.formState.errors.hostEmployeeId && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.hostEmployeeId.message}</p>}
          </div>
        </div>
      </div>

      {/* ── SECTION 3: ID & SECURITY ── */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-[#0c1b33] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Shield className="h-4 w-4 text-cyan-400" /> ID & SECURITY
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">ID PROOF TYPE</label>
            <div className="relative">
              <Select value={form.watch("idProofType") || ""} onValueChange={(val) => form.setValue("idProofType", val)}>
                <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10 text-xs">
                  <CreditCard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <SelectValue placeholder="Select ID type" />
                </SelectTrigger>
                <SelectContent>{idProofTypes.map((i) => <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">ID PROOF NUMBER</label>
            <div className="relative"><CreditCard className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="ID document number" {...form.register("idProofNumber")} className="pl-9 text-xs h-10 rounded-xl" /></div>
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">VEHICLE NUMBER</label>
            <div className="relative"><Car className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="e.g. MH12AB1234" {...form.register("vehicleNumber")} className="pl-9 text-xs h-10 rounded-xl" /></div>
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">EXTRA GUEST</label>
            <div className="relative">
              <Select value={form.watch("extraGuest") || ""} onValueChange={(val) => form.setValue("extraGuest", val)}>
                <SelectTrigger className="relative h-10 w-full rounded-xl border-zinc-200 bg-white pl-10 text-xs">
                  <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>{extraGuestsOptions.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          <div className="md:col-span-2">
            <label className="font-semibold text-zinc-700 block mb-1">VISITOR PASS NO *</label>
            <div className="relative"><CreditCard className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="Pass / badge number" {...form.register("visitorPassNo")} className="pl-9 text-xs h-10 rounded-xl" /></div>
            {form.formState.errors.visitorPassNo && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorPassNo.message}</p>}
          </div>
        </div>
      </div>

      {/* ── SECTION 4: ENTRY & TIMING ── */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
        <div className="bg-[#0c1b33] px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs font-bold text-white uppercase tracking-wider">
            <Clock className="h-4 w-4 text-cyan-400" /> ENTRY & TIMING
          </div>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="font-semibold text-zinc-700 block mb-1">DATE OF VISIT *</label>
            <Input type="date" {...form.register("dateOfVisit")} className="text-xs h-10 rounded-xl" />
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">TIME IN *</label>
            <Input type="time" {...form.register("timeIn")} className="text-xs h-10 rounded-xl" />
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">ENTRY AUTHORIZED BY</label>
            <div className="relative"><User className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="Authorizing officer name" {...form.register("entryAuthorizedBy")} className="pl-9 text-xs h-10 rounded-xl" /></div>
          </div>

          <div>
            <label className="font-semibold text-zinc-700 block mb-1">REMARKS</label>
            <div className="relative"><FileText className="absolute left-3 top-3 h-4 w-4 text-zinc-400" /><Input placeholder="Any additional notes..." {...form.register("remarks")} className="pl-9 text-xs h-10 rounded-xl" /></div>
          </div>
        </div>
      </div>
    </div>
  );
}
