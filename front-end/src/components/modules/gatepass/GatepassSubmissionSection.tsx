import { CheckCircle2, LoaderCircle, ClipboardList } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

import type {
  FormErrors,
  GatepassLeaveTypeOption,
  RecognizedGatepassRow,
} from "@/types/gatepass-types";

type Props = {
  recognizedRows: RecognizedGatepassRow[];
  gatepassLeaveTypes: GatepassLeaveTypeOption[];
  gatepassLeaveTypesLoading: boolean;
  gatepassLeaveTypesError: string;
  leaveTypeId: string;
  destination: string;
  purpose: string;
  formErrors: FormErrors;
  submitting: boolean;
  setLeaveTypeId: React.Dispatch<React.SetStateAction<string>>;
  setDestination: React.Dispatch<React.SetStateAction<string>>;
  setPurpose: React.Dispatch<React.SetStateAction<string>>;
  setFormErrors: React.Dispatch<React.SetStateAction<FormErrors>>;
  onSubmit: () => Promise<void>;
  onCancel: () => Promise<void>;
};

export default function GatepassSubmissionSection({
  recognizedRows,
  gatepassLeaveTypes,
  gatepassLeaveTypesLoading,
  gatepassLeaveTypesError,
  leaveTypeId,
  destination,
  purpose,
  formErrors,
  submitting,
  setLeaveTypeId,
  setDestination,
  setPurpose,
  setFormErrors,
  onSubmit,
  onCancel,
}: Props) {
  const hasQueue = recognizedRows.length > 0;

  return (
    <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-violet-500">
      
      {/* Header with Actions */}
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-2.5">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-lg bg-violet-50 flex items-center justify-center">
            <ClipboardList className="h-4 w-4 text-violet-650" />
          </div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Gatepass Request</h2>
        </div>
        
        {/* Actions in Header */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            type="button"
            className={cn(
              "h-8 px-3.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-sm",
              hasQueue 
                ? "bg-violet-600 text-white hover:bg-violet-700 shadow-md shadow-violet-600/10" 
                : "bg-zinc-100 text-zinc-400 border-zinc-200 cursor-not-allowed"
            )}
            onClick={() => {
              void onSubmit();
            }}
            disabled={submitting || !hasQueue}
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                <span>Submitting...</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>Submit</span>
              </>
            )}
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-8 px-3 rounded-md border border-zinc-200 bg-white text-zinc-655 hover:bg-zinc-50 hover:text-zinc-800 text-[11px] font-semibold uppercase tracking-wider transition-all"
            onClick={() => {
              void onCancel();
            }}
            disabled={submitting || !hasQueue}
          >
            Cancel
          </Button>
        </div>
      </div>

      {/* Form Fields in a Single Row */}
      <div className="p-3.5">
        <div className="flex flex-col lg:flex-row lg:items-end gap-3 w-full flex-wrap xl:flex-nowrap">
          
          {/* Leave Type Selector */}
          <div className="w-full lg:w-[150px] shrink-0 space-y-1">
            <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
              Leave Type <span className="text-rose-500">*</span>
            </label>
            <Select
              value={leaveTypeId || undefined}
              disabled={submitting || !hasQueue}
              onValueChange={(value) => {
                setLeaveTypeId(value);
                setPurpose("");
                setFormErrors((current) => ({
                  ...current,
                  leaveType: undefined,
                  purpose: undefined,
                }));
              }}
            >
              <SelectTrigger 
                className={cn(
                  "h-9 w-full rounded-md bg-white text-[11px] text-zinc-855 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors px-3",
                  formErrors.leaveType ? "border-rose-300 ring-rose-500" : "border-zinc-200"
                )}
              >
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="short leave" className="text-[11px]">Short Leave</SelectItem>
                <SelectItem value="Long Leave" className="text-[11px]">Long Leave</SelectItem>
              </SelectContent>
            </Select>
            {formErrors.leaveType && (
              <span className="text-[9px] font-semibold text-rose-655 block mt-0.5">
                {formErrors.leaveType}
              </span>
            )}
          </div>

          {/* Purpose Selector (Conditional for short leave) */}
          {leaveTypeId === "short leave" && (
            <div className="w-full lg:w-[150px] shrink-0 space-y-1 animate-in fade-in-50 slide-in-from-top-1 duration-200">
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                Purpose <span className="text-rose-500">*</span>
              </label>
              <Select
                value={purpose || undefined}
                disabled={submitting || gatepassLeaveTypesLoading || gatepassLeaveTypes.length === 0 || !hasQueue}
                onValueChange={(value) => {
                  setPurpose(value);
                  setFormErrors((current) => ({
                    ...current,
                    purpose: undefined,
                  }));
                }}
              >
                <SelectTrigger
                  className={cn(
                    "h-9 w-full rounded-md bg-white text-[11px] text-zinc-855 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors px-3",
                    formErrors.purpose ? "border-rose-300 ring-rose-500" : "border-zinc-200",
                  )}
                >
                  <SelectValue
                    placeholder={
                      gatepassLeaveTypesLoading
                        ? "Loading..."
                        : gatepassLeaveTypes.length > 0
                          ? "Select purpose"
                          : "No purposes"
                    }
                  />
                </SelectTrigger>
                <SelectContent align="start">
                  {gatepassLeaveTypes.map((leaveType) => (
                    <SelectItem key={leaveType.id} value={leaveType.id} className="text-[11px]">
                      {leaveType.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {gatepassLeaveTypesError && (
                <span className="text-[9px] font-semibold text-rose-655 block mt-0.5">
                  {gatepassLeaveTypesError}
                </span>
              )}
              {formErrors.purpose && (
                <span className="text-[9px] font-semibold text-rose-655 block mt-0.5">
                  {formErrors.purpose}
                </span>
              )}
            </div>
          )}

          {/* Destination (Optional) */}
          <div className="flex-1 min-w-[150px] space-y-1">
            <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
              Destination <span className="text-zinc-300 font-normal">(Optional)</span>
            </label>
            <Input
              value={destination}
              disabled={submitting || !hasQueue}
              onChange={(event) => setDestination(event.target.value)}
              placeholder="e.g. Hospital, Bank, Home"
              className="h-9 rounded-md border-zinc-200 bg-white text-[11px] text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
