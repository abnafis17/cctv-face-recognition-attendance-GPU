"use client";

import { ColumnDef } from "@tanstack/react-table";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { TanstackDataTable } from "../reusable/TanstackDataTable";
import { Employee } from "@/types";
import toast from "react-hot-toast";
import axiosInstance, { API } from "@/config/axiosInstance";
import ReusableModal from "../reusable/ReusableModal";
import { useModal } from "@/hooks/useModal";
import { RefreshCw, Search, SquarePen, Trash } from "lucide-react";
import ConfirmationModal from "../reusable/ConfirmationModal";
import EmployeeEditForm from "./EmployeeEditForm";
import { useRouter } from "next/navigation";
import {
  deriveEmployeeHierarchy,
  normalizeHierarchyValue,
} from "@/lib/employeeHierarchy";

type EmployeeRow = Employee & {
  empId: string | null;
  unit: string | null;
  department: string | null;
  section: string | null;
  line: string | null;
  createdAt: string;
  updatedAt: string;
};

type HierarchyFilters = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

type EmployeeUpdatePayload = {
  name?: string;
  empId?: string | null;
  unit?: string | null;
  section?: string | null;
  department?: string | null;
  line?: string | null;
};

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

function toNullableTrimmed(value: unknown): string | null {
  const normalized = String(value ?? "").trim();
  return normalized.length ? normalized : null;
}

function normalizeEmployeeRow(employee: Employee): EmployeeRow {
  const raw = employee as Employee & { createdAt?: string; updatedAt?: string };
  return {
    ...employee,
    id: String(employee.id ?? "").trim(),
    name: String(employee.name ?? "").trim(),
    empId: toNullableTrimmed(employee.empId),
    unit: toNullableTrimmed(employee.unit),
    department: toNullableTrimmed(employee.department),
    section: toNullableTrimmed(employee.section),
    line: toNullableTrimmed(employee.line),
    createdAt: String(raw.createdAt ?? "").trim(),
    updatedAt: String(raw.updatedAt ?? "").trim(),
  };
}

function formatDateTime(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function displayHierarchyValue(value?: string | null): string {
  return normalizeHierarchyValue(value) || "N/A";
}

function searchMatchesEmployee(row: EmployeeRow, query: string): boolean {
  const q = String(query ?? "").trim().toLowerCase();
  if (!q) return true;
  const name = String(row.name ?? "").toLowerCase();
  const empId = String(row.empId ?? "").toLowerCase();
  return name.includes(q) || empId.includes(q);
}

const EmployeeListTable = () => {
  const router = useRouter();
  const { isOpen, open, close } = useModal();
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [hierarchyFilters, setHierarchyFilters] = useState<HierarchyFilters>({
    unit: "",
    department: "",
    section: "",
    line: "",
  });
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Employee | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchEmployees = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(`${API.EMPLOYEE_LIST}`);

      if (res?.status === 200) {
        const rows = Array.isArray(res.data)
          ? (res.data as Employee[]).map(normalizeEmployeeRow)
          : [];
        setEmployees(rows);
      }
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to load employees"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchEmployees();
  }, [fetchEmployees]);

  const hierarchy = useMemo(
    () => deriveEmployeeHierarchy(employees, hierarchyFilters),
    [employees, hierarchyFilters],
  );

  useEffect(() => {
    const next = hierarchy.normalizedSelection;
    setHierarchyFilters((prev) => {
      if (
        prev.unit === next.unit &&
        prev.department === next.department &&
        prev.section === next.section &&
        prev.line === next.line
      ) {
        return prev;
      }
      return next;
    });
  }, [hierarchy.normalizedSelection]);

  const filteredEmployees = useMemo(
    () =>
      (hierarchy.filteredRows as EmployeeRow[]).filter((row) =>
        searchMatchesEmployee(row, search),
      ),
    [hierarchy.filteredRows, search],
  );

  const hasActiveFilter = Boolean(
    search.trim() ||
      hierarchyFilters.unit ||
      hierarchyFilters.department ||
      hierarchyFilters.section ||
      hierarchyFilters.line,
  );

  const handleModalClose = useCallback(() => {
    close();
    setSelectedUser(null);
  }, [close]);

  const handleUpdateEmployee = useCallback(
    async (payload: EmployeeUpdatePayload) => {
      if (!selectedUser) return;

      try {
        setLoading(true);
        const res = await axiosInstance.patch(
          `${API.EMPLOYEE_LIST}/${selectedUser.id}`,
          payload,
        );

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
    },
    [fetchEmployees, handleModalClose, selectedUser],
  );

  const deleteEmployee = useCallback(async () => {
    if (!selectedPerson) return;
    try {
      setLoading(true);
      const res = await axiosInstance.delete(
        `${API.EMPLOYEE_LIST}/${selectedPerson.id}`,
      );

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

  const handleEdit = useCallback(
    (user: Employee) => {
      setSelectedUser(user);
      open();
    },
    [open],
  );

  const handleReEnroll = useCallback(
    (employee: Employee) => {
      const employeeId = String(employee.empId ?? employee.id).trim();
      const params = new URLSearchParams({
        employeeId,
        name: employee.name,
        reEnroll: "1",
      });
      router.push(`/enroll?${params.toString()}`);
    },
    [router],
  );

  const handleDelete = useCallback(async () => {
    if (!selectedPerson) return;
    try {
      setLoading(true);
      await deleteEmployee();
    } finally {
      setLoading(false);
    }
  }, [deleteEmployee, selectedPerson]);

  const employeeColumns: ColumnDef<EmployeeRow>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => (
          <div className="w-full px-1 py-2 text-center font-bold">SL</div>
        ),
        cell: (info) => (
          <div className="px-1 py-2 text-center">{info.row.index + 1}</div>
        ),
        size: 48,
      },
      {
        accessorKey: "empId",
        header: () => (
          <div className="w-full px-1 py-2 text-center font-bold">Employee ID</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-center font-mono text-xs">
            {row.original.empId || "-"}
          </div>
        ),
        size: 190,
      },
      {
        accessorKey: "name",
        header: () => (
          <div className="w-full px-1 py-2 text-left font-bold">Employee Name</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-left font-medium text-zinc-800">
            {row.original.name}
          </div>
        ),
        size: 250,
      },
      {
        accessorKey: "unit",
        header: () => (
          <div className="w-full px-1 py-2 text-left font-bold">Unit</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-left">
            {displayHierarchyValue(row.original.unit)}
          </div>
        ),
        size: 180,
      },
      {
        accessorKey: "department",
        header: () => (
          <div className="w-full px-1 py-2 text-left font-bold">Department</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-left">
            {displayHierarchyValue(row.original.department)}
          </div>
        ),
        size: 230,
      },
      {
        accessorKey: "section",
        header: () => (
          <div className="w-full px-1 py-2 text-left font-bold">Section</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-left">
            {displayHierarchyValue(row.original.section)}
          </div>
        ),
        size: 220,
      },
      {
        accessorKey: "line",
        header: () => (
          <div className="w-full px-1 py-2 text-left font-bold">Line</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-left">
            {displayHierarchyValue(row.original.line)}
          </div>
        ),
        size: 180,
      },
      {
        accessorKey: "createdAt",
        header: () => (
          <div className="w-full px-1 py-2 text-center font-bold">Created</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-center text-xs text-zinc-600">
            {formatDateTime(row.original.createdAt)}
          </div>
        ),
        size: 170,
      },
      {
        accessorKey: "updatedAt",
        header: () => (
          <div className="w-full px-1 py-2 text-center font-bold">Updated</div>
        ),
        cell: ({ row }) => (
          <div className="px-1 py-2 text-center text-xs text-zinc-600">
            {formatDateTime(row.original.updatedAt)}
          </div>
        ),
        size: 170,
      },
      {
        id: "actions",
        header: () => (
          <div className="w-full px-1 py-2 text-center font-bold">Actions</div>
        ),
        cell: ({ row }) => (
          <div className="flex items-center justify-center gap-1 px-1 py-2">
            <button
              title="Edit"
              className="cursor-pointer rounded p-1 hover:bg-gray-200"
              onClick={() => handleEdit(row.original)}
            >
              <SquarePen className="h-4 w-4 text-blue-700" />
            </button>
            <button
              title="Re-enroll Face"
              className="cursor-pointer rounded p-1 hover:bg-gray-200"
              onClick={() => handleReEnroll(row.original)}
            >
              <RefreshCw className="h-4 w-4 text-emerald-600" />
            </button>
            <button
              title="Delete"
              className="cursor-pointer rounded p-1 hover:bg-gray-200"
              onClick={() => {
                setSelectedPerson(row.original);
                setShowDeleteModal(true);
              }}
            >
              <Trash className="h-4 w-4 text-red-600" />
            </button>
          </div>
        ),
        size: 100,
      },
    ],
    [handleEdit, handleReEnroll],
  );

  return (
    <>
      <div className="space-y-4">
        <div className="rounded-xl border bg-white p-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-base font-semibold text-zinc-900">Employee Inventory</div>
              <div className="text-sm text-zinc-500">
                Search, filter, edit, and manage all employees in one place.
              </div>
            </div>

            <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
              <div className="relative w-full sm:w-[320px]">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search by employee name or ID..."
                  className="w-full rounded-lg border px-9 py-2 text-sm"
                />
              </div>

              <button
                onClick={fetchEmployees}
                type="button"
                disabled={loading}
                className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
          </div>

          <div className="mt-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4 xl:gap-3">
              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">Unit</label>
                <select
                  value={hierarchyFilters.unit}
                  onChange={(e) =>
                    setHierarchyFilters({
                      unit: e.target.value,
                      department: "",
                      section: "",
                      line: "",
                    })
                  }
                  disabled={!hierarchy.availability.hasUnit}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All units</option>
                  {hierarchy.options.units.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">Department</label>
                <select
                  value={hierarchyFilters.department}
                  onChange={(e) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      department: e.target.value,
                      section: "",
                      line: "",
                    }))
                  }
                  disabled={!hierarchy.availability.hasDepartment}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All departments</option>
                  {hierarchy.options.departments.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">Section</label>
                <select
                  value={hierarchyFilters.section}
                  onChange={(e) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      section: e.target.value,
                      line: "",
                    }))
                  }
                  disabled={!hierarchy.availability.hasSection}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All sections</option>
                  {hierarchy.options.sections.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-medium text-zinc-600">Line</label>
                <select
                  value={hierarchyFilters.line}
                  onChange={(e) =>
                    setHierarchyFilters((prev) => ({
                      ...prev,
                      line: e.target.value,
                    }))
                  }
                  disabled={!hierarchy.availability.hasLine}
                  className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2 disabled:bg-zinc-100"
                >
                  <option value="">All lines</option>
                  {hierarchy.options.lines.map((value) => (
                    <option key={value} value={value}>
                      {value}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">
                Total Employee: {filteredEmployees.length}
              </span>
              <span className="inline-flex items-center rounded-full bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700">
                All Data: {employees.length}
              </span>
              {hasActiveFilter ? (
                <span className="inline-flex items-center rounded-full bg-blue-100 px-3 py-1.5 text-xs font-semibold text-blue-700">
                  Filtered View
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
          <div className="min-w-[1700px]">
            <TanstackDataTable
              data={filteredEmployees}
              columns={employeeColumns}
              loading={loading}
              headerCellClassName="whitespace-nowrap bg-zinc-50"
              className="[&_th]:border-zinc-200 [&_td]:border-zinc-200"
            />
          </div>
        </div>
      </div>

      <ReusableModal
        open={isOpen}
        onClose={handleModalClose}
        title="Edit Employee"
        maxWidth="2xl"
        overflowAuto
      >
        <EmployeeEditForm
          selectedUser={selectedUser}
          setSelectedUser={setSelectedUser}
          loading={loading}
          onClose={handleModalClose}
          onSave={handleUpdateEmployee}
        />
      </ReusableModal>

      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedPerson(null);
        }}
        onConfirm={handleDelete}
        loading={loading}
        description="This action will permanently remove the employee from the system. You will not be able to recover it later."
      />
    </>
  );
};

export default EmployeeListTable;
