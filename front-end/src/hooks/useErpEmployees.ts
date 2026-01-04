// src/hooks/useErpEmployees.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { erpAxios } from "@/config/axiosInstance";

export type ErpEmployee = {
  employeeId: string; // e.g. "2024052410"
  employeeName: string; // e.g. "John Doe"
};

type ErpEmployeeApiItem = any;

function mapEmployee(item: ErpEmployeeApiItem): ErpEmployee | null {
  const employeeId =
    item?.employeeId ??
    item?.EmployeeId ??
    item?.empId ??
    item?.EmpId ??
    item?.employeeCode ??
    item?.EmployeeCode ??
    item?.code ??
    item?.Code ??
    item?.id ??
    item?.Id;

  const employeeName =
    item?.employeeName ??
    item?.EmployeeName ??
    item?.empName ??
    item?.EmpName ??
    item?.name ??
    item?.Name ??
    item?.fullName ??
    item?.FullName;

  if (employeeId == null || employeeName == null) return null;

  const idStr = String(employeeId).trim();
  const nameStr = String(employeeName).trim();

  if (!idStr || !nameStr) return null;

  return {
    employeeId: idStr,
    employeeName: nameStr,
  };
}

export function useErpEmployees(options?: {
  debounceMs?: number;
  initialSearch?: string;
  autoFetch?: boolean; // fetch once on mount even if search is empty
}) {
  const debounceMs = options?.debounceMs ?? 350;
  const autoFetch = options?.autoFetch ?? true;

  const [search, setSearch] = useState(options?.initialSearch ?? "");
  const [employees, setEmployees] = useState<ErpEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<any>(null);
  const mountedRef = useRef(false);

  const fetchEmployees = useCallback(async (q: string) => {
    setLoading(true);
    setError("");

    // Cancel previous inflight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const payload = {
        pageNumber: 0,
        pageSize: 0,
        search: q || "",
      };

      const res = await erpAxios.post(
        "/api/v2/Employee/GetAllEMployeelists",
        payload,
        {
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json",
            "x-api-version": "2.0",
          },
          signal: abortRef.current.signal,
        }
      );

      // ERP might return: { results: [...] } or { data: [...] } or { items: [...] } or just [...]
      const rawList =
        res?.data?.results ??
        res?.data?.data ??
        res?.data?.items ??
        res?.data?.result ??
        res?.data ??
        [];

      const list = Array.isArray(rawList) ? rawList : [];

      const mapped = list.map(mapEmployee).filter(Boolean) as ErpEmployee[];

      setEmployees(mapped);
    } catch (e: any) {
      // ✅ Safe cancel detection across axios versions
      if (
        e?.name === "CanceledError" ||
        e?.name === "AbortError" ||
        e?.code === "ERR_CANCELED" ||
        axios.isCancel?.(e)
      ) {
        return;
      }

      setError(
        e?.response?.data?.message ||
          e?.response?.data?.error ||
          e?.message ||
          "Failed to load employees"
      );
      setEmployees([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced search effect
  useEffect(() => {
    // On first mount, optionally fetch once immediately
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (autoFetch) {
        fetchEmployees((search || "").trim());
      }
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchEmployees((search || "").trim());
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, debounceMs, fetchEmployees, autoFetch]);

  // Cleanup abort on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, ErpEmployee>();
    employees.forEach((e) => m.set(e.employeeId, e));
    return m;
  }, [employees]);

  const refetch = useCallback(() => {
    fetchEmployees((search || "").trim());
  }, [fetchEmployees, search]);

  return {
    search,
    setSearch,
    employees,
    loading,
    error,
    refetch,
    byId,
  };
}
