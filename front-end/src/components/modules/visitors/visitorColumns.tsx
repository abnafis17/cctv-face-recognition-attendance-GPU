import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { User, LogOut } from "lucide-react";

export interface VisitorRecord {
  id: string;
  visitorName: string;
  contactNumber: string;
  emailAddress?: string | null;
  companyAddress: string;
  visitorType: string;
  purposeOfVisit: string;
  department: string;
  hostEmployeeId: string;
  idProofType: string;
  idProofNumber?: string | null;
  vehicleNumber?: string | null;
  extraGuest?: string | null;
  visitorPassNo: string;
  dateOfVisit: string;
  timeIn: string;
  entryAuthorizedBy?: string | null;
  remarks?: string | null;
  visitorPhoto?: string | null;
  createdAt: string;
  status: string;
  timeOut?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-");
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  if (monthIdx < 0 || monthIdx > 11) return dateStr;
  const dayStr = day.length === 1 ? `0${day}` : day;
  return `${dayStr} ${months[monthIdx]} ${year}`;
}

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "--";
  const parts = timeStr.split(":");
  if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10);
  const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const ampm = hours >= 12 ? "PM" : "AM";
  const hours12 = hours % 12 || 12;
  const minutesStr = minutes < 10 ? `0${minutes}` : minutes;
  const hours12Str = hours12 < 10 ? `0${hours12}` : hours12;
  return `${hours12Str}:${minutesStr} ${ampm}`;
}

export function getVisitorColumns(
  skip: number,
  onCheckout: (id: string) => void,
): ColumnDef<VisitorRecord>[] {
  return [
    {
      id: "sl",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">SL</div>
      ),
      cell: (info) => (
        <div className="px-1 py-2 text-center text-zinc-500">
          {skip + info.row.index + 1}
        </div>
      ),
      size: 50,
    },
    {
      id: "photo",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Photo</div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center px-1 py-1">
          {row.original.visitorPhoto ? (
            <img
              src={row.original.visitorPhoto}
              alt={row.original.visitorName}
              className="h-10 w-10 rounded-full border border-zinc-200 object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400">
              <User className="h-4 w-4" />
            </div>
          )}
        </div>
      ),
      size: 60,
    },
    {
      id: "visitorName",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Visitor</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2">
          <div className="font-semibold text-zinc-900 truncate">
            {row.original.visitorName}
          </div>
          {row.original.emailAddress && (
            <div className="text-xs text-zinc-500 truncate">
              {row.original.emailAddress}
            </div>
          )}
        </div>
      ),
      size: 180,
    },
    {
      id: "contactNumber",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Contact</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-zinc-700">
          {row.original.contactNumber}
        </div>
      ),
      size: 120,
    },
    {
      id: "department",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Department</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-zinc-700 truncate">
          {row.original.department}
        </div>
      ),
      size: 120,
    },
    {
      id: "purposeOfVisit",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Purpose</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-zinc-700 truncate">
          {row.original.purposeOfVisit}
        </div>
      ),
      size: 120,
    },
    {
      id: "visitorType",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Type</div>
      ),
      cell: ({ row }) => (
        <div className="flex justify-center px-1 py-2">
          <Badge
            variant="outline"
            className="rounded-full border-zinc-200 bg-slate-50 text-zinc-700 font-normal px-2.5 py-0.5"
          >
            {row.original.visitorType}
          </Badge>
        </div>
      ),
      size: 100,
    },
    {
      id: "dateOfVisit",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Date & Time</div>
      ),
      cell: ({ row }) => {
        const formattedDate = formatDate(row.original.dateOfVisit);
        const timeIn12 = formatTime12h(row.original.timeIn);
        const timeOut12 = row.original.status === "checked_out" ? formatTime12h(row.original.timeOut) : "--";
        
        return (
          <div className="px-1 py-2 text-center">
            <div className="text-zinc-800 font-medium">
              {formattedDate}
            </div>
            <div className="text-xs text-zinc-500 font-medium">
              {timeIn12} - {timeOut12}
            </div>
          </div>
        );
      },
      size: 160,
    },
    {
      id: "hostEmployeeId",
      header: () => (
        <div className="w-full px-1 py-2 text-left font-bold">Host/Employee</div>
      ),
      cell: ({ row }) => (
        <div className="px-1 py-2 text-zinc-800 font-medium truncate">
          {row.original.hostEmployeeId}
        </div>
      ),
      size: 160,
    },
    {
      id: "status",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Status</div>
      ),
      cell: ({ row }) => {
        const isCheckedIn = row.original.status !== "checked_out";
        return (
          <div className="flex justify-center px-1 py-2">
            <Badge
              variant="outline"
              className={`rounded-full px-3 py-1 font-semibold text-xs tracking-wide border ${
                isCheckedIn
                  ? "bg-blue-50/70 text-blue-600 border-blue-200"
                  : "bg-emerald-50/70 text-emerald-600 border-emerald-200"
              }`}
            >
              {isCheckedIn ? "CHECKED IN" : "CHECKED OUT"}
            </Badge>
          </div>
        );
      },
      size: 120,
    },
    {
      id: "action",
      header: () => (
        <div className="w-full px-1 py-2 text-center font-bold">Action</div>
      ),
      cell: ({ row }) => {
        const isCheckedIn = row.original.status !== "checked_out";
        if (!isCheckedIn) {
          return (
            <div className="text-center text-zinc-400 font-semibold px-1 py-2 text-sm">
              -
            </div>
          );
        }
        return (
          <div className="flex justify-center px-1 py-1">
            <button
              onClick={() => onCheckout(row.original.id)}
              className="flex items-center gap-1.5 rounded-lg border border-emerald-500 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-600 transition-all hover:bg-emerald-50 active:scale-95 cursor-pointer shadow-sm"
            >
              <LogOut className="h-3.5 w-3.5" />
              Checkout
            </button>
          </div>
        );
      },
      size: 120,
    },
  ];
}
