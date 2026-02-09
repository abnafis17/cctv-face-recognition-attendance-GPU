"use client";

import React from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/reusable/SearchableSelect";
import type { Camera } from "../types";

export const SetupPanel = React.memo(function SetupPanel({
  cameraId,
  setCameraId,
  camerasWithLaptop,
  selectedCamIsActive,
  busy,

  // ERP employee selection
  selectedErpEmployeeId,
  setSelectedErpEmployeeId,
  hierarchyAvailability,
  hierarchyOptions,
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border bg-white p-5">
        <div className="text-lg font-semibold">1) Choose camera</div>
        <div className="text-sm text-gray-600 mt-1">
          Make sure the camera sees a single face clearly.
        </div>

        <div className="mt-4">
          <Label>Camera</Label>
          <select
            className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
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

          <div className="text-xs text-gray-500 mt-2">
            Camera status:{" "}
            <b className={selectedCamIsActive ? "text-green-700" : "text-red-700"}>
              {selectedCamIsActive ? "ON" : "OFF"}
            </b>
            {" — "}
            {selectedCamIsActive
              ? "You should see the video preview."
              : "It will start automatically when you press Start."}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border bg-white p-5">
        <div className="text-lg font-semibold">
          {reEnroll ? "2) Confirm employee details" : "2) Enter employee details"}
        </div>

        {reEnroll && (
          <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
            Re-enrollment mode: starting this session will replace the existing face
            templates for this employee.
          </div>
        )}

        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="text-sm font-semibold text-slate-900">
            Hierarchy
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Select in order: Unit, Department, Section, then Line. Levels are
            shown only when available for this company.
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {hierarchyAvailability.hasUnit ? (
              <div>
                <Label>Unit</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={unit}
                  onChange={(e) => {
                    setUnit(e.target.value);
                    setDepartment("");
                    setSection("");
                    setLine("");
                    setSelectedErpEmployeeId("");
                  }}
                  disabled={hierarchyLocked}
                >
                  <option value="">All units</option>
                  {hierarchyOptions.units.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchyAvailability.hasDepartment ? (
              <div>
                <Label>Department</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={department}
                  onChange={(e) => {
                    setDepartment(e.target.value);
                    setSection("");
                    setLine("");
                    setSelectedErpEmployeeId("");
                  }}
                  disabled={hierarchyLocked}
                >
                  <option value="">All departments</option>
                  {hierarchyOptions.departments.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchyAvailability.hasSection ? (
              <div>
                <Label>Section</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={section}
                  onChange={(e) => {
                    setSection(e.target.value);
                    setLine("");
                    setSelectedErpEmployeeId("");
                  }}
                  disabled={hierarchyLocked}
                >
                  <option value="">All sections</option>
                  {hierarchyOptions.sections.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            {hierarchyAvailability.hasLine ? (
              <div>
                <Label>Line</Label>
                <select
                  className="mt-1 w-full rounded-md border bg-white px-3 py-2 text-sm"
                  value={line}
                  onChange={(e) => {
                    setLine(e.target.value);
                    setSelectedErpEmployeeId("");
                  }}
                  disabled={hierarchyLocked}
                >
                  <option value="">All lines</option>
                  {hierarchyOptions.lines.map((v) => (
                    <option key={v} value={v}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}
          </div>
        </div>

        <div className="mt-4">
          <Label>Select from ERP (search by Name or ID)</Label>

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
            />
          </div>

          {erpError ? (
            <div className="text-xs text-red-600 mt-2">{erpError}</div>
          ) : (
            <div className="text-xs text-gray-500 mt-2">
              Showing results for: <b>{erpSearch || "all"}</b>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div>
            <Label>Employee ID</Label>
            <Input
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              placeholder="EMP001"
              disabled={busy || lockEmployeeIdentity}
            />
          </div>

          <div>
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="John Doe"
              disabled={busy || lockEmployeeIdentity}
            />
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5">
          <Button onClick={start} disabled={startDisabled}>
            {busy ? "Starting..." : reEnroll ? "Start Re-enrollment" : "Start Setup"}
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <input
              type="checkbox"
              checked={tts}
              onChange={(e) => setTts(e.target.checked)}
            />
            <span className="text-sm text-gray-600">Voice instructions</span>
          </div>
        </div>
      </div>
    </div>
  );
});
