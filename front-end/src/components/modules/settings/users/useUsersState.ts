import React, { useState, useEffect, useMemo, useCallback } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import { useModal } from "@/hooks/useModal";

export type UserType = {
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

export function useUsersState() {
  const [users, setUsers] = useState<UserType[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const limits = 10;

  const { isOpen: isAddOpen, open: openAdd, close: closeAdd } = useModal();
  const { isOpen: isEditOpen, open: openEdit, close: closeEdit } = useModal();
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserType | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);

  const [roles, setRoles] = useState<string[]>(["OPERATOR", "ADMIN", "GENERAL_USER"]);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await axiosInstance.get(API.ROLES);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setRoles(res.data.results);
        }
      } catch (err) {
        console.error("Failed to load roles:", err);
      }
    }
    void fetchRoles();
  }, []);

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formRole, setFormRole] = useState("OPERATOR");
  const [showAddPassword, setShowAddPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (raw) setCurrentUser(JSON.parse(raw));
    } catch (e) {
      console.error("Failed to parse userInfo:", e);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(API.SETTINGS_USERS);
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

  const filteredUsers = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return users;
    return users.filter(
      (u) =>
        (u.name && u.name.toLowerCase().includes(term)) ||
        u.email.toLowerCase().includes(term) ||
        u.role.toLowerCase().includes(term)
    );
  }, [users, search]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * limits;
    return filteredUsers.slice(start, start + limits);
  }, [filteredUsers, currentPage, limits]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formEmail.trim() || !formPassword.trim()) {
      toast.error("Email and password are required");
      return;
    }
    try {
      setSubmitting(true);
      const res = await axiosInstance.post(API.SETTINGS_USERS, {
        name: formName,
        email: formEmail,
        password: formPassword,
        role: formRole,
      });

      if (res.data?.ok) {
        toast.success("User added successfully!");
        fetchUsers();
        closeAdd();
        setFormName("");
        setFormEmail("");
        setFormPassword("");
        setFormRole(roles.includes("OPERATOR") ? "OPERATOR" : roles[0] || "OPERATOR");
        setShowAddPassword(false);
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to add user");
    } finally {
      setSubmitting(false);
    }
  };

  const handleOpenEdit = (user: UserType) => {
    setSelectedUser(user);
    setFormName(user.name || "");
    setFormEmail(user.email);
    setFormPassword(user.password || "");
    setFormRole(user.role);
    setShowEditPassword(false);
    openEdit();
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !formEmail.trim()) return;

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
        `${API.SETTINGS_USERS}/${selectedUser.id}`,
        payload
      );

      if (res.data?.ok) {
        toast.success("User updated successfully!");
        if (currentUser && selectedUser.id === currentUser.id) {
          const raw = localStorage.getItem("userInfo");
          const info = raw ? JSON.parse(raw) : {};
          const nextInfo = { ...info, role: formRole, name: formName, email: formEmail };
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

  const handleOpenDelete = (user: UserType) => {
    if (currentUser && user.id === currentUser.id) {
      toast.error("You cannot delete your own logged-in user account");
      return;
    }
    setSelectedUser(user);
    setShowDeleteModal(true);
  };

  const handleDeleteConfirm = async () => {
    if (!selectedUser) return;
    try {
      setLoading(true);
      const res = await axiosInstance.delete(`${API.SETTINGS_USERS}/${selectedUser.id}`);
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

  return {
    users,
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
  };
}
