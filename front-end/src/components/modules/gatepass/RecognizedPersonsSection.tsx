import { Users, X, ScanFace, VideoOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RecognizedGatepassRow } from "@/types/gatepass-types";

type Props = {
  rows: RecognizedGatepassRow[];
  recordsError: string;
  isSelectedCameraRunning: boolean;
  onRemove: (key: string) => void;
};

const AVATAR_COLORS = [
  "bg-blue-500 text-white shadow-sm",
  "bg-emerald-500 text-white shadow-sm",
  "bg-violet-500 text-white shadow-sm",
  "bg-amber-500 text-white shadow-sm",
  "bg-rose-500 text-white shadow-sm",
  "bg-indigo-500 text-white shadow-sm",
  "bg-pink-500 text-white shadow-sm",
  "bg-cyan-500 text-white shadow-sm",
];

function getAvatarColor(name: string) {
  if (!name) return AVATAR_COLORS[0];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}

function formatTime(date: Date) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(date));
  } catch {
    return "--:--";
  }
}

function getInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
}

export default function RecognizedPersonsSection({
  rows,
  recordsError,
  isSelectedCameraRunning,
  onRemove,
}: Props) {
  return (
    <div className="flex flex-col border border-zinc-100 bg-white rounded-md shadow-sm overflow-hidden border-t-4 border-t-blue-500 h-full">
      
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/50 px-5 py-4">
        <div className="flex items-center gap-2">
          <div className="h-5 w-5 rounded-lg bg-blue-50 flex items-center justify-center">
            <Users className="h-4 w-4 text-blue-600" />
          </div>
          <h2 className="text-sm font-bold text-zinc-900 tracking-tight">Recognition Queue</h2>
        </div>
        <Badge 
          variant="secondary" 
          className="rounded-full bg-blue-50 text-blue-700 font-semibold px-2 py-0.5 text-xs border border-blue-100"
        >
          {rows.length} {rows.length === 1 ? "Person" : "People"}
        </Badge>
      </div>

      {/* Body / Scrollable List */}
      <div className="p-4 flex flex-col flex-1 min-h-0">
        {recordsError && (
          <div className="mb-3 rounded-md border border-red-100 bg-red-50/50 px-3.5 py-2.5 text-xs text-red-700">
            {recordsError}
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto pr-1 flex flex-col gap-2.5 [scrollbar-gutter:stable]">
          {rows.length > 0 ? (
            rows.map((row) => (
              <div 
                key={row.key} 
                className="group relative flex items-center justify-between p-3 rounded-md border border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50 hover:border-zinc-200/60 transition-all duration-200"
              >
                {/* Left side: Avatar & info */}
                <div className="flex items-center min-w-0 flex-1 mr-2">
                  <div className={cn(
                    "h-9 w-9 shrink-0 rounded-md font-bold text-xs flex items-center justify-center uppercase tracking-wider",
                    getAvatarColor(row.employee.department || row.employee.name)
                  )}>
                    {getInitials(row.employee.name)}
                  </div>
                  <div className="ml-3 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-zinc-800 truncate block leading-tight">
                        {row.employee.name}
                      </span>
                      <Badge className="rounded-full bg-rose-50 text-rose-600 border border-rose-100 text-[9px] font-bold px-1.5 py-px shrink-0">
                        Leaving
                      </Badge>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-medium truncate block mt-0.5">
                      ID: {row.employee.employeeCode} • {row.employee.department}
                    </span>
                  </div>
                </div>

                {/* Right side: Time & Action */}
                <div className="flex items-center shrink-0">
                  <span className="text-[10px] font-semibold text-zinc-450 mr-1 group-hover:mr-2 transition-all">
                    {formatTime(row.recognizedAt)}
                  </span>
                  
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all cursor-pointer flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
                    onClick={() => onRemove(row.key)}
                    title="Remove from queue"
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))
          ) : (
            // Empty State
            <div className="flex flex-col items-center justify-center text-center py-12 px-4 select-none">
              {isSelectedCameraRunning ? (
                <>
                  <div className="relative flex items-center justify-center mb-3">
                    <span className="absolute h-10 w-10 rounded-full bg-blue-100 animate-ping border border-blue-200/50" />
                    <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center border border-blue-100 shadow-sm">
                      <ScanFace className="h-4 w-4 text-blue-500" />
                    </div>
                  </div>
                  <h3 className="text-xs font-bold text-zinc-850">Waiting for Detections</h3>
                  <p className="text-[10px] text-zinc-405 mt-1 max-w-[200px] leading-relaxed">
                    Camera is running. Recognized employees will automatically appear here.
                  </p>
                </>
              ) : (
                <>
                  <div className="h-9 w-9 rounded-full bg-zinc-50 flex items-center justify-center border border-zinc-100 mb-3 text-zinc-400">
                    <VideoOff className="h-4 w-4" />
                  </div>
                  <h3 className="text-xs font-bold text-zinc-500">System Offline</h3>
                  <p className="text-[10px] text-zinc-400 mt-1 max-w-[200px] leading-relaxed">
                    Start the camera monitor on the left to begin face recognition.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
