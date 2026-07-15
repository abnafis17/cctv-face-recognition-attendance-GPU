import { Save } from "lucide-react";

type ErpEditFormProps = {
  editErpUrlType: string;
  setEditErpUrlType: React.Dispatch<React.SetStateAction<string>>;
  editErpBaseUrl: string;
  setEditErpBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  editErpPrefix: string;
  setEditErpPrefix: React.Dispatch<React.SetStateAction<string>>;
  editErpAttendanceEndpoint: string;
  setEditErpAttendanceEndpoint: React.Dispatch<React.SetStateAction<string>>;
  editErpIsActive: boolean;
  setEditErpIsActive: React.Dispatch<React.SetStateAction<boolean>>;
  saving: boolean;
  submitEdit: (event: React.FormEvent<HTMLFormElement>) => void;
  closeEditModal: () => void;
};

export function ErpEditForm({
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
  saving,
  submitEdit,
  closeEditModal,
}: ErpEditFormProps) {
  return (
    <form className="space-y-3" onSubmit={submitEdit}>
      <div className="space-y-1.5">
        <label
          htmlFor="edit-erp-url-type"
          className="text-sm font-medium text-zinc-900"
        >
          URL Type
        </label>
        <input
          id="edit-erp-url-type"
          value={editErpUrlType}
          onChange={(event) => setEditErpUrlType(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="attendance"
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="edit-erp-base-url"
          className="text-sm font-medium text-zinc-900"
        >
          ERP Base URL
        </label>
        <input
          id="edit-erp-base-url"
          value={editErpBaseUrl}
          onChange={(event) => setEditErpBaseUrl(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="http://172.20.60.101:7001"
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="edit-erp-prefix"
          className="text-sm font-medium text-zinc-900"
        >
          ERP Prefix
        </label>
        <input
          id="edit-erp-prefix"
          value={editErpPrefix}
          onChange={(event) => setEditErpPrefix(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="/api/v2"
          disabled={saving}
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="edit-erp-endpoint"
          className="text-sm font-medium text-zinc-900"
        >
          {!editErpUrlType
            ? "ERP Attendance Endpoint"
            : editErpUrlType.toLowerCase().includes("employee")
            ? "ERP Employee Endpoint"
            : editErpUrlType.toLowerCase().includes("gatepass")
            ? `ERP ${editErpUrlType.toUpperCase()} Endpoint`
            : `ERP ${editErpUrlType} Endpoint`}
        </label>
        <input
          id="edit-erp-endpoint"
          value={editErpAttendanceEndpoint}
          onChange={(event) => setEditErpAttendanceEndpoint(event.target.value)}
          className="w-full rounded-lg border px-3 py-2 text-sm"
          placeholder={
            !editErpUrlType
              ? "/Attendance/manual-attendance"
              : editErpUrlType.toLowerCase().includes("employee")
              ? "/Employee/GetAllEMployeelists"
              : editErpUrlType.toLowerCase().includes("gatepass")
              ? "/GatePass/SaveAPGatePass"
              : "/endpoint-path"
          }
          disabled={saving}
        />
      </div>

      <div className="flex items-center gap-2 py-1">
        <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={editErpIsActive}
            onChange={(event) => setEditErpIsActive(event.target.checked)}
            disabled={saving}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
          />
          Active (Enable this ERP configuration)
        </label>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={closeEditModal}
          className="rounded-lg border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          disabled={saving}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          disabled={saving}
        >
          <Save className="mr-2 h-4 w-4" />
          {saving ? "Saving..." : "Save Changes"}
        </button>
      </div>
    </form>
  );
}
