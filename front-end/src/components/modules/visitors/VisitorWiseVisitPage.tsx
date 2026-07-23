"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  Users,
  Search,
  RotateCcw,
  Calendar,
  Filter,
  BarChart3,
  TrendingUp,
  UserCheck,
  ChevronDown,
  ChevronUp,
  Building,
  Phone,
  Clock,
  Briefcase,
  FileText,
  User,
  Award
} from "lucide-react";
import axiosInstance, { API } from "@/config/axiosInstance";
import toast from "react-hot-toast";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface VisitRecord {
  id: string;
  date: string;
  timeIn: string;
  timeOut?: string | null;
  purpose: string;
  status: string;
  visitorPassNo: string;
  hostName: string;
  hostDepartment: string;
}

interface VisitorReport {
  visitorName: string;
  contactNumber: string;
  companyAddress: string;
  visitorPhoto?: string | null;
  totalVisits: number;
  hostsMet: number;
  lastVisit: string;
  history: VisitRecord[];
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec"
  ];
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  const dayStr = day.length === 1 ? `0${day}` : day;
  return `${dayStr} ${months[monthIdx]} ${year}`;
}

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "--";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  const hours12Str = hours12 < 10 ? `0${hours12}` : hours12;
  return `${hours12Str}:${minutesStr} ${ampm}`;
}

export default function VisitorWiseVisitPage() {
  const [reportData, setReportData] = useState<VisitorReport[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters State
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [searchVisitor, setSearchVisitor] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  // Collapsible States
  const [expandedVisitors, setExpandedVisitors] = useState<Set<string>>(new Set());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (activeSearch.trim()) params.q = activeSearch.trim();

      const response = await axiosInstance.get(API.VISITORS_REPORT_VISITOR_WISE, {
        params
      });
      setReportData(response.data || []);
      setExpandedVisitors(new Set());
    } catch (error: any) {
      toast.error("Failed to load visitor wise report");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, activeSearch]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleApplyFilters = () => {
    setActiveSearch(searchVisitor);
  };

  const handleResetFilters = () => {
    setFromDate("");
    setToDate("");
    setSearchVisitor("");
    setActiveSearch("");
  };

  const toggleVisitor = (contactNumber: string) => {
    setExpandedVisitors((prev) => {
      const next = new Set(prev);
      if (next.has(contactNumber)) {
        next.delete(contactNumber);
      } else {
        next.add(contactNumber);
      }
      return next;
    });
  };

  // Stats calculation
  const stats = useMemo(() => {
    let totalVisits = 0;
    const uniqueVisitorSet = new Set<string>();
    let topVisitorName = "N/A";
    let topVisitorVisits = 0;

    for (const item of reportData) {
      totalVisits += item.totalVisits;
      uniqueVisitorSet.add(item.contactNumber);
      if (item.totalVisits > topVisitorVisits) {
        topVisitorVisits = item.totalVisits;
        topVisitorName = item.visitorName;
      }
    }

    return {
      totalVisits,
      uniqueVisitors: uniqueVisitorSet.size,
      topVisitor: topVisitorName,
      topVisitorVisits
    };
  }, [reportData]);

  // Overall Date range string for indicator
  const dateRangeStr = useMemo(() => {
    if (fromDate && toDate) {
      return `${formatDate(fromDate)} - ${formatDate(toDate)}`;
    }
    if (fromDate) {
      return `From ${formatDate(fromDate)}`;
    }
    if (toDate) {
      return `Until ${formatDate(toDate)}`;
    }
    return "All Time";
  }, [fromDate, toDate]);

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Header Banner */}
      <div className="flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <FileText className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold tracking-tight">Visitor Wise Visit Report</h1>
            <p className="text-xs text-zinc-300">Comprehensive visit history per individual visitor</p>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-zinc-300">
          <Calendar className="h-4 w-4" />
          <span>{new Date().toLocaleDateString("en-US", { day: "2-digit", month: "short", year: "numeric" })}</span>
        </div>
      </div>

      {/* Filters Card */}
      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">From</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-transparent px-3 text-sm focus:outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">To</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="h-10 rounded-xl border border-zinc-200 bg-transparent px-3 text-sm focus:outline-none"
              />
            </div>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleApplyFilters}
                className="h-10 rounded-xl bg-[#0c1b33] text-white hover:bg-[#11274c] px-5 flex items-center gap-2 font-medium cursor-pointer"
              >
                <Filter className="h-4 w-4" />
                Apply
              </Button>
              <Button
                type="button"
                onClick={handleResetFilters}
                className="h-10 rounded-xl border border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 px-5 flex items-center gap-2 font-medium cursor-pointer"
              >
                <RotateCcw className="h-4 w-4" />
                Reset
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Inline Info Badge */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 h-10 bg-zinc-50 border border-zinc-200 rounded-xl text-xs text-zinc-500 font-normal">
              <TrendingUp className="h-3.5 w-3.5 text-zinc-400" />
              <span>{stats.totalVisits} visits</span>
              <span className="text-zinc-300">·</span>
              <span>{dateRangeStr}</span>
            </div>

            <div className="flex items-center gap-2 min-w-[280px] relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <Input
                placeholder="Type name, phone..."
                value={searchVisitor}
                onChange={(e) => setSearchVisitor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleApplyFilters();
                }}
                className="h-10 pl-10 rounded-xl border-zinc-200 w-full"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <TrendingUp className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-light text-zinc-800">{stats.totalVisits}</div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Total Visits</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-light text-zinc-800">{stats.uniqueVisitors}</div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Unique Visitors</div>
          </div>
        </div>

        <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Award className="h-6 w-6" />
          </div>
          <div>
            <div className="text-sm font-medium text-zinc-800 truncate max-w-[240px]" title={stats.topVisitor}>
              {stats.topVisitor}
            </div>
            <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
              Most Frequent ({stats.topVisitorVisits} visits)
            </div>
          </div>
        </div>
      </div>

      {/* Accordion Section Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 px-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Visitor Summary — {reportData.length} Visitors
        </div>
        <div className="text-[11px] font-normal text-zinc-400">
          Click a visitor to expand history
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col gap-3 py-10 items-center justify-center text-zinc-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
            <span className="text-sm font-medium">Generating visitor wise report...</span>
          </div>
        ) : reportData.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-10 text-center text-zinc-500">
            No report data found matching the selected filters.
          </div>
        ) : (
          reportData.map((visitor, index) => {
            const isExpanded = expandedVisitors.has(visitor.contactNumber);
            
            // Extract unique purposes for badges
            const purposeBadges = Array.from(
              new Set(visitor.history.map((h) => h.purpose).filter(Boolean))
            );

            return (
              <div
                key={visitor.contactNumber}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-200"
              >
                {/* Row Header */}
                <div
                  onClick={() => toggleVisitor(visitor.contactNumber)}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 cursor-pointer select-none transition-colors ${
                    isExpanded
                      ? "bg-[#0c1b33] text-white hover:bg-[#0c1b33]/95"
                      : "bg-white text-zinc-800 hover:bg-zinc-50/50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Index Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        isExpanded
                          ? "bg-white/10 text-white ring-1 ring-white/20"
                          : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                      }`}
                    >
                      {index + 1}
                    </div>
                    {/* User Icon Avatar */}
                    {visitor.visitorPhoto ? (
                      <img
                        src={visitor.visitorPhoto}
                        alt={visitor.visitorName}
                        className="h-10 w-10 rounded-full border border-zinc-200 object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          isExpanded
                            ? "bg-white/10 text-white"
                            : "bg-blue-50 text-blue-600 border border-blue-100/50"
                        }`}
                      >
                        <User className="h-5 w-5" />
                      </div>
                    )}
                    <div>
                      <h3 className={`font-semibold text-[15px] ${isExpanded ? "text-white" : "text-zinc-800"}`}>
                        {visitor.visitorName}
                      </h3>
                      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 text-xs mt-0.5 ${isExpanded ? "text-zinc-300" : "text-zinc-400"}`}>
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {visitor.contactNumber}
                        </span>
                        {visitor.companyAddress && (
                          <span className="flex items-center gap-1 max-w-[300px] truncate" title={visitor.companyAddress}>
                            <Briefcase className="h-3 w-3" />
                            {visitor.companyAddress}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-3 sm:mt-0 flex-wrap sm:flex-nowrap">
                    <div className="text-left sm:text-right">
                      <div className="text-lg font-light leading-none">{visitor.totalVisits}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Total Visits
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-lg font-light leading-none">{visitor.hostsMet}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Hosts Met
                      </div>
                    </div>

                    <div className="text-left sm:text-right min-w-[120px]">
                      <div className="text-[13px] font-medium leading-none">{formatDate(visitor.lastVisit)}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Last Visit
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isExpanded ? (
                        <ChevronUp className="h-5 w-5 opacity-80" />
                      ) : (
                        <ChevronDown className="h-5 w-5 opacity-60" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Visit History details */}
                {isExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50/10 p-5 overflow-x-auto">
                    <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm space-y-4 min-w-[800px]">
                      {/* Visit History Header */}
                      <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
                        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                          <Clock className="h-3.5 w-3.5" />
                          Visit History — {visitor.totalVisits} Visits
                        </div>
                        {/* Unique Purpose tags */}
                        <div className="flex items-center gap-1.5">
                          {purposeBadges.map((p) => (
                            <Badge
                              key={p}
                              variant="outline"
                              className="rounded-full bg-slate-50 border-zinc-200 font-normal text-zinc-600 text-[10px] px-2 py-0.5"
                            >
                              {p}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Visit History Table */}
                      <table className="w-full border-collapse text-left text-xs text-zinc-600">
                        <thead>
                          <tr className="border-b border-zinc-200 text-zinc-400 font-medium uppercase tracking-wider">
                            <th className="py-2.5 px-3 w-[50px]">#</th>
                            <th className="py-2.5 px-3">Date</th>
                            <th className="py-2.5 px-3">Time In</th>
                            <th className="py-2.5 px-3">Time Out</th>
                            <th className="py-2.5 px-3">Purpose</th>
                            <th className="py-2.5 px-3">Met With</th>
                            <th className="py-2.5 px-3">Status</th>
                            <th className="py-2.5 px-3">Pass No.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visitor.history.map((record, rIndex) => (
                            <tr key={record.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                              <td className="py-3 px-3 text-zinc-400 font-normal">
                                {rIndex + 1}
                              </td>
                              <td className="py-3 px-3 text-zinc-700 font-normal">
                                {formatDate(record.date)}
                              </td>
                              <td className="py-3 px-3 text-zinc-500 font-normal">
                                {formatTime12h(record.timeIn)}
                              </td>
                              <td className="py-3 px-3 text-zinc-500 font-normal">
                                {formatTime12h(record.timeOut)}
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  key={record.purpose}
                                  variant="outline"
                                  className="rounded-full bg-blue-50 text-blue-700 border-blue-100 font-normal px-2.5 py-0.5 text-[10px]"
                                >
                                  {record.purpose}
                                </Badge>
                              </td>
                              <td className="py-3 px-3">
                                <div className="font-medium text-zinc-800 text-[13px]">
                                  {record.hostName}
                                </div>
                                <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                                  {record.hostDepartment}
                                </div>
                              </td>
                              <td className="py-3 px-3">
                                <Badge
                                  variant="outline"
                                  className={`rounded-full font-medium border text-[10px] px-2 py-0.5 ${
                                    record.status === "checked_out"
                                      ? "bg-emerald-50 text-emerald-600 border-emerald-100"
                                      : "bg-blue-50 text-blue-600 border-blue-100"
                                  }`}
                                >
                                  {record.status === "checked_out" ? "Checked Out" : "Checked In"}
                                </Badge>
                              </td>
                              <td className="py-3 px-3 text-zinc-500 font-normal">
                                {record.visitorPassNo}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
