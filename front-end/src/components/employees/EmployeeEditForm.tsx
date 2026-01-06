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
  onSave: (payload: { name?: string; empId?: string | null }) => void;
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
