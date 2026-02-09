import EmployeeListTable from "@/components/employees/EmployeeListTable";
import React from "react";

const page = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold text-zinc-900">Employee List</h1>
        <p className="text-sm text-zinc-500">
          Manage employee records, hierarchy attributes, and profile updates.
        </p>
      </div>
      <EmployeeListTable />
    </div>
  );
};

export default page;
