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
  historyLeaveTypeCategory: "all" | "short" | "long";
  historyPurposeId: string;
  gatepassLeaveTypes: GatepassLeaveTypeOption[];
  historyError: string;
  setHistorySearch: React.Dispatch<React.SetStateAction<string>>;
  setHistoryFromDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryToDate: React.Dispatch<React.SetStateAction<string>>;
  setHistoryLeaveTypeCategory: React.Dispatch<React.SetStateAction<"all" | "short" | "long">>;
  setHistoryPurposeId: React.Dispatch<React.SetStateAction<string>>;
  resetHistoryFilters: () => void;
  fetchHistoryRecords: (silent?: boolean) => Promise<void>;
};

export default function GatepassHistoryFilters({
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
  resetHistoryFilters,
  fetchHistoryRecords,
}: Props) {
  const isShortSelected = historyLeaveTypeCategory === "short";

  return (
    <div className="w-full">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-12 xl:gap-3">
        <div className={`min-w-0 space-y-1.5 sm:col-span-2 lg:col-span-2 ${isShortSelected ? "xl:col-span-2" : "xl:col-span-4"}`}>
          <label className="text-[11px] font-semibold text-zinc-450">
            Search
          </label>
          <Input
            value={historySearch}
            onChange={(event) => setHistorySearch(event.target.value)}
            placeholder="Search by employee name or ID"
            className="h-10 rounded-md border-zinc-200 bg-white shadow-none hover:border-zinc-300 focus-visible:ring-1 focus-visible:ring-zinc-400 focus-visible:ring-offset-0 transition-colors"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-semibold text-zinc-450">
            From Date
          </label>
          <input
            type="date"
            value={historyFromDate}
            onChange={(event) => setHistoryFromDate(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-700 outline-none hover:border-zinc-300 focus:ring-1 focus:ring-zinc-450 transition-all"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-semibold text-zinc-450">
            To Date
          </label>
          <input
            type="date"
            value={historyToDate}
            onChange={(event) => setHistoryToDate(event.target.value)}
            className="h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-xs text-zinc-700 outline-none hover:border-zinc-300 focus:ring-1 focus:ring-zinc-450 transition-all"
          />
        </div>

        <div className="min-w-0 space-y-1.5 xl:col-span-2">
          <label className="text-[11px] font-semibold text-zinc-450">
            Leave Type
          </label>
          <Select
            value={historyLeaveTypeCategory}
            onValueChange={(value: "all" | "short" | "long") => {
              setHistoryLeaveTypeCategory(value);
              // Reset purpose selector if not short leave
              if (value !== "short") {
                setHistoryPurposeId("all");
              }
            }}
          >
            <SelectTrigger className="h-10 w-full rounded-md border-zinc-200 bg-white text-xs text-zinc-700 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors">
              <SelectValue placeholder="All leave types" />
            </SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all" className="text-xs">All Leave Types</SelectItem>
              <SelectItem value="short" className="text-xs">Short Leave</SelectItem>
              <SelectItem value="long" className="text-xs">Long Leave</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isShortSelected && (
          <div className="min-w-0 space-y-1.5 xl:col-span-2">
            <label className="text-[11px] font-semibold text-zinc-450">
              Purpose
            </label>
            <Select
              value={historyPurposeId}
              onValueChange={setHistoryPurposeId}
            >
              <SelectTrigger className="h-10 w-full rounded-md border-zinc-200 bg-white text-xs text-zinc-700 shadow-none hover:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-400 transition-colors">
                <SelectValue placeholder="All purposes" />
              </SelectTrigger>
              <SelectContent align="start">
                <SelectItem value="all" className="text-xs">All Purposes</SelectItem>
                {gatepassLeaveTypes.map((leaveType) => (
                  <SelectItem key={leaveType.id} value={leaveType.id} className="text-xs">
                    {leaveType.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="grid grid-cols-2 items-end gap-2.5 sm:col-span-2 xl:col-span-2 xl:self-end">
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-md border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 hover:text-zinc-800 transition-all text-xs font-semibold uppercase tracking-wider"
            onClick={resetHistoryFilters}
          >
            Today
          </Button>

          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-md border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 hover:text-zinc-800 transition-all text-xs font-semibold uppercase tracking-wider"
            onClick={() => {
              void fetchHistoryRecords();
            }}
          >
            Refresh
          </Button>
        </div>
      </div>

      {historyError && (
        <div className="mt-3.5 rounded-md border border-red-100 bg-red-50/50 px-3.5 py-2.5 text-xs text-red-750">
          {historyError}
        </div>
      )}
    </div>
  );
}
