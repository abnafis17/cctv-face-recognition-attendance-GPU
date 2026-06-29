import { CheckCircle2, LoaderCircle } from "lucide-react";

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
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-none flex-col border-b border-zinc-100 bg-white p-3 md:px-5 md:py-3">
      <div className="w-full flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        
        {/* Info text & Form inputs container */}
        <div className="flex flex-1 flex-col gap-3 lg:flex-row lg:items-end min-w-0">
          
          {/* Label / Status Info */}
          <div className="shrink-0 pb-1 lg:max-w-[200px]">
            <div className="text-sm font-semibold text-zinc-800">
              Gatepass Submission
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">
              {recognizedRows.length
                ? `${recognizedRows.length} employee${
                    recognizedRows.length > 1 ? "s" : ""
                  } ready`
                : "No employee in queue"}
            </div>
          </div>

          {/* Form Fields side by side */}
          <div className="flex flex-1 flex-wrap items-end gap-3 min-w-0">
            
            {/* Leave Type */}
            <div className="w-full sm:w-[180px] space-y-1">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Leave Type <span className="text-rose-500">*</span>
              </div>
              <Select
                value={leaveTypeId || undefined}
                disabled={submitting}
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
                <SelectTrigger className="h-9 w-full rounded-xl border-zinc-200 bg-white text-sm text-zinc-800 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="short leave">Short Leave</SelectItem>
                  <SelectItem value="Long Leave">Long Leave</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.leaveType ? (
                <div className="text-xs font-medium text-rose-600">
                  {formErrors.leaveType}
                </div>
              ) : null}
            </div>

            {/* Purpose */}
            {leaveTypeId === "short leave" && (
              <div className="w-full sm:w-[180px] space-y-1">
                <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                  Purpose <span className="text-rose-500">*</span>
                </div>
                <Select
                  value={purpose || undefined}
                  disabled={submitting || gatepassLeaveTypesLoading || gatepassLeaveTypes.length === 0}
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
                      "h-9 w-full rounded-xl bg-white text-sm text-zinc-800 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors",
                      formErrors.purpose ? "border-rose-300" : "border-zinc-200",
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
                      <SelectItem key={leaveType.id} value={leaveType.id}>
                        {leaveType.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {gatepassLeaveTypesError ? (
                  <div className="text-xs font-medium text-rose-600">
                    {gatepassLeaveTypesError}
                  </div>
                ) : null}
                {formErrors.purpose ? (
                  <div className="text-xs font-medium text-rose-600">
                    {formErrors.purpose}
                  </div>
                ) : null}
              </div>
            )}

            {/* Destination */}
            <div className="flex-1 min-w-[200px] space-y-1">
              <div className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wider">
                Destination (Optional)
              </div>
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Enter destination"
                className="h-9 rounded-xl border-zinc-200 bg-white text-sm text-zinc-800 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors"
              />
            </div>
            
          </div>
        </div>

        {/* Submit button on the right */}
        <div className="shrink-0 lg:pl-4">
          <Button
            type="button"
            className="h-9 w-full rounded-xl bg-zinc-900 px-5 text-white hover:bg-zinc-800 sm:w-[180px] text-xs font-semibold uppercase tracking-wider transition-all flex items-center justify-center gap-1.5"
            onClick={() => {
              void onSubmit();
            }}
            disabled={submitting || recognizedRows.length === 0}
          >
            {submitting ? (
              <>
                <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                Submitting...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" />
                Submit Gatepass
              </>
            )}
          </Button>
        </div>

      </div>
    </div>
  );
}
