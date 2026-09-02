"use client";

import { memo, useMemo } from "react";
import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import {
  createHeadcountColumns,
  otColumns,
} from "@/components/modules/head-count/headcount-columns";
import type {
  HeadcountCrosscheckRow,
  HeadcountDynamicRun,
  HeadcountOtRow,
  HeadcountType,
} from "@/types/headcount-types";

function TableLoading() {
  return (
    <div className="p-4 space-y-3 animate-pulse">
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
      <div className="h-10 w-full rounded-md bg-gray-100" />
    </div>
  );
}

type HeadcountResultsSectionProps = {
  dateStr: string;
  dynamicHeadcountRuns: HeadcountDynamicRun[];
  filteredHcRows: HeadcountCrosscheckRow[];
  hcRowsLength: number;
  headcountType: HeadcountType;
  loading: boolean;
  otRows: HeadcountOtRow[];
};

const HeadcountResultsSection = memo(function HeadcountResultsSection({
  dateStr,
  dynamicHeadcountRuns,
  filteredHcRows,
  hcRowsLength,
  headcountType,
  loading,
  otRows,
}: HeadcountResultsSectionProps) {
  const headcountColumns = useMemo(
    () => createHeadcountColumns(dynamicHeadcountRuns),
    [dynamicHeadcountRuns],
  );

  if (headcountType === "") {
    return !loading ? (
      <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
        <p className="text-sm font-medium text-gray-700">
          Select Head count or OT requisition to show the table
        </p>
      </div>
    ) : null;
  }

  return (
    <>
      <div className="mt-4 rounded-md border bg-white">
        {loading ? (
          <TableLoading />
        ) : headcountType === "headcount" ? (
          <TanstackDataTable data={filteredHcRows} columns={headcountColumns} />
        ) : (
          <TanstackDataTable data={otRows} columns={otColumns} />
        )}
      </div>

      {!loading && headcountType === "headcount" && hcRowsLength === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No data for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Clear search, change date, or start headcount capture to generate
            headcount events.
          </p>
        </div>
      ) : null}

      {!loading && headcountType === "ot" && otRows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-gray-50 p-6 text-center">
          <p className="text-sm font-medium text-gray-700">
            No headcount data for {dateStr}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Start headcount capture to generate headcount events.
          </p>
        </div>
      ) : null}
    </>
  );
});

HeadcountResultsSection.displayName = "HeadcountResultsSection";

export default HeadcountResultsSection;
