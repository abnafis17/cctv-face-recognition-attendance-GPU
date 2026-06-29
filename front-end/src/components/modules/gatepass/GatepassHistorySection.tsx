import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { Rows3, ChevronDown, ChevronUp } from "lucide-react";

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
  historyLeaveTypeCategory: "all" | "short" | "long";
  historyPurposeId: string;
  gatepassLeaveTypes: GatepassLeaveTypeOption[];
  historyError: string;
  setHistorySearch: React.Dispatch<React.SetStateAction<string>>;
  setHistoryFromDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryToDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryLeaveTypeCategory: React.Dispatch<React.SetStateAction<"all" | "short" | "long">>;
  setHistoryPurposeId: React.Dispatch<React.SetStateAction<string>>;
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
  historyLeaveTypeCategory,
  historyPurposeId,
  gatepassLeaveTypes,
  historyError,
  setHistorySearch,
  setHistoryFromDate,
  setHistoryToDate,
  setHistoryLeaveTypeCategory,
  setHistoryPurposeId,
  setHistoryPage,
  resetHistoryFilters,
  fetchHistoryRecords,
  pageLimit,
}: Props) {
  const [isCollapsed, setIsCollapsed] = useState(true);

  return (
    <section className="flex min-w-0 flex-none flex-col border-t border-zinc-100 bg-white lg:min-h-0 lg:flex-1">
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex w-full cursor-pointer select-none hover:bg-zinc-50/50 transition-colors border-b border-zinc-100/60"
      >
        <div className="w-full flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0 flex items-center gap-2">
            <div className="text-sm font-semibold text-zinc-800">
              Gatepass History
            </div>
            {isCollapsed ? (
              <ChevronDown className="h-4.5 w-4.5 text-zinc-500" />
            ) : (
              <ChevronUp className="h-4.5 w-4.5 text-zinc-500" />
            )}
          </div>

          <Badge
            variant="outline"
            className="rounded-full border-zinc-100 bg-white text-zinc-700 w-fit"
          >
            <Rows3 className="h-3.5 w-3.5" />
            Total {historyRows.length}
          </Badge>
        </div>
      </div>

      {!isCollapsed && (
        <div className="w-full flex flex-col">
          <GatepassHistoryFilters
            historySearch={historySearch}
            historyFromDate={historyFromDate}
            historyToDate={historyToDate}
            historyLeaveTypeCategory={historyLeaveTypeCategory}
            historyPurposeId={historyPurposeId}
            gatepassLeaveTypes={gatepassLeaveTypes}
            historyError={historyError}
            setHistorySearch={setHistorySearch}
            setHistoryFromDate={setHistoryFromDate}
            setHistoryToDate={setHistoryToDate}
            setHistoryLeaveTypeCategory={setHistoryLeaveTypeCategory}
            setHistoryPurposeId={setHistoryPurposeId}
            resetHistoryFilters={resetHistoryFilters}
            fetchHistoryRecords={fetchHistoryRecords}
          />

          <div className="min-w-0 px-4 pt-2 pb-4">
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
        </div>
      )}
    </section>
  );
}
