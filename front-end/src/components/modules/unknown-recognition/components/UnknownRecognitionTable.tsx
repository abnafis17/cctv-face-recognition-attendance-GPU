"use client";

import React from "react";
import type { UnknownRecognitionRow } from "../hooks/useUnknownRecognitions";

interface UnknownRecognitionTableProps {
  rows: UnknownRecognitionRow[];
  skip: number;
}

function formatDatePart(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

function formatTimePart(timestamp: string): string {
  const d = new Date(timestamp);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

export default function UnknownRecognitionTable({ rows, skip }: UnknownRecognitionTableProps) {
  return (
    <div className="mt-6 overflow-x-auto rounded-xl border bg-white">
      <table className="min-w-full text-sm">
        <thead className="bg-gray-100 text-left">
          <tr>
            <th className="px-4 py-3">SL</th>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Date</th>
            <th className="px-4 py-3">Time</th>
            <th className="px-4 py-3">Camera Name</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, index) => (
            <tr key={r.id} className="border-t">
              <td className="px-4 py-2">{skip + index + 1}</td>
              <td className="px-4 py-2 font-medium">{r.name || "Unknown"}</td>
              <td className="px-4 py-2">{formatDatePart(r.timestamp)}</td>
              <td className="px-4 py-2">{formatTimePart(r.timestamp)}</td>
              <td className="px-4 py-2">{r.cameraName ?? "N/A"}</td>
            </tr>
          ))}

          {rows.length === 0 ? (
            <tr>
              <td colSpan={5} className="px-4 py-6 text-center text-gray-500">
                No unknown recognition records found
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
