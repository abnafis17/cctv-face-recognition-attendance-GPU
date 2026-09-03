import { useState, useEffect, useCallback, useMemo } from "react";
import axiosInstance from "@/config/axiosInstance";
import toast from "react-hot-toast";
import type { VisitorRecord } from "./visitorColumns";

export const visitorTypes = ["All Types", "Guest", "Contractor", "Official", "Interviewee", "Other"];

export function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

export function useVisitorsState() {
  const [visitorList, setVisitorList] = useState<VisitorRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [checkingOutIds, setCheckingOutIds] = useState<Set<string>>(new Set());
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      const userInfo = raw ? JSON.parse(raw) : null;
      if (userInfo?.permissions) setPermissions(userInfo.permissions);
    } catch { /* ignore parsing errors */ }
  }, []);

  const [searchQuery, setSearchQuery] = useState("");
  const [visitorTypeFilter, setVisitorTypeFilter] = useState("All Types");
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());

  const [currentPage, setCurrentPage] = useState(1);
  const pageLimit = 15;

  const fetchVisitorRecords = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const params: Record<string, string | number> = { limit: 200 };
      if (searchQuery.trim()) params.q = searchQuery.trim();
      if (visitorTypeFilter && visitorTypeFilter !== "All Types") params.visitorType = visitorTypeFilter;
      if (fromDate) params.fromDate = fromDate;
      if (toDate) params.toDate = toDate;

      const res = await axiosInstance.get("/visitors", { params });
      setVisitorList(res.data || []);
      setCurrentPage(1);
    } catch (err) {
      toast.error("Failed to load visitor records");
    } finally {
      setLoading(false);
    }
  }, [searchQuery, visitorTypeFilter, fromDate, toDate]);

  useEffect(() => { void fetchVisitorRecords(); }, [fetchVisitorRecords]);

  const handleResetFilters = useCallback(() => {
    setSearchQuery("");
    setVisitorTypeFilter("All Types");
    setFromDate(dhakaTodayYYYYMMDD());
    setToDate(dhakaTodayYYYYMMDD());
  }, []);

  const paginatedRows = useMemo(() => {
    const startIdx = (currentPage - 1) * pageLimit;
    return visitorList.slice(startIdx, startIdx + pageLimit);
  }, [visitorList, currentPage, pageLimit]);

  const paginationResetKey = useMemo(() => {
    return `${searchQuery}-${visitorTypeFilter}-${fromDate}-${toDate}-${visitorList.length}`;
  }, [searchQuery, visitorTypeFilter, fromDate, toDate, visitorList.length]);

  const handleCheckout = useCallback(async (id: string) => {
    setCheckingOutIds((prev) => new Set(prev).add(id));
    const toastId = toast.loading("Processing checkout...");
    try {
      const res = await axiosInstance.post(`/visitors/${id}/checkout`);
      if (res.data?.ok) {
        toast.success("Visitor checked out successfully!", { id: toastId });
        await fetchVisitorRecords(true);
      } else {
        toast.error(res.data?.error || "Checkout failed", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Checkout request failed", { id: toastId });
    } finally {
      setCheckingOutIds((prev) => {
        const next = new Set(prev); next.delete(id); return next;
      });
    }
  }, [fetchVisitorRecords]);

  const handleDeleteVisitor = useCallback(async (id: string) => {
    if (!window.confirm("Are you sure you want to delete this visitor? Their associated face template will also be permanently deleted.")) {
      return;
    }
    setDeletingIds((prev) => new Set(prev).add(id));
    const toastId = toast.loading("Deleting visitor & face template...");
    try {
      const res = await axiosInstance.delete(`/visitors/${id}`);
      if (res.data?.ok) {
        toast.success("Visitor & corresponding face template deleted successfully!", { id: toastId });
        await fetchVisitorRecords(true);
      } else {
        toast.error(res.data?.error || "Delete failed", { id: toastId });
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error || "Delete request failed", { id: toastId });
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev); next.delete(id); return next;
      });
    }
  }, [fetchVisitorRecords]);

  return {
    visitorList, loading, checkingOutIds, deletingIds, permissions, searchQuery, setSearchQuery,
    visitorTypeFilter, setVisitorTypeFilter, fromDate, setFromDate, toDate, setToDate, currentPage,
    setCurrentPage, pageLimit, fetchVisitorRecords, handleResetFilters, paginatedRows, paginationResetKey,
    handleCheckout, handleDeleteVisitor,
  };
}
