// src/hooks/useErpEmployees.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { erpAxios } from "@/config/axiosInstance";
import { ERP_HOST } from "@/constant";
import { normalizeHierarchyValue } from "@/lib/employeeHierarchy";

export type ErpEmployee = {
  employeeId: string; // e.g. "2024052410"
  employeeName: string; // e.g. "John Doe"
  unit: string; // e.g. "PSL"
  department: string; // e.g. "Business Innovation"
  section: string; // e.g. "WEB-Team"
  line: string; // e.g. "Production Line A"
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

  const departmentName =
    item?.department ??
    item?.Department ??
    item?.departmentName ??
    item?.DepartmentName ??
    item?.deptName ??
    item?.DeptName ??
    item?.dept ??
    item?.Dept;

  const unitName =
    item?.unit ??
    item?.Unit ??
    item?.unitName ??
    item?.UnitName;

  const sectionName =
    item?.section ??
    item?.Section ??
    item?.sectionName ??
    item?.SectionName;

  const lineName =
    item?.line ??
    item?.Line ??
    item?.lineName ??
    item?.LineName;

  if (employeeId == null || employeeName == null) return null;

  const idStr = String(employeeId).trim();
  const nameStr = String(employeeName).trim();
  const unitStr = normalizeHierarchyValue(unitName);
  const departmentStr = normalizeHierarchyValue(departmentName);
  const sectionStr = normalizeHierarchyValue(sectionName);
  const lineStr = normalizeHierarchyValue(lineName);

  if (!idStr || !nameStr) return null;

  return {
    employeeId: idStr,
    employeeName: nameStr,
    unit: unitStr,
    department: departmentStr,
    section: sectionStr,
    line: lineStr,
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

    const userInfo = JSON.parse(localStorage.getItem("userInfo") || "{}");
    const erpBase = String(ERP_HOST || "").trim();
    if (!erpBase) {
      setEmployees([]);
      setLoading(false);
      setError("ERP URL not configured (set NEXT_PUBLIC_ERP_URL).");
      return;
    }

    // Cancel previous inflight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      const payload = {
        pageNumber: 0,
        pageSize: 0,
        search: q || "",
        organizationId: userInfo.oragnizationId || "",
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
