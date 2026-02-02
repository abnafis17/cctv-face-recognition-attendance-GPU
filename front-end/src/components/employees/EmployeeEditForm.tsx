// ✅ Add this new component file (example path):
// src/components/employees/EmployeeEditForm.tsx

"use client";

import React from "react";
import { Employee } from "@/types";

type Props = {
  selectedUser: Employee | null;
  setSelectedUser: React.Dispatch<React.SetStateAction<Employee | null>>;
  loading: boolean;
  onClose: () => void;
  onSave: (payload: {
    name?: string;
    empId?: string | null;
    section?: string | null;
    department?: string | null;
    line?: string | null;
  }) => void;
};

const EmployeeEditForm: React.FC<Props> = ({
  selectedUser,
  setSelectedUser,
  loading,
  onClose,
  onSave,
}) => {
  return (
    <div className="space-y-4">
      {/* Employee ID */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Employee ID</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedUser?.empId ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, empId: e.target.value } : prev
            )
          }
          placeholder="Employee ID"
        />
      </div>

      {/* Name */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Name</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedUser?.name ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, name: e.target.value } : prev
            )
          }
          placeholder="Name"
        />
      </div>

      {/* Section */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Section</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedUser?.section ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, section: e.target.value } : prev,
            )
          }
          placeholder="Section"
        />
      </div>

      {/* Department */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Department</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedUser?.department ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, department: e.target.value } : prev,
            )
          }
          placeholder="Department"
        />
      </div>

      {/* Line */}
      <div className="space-y-1">
        <label className="text-sm font-medium">Line</label>
        <input
          className="w-full border rounded px-3 py-2 text-sm"
          value={selectedUser?.line ?? ""}
          onChange={(e) =>
            setSelectedUser((prev) =>
              prev ? { ...prev, line: e.target.value } : prev,
            )
          }
          placeholder="Line"
        />
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-2 pt-2">
        <button
          className="px-4 py-2 rounded border text-sm"
          onClick={onClose}
          type="button"
          disabled={loading}
        >
          Cancel
        </button>

        <button
          className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-60"
          type="button"
          disabled={loading || !selectedUser}
          onClick={() =>
            onSave({
              name: selectedUser?.name,
              empId: selectedUser?.empId ?? null,
              section: selectedUser?.section ?? null,
              department: selectedUser?.department ?? null,
              line: selectedUser?.line ?? null,
            })
          }
        >
          {loading ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
};

export default EmployeeEditForm;
