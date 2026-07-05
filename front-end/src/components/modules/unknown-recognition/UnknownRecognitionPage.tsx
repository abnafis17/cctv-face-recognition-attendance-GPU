"use client";

import React from "react";
import { ArrowUpDown, RefreshCcw } from "lucide-react";
import Pagination from "@/components/reusable/Pagination";
import { useUnknownRecognitions } from "./hooks/useUnknownRecognitions";
import UnknownRecognitionFilters from "./components/UnknownRecognitionFilters";
import UnknownRecognitionTable from "./components/UnknownRecognitionTable";

export default function UnknownRecognitionPage() {
  const {
    loading,
    sortOrder,
    setSortOrder,
    selectedDate,
    setSelectedDate,
    fromTime,
    setFromTime,
    toTime,
    setToTime,
    err,
    fetchUnknownRecognitions,
    applyFilters,
    clearFilters,
    sortedRows,
    paginatedRows,
    getCurrentPage,
    paginationResetKey,
    skip,
    PAGE_LIMIT,
  } = useUnknownRecognitions();

  return (
    <div>
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="page-header">
          <h1 className="page-title">Unknown Recognition History</h1>
          <p className="page-subtitle">
            Company-wise unknown face detections with date-time filters.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void fetchUnknownRecognitions()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            title="Refresh unknown recognition history"
            aria-label="Refresh unknown recognition history"
            disabled={loading}
          >
            <RefreshCcw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>

          <button
            type="button"
            onClick={() => setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"))}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-700 hover:bg-zinc-100"
            title="Toggle time order"
            aria-label="Toggle time sort order"
          >
            <ArrowUpDown className="h-3.5 w-3.5" />
            {sortOrder === "asc" ? "Ascending" : "Descending"}
          </button>
        </div>
      </div>

      <UnknownRecognitionFilters
        selectedDate={selectedDate}
        setSelectedDate={setSelectedDate}
        fromTime={fromTime}
        setFromTime={setFromTime}
        toTime={toTime}
        setToTime={setToTime}
        applyFilters={applyFilters}
        clearFilters={clearFilters}
      />

      {err ? (
        <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          {err}
        </div>
      ) : null}

      <UnknownRecognitionTable rows={paginatedRows} skip={skip} />

      {sortedRows.length > 0 ? (
        <div className="mt-4">
          <Pagination
            numberOfData={sortedRows.length}
            limits={PAGE_LIMIT}
            getCurrentPage={getCurrentPage}
            activeTab2={paginationResetKey}
          />
        </div>
      ) : null}
    </div>
  );
}
