import { Save } from "lucide-react";

type ErpFormSectionProps = {
  addErpUrlType: string;
  setAddErpUrlType: React.Dispatch<React.SetStateAction<string>>;
  addErpBaseUrl: string;
  setAddErpBaseUrl: React.Dispatch<React.SetStateAction<string>>;
  addErpPrefix: string;
  setAddErpPrefix: React.Dispatch<React.SetStateAction<string>>;
  addErpAttendanceEndpoint: string;
  setAddErpAttendanceEndpoint: React.Dispatch<React.SetStateAction<string>>;
  addErpIsActive: boolean;
  setAddErpIsActive: React.Dispatch<React.SetStateAction<boolean>>;
  loading: boolean;
  saving: boolean;
  submitAdd: (event: React.FormEvent<HTMLFormElement>) => void;
  clearAddForm: () => void;
  asTrimmed: (value: unknown) => string;
};

export function ErpFormSection({
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
  loading,
  saving,
  submitAdd,
  clearAddForm,
  asTrimmed,
}: ErpFormSectionProps) {
  return (
    <section className="rounded-xl border bg-white p-4 shadow-sm">
      <form className="mt-4" onSubmit={submitAdd}>
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
          <input
            value={addErpUrlType}
            onChange={(event) => setAddErpUrlType(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="URL Type (optional, default: attendance)"
            disabled={loading || saving}
          />
          <input
            value={addErpBaseUrl}
            onChange={(event) => setAddErpBaseUrl(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="ERP Base URL"
            disabled={loading || saving}
          />
          <input
            value={addErpPrefix}
            onChange={(event) => setAddErpPrefix(event.target.value)}
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder="ERP Prefix"
            disabled={loading || saving}
          />
          <input
            value={addErpAttendanceEndpoint}
            onChange={(event) =>
              setAddErpAttendanceEndpoint(event.target.value)
            }
            className="rounded-lg border px-3 py-2 text-sm"
            placeholder={
              !addErpUrlType
                ? "ERP Attendance Endpoint"
                : addErpUrlType.toLowerCase().includes("employee")
                ? "ERP Employee Endpoint (e.g. /Employee/GetAllEMployeelists)"
                : addErpUrlType.toLowerCase().includes("gatepass")
                ? `ERP ${addErpUrlType.toUpperCase()} Endpoint`
                : `ERP ${addErpUrlType} Endpoint`
            }
            disabled={loading || saving}
          />
          <div className="lg:col-span-4 flex items-center gap-2 px-1 py-1">
            <label className="flex items-center gap-2 text-sm font-medium text-zinc-700 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={addErpIsActive}
                onChange={(event) => setAddErpIsActive(event.target.checked)}
                disabled={loading || saving}
                className="h-4 w-4 rounded border-zinc-300 text-zinc-950 focus:ring-zinc-950"
              />
              Active (Enable this ERP configuration)
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={clearAddForm}
            disabled={saving}
            className="rounded-lg border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60"
          >
            Clear
          </button>
          <button
            type="submit"
            disabled={
              loading ||
              saving ||
              (!asTrimmed(addErpBaseUrl) &&
                !asTrimmed(addErpPrefix) &&
                !asTrimmed(addErpAttendanceEndpoint))
            }
            className="inline-flex items-center rounded-lg bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-60"
          >
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving..." : "Add URLs"}
          </button>
        </div>
      </form>
    </section>
  );
}
