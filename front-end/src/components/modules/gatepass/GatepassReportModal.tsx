"use client";

import React from "react";
import { Printer } from "lucide-react";
import ReusableModal from "@/components/reusable/ReusableModal";
import type { GatepassRecord } from "@/types/gatepass-types";
import PakizaLogo from "@/assets/images/Pakiza_Apparels.png";
import axiosInstance from "@/config/axiosInstance";

interface GatepassReportModalProps {
  open: boolean;
  onClose: () => void;
  record: GatepassRecord | null;
}

function formatDateTimeDhaka(value: unknown): string {
  if (!value) return "";
  try {
    const parsed = new Date(String(value));
    if (isNaN(parsed.getTime())) return "";
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Dhaka",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    const parts = formatter.formatToParts(parsed);
    const getPart = (type: string) =>
      parts.find((p) => p.type === type)?.value || "";
    return `${getPart("day")}/${getPart("month")}/${getPart("year")} ${getPart("hour")}:${getPart("minute")}:${getPart("second")}`;
  } catch {
    return "";
  }
}

export default function GatepassReportModal({
  open,
  onClose,
  record,
}: GatepassReportModalProps) {
  const [erpDetails, setErpDetails] = React.useState<any>(null);
  const [loadingDetails, setLoadingDetails] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setErpDetails(null);
      return;
    }

    if (record?.id) {
      setErpDetails(null);
      const fetchDetails = async () => {
        try {
          setLoadingDetails(true);
          const res = await axiosInstance.get(
            `/gatepass/${record.id}/external-details`,
          );
          console.log(
            "[GatepassReportModal] Successfully fetched ERP gatepass details:",
            res.data,
          );
          if (res.data?.data) {
            setErpDetails(res.data.data);
          }
        } catch (err) {
          console.error(
            "[GatepassReportModal] Failed to fetch external ERP details:",
            err,
          );
        } finally {
          setLoadingDetails(false);
        }
      };
      void fetchDetails();
    }
  }, [open, record?.id]);

  // Design approval slots logic based on mockup
  const defaultSlots = [
    { name: "Mamunoor Rashid", designation: "DGM", label: "Approved By HOD" },
    {
      name: "Md. Hassan Shahim",
      designation: "Sr. Manager",
      label: "Approved By HR & Admin",
    },
    {
      name: "Ariful Islam",
      designation: "Deputy Manager",
      label: "Approved By HR & Admin",
    },
    {
      name: "Md. Atikur Rahman",
      designation: "Deputy Manager",
      label: "Approved By HR & Admin",
    },
  ];

  const erpStatus = (record?.erpStatus || "pending").toLowerCase();
  const approverName = record?.approvedByName || "";
  const approverDesg = record?.approvedByDesignation || "";
  const approvalTime = record?.updatedAt
    ? formatDateTimeDhaka(record.updatedAt)
    : "";

  // Resolve statuses for the 4 slots
  const slots = defaultSlots.map((slot, index) => {
    let status = "Pending";
    let actualName = slot.name;
    let actualDesg = slot.designation;
    let time = "";

    if (erpStatus !== "pending") {
      const statusText = record?.erpStatus
        ? record.erpStatus.charAt(0).toUpperCase() +
          record.erpStatus.slice(1).toLowerCase()
        : "Pending";

      // Match by name first
      const isNameMatch =
        approverName &&
        (approverName.toLowerCase().includes(slot.name.toLowerCase()) ||
          slot.name.toLowerCase().includes(approverName.toLowerCase()));

      // Match by designation (or role fallback if no name matched across all slots)
      const isDesgMatch =
        !isNameMatch &&
        approverDesg &&
        ((index === 0 &&
          (approverDesg.toLowerCase().includes("dgm") ||
            approverDesg.toLowerCase().includes("hod"))) ||
          (index === 1 &&
            !approverDesg.toLowerCase().includes("dgm") &&
            !approverDesg.toLowerCase().includes("hod") &&
            !approverDesg.toLowerCase().includes("deputy")));

      if (isNameMatch || isDesgMatch) {
        status = statusText;
        actualName = approverName || slot.name;
        actualDesg = approverDesg || slot.designation;
        time = approvalTime;
      }
    }

    return {
      label: slot.label,
      name: actualName,
      designation: actualDesg,
      status,
      time,
    };
  });

  const signatureList = React.useMemo(() => {
    if (!erpDetails?.apWorkflowSignatureList) return [];
    return [...erpDetails.apWorkflowSignatureList].sort((a: any, b: any) => {
      const pA = parseInt(a.priority || "0", 10);
      const pB = parseInt(b.priority || "0", 10);
      return pA - pB;
    });
  }, [erpDetails]);

  const displaySlots = React.useMemo(() => {
    if (erpDetails && erpDetails.apWorkflowSignatureList) {
      return signatureList.map((sig: any) => ({
        label: sig.levelName || "Approved By",
        name: sig.approverName || "",
        designation: sig.approverDesi || "",
        status: sig.approveStatus || "Pending",
        time: sig.approveTime || "",
      }));
    }
    return slots;
  }, [erpDetails, signatureList, slots]);

  const colWidthPercent = 100 / (displaySlots.length + 1);
  const colWidth = `${colWidthPercent}%`;

  if (!record) return null;

  const handlePrint = () => {
    const printContent = document.getElementById("gatepass-report-print-area");
    if (!printContent) return;
    const windowUrl = "about:blank";
    const uniqueName = new Date().getTime();
    const printWindow = window.open(
      windowUrl,
      uniqueName.toString(),
      "left=50,top=50,width=850,height=900,toolbar=0,scrollbars=1,status=0",
    );
    if (!printWindow) return;

    const logoUrl = erpDetails?.logoPath || (window.location.origin + PakizaLogo.src);

    const printHeaders = displaySlots.map((slot) => {
      const isApproved = slot.status.toLowerCase() === "approved";
      const isRejected = slot.status.toLowerCase() === "rejected";
      const statusClass = isApproved ? "status-approved" : isRejected ? "status-rejected" : "status-pending";
      return `<th class="approval-header" style="width: ${colWidth};">${slot.label} :: <span class="${statusClass}">${slot.status}</span></th>`;
    }).join("");

    const printCells = displaySlots.map((slot) => {
      return `
        <td class="approval-cell">
          <div class="font-semibold">${slot.name || "--"}</div>
          <div class="text-xs text-muted mt-1">${slot.designation || "--"}</div>
          ${slot.time ? `<div class="text-xs text-muted mt-2">${slot.time}</div>` : ""}
        </td>
      `;
    }).join("");

    printWindow.document.write(`
      <html>
        <head>
          <title>Gate Pass Report - ${erpDetails?.empName || record.employee.name}</title>
          <style>
            @media print {
              body { margin: 0; padding: 20px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
              .no-print { display: none; }
            }
            body { padding: 40px; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #1e293b; }
            .header-container { display: flex; align-items: center; justify-content: space-between; margin-bottom: 25px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px; }
            .logo-area { width: 180px; }
            .title-area { text-align: center; flex-grow: 1; margin-right: 180px; }
            .company-name { font-size: 24px; font-weight: 700; color: #0f172a; margin: 0; }
            .company-address { font-size: 12px; color: #64748b; margin: 4px 0 0 0; }
            .report-title { font-size: 16px; font-weight: 700; text-decoration: underline; text-transform: uppercase; color: #1e3a8a; margin: 15px 0 0 0; letter-spacing: 0.5px; }
            .date-label { font-size: 13px; font-weight: 600; margin-bottom: 10px; color: #334155; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; margin-bottom: 15px; }
            th, td { border: 1px solid #94a3b8; padding: 10px 14px; text-align: left; font-size: 13px; }
            .bg-label { background-color: #f1f5f9; font-weight: 600; color: #334155; }
            .text-center { text-align: center; }
            .font-bold { font-weight: bold; }
            .font-semibold { font-weight: 600; }
            .approval-table { margin-top: 30px; }
            .approval-header { background-color: #f8fafc; font-weight: 700; text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 8px; }
            .approval-cell { text-align: center; vertical-align: top; padding: 15px 8px; }
            .status-pending { color: #d97706; font-weight: 700; }
            .status-approved { color: #16a34a; font-weight: 700; }
            .status-rejected { color: #dc2626; font-weight: 700; }
            .text-xs { font-size: 11px; }
            .text-muted { color: #64748b; }
            .mt-1 { margin-top: 4px; }
            .mt-2 { margin-top: 8px; }
          </style>
        </head>
        <body>
          <div id="gatepass-report-print-area">
            <div class="header-container">
              <div class="logo-area">
                <img src="${logoUrl}" alt="Pakiza Logo" style="height: 48px; width: auto; object-fit: contain;" />
              </div>
              <div class="title-area">
                <h1 class="company-name">${erpDetails?.organization || "Pakiza Apparels Limited"}</h1>
                <p class="company-address">${erpDetails?.organizationAddress || "Khordo Nowpara, Rasulpur, Madhabdi, Narsingdi"}</p>
                <h2 class="report-title">Gate Pass Report</h2>
              </div>
            </div>
            
            <div class="date-label">Date: ${erpDetails?.date_ || record.outDate}</div>
            
            <table>
              <tbody>
                <tr>
                  <td class="bg-label" style="width: 18%;">Employee Id</td>
                  <td style="width: 32%;">${erpDetails?.empId || record.employee.employeeCode}</td>
                  <td class="bg-label" style="width: 18%;">Employee Name</td>
                  <td style="width: 32%;">${erpDetails?.empName || record.employee.name}</td>
                </tr>
                <tr>
                  <td class="bg-label">Department</td>
                  <td>${erpDetails?.deptName || record.employee.department}</td>
                  <td class="bg-label">Designation</td>
                  <td>${erpDetails?.designation || record.employee.designation || "--"}</td>
                </tr>
                <tr>
                  <td class="bg-label">Doc Name</td>
                  <td>Gate-Pass</td>
                  <td class="bg-label">Title</td>
                  <td>${erpDetails?.passTitleName || record.purpose || record.type || "N/A"}</td>
                </tr>
                <tr>
                  <td class="bg-label">Time Start</td>
                  <td>${erpDetails?.timeStart || record.outTime}</td>
                  <td class="bg-label">Time End</td>
                  <td>${erpDetails ? (erpDetails.timeEnd || "N/A") : (record.inTime !== "--" ? record.inTime : "N/A")}</td>
                </tr>
              </tbody>
            </table>

            <table>
              <tbody>
                <tr>
                  <td class="bg-label" style="width: 18%;">Remarks</td>
                  <td style="width: 82%;">${erpDetails?.remarks || record.remarks || record.note || "N/A"}</td>
                </tr>
              </tbody>
            </table>

            <table class="approval-table">
              <thead>
                <tr>
                  <th class="approval-header" style="width: ${colWidth};">Prepared By ::</th>
                  ${printHeaders}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td class="approval-cell">
                    <div class="font-semibold">${erpDetails?.prepareByName || record.employee.name}</div>
                    <div class="text-xs text-muted mt-1">${erpDetails?.prepareByDesi || record.employee.designation || "--"}</div>
                    <div class="text-xs text-muted mt-2">${erpDetails?.prepareTime || record.requestedAt}</div>
                  </td>
                  ${printCells}
                </tr>
              </tbody>
            </table>
          </div>
          <script>
            window.onload = function() {
              window.print();
              window.close();
            }
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const logoSrc = erpDetails?.logoPath || PakizaLogo.src;

  return (
    <ReusableModal
      open={open}
      onClose={onClose}
      maxWidth="5xl"
      showCloseIcon={true}
      title="Gate Pass Report"
    >
      <div className="flex flex-col w-full text-zinc-800">
        {/* Action Controls */}
        <div className="flex justify-end border-b border-zinc-100 pb-3 mb-4">
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-sm transition-all cursor-pointer"
          >
            <Printer className="w-3.5 h-3.5" />
            Print Report
          </button>
        </div>

        {/* Report Display Container (Matches Design Mockup) */}
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
                {erpDetails?.organization || "Pakiza Apparels Limited"}
              </h1>
              <p className="text-xs text-zinc-500 mt-1.5 font-medium">
                {erpDetails?.organizationAddress || "Khordo Nowpara, Rasulpur, Madhabdi, Narsingdi"}
              </p>
              <h2 className="text-base font-bold text-indigo-900 tracking-wide underline mt-3.5 uppercase decoration-indigo-300">
                Gate Pass Report
              </h2>
            </div>
          </div>

          {/* Date */}
          <div className="text-xs font-semibold text-zinc-700 mb-3">
            Date:{" "}
            <span className="font-normal text-zinc-900">{erpDetails?.date_ || record.outDate}</span>
          </div>

          {/* Details Grid Table */}
          <table className="w-full border-collapse border border-zinc-400 text-xs">
            <tbody>
              <tr className="border-b border-zinc-400">
                <td className="w-[18%] bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Employee Id
                </td>
                <td className="w-[32%] border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.empId || record.employee.employeeCode}
                </td>
                <td className="w-[18%] bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Employee Name
                </td>
                <td className="w-[32%] px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.empName || record.employee.name}
                </td>
              </tr>
              <tr className="border-b border-zinc-400">
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Department
                </td>
                <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.deptName || record.employee.department}
                </td>
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Designation
                </td>
                <td className="px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.designation || record.employee.designation || "--"}
                </td>
              </tr>
              <tr className="border-b border-zinc-400">
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Doc Name
                </td>
                <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                  Gate-Pass
                </td>
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Title
                </td>
                <td className="px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.passTitleName || record.purpose || record.type || "N/A"}
                </td>
              </tr>
              <tr className="border-b border-zinc-400">
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Time Start
                </td>
                <td className="border-r border-zinc-400 px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails?.timeStart || record.outTime}
                </td>
                <td className="bg-zinc-100/80 border-r border-zinc-400 px-3 py-2.5 font-semibold text-zinc-700">
                  Time End
                </td>
                <td className="px-3 py-2.5 text-zinc-900 font-medium">
                  {erpDetails ? (erpDetails.timeEnd || "N/A") : (record.inTime !== "--" ? record.inTime : "N/A")}
                </td>
              </tr>
            </tbody>
          </table>

          {/* Remarks Section */}
          <div className="mt-4">
            <table className="w-full border-collapse border border-zinc-400 text-xs">
              <tbody>
                <tr>
                  <td className="w-[18%] bg-zinc-100/80 border-r border-zinc-400 px-3 py-3.5 font-semibold text-zinc-700">
                    Remarks
                  </td>
                  <td className="w-[82%] px-3 py-3.5 text-zinc-900 font-medium">
                    {erpDetails?.remarks || record.remarks || record.note || "N/A"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Approval Workflow Block */}
          <table className="w-full border-collapse border border-zinc-400 text-[11px] mt-7">
            <thead>
              <tr className="border-b border-zinc-400 bg-zinc-50/50">
                <th
                  style={{ width: colWidth }}
                  className="border-r border-zinc-400 px-2 py-2 font-bold text-zinc-800 text-center uppercase tracking-wider"
                >
                  Prepared By ::
                </th>
                {displaySlots.map((slot, idx) => {
                  const isApproved = slot.status === "Approved";
                  const isRejected = slot.status === "Rejected";
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
                        idx < displaySlots.length - 1 ? "border-r border-zinc-400" : ""
                      }`}
                    >
                      {slot.label} ::{" "}
                      <span className={statusClass}>
                        {slot.status}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className="border-r border-zinc-400 px-2 py-3.5 text-center text-zinc-900">
                  <div className="font-semibold">
                    {erpDetails?.prepareByName || record.employee.name}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1 font-medium">
                    {erpDetails?.prepareByDesi || record.employee.designation || "--"}
                  </div>
                  <div className="text-[10px] text-zinc-400 mt-2.5 font-semibold">
                    {erpDetails?.prepareTime || record.requestedAt}
                  </div>
                </td>
                {displaySlots.map((slot, idx) => (
                  <td
                    key={idx}
                    className={`px-2 py-3.5 text-center text-zinc-900 ${
                      idx < displaySlots.length - 1 ? "border-r border-zinc-400" : ""
                    }`}
                  >
                    <div className="font-semibold">{slot.name || "--"}</div>
                    <div className="text-[10px] text-zinc-500 mt-1 font-medium">
                      {slot.designation || "--"}
                    </div>
                    {slot.time && (
                      <div className="text-[10px] text-zinc-400 mt-2.5 font-semibold">
                        {slot.time}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </ReusableModal>
  );
}
