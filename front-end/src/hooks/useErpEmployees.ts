// src/hooks/useErpEmployees.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import axiosInstance, { erpAxios } from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { ERP_HOST } from "@/constant";
import { normalizeHierarchyValue } from "@/lib/employeeHierarchy";

function isHttpUrl(value: unknown): boolean {
  const text = String(value ?? "").trim().toLowerCase();
  return text.startsWith("http://") || text.startsWith("https://");
}

function normalizeBaseUrl(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text || !isHttpUrl(text)) return null;
  return text.replace(/\/+$/, "");
}

function normalizePath(value: unknown): string | null {
  const text = String(value ?? "").trim();
  if (!text) return null;
  if (isHttpUrl(text)) return text;
  const collapsed = text.replace(/\/+/g, "/");
  return collapsed.startsWith("/") ? collapsed : `/${collapsed}`;
}

function joinUrlPath(...parts: Array<string | null | undefined>): string {
  const normalized = parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .map((part) => part.replace(/^\/+|\/+$/g, ""));
  if (!normalized.length) return "/";
  return `/${normalized.join("/")}`;
}

function resolveConfiguredErpUrl(input: {
  erpBaseUrl?: string | null;
  erpPrefix?: string | null;
  erpAttendanceEndpoint?: string | null;
}): string | null {
  const baseUrl = normalizeBaseUrl(input.erpBaseUrl);
  const prefix = normalizePath(input.erpPrefix);
  const endpoint = normalizePath(input.erpAttendanceEndpoint);

  if (endpoint && isHttpUrl(endpoint)) {
    return endpoint;
  }
  if (!baseUrl || !endpoint) {
    return null;
  }
  return new URL(joinUrlPath(prefix, endpoint), `${baseUrl}/`).toString();
}

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
  const lastQueryRef = useRef<string | null>(null);

  const readOrganizationId = useCallback((): string => {
    if (typeof window === "undefined") return "";

    try {
      const raw = localStorage.getItem("userInfo");
      if (!raw) return "";
      const userInfo = JSON.parse(raw);
      return String(
        userInfo?.organizationId ??
          userInfo?.oragnizationId ??
          userInfo?.company?.organization_id ??
          "",
      ).trim();
    } catch {
      return "";
    }
  }, []);

  const fetchEmployees = useCallback(async (q: string) => {
    setLoading(true);
    setError("");

    // Cancel previous inflight request
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      // 1) Attempt to load company-wise dynamic ERP settings
      let resolvedUrl: string | null = null;
      try {
        const erpSettingsRes = await axiosInstance.get<any[]>(API.SETTINGS_ERP, {
          params: { all: true },
          signal: abortRef.current.signal,
        });
        const rows = erpSettingsRes.data || [];
        // Match urlType variations (case-insensitive)
        const match = rows.find((r) => {
          const type = String(r.urlType || "").trim().toLowerCase();
          return (
            type === "employeelist" ||
            type === "employees" ||
            type === "employee" ||
            type === "employee_info" ||
            type === "employeeinfo" ||
            type === "employee_list"
          );
        });
        if (match) {
          resolvedUrl = resolveConfiguredErpUrl(match);
        }
      } catch (err) {
        console.warn("Failed to fetch company-wise ERP settings:", err);
      }

      // 2) If no company-wise settings found, fallback to standard ERP API endpoint
      if (!resolvedUrl) {
        resolvedUrl = "http://172.20.60.101:7001/api/v2/Employee/GetAllEMployeelists";
      }

      const payload = {
        pageNumber: 1,
        pageSize: 100,
        search: q || "",
      };

      const res = await erpAxios.post(
        resolvedUrl,
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
  }, [readOrganizationId]);

  // Debounced search effect
  useEffect(() => {
    const trimmed = (search || "").trim();

    // On first mount, fetch once immediately
    if (!mountedRef.current) {
      mountedRef.current = true;
      if (autoFetch) {
        lastQueryRef.current = trimmed;
        fetchEmployees(trimmed);
      }
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      if (trimmed !== lastQueryRef.current) {
        lastQueryRef.current = trimmed;
        fetchEmployees(trimmed);
      }
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search, debounceMs, fetchEmployees, autoFetch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const byId = useMemo(() => {
    const m = new Map<string, ErpEmployee>();
    employees.forEach((e) => m.set(e.employeeId, e));
    return m;
  }, [employees]);

  const refetch = useCallback(() => {
    lastQueryRef.current = null;
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
