import { Activity, ShieldCheck, Video, Users, FileSpreadsheet } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type Props = {
  recognizedCount: number;
  recordsCount: number;
  isCameraRunning?: boolean;
};

export default function GatepassHeader({
  recognizedCount,
  recordsCount,
  isCameraRunning = false,
}: Props) {
  return (
    <div className="flex w-full border border-zinc-100 bg-white rounded-md shadow-sm">
      <div className="w-full flex flex-col gap-4 px-6 py-4 sm:flex-row sm:items-center sm:justify-between">
        
        {/* Left: Title & Subtitle */}
        <div className="min-w-0 flex items-center gap-3">
          <div className="h-10 w-10 rounded-md bg-gradient-to-tr from-violet-600 to-indigo-500 flex items-center justify-center shadow-md shadow-violet-500/20">
            <Video className="h-5 w-5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold text-zinc-900 tracking-tight">Gate Pass Control</h1>
              <Badge 
                variant="outline" 
                className={`rounded-md px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 transition-colors ${
                  isCameraRunning 
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                    : "bg-zinc-50 text-zinc-500 border-zinc-200"
                }`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${isCameraRunning ? "bg-emerald-500 animate-pulse" : "bg-zinc-400"}`} />
                {isCameraRunning ? "Active" : "Offline"}
              </Badge>
            </div>
            <p className="text-xs text-zinc-500 mt-0.5">
              Live face recognition and real-time gate pass management.
            </p>
          </div>
        </div>

        {/* Right: Quick Stats */}
        <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
          <Badge
            variant="outline"
            className="rounded-md border-blue-100 bg-blue-50/40 px-3 py-1.5 text-blue-700 w-fit flex items-center gap-2 shadow-xs font-medium"
          >
            <Users className="h-4 w-4 text-blue-500" />
            <span>Queue:</span>
            <span className="font-bold text-white bg-blue-600 px-2 py-0.5 rounded text-xs">
              {recognizedCount}
            </span>
          </Badge>
          
          <Badge
            variant="outline"
            className="rounded-md border-indigo-100 bg-indigo-50/40 px-3 py-1.5 text-indigo-700 w-fit flex items-center gap-2 shadow-xs font-medium"
          >
            <FileSpreadsheet className="h-4 w-4 text-indigo-500" />
            <span>Today&apos;s Records:</span>
            <span className="font-bold text-white bg-indigo-600 px-2 py-0.5 rounded text-xs">
              {recordsCount}
            </span>
          </Badge>
        </div>
      </div>
    </div>
  );
}
