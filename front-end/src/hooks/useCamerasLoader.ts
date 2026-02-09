"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Camera } from "@/types";
import axiosInstance from "@/config/axiosInstance";

type UseCamerasLoaderArgs = {
  setCams: Dispatch<SetStateAction<Camera[]>>;
  setErr: Dispatch<SetStateAction<string>>;
};

export function useCamerasLoader({ setCams, setErr }: UseCamerasLoaderArgs) {
  // prevent overlapping loads (same as page)
  const inFlightRef = useRef(false);
  const mountedRef = useRef(true);

  const parseApiError = useCallback((e: unknown, fallback: string) => {
    return (
      (e as any)?.response?.data?.error ||
      (e as any)?.response?.data?.message ||
      (e instanceof Error ? e.message : fallback)
    );
  }, []);

  // ---------- Shared loader (only for user-triggered refresh) ----------
  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      setErr("");
      const response = await axiosInstance.get("/cameras"); // baseURL includes /api
      if (mountedRef.current && response?.status === 200) {
        setCams((response?.data || []) as Camera[]);
      }
    } catch (e: unknown) {
      if (mountedRef.current) {
        setErr(parseApiError(e, "Failed to load cameras"));
      }
    } finally {
      inFlightRef.current = false;
    }
  }, [parseApiError, setCams, setErr]);

  // ---------- Initial load ----------
  useEffect(() => {
    mountedRef.current = true;
    void load();

    return () => {
      mountedRef.current = false;
    };
  }, [load]);

  return { load, inFlightRef };
}
