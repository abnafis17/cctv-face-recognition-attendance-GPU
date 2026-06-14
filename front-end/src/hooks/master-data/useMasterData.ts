"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";

function toMessage(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

export function useMasterData(apiPath: string, label: string) {
  const [items, setItems] = useState<any[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [currentPage, setCurrentPage] = useState(1);
  const [limit] = useState(10); // 10 items per page

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [addName, setAddName] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<any | null>(null);
  const [editName, setEditName] = useState("");

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<any | null>(null);

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setCurrentPage(1); // Reset page to 1 on search change
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get(apiPath, {
        params: {
          page: currentPage,
          limit,
          q: debouncedSearch || undefined,
        },
      });
      const data = res?.data ?? {};
      setItems(data.items ?? []);
      setTotalCount(data.totalCount ?? 0);
      setTotalPages(data.totalPages ?? 1);
    } catch (error: unknown) {
      toast.error(toMessage(error, `Failed to load ${label} list`));
    } finally {
      setLoading(false);
    }
  }, [apiPath, label, currentPage, limit, debouncedSearch]);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const clearAddForm = useCallback(() => {
    setAddName("");
  }, []);

  const submitAdd = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const name = addName.trim();
      if (!name) {
        toast.error("Name is required");
        return;
      }

      try {
        setSaving(true);
        await axiosInstance.post(apiPath, { name });
        toast.success(`${label} added successfully`);
        clearAddForm();
        setCurrentPage(1); // Go to first page to see the new item
        await fetchData();
      } catch (error: unknown) {
        toast.error(toMessage(error, `Failed to save ${label}`));
      } finally {
        setSaving(false);
      }
    },
    [apiPath, label, addName, clearAddForm, fetchData]
  );

  const openEditModal = useCallback((row: any) => {
    setEditRow(row);
    setEditName(row.name ?? "");
    setEditOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditOpen(false);
    setEditRow(null);
    setEditName("");
  }, []);

  const submitEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editRow) return;

      const name = editName.trim();
      if (!name) {
        toast.error("Name is required");
        return;
      }

      try {
        setSaving(true);
        await axiosInstance.put(`${apiPath}/${editRow.id}`, { name });
        toast.success(`${label} updated successfully`);
        closeEditModal();
        await fetchData();
      } catch (error: unknown) {
        toast.error(toMessage(error, `Failed to update ${label}`));
      } finally {
        setSaving(false);
      }
    },
    [apiPath, label, editName, editRow, closeEditModal, fetchData]
  );

  const openDeleteModal = useCallback((row: any) => {
    setSelectedForDelete(row);
    setShowDeleteModal(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setSelectedForDelete(null);
    setShowDeleteModal(false);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedForDelete) return;

    try {
      setDeleting(true);
      await axiosInstance.delete(`${apiPath}/${selectedForDelete.id}`);
      toast.success(`${label} deleted successfully`);
      closeDeleteModal();
      // Adjust page if deleting last item on current page
      if (items.length === 1 && currentPage > 1) {
        setCurrentPage((prev) => prev - 1);
      } else {
        await fetchData();
      }
    } catch (error: unknown) {
      toast.error(toMessage(error, `Failed to delete ${label}`));
    } finally {
      setDeleting(false);
    }
  }, [apiPath, label, selectedForDelete, items.length, currentPage, closeDeleteModal, fetchData]);

  const getCurrentPage = useCallback((pageNumber: number) => {
    setCurrentPage(pageNumber);
  }, []);

  return {
    items,
    totalCount,
    totalPages,
    currentPage,
    limit,
    loading,
    saving,
    deleting,
    search,
    setSearch,
    addName,
    setAddName,
    editOpen,
    editName,
    setEditName,
    showDeleteModal,
    submitAdd,
    clearAddForm,
    openEditModal,
    closeEditModal,
    submitEdit,
    openDeleteModal,
    closeDeleteModal,
    handleDelete,
    getCurrentPage,
    fetchData,
  };
}
