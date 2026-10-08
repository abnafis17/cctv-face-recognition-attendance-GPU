// src/hooks/useHrmEmployees.ts
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { NEW_HRM_URL, NEW_HRM_MEDIA_URL, NEW_HRM_ACCESS_TOKEN } from "@/constant";
import { HRM_API } from "@/constant/API_PATH";
import type {
  HrmCompany,
  HrmArea,
  HrmDepartment,
  HrmSection,
  HrmUnit,
  HrmLine,
  HrmEmployee,
  HrmFilters,
} from "@/types/new-hrm-module";

export type { HrmFilters };

export function getHrmMediaUrl(rawPath?: string | null): string {
  if (!rawPath) return "";
  const trimmed = String(rawPath).trim();
  if (!trimmed) return "";
  if (
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return trimmed;
  }
  
  let hrmOrigin = NEW_HRM_MEDIA_URL || "";
  try {
    if (!hrmOrigin && NEW_HRM_URL) {
      const urlObj = new URL(NEW_HRM_URL);
      hrmOrigin = urlObj.origin;
    }
  } catch {
    hrmOrigin = (NEW_HRM_URL || "").replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "");
  }
  
  const cleanPath = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return `${hrmOrigin}${cleanPath}`;
}

function getAuthToken(): string {
  if (typeof window !== "undefined") {
    return (
      localStorage.getItem("newHrmAccessToken") ||
      localStorage.getItem("hrmAccessToken") ||
      NEW_HRM_ACCESS_TOKEN
    );
  }
  return NEW_HRM_ACCESS_TOKEN;
}

export function useHrmEmployees(options?: {
  debounceMs?: number;
  initialSearch?: string;
  initialCompanyId?: string;
  initialAreaId?: string;
}) {
  const debounceMs = options?.debounceMs ?? 350;

  // Hierarchy filter states
  const [companyId, setCompanyId] = useState<string>(options?.initialCompanyId ?? "");
  const [areaId, setAreaId] = useState<string>(options?.initialAreaId ?? "");
  const [departmentId, setDepartmentId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [unitId, setUnitId] = useState<string>("");
  const [lineId, setLineId] = useState<string>("");
  const [search, setSearch] = useState<string>(options?.initialSearch ?? "");

  // Master lists from API
  const [companies, setCompanies] = useState<HrmCompany[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(false);

  const [areas, setAreas] = useState<HrmArea[]>([]);
  const [areasLoading, setAreasLoading] = useState(false);

  const [departments, setDepartments] = useState<HrmDepartment[]>([]);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);

  const [sections, setSections] = useState<HrmSection[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);

  const [units, setUnits] = useState<HrmUnit[]>([]);
  const [unitsLoading, setUnitsLoading] = useState(false);

  const [lines, setLines] = useState<HrmLine[]>([]);
  const [linesLoading, setLinesLoading] = useState(false);

  // 1. Fetch Companies from HRM API
  const fetchCompanies = useCallback(async () => {
    setCompaniesLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.COMPANY_LIST}`;

      const response = await axios.get(targetUrl, {
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.companies ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedCompanies: HrmCompany[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          company_name: String(item.company_name || item.name || "").trim(),
          company_code: String(item.company_code || item.code || "").trim(),
          group_id: item.group_id,
          company_name_in_bengali: item.company_name_in_bengali,
          company_phone: item.company_phone,
          short_name: item.short_name,
          address: item.address,
          address_in_bengali: item.address_in_bengali,
          status: item.status,
          profile_picture_path: getHrmMediaUrl(item.profile_picture_path),
        }));
        setCompanies(mappedCompanies);
      }
    } catch (err) {
      console.warn("HRM Company list API request failed:", err);
      setCompanies([]);
    } finally {
      setCompaniesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  // 2. Fetch Areas filtered by company_id from HRM API
  const fetchAreas = useCallback(async (targetCompanyId?: string) => {
    setAreasLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.AREA_LIST}`;

      const params: Record<string, any> = {};
      if (targetCompanyId) {
        params.company_id = targetCompanyId;
      }

      const response = await axios.get(targetUrl, {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.areas ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedAreas: HrmArea[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          area_name: String(
            item.area_name_in_english ||
              item.area_name ||
              item.name ||
              item.area_name_in_bengali ||
              ""
          ).trim(),
          area_code: String(item.area_code || item.code || item.short_name || "").trim(),
          company_id: String(item.company_id || targetCompanyId || "").trim(),
          area_name_in_english: item.area_name_in_english,
          area_name_in_bengali: item.area_name_in_bengali,
          short_name: item.short_name,
          status: item.status,
        }));
        setAreas(mappedAreas);
      }
    } catch (err) {
      console.warn("HRM Area list API request failed:", err);
      setAreas([]);
    } finally {
      setAreasLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAreas(companyId);
  }, [companyId, fetchAreas]);

  // 3. Fetch Departments filtered by company_id from HRM API
  const fetchDepartments = useCallback(async (targetCompanyId?: string) => {
    setDepartmentsLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.DEPARTMENT_LIST}`;

      const params: Record<string, any> = {};
      if (targetCompanyId) {
        params.company_id = targetCompanyId;
      }

      const response = await axios.get(targetUrl, {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.departments ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedDepartments: HrmDepartment[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          department_name: String(item.name_in_english || item.department_name || item.name || "").trim(),
          department_code: String(item.code || item.department_code || "").trim(),
          company_id: String(item.company_id || targetCompanyId || "").trim(),
          name_in_english: item.name_in_english,
          name_in_bengali: item.name_in_bengali,
          code: item.code,
          short_name: item.short_name,
          status: item.status,
        }));
        setDepartments(mappedDepartments);
      }
    } catch (err) {
      console.warn("HRM Department list API request failed:", err);
      setDepartments([]);
    } finally {
      setDepartmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDepartments(companyId);
  }, [companyId, fetchDepartments]);

  // 4. Fetch Sections filtered by company_id & department_id from HRM API
  const fetchSections = useCallback(async (targetCompanyId?: string, targetDepartmentId?: string) => {
    setSectionsLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.SECTION_LIST}`;

      const params: Record<string, any> = {};
      if (targetCompanyId) {
        params.company_id = targetCompanyId;
      }
      if (targetDepartmentId) {
        params.department_id = targetDepartmentId;
      }

      const response = await axios.get(targetUrl, {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.sections ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedSections: HrmSection[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          section_name: String(item.section_name_in_english || item.section_name || item.name || "").trim(),
          section_code: String(item.section_code || item.code || "").trim(),
          company_id: String(item.company_id || targetCompanyId || "").trim(),
          department_id: String(item.department_id || targetDepartmentId || "").trim(),
          section_name_in_english: item.section_name_in_english,
          section_name_in_bengali: item.section_name_in_bengali,
          short_name: item.short_name,
          status: item.status,
        }));
        setSections(mappedSections);
      }
    } catch (err) {
      console.warn("HRM Section list API request failed:", err);
      setSections([]);
    } finally {
      setSectionsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSections(companyId, departmentId);
  }, [companyId, departmentId, fetchSections]);

  // 5. Fetch Units filtered by company_id from HRM API
  const fetchUnits = useCallback(async (targetCompanyId?: string) => {
    setUnitsLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.UNIT_LIST}`;

      const params: Record<string, any> = {};
      if (targetCompanyId) {
        params.company_id = targetCompanyId;
      }

      const response = await axios.get(targetUrl, {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.units ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedUnits: HrmUnit[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          unit_name: String(item.unit_name_in_english || item.unit_name || item.name || "").trim(),
          unit_code: String(item.unit_code || item.code || "").trim(),
          company_id: String(item.company_id || targetCompanyId || "").trim(),
          unit_name_in_english: item.unit_name_in_english,
          unit_name_in_bengali: item.unit_name_in_bengali,
          short_name: item.short_name,
          sort_order: item.sort_order,
          status: item.status,
        }));
        setUnits(mappedUnits);
      }
    } catch (err) {
      console.warn("HRM Unit list API request failed:", err);
      setUnits([]);
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUnits(companyId);
  }, [companyId, fetchUnits]);

  // 6. Fetch Lines filtered by company_id from HRM API
  const fetchLines = useCallback(async (targetCompanyId?: string) => {
    setLinesLoading(true);
    try {
      const token = getAuthToken();
      const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.LINE_LIST}`;

      const params: Record<string, any> = {};
      if (targetCompanyId) {
        params.company_id = targetCompanyId;
      }

      const response = await axios.get(targetUrl, {
        ...(Object.keys(params).length > 0 ? { params } : {}),
        headers: {
          Accept: "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        timeout: 6000,
      });

      const rawList =
        response?.data?.data?.list ??
        response?.data?.data?.lines ??
        response?.data?.data ??
        response?.data?.list ??
        [];

      if (Array.isArray(rawList)) {
        const mappedLines: HrmLine[] = rawList.map((item: any) => ({
          id: String(item.id || "").trim(),
          line_name: String(item.line_name_in_english || item.line_name || item.name || "").trim(),
          line_code: String(item.line_code || item.code || "").trim(),
          company_id: String(item.company_id || targetCompanyId || "").trim(),
          line_name_in_english: item.line_name_in_english,
          line_name_in_bengali: item.line_name_in_bengali,
          short_name: item.short_name,
          sort_order: item.sort_order,
          status: item.status,
        }));
        setLines(mappedLines);
      }
    } catch (err) {
      console.warn("HRM Line list API request failed:", err);
      setLines([]);
    } finally {
      setLinesLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLines(companyId);
  }, [companyId, fetchLines]);

  // Employee list state
  const [employees, setEmployees] = useState<HrmEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<any>(null);

  // Fetch employees logic via live HRM API
  const fetchEmployees = useCallback(
    async (filters: HrmFilters) => {
      setLoading(true);
      setError("");

      if (abortRef.current) abortRef.current.abort();
      abortRef.current = new AbortController();

      const q = (filters.search || "").trim();

      try {
        const token = getAuthToken();
        const targetUrl = `${NEW_HRM_URL.replace(/\/+$/, "")}${HRM_API.EMPLOYEE_LIST}`;

        const params: Record<string, any> = {
          status: "working",
          order: "desc",
          sort_by: "created_at",
        };

        if (filters.companyId) params.company_id = filters.companyId;
        if (filters.areaId) {
          params.region_id = filters.areaId;
        }
        if (filters.departmentId) params.department_id = filters.departmentId;
        if (filters.sectionId) params.section_id = filters.sectionId;
        if (filters.unitId) params.unit_id = filters.unitId;
        if (filters.lineId) params.line_id = filters.lineId;
        if (q) params.search = q;

        const response = await axios.get(targetUrl, {
          params,
          headers: {
            Accept: "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          signal: abortRef.current.signal,
          timeout: 8000,
        });

        const rawData =
          response?.data?.data?.list ??
          response?.data?.data?.employees ??
          response?.data?.data?.items ??
          response?.data?.data ??
          response?.data?.results ??
          response?.data ??
          [];

        const rawList = Array.isArray(rawData) ? rawData : [];

        const mappedList: HrmEmployee[] = rawList.map((item: any) => {
          const id = String(item.id || item.employee_id || item.employeeId || "").trim();
          const empCode = String(
            item.employee_id_system ||
              item.employee_id ||
              item.employee_id_company ||
              item.employee_code ||
              item.employeeCode ||
              item.code ||
              id
          ).trim();

          const empName = String(
            item.name_in_english ||
              item.name ||
              item.name_in_bengali ||
              item.fullName ||
              `${item.first_name || ""} ${item.last_name || ""}`.trim() ||
              "Unknown"
          ).trim();

          const companyId = String(
            item.company_id || item.company?.id || item.companyId || filters.companyId || ""
          ).trim();
          const companyName = String(
            item.company?.company_name ||
              item.company?.name ||
              item.company_name ||
              item.companyName ||
              ""
          ).trim();

          const areaId = String(
            item.working_area_id ||
              item.area_id ||
              item.working_area?.id ||
              item.areaId ||
              filters.areaId ||
              ""
          ).trim();
          const areaName = String(
            item.working_area?.area_name_in_english ||
              item.working_area?.area_name ||
              item.area_name ||
              item.areaName ||
              ""
          ).trim();

          const departmentId = String(
            item.department_id ||
              item.department?.id ||
              item.departmentId ||
              filters.departmentId ||
              ""
          ).trim();
          const departmentName = String(
            item.department?.name_in_english ||
              item.department?.name_in_bengali ||
              item.department?.department_name ||
              item.department?.name ||
              item.department_name ||
              item.departmentName ||
              ""
          ).trim();

          const sectionId = String(
            item.section_id || item.section?.id || item.sectionId || filters.sectionId || ""
          ).trim();
          const sectionName = String(
            item.section?.section_name_in_english ||
              item.section?.section_name_in_bengali ||
              item.section?.section_name ||
              item.section?.name ||
              item.section_name ||
              item.sectionName ||
              ""
          ).trim();

          const unitId = String(
            item.unit_id || item.unit?.id || item.unitId || filters.unitId || ""
          ).trim();
          const unitName = String(
            item.unit?.unit_name_in_english ||
              item.unit?.unit_name_in_bengali ||
              item.unit?.unit_name ||
              item.unit?.name ||
              item.unit_name ||
              item.unitName ||
              ""
          ).trim();

          const lineId = String(
            item.line_id || item.line?.id || item.lineId || filters.lineId || ""
          ).trim();
          const lineName = String(
            item.line?.line_name_in_english ||
              item.line?.line_name_in_bengali ||
              item.line?.line_name ||
              item.line?.name ||
              item.line_name ||
              item.lineName ||
              ""
          ).trim();

          const designationId = String(
            item.designation_id || item.designation?.id || item.designationId || ""
          ).trim();
          const designationName = String(
            (typeof item.designation === "object"
              ? item.designation?.designation_name_english ||
                item.designation?.designation_name_bengali ||
                item.designation?.name
              : item.designation) ||
              item.designationName ||
              ""
          ).trim();

          const rawProfilePic = String(
            item.employee_portrait ||
              item.details?.employee_portrait ||
              item.profile_pic ||
              item.profilePic ||
              item.picUrl ||
              ""
          ).trim();
          const profilePic = getHrmMediaUrl(rawProfilePic);

          return {
            id,
            employee_id: empCode,
            employee_id_system: item.employee_id_system || empCode,
            employee_id_company: item.employee_id_company || "",
            employee_code: empCode,
            name: empName,
            name_in_english: item.name_in_english || empName,
            name_in_bengali: item.name_in_bengali || "",
            first_name: item.first_name || "",
            last_name: item.last_name || "",
            email: item.official_email || item.personal_email || item.email || "",
            phone: item.official_mobile_no || item.personal_mobile_no || item.phone || "",
            official_email: item.official_email || "",
            official_mobile_no: item.official_mobile_no || "",
            personal_email: item.personal_email || "",
            personal_mobile_no: item.personal_mobile_no || "",
            company_id: companyId,
            company_name: companyName,
            area_id: areaId,
            area_name: areaName,
            working_area_id: areaId,
            department_id: departmentId,
            department_name: departmentName,
            section_id: sectionId,
            section_name: sectionName,
            unit_id: unitId,
            unit_name: unitName,
            line_id: lineId,
            line_name: lineName,
            designation_id: designationId,
            designation: designationName,
            profile_pic: profilePic,
            employee_portrait: profilePic,
            status: item.status || "working",
            details: item.details || null,
            department: item.department || null,
            designation_details: typeof item.designation === "object" ? item.designation : null,
            company: item.company || null,
            working_area: item.working_area || null,
          };
        });

        setEmployees(mappedList);
      } catch (err: any) {
        if (
          err?.name === "CanceledError" ||
          err?.name === "AbortError" ||
          err?.code === "ERR_CANCELED" ||
          axios.isCancel?.(err)
        ) {
          return;
        }

        setError(
          err?.response?.data?.message ||
            err?.response?.data?.error ||
            err?.message ||
            "Failed to load employees from HRM"
        );
        setEmployees([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  // Debounced search trigger
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      fetchEmployees({
        companyId,
        areaId,
        departmentId,
        sectionId,
        unitId,
        lineId,
        search,
      });
    }, debounceMs);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [companyId, areaId, departmentId, sectionId, unitId, lineId, search, debounceMs, fetchEmployees]);

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const resetFilters = useCallback(() => {
    setCompanyId("");
    setAreaId("");
    setDepartmentId("");
    setSectionId("");
    setUnitId("");
    setLineId("");
    setSearch("");
  }, []);

  // SearchableSelect options for HRM employees
  const hrmItems = useMemo(() => {
    return employees.map((e) => {
      const displayId = e.employee_id_system || e.employee_id || e.employee_code || e.id;
      return {
        value: displayId,
        label: `${e.name} (${displayId})`,
        keywords: `${e.name} ${displayId} ${e.employee_id_system || ""} ${e.employee_id_company || ""} ${e.company_name || ""} ${e.area_name || ""} ${e.department_name || ""} ${e.section_name || ""} ${e.unit_name || ""} ${e.line_name || ""} ${e.designation || ""}`,
      };
    });
  }, [employees]);

  return {
    companyId,
    setCompanyId,
    areaId,
    setAreaId,
    departmentId,
    setDepartmentId,
    sectionId,
    setSectionId,
    unitId,
    setUnitId,
    lineId,
    setLineId,
    search,
    setSearch,

    // Lists for select dropdowns
    companies,
    companiesLoading,
    fetchCompanies,
    areas,
    areasLoading,
    fetchAreas,
    departments,
    departmentsLoading,
    fetchDepartments,
    sections,
    sectionsLoading,
    fetchSections,
    units,
    unitsLoading,
    fetchUnits,
    lines,
    linesLoading,
    fetchLines,

    // Employee results
    employees,
    hrmItems,
    loading,
    error,
    resetFilters,
    refetch: () =>
      fetchEmployees({
        companyId,
        areaId,
        departmentId,
        sectionId,
        unitId,
        lineId,
        search,
      }),
  };
}
