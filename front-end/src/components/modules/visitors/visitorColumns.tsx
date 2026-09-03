import type { ColumnDef } from "@tanstack/react-table";
import { Badge } from "@/components/ui/badge";
import { User, LogOut, Trash2 } from "lucide-react";
import React, { useState } from "react";

function SafeImage({ src, alt, className, fallback }: { src: string; alt: string; className?: string; fallback: React.ReactNode }) {
  const [hasError, setHasError] = useState(false);
  if (hasError || !src) return <>{fallback}</>;
  return <img src={src} alt={alt} className={className} onError={() => setHasError(true)} />;
}

export interface VisitorRecord {
  id: string; visitorName: string; contactNumber: string; emailAddress?: string | null; companyAddress: string;
  visitorType: string; purposeOfVisit: string; department: string; hostEmployeeId: string; hostName?: string | null;
  hostEmployeeName?: string | null; hostPicUrl?: string | null; host_designation_id?: string | null; host_designation_name?: string | null;
  idProofType: string; idProofNumber?: string | null; vehicleNumber?: string | null; extraGuest?: string | null;
  visitorPassNo: string; dateOfVisit: string; timeIn: string; entryAuthorizedBy?: string | null; remarks?: string | null;
  visitorPhoto?: string | null; createdAt: string; status: string; timeOut?: string | null;
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const parts = dateStr.split("-"); if (parts.length !== 3) return dateStr;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return monthIdx >= 0 && monthIdx <= 11 ? `${parts[2].padStart(2, "0")} ${months[monthIdx]} ${parts[0]}` : dateStr;
}

function formatTime12h(timeStr: string | null | undefined): string {
  if (!timeStr) return "--";
  const parts = timeStr.split(":"); if (parts.length < 2) return timeStr;
  const hours = parseInt(parts[0], 10); const minutes = parseInt(parts[1], 10);
  if (isNaN(hours) || isNaN(minutes)) return timeStr;
  const ampm = hours >= 12 ? "PM" : "AM"; const hours12 = hours % 12 || 12;
  return `${String(hours12).padStart(2, "0")}:${String(minutes).padStart(2, "0")} ${ampm}`;
}

function renderCell(isCheckingOut: boolean, children: React.ReactNode, shimmerClass = "w-full h-6") {
  if (isCheckingOut) {
    return <div className="flex items-center justify-center w-full px-1 py-2 animate-pulse"><div className={`bg-zinc-200/60 rounded ${shimmerClass}`} /></div>;
  }
  return children;
}

export function getVisitorColumns(
  skip: number, onCheckout: (id: string) => void, onDelete: (id: string) => void,
  checkingOutIds: Set<string>, deletingIds?: Set<string>, permissions?: Record<string, boolean>
): ColumnDef<VisitorRecord>[] {
  return [
    { id: "sl", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">SL</div>,
      cell: (info) => renderCell(checkingOutIds.has(info.row.original.id) || !!deletingIds?.has(info.row.original.id), <div className="px-1 py-2 text-center text-zinc-500 font-normal">{skip + info.row.index + 1}</div>, "w-8 h-4 mx-auto"), size: 50 },
    { id: "photo", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">Photo</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="flex justify-center px-1 py-1"><SafeImage src={row.original.visitorPhoto || ""} alt={row.original.visitorName} className="h-10 w-10 rounded-full border border-zinc-200 object-cover" fallback={<div className="flex h-10 w-10 items-center justify-center rounded-full border border-zinc-200 bg-zinc-50 text-zinc-400"><User className="h-4 w-4" /></div>} /></div>, "h-10 w-10 rounded-full mx-auto"), size: 60 },
    { id: "visitorName", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Visitor</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2"><div className="font-medium text-zinc-800 truncate">{row.original.visitorName}</div>{row.original.emailAddress && <div className="text-xs text-zinc-400 font-normal truncate">{row.original.emailAddress}</div>}</div>, "w-36 h-8"), size: 180 },
    { id: "contactNumber", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Contact</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2 text-zinc-600 font-normal">{row.original.contactNumber}</div>, "w-24 h-4"), size: 120 },
    { id: "companyAddress", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Company/Address</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2 text-zinc-600 font-normal truncate">{row.original.companyAddress || "--"}</div>, "w-28 h-4"), size: 140 },
    { id: "department", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Department</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2 text-zinc-600 font-normal truncate">{row.original.department}</div>, "w-24 h-4"), size: 120 },
    { id: "purposeOfVisit", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Purpose</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2 text-zinc-600 font-normal truncate">{row.original.purposeOfVisit}</div>, "w-24 h-4"), size: 120 },
    { id: "visitorType", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">Type</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="flex justify-center px-1 py-2"><Badge variant="outline" className="rounded-full border-zinc-200 bg-slate-50 text-zinc-600 font-normal px-2.5 py-0.5 text-[11px]">{row.original.visitorType}</Badge></div>, "w-16 h-6 mx-auto rounded-full"), size: 100 },
    { id: "dateOfVisit", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">Date & Time</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="px-1 py-2 text-center"><div className="text-zinc-700 font-normal">{formatDate(row.original.dateOfVisit)}</div><div className="text-[11px] text-zinc-400 font-normal">{formatTime12h(row.original.timeIn)} - {row.original.status === "checked_out" ? formatTime12h(row.original.timeOut) : "--"}</div></div>, "w-28 h-8 mx-auto"), size: 160 },
    { id: "hostEmployeeId", header: () => <div className="w-full px-1 py-2 text-left font-semibold text-zinc-700">Host/Employee</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="flex items-center gap-2.5 px-1 py-1 text-left min-w-0"><SafeImage src={row.original.hostPicUrl || ""} alt={row.original.hostName || "Host"} className="h-8 w-8 rounded-full object-cover border border-zinc-200/80 shrink-0" fallback={<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-zinc-50 border border-zinc-200 text-zinc-400"><User className="h-4 w-4" /></div>} /><div className="min-w-0">{row.original.hostName ? (<><div className="font-medium text-zinc-800 truncate">{row.original.hostName}</div>{row.original.host_designation_name && <div className="text-[11px] text-zinc-500 font-medium truncate">{row.original.host_designation_name}</div>}<div className="text-[11px] text-zinc-400 font-normal truncate">({row.original.hostEmployeeId})</div></>) : <div className="font-medium text-zinc-800 truncate">{row.original.hostEmployeeId}</div>}</div></div>, "w-28 h-8"), size: 160 },
    { id: "status", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">Status</div>,
      cell: ({ row }) => renderCell(checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id), <div className="flex justify-center px-1 py-2"><Badge variant="outline" className={`rounded-full px-3 py-0.5 font-medium text-[11px] tracking-wide border ${row.original.status !== "checked_out" ? "bg-blue-50/70 text-blue-600 border-blue-200" : "bg-emerald-50/70 text-emerald-600 border-emerald-200"}`}>{row.original.status !== "checked_out" ? "CHECKED IN" : "CHECKED OUT"}</Badge></div>, "w-20 h-6 mx-auto rounded-full"), size: 120 },
    { id: "action", header: () => <div className="w-full px-1 py-2 text-center font-semibold text-zinc-700">Action</div>,
      cell: ({ row }) => {
        const isCheckingOut = checkingOutIds.has(row.original.id) || !!deletingIds?.has(row.original.id);
        const isCheckedIn = row.original.status !== "checked_out";
        const showDelete = permissions ? permissions["/visitors/delete"] !== false : true;
        if (!isCheckedIn && !showDelete) return renderCell(isCheckingOut, <div className="px-1 py-2 text-center text-xs text-zinc-400 font-semibold">N/A</div>, "w-28 h-8 mx-auto rounded-lg");
        return renderCell(isCheckingOut, <div className="flex items-center justify-center gap-1.5 px-1 py-1">{isCheckedIn && <button onClick={() => onCheckout(row.original.id)} className="flex items-center gap-1 rounded-lg border border-emerald-500 bg-white px-2.5 py-1 text-xs font-medium text-emerald-600 transition-all hover:bg-emerald-50 active:scale-95 cursor-pointer shadow-sm"><LogOut className="h-3.5 w-3.5" />Checkout</button>}{showDelete && <button onClick={() => onDelete(row.original.id)} title="Delete visitor & face template" className="flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2 py-1 text-xs font-medium text-rose-600 transition-all hover:bg-rose-50 hover:border-rose-300 active:scale-95 cursor-pointer shadow-sm"><Trash2 className="h-3.5 w-3.5" /></button>}</div>, "w-28 h-8 mx-auto rounded-lg");
      }, size: 140 },
  ];
}
