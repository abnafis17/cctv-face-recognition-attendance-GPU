// src/hooks/useErpDepartments.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";
import axiosInstance, { erpAxios } from "@/config/axiosInstance";

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

export type ErpDepartment = {
  id: string;
  name: string;
};

export function useErpDepartments() {
  const [departments, setDepartments] = useState<ErpDepartment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError("");

    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    try {
      let resolvedUrl: string | null = null;
      let resolvedEmployeeUrl: string | null = null;

      try {
        const erpSettingsRes = await axiosInstance.get<any[]>("/settings/erp", {
          params: { all: true },
          signal: abortRef.current.signal,
        });
        const rows = erpSettingsRes.data || [];

        // Try to match "department" urlType
        const deptMatch = rows.find((r) => {
          const type = String(r.urlType || "").trim().toLowerCase();
          return (
            type === "department" ||
            type === "departments" ||
            type === "department_list" ||
            type === "departmentlist" ||
            type === "department_info" ||
            type === "departmentinfo"
          );
        });

        if (deptMatch) {
          resolvedUrl = resolveConfiguredErpUrl(deptMatch);
        }

        // Also fetch employee match for fallback
        const empMatch = rows.find((r) => {
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
        if (empMatch) {
          resolvedEmployeeUrl = resolveConfiguredErpUrl(empMatch);
        }
      } catch (err) {
        console.warn("Failed to fetch dynamic ERP settings for departments:", err);
      }

      // Fallback: if department URL is not configured, derive it from the employee URL
      if (!resolvedUrl && resolvedEmployeeUrl) {
        resolvedUrl = resolvedEmployeeUrl.replace(/\/GetAllEMployeelists$/i, "/GetAllDepartment");
      }

      if (!resolvedUrl) {
        setDepartments([]);
        setLoading(false);
        setError("ERP department URL not configured. Please configure it in Settings.");
        return;
      }

      const res = await erpAxios.post(
        resolvedUrl,
        {},
        {
          headers: {
            Accept: "*/*",
            "Content-Type": "application/json",
            "x-api-version": "2.0",
          },
          signal: abortRef.current.signal,
        }
      );

      const rawList =
        res?.data?.results ??
        res?.data?.data ??
        res?.data?.items ??
        res?.data?.result ??
        res?.data ??
        [];

      const list = Array.isArray(rawList) ? rawList : [];

      const mapped = list
        .map((item: any) => {
          const id = item?.id ?? item?.Id ?? item?.deptId ?? item?.DeptId ?? item?.mainDeptId ?? item?.MainDeptId;
          const name = item?.name ?? item?.Name ?? item?.departmentName ?? item?.DepartmentName ?? item?.deptName ?? item?.DeptName;
          if (!id || !name) return null;
          return {
            id: String(id).trim(),
            name: String(name).trim(),
          };
        })
        .filter(Boolean) as ErpDepartment[];

      setDepartments(mapped);
    } catch (e: any) {
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
          "Failed to load departments"
      );
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchDepartments]);

  return {
    departments,
    loading,
    error,
    refetch: fetchDepartments,
  };
}
