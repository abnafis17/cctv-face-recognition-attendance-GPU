"use client";

import { ColumnDef } from "@tanstack/react-table";
import React, { useEffect, useState } from "react";
import { TanstackDataTable } from "../reusable/TanstackDataTable";
import { Employee } from "@/types";
import toast from "react-hot-toast";
import axiosInstance, { API } from "@/config/axiosInstance";
import ReusableModal from "../reusable/ReusableModal";
import { useModal } from "@/hooks/useModal";
import { SquarePen, Trash } from "lucide-react";
import ConfirmationModal from "../reusable/ConfirmationModal";
import EmployeeEditForm from "./EmployeeEditForm";

const EmployeeListTable = () => {
  const { isOpen, open, close } = useModal();
  const [skip, setSkip] = useState(0);
  const [loading, setLoading] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedUser, setSelectedUser] = useState<Employee | null>(null);
  const [selectedPerson, setSelectedPerson] = useState<Employee | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchEmployees = async () => {
    try {
      const res = await axiosInstance.get(`${API.EMPLOYEE_LIST}`);

      if (res?.status === 200) setEmployees((res.data || []) as Employee[]);
    } catch (error: any) {
      if (error?.response?.data?.message) {
        toast.error(error.response.data.message);
      }
    }
  };

  // --- ADD: update handler (call your PATCH /employees/:id) ---
  const handleUpdateEmployee = async (payload: {
    name?: string;
    empId?: string | null;
  }) => {
    if (!selectedUser) return;

    try {
      setLoading(true);

      const res = await axiosInstance.patch(
        `${API.EMPLOYEE_LIST}/${selectedUser.id}`,
        payload
      );

      if (res?.status === 200) {
        toast.success("Employee updated successfully");
        await fetchEmployees();
        handleModalClose();
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Failed to update employee";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  // --- UPDATE: your existing handleDelete to call DELETE /employees/:id ---
  const deleteEmployee = async () => {
    if (!selectedPerson) return;
    try {
      setLoading(true);

      const res = await axiosInstance.delete(
        `${API.EMPLOYEE_LIST}/${selectedPerson.id}`
      );

      if (res?.status === 200) {
        toast.success("Employee deleted successfully");
        await fetchEmployees();
        setShowDeleteModal(false);
        setSelectedPerson(null);
      }
    } catch (error: any) {
      const msg =
        error?.response?.data?.error ||
        error?.response?.data?.message ||
        "Failed to delete employee";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEmployees();
  }, []);

  const handleEdit = (user: Employee) => {
    setSelectedUser(user);
    open();
  };

  const handleModalClose = () => {
    close();
    setSelectedUser(null);
  };

  const handleDelete = async () => {
    if (!selectedPerson) return;
    try {
      setLoading(true);
      await deleteEmployee();
      setShowDeleteModal(false);
      setSelectedPerson(null);
    } finally {
      setLoading(false);
    }
  };

  const employee_columns: ColumnDef<any>[] = [
    {
      id: "sl",
      header: () => (
        <div className="text-center font-bold w-full px-1 py-2">SL</div>
      ),
      accessorKey: "sl",
      cell: (info: any) => (
        <div className="text-center px-1 py-2">
          {info.row.index + 1 + (skip || 0)}
        </div>
      ),
      size: 20,
    },
    {
      header: () => (
        <div className="text-center font-bold w-full px-1 py-2">
          Employee ID
        </div>
      ),
      accessorKey: "empId",
      cell: ({ row }: any) => (
        <div className="text-center px-1 py-2">{row.original.empId}</div>
      ),
      size: 200,
    },
    {
      header: () => (
        <div className="text-left font-bold w-full px-1 py-2">Name</div>
      ),
      accessorKey: "name",
      cell: ({ row }: any) => (
        <div className="text-left px-1 py-2">{row.original.name}</div>
      ),
      size: 800,
    },
    {
      id: "actions",
      header: () => (
        <div className="text-center font-bold w-full px-1 py-2">Actions</div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center gap-1">
          <button
            title="Edit"
            className="p-1 hover:bg-gray-200 rounded cursor-pointer"
            onClick={() => handleEdit(row.original)}
          >
            <SquarePen className="h-4 w-4 text-gray-600 hover:text-blue-600" />
          </button>

          <button
            title="Delete"
            className="p-1 hover:bg-gray-200 rounded cursor-pointer"
            onClick={() => {
              setSelectedPerson(row.original);
              setShowDeleteModal(true);
            }}
          >
            <Trash className="h-4 w-4 text-red-600 hover:text-red-800" />
          </button>
        </div>
      ),
      size: 20,
    },
  ];

  return (
    <>
      <div className="w-full">
        <div className="rounded-md border">
          <TanstackDataTable data={employees} columns={employee_columns} />
        </div>
      </div>

      {/* Edit User Modal */}
      <ReusableModal
        open={isOpen}
        onClose={handleModalClose}
        title="Edit User"
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

      {/* Delete Confirmation */}
      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedPerson(null);
        }}
        onConfirm={handleDelete}
        loading={loading}
        description="This action will permanently remove the user from the system. You won’t be able to recover it later."
      />
    </>
  );
};

export default EmployeeListTable;
