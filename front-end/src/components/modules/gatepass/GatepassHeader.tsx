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
    <div className="flex flex-col gap-3 border-b border-zinc-100 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="text-lg font-semibold text-zinc-900">Gate Pass</div>
        <p className="max-w-2xl text-sm text-zinc-500">
          Live camera, recognition queue, and gatepass history.
        </p>
      </div>

      <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
        <Badge
          variant="outline"
          className="rounded-full border-zinc-100 bg-white text-zinc-700"
        >
          <Users className="h-3.5 w-3.5" />
          Recognized {recognizedCount}
        </Badge>
        <Badge
          variant="outline"
          className="rounded-full border-zinc-100 bg-white text-zinc-700"
        >
          <Rows3 className="h-3.5 w-3.5" />
          Today&apos;s Rows {recordsCount}
        </Badge>
      </div>
    </div>
  );
}
