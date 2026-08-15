"use client";

import { RefreshCw, Search } from "lucide-react";

import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import ReusableModal from "@/components/reusable/ReusableModal";
import ConfirmationModal from "@/components/reusable/ConfirmationModal";
import { useErpSettingsTab } from "@/hooks/settings/erp/useErpSettingsTab";
import { ErpStatCards } from "./ErpStatCards";
import { ErpFormSection } from "./ErpFormSection";
import { ErpEditForm } from "./ErpEditForm";

export default function ErpSettingsTab() {
  const {
    loading,
    saving,
    deleting,
    search,
    setSearch,
    statCards,
    addErpUrlType,
    setAddErpUrlType,
    addErpBaseUrl,
    setAddErpBaseUrl,
    addErpPrefix,
    setAddErpPrefix,
    addErpAttendanceEndpoint,
    setAddErpAttendanceEndpoint,
    editOpen,
    editErpUrlType,
    setEditErpUrlType,
    editErpBaseUrl,
    setEditErpBaseUrl,
    editErpPrefix,
    setEditErpPrefix,
    editErpAttendanceEndpoint,
    setEditErpAttendanceEndpoint,
    showDeleteModal,
    setShowDeleteModal,
    setSelectedForDelete,
    fetchErpSettings,
    clearAddForm,
    submitAdd,
    closeEditModal,
    submitEdit,
    handleDelete,
    filteredRows,
    columns,
    asTrimmed,
  } = useErpSettingsTab();

  return (
    <>
      <ErpStatCards statCards={statCards} />

      <ErpFormSection
        addErpUrlType={addErpUrlType}
        setAddErpUrlType={setAddErpUrlType}
        addErpBaseUrl={addErpBaseUrl}
        setAddErpBaseUrl={setAddErpBaseUrl}
        addErpPrefix={addErpPrefix}
        setAddErpPrefix={setAddErpPrefix}
        addErpAttendanceEndpoint={addErpAttendanceEndpoint}
        setAddErpAttendanceEndpoint={setAddErpAttendanceEndpoint}
        loading={loading}
        saving={saving}
        submitAdd={submitAdd}
        clearAddForm={clearAddForm}
        asTrimmed={asTrimmed}
      />

      <div className="rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-base font-semibold text-zinc-900">
              ERP URL Inventory
            </div>
            <div className="text-sm text-zinc-500">
              Search, edit, and manage company ERP URL configuration.
            </div>
          </div>

          <div className="flex w-full flex-col gap-2 sm:flex-row md:w-auto">
            <div className="relative w-full sm:w-[320px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search ERP URLs..."
                className="w-full rounded-lg border px-9 py-2 text-sm"
              />
            </div>

            <button
              onClick={() => void fetchErpSettings()}
              type="button"
              disabled={loading}
              className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-sm font-medium hover:bg-zinc-50 disabled:opacity-60"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
        <TanstackDataTable
          data={filteredRows}
          columns={columns}
          loading={loading}
          headerCellClassName="whitespace-nowrap bg-zinc-50"
        />
      </div>

      <ReusableModal
        open={editOpen}
        onClose={closeEditModal}
        title="Edit ERP URLs"
        maxWidth="2xl"
      >
        <ErpEditForm
          editErpUrlType={editErpUrlType}
          setEditErpUrlType={setEditErpUrlType}
          editErpBaseUrl={editErpBaseUrl}
          setEditErpBaseUrl={setEditErpBaseUrl}
          editErpPrefix={editErpPrefix}
          setEditErpPrefix={setEditErpPrefix}
          editErpAttendanceEndpoint={editErpAttendanceEndpoint}
          setEditErpAttendanceEndpoint={setEditErpAttendanceEndpoint}
          saving={saving}
          submitEdit={submitEdit}
          closeEditModal={closeEditModal}
        />
      </ReusableModal>

      <ConfirmationModal
        open={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setSelectedForDelete(null);
        }}
        onConfirm={handleDelete}
        loading={deleting}
        title="Delete ERP URLs?"
        description="This will remove company ERP URL settings. Attendance and recognition will continue, but ERP push will be skipped."
      />
    </>
  );
}
