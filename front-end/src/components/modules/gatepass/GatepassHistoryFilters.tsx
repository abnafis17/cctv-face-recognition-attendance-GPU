import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { GatepassLeaveTypeOption } from "@/types/gatepass-types";

type Props = {
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
  resetHistoryFilters: () => void;
  fetchHistoryRecords: (silent?: boolean) => Promise<void>;
};

export default function GatepassHistoryFilters({
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
  resetHistoryFilters,
  fetchHistoryRecords,
}: Props) {
  return (
    <div className="border-b border-zinc-100 bg-white px-4 pb-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 xl:gap-2.5">
        <div className="min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-2 xl:col-span-4">
          <label className="text-[11px] font-medium text-zinc-500">
            Search
          </label>
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search by employee name or ID"
            className="h-10 rounded-xl border-zinc-100 bg-white"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-medium text-zinc-500">
            From Date
          </label>
          <input
            type="date"
            value={historyFromDate}
            onChange={(event) => setHistoryFromDate(event.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-100 bg-white px-3 text-sm text-zinc-900 outline-none"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-medium text-zinc-500">
            To Date
          </label>
          <input
            type="date"
            value={historyToDate}
            onChange={(event) => setHistoryToDate(event.target.value)}
            className="h-10 w-full rounded-xl border border-zinc-100 bg-white px-3 text-sm text-zinc-900 outline-none"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-medium text-zinc-500">
            Leave Type
          </label>
          <Select
            value={historyLeaveTypeId || "all"}
            onValueChange={(value) =>
              setHistoryLeaveTypeId(value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="h-10 w-full rounded-xl border-zinc-100 bg-white text-sm text-zinc-900">
              <SelectValue placeholder="All leave types" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">All Leave Types</SelectItem>
              {gatepassLeaveTypes.map((leaveType) => (
                <SelectItem key={leaveType.id} value={leaveType.id}>
                  {leaveType.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="grid grid-cols-2 items-end gap-2 sm:col-span-2 xl:col-span-2 xl:self-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl border-zinc-100 bg-white text-zinc-700"
            onClick={resetHistoryFilters}
          >
            Today
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl border-zinc-100 bg-white text-zinc-700"
            onClick={() => {
              void fetchHistoryRecords();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {historyError ? (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {historyError}
        </div>
      ) : null}
    </div>
  );
}
