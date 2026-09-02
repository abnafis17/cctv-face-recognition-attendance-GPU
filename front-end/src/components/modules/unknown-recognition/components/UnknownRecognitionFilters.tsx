"use client";

import React from "react";

interface UnknownRecognitionFiltersProps {
  selectedDate: string;
  setSelectedDate: (d: string) => void;
  fromTime: string;
  setFromTime: (t: string) => void;
  toTime: string;
  setToTime: (t: string) => void;
  applyFilters: () => void;
  clearFilters: () => void;
}

export default function UnknownRecognitionFilters({
  selectedDate,
  setSelectedDate,
  fromTime,
  setFromTime,
  toTime,
  setToTime,
  applyFilters,
  clearFilters,
}: UnknownRecognitionFiltersProps) {
  return (
    <div className="mt-4 rounded-xl border bg-white p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Date</label>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="w-full rounded-lg border px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-600">Time Range</label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="time"
              step={1}
              value={fromTime}
              onChange={(e) => setFromTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
            <input
              type="time"
              step={1}
              value={toTime}
              onChange={(e) => setToTime(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={clearFilters}
          className="rounded-lg border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={applyFilters}
          className="rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800"
        >
          Apply Filter
        </button>
      </div>
    </div>
  );
}
