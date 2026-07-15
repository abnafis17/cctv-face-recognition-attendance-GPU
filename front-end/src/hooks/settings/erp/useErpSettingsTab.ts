"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import axiosInstance, { API } from "@/config/axiosInstance";
import type {
  ErpApiRow,
  ErpSettingsResponse,
} from "@/components/modules/settings/types";
import { buildErpColumns } from "@/components/modules/settings/erp/erpColumns";
import {
  normalizeErpApiRow,
  searchMatchesErpRow,
} from "@/components/modules/settings/utils";

function toMessage(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

function asTrimmed(value: unknown): string {
  return String(value ?? "").trim();
}

export function useErpSettingsTab() {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<ErpApiRow[]>([]);

  const [addErpUrlType, setAddErpUrlType] = useState("");
  const [addErpBaseUrl, setAddErpBaseUrl] = useState("");
  const [addErpPrefix, setAddErpPrefix] = useState("");
  const [addErpAttendanceEndpoint, setAddErpAttendanceEndpoint] = useState("");
  const [addErpIsActive, setAddErpIsActive] = useState(true);

  const [editOpen, setEditOpen] = useState(false);
  const [editRow, setEditRow] = useState<ErpApiRow | null>(null);
  const [editErpUrlType, setEditErpUrlType] = useState("");
  const [editErpBaseUrl, setEditErpBaseUrl] = useState("");
  const [editErpPrefix, setEditErpPrefix] = useState("");
  const [editErpAttendanceEndpoint, setEditErpAttendanceEndpoint] =
    useState("");
  const [editErpIsActive, setEditErpIsActive] = useState(true);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [selectedForDelete, setSelectedForDelete] = useState<ErpApiRow | null>(
    null,
  );

  const fetchErpSettings = useCallback(async () => {
    try {
      setLoading(true);
      const res = await axiosInstance.get<ErpSettingsResponse[]>(
        API.SETTINGS_ERP,
        {
          params: { all: true },
        },
      );
      const nextRows = Array.isArray(res?.data)
        ? res.data
            .map((item) => normalizeErpApiRow(item))
            .filter((row): row is ErpApiRow => row !== null)
        : [];
      setRows(nextRows);
    } catch (error: unknown) {
      toast.error(toMessage(error, "Failed to load ERP URLs"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchErpSettings();
  }, [fetchErpSettings]);

  const clearAddForm = useCallback(() => {
    setAddErpUrlType("");
    setAddErpBaseUrl("");
    setAddErpPrefix("");
    setAddErpAttendanceEndpoint("");
    setAddErpIsActive(true);
  }, []);

  const submitAdd = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const urlType = asTrimmed(addErpUrlType);
      const erpBaseUrl = asTrimmed(addErpBaseUrl);
      const erpPrefix = asTrimmed(addErpPrefix);
      const erpAttendanceEndpoint = asTrimmed(addErpAttendanceEndpoint);

      if (!erpBaseUrl && !erpPrefix && !erpAttendanceEndpoint) {
        toast.error("Enter at least one ERP field");
        return;
      }

      try {
        setSaving(true);
        await axiosInstance.post(API.SETTINGS_ERP, {
          urlType: urlType || undefined,
          erpBaseUrl,
          erpPrefix,
          erpAttendanceEndpoint,
          isActive: addErpIsActive,
        });
        toast.success("ERP URLs added");
        clearAddForm();
        await fetchErpSettings();
      } catch (error: unknown) {
        toast.error(toMessage(error, "Failed to save ERP URLs"));
      } finally {
        setSaving(false);
      }
    },
    [
      addErpAttendanceEndpoint,
      addErpBaseUrl,
      addErpPrefix,
      addErpUrlType,
      addErpIsActive,
      clearAddForm,
      fetchErpSettings,
    ],
  );

  const openEditModal = useCallback((row: ErpApiRow) => {
    setEditRow(row);
    setEditErpUrlType(row.urlType ?? "");
    setEditErpBaseUrl(row.erpBaseUrl ?? "");
    setEditErpPrefix(row.erpPrefix ?? "");
    setEditErpAttendanceEndpoint(row.erpAttendanceEndpoint ?? "");
    setEditErpIsActive(row.isActive ?? true);
    setEditOpen(true);
  }, []);

  const closeEditModal = useCallback(() => {
    setEditOpen(false);
    setEditRow(null);
    setEditErpUrlType("");
    setEditErpBaseUrl("");
    setEditErpPrefix("");
    setEditErpAttendanceEndpoint("");
    setEditErpIsActive(true);
  }, []);

  const submitEdit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!editRow) return;

      const urlType = asTrimmed(editErpUrlType);
      const erpBaseUrl = asTrimmed(editErpBaseUrl);
      const erpPrefix = asTrimmed(editErpPrefix);
      const erpAttendanceEndpoint = asTrimmed(editErpAttendanceEndpoint);

      if (!erpBaseUrl && !erpPrefix && !erpAttendanceEndpoint) {
        toast.error("Use Delete if you want to remove all ERP settings");
        return;
      }

      const nextUrlType = urlType || editRow.urlType || undefined;

      try {
        setSaving(true);
        await axiosInstance.patch(API.SETTINGS_ERP, {
          id: editRow.id,
          urlType: nextUrlType,
          erpBaseUrl,
          erpPrefix,
          erpAttendanceEndpoint,
          isActive: editErpIsActive,
        });
        toast.success("ERP URLs updated");
        closeEditModal();
        await fetchErpSettings();
      } catch (error: unknown) {
        toast.error(toMessage(error, "Failed to update ERP URLs"));
      } finally {
        setSaving(false);
      }
    },
    [
      closeEditModal,
      editErpAttendanceEndpoint,
      editErpBaseUrl,
      editErpPrefix,
      editErpUrlType,
      editErpIsActive,
      editRow,
      fetchErpSettings,
    ],
  );

  const openDeleteModal = useCallback((row: ErpApiRow) => {
    setSelectedForDelete(row);
    setShowDeleteModal(true);
  }, []);

  const closeDeleteModal = useCallback(() => {
    setShowDeleteModal(false);
    setSelectedForDelete(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!selectedForDelete) return;
    try {
      setDeleting(true);
      await axiosInstance.delete(API.SETTINGS_ERP, {
        data: { id: selectedForDelete.id },
      });
      toast.success("ERP URLs deleted");
      setShowDeleteModal(false);
      setSelectedForDelete(null);
      await fetchErpSettings();
    } catch (error: unknown) {
      toast.error(toMessage(error, "Failed to delete ERP URLs"));
    } finally {
      setDeleting(false);
    }
  }, [fetchErpSettings, selectedForDelete]);

  const filteredRows = useMemo(
    () => rows.filter((row) => searchMatchesErpRow(row, search)),
    [rows, search],
  );

  const columns = useMemo(
    () =>
      buildErpColumns({
        onEdit: openEditModal,
        onDelete: openDeleteModal,
      }),
    [openDeleteModal, openEditModal],
  );

  const totalEntries = rows.length;
  const baseConfigured = rows.filter((row) =>
    Boolean(asTrimmed(row.erpBaseUrl)),
  ).length;
  const prefixConfigured = rows.filter((row) =>
    Boolean(asTrimmed(row.erpPrefix)),
  ).length;
  const endpointConfigured = rows.filter((row) =>
    Boolean(asTrimmed(row.erpAttendanceEndpoint)),
  ).length;

  const statCards = [
    { label: "Total Entries", value: totalEntries, tone: "text-zinc-900" },
    { label: "Base URL Set", value: baseConfigured, tone: "text-emerald-700" },
    {
      label: "Prefix Set (Optional)",
      value: prefixConfigured,
      tone: "text-sky-700",
    },
    {
      label: "Endpoint Set",
      value: endpointConfigured,
      tone: "text-amber-700",
    },
  ];

  return {
    loading,
    saving,
    deleting,
    search,
    setSearch,
    rows,

    addErpUrlType,
    setAddErpUrlType,
    addErpBaseUrl,
    setAddErpBaseUrl,
    addErpPrefix,
    setAddErpPrefix,
    addErpAttendanceEndpoint,
    setAddErpAttendanceEndpoint,
    addErpIsActive,
    setAddErpIsActive,

    editOpen,
    editRow,
    editErpUrlType,
    setEditErpUrlType,
    editErpBaseUrl,
    setEditErpBaseUrl,
    editErpPrefix,
    setEditErpPrefix,
    editErpAttendanceEndpoint,
    setEditErpAttendanceEndpoint,
    editErpIsActive,
    setEditErpIsActive,

    showDeleteModal,
    selectedForDelete,

    setShowDeleteModal,
    setSelectedForDelete,

    fetchErpSettings,
    clearAddForm,
    submitAdd,

    openEditModal,
    closeEditModal,
    submitEdit,

    openDeleteModal,
    closeDeleteModal,
    handleDelete,

    filteredRows,
    columns,
    statCards,

    asTrimmed,
  };
}
