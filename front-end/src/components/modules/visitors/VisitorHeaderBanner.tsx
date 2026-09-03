"use client";

import React from "react";
import { Users, Calendar, Keyboard, Scan, CheckCircle, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type VisitorHeaderBannerProps = {
  kbEnabled: boolean;
  setKbEnabled?: (val: boolean) => void;
  recognitionStatus?: "idle" | "scanning" | "recognized" | "unrecognized";
  recognizedVisitorName?: string | null;
};

export function VisitorHeaderBanner({
  kbEnabled,
  setKbEnabled,
  recognitionStatus = "idle",
  recognizedVisitorName,
}: VisitorHeaderBannerProps) {
  const today = new Date();

  const handleToggleKeyboard = () => {
    if (typeof window !== "undefined") {
      const current = localStorage.getItem("virtual-keyboard-enabled") !== "false";
      localStorage.setItem("virtual-keyboard-enabled", current ? "false" : "true");
      window.dispatchEvent(new Event("virtualKeyboardSettingsChanged"));
      if (setKbEnabled) setKbEnabled(!current);
    }
  };

  return (
    <div className="space-y-4">
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
              onClick={handleToggleKeyboard}
              className={cn(
                "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                kbEnabled ? "bg-emerald-500" : "bg-zinc-600"
              )}
            >
              <span
                className={cn(
                  "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                  kbEnabled ? "translate-x-5" : "translate-x-0"
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
                your face in the camera box on the right and click &apos;Capture
                Photo&apos; to register.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

