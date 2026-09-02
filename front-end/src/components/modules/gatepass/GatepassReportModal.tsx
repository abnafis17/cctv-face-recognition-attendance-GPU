"use client";

import React from "react";
import { Printer, FileText } from "lucide-react";
import ReusableModal from "@/components/reusable/ReusableModal";
import type { GatepassRecord } from "@/types/gatepass-types";
import PakizaLogo from "@/assets/images/Pakiza_Apparels.png";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";

interface GatepassReportModalProps {
  open: boolean;
  onClose: () => void;
  record: GatepassRecord | null;
}

function valOrDash(val: unknown): string {
  if (val === null || val === undefined) return "-";
  const str = String(val).trim();
  return str !== "" && str !== "N/A" && str !== "--" ? str : "-";
}

function extractErpDetailRecord(resData: any): any | null {
  if (!resData || typeof resData !== "object") return null;

  // Un-nest { ok: true, data: ... }
  let root = resData.data !== undefined ? resData.data : resData;
  if (!root || typeof root !== "object") return null;

  // Detect envelope response { statusCode: 200, message: "...", totalCount: 0, data: null }
  if ("totalCount" in root && (root.totalCount === 0 || root.data === null)) {
    return null;
  }
  if ("data" in root) {
    if (root.data === null || root.data === undefined) return null;
    root = root.data;
  }

  // Handle arrays
  if (Array.isArray(root)) {
    if (root.length === 0) return null;
    root = root[0];
  }

  if (root && typeof root === "object" && !("error" in root)) {
    const hasKeys =
      "empName" in root ||
      "employeeName" in root ||
      "empId" in root ||
      "employeeId" in root ||
      "passTitleName" in root ||
      "organization" in root ||
      "timeStart" in root ||
      "deptName" in root ||
      "department" in root ||
      "designation" in root ||
      "remarks" in root ||
      "apWorkflowSignatureList" in root;

    if (hasKeys) {
      return root;
    }
  }

  return null;
}

export default function GatepassReportModal({
  open,
  onClose,
  record,
}: GatepassReportModalProps) {
  const [erpDetails, setErpDetails] = React.useState<any>(null);
  const [loadingDetails, setLoadingDetails] = React.useState(false);
  const [noErpDataFound, setNoErpDataFound] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setErpDetails(null);
      setNoErpDataFound(false);
      return;
    }

    if (record?.id) {
      setErpDetails(null);
      setNoErpDataFound(false);
      const fetchDetails = async () => {
        try {
          setLoadingDetails(true);
          const res = await axiosInstance.get(
            `${API.GATEPASS_TABLE}/${record.id}/external-details`,
          );

          const detailRecord = extractErpDetailRecord(res.data);
          if (detailRecord) {
            setErpDetails(detailRecord);
            setNoErpDataFound(false);
          } else {
            setErpDetails(null);
            setNoErpDataFound(true);
          }
        } catch (err) {
          console.error(
            "[GatepassReportModal] Failed to fetch external ERP details:",
            err,
          );
          setErpDetails(null);
          setNoErpDataFound(true);
        } finally {
          setLoadingDetails(false);
        }
      };
      void fetchDetails();
    }
  }, [open, record?.id]);

  const signatureList = React.useMemo(() => {
    if (
      !erpDetails?.apWorkflowSignatureList ||
      !Array.isArray(erpDetails.apWorkflowSignatureList)
    )
      return [];
    return [...erpDetails.apWorkflowSignatureList].sort((a: any, b: any) => {
      const pA = parseInt(a.priority || "0", 10);
      const pB = parseInt(b.priority || "0", 10);
      return pA - pB;
    });
  }, [erpDetails]);

  const displaySlots = React.useMemo(() => {
    if (signatureList.length > 0) {
      return signatureList.map((sig: any) => ({
        label: sig.levelName || "Approved By",
        name: valOrDash(sig.approverName),
        designation: valOrDash(sig.approverDesi),
        status: sig.approveStatus || "Pending",
        time: valOrDash(sig.approveTime),
      }));
    }
    return [];
  }, [signatureList]);

  const colWidthPercent =
    displaySlots.length > 0 ? 100 / (displaySlots.length + 1) : 100;
  const colWidth = `${colWidthPercent}%`;

  if (!record) return null;

  const logoSrc = erpDetails?.logoPath || PakizaLogo.src;

  const handlePrint = () => {
    const printContent = document.getElementById("gatepass-report-print-area");
    if (!printContent || !erpDetails) return;
    const windowUrl = "about:blank";
    const uniqueName = new Date().getTime();
    const printWindow = window.open(
      windowUrl,
      uniqueName.toString(),
      "left=50,top=50,width=850,height=900,toolbar=0,scrollbars=1,status=0",
    );
    if (!printWindow) return;

    const logoUrl =
      erpDetails?.logoPath || window.location.origin + PakizaLogo.src;

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
      .map((slot) => {
        return `
        <td class="approval-cell">
          <div class="font-semibold">${slot.name}</div>
          <div class="text-xs text-muted mt-1">${slot.designation}</div>
          ${slot.time !== "-" ? `<div class="text-xs text-muted mt-2">${slot.time}</div>` : ""}
        </td>
      `;
      })
      .join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Gate Pass Report - ${valOrDash(erpDetails?.empName || erpDetails?.employeeName)}</title>
          <style>
            @page {
              size: A4 portrait;
              margin: 15mm;
            }
            body {
              font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              color: #18181b;
              margin: 0;
              padding: 0;
              background-color: #ffffff;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .report-container {
              width: 100%;
              max-width: 800px;
              margin: 0 auto;
            }
            .header-table {
              width: 100%;
              border-collapse: collapse;
              margin-bottom: 20px;
              border-bottom: 2px solid #e4e4e7;
              padding-bottom: 15px;
            }
            .logo-cell {
              width: 160px;
              vertical-align: top;
            }
            .logo-img {
              height: 48px;
              width: auto;
              object-fit: contain;
            }
            .title-cell {
              text-align: center;
              padding-right: 160px;
            }
            .company-name {
              font-size: 22px;
              font-weight: 700;
              margin: 0;
              color: #09090b;
              line-height: 1.1;
            }
            .company-address {
              font-size: 11px;
              color: #71717a;
              margin: 6px 0 0 0;
              font-weight: 500;
            }
            .report-title {
              font-size: 15px;
              font-weight: 700;
              color: #312e81;
              text-decoration: underline;
              text-transform: uppercase;
              margin-top: 14px;
              letter-spacing: 0.5px;
            }
            .date-label {
              font-size: 12px;
              font-weight: 600;
              color: #3f3f46;
              margin-bottom: 12px;
            }
            .date-value {
              font-weight: 400;
              color: #09090b;
            }
            .details-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #a1a1aa;
              font-size: 11px;
            }
            .details-table td {
              border: 1px solid #a1a1aa;
              padding: 8px 12px;
            }
            .bg-label {
              background-color: #f4f4f5;
              font-weight: 600;
              color: #3f3f46;
            }
            .remarks-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #a1a1aa;
              font-size: 11px;
              margin-top: 15px;
            }
            .remarks-table td {
              border: 1px solid #a1a1aa;
              padding: 10px 12px;
            }
            .approval-table {
              width: 100%;
              border-collapse: collapse;
              border: 1px solid #a1a1aa;
              font-size: 10.5px;
              margin-top: 25px;
            }
            .approval-table th, .approval-table td {
              border: 1px solid #a1a1aa;
              padding: 8px 6px;
              text-align: center;
            }
            .approval-header {
              background-color: #fafafa;
              font-weight: 700;
              color: #27272a;
              text-transform: uppercase;
              letter-spacing: 0.3px;
            }
            .status-approved {
              color: #059669;
              font-weight: 700;
            }
            .status-rejected {
              color: #e11d48;
              font-weight: 700;
            }
            .status-pending {
              color: #d97706;
              font-weight: 700;
            }
            .approval-cell {
              vertical-align: top;
              padding-top: 12px;
              padding-bottom: 12px;
            }
            .font-semibold {
              font-weight: 600;
              color: #09090b;
            }
            .text-xs {
              font-size: 10px;
            }
            .text-muted {
              color: #71717a;
            }
            .mt-1 { margin-top: 3px; }
            .mt-2 { margin-top: 8px; }
          </style>
        </head>
        <body>
          <div class="report-container">
            <!-- Header Table -->
            <table class="header-table">
              <tr>
                <td class="logo-cell">
                  <img src="${logoUrl}" alt="Pakiza Logo" class="logo-img" />
                </td>
                <td class="title-cell">
                  <div class="company-name">${valOrDash(erpDetails?.organization)}</div>
                  <div class="company-address">${valOrDash(erpDetails?.organizationAddress)}</div>
                  <div class="report-title">Gate Pass Report</div>
                </td>
              </tr>
            </table>

            <!-- Date -->
            <div class="date-label">
              Date: <span class="date-value">${valOrDash(erpDetails?.date_)}</span>
            </div>

            <!-- Details Table -->
            <table class="details-table">
              <tbody>
                <tr>
                  <td class="bg-label" style="width: 18%;">Employee Id</td>
                  <td style="width: 32%;">${valOrDash(erpDetails?.empId || erpDetails?.employeeId)}</td>
                  <td class="bg-label" style="width: 18%;">Employee Name</td>
                  <td style="width: 32%;">${valOrDash(erpDetails?.empName || erpDetails?.employeeName)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Department</td>
                  <td>${valOrDash(erpDetails?.deptName || erpDetails?.department)}</td>
                  <td class="bg-label">Designation</td>
                  <td>${valOrDash(erpDetails?.designation)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Doc Name</td>
                  <td>${valOrDash(erpDetails?.docName || "Gate-Pass")}</td>
                  <td class="bg-label">Leave Type</td>
                  <td>${record?.passType === "short leave" ? "Short Leave" : record?.passType === "Long Leave" ? "Long Leave" : valOrDash(record?.passType)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Time Start</td>
                  <td>${valOrDash(erpDetails?.timeStart)}</td>
                  <td class="bg-label">Time End</td>
                  <td>${valOrDash(erpDetails?.timeEnd)}</td>
                </tr>
                <tr>
                  <td class="bg-label">Purpose</td>
                  <td>${valOrDash(erpDetails?.passTitleName || erpDetails?.title)}</td>
                  <td class="bg-label">Destination</td>
                  <td>${valOrDash(erpDetails?.remarks)}</td>
                </tr>
              </tbody>
            </table>

            <!-- Approval Table -->
            ${
              displaySlots.length > 0
                ? `<table class="approval-table">
                    <thead>
                      <tr>
                        <th class="approval-header" style="width: ${colWidth};">PREPARED BY ::</th>
                        ${printHeaders}
                      </tr>
                    </thead>
                    <tbody>
                      <tr style="vertical-align: top;">
                        <td class="approval-cell" style="width: ${colWidth};">
                          <div class="font-semibold">${valOrDash(erpDetails?.prepareByName)}</div>
                          <div class="text-xs text-muted mt-1">${valOrDash(erpDetails?.prepareByDesi)}</div>
                          <div class="text-xs text-muted mt-2">${valOrDash(erpDetails?.prepareTime)}</div>
                        </td>
                        ${printCells}
                      </tr>
                    </tbody>
                  </table>`
                : ""
            }
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <ReusableModal
      open={open}
      onClose={onClose}
      title="Gate Pass Report"
      maxWidth="4xl"
    >
      <div className="flex flex-col gap-4">
        {/* Action Header / Print Button */}
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
            {loadingDetails ? (
              <svg
                className="animate-spin -ml-1 mr-1 h-3.5 w-3.5 text-white"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            ) : (
              <Printer className="w-3.5 h-3.5" />
            )}
            <span>Print Report</span>
          </button>
        </div>

        {loadingDetails ? (
          <div className="w-full py-16 flex flex-col items-center justify-center text-zinc-500 gap-2">
            <svg
              className="animate-spin h-6 w-6 text-indigo-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            <span className="text-xs font-medium">
              Fetching Gate Pass Report from ERP...
            </span>
          </div>
        ) : noErpDataFound || !erpDetails ? (
          <div className="w-full bg-white p-8 border border-zinc-200 rounded-lg text-center flex flex-col items-center justify-center my-4">
            <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
              <FileText className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-zinc-800">
              No ERP Gate Pass Details
            </h3>
            <p className="text-xs text-zinc-500 max-w-md mt-1.5 leading-relaxed">
              No external ERP details exist for this gate pass record.
            </p>
          </div>
        ) : (
          /* Report Display Container (Only rendered when ERP data exists) */
          <div
            id="gatepass-report-print-area"
            className="w-full bg-white p-6 border border-zinc-200 rounded-lg shadow-xs"
          >
            {/* Company Header */}
            <div className="flex items-center justify-between border-b-2 border-zinc-100 pb-4 mb-5">
              {/* Logo */}
              <div className="w-44 flex items-center justify-start select-none">
                <img
                  src={logoSrc}
                  alt="Pakiza Logo"
                  className="h-12 w-auto object-contain"
                />
              </div>

              {/* Title / Company Info */}
              <div className="text-center flex-1 mr-44">
                <h1 className="text-2xl font-bold text-zinc-900 tracking-tight leading-none">
                  {valOrDash(erpDetails?.organization)}
                </h1>
                <p className="text-xs text-zinc-500 mt-1.5 font-medium">
                  {valOrDash(erpDetails?.organizationAddress)}
                </p>
                <h2 className="text-base font-bold text-indigo-900 tracking-wide underline mt-3.5 uppercase decoration-indigo-300">
                  Gate Pass Report
                </h2>
              </div>
            </div>

            {/* Date */}
            <div className="text-xs font-semibold text-zinc-700 mb-3">
              Date:{" "}
              <span className="font-normal text-zinc-900">
                {valOrDash(erpDetails?.date_)}
              </span>
            </div>

            {/* Details Grid Table */}
            <table className="w-full border-collapse border border-zinc-400 text-xs">
              <tbody>
                <tr className="border-b border-zinc-400">
                  <td className="w-[18%] bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Employee Id
                  </td>
                  <td className="w-[32%] border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.empId || erpDetails?.employeeId)}
                  </td>
                  <td className="w-[18%] bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Employee Name
                  </td>
                  <td className="w-[32%] px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.empName || erpDetails?.employeeName)}
                  </td>
                </tr>
                <tr className="border-b border-zinc-400">
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Department
                  </td>
                  <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.deptName || erpDetails?.department)}
                  </td>
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Designation
                  </td>
                  <td className="px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.designation)}
                  </td>
                </tr>
                <tr className="border-b border-zinc-400">
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Doc Name
                  </td>
                  <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.docName || "Gate-Pass")}
                  </td>
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Leave Type
                  </td>
                  <td className="px-3 py-2.5 text-zinc-900 font-medium">
                    {record?.passType === "short leave" ? "Short Leave" : record?.passType === "Long Leave" ? "Long Leave" : valOrDash(record?.passType)}
                  </td>
                </tr>
                <tr className="border-b border-zinc-400">
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Time Start
                  </td>
                  <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.timeStart)}
                  </td>
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Time End
                  </td>
                  <td className="px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.timeEnd)}
                  </td>
                </tr>
                <tr className="border-b border-zinc-400">
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Purpose
                  </td>
                  <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.passTitleName || erpDetails?.title)}
                  </td>
                  <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                    Destination
                  </td>
                  <td className="px-3 py-2.5 text-zinc-900 font-medium">
                    {valOrDash(erpDetails?.remarks)}
                  </td>
                </tr>
              </tbody>
            </table>

            {/* Approval Workflow Block */}
            {displaySlots.length > 0 && (
              <table className="w-full border-collapse border border-zinc-400 text-[11px] mt-7">
                <thead>
                  <tr className="border-b border-zinc-400 bg-zinc-50/50">
                    <th
                      style={{ width: colWidth }}
                      className="border-r border-zinc-400 px-2 py-2 font-bold text-zinc-800 text-center uppercase tracking-wider"
                    >
                      Prepared By ::
                    </th>
                    {displaySlots.map((slot: any, idx: number) => {
                      const isApproved =
                        (slot.status || "").toLowerCase() === "approved";
                      const isRejected =
                        (slot.status || "").toLowerCase() === "rejected";
                      const statusClass = isApproved
                        ? "text-emerald-600 font-bold"
                        : isRejected
                          ? "text-rose-600 font-bold"
                          : "text-amber-600 font-bold";

                      return (
                        <th
                          key={idx}
                          style={{ width: colWidth }}
                          className={`px-2 py-2 font-bold text-zinc-800 text-center uppercase tracking-wider ${
                            idx < displaySlots.length - 1
                              ? "border-r border-zinc-400"
                              : ""
                          }`}
                        >
                          {slot.label} ::{" "}
                          <span className={statusClass}>{slot.status}</span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  <tr className="align-top">
                    <td className="border-r border-zinc-400 px-2 py-3.5 text-center text-zinc-900">
                      <div className="font-semibold">
                        {valOrDash(erpDetails?.prepareByName)}
                      </div>
                      <div className="text-[10px] text-zinc-500 mt-1 font-medium">
                        {valOrDash(erpDetails?.prepareByDesi)}
                      </div>
                      <div className="text-[10px] text-zinc-400 mt-2.5 font-semibold">
                        {valOrDash(erpDetails?.prepareTime)}
                      </div>
                    </td>
                    {displaySlots.map((slot: any, idx: number) => (
                      <td
                        key={idx}
                        className={`px-2 py-3.5 text-center text-zinc-900 ${
                          idx < displaySlots.length - 1
                            ? "border-r border-zinc-400"
                            : ""
                        }`}
                      >
                        <div className="font-semibold">{slot.name}</div>
                        <div className="text-[10px] text-zinc-500 mt-1 font-medium">
                          {slot.designation}
                        </div>
                        {slot.time && slot.time !== "-" && (
                          <div className="text-[10px] text-zinc-400 mt-2.5 font-semibold">
                            {slot.time}
                          </div>
                        )}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </ReusableModal>
  );
}
