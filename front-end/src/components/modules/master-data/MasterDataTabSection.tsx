"use client";

import { useMemo } from "react";
import { Plus, Save, Search, RefreshCw } from "lucide-react";
import { useMasterData } from "@/hooks/master-data/useMasterData";
import { buildMasterDataColumns } from "./MasterDataColumns";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import Pagination from "@/components/reusable/Pagination";
import ReusableModal from "@/components/reusable/ReusableModal";
import ConfirmationModal from "@/components/reusable/ConfirmationModal";

type MasterDataTabSectionProps = {
  apiPath: string;
  label: string;
  placeholderName: string;
};

export default function MasterDataTabSection({
  apiPath,
  label,
  placeholderName,
}: MasterDataTabSectionProps) {
  const {
    items,
    totalCount,
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
  } = useMasterData(apiPath, label);

  const startIndex = (currentPage - 1) * limit;

  const columns = useMemo(
    () =>
      buildMasterDataColumns({
        onEdit: openEditModal,
        onDelete: openDeleteModal,
        startIndex,
      }),
    [openEditModal, openDeleteModal, startIndex]
  );

  return (
    <div className="space-y-4">
      {/* Add Form Section */}
      <section className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Add {label}
            </h2>
            <p className="text-sm text-zinc-500">
              Define a new {label.toLowerCase()} option for the visitor records.
            </p>
          </div>

          <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">
            <Plus className="mr-1 h-3.5 w-3.5" />
            {label} Configuration
          </span>
        </div>

        <form className="mt-4" onSubmit={submitAdd}>
          <div className="flex flex-col gap-3 sm:flex-row">
            <input
              value={addName}
              onChange={(event) => setAddName(event.target.value)}
              className="flex-1 rounded-lg border px-3 py-2 text-sm focus:border-zinc-500 focus:outline-hidden"
              placeholder={`Enter name (e.g. ${placeholderName})`}
              disabled={loading || saving}
              required
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearAddForm}
                disabled={saving}
                className="rounded-lg border px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
              >
                Clear
              </button>

              <button
                type="submit"
                disabled={loading || saving || !addName.trim()}
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
              >
                <Save className="mr-2 h-4 w-4" />
                {saving ? "Saving..." : `Add ${label}`}
              </button>
            </div>
          </div>
        </form>
      </section>

      {/* Inventory & Toolbar */}
      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold text-zinc-900">
              {label} List
            </div>
            <div className="text-sm text-zinc-500">
              Search, edit, and manage configured {label.toLowerCase()} entries.
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <div className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={`Search ${label.toLowerCase()}...`}
                className="w-full rounded-lg border px-9 py-2 text-sm focus:border-zinc-500 focus:outline-hidden"
              />
            </div>

            <button
              onClick={() => void fetchData()}
              type="button"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60 cursor-pointer"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* Table Section */}
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <div className="min-w-350">
          <TanstackDataTable
            data={items}
            columns={columns}
            loading={loading}
            headerCellClassName="whitespace-nowrap bg-zinc-50"
          />
        </div>
      </div>

      {/* Pagination Section */}
      {totalCount > 0 && (
        <div className="mt-4">
          <Pagination
            numberOfData={totalCount}
            limits={limit}
            getCurrentPage={getCurrentPage}
            searchText={search}
          />
        </div>
      )}

      {/* Edit Modal */}
      <ReusableModal
        open={editOpen}
        onClose={closeEditModal}
        title={`Edit ${label}`}
        maxWidth="lg"
      >
        <form onSubmit={submitEdit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider block">
              {label} Name
            </label>
            <input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm focus:border-zinc-500 focus:outline-hidden"
              placeholder={`Enter new ${label.toLowerCase()} name`}
              required
              disabled={saving}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeEditModal}
              disabled={saving}
              className="rounded-lg border px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !editName.trim()}
              className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60 cursor-pointer"
            >
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </ReusableModal>

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        open={showDeleteModal}
        onClose={closeDeleteModal}
        onConfirm={handleDelete}
        loading={deleting}
        title={`Delete ${label}?`}
        description={`This will permanently remove this ${label.toLowerCase()} configuration. Are you sure you want to continue?`}
      />
    </div>
  );
}
