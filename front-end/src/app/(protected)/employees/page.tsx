import EmployeeListTable from "@/components/employees/EmployeeListTable";
import React from "react";

const page = () => {
  return (
    <div className="flex flex-col gap-4">
      <div className="page-header">
        <h1 className="page-title">Employee List</h1>
        <p className="page-subtitle">
          Manage employee records, hierarchy attributes, and profile updates.
        </p>
      </div>
      <EmployeeListTable />
    </div>
  );
};

export default page;
