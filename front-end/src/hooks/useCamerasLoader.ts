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

  // ---------- Shared loader (only for user-triggered refresh) ----------
  const load = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    try {
      setErr("");
      const response = await axiosInstance.get("/cameras"); // baseURL includes /api
      if (response?.status === 200) setCams((response?.data || []) as Camera[]);
    } catch (e: unknown) {
      const msg =
        (e as any)?.response?.data?.message ||
        (e instanceof Error ? e.message : "Failed to load cameras");
      setErr(msg);
    } finally {
      inFlightRef.current = false;
    }
  }, [setCams, setErr]);

  // ---------- Initial load ----------
  useEffect(() => {
    let cancelled = false;

    async function fetchCameras() {
      if (inFlightRef.current) return;
      inFlightRef.current = true;

      try {
        setErr("");
        const response = await axiosInstance.get("/cameras");
        if (!cancelled && response?.status === 200) {
          setCams((response?.data || []) as Camera[]);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          const msg =
            (e as any)?.response?.data?.message ||
            (e instanceof Error ? e.message : "Failed to load cameras");
          setErr(msg);
        }
      } finally {
        inFlightRef.current = false;
      }
    }

    const first = window.setTimeout(() => fetchCameras(), 0);

    return () => {
      cancelled = true;
      window.clearTimeout(first);
    };
  }, [setCams, setErr]);

  return { load, inFlightRef };
}
