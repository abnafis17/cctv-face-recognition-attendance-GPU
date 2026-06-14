"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Users, Search, RotateCcw, Calendar, Filter } from "lucide-react";
import { getVisitorColumns, type VisitorRecord } from "./visitorColumns";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import axiosInstance from "@/config/axiosInstance";
import toast from "react-hot-toast";

const visitorTypes = ["All Types", "Guest", "Contractor", "Official", "Interviewee", "Other"];

export default function VisitorsPage() {
  const [visitorList, setVisitorList] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingOutIds, setCheckingOutIds] = useState<Set<string>>(new Set());

  // Filters State
  const [searchQuery, setSearchQuery] = useState("");
  const [visitorTypeFilter, setVisitorTypeFilter] = useState("All Types");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 15;

  const fetchVisitorRecords = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setLoading(true);
    }
    try {
      const params: any = {
        limit: 200,
      };

      if (searchQuery.trim()) {
        params.q = searchQuery.trim();
      }
      if (visitorTypeFilter && visitorTypeFilter !== "All Types") {
        params.visitorType = visitorTypeFilter;
      }
      if (fromDate) {
        params.fromDate = fromDate;
      }
      if (toDate) {
        params.toDate = toDate;
      }

      const response = await axiosInstance.get("/visitors", { params });
      setVisitorList(response.data || []);
      setCurrentPage(1);
    } catch (error: any) {
      toast.error("Failed to load visitor records");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [searchQuery, visitorTypeFilter, fromDate, toDate]);

  useEffect(() => {
    fetchVisitorRecords();
  }, [fetchVisitorRecords]);

  const handleResetFilters = () => {
    setSearchQuery("");
    setVisitorTypeFilter("All Types");
    setFromDate("");
    setToDate("");
  };

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageLimit;
    return visitorList.slice(startIdx, startIdx + pageLimit);
  }, [visitorList, currentPage, pageLimit]);

  const paginationResetKey = useMemo(() => {
    return `${searchQuery}-${visitorTypeFilter}-${fromDate}-${toDate}-${visitorList.length}`;
  }, [searchQuery, visitorTypeFilter, fromDate, toDate, visitorList.length]);

  const handleCheckout = useCallback(
    async (id: string) => {
      setCheckingOutIds((prev) => {
        const next = new Set(prev);
        next.add(id);
        return next;
      });
      const toastId = toast.loading("Processing checkout...");
      try {
        const response = await axiosInstance.post(`/visitors/${id}/checkout`);
        if (response.data?.ok) {
          toast.success("Visitor checked out successfully!", { id: toastId });
          await fetchVisitorRecords(true); // silent refresh
        } else {
          toast.error(response.data?.error || "Checkout failed", { id: toastId });
        }
      } catch (error: any) {
        toast.error(
          error?.response?.data?.error || "Checkout request failed",
          { id: toastId }
        );
      } finally {
        setCheckingOutIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }
    },
    [fetchVisitorRecords]
  );

  const columns = useMemo(() => {
    const skip = (currentPage - 1) * pageLimit;
    return getVisitorColumns(skip, handleCheckout, checkingOutIds);
  }, [currentPage, pageLimit, handleCheckout, checkingOutIds]);

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Header Banner */}
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

      {/* Filters Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#0c1b33]">
          <Filter className="h-4 w-4" />
          Filter Visitor Records
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5">
          {/* Text Search */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search name, phone, pass..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10 pl-10 rounded-xl border-zinc-200"
            />
          </div>

          {/* Type Filter */}
          <Select value={visitorTypeFilter} onValueChange={setVisitorTypeFilter}>
            <SelectTrigger className="h-10 rounded-xl border-zinc-200 bg-white">
              <SelectValue placeholder="Visitor Type" />
            </SelectTrigger>
            <SelectContent>
              {visitorTypes.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* From Date */}
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-10 pl-10 rounded-xl border-zinc-200"
            />
          </div>

          {/* To Date */}
          <div className="relative">
            <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-10 pl-10 rounded-xl border-zinc-200"
            />
          </div>

          {/* Reset button */}
          <Button
            type="button"
            onClick={handleResetFilters}
            className="h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-2 cursor-pointer font-medium"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Filters
          </Button>
        </div>
      </div>

      {/* Data Table */}
      <div className="rounded-xl border border-zinc-200 bg-white shadow-sm overflow-hidden">
        <div className="min-h-[300px] w-full max-w-full overflow-hidden">
          <TanstackDataTable
            data={paginatedRows}
            columns={columns}
            loading={loading}
            className="w-full"
            freezeClassName="w-full max-w-full overflow-x-auto overflow-y-hidden rounded-none"
            emptyState="No visitor records found matching your filters."
          />
        </div>

        {visitorList.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
            <Pagination
              numberOfData={visitorList.length}
              limits={pageLimit}
              getCurrentPage={setCurrentPage}
              activeTab2={paginationResetKey}
            />
          </div>
        )}
      </div>
    </div>
  );
}