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
    <div className="rounded-2xl border bg-white p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm text-gray-500">Next</div>
          <div className="text-2xl font-semibold truncate">{title}</div>
        </div>
        <div className="h-12 w-12 rounded-full border flex items-center justify-center text-2xl font-semibold bg-gray-50">
          {stepArrow(step)}
        </div>
      </div>

      <div className="rounded-xl border bg-gray-50 p-4 text-gray-700">
        <div className="text-sm font-medium">{hint}</div>
        <div className="text-xs text-gray-500 mt-1">
          Keep your face inside the box. Move slowly.
        </div>
      </div>
    </div>
  );
});
