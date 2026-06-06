import type { ColumnDef } from "@tanstack/react-table";
import { Rows3 } from "lucide-react";

import Pagination from "@/components/reusable/Pagination";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import { Badge } from "@/components/ui/badge";

import type {
  GatepassLeaveTypeOption,
  GatepassRecord,
} from "@/types/gatepass-types";
import GatepassHistoryFilters from "./GatepassHistoryFilters";

type Props = {
  historyRows: GatepassRecord[];
  paginatedHistoryRows: GatepassRecord[];
  historyColumns: ColumnDef<GatepassRecord>[];
  historyLoading: boolean;
  historyPaginationResetKey: string;
  historySearch: string;
  historyFromDate: string;
  historyToDate: string;
  historyLeaveTypeId: string;
  gatepassLeaveTypes: GatepassLeaveTypeOption[];
  historyError: string;
  setHistorySearch: React.Dispatch<React.SetStateAction<string>>;
  setHistoryFromDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryToDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryLeaveTypeId: React.Dispatch<React.SetStateAction<string>>;
  setHistoryPage: React.Dispatch<React.SetStateAction<number>>;
  resetHistoryFilters: () => void;
  fetchHistoryRecords: (silent?: boolean) => Promise<void>;
  pageLimit: number;
};

export default function GatepassHistorySection({
  historyRows,
  paginatedHistoryRows,
  historyColumns,
  historyLoading,
  historyPaginationResetKey,
  historySearch,
  historyFromDate,
  historyToDate,
  historyLeaveTypeId,
  gatepassLeaveTypes,
  historyError,
  setHistorySearch,
  setHistoryFromDate,
  setHistoryToDate,
  setHistoryLeaveTypeId,
  setHistoryPage,
  resetHistoryFilters,
  fetchHistoryRecords,
  pageLimit,
}: Props) {
  return (
    <section className="flex min-w-0 flex-none flex-col border-t border-zinc-100 bg-white xl:min-h-0 xl:flex-1">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-base font-semibold text-zinc-900">
            Gatepass History
          </div>
        </div>

        <Badge
          variant="outline"
          className="rounded-full border-zinc-100 bg-white text-zinc-700"
        >
          <Rows3 className="h-3.5 w-3.5" />
          Total {historyRows.length}
        </Badge>
      </div>

      <GatepassHistoryFilters
        historySearch={historySearch}
        historyFromDate={historyFromDate}
        historyToDate={historyToDate}
        historyLeaveTypeId={historyLeaveTypeId}
        gatepassLeaveTypes={gatepassLeaveTypes}
        historyError={historyError}
        setHistorySearch={setHistorySearch}
        setHistoryFromDate={setHistoryFromDate}
        setHistoryToDate={setHistoryToDate}
        setHistoryLeaveTypeId={setHistoryLeaveTypeId}
        resetHistoryFilters={resetHistoryFilters}
        fetchHistoryRecords={fetchHistoryRecords}
      />

      <div className="min-w-0 px-4 pt-3 pb-4">
        <div className="min-h-[220px] w-full max-w-full overflow-hidden rounded-2xl border border-zinc-100 bg-white">
          <TanstackDataTable
            data={paginatedHistoryRows}
            columns={historyColumns}
            loading={historyLoading}
            className="w-full"
            freezeClassName="w-full max-w-full overflow-x-auto overflow-y-hidden rounded-none"
            emptyState="No gatepass records found in the database."
          />
        </div>
      </div>

      {historyRows.length ? (
        <div className="shrink-0 border-t border-zinc-100 bg-white px-4 py-3">
          <Pagination
            numberOfData={historyRows.length}
            limits={pageLimit}
            getCurrentPage={setHistoryPage}
            activeTab2={historyPaginationResetKey}
          />
        </div>
      ) : null}
    </section>
  );
}
