import { TanstackDataTable } from "@/components/reusable/TanstackDataTable";
import type { ColumnDef } from "@tanstack/react-table";

import type { RecognizedGatepassRow } from "@/types/gatepass-types";

type Props = {
  rows: RecognizedGatepassRow[];
  columns: ColumnDef<RecognizedGatepassRow>[];
  recordsError: string;
  isSelectedCameraRunning: boolean;
};

export default function RecognizedPersonsSection({
  rows,
  columns,
  recordsError,
  isSelectedCameraRunning,
}: Props) {
  return (
    <div className="flex min-h-0 min-w-0 flex-none flex-col px-4 pt-4">
      <div className="pb-3">
        <div className="text-base font-semibold text-zinc-900">
          Recognized Persons
        </div>
      </div>

      {recordsError ? (
        <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {recordsError}
        </div>
      ) : null}

      <div className="pb-3">
        <div className="min-h-[210px] overflow-hidden rounded-2xl border border-zinc-100 bg-white sm:min-h-[230px]">
          <TanstackDataTable
            data={rows}
            columns={columns}
            cellHeight={48}
            className="w-full"
            freezeClassName="overflow-x-auto [scrollbar-gutter:stable]"
            emptyState={
              isSelectedCameraRunning
                ? "Recognized people will appear here."
                : "Start a camera to begin recognition."
            }
          />
        </div>
      </div>
    </div>
  );
}
