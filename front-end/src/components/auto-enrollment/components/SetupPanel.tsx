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
