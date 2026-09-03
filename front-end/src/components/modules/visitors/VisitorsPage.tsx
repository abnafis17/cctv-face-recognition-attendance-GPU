"use client";

import React, { useMemo } from "react";
import { Users, Search, RotateCcw, Calendar, Filter } from "lucide-react";
import { getVisitorColumns } from "./visitorColumns";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useVisitorsState, visitorTypes } from "./useVisitorsState";

export default function VisitorsPage() {
  const {
    visitorList, loading, checkingOutIds, deletingIds, permissions, searchQuery, setSearchQuery,
    visitorTypeFilter, setVisitorTypeFilter, fromDate, setFromDate, toDate, setToDate, currentPage,
    setCurrentPage, pageLimit, handleResetFilters, paginatedRows, paginationResetKey,
    handleCheckout, handleDeleteVisitor,
  } = useVisitorsState();

  const columns = useMemo(() => {
    const skip = (currentPage - 1) * pageLimit;
    return getVisitorColumns(skip, handleCheckout, handleDeleteVisitor, checkingOutIds, deletingIds, permissions);
  }, [currentPage, pageLimit, handleCheckout, handleDeleteVisitor, checkingOutIds, deletingIds, permissions]);

  return (
    <div className="w-full pb-10 space-y-6">
      <div className="flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <Users className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold tracking-tight">Visitor List</h1>
            <p className="text-xs text-zinc-300">View and manage logged visitor entries</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full border-white/20 bg-white/10 text-white px-3 py-1 font-medium text-xs">
            Total Logs: {visitorList.length}
          </Badge>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#0c1b33]">
          <Filter className="h-4 w-4" /> Filter Visitor Records
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input
              placeholder="Search Name, Phone, Pass #..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 text-xs h-9"
            />
          </div>
          <Select value={visitorTypeFilter} onValueChange={setVisitorTypeFilter}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Visitor Category" /></SelectTrigger>
            <SelectContent>{visitorTypes.map((t) => <SelectItem key={t} value={t} className="text-xs">{t}</SelectItem>)}</SelectContent>
          </Select>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="pl-9 text-xs h-9" />
          </div>
          <div className="relative">
            <Calendar className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="pl-9 text-xs h-9" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2 border-t border-zinc-100">
          <Button type="button" onClick={handleResetFilters} variant="outline" className="h-8 text-xs font-medium rounded-lg">
            <RotateCcw className="w-3.5 h-3.5 mr-1.5" /> Reset Filters
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <TanstackDataTable columns={columns} data={paginatedRows} loading={loading} />
        <Pagination
          key={paginationResetKey}
          numberOfData={visitorList.length}
          limits={pageLimit}
          getCurrentPage={(p) => setCurrentPage(p)}
        />
      </div>
    </div>
  );
}