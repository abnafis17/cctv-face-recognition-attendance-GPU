import { useState, useEffect, useCallback, useMemo } from "react";
import axiosInstance from "@/config/axiosInstance";
import toast from "react-hot-toast";

export interface VisitRecord {
  id: string; date: string; timeIn: string; timeOut?: string | null; purpose: string; status: string;
  visitorPassNo: string; hostName: string; hostDepartment: string; hostPicUrl?: string | null;
}

export interface VisitorReport {
  visitorName: string; contactNumber: string; companyAddress: string; visitorPhoto?: string | null;
  totalVisits: number; hostsMet: number; lastVisit: string; history: VisitRecord[];
}

export function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-"); if (parts.length !== 3) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return monthIdx >= 0 && monthIdx <= 11 ? `${parts[2].padStart(2, "0")} ${months[monthIdx]} ${parts[0]}` : dateStr;
}

export function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "--";
  const parts = timeStr.split(":"); if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10); const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const ampm = hours >= 12 ? "PM" : "AM"; const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

export function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function useVisitorWiseVisitState() {
  const [reportData, setReportData] = useState<VisitorReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());
  const [expandedVisitors, setExpandedVisitors] = useState<Set<string>>(new Set());

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const res = await axiosInstance.get("/visitors/reports/visitor-wise", { params });
      setReportData(res.data || []);
    } catch {
      toast.error("Failed to load visitor visit report");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, fromDate, toDate]);

  useEffect(() => { void fetchReport(); }, [fetchReport]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setFromDate(dhakaTodayYYYYMMDD());
    setToDate(dhakaTodayYYYYMMDD());
  }, []);

  const toggleExpand = useCallback((vKey: string) => {
    setExpandedVisitors((prev) => {
      const next = new Set(prev);
      if (next.has(vKey)) next.delete(vKey); else next.add(vKey);
      return next;
    });
  }, []);

  const totals = useMemo(() => {
    let visits = 0; let hosts = 0;
    reportData.forEach((v) => { visits += v.totalVisits; hosts += v.hostsMet; });
    return { totalVisitors: reportData.length, totalVisits: visits, totalHostsMet: hosts };
  }, [reportData]);

  return {
    reportData, loading, searchQuery, setSearchQuery, fromDate, setFromDate, toDate, setToDate,
    expandedVisitors, toggleExpand, handleResetFilters, totals, fetchReport,
  };
}
