"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import axiosInstance, { API } from "@/config/axiosInstance";
import type { Camera } from "@/types";

import type {
  CameraBoundingBoxTrackingBox,
  CameraBoundingBoxTrackingRecord,
  CameraBoundingBoxTrackingState,
} from "./types";

const DHAKA_TIMEZONE = "Asia/Dhaka";
export const BOUNDING_BOX_TRACKING_PAGE_LIMIT = 10;

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
      };
    };
    message?: string;
  };

  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

function dhakaTodayYYYYMMDD() {
  return new Date().toLocaleDateString("en-CA", { timeZone: DHAKA_TIMEZONE });
}

type UseCameraBoundingBoxTrackingArgs = {
  camera: Camera | null;
  open: boolean;
};

export function useCameraBoundingBoxTracking({
  camera,
  open,
}: UseCameraBoundingBoxTrackingArgs) {
  const cameraId = String(camera?.id ?? "").trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [boxes, setBoxes] = useState<CameraBoundingBoxTrackingBox[]>([]);
  const [records, setRecords] = useState<CameraBoundingBoxTrackingRecord[]>([]);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [fromDate, setFromDate] = useState(() => dhakaTodayYYYYMMDD());
  const [toDate, setToDate] = useState(() => dhakaTodayYYYYMMDD());
  const [selectedBoxId, setSelectedBoxId] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(search.trim());
    }, 300);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, fromDate, toDate, selectedBoxId]);

  const fetchRecords = useCallback(async () => {
    if (!cameraId) return;

    try {
      setLoading(true);
      setError("");
      const response = await axiosInstance.get<CameraBoundingBoxTrackingState>(
        `${API.CAMERAS}/${cameraId}/bounding-box-tracking`,
        {
          params: {
            fromDate,
            toDate,
            q: debouncedSearch || undefined,
            boundingBoxId: selectedBoxId || undefined,
            limit: 1000,
          },
        },
      );

      setBoxes(Array.isArray(response.data?.boxes) ? response.data.boxes : []);
      setRecords(
        Array.isArray(response.data?.records) ? response.data.records : [],
      );
    } catch (fetchError: unknown) {
      const message = normalizeApiError(
        fetchError,
        "Failed to load bounding box tracking records",
      );
      setError(message);
      setRecords([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [cameraId, debouncedSearch, fromDate, selectedBoxId, toDate]);

  useEffect(() => {
    if (!open || !cameraId) return;
    void fetchRecords();
  }, [cameraId, fetchRecords, open]);

  useEffect(() => {
    if (!selectedBoxId) return;
    if (boxes.some((box) => box.id === selectedBoxId)) return;
    setSelectedBoxId("");
  }, [boxes, selectedBoxId]);

  const skip = useMemo(
    () => (page - 1) * BOUNDING_BOX_TRACKING_PAGE_LIMIT,
    [page],
  );

  const paginatedRecords = useMemo(
    () =>
      records.slice(skip, skip + BOUNDING_BOX_TRACKING_PAGE_LIMIT),
    [records, skip],
  );

  const paginationResetKey = useMemo(
    () =>
      `${fromDate}|${toDate}|${selectedBoxId}|${debouncedSearch}|${records.length}`,
    [debouncedSearch, fromDate, records.length, selectedBoxId, toDate],
  );

  const resetFilters = useCallback(() => {
    const today = dhakaTodayYYYYMMDD();
    setSearch("");
    setDebouncedSearch("");
    setFromDate(today);
    setToDate(today);
    setSelectedBoxId("");
    setPage(1);
  }, []);

  return {
    loading,
    error,
    boxes,
    records,
    paginatedRecords,
    search,
    fromDate,
    toDate,
    selectedBoxId,
    skip,
    paginationResetKey,
    setSearch,
    setFromDate,
    setToDate,
    setSelectedBoxId,
    setPage,
    fetchRecords,
    resetFilters,
    pageLimit: BOUNDING_BOX_TRACKING_PAGE_LIMIT,
  };
}
