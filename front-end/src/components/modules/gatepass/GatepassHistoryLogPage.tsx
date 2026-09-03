"use client";

import React, { useMemo } from "react";
import { History, Search, RotateCcw, Calendar, Filter, RefreshCcw } from "lucide-react";
import { getHistoryColumns } from "./historyColumns";
import GatepassReportModal from "./GatepassReportModal";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useGatepassHistoryState } from "./useGatepassHistoryState";

export default function GatepassHistoryLogPage() {
  const {
    rows,
    now,
    selectedReportRecord,
    isReportModalOpen,
    setIsReportModalOpen,
    loading,
    search,
    setSearch,
    fromDate,
    setFromDate,
    toDate,
    setToDate,
    leaveTypeCategory,
    setLeaveTypeCategory,
    currentPage,
    setCurrentPage,
    pageLimit,
    handleViewReport,
    fetchHistory,
  } = useGatepassHistoryState();

  const columns = useMemo(
    () => getHistoryColumns(now, handleViewReport),
    [now, handleViewReport]
  );

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * pageLimit;
    return rows.slice(start, start + pageLimit);
  }, [rows, currentPage, pageLimit]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-zinc-200/80 shadow-2xs">
        <div>
          <h1 className="text-xl font-bold text-zinc-900 flex items-center gap-2">
            <History className="w-5 h-5 text-indigo-600" />
            Gate Pass History Log
          </h1>
          <p className="text-xs text-zinc-500 mt-1">
            Complete record of employee movements and gatepass approvals
          </p>
        </div>

        <button
          onClick={fetchHistory}
          className="inline-flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition"
        >
          <RefreshCcw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh Log
        </button>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-xl border border-zinc-200/80 p-4 shadow-2xs grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700">Search Log</label>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <Input
              type="text"
              placeholder="Search Name or Emp ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-xs"
            />
          </div>
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700">From Date</label>
          <Input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700">To Date</label>
          <Input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="text-xs"
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-semibold text-zinc-700">Leave Type</label>
          <select
            value={leaveTypeCategory}
            onChange={(e) => setLeaveTypeCategory(e.target.value as any)}
            className="w-full h-9 rounded-md border border-zinc-200 bg-white px-3 text-xs outline-none"
          >
            <option value="all">All Leave Types</option>
            <option value="short">Short Leave</option>
            <option value="long">Long Leave</option>
          </select>
        </div>
      </div>

      {/* Table Container */}
      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-2xs">
        <TanstackDataTable data={paginatedRows} columns={columns} loading={loading} />
        {rows.length > 0 && (
          <div className="p-4 border-t border-zinc-100">
            <Pagination
              numberOfData={rows.length}
              limits={pageLimit}
              getCurrentPage={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Report Details Modal */}
      <GatepassReportModal
        open={isReportModalOpen}
        onClose={() => setIsReportModalOpen(false)}
        record={selectedReportRecord}
      />
    </div>
  );
}
