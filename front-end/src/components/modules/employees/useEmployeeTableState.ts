import React, { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { useRouter } from "next/navigation";
import axiosInstance, { API } from "@/config/axiosInstance";
import { Employee } from "@/types";
import { useModal } from "@/hooks/useModal";
import { deriveEmployeeHierarchy, normalizeHierarchyValue } from "@/lib/employeeHierarchy";

export type EmployeeRow = Employee & {
  empId: string | null; unit: string | null; department: string | null;
  section: string | null; line: string | null; createdAt: string; updatedAt: string;
};

export type HierarchyFilters = { unit: string; department: string; section: string; line: string; };

export type EmployeeUpdatePayload = {
  name?: string; empId?: string | null; unit?: string | null; section?: string | null;
  department?: string | null; line?: string | null; deptId?: string | null; sectionId?: string | null;
  designationId?: string | null; designation?: string | null; unitId?: string | null; lineId?: string | null;
  empPicUrl?: string | null;
};

export function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return anyError?.response?.data?.error || anyError?.response?.data?.message || anyError?.message || fallback;
}

export function toNullableTrimmed(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : null;
}

export function normalizeEmployeeRow(employee: Employee): EmployeeRow {
  const raw = employee as Employee & { createdAt?: string; updatedAt?: string };
  return {
    ...employee,
    id: String(employee.id ?? "").trim(), name: String(employee.name ?? "").trim(),
    empId: toNullableTrimmed(employee.empId), unit: toNullableTrimmed(employee.unit),
    department: toNullableTrimmed(employee.department), section: toNullableTrimmed(employee.section),
    line: toNullableTrimmed(employee.line), createdAt: String(raw.createdAt ?? "").trim(),
    updatedAt: String(raw.updatedAt ?? "").trim(),
  };
}

export function useEmployeeTableState() {
  const router = useRouter();
  const { isOpen, open, close } = useModal();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [hierarchyFilters, setHierarchyFilters] = useState<HierarchyFilters>({ unit: "", department: "", section: "", line: "" });
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Employee | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const limits = 20;
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      const userInfo = raw ? JSON.parse(raw) : null;
      if (userInfo?.permissions) setPermissions(userInfo.permissions);
    } catch { /* ignore */ }
  }, []);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`${API.EMPLOYEE_LIST}`);
      if (res?.status === 200) {
        const rows = Array.isArray(res.data) ? (res.data as Employee[]).map(normalizeEmployeeRow) : [];
        setEmployees(rows);
      }
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to load employees"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void fetchEmployees(); }, [fetchEmployees]);

  const hierarchy = useMemo(() => deriveEmployeeHierarchy(employees, hierarchyFilters), [employees, hierarchyFilters]);

  useEffect(() => {
    const next = hierarchy.normalizedSelection;
    setHierarchyFilters((prev) => (prev.unit === next.unit && prev.department === next.department && prev.section === next.section && prev.line === next.line ? prev : next));
  }, [hierarchy.normalizedSelection]);

  useEffect(() => { setCurrentPage(1); }, [search, hierarchyFilters]);

  const filteredEmployees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (hierarchy.filteredRows as EmployeeRow[]).filter((row) => {
      if (!q) return true;
      return String(row.name ?? "").toLowerCase().includes(q) || String(row.empId ?? "").toLowerCase().includes(q);
    });
  }, [hierarchy.filteredRows, search]);

  const paginatedEmployees = useMemo(() => {
    const startIndex = (currentPage - 1) * limits;
    return filteredEmployees.slice(startIndex, startIndex + limits);
  }, [filteredEmployees, currentPage, limits]);

  const handleModalClose = useCallback(() => { close(); setSelectedUser(null); }, [close]);

  const handleUpdateEmployee = useCallback(async (payload: EmployeeUpdatePayload) => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const res = await axiosInstance.patch(`${API.EMPLOYEE_LIST}/${selectedUser.id}`, payload);
      if (res?.status === 200) {
        toast.success("Employee updated successfully");
        await fetchEmployees();
        handleModalClose();
      }
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to update employee"));
    } finally {
      setLoading(false);
    }
  }, [fetchEmployees, handleModalClose, selectedUser]);

  const deleteEmployee = useCallback(async () => {
    if (!selectedPerson) return;
    try {
      setLoading(true);
      const res = await axiosInstance.delete(`${API.EMPLOYEE_LIST}/${selectedPerson.id}`);
      if (res?.status === 200) {
        toast.success("Employee deleted successfully");
        await fetchEmployees();
        setShowDeleteModal(false);
        setSelectedPerson(null);
      }
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to delete employee"));
    } finally {
      setLoading(false);
    }
  }, [fetchEmployees, selectedPerson]);

  const handleEdit = useCallback((employee: Employee) => { setSelectedUser(employee); open(); }, [open]);
  const handleReEnroll = useCallback(
    (employee: Employee) => {
      const params = new URLSearchParams();
      const empId = employee.empId || "";
      if (empId) params.set("employeeId", empId);
      if (employee.name) params.set("name", employee.name);
      if (employee.unit) params.set("unit", employee.unit);
      if (employee.department) params.set("department", employee.department);
      if (employee.section) params.set("section", employee.section);
      if (employee.line) params.set("line", employee.line);
      params.set("reEnroll", "true");
      router.push(`/enroll?${params.toString()}`);
    },
    [router]
  );

  return {
    isOpen, loading, search, setSearch, hierarchyFilters, setHierarchyFilters, selectedUser, setSelectedUser,
    selectedPerson, setSelectedPerson, showDeleteModal, setShowDeleteModal, currentPage, setCurrentPage, limits,
    permissions, hierarchy, employees, filteredEmployees, paginatedEmployees, handleModalClose, handleUpdateEmployee,
    deleteEmployee, handleEdit, handleReEnroll, fetchEmployees,
  };
}
