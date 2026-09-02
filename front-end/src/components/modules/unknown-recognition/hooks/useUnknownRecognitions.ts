"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axiosInstance, { API } from "@/config/axiosInstance";

export type UnknownRecognitionRow = {
  id: string;
  name?: string;
  timestamp: string;
  cameraId?: string | null;
  cameraName?: string | null;
};

export type SortOrder = "asc" | "desc";

export type RangeValue = {
  from: string;
  to: string;
};

const UNKNOWN_HISTORY_FETCH_LIMIT = 500;
const UNKNOWN_HISTORY_PAGE_LIMIT = 100;

function dhakaTodayYYYYMMDD(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Dhaka" });
}

function toIsoFromParts(dateValue: string, timeValue: string, isEnd: boolean): string {
  const date = String(dateValue || "").trim();
  if (!date) return "";

  const time = String(timeValue || "").trim();
  const hhmmss = time
    ? `${time}${time.length === 5 ? ":00" : ""}`
    : isEnd
      ? "23:59:59"
      : "00:00:00";

  const local = new Date(`${date}T${hhmmss}`);
  if (Number.isNaN(local.getTime())) return "";
  return local.toISOString();
}

export function useUnknownRecognitions() {
  const [rows, setRows] = useState<UnknownRecognitionRow[]>([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false);
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [selectedDate, setSelectedDate] = useState<string>(() => dhakaTodayYYYYMMDD());
  const [fromTime, setFromTime] = useState("");
  const [toTime, setToTime] = useState("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [range, setRange] = useState<RangeValue>(() => {
    const today = dhakaTodayYYYYMMDD();
    return {
      from: toIsoFromParts(today, "", false),
      to: toIsoFromParts(today, "", true),
    };
  });

  const inFlightRef = useRef(false);
  const rangeRef = useRef(range);

  useEffect(() => {
    rangeRef.current = range;
  }, [range]);

  const fetchUnknownRecognitions = useCallback(
    async (overrideRange?: RangeValue) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      setLoading(true);

      const activeRange = overrideRange ?? rangeRef.current;

      try {
        const params: Record<string, string | number> = {
          limit: UNKNOWN_HISTORY_FETCH_LIMIT,
        };
        if (activeRange.from) params.from = activeRange.from;
        if (activeRange.to) params.to = activeRange.to;

        const response = await axiosInstance.get(`${API.UNKNOWN_RECOGNITIONS}`, {
          params,
        });

        if (response?.status === 200) {
          setRows((response?.data || []) as UnknownRecognitionRow[]);
          setErr("");
        }
      } catch (error) {
        const errorMessage =
          (error as any)?.response?.data?.error ||
          (error as any)?.response?.data?.message ||
          "Failed to load unknown recognition history";
        setErr(errorMessage);
      } finally {
        setLoading(false);
        inFlightRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    const first = window.setTimeout(() => {
      void fetchUnknownRecognitions();
    }, 0);

    const interval = window.setInterval(() => {
      void fetchUnknownRecognitions();
    }, 5000);

    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, [fetchUnknownRecognitions]);

  const buildDateRange = useCallback(
    (dateValue: string, startTime: string, endTime: string): RangeValue | null => {
      const date = String(dateValue || "").trim();
      if (!date) return null;

      const fromIso = toIsoFromParts(date, startTime, false);
      const toIso = toIsoFromParts(date, endTime, true);
      if (!fromIso || !toIso) return null;

      return { from: fromIso, to: toIso };
    },
    []
  );

  const applyFilters = useCallback(() => {
    const nextRange = buildDateRange(selectedDate, fromTime, toTime);
    if (!nextRange) {
      setErr("Select a valid date/time range");
      return;
    }

    if (Date.parse(nextRange.from) > Date.parse(nextRange.to)) {
      setErr("From time must be earlier than To time");
      return;
    }

    setErr("");
    setRange(nextRange);
    void fetchUnknownRecognitions(nextRange);
  }, [buildDateRange, fetchUnknownRecognitions, selectedDate, fromTime, toTime]);

  const clearFilters = useCallback(() => {
    setFromTime("");
    setToTime("");

    const activeDate = selectedDate || dhakaTodayYYYYMMDD();
    if (!selectedDate) setSelectedDate(activeDate);

    const nextRange = buildDateRange(activeDate, "", "");
    if (!nextRange) return;

    setErr("");
    setRange(nextRange);
    void fetchUnknownRecognitions(nextRange);
  }, [buildDateRange, fetchUnknownRecognitions, selectedDate]);

  const sortedRows = useMemo(() => {
    const next = [...rows];
    next.sort((a, b) => {
      const aTime = Date.parse(a.timestamp || "");
      const bTime = Date.parse(b.timestamp || "");

      const aValid = Number.isFinite(aTime);
      const bValid = Number.isFinite(bTime);

      if (!aValid && !bValid) return a.id.localeCompare(b.id);
      if (!aValid) return 1;
      if (!bValid) return -1;

      const diff = aTime - bTime;
      if (diff !== 0) return sortOrder === "asc" ? diff : -diff;
      return a.id.localeCompare(b.id);
    });
    return next;
  }, [rows, sortOrder]);

  const paginationResetKey = useMemo(() => `${range.from}|${range.to}`, [range.from, range.to]);

  const effectivePage = useMemo(() => {
    const totalPages = Math.max(1, Math.ceil(sortedRows.length / UNKNOWN_HISTORY_PAGE_LIMIT));
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, sortedRows.length]);

  const skip = useMemo(() => (effectivePage - 1) * UNKNOWN_HISTORY_PAGE_LIMIT, [effectivePage]);

  const paginatedRows = useMemo<UnknownRecognitionRow[]>(
    () => sortedRows.slice(skip, skip + UNKNOWN_HISTORY_PAGE_LIMIT),
    [sortedRows, skip]
  );

  const getCurrentPage = useCallback((page: number) => {
    const normalized = Math.max(1, Number(page) || 1);
    setCurrentPage(normalized);
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [paginationResetKey]);

  return {
    rows,
    err,
    loading,
    sortOrder,
    setSortOrder,
    selectedDate,
    setSelectedDate,
    fromTime,
    setFromTime,
    toTime,
    setToTime,
    currentPage,
    range,
    fetchUnknownRecognitions,
    applyFilters,
    clearFilters,
    sortedRows,
    paginatedRows,
    getCurrentPage,
    paginationResetKey,
    effectivePage,
    skip,
    PAGE_LIMIT: UNKNOWN_HISTORY_PAGE_LIMIT,
  };
}
