"use client";

import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import axiosInstance, { erpAxios } from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
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

export function useErpDepartments() {
  const [departments, setDepartments] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const fetchDepartments = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      let resolvedUrl: string | null = null;
      try {
        const erpSettingsRes = await axiosInstance.get<any[]>(API.SETTINGS_ERP, {
          params: { all: true },
        });
        const rows = erpSettingsRes.data || [];
        const match = rows.find((r) => {
          const type = String(r.urlType || "").trim().toLowerCase();
          return (
            type === "department" ||
            type === "departments" ||
            type === "departmentlist" ||
            type === "department_list" ||
            type === "dept"
          );
        });
        if (match) {
          resolvedUrl = resolveConfiguredErpUrl(match);
        }
      } catch (err) {
        console.warn("Failed to fetch company-wise ERP department settings:", err);
      }

      if (!resolvedUrl) {
        resolvedUrl = "http://172.20.60.101:7001/api/v2/Employee/GetAllDepartment";
      }

      const payload = {
        pageNumber: 1,
        pageSize: 500,
        search: "",
      };

      const res = await erpAxios.post(resolvedUrl, payload, {
        headers: {
          Accept: "*/*",
          "Content-Type": "application/json",
          "x-api-version": "2.0",
        },
      });

      const rawList =
        res?.data?.data ??
        res?.data?.results ??
        res?.data?.items ??
        res?.data?.result ??
        res?.data ??
        [];

      const list = Array.isArray(rawList) ? rawList : [];

      const depts = list
        .map((item: any) => {
          if (typeof item === "string") return item.trim();
          const name =
            item?.deptName ??
            item?.DeptName ??
            item?.departmentName ??
            item?.DepartmentName ??
            item?.department ??
            item?.Department ??
            item?.dept ??
            item?.name;
          return normalizeHierarchyValue(name);
        })
        .filter(Boolean) as string[];

      const uniqueDepts = Array.from(new Set(depts)).sort((a, b) =>
        a.localeCompare(b, undefined, { sensitivity: "base" }),
      );

      setDepartments(uniqueDepts);
    } catch (e: any) {
      if (
        e?.name === "CanceledError" ||
        e?.name === "AbortError" ||
        e?.code === "ERR_CANCELED" ||
        axios.isCancel?.(e)
      ) {
        return;
      }
      console.warn("Failed to fetch ERP departments:", e);
      setError(
        e?.response?.data?.message ||
          e?.message ||
          "Failed to load ERP departments",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  return {
    departments,
    loading,
    error,
    refetch: fetchDepartments,
  };
}
