"use client";

import React, { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import { RefreshCw, Search, SquarePen, Trash } from "lucide-react";
import { TanstackDataTable } from "../../reusable/TanstackDataTable";
import ReusableModal from "../../reusable/ReusableModal";
import ConfirmationModal from "../../reusable/ConfirmationModal";
import Pagination from "../../reusable/Pagination";
import EmployeeEditForm from "./EmployeeEditForm";
import { EmployeeHierarchyFilters } from "./EmployeeHierarchyFilters";
import { normalizeHierarchyValue } from "@/lib/employeeHierarchy";
import { useEmployeeTableState, EmployeeRow } from "./useEmployeeTableState";

function formatDateTime(iso?: string | null): string {
  const raw = String(iso ?? "").trim();
  if (!raw) return "-";
  const dt = new Date(raw);
  if (Number.isNaN(dt.getTime())) return "-";
  return dt.toLocaleString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function displayHierarchyValue(value?: string | null): string {
  return normalizeHierarchyValue(value) || "N/A";
}

const EmployeeListTable = () => {
  const {
    isOpen, loading, search, setSearch, hierarchyFilters, setHierarchyFilters, selectedUser, setSelectedUser,
    selectedPerson, setSelectedPerson, showDeleteModal, setShowDeleteModal, currentPage, setCurrentPage, limits,
    permissions, hierarchy, employees, filteredEmployees, paginatedEmployees, handleModalClose, handleUpdateEmployee,
    deleteEmployee, handleEdit, handleReEnroll, fetchEmployees,
  } = useEmployeeTableState();

  const activeTabKey = useMemo(
    () => `${hierarchyFilters.unit}-${hierarchyFilters.department}-${hierarchyFilters.section}-${hierarchyFilters.line}`,
    [hierarchyFilters]
  );

  const employeeColumns: ColumnDef<EmployeeRow>[] = useMemo(
    () => [
      { id: "sl", header: () => <div className="w-full px-1 py-2 text-center font-bold">SL</div>,
        cell: (info) => <div className="px-1 py-2 text-center font-normal">{(currentPage - 1) * limits + info.row.index + 1}</div>, size: 48 },
      { accessorKey: "empId", header: () => <div className="w-full px-1 py-2 text-center font-bold">Employee ID</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-center font-mono text-xs font-medium">{row.original.empId || "-"}</div>, size: 190 },
      { accessorKey: "name", header: () => <div className="w-full px-1 py-2 text-left font-bold">Employee Name</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-left font-medium text-zinc-800">{row.original.name}</div>, size: 250 },
      { accessorKey: "unit", header: () => <div className="w-full px-1 py-2 text-left font-bold">Unit</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-left">{displayHierarchyValue(row.original.unit)}</div>, size: 180 },
      { accessorKey: "department", header: () => <div className="w-full px-1 py-2 text-left font-bold">Department</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-left">{displayHierarchyValue(row.original.department)}</div>, size: 230 },
      { accessorKey: "section", header: () => <div className="w-full px-1 py-2 text-left font-bold">Section</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-left">{displayHierarchyValue(row.original.section)}</div>, size: 220 },
      { accessorKey: "line", header: () => <div className="w-full px-1 py-2 text-left font-bold">Line</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-left">{displayHierarchyValue(row.original.line)}</div>, size: 180 },
      { accessorKey: "createdAt", header: () => <div className="w-full px-1 py-2 text-center font-bold">Created</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-center text-xs text-zinc-600">{formatDateTime(row.original.createdAt)}</div>, size: 170 },
      { accessorKey: "updatedAt", header: () => <div className="w-full px-1 py-2 text-center font-bold">Updated</div>,
        cell: ({ row }) => <div className="px-1 py-2 text-center text-xs text-zinc-600">{formatDateTime(row.original.updatedAt)}</div>, size: 170 },
      { id: "actions", header: () => <div className="w-full px-1 py-2 text-center font-bold">Actions</div>,
        cell: ({ row }) => {
          const showEdit = permissions["/employees/edit"] !== false;
          const showReEnroll = permissions["/employees/re-enroll"] !== false;
          const showDelete = permissions["/employees/delete"] !== false;
          if (!showEdit && !showReEnroll && !showDelete) return <div className="px-1 py-2 text-center text-xs text-zinc-400 font-semibold">N/A</div>;
          return (
            <div className="flex items-center justify-center gap-1 px-1 py-2">
              {showEdit && <button title="Edit" className="cursor-pointer rounded p-1 hover:bg-gray-200" onClick={() => handleEdit(row.original)}><SquarePen className="h-4 w-4 text-blue-700" /></button>}
              {showReEnroll && <button title="Re-enroll Face" className="cursor-pointer rounded p-1 hover:bg-gray-200" onClick={() => handleReEnroll(row.original)}><RefreshCw className="h-4 w-4 text-emerald-600" /></button>}
              {showDelete && <button title="Delete" className="cursor-pointer rounded p-1 hover:bg-gray-200" onClick={() => { setSelectedPerson(row.original); setShowDeleteModal(true); }}><Trash className="h-4 w-4 text-red-600" /></button>}
            </div>
          );
        }, size: 120 },
    ],
    [currentPage, limits, permissions, handleEdit, handleReEnroll, setSelectedPerson, setShowDeleteModal]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Search & Refresh Bar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white p-4 rounded-xl border border-zinc-200 shadow-2xs">
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
          <input
            type="text"
            placeholder="Search employee name or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 outline-none focus:border-indigo-500"
          />
        </div>
        <button onClick={fetchEmployees} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 rounded-lg transition cursor-pointer">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {/* Hierarchy Filters */}
      <EmployeeHierarchyFilters
        hierarchyFilters={hierarchyFilters}
        setHierarchyFilters={setHierarchyFilters}
        hierarchy={hierarchy}
        filteredCount={filteredEmployees.length}
        totalCount={employees.length}
      />

      {/* Table & Pagination Container */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xs">
        <div className="overflow-x-auto">
          <div className="min-w-[1700px]">
            <TanstackDataTable
              data={paginatedEmployees}
              columns={employeeColumns}
              loading={loading}
              headerCellClassName="whitespace-nowrap bg-zinc-50"
            />
          </div>
        </div>
        {filteredEmployees.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
            <Pagination
              key={`${filteredEmployees.length}-${search}-${activeTabKey}`}
              numberOfData={filteredEmployees.length}
              limits={limits}
              getCurrentPage={setCurrentPage}
              searchText={search}
              activeTab={activeTabKey}
            />
          </div>
        )}
      </div>

      {/* Edit Form Modal */}
      <ReusableModal open={isOpen} onClose={handleModalClose} title="Edit Employee Info">
        {selectedUser && <EmployeeEditForm selectedUser={selectedUser} setSelectedUser={setSelectedUser} loading={loading} onClose={handleModalClose} onSave={handleUpdateEmployee} />}
      </ReusableModal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal open={showDeleteModal} onClose={() => { setShowDeleteModal(false); setSelectedPerson(null); }} onConfirm={deleteEmployee} loading={loading} description="This action will permanently remove the employee from the system." />
    </div>
  );
};

export default EmployeeListTable;
