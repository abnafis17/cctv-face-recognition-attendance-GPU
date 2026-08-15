"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { ColumnDef } from "@tanstack/react-table";
import {
  Plus,
  Search,
  SquarePen,
  Trash2,
  Shield,
  Mail,
  User,
  Key,
  Loader2,
  Eye,
  EyeOff,
} from "lucide-react";
import toast from "react-hot-toast";

import axiosInstance from "@/config/axiosInstance";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import ReusableModal from "@/components/reusable/ReusableModal";
import ConfirmationModal from "@/components/reusable/ConfirmationModal";
import { useModal } from "@/hooks/useModal";

type UserType = {
  id: string;
  name: string | null;
  email: string;
  password?: string | null;
  role: string;
  isActive: boolean;
  companyId: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function UsersPanelPage() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const limits = 10;

  // Modals state
  const { isOpen: isAddOpen, open: openAdd, close: closeAdd } = useModal();
  const { isOpen: isEditOpen, open: openEdit, close: closeEdit } = useModal();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  // Dynamic user roles list
  const [roles, setRoles] = useState<string[]>([
    "OPERATOR",
    "ADMIN",
    "GENERAL_USER",
  ]);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await axiosInstance.get("/auth/roles");
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setRoles(res.data.results);
        }
      } catch (err) {
        console.error("Failed to load user roles:", err);
      }
    }
    void fetchRoles();
  }, []);

  // Form states
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("OPERATOR");
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Get currently logged in user info
  useEffect(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (raw) {
        setCurrentUser(JSON.parse(raw));
      }
    } catch (e) {
      console.error("Failed to parse userInfo:", e);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get("/settings/users");
      if (res.data?.ok && Array.isArray(res.data?.results)) {
        setUsers(res.data.results);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Search filter
  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(term)) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term),
    );
  }, [users, search]);

  // Reset page when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Paginated users
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * limits;
    return filteredUsers.slice(start, start + limits);
  }, [filteredUsers, currentPage, limits]);

  // Handle Add user submit
  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formPassword.trim()) {
      toast.error("Email and password are required");
      return;
    }

    try {
      setSubmitting(true);
      const res = await axiosInstance.post("/settings/users", {
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
      });

      if (res.data?.ok) {
        toast.success("User added successfully!");
        fetchUsers();
        closeAdd();
        // Reset form
        setFormName("");
        setFormEmail("");
        setFormPassword("");
        setFormRole(
          roles.includes("OPERATOR") ? "OPERATOR" : roles[0] || "OPERATOR",
        );
        setShowAddPassword(false);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (user: UserType) => {
    setSelectedUser(user);
    setFormName(user.name || "");
    setFormEmail(user.email);
    setFormPassword(user.password || ""); // Pre-populate with actual password
    setFormRole(user.role);
    setShowEditPassword(false);
    openEdit();
  };

  // Handle Edit user submit
  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;

    if (!formEmail.trim()) {
      toast.error("Email is required");
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        name: formName,
        email: formEmail,
        role: formRole,
      };
      if (formPassword !== (selectedUser.password || "")) {
        payload.password = formPassword;
      }

      const res = await axiosInstance.patch(
        `/settings/users/${selectedUser.id}`,
        payload,
      );

      if (res.data?.ok) {
        toast.success("User updated successfully!");

        // If updating currently logged in user role, notify role change to sync permissions
        if (currentUser && selectedUser.id === currentUser.id) {
          const raw = localStorage.getItem("userInfo");
          const info = raw ? JSON.parse(raw) : {};
          const nextInfo = {
            ...info,
            role: formRole,
            name: formName,
            email: formEmail,
          };
          localStorage.setItem("userInfo", JSON.stringify(nextInfo));
          window.dispatchEvent(new Event("userInfoUpdated"));
        }

        fetchUsers();
        closeEdit();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update user");
    } finally {
      setSubmitting(false);
    }
  };

  // Open delete confirm
  const handleOpenDelete = (user: UserType) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error("You cannot delete your own logged-in user account");
      return;
    }
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  // Handle Delete Confirm
  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const res = await axiosInstance.delete(
        `/settings/users/${selectedUser.id}`,
      );
      if (res.data?.ok) {
        toast.success("User deleted successfully!");
        fetchUsers();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete user");
    } finally {
      setLoading(false);
      setShowDeleteModal(false);
      setSelectedUser(null);
    }
  };

  // Tanstack columns definition
  const columns: ColumnDef<UserType>[] = useMemo(
    () => [
      {
        id: "sl",
        header: () => (
          <div className="w-full px-4 py-3 text-center font-bold">SL</div>
        ),
        cell: (info) => (
          <div className="px-4 py-3 text-center text-sm font-medium">
            {(currentPage - 1) * limits + info.row.index + 1}
          </div>
        ),
        size: 60,
      },
      {
        accessorKey: "name",
        header: () => (
          <div className="w-full px-4 py-3 text-left font-bold">Name</div>
        ),
        cell: ({ row }) => {
          const isMe = currentUser && row.original.id === currentUser.id;
          return (
            <div
              className={`px-4 py-3 text-left font-medium text-sm ${isMe ? "text-emerald-950 font-bold" : "text-zinc-850"}`}
            >
              {row.original.name || "-"}
            </div>
          );
        },
        size: 200,
      },
      {
        accessorKey: "email",
        header: () => (
          <div className="w-full px-4 py-3 text-left font-bold">
            Email Address
          </div>
        ),
        cell: ({ row }) => {
          const isMe = currentUser && row.original.id === currentUser.id;
          return (
            <div className="px-4 py-3 text-left text-sm flex items-center gap-2">
              <span
                className={`font-mono text-xs ${isMe ? "text-emerald-950 font-semibold" : "text-zinc-650"}`}
              >
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
        header: () => (
          <div className="w-full px-4 py-3 text-center font-bold">Role</div>
        ),
        cell: ({ row }) => {
          const role = row.original.role;
          let badgeClass = "bg-zinc-100 text-zinc-800 border-zinc-200";
          if (role === "ADMIN" || role === "SUPER_ADMIN") {
            badgeClass = "bg-indigo-50 text-indigo-700 border-indigo-100";
          } else if (role === "OPERATOR") {
            badgeClass = "bg-amber-50 text-amber-700 border-amber-100";
          }
          const isMe = currentUser && row.original.id === currentUser.id;
          if (isMe) {
            badgeClass =
              "bg-emerald-100/60 text-emerald-800 border-emerald-200/50";
          }

          return (
            <div className="px-4 py-3 text-center">
              <span
                className={`inline-flex items-center rounded-lg border px-2.5 py-1 text-xs font-semibold uppercase tracking-wider ${badgeClass}`}
              >
                {role}
              </span>
            </div>
          );
        },
        size: 150,
      },
      {
        id: "actions",
        header: () => (
          <div className="w-full px-4 py-3 text-center font-bold">Actions</div>
        ),
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
    [currentUser, currentPage, limits],
  );

  // Dynamic row styling callback for TanstackDataTable
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
            setFormRole(
              roles.includes("OPERATOR") ? "OPERATOR" : roles[0] || "OPERATOR",
            );
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
              searchText={search}
              activeTab="users-tab"
            />
          </div>
        )}
      </div>

      {/* Add User Modal */}
      <ReusableModal
        open={isAddOpen}
        onClose={closeAdd}
        title="Add New User"
        maxWidth="md"
      >
        <form onSubmit={handleAddSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400" /> Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-zinc-400" /> Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. john@pakizaknit.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" /> Password *
            </label>
            <div className="relative">
              <input
                type={showAddPassword ? "text" : "password"}
                required
                placeholder="Enter secure password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-3 pr-10 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowAddPassword(!showAddPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none"
              >
                {showAddPassword ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-400" /> Account Role *
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={closeAdd}
              disabled={submitting}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Adding...
                </>
              ) : (
                "Add User"
              )}
            </button>
          </div>
        </form>
      </ReusableModal>

      {/* Edit User Modal */}
      <ReusableModal
        open={isEditOpen}
        onClose={closeEdit}
        title="Edit User Info"
        maxWidth="md"
      >
        <form onSubmit={handleEditSubmit} className="space-y-4 pt-1">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400" /> Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. John Doe"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-zinc-400" /> Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. john@pakizaknit.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" /> Change Password
            </label>
            <div className="relative">
              <input
                type={showEditPassword ? "text" : "password"}
                placeholder="Enter new password to change"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-3 pr-10 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowEditPassword(!showEditPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none"
              >
                {showEditPassword ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-zinc-400" /> Account Role *
            </label>
            <select
              value={formRole}
              onChange={(e) => setFormRole(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-zinc-900/10 focus:ring-2"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r
                    .replace(/_/g, " ")
                    .replace(/\b\w/g, (c) => c.toUpperCase())}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-zinc-100">
            <button
              type="button"
              onClick={closeEdit}
              disabled={submitting}
              className="rounded-lg border border-zinc-200 bg-white px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </ReusableModal>

      {/* Delete User Confirmation Modal */}
      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedUser(null);
        }}
        onConfirm={handleDeleteConfirm}
        loading={loading}
        description="Are you sure you want to permanently delete this user account? The user will no longer be able to log into the system."
      />
    </div>
  );
}
