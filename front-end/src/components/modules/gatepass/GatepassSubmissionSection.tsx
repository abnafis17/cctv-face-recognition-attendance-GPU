import { useState } from "react";
import { CheckCircle2, LoaderCircle, ClipboardList, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
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
  approxReturnTime: string;
  formErrors: FormErrors;
  submitting: boolean;
  setLeaveTypeId: React.Dispatch<React.SetStateAction<string>>;
  setDestination: React.Dispatch<React.SetStateAction<string>>;
  setPurpose: React.Dispatch<React.SetStateAction<string>>;
  setApproxReturnTime: React.Dispatch<React.SetStateAction<string>>;
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
  approxReturnTime,
  formErrors,
  submitting,
  setLeaveTypeId,
  setDestination,
  setPurpose,
  setApproxReturnTime,
  setFormErrors,
  onSubmit,
  onCancel,
}: Props) {
  const hasQueue = recognizedRows.length > 0;
  const [showPurposeDropdown, setShowPurposeDropdown] = useState(false);

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

      {/* Form Fields */}
      <div className="p-3.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
          
          {/* Leave Type Selector */}
          <div className="w-full space-y-1">
            <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
              Leave Type <span className="text-rose-500">*</span>
            </label>
            <Select
              value={leaveTypeId || undefined}
              disabled={submitting || !hasQueue}
              onValueChange={(value) => {
                setLeaveTypeId(value);
                setPurpose("");
                setApproxReturnTime("");
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

          {/* Purpose Selector (Conditional for short leave and long leave) */}
          {(leaveTypeId === "short leave" || leaveTypeId === "Long Leave") && (
            <div className="w-full space-y-1 animate-in fade-in-50 slide-in-from-top-1 duration-200">
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                Purpose <span className="text-rose-500">*</span>
              </label>
              <Popover open={showPurposeDropdown} onOpenChange={setShowPurposeDropdown}>
                <PopoverTrigger asChild>
                  <div
                    className={cn(
                      "h-9 w-full rounded-md bg-white text-[11px] text-zinc-855 border flex items-center justify-between transition-colors px-3 cursor-text",
                      formErrors.purpose ? "border-rose-300 ring-1 ring-rose-500" : "border-zinc-200 hover:border-zinc-300"
                    )}
                  >
                    <input
                      type="text"
                      value={purpose}
                      disabled={submitting || !hasQueue}
                      onChange={(event) => {
                        setPurpose(event.target.value);
                        setShowPurposeDropdown(true);
                        setFormErrors((current) => ({
                          ...current,
                          purpose: undefined,
                        }));
                      }}
                      onFocus={() => {
                        setShowPurposeDropdown(true);
                      }}
                      onBlur={() => {
                        // Delay closing the dropdown so item clicks can trigger onMouseDown
                        setTimeout(() => setShowPurposeDropdown(false), 200);
                      }}
                      placeholder={
                        gatepassLeaveTypesLoading
                          ? "Loading..."
                          : "Select or type purpose..."
                      }
                      className="w-full bg-transparent outline-none border-none p-0 text-[11px] text-zinc-855 placeholder:text-zinc-400 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0 focus:outline-none"
                      autoComplete="off"
                    />
                    <button
                      type="button"
                      disabled={submitting || !hasQueue}
                      onClick={() => setShowPurposeDropdown((prev) => !prev)}
                      className="flex-shrink-0 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <ChevronDown className={cn("w-3.5 h-3.5 transition-transform duration-200", showPurposeDropdown && "rotate-180")} />
                    </button>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[var(--radix-popover-trigger-width)] p-1 bg-white border border-zinc-200 rounded-md shadow-lg max-h-40 overflow-y-auto z-50 py-1"
                  align="start"
                  onOpenAutoFocus={(e) => e.preventDefault()}
                  onCloseAutoFocus={(e) => e.preventDefault()}
                >
                  <div className="flex flex-col">
                    {gatepassLeaveTypesLoading ? (
                      <div className="px-3 py-2 text-[10px] text-zinc-400 italic">
                        Loading purposes...
                      </div>
                    ) : (
                      (() => {
                        const filtered = gatepassLeaveTypes.filter((option) =>
                          option.label.toLowerCase().includes(purpose.toLowerCase())
                        );
                        if (filtered.length > 0) {
                          return filtered.map((option) => (
                            <button
                              key={option.id}
                              type="button"
                              onMouseDown={() => {
                                setPurpose(option.label);
                                setShowPurposeDropdown(false);
                                setFormErrors((current) => ({
                                  ...current,
                                  purpose: undefined,
                                }));
                              }}
                              className="w-full text-left px-3 py-1.5 text-[11px] text-zinc-700 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
                            >
                              {option.label}
                            </button>
                          ));
                        }
                        return (
                          <div className="px-3 py-2 text-[10px] text-zinc-400 italic">
                            Press Enter or click away to use custom purpose
                          </div>
                        );
                      })()
                    )}
                  </div>
                </PopoverContent>
              </Popover>
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
          <div className="w-full space-y-1">
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

          {/* Approx. Return Time */}
          {leaveTypeId === "short leave" && (
            <div className="w-full space-y-1">
              <label className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider block">
                Approx. Return <span className="text-rose-500">*</span> <span className="text-zinc-300 font-normal">(minute)</span>
              </label>
              <Input
                type="number"
                min="1"
                value={approxReturnTime}
                disabled={submitting || !hasQueue}
                onChange={(event) => {
                  setApproxReturnTime(event.target.value);
                  setFormErrors((current) => ({
                    ...current,
                    approxReturnTime: undefined,
                  }));
                }}
                placeholder="e.g. 30, 60"
                className={cn(
                  "h-9 rounded-md bg-white text-[11px] text-zinc-855 shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors px-3",
                  formErrors.approxReturnTime ? "border-rose-300 ring-rose-500" : "border-zinc-200"
                )}
              />
              {formErrors.approxReturnTime && (
                <span className="text-[9px] font-semibold text-rose-655 block mt-0.5">
                  {formErrors.approxReturnTime}
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
