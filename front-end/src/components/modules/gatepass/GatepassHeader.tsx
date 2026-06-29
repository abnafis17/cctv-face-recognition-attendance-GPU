import { Rows3, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  recognizedCount: number;
  recordsCount: number;
};

export default function GatepassHeader({
  recognizedCount,
  recordsCount,
}: Props) {
  return (
    <div className="flex w-full border-b border-zinc-100 bg-white">
      <div className="w-full flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="text-base font-semibold text-zinc-800">Gate Pass</div>
          <p className="max-w-2xl text-xs text-zinc-500 mt-0.5">
            Live camera, recognition queue, and gatepass history.
          </p>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
          <Badge
            variant="outline"
            className="rounded-full border-zinc-200 bg-white text-zinc-700 w-fit"
          >
            <Users className="h-3.5 w-3.5" />
            Recognized {recognizedCount}
          </Badge>
          <Badge
            variant="outline"
            className="rounded-full border-zinc-200 bg-white text-zinc-700 w-fit"
          >
            <Rows3 className="h-3.5 w-3.5" />
            Today&apos;s Rows {recordsCount}
          </Badge>
        </div>
      </div>
    </div>
  );
}
