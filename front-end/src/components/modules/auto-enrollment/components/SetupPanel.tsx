"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import type { Camera } from "../types";
import { VideoOff } from "lucide-react";

export const SetupPanel = React.memo(function SetupPanel({
  cameraId,
  setCameraId,
  camerasWithLaptop,
  cameraDevices = [],
  selectedDeviceId = "",
  onSelectDeviceId,
  selectedCamIsActive,
  busy,

  // ERP employee selection
  selectedErpEmployeeId,
  setSelectedErpEmployeeId,
  hierarchyAvailability,
  hierarchyOptions,
  deptsLoading,
  unit,
  setUnit,
  department,
  setDepartment,
  section,
  setSection,
  line,
  setLine,
  erpItems,
  erpLoading,
  erpError,
  erpSearch,
  setErpSearch,
  onPickEmployee,

  employeeId,
  setEmployeeId,
  name,
  setName,
  reEnroll,
  lockEmployeeIdentity,

  start,
  startDisabled,

  tts,
  setTts,
}: {
  cameraId: string;
  setCameraId: (v: string) => void;
  camerasWithLaptop: Camera[];
  cameraDevices?: Array<{ deviceId: string; label: string }>;
  selectedDeviceId?: string;
  onSelectDeviceId?: (id: string) => void;
  selectedCamIsActive: boolean;
  busy: boolean;

  selectedErpEmployeeId: string;
  setSelectedErpEmployeeId: (v: string) => void;
  hierarchyAvailability: {
    hasUnit: boolean;
    hasDepartment: boolean;
    hasSection: boolean;
    hasLine: boolean;
  };
  hierarchyOptions: {
    units: string[];
    departments: string[];
    sections: string[];
    lines: string[];
  };
  deptsLoading?: boolean;
  unit: string;
  setUnit: (v: string) => void;
  department: string;
  setDepartment: (v: string) => void;
  section: string;
  setSection: (v: string) => void;
  line: string;
  setLine: (v: string) => void;
  erpItems: Array<{ value: string; label: string; keywords?: string }>;
  erpLoading: boolean;
  erpError: string | null;
  erpSearch: string;
  setErpSearch: (q: string) => void;
  onPickEmployee: (empId: string) => void;

  employeeId: string;
  setEmployeeId: (v: string) => void;
  name: string;
  setName: (v: string) => void;
  reEnroll: boolean;
  lockEmployeeIdentity: boolean;

  start: () => void;
  startDisabled: boolean;

  tts: boolean;
  setTts: (v: boolean) => void;
}) {
  const hierarchyLocked = busy || lockEmployeeIdentity;

  const departmentItems = React.useMemo(() => {
    const base = [{ value: "", label: "All departments" }];
    const list = hierarchyOptions.departments.map((d) => ({
      value: d,
      label: d,
    }));
    return [...base, ...list];
  }, [hierarchyOptions.departments]);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch w-full">
      {/* LEFT COLUMN: CAMERA CONFIG & STANDBY PREVIEW */}
      <div className="lg:col-span-5 flex flex-col gap-6">
        {/* Camera Config Card */}
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 md:p-6 shadow-sm">
          <div className="flex items-center justify-between border-b border-zinc-100 pb-3 mb-4">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              1) CAMERA CONFIG
            </h2>
            <span
              className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                selectedCamIsActive
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-red-50 text-red-700 border-red-200"
              }`}
            >
              {selectedCamIsActive ? "ONLINE" : "OFFLINE"}
            </span>
          </div>

          <div className="space-y-3.5">
            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                SELECT CAMERA
              </Label>
              <select
                className="w-full rounded-xl border border-zinc-200 bg-white px-3.5 h-10 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-xs"
                value={cameraId}
                onChange={(e) => setCameraId(e.target.value)}
                disabled={busy}
              >
                {camerasWithLaptop.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} (${c.id})` : c.id}
                  </option>
                ))}
              </select>
            </div>

            {/* If Laptop Camera is selected and we have devices */}
            {cameraId.startsWith("laptop-") ||
            cameraId === "cmkdpsq300000j7284bwluxh2" ? (
              cameraDevices.length > 0 ? (
                <div>
                  <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                    VIDEO INPUT DEVICE ({cameraDevices.length})
                  </Label>
                  <select
                    className="w-full rounded-xl border border-purple-200 bg-purple-50/50 px-3.5 h-10 text-sm text-zinc-800 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all shadow-xs"
                    value={selectedDeviceId}
                    onChange={(e) => onSelectDeviceId?.(e.target.value)}
                    disabled={busy}
                  >
                    {cameraDevices.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null
            ) : null}
          </div>
        </div>

        {/* Camera Standby View */}
        <div className="flex-1 min-h-[380px] rounded-2xl border border-zinc-200/80 bg-white p-8 shadow-sm flex flex-col items-center justify-center text-center">
          <div className="h-14 w-14 rounded-full bg-zinc-100 border border-zinc-200/80 flex items-center justify-center mb-4 text-zinc-400">
            <VideoOff className="h-7 w-7" />
          </div>
          <h3 className="font-bold text-zinc-800 text-sm tracking-wider uppercase mb-2">
            CAMERA STANDBY
          </h3>
          <p className="text-xs text-zinc-500 max-w-xs leading-relaxed">
            Please complete the employee details on the right and click Start Setup to activate the face capture session.
          </p>
        </div>
      </div>

      {/* RIGHT COLUMN: ENTER EMPLOYEE DETAILS & ERP SELECTION */}
      <div className="lg:col-span-7">
        <div className="rounded-2xl border border-zinc-200/80 bg-white p-5 md:p-6 shadow-sm">
          <div className="border-b border-zinc-100 pb-3 mb-5">
            <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
              {reEnroll ? "2) CONFIRM EMPLOYEE DETAILS" : "2) ENTER EMPLOYEE DETAILS"}
            </h2>
          </div>

          {reEnroll && (
            <div className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs text-emerald-900 leading-relaxed">
              Re-enrollment mode: starting this session will replace the existing face templates for this employee.
            </div>
          )}

          {/* Hierarchy Filter Box */}
          <div className="rounded-xl border border-zinc-200/70 bg-zinc-50/60 p-4 md:p-5 mb-5 space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">
                Hierarchy Filter
              </h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                Select department to narrow down the employee search list.
              </p>
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                DEPARTMENT
              </Label>
              <SearchableSelect
                value={department}
                items={departmentItems}
                placeholder="Search department..."
                searchPlaceholder="Type department name..."
                disabled={hierarchyLocked}
                loading={deptsLoading}
                onChange={(deptVal) => {
                  setDepartment(deptVal);
                  setSection("");
                  setLine("");
                  setSelectedErpEmployeeId("");
                }}
                className="rounded-xl border-zinc-200 h-10 text-sm bg-white shadow-xs"
              />
            </div>
          </div>

          {/* Select from ERP Box */}
          <div className="mb-5">
            <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
              SELECT FROM ERP (SEARCH BY NAME OR ID)
            </Label>

            <div className="mt-1">
              <SearchableSelect
                value={selectedErpEmployeeId}
                items={erpItems}
                placeholder="Search employee..."
                searchPlaceholder="Type name or ID..."
                disabled={busy || lockEmployeeIdentity}
                loading={erpLoading}
                onSearchChange={(q) => setErpSearch(q)}
                onChange={(empId) => {
                  setSelectedErpEmployeeId(empId);
                  onPickEmployee(empId);
                }}
                className="rounded-xl border-zinc-200 h-10 text-sm bg-white shadow-xs"
              />
            </div>

            {erpError ? (
              <div className="text-xs text-red-600 mt-2">{erpError}</div>
            ) : (
              <div className="text-xs text-zinc-500 mt-2">
                Showing results for: <b className="font-semibold text-zinc-700">{erpSearch || "all"}</b>
              </div>
            )}
          </div>

          {/* Employee Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-6">
            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                EMPLOYEE ID
              </Label>
              <Input
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                placeholder="EMP001"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                NAME
              </Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="John Doe"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                UNIT
              </Label>
              <Input
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                placeholder="e.g. Pakiza Apparels Limited"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                DEPARTMENT
              </Label>
              <Input
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                placeholder="e.g. All over Printing"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                SECTION
              </Label>
              <Input
                value={section}
                onChange={(e) => setSection(e.target.value)}
                placeholder="e.g. Printing (AOP)"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>

            <div>
              <Label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider block mb-1.5">
                LINE
              </Label>
              <Input
                value={line}
                onChange={(e) => setLine(e.target.value)}
                placeholder="e.g. Line 1"
                disabled={busy || lockEmployeeIdentity}
                className="rounded-xl border-zinc-200 bg-zinc-50/50 h-10 text-sm focus:bg-white transition-all"
              />
            </div>
          </div>

          {/* Bottom Actions */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-100 pt-5">
            <Button
              onClick={start}
              disabled={startDisabled}
              className="bg-purple-600 hover:bg-purple-700 text-white font-semibold px-6 py-2.5 rounded-xl shadow-sm transition-all text-sm h-11 w-full sm:w-auto"
            >
              {busy ? "Starting..." : reEnroll ? "Start Re-enrollment" : "Start Setup"}
            </Button>

            <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={tts}
                onChange={(e) => setTts(e.target.checked)}
                className="rounded border-zinc-300 text-purple-600 focus:ring-purple-500 h-4 w-4"
              />
              <span>Voice instructions</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
