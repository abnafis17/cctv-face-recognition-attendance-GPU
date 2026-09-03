import React from "react";
import type { GatepassRecord } from "@/types/gatepass-types";
import PakizaLogo from "@/assets/images/Pakiza_Apparels.png";
import { valOrDash } from "./useGatepassReportDetails";

interface GatepassReportPrintAreaProps {
  record: GatepassRecord;
  erpDetails: any;
  displaySlots: Array<{
    label: string;
    name: string;
    designation: string;
    status: string;
    time: string;
  }>;
}

export const GatepassReportPrintArea: React.FC<GatepassReportPrintAreaProps> = ({
  record,
  erpDetails,
  displaySlots,
}) => {
  const logoSrc = erpDetails?.logoPath || PakizaLogo.src;
  const colWidthPercent = displaySlots.length > 0 ? 100 / (displaySlots.length + 1) : 100;
  const colWidth = `${colWidthPercent}%`;

  return (
    <div
      id="gatepass-report-print-area"
      className="p-6 bg-white text-zinc-900 border border-zinc-200 rounded-lg space-y-6 shadow-2xs"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 pb-4">
        <div className="w-40 shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="Pakiza Logo" className="h-12 w-auto object-contain" />
        </div>
        <div className="text-center flex-1 pr-40">
          <h2 className="text-xl font-bold text-zinc-900 leading-tight">
            {valOrDash(erpDetails?.organization)}
          </h2>
          <p className="text-xs text-zinc-500 mt-1 font-medium">
            {valOrDash(erpDetails?.organizationAddress)}
          </p>
          <h3 className="text-sm font-bold text-indigo-900 underline uppercase mt-3 tracking-wide">
            Gate Pass Report
          </h3>
        </div>
      </div>

      {/* Date */}
      <div className="text-xs font-semibold text-zinc-700">
        Date: <span className="font-normal text-zinc-900">{valOrDash(erpDetails?.date_)}</span>
      </div>

      {/* Details Table */}
      <div className="overflow-x-auto">
        <table className="w-full border-collapse border border-zinc-300 text-xs">
          <tbody>
            <tr>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5 w-[18%]">
                Employee Id
              </td>
              <td className="border border-zinc-300 p-2.5 w-[32%]">
                {valOrDash(erpDetails?.empId || erpDetails?.employeeId)}
              </td>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5 w-[18%]">
                Employee Name
              </td>
              <td className="border border-zinc-300 p-2.5 w-[32%]">
                {valOrDash(erpDetails?.empName || erpDetails?.employeeName)}
              </td>
            </tr>
            <tr>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">
                Department
              </td>
              <td className="border border-zinc-300 p-2.5">
                {valOrDash(erpDetails?.deptName || erpDetails?.department)}
              </td>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">
                Designation
              </td>
              <td className="border border-zinc-300 p-2.5">{valOrDash(erpDetails?.designation)}</td>
            </tr>
            <tr>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">Doc Name</td>
              <td className="border border-zinc-300 p-2.5">
                {valOrDash(erpDetails?.docName || "Gate-Pass")}
              </td>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">Leave Type</td>
              <td className="border border-zinc-300 p-2.5">
                {record?.passType === "short leave"
                  ? "Short Leave"
                  : record?.passType === "Long Leave"
                  ? "Long Leave"
                  : valOrDash(record?.passType)}
              </td>
            </tr>
            <tr>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">Time Start</td>
              <td className="border border-zinc-300 p-2.5">{valOrDash(erpDetails?.timeStart)}</td>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">Time End</td>
              <td className="border border-zinc-300 p-2.5">{valOrDash(erpDetails?.timeEnd)}</td>
            </tr>
            <tr>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">Purpose</td>
              <td className="border border-zinc-300 p-2.5">
                {valOrDash(erpDetails?.passTitleName || erpDetails?.title)}
              </td>
              <td className="border border-zinc-300 bg-zinc-100 font-semibold p-2.5">
                Destination
              </td>
              <td className="border border-zinc-300 p-2.5">{valOrDash(erpDetails?.remarks)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Approval Table */}
      {displaySlots.length > 0 && (
        <div className="overflow-x-auto mt-4">
          <table className="w-full border-collapse border border-zinc-300 text-center text-xs">
            <thead>
              <tr className="bg-zinc-50 font-bold uppercase tracking-wider text-zinc-800">
                <th className="border border-zinc-300 p-2" style={{ width: colWidth }}>
                  PREPARED BY ::
                </th>
                {displaySlots.map((slot, idx) => (
                  <th key={idx} className="border border-zinc-300 p-2" style={{ width: colWidth }}>
                    {slot.label} ::{" "}
                    <span
                      className={
                        slot.status.toLowerCase() === "approved"
                          ? "text-emerald-600 font-bold"
                          : slot.status.toLowerCase() === "rejected"
                          ? "text-rose-600 font-bold"
                          : "text-amber-600 font-bold"
                      }
                    >
                      {slot.status}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr className="align-top">
                <td className="border border-zinc-300 p-3" style={{ width: colWidth }}>
                  <div className="font-semibold text-zinc-900">
                    {valOrDash(erpDetails?.prepareByName)}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-1">
                    {valOrDash(erpDetails?.prepareByDesi)}
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-2">
                    {valOrDash(erpDetails?.prepareTime)}
                  </div>
                </td>
                {displaySlots.map((slot, idx) => (
                  <td key={idx} className="border border-zinc-300 p-3" style={{ width: colWidth }}>
                    <div className="font-semibold text-zinc-900">{slot.name}</div>
                    <div className="text-[10px] text-zinc-500 mt-1">{slot.designation}</div>
                    {slot.time !== "-" && (
                      <div className="text-[10px] text-zinc-500 mt-2">{slot.time}</div>
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
