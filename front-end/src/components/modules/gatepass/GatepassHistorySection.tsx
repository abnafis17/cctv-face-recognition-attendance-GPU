import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { History, ChevronDown, ChevronUp, Rows3 } from "lucide-react";

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
    <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden w-full border-t-4 border-t-indigo-500">
      
      {/* Collapsible Header */}
      <div
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-4 cursor-pointer select-none hover:bg-zinc-100/30 transition-colors"
      >
        <div className="flex items-center gap-2.5">
          <div className="h-5 w-5 rounded-md bg-indigo-50 flex items-center justify-center">
            <History className="h-4 w-4 text-indigo-600" />
          </div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Gatepass History Log</h2>
          {isCollapsed ? (
            <ChevronDown className="h-4 w-4 text-indigo-400 mt-0.5" />
          ) : (
            <ChevronUp className="h-4 w-4 text-indigo-400 mt-0.5" />
          )}
        </div>

        <Badge
          variant="secondary"
          className="rounded-full bg-indigo-50 text-indigo-700 font-semibold px-2.5 py-0.5 text-xs flex items-center gap-1.5 border border-indigo-100"
        >
          <Rows3 className="h-3.5 w-3.5 text-indigo-500" />
          <span>Total: {historyRows.length}</span>
        </Badge>
      </div>

      {!isCollapsed && (
        <div className="w-full flex flex-col animate-in fade-in-50 duration-200">
          
          {/* Filters Area */}
          <div className="p-5 pb-2">
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
          </div>

          {/* Table Area */}
          <div className="px-5 pb-5">
            <div className="min-h-[220px] w-full max-w-full overflow-hidden rounded-md border border-zinc-100 bg-white">
              <TanstackDataTable
                data={paginatedHistoryRows}
                columns={historyColumns}
                loading={historyLoading}
                className="w-full"
                freezeClassName="w-full max-w-full overflow-x-auto overflow-y-hidden rounded-none"
                emptyState="No gatepass records found for the selected criteria."
                getRowClassName={(row) => {
                  const rec = row.original;
                  if (rec.status !== "returned" && rec.returnTime && rec.rawOutTime) {
                    const outDate = new Date(rec.rawOutTime);
                    const diff = (Date.now() - outDate.getTime()) / (1000 * 60);
                    if (diff > rec.returnTime) {
                      return "bg-rose-50/70 hover:bg-rose-100/70 text-rose-950 transition-colors";
                    }
                  }
                  return "";
                }}
              />
            </div>
          </div>

          {/* Pagination */}
          {historyRows.length > 0 && (
            <div className="shrink-0 border-t border-zinc-100 bg-zinc-50/20 px-5 py-3.5">
              <Pagination
                numberOfData={historyRows.length}
                limits={pageLimit}
                getCurrentPage={setHistoryPage}
                activeTab2={historyPaginationResetKey}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
