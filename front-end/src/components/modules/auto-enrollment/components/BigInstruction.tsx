"use client";

import React from "react";
import type { Step } from "../types";
import { stepArrow } from "../utils";

export const BigInstruction = React.memo(function BigInstruction({
  title,
  hint,
  step,
}: {
  title: string;
  hint: string;
  step: Step;
}) {
  return (
    <div className="rounded-md border border-zinc-100 bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Next Instruction</div>
          <div className="text-lg font-bold text-zinc-900 truncate mt-0.5">{title}</div>
        </div>
        <div className="h-11 w-11 rounded-md border border-violet-150 flex items-center justify-center text-2xl font-bold bg-violet-50 text-violet-600 shadow-xs">
          {stepArrow(step)}
        </div>
      </div>

      <div className="rounded-md border border-zinc-150 bg-zinc-50/50 p-4 text-zinc-700">
        <div className="text-xs font-bold text-zinc-800">{hint}</div>
        <div className="text-[11px] text-zinc-550 mt-1">
          Keep your face inside the box. Move slowly.
        </div>
      </div>
    </div>
  );
});
