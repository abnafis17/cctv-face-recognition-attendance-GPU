"use client";

import React, { useMemo } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Search,
  SquarePen,
  Trash2,
  User,
  Mail,
  Key,
  Shield,
  Eye,
  EyeOff,
  Loader2,
} from "lucide-react";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import ReusableModal from "@/components/reusable/ReusableModal";
import ConfirmationModal from "@/components/reusable/ConfirmationModal";
import { useUsersState, UserType } from "./useUsersState";

export default function UsersPanelPage() {
  const {
    loading,
    search,
    setSearch,
    currentPage,
    setCurrentPage,
    limits,
    isAddOpen,
    openAdd,
    closeAdd,
    isEditOpen,
    closeEdit,
    showDeleteModal,
    setShowDeleteModal,
    selectedUser,
    currentUser,
    roles,
    formName,
    setFormName,
    formEmail,
    setFormEmail,
    formPassword,
    setFormPassword,
    formRole,
    setFormRole,
    showAddPassword,
    setShowAddPassword,
    showEditPassword,
    setShowEditPassword,
    submitting,
    filteredUsers,
    paginatedUsers,
    handleAddSubmit,
    handleOpenEdit,
    handleEditSubmit,
    handleOpenDelete,
    handleDeleteConfirm,
  } = useUsersState();

  const columns: ColumnDef<UserType>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => <div className="w-full px-4 py-3 text-center font-bold">SL</div>,
        cell: (info) => (
          <div className="px-4 py-3 text-center text-sm font-medium">
            {(currentPage - 1) * limits + info.row.index + 1}
          </div>
        ),
        size: 60,
      },
      {
        accessorKey: "name",
        header: () => <div className="w-full px-4 py-3 text-left font-bold">Name</div>,
        cell: ({ row }) => {
          const isMe = currentUser && row.original.id === currentUser.id;
          return (
            <div className={`px-4 py-3 text-left font-medium text-sm ${isMe ? "text-emerald-950 font-bold" : "text-zinc-850"}`}>
              {row.original.name || "-"}
            </div>
          );
        },
        size: 200,
      },
      {
        accessorKey: "email",
        header: () => <div className="w-full px-4 py-3 text-left font-bold">Email Address</div>,
        cell: ({ row }) => {
          const isMe = currentUser && row.original.id === currentUser.id;
          return (
            <div className="px-4 py-3 text-left text-sm flex items-center gap-2">
              <span className={`font-mono text-xs ${isMe ? "text-emerald-950 font-semibold" : "text-zinc-650"}`}>
                {row.original.email}
              </span>
              {isMe && (
                <span className="inline-flex items-center rounded-full bg-emerald-100/80 px-2 py-0.5 text-[10px] font-bold text-emerald-700 uppercase tracking-wider">
                  You / Logged In
                </span>
              )}
            </div>
          );
        },
        size: 280,
      },
      {
        accessorKey: "role",
        header: () => <div className="w-full px-4 py-3 text-center font-bold">Role</div>,
        cell: ({ row }) => {
          const role = row.original.role;
          let badgeClass = "bg-zinc-100 text-zinc-800 border-zinc-200";
          if (role === "ADMIN" || role === "SUPER_ADMIN") {
            badgeClass = "bg-indigo-50 text-indigo-700 border-indigo-100";
          } else if (role === "OPERATOR") {
            badgeClass = "bg-amber-50 text-amber-700 border-amber-100";
          }
          const isMe = currentUser && row.original.id === currentUser.id;
          if (isMe) badgeClass = "bg-emerald-100/60 text-emerald-800 border-emerald-200/50";

          return (
            <div className="px-4 py-3 text-center">
              <span className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${badgeClass}`}>
                {role}
              </span>
            </div>
          );
        },
        size: 150,
      },
      {
        id: "actions",
        header: () => <div className="w-full px-4 py-3 text-center font-bold">Actions</div>,
        cell: ({ row }) => {
          const isMe = currentUser && row.original.id === currentUser.id;
          return (
            <div className="flex items-center justify-center gap-2 px-4 py-2">
              <button
                title="Edit User"
                className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800 transition shadow-xs"
                onClick={() => handleOpenEdit(row.original)}
              >
                <SquarePen className="h-4 w-4 text-blue-600" />
              </button>
              {!isMe && (
                <button
                  title="Delete User"
                  className="cursor-pointer rounded-lg border border-zinc-200 bg-white p-1.5 text-zinc-500 hover:bg-zinc-50 hover:text-red-600 transition shadow-xs"
                  onClick={() => handleOpenDelete(row.original)}
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </button>
              )}
            </div>
          );
        },
        size: 120,
      },
    ],
    [currentUser, currentPage, limits, handleOpenEdit, handleOpenDelete]
  );

  const getRowClassName = (row: any) => {
    const isMe = currentUser && row.original.id === currentUser.id;
    return isMe
      ? "bg-emerald-50/20 hover:bg-emerald-50/40 text-emerald-950 border-l-4 border-l-emerald-500 font-semibold"
      : "hover:bg-zinc-50/60";
  };

  return (
    <div className="space-y-6">
      {/* Top Banner and Actions */}
      <div className="bg-white border border-zinc-200/80 rounded-xl p-5 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative max-w-sm w-full">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 z-10" />
          <input
            type="text"
            placeholder="Search users by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-200 bg-slate-50/30 pl-10 pr-4 text-sm text-zinc-800 outline-none ring-zinc-900/10 focus:ring-2 focus:border-zinc-300 transition"
          />
        </div>

        <button
          type="button"
          onClick={() => {
            setFormName("");
            setFormEmail("");
            setFormPassword("");
            setFormRole(roles.includes("OPERATOR") ? "OPERATOR" : roles[0] || "OPERATOR");
            openAdd();
          }}
          className="h-10 rounded-xl bg-violet-600 px-5 text-sm font-semibold text-white hover:bg-violet-700 transition flex items-center justify-center gap-2 shadow-sm cursor-pointer"
        >
          <Plus className="w-4.5 h-4.5" />
          Add User
        </button>
      </div>

      {/* Users Data Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200/80 bg-white shadow-xs">
        <div className="overflow-x-auto">
          <div className="min-w-[800px]">
            <TanstackDataTable
              data={paginatedUsers}
              columns={columns}
              loading={loading}
              getRowClassName={getRowClassName}
              headerCellClassName="whitespace-nowrap bg-slate-50 text-zinc-700 font-bold border-b border-zinc-150"
            />
          </div>
        </div>

        {filteredUsers.length > 0 && (
          <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3.5">
            <Pagination
              numberOfData={filteredUsers.length}
              limits={limits}
              getCurrentPage={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <ReusableModal open={isAddOpen} onClose={closeAdd} title="Create New User" maxWidth="md">
        <form onSubmit={handleAddSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-700">Full Name</label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="text"
                placeholder="John Doe"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">Email Address *</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                required
                placeholder="john@example.com"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-violet-500"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">Password *</label>
            <div className="relative mt-1">
              <Key className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                type={showAddPassword ? "text" : "password"}
                required
                placeholder="••••••••"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-10 py-2 text-sm outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowAddPassword(!showAddPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showAddPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">User Role</label>
            <div className="relative mt-1">
              <Shield className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-violet-500 bg-white"
              >
                {roles.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeAdd} className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Create User
            </button>
          </div>
        </form>
      </ReusableModal>

      {/* Edit User Modal */}
      <ReusableModal open={isEditOpen} onClose={closeEdit} title="Edit User Details" maxWidth="md">
        <form onSubmit={handleEditSubmit} className="space-y-4">
          <div>
            <label className="text-xs font-semibold text-zinc-700">Full Name</label>
            <input
              type="text"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="w-full mt-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">Email Address *</label>
            <input
              type="email"
              required
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="w-full mt-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-violet-500"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">Password</label>
            <div className="relative mt-1">
              <input
                type={showEditPassword ? "text" : "password"}
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-4 pr-10 py-2 text-sm outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword(!showEditPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showEditPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-zinc-700">User Role</label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="w-full mt-1 rounded-xl border border-zinc-200 px-4 py-2 text-sm outline-none focus:border-violet-500 bg-white"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={closeEdit} className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5">
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Changes
            </button>
          </div>
        </form>
      </ReusableModal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDeleteConfirm}
        title="Delete User Account"
        description={`Are you sure you want to delete user "${selectedUser?.name || selectedUser?.email}"? This action cannot be undone.`}
      />
    </div>
  );
}
