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
    <div className="flex min-h-0 min-w-0 flex-1 flex-col px-4 pb-5 xl:pb-6">
      <div className="pb-3">
        <div className="text-base font-semibold text-zinc-900">
          Gatepass Submission
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="flex h-full min-w-0 flex-col px-1 py-1 sm:px-2 sm:py-2">
          <div className="text-sm text-zinc-500">
            {recognizedRows.length
              ? `${recognizedRows.length} recognized employee${
                  recognizedRows.length > 1 ? "s" : ""
                } ready for submission`
              : "No recognized person in the queue."}
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 xl:gap-2.5">
            <div className="min-w-0 space-y-2">
              <div className="text-[11px] font-medium text-zinc-500">
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
                <SelectTrigger className="h-10 w-full rounded-xl border-zinc-100 bg-white text-sm text-zinc-900">
                  <SelectValue placeholder="Select leave type" />
                </SelectTrigger>
                <SelectContent align="start">
                  <SelectItem value="short leave">Short Leave</SelectItem>
                  <SelectItem value="Long Leave">Long Leave</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.leaveType ? (
                <div className="text-sm font-medium text-rose-600">
                  {formErrors.leaveType}
                </div>
              ) : null}
            </div>

            {leaveTypeId === "short leave" && (
              <div className="min-w-0 space-y-2">
                <div className="text-[11px] font-medium text-zinc-500">
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
                      "h-10 w-full rounded-xl bg-white text-sm text-zinc-900",
                      formErrors.purpose ? "border-rose-300" : "border-zinc-100",
                    )}
                  >
                    <SelectValue
                      placeholder={
                        gatepassLeaveTypesLoading
                          ? "Loading purposes..."
                          : gatepassLeaveTypes.length > 0
                            ? "Select purpose"
                            : "No purposes available"
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
                  <div className="text-sm font-medium text-rose-600">
                    {gatepassLeaveTypesError}
                  </div>
                ) : null}
                {formErrors.purpose ? (
                  <div className="text-sm font-medium text-rose-600">
                    {formErrors.purpose}
                  </div>
                ) : null}
              </div>
            )}

            <div className={cn(
              "min-w-0 space-y-2",
              leaveTypeId === "short leave"
                ? "sm:col-span-2 xl:col-span-1"
                : "sm:col-span-1"
            )}>
              <div className="text-[11px] font-medium text-zinc-500">
                Destination (Optional)
              </div>
              <Input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                placeholder="Enter destination (optional)"
                className="h-10 rounded-xl border-zinc-100 bg-white"
              />
            </div>
          </div>

          <div className="mt-4 flex w-full items-center justify-end pb-1 xl:pb-2">
            <Button
              type="button"
              className="h-10 w-full rounded-xl bg-zinc-900 px-4 text-white hover:bg-zinc-800 sm:w-[190px]"
              onClick={() => {
                void onSubmit();
              }}
              disabled={submitting || recognizedRows.length === 0}
            >
              {submitting ? (
                <>
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  Submit Gatepass
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
