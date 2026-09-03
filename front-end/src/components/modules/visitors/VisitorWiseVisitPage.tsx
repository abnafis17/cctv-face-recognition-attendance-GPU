"use client";

import React from "react";
import { Users, Search, RotateCcw, Calendar, Filter, BarChart3, TrendingUp, UserCheck, ChevronDown, ChevronUp, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useVisitorWiseVisitState, formatDate, formatTime12h } from "./useVisitorWiseVisitState";

export default function VisitorWiseVisitPage() {
  const {
    reportData, loading, searchQuery, setSearchQuery, fromDate, setFromDate, toDate, setToDate,
    expandedVisitors, toggleExpand, handleResetFilters, totals,
  } = useVisitorWiseVisitState();

  return (
    <div className="w-full pb-10 space-y-6">
      <div className="flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <BarChart3 className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-semibold tracking-tight">Visitor-Wise Visit Summary</h1>
            <p className="text-xs text-zinc-300">View visitor entries grouped by unique visitor identity</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="rounded-full border-white/20 bg-white/10 text-white px-3 py-1 font-medium text-xs">
            Total Unique Visitors: {totals.totalVisitors}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-50 text-blue-600"><TrendingUp className="w-5 h-5" /></div>
          <div><p className="text-xs text-zinc-500 font-medium">Total Visits Logged</p><p className="text-lg font-bold text-zinc-900">{totals.totalVisits}</p></div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-50 text-emerald-600"><UserCheck className="w-5 h-5" /></div>
          <div><p className="text-xs text-zinc-500 font-medium">Unique Visitors</p><p className="text-lg font-bold text-zinc-900">{totals.totalVisitors}</p></div>
        </div>
        <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-50 text-purple-600"><Users className="w-5 h-5" /></div>
          <div><p className="text-xs text-zinc-500 font-medium">Total Hosts Met</p><p className="text-lg font-bold text-zinc-900">{totals.totalHostsMet}</p></div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-200 bg-white p-5 shadow-sm space-y-4">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wider text-[#0c1b33]">
          <Filter className="h-4 w-4" /> Filter Report Records
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-zinc-400" />
            <Input placeholder="Search Visitor Name, Phone..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9 text-xs h-9" />
          </div>
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

      <div className="space-y-4">
        {loading ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-white rounded-xl border border-zinc-200">Loading report data...</div>
        ) : reportData.length === 0 ? (
          <div className="p-8 text-center text-xs text-zinc-500 bg-white rounded-xl border border-zinc-200">No visit records found for selected period.</div>
        ) : (
          reportData.map((v) => {
            const vKey = `${v.visitorName}-${v.contactNumber}`;
            const isExpanded = expandedVisitors.has(vKey);
            return (
              <div key={vKey} className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden transition-all">
                <div onClick={() => toggleExpand(vKey)} className="p-4 flex items-center justify-between cursor-pointer hover:bg-zinc-50/80 transition-colors">
                  <div className="flex items-center gap-3">
                    {v.visitorPhoto ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={v.visitorPhoto} alt={v.visitorName} className="w-10 h-10 rounded-full object-cover border border-zinc-200" />
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-zinc-100 border border-zinc-200 flex items-center justify-center text-zinc-400"><User className="w-5 h-5" /></div>
                    )}
                    <div>
                      <h3 className="text-sm font-bold text-zinc-900">{v.visitorName} <span className="text-xs font-normal text-zinc-400">({v.contactNumber})</span></h3>
                      <p className="text-xs text-zinc-500">{v.companyAddress || "No Company Address"}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right hidden sm:block">
                      <span className="text-xs font-bold text-indigo-600 block">{v.totalVisits} Visit{v.totalVisits > 1 ? "s" : ""}</span>
                      <span className="text-[11px] text-zinc-400 block">{v.hostsMet} Host{v.hostsMet > 1 ? "s" : ""} Met</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-5 h-5 text-zinc-400" /> : <ChevronDown className="w-5 h-5 text-zinc-400" />}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 border-t border-zinc-100 bg-zinc-50/50 space-y-4">
                    <div className="bg-white p-3.5 rounded-lg border border-zinc-200/80 overflow-x-auto">
                      <table className="w-full text-[11px] text-left text-zinc-600">
                        <thead className="bg-zinc-50 text-zinc-700 font-semibold border-b border-zinc-200">
                          <tr><th className="p-2">Date</th><th className="p-2">Time In</th><th className="p-2">Time Out</th><th className="p-2">Host Name</th><th className="p-2">Department</th><th className="p-2">Purpose</th><th className="p-2">Pass #</th></tr>
                        </thead>
                        <tbody>
                          {v.history.map((h) => (
                            <tr key={h.id} className="border-b border-zinc-100 last:border-0">
                              <td className="p-2">{formatDate(h.date)}</td>
                              <td className="p-2">{formatTime12h(h.timeIn)}</td>
                              <td className="p-2">{formatTime12h(h.timeOut)}</td>
                              <td className="p-2 font-medium text-zinc-800">{h.hostName}</td>
                              <td className="p-2">{h.hostDepartment}</td>
                              <td className="p-2">{h.purpose}</td>
                              <td className="p-2 font-mono text-xs">{h.visitorPassNo}</td>
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
