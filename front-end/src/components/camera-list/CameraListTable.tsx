"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { RefreshCw, Search } from "lucide-react";
import toast from "react-hot-toast";
import axiosInstance, { API } from "@/config/axiosInstance";
import type { Camera } from "@/types";
import { useModal } from "@/hooks/useModal";
import { TanstackDataTable } from "../reusable/TanstackDataTable";
import ReusableModal from "../reusable/ReusableModal";
import ConfirmationModal from "../reusable/ConfirmationModal";
import CameraEditForm from "./CameraEditForm";
import CameraListStats from "./CameraListStats";
import AddCameraForm from "./AddCameraForm";
import { buildCameraColumns } from "./cameraColumns";
import type { CameraRow, CameraUpdatePayload } from "./types";
import { normalizeCameraRow, searchMatchesCamera } from "./utils";

function normalizeApiError(error: unknown, fallback: string): string {
  const anyError = error as any;
  return (
    anyError?.response?.data?.error ||
    anyError?.response?.data?.message ||
    anyError?.message ||
    fallback
  );
}

const CameraListTable = () => {
  const { isOpen, open, close } = useModal();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [cameras, setCameras] = useState<CameraRow[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<CameraRow | null>(null);
  const [selectedForDelete, setSelectedForDelete] = useState<CameraRow | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const fetchCameras = useCallback(async () => {
    try {
      setLoading(true);
      const response = await axiosInstance.get<Camera[]>(API.CAMERAS, {
        params: { includeVirtual: 1 },
      });

      const rows = Array.isArray(response.data)
        ? response.data.map(normalizeCameraRow)
        : [];

      setCameras(rows);
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to load cameras"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCameras();
  }, [fetchCameras]);

  const filteredCameras = useMemo(
    () => cameras.filter((camera) => searchMatchesCamera(camera, search)),
    [cameras, search]
  );

  const handleEditClick = useCallback(
    (camera: CameraRow) => {
      setSelectedCamera({ ...camera });
      open();
    },
    [open]
  );

  const handleDeleteClick = useCallback((camera: CameraRow) => {
    setSelectedForDelete(camera);
    setShowDeleteModal(true);
  }, []);

  const handleModalClose = useCallback(() => {
    setSelectedCamera(null);
    close();
  }, [close]);

  const handleUpdateCamera = useCallback(
    async (payload: CameraUpdatePayload) => {
      if (!selectedCamera) return;

      try {
        setSaving(true);
        await axiosInstance.patch(`${API.CAMERAS}/${selectedCamera.id}`, payload);
        toast.success("Camera updated successfully");
        await fetchCameras();
        handleModalClose();
      } catch (error: unknown) {
        toast.error(normalizeApiError(error, "Failed to update camera"));
      } finally {
        setSaving(false);
      }
    },
    [fetchCameras, handleModalClose, selectedCamera]
  );

  const handleDeleteCamera = useCallback(async () => {
    if (!selectedForDelete) return;

    try {
      setDeleting(true);
      await axiosInstance.delete(`${API.CAMERAS}/${selectedForDelete.id}`);
      toast.success("Camera deleted successfully");
      await fetchCameras();
      setShowDeleteModal(false);
      setSelectedForDelete(null);
    } catch (error: unknown) {
      toast.error(normalizeApiError(error, "Failed to delete camera"));
    } finally {
      setDeleting(false);
    }
  }, [fetchCameras, selectedForDelete]);

  const columns = useMemo(
    () =>
      buildCameraColumns({
        onEdit: handleEditClick,
        onDelete: handleDeleteClick,
      }),
    [handleDeleteClick, handleEditClick]
  );

  return (
    <div className="space-y-4">
      <CameraListStats cameras={cameras} />
      <AddCameraForm onAdded={fetchCameras} />

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold text-zinc-900">Camera Inventory</div>
            <div className="text-sm text-zinc-500">
              Search, edit, and manage all company cameras in one place.
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <div className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, camera id, DB id, RTSP..."
                className="w-full rounded-lg border px-9 py-2 text-sm"
              />
            </div>

            <button
              onClick={fetchCameras}
              type="button"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="min-w-[1980px]">
          <TanstackDataTable
            data={filteredCameras}
            columns={columns}
            loading={loading}
            headerCellClassName="whitespace-nowrap bg-zinc-50"
          />
        </div>
      </div>

      <ReusableModal
        open={isOpen}
        onClose={handleModalClose}
        title="Edit Camera"
        maxWidth="3xl"
        overflowAuto
      >
        <CameraEditForm
          selectedCamera={selectedCamera}
          setSelectedCamera={setSelectedCamera}
          loading={saving}
          onClose={handleModalClose}
          onSave={handleUpdateCamera}
        />
      </ReusableModal>

      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedForDelete(null);
        }}
        onConfirm={handleDeleteCamera}
        loading={deleting}
        title="Delete camera?"
        description="This action will permanently remove this camera configuration from your company."
      />
    </div>
  );
};

export default CameraListTable;
