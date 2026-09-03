"use client";

import React from "react";
import { Printer, FileText } from "lucide-react";
import ReusableModal from "@/components/reusable/ReusableModal";
import type { GatepassRecord } from "@/types/gatepass-types";
import PakizaLogo from "@/assets/images/Pakiza_Apparels.png";
import { useGatepassReportDetails, valOrDash } from "./useGatepassReportDetails";
import { GatepassReportPrintArea } from "./GatepassReportPrintArea";

interface GatepassReportModalProps {
  open: boolean;
  onClose: () => void;
  record: GatepassRecord | null;
}

export default function GatepassReportModal({
  open,
  onClose,
  record,
}: GatepassReportModalProps) {
  const { erpDetails, loadingDetails, noErpDataFound, displaySlots } =
    useGatepassReportDetails(open, record);

  if (!record) return null;

  const handlePrint = () => {
    if (!erpDetails) return;
    const windowUrl = "about:blank";
    const uniqueName = new Date().getTime();
    const printWindow = window.open(
      windowUrl,
      uniqueName.toString(),
      "left=50,top=50,width=850,height=900,toolbar=0,scrollbars=1,status=0"
    );
    if (!printWindow) return;

    const logoUrl = erpDetails?.logoPath || window.location.origin + PakizaLogo.src;
    const colWidthPercent = displaySlots.length > 0 ? 100 / (displaySlots.length + 1) : 100;
    const colWidth = `${colWidthPercent}%`;

    const printHeaders = displaySlots
      .map((slot) => {
        const isApproved = slot.status.toLowerCase() === "approved";
        const isRejected = slot.status.toLowerCase() === "rejected";
        const statusClass = isApproved
          ? "status-approved"
          : isRejected
          ? "status-rejected"
          : "status-pending";
        return `<th class="approval-header" style="width: ${colWidth};">${slot.label} :: <span class="${statusClass}">${slot.status}</span></th>`;
      })
      .join("");

    const printCells = displaySlots
      .map(
        (slot) => `
        <td class="approval-cell">
          <div class="font-semibold">${slot.name}</div>
          <div class="text-xs text-muted mt-1">${slot.designation}</div>
          ${slot.time !== "-" ? `<div class="text-xs text-muted mt-2">${slot.time}</div>` : ""}
        </td>
      `
      )
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Gate Pass Report - ${valOrDash(erpDetails?.empName || erpDetails?.employeeName)}</title>
          <style>
            @page { size: A4 portrait; margin: 15mm; }
            body { font-family: 'Segoe UI', Tahoma, sans-serif; color: #18181b; margin: 0; background-color: #fff; }
            .report-container { width: 100%; max-width: 800px; margin: 0 auto; }
            .header-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; border-bottom: 2px solid #e4e4e7; padding-bottom: 15px; }
            .logo-cell { width: 160px; vertical-align: top; }
            .logo-img { height: 48px; width: auto; object-fit: contain; }
            .title-cell { text-align: center; padding-right: 160px; }
            .company-name { font-size: 22px; font-weight: 700; margin: 0; color: #09090b; }
            .company-address { font-size: 11px; color: #71717a; margin-top: 6px; }
            .report-title { font-size: 15px; font-weight: 700; color: #312e81; text-decoration: underline; text-transform: uppercase; margin-top: 14px; }
            .date-label { font-size: 12px; font-weight: 600; color: #3f3f46; margin-bottom: 12px; }
            .details-table { width: 100%; border-collapse: collapse; border: 1px solid #a1a1aa; font-size: 11px; }
            .details-table td { border: 1px solid #a1a1aa; padding: 8px 12px; }
            .bg-label { background-color: #f4f4f5; font-weight: 600; color: #3f3f46; }
            .approval-table { width: 100%; border-collapse: collapse; border: 1px solid #a1a1aa; font-size: 10.5px; margin-top: 25px; }
            .approval-table th, .approval-table td { border: 1px solid #a1a1aa; padding: 8px 6px; text-align: center; }
            .approval-header { background-color: #fafafa; font-weight: 700; }
            .status-approved { color: #059669; font-weight: 700; }
            .status-rejected { color: #e11d48; font-weight: 700; }
            .status-pending { color: #d97706; font-weight: 700; }
            .approval-cell { vertical-align: top; padding: 12px 6px; }
            .font-semibold { font-weight: 600; color: #09090b; }
            .text-xs { font-size: 10px; }
            .text-muted { color: #71717a; }
            .mt-1 { margin-top: 3px; }
            .mt-2 { margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="report-container">
            <table class="header-table">
              <tr>
                <td class="logo-cell"><img src="${logoUrl}" alt="Pakiza Logo" class="logo-img" /></td>
                <td class="title-cell">
                  <div class="company-name">${valOrDash(erpDetails?.organization)}</div>
                  <div class="company-address">${valOrDash(erpDetails?.organizationAddress)}</div>
                  <div class="report-title">Gate Pass Report</div>
                </td>
              </tr>
            </table>
            <div class="date-label">Date: <span>${valOrDash(erpDetails?.date_)}</span></div>
            <table class="details-table">
              <tbody>
                <tr>
                  <td class="bg-label">Employee Id</td><td>${valOrDash(erpDetails?.empId || erpDetails?.employeeId)}</td>
                  <td class="bg-label">Employee Name</td><td>${valOrDash(erpDetails?.empName || erpDetails?.employeeName)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Department</td><td>${valOrDash(erpDetails?.deptName || erpDetails?.department)}</td>
                  <td class="bg-label">Designation</td><td>${valOrDash(erpDetails?.designation)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Doc Name</td><td>${valOrDash(erpDetails?.docName || "Gate-Pass")}</td>
                  <td class="bg-label">Leave Type</td><td>${record?.passType === "short leave" ? "Short Leave" : record?.passType === "Long Leave" ? "Long Leave" : valOrDash(record?.passType)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Time Start</td><td>${valOrDash(erpDetails?.timeStart)}</td>
                  <td class="bg-label">Time End</td><td>${valOrDash(erpDetails?.timeEnd)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Purpose</td><td>${valOrDash(erpDetails?.passTitleName || erpDetails?.title)}</td>
                  <td class="bg-label">Destination</td><td>${valOrDash(erpDetails?.remarks)}</td>
                </tr>
              </tbody>
            </table>
            ${
              displaySlots.length > 0
                ? `<table class="approval-table">
                    <thead><tr><th class="approval-header" style="width: ${colWidth};">PREPARED BY ::</th>${printHeaders}</tr></thead>
                    <tbody><tr style="vertical-align: top;"><td class="approval-cell" style="width: ${colWidth};"><div class="font-semibold">${valOrDash(erpDetails?.prepareByName)}</div><div class="text-xs text-muted mt-1">${valOrDash(erpDetails?.prepareByDesi)}</div><div class="text-xs text-muted mt-2">${valOrDash(erpDetails?.prepareTime)}</div></td>${printCells}</tr></tbody>
                  </table>`
                : ""
            }
          </div>
          <script>window.onload = function() { window.print(); setTimeout(function() { window.close(); }, 500); };</script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <ReusableModal open={open} onClose={onClose} title="Gate Pass Report" maxWidth="4xl">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-end pb-2 border-b border-zinc-100">
          <button
            onClick={handlePrint}
            disabled={loadingDetails || noErpDataFound || !erpDetails}
            className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md shadow-2xs transition-colors ${
              loadingDetails || noErpDataFound || !erpDetails
                ? "bg-zinc-200 text-zinc-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white cursor-pointer"
            }`}
          >
            <Printer className="w-3.5 h-3.5" />
            <span>Print Report</span>
          </button>
        </div>

        {loadingDetails ? (
          <div className="w-full py-16 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <span className="text-sm">Loading gate pass details...</span>
          </div>
        ) : noErpDataFound ? (
          <div className="w-full py-12 flex flex-col items-center justify-center text-amber-600 gap-2">
            <FileText className="w-8 h-8 opacity-60" />
            <p className="text-sm font-medium">No External ERP Record Found for this Gate Pass</p>
          </div>
        ) : (
          <GatepassReportPrintArea
            record={record}
            erpDetails={erpDetails}
            displaySlots={displaySlots}
          />
        )}
      </div>
    </ReusableModal>
  );
}
