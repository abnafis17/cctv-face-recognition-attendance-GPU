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
  FileText,
  User,
  Clock,
  Shield,
  Briefcase
} from "lucide-react";
import axiosInstance from "@/config/axiosInstance";
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
}

interface VisitorSummary {
  visitorName: string;
  contactNumber: string;
  companyAddress: string;
  visitorPhoto?: string | null;
  visitCount: number;
  lastVisit: string;
  purposes: string[];
  history: VisitRecord[];
}

interface EmployeeReport {
  employeeId: string;
  employeeName: string;
  department: string;
  totalVisits: number;
  uniqueVisitors: number;
  lastVisit: string;
  visitors: VisitorSummary[];
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

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export default function EmployeeWiseVisitPage() {
  const [reportData, setReportData] = useState<EmployeeReport[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters State
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());
  const [searchEmployee, setSearchEmployee] = useState("");
  const [activeSearch, setActiveSearch] = useState("");

  // Collapsible States
  const [expandedEmployees, setExpandedEmployees] = useState<Set<string>>(new Set());
  const [expandedVisitors, setExpandedVisitors] = useState<Set<string>>(new Set());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: any = {};
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;
      if (activeSearch.trim()) params.q = activeSearch.trim();

      const response = await axiosInstance.get("/visitors/reports/employee-wise", {
        params
      });
      setReportData(response.data || []);
      // Reset expanded sets on refetch
      setExpandedEmployees(new Set());
      setExpandedVisitors(new Set());
    } catch (error: any) {
      toast.error("Failed to load employee wise report");
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, activeSearch]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const handleApplyFilters = () => {
    setActiveSearch(searchEmployee);
  };

  const handleResetFilters = () => {
    setFromDate(dhakaTodayYYYYMMDD());
    setToDate(dhakaTodayYYYYMMDD());
    setSearchEmployee("");
    setActiveSearch("");
  };

  const toggleEmployee = (empId: string) => {
    setExpandedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(empId)) {
        next.delete(empId);
      } else {
        next.add(empId);
      }
      return next;
    });
  };

  const toggleVisitor = (empId: string, contactNumber: string) => {
    const key = `${empId}-${contactNumber}`;
    setExpandedVisitors((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  // Stats calculation
  const stats = useMemo(() => {
    let totalVisits = 0;
    const uniqueVisitorSet = new Set<string>();
    const activeEmployeeSet = new Set<string>();
    let topEmployeeName = "N/A";
    let topEmployeeVisits = 0;

    for (const item of reportData) {
      totalVisits += item.totalVisits;
      activeEmployeeSet.add(item.employeeId);
      for (const v of item.visitors) {
        uniqueVisitorSet.add(v.contactNumber);
      }
      if (item.totalVisits > topEmployeeVisits) {
        topEmployeeVisits = item.totalVisits;
        topEmployeeName = item.employeeName;
      }
    }

    return {
      totalVisits,
      uniqueVisitors: uniqueVisitorSet.size,
      activeEmployees: activeEmployeeSet.size,
      topEmployee: topEmployeeName,
      topEmployeeVisits
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
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold tracking-tight">Employee Wise Visit Report</h1>
            <p className="text-xs text-zinc-300">Visitor footfall analysis by employee / host</p>
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

          <div className="flex items-center gap-2 min-w-[280px] relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <Input
              placeholder="Search Employee..."
              value={searchEmployee}
              onChange={(e) => setSearchEmployee(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleApplyFilters();
              }}
              className="h-10 pl-10 rounded-xl border-zinc-200 w-full"
            />
          </div>
        </div>
      </div>

      {/* Stats Overview */}
      <div className="space-y-3">
        <div className="flex items-center justify-end text-[11px] font-normal text-zinc-400 px-1">
          <span>
            {stats.totalVisits} records | {dateRangeStr}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
              <UserCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="text-2xl font-light text-zinc-800">{stats.activeEmployees}</div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">Active Employees</div>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
              <User className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-zinc-800 truncate max-w-[200px]" title={stats.topEmployee}>
                {stats.topEmployee}
              </div>
              <div className="text-[10px] font-medium text-zinc-400 uppercase tracking-wider">
                Top Employee ({stats.topEmployeeVisits} visits)
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accordion Section Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-2 px-1">
        <div className="text-[11px] font-medium uppercase tracking-wider text-zinc-500">
          Employee Summary — {reportData.length} Employees
        </div>
        <div className="text-[11px] font-normal text-zinc-400">
          Click an employee to expand visitor details
        </div>
      </div>

      {/* Accordion List */}
      <div className="space-y-4">
        {loading ? (
          <div className="flex flex-col gap-3 py-10 items-center justify-center text-zinc-400">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
            <span className="text-sm font-medium">Generating employee wise report...</span>
          </div>
        ) : reportData.length === 0 ? (
          <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50 p-10 text-center text-zinc-500">
            No report data found matching the selected filters.
          </div>
        ) : (
          reportData.map((emp, index) => {
            const isEmpExpanded = expandedEmployees.has(emp.employeeId);
            return (
              <div
                key={emp.employeeId}
                className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-all duration-200"
              >
                {/* Employee Row Card Header */}
                <div
                  onClick={() => toggleEmployee(emp.employeeId)}
                  className={`flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 cursor-pointer select-none transition-colors ${
                    isEmpExpanded
                      ? "bg-[#0c1b33] text-white hover:bg-[#0c1b33]/95"
                      : "bg-white text-zinc-800 hover:bg-zinc-50/50"
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Index Avatar */}
                    <div
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium ${
                        isEmpExpanded
                          ? "bg-white/10 text-white ring-1 ring-white/20"
                          : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                      }`}
                    >
                      {index + 1}
                    </div>
                    {/* User icon avatar from mockup */}
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                        isEmpExpanded
                          ? "bg-white/10 text-white"
                          : "bg-blue-50 text-blue-600 border border-blue-100/50"
                      }`}
                    >
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className={`font-semibold text-[15px] ${isEmpExpanded ? "text-white" : "text-zinc-800"}`}>
                        {emp.employeeName}
                      </h3>
                      <p className={`text-xs font-normal ${isEmpExpanded ? "text-zinc-300" : "text-zinc-400"}`}>
                        {emp.department}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 mt-3 sm:mt-0 flex-wrap sm:flex-nowrap">
                    <div className="text-left sm:text-right">
                      <div className="text-lg font-light leading-none">{emp.totalVisits}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isEmpExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Total Visits
                      </div>
                    </div>

                    <div className="text-left sm:text-right">
                      <div className="text-lg font-light leading-none">{emp.uniqueVisitors}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isEmpExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Unique
                      </div>
                    </div>

                    <div className="text-left sm:text-right min-w-[120px]">
                      <div className="text-[13px] font-medium leading-none">{formatDate(emp.lastVisit)}</div>
                      <div className={`text-[9px] font-medium uppercase tracking-wider mt-1 ${isEmpExpanded ? "text-zinc-400/80" : "text-zinc-400"}`}>
                        Last Visit
                      </div>
                    </div>

                    <div className="shrink-0">
                      {isEmpExpanded ? (
                        <ChevronUp className="h-5 w-5 opacity-80" />
                      ) : (
                        <ChevronDown className="h-5 w-5 opacity-60" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Expanded Visitor List */}
                {isEmpExpanded && (
                  <div className="border-t border-zinc-100 bg-zinc-50/10 p-4 overflow-x-auto">
                    <table className="w-full border-collapse text-left text-sm text-zinc-600 min-w-[800px]">
                      <thead>
                        <tr className="border-b border-zinc-200 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
                          <th className="py-2.5 px-3 w-[50px] text-zinc-400">#</th>
                          <th className="py-2.5 px-3 text-zinc-400">Visitor Name</th>
                          <th className="py-2.5 px-3 text-zinc-400">Company / Address</th>
                          <th className="py-2.5 px-3 text-center text-zinc-400">Visit Count</th>
                          <th className="py-2.5 px-3 text-center text-zinc-400">Last Visit</th>
                          <th className="py-2.5 px-3 text-zinc-400">Purpose(s)</th>
                          <th className="py-2.5 px-3 text-center w-[120px] text-zinc-400"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {emp.visitors.map((visitor, vIndex) => {
                          const isVExpanded = expandedVisitors.has(`${emp.employeeId}-${visitor.contactNumber}`);
                          return (
                            <React.Fragment key={visitor.contactNumber}>
                              {/* Visitor Row */}
                              <tr className="border-b border-zinc-100 hover:bg-zinc-50/30 transition-colors">
                                <td className="py-3 px-3 text-zinc-400 font-normal">
                                  {vIndex + 1}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex items-center gap-3">
                                    {visitor.visitorPhoto ? (
                                      <img
                                        src={visitor.visitorPhoto}
                                        alt={visitor.visitorName}
                                        className="h-8 w-8 rounded-full border border-zinc-200 object-cover shrink-0"
                                      />
                                    ) : (
                                      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 border border-zinc-200 text-zinc-400">
                                        <User className="h-4.5 w-4.5" />
                                      </div>
                                    )}
                                    <div>
                                      <div className="font-medium text-[14px] text-zinc-800 leading-tight">
                                        {visitor.visitorName}
                                      </div>
                                      <div className="text-[11px] text-zinc-400 font-normal mt-0.5">
                                        {visitor.contactNumber}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-zinc-500 font-normal text-[13px] max-w-[220px] truncate" title={visitor.companyAddress}>
                                  {visitor.companyAddress}
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <Badge className="bg-zinc-100 text-zinc-700 hover:bg-zinc-100 rounded-full font-medium px-2.5 py-0.5 text-[11px] border border-zinc-200">
                                    {visitor.visitCount} {visitor.visitCount === 1 ? "visit" : "visits"}
                                  </Badge>
                                </td>
                                <td className="py-3 px-3 text-center text-zinc-500 font-normal text-[13px]">
                                  {formatDate(visitor.lastVisit)}
                                </td>
                                <td className="py-3 px-3">
                                  <div className="flex flex-wrap gap-1">
                                    {visitor.purposes.map((p) => (
                                      <Badge
                                        key={p}
                                        variant="outline"
                                        className="rounded-full bg-blue-50 text-blue-700 border-blue-100 font-normal px-2.5 py-0.5 text-[11px]"
                                      >
                                        {p}
                                      </Badge>
                                    ))}
                                  </div>
                                </td>
                                <td className="py-3 px-3 text-center">
                                  <button
                                    onClick={() => toggleVisitor(emp.employeeId, visitor.contactNumber)}
                                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-normal cursor-pointer shadow-sm transition-all ${
                                      isVExpanded
                                        ? "bg-zinc-100 border-zinc-300 text-zinc-700 hover:bg-zinc-200"
                                        : "bg-white border-zinc-200 text-zinc-600 hover:bg-zinc-50"
                                    }`}
                                  >
                                    {isVExpanded ? (
                                      <>
                                        <ChevronUp className="h-3.5 w-3.5" />
                                        Hide
                                      </>
                                    ) : (
                                      <>
                                        <ChevronDown className="h-3.5 w-3.5" />
                                        Details
                                      </>
                                    )}
                                  </button>
                                </td>
                              </tr>

                              {/* Nested History Table */}
                              {isVExpanded && (
                                <tr>
                                  <td colSpan={7} className="p-3 bg-zinc-100/50">
                                    <div className="rounded-lg border border-zinc-200 bg-white p-4 shadow-inner space-y-3">
                                      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400 border-b border-zinc-100 pb-1.5">
                                        <Clock className="h-3.5 w-3.5" />
                                        Visit History — {visitor.visitCount} Visits
                                        <span className="ml-auto normal-case font-normal text-zinc-400">
                                          Last: {formatDate(visitor.lastVisit)}
                                        </span>
                                      </div>
                                      <table className="w-full border-collapse text-left text-xs text-zinc-600">
                                        <thead>
                                          <tr className="border-b border-zinc-200 text-zinc-400 font-medium uppercase tracking-wider">
                                            <th className="py-2 px-2 w-[40px]">#</th>
                                            <th className="py-2 px-2">Date</th>
                                            <th className="py-2 px-2">Time In</th>
                                            <th className="py-2 px-2">Time Out</th>
                                            <th className="py-2 px-2">Purpose</th>
                                            <th className="py-2 px-2">Status</th>
                                            <th className="py-2 px-2">Pass No.</th>
                                          </tr>
                                        </thead>
                                        <tbody>
                                          {visitor.history.map((record, rIndex) => (
                                            <tr key={record.id} className="border-b border-zinc-100 hover:bg-zinc-50/50">
                                              <td className="py-2 px-2 text-zinc-400 font-normal">
                                                {rIndex + 1}
                                              </td>
                                              <td className="py-2 px-2 text-zinc-600 font-normal">
                                                {formatDate(record.date)}
                                              </td>
                                              <td className="py-2 px-2 text-zinc-500 font-normal">
                                                {formatTime12h(record.timeIn)}
                                              </td>
                                              <td className="py-2 px-2 text-zinc-500 font-normal">
                                                {formatTime12h(record.timeOut)}
                                              </td>
                                              <td className="py-2 px-2 text-zinc-700 font-normal">
                                                <Badge
                                                  variant="outline"
                                                  className="rounded-full bg-slate-50 border-zinc-200 font-normal text-zinc-600 text-[10px]"
                                                >
                                                  {record.purpose}
                                                </Badge>
                                              </td>
                                              <td className="py-2 px-2">
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
                                              <td className="py-2 px-2 text-zinc-500 font-normal">
                                                {record.visitorPassNo}
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
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
