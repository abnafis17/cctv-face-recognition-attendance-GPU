"use client";

import React from "react";
import { Users, CalendarDays, Keyboard, Scan, CheckCircle, HelpCircle } from "lucide-react";

type VisitorHeaderBannerProps = {
  kbEnabled: boolean;
  recognitionStatus?: "idle" | "recognized" | "unrecognized";
  recognizedVisitorName?: string | null;
};

export function VisitorHeaderBanner({
  kbEnabled,
  recognitionStatus = "idle",
  recognizedVisitorName,
}: VisitorHeaderBannerProps) {
  const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" });

  const toggleKeyboard = () => {
    if (typeof window !== "undefined") {
      const next = !kbEnabled;
      localStorage.setItem("virtual-keyboard-enabled", String(next));
      window.location.reload();
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Dark Banner Header */}
      <div className="flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Add Visitor</h1>
            <p className="text-xs text-zinc-300">Register a new or returning visitor</p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {/* Virtual Keyboard Toggle Switch */}
          <button
            type="button"
            onClick={toggleKeyboard}
            className="flex items-center gap-2.5 rounded-xl bg-white/10 px-3 py-2 ring-1 ring-white/10 text-xs font-semibold text-white hover:bg-white/20 transition-all cursor-pointer"
          >
            <Keyboard className="h-4 w-4 text-cyan-400" />
            <span>KEYBOARD</span>
            <div className={`w-8 h-4 rounded-full p-0.5 transition-colors ${kbEnabled ? "bg-cyan-500" : "bg-zinc-600"}`}>
              <div className={`w-3 h-3 rounded-full bg-white transition-transform ${kbEnabled ? "translate-x-4" : "translate-x-0"}`} />
            </div>
          </button>

          {/* Current Date Badge */}
          <div className="flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2 text-xs font-medium ring-1 ring-white/10">
            <CalendarDays className="h-4 w-4 text-cyan-400" />
            <span>{dateStr}</span>
          </div>
        </div>
      </div>

      {/* Top Verification Status Banner */}
      <div>
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
                Please verify your face via the camera box on the right layout before submission. If recognized, personal details auto-fill. If new, capture your face photo to proceed.
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
                RECOGNIZED RETURNING VISITOR: {recognizedVisitorName || "Visitor"}
                <span className="rounded-full bg-emerald-500/30 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-200 uppercase tracking-normal">
                  VERIFIED
                </span>
              </h3>
              <p className="text-xs text-emerald-100/90 font-medium mt-0.5 leading-relaxed">
                Personal information auto-filled. Select your remaining visit details and enter Visitor Pass No. to complete registration.
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
                Your face template is not found in the database. Please align your face in the camera box on the right and click &apos;Capture Photo&apos; to register.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
