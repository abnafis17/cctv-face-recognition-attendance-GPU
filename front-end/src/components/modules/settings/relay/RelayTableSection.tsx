import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import { ColumnDef } from "@tanstack/react-table";

type RelayTableSectionProps<TData, TValue> = {
  filteredRows: TData[];
  columns: ColumnDef<TData, TValue>[];
  loading: boolean;
};

export function RelayTableSection<TData, TValue>({
  filteredRows,
  columns,
  loading,
}: RelayTableSectionProps<TData, TValue>) {
  return (
    <div className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <TanstackDataTable
        data={filteredRows}
        columns={columns}
        loading={loading}
        headerCellClassName="whitespace-nowrap bg-zinc-50"
      />
    </div>
  );
}
