"use client";

import React from "react";

export const RingProgress = React.memo(function RingProgress({
  value,
  label,
  sublabel,
}: {
  value: number; // 0..100
  label: string;
  sublabel?: string;
}) {
  const r = 46;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value));
  const dash = (pct / 100) * c;

  return (
    <div className="flex items-center gap-4">
      <svg width="100" height="100" viewBox="0 0 120 120" className="shrink-0">
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="rgba(124, 58, 237, 0.08)"
          strokeWidth="10"
          fill="none"
        />
        <circle
          cx="60"
          cy="60"
          r={r}
          stroke="rgb(124, 58, 237)"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 60 60)"
        />
        <circle cx="60" cy="60" r="34" fill="rgba(124, 58, 237, 0.03)" />
        <text
          x="60"
          y="66"
          textAnchor="middle"
          fontSize="18"
          fontWeight="800"
          fill="rgb(124, 58, 237)"
        >
          {pct}%
        </text>
      </svg>

      <div className="min-w-0">
        <div className="text-sm font-bold text-zinc-900">{label}</div>
        {sublabel ? (
          <div className="text-xs text-zinc-500 mt-1 leading-relaxed">{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
});
