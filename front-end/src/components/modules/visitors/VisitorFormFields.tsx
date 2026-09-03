"use client";

import React from "react";
import { User, Phone, Mail, Building } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import { useErpEmployees } from "@/hooks/useErpEmployees";
import type { UseFormReturn } from "react-hook-form";
import type { VisitorFormValues } from "@/lib/validation/visitor-schema";

type VisitorFormFieldsProps = {
  form: UseFormReturn<VisitorFormValues>;
  visitorTypesList: string[];
  purposesList: string[];
  idProofTypes: string[];
  extraGuestsOptions: string[];
};

export function VisitorFormFields({
  form,
  visitorTypesList,
  purposesList,
  idProofTypes,
  extraGuestsOptions,
}: VisitorFormFieldsProps) {
  const { employees: erpEmployees, loading: erpLoading } = useErpEmployees();
  const employeeOptions = React.useMemo(
    () => erpEmployees.map((e) => ({ value: e.employeeId, label: `${e.employeeName} (${e.employeeId}) - ${e.department || ""}` })),
    [erpEmployees]
  );

  const handleHostSelect = (empId: string) => {
    const found = erpEmployees.find((e) => e.employeeId === empId);
    if (found) {
      form.setValue("hostEmployeeId", found.employeeId, { shouldValidate: true });
      form.setValue("hostEmployeeName", found.employeeName, { shouldValidate: true });
      form.setValue("department", found.department || "General", { shouldValidate: true });
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Visitor Full Name *</label>
        <div className="relative">
          <User className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input placeholder="John Doe" {...form.register("visitorName")} className="pl-9 text-xs h-9" />
        </div>
        {form.formState.errors.visitorName && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorName.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Mobile / Phone Number *</label>
        <div className="relative">
          <Phone className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input placeholder="01700000000" {...form.register("contactNumber")} className="pl-9 text-xs h-9" />
        </div>
        {form.formState.errors.contactNumber && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.contactNumber.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Email Address</label>
        <div className="relative">
          <Mail className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input placeholder="visitor@example.com" {...form.register("emailAddress")} className="pl-9 text-xs h-9" />
        </div>
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Company / Address *</label>
        <div className="relative">
          <Building className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
          <Input placeholder="Acme Inc., Dhaka" {...form.register("companyAddress")} className="pl-9 text-xs h-9" />
        </div>
        {form.formState.errors.companyAddress && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.companyAddress.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Host Employee to Visit *</label>
        <SearchableSelect
          items={employeeOptions}
          value={form.watch("hostEmployeeId") || ""}
          onChange={handleHostSelect}
          placeholder={erpLoading ? "Loading Employees..." : "Search & Select Employee"}
        />
        {form.formState.errors.hostEmployeeId && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.hostEmployeeId.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Visitor Category *</label>
        <Select value={form.watch("visitorType") || ""} onValueChange={(val) => form.setValue("visitorType", val, { shouldValidate: true })}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Category" /></SelectTrigger>
          <SelectContent>{visitorTypesList.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
        </Select>
        {form.formState.errors.visitorType && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorType.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Purpose of Visit *</label>
        <Select value={form.watch("purposeOfVisit") || ""} onValueChange={(val) => form.setValue("purposeOfVisit", val, { shouldValidate: true })}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select Purpose" /></SelectTrigger>
          <SelectContent>{purposesList.map((p) => <SelectItem key={p} value={p} className="text-xs">{p}</SelectItem>)}</SelectContent>
        </Select>
        {form.formState.errors.purposeOfVisit && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.purposeOfVisit.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Badge / Pass Number *</label>
        <Input placeholder="Pass #101" {...form.register("visitorPassNo")} className="text-xs h-9" />
        {form.formState.errors.visitorPassNo && <p className="text-[11px] text-red-500 mt-0.5">{form.formState.errors.visitorPassNo.message}</p>}
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">ID Proof Type</label>
        <Select value={form.watch("idProofType") || ""} onValueChange={(val) => form.setValue("idProofType", val)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select ID Proof Type" /></SelectTrigger>
          <SelectContent>{idProofTypes.map((i) => <SelectItem key={i} value={i} className="text-xs">{i}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">ID Proof Number</label>
        <Input placeholder="NID / ID Number" {...form.register("idProofNumber")} className="text-xs h-9" />
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Vehicle Registration Number</label>
        <Input placeholder="DHAKA METRO-GA 11-2233" {...form.register("vehicleNumber")} className="text-xs h-9" />
      </div>

      <div>
        <label className="font-semibold text-zinc-700 block mb-1">Extra Guests Count</label>
        <Select value={form.watch("extraGuest") || ""} onValueChange={(val) => form.setValue("extraGuest", val)}>
          <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="0 (None)" /></SelectTrigger>
          <SelectContent>{extraGuestsOptions.map((g) => <SelectItem key={g} value={g} className="text-xs">{g}</SelectItem>)}</SelectContent>
        </Select>
      </div>
    </div>
  );
}
