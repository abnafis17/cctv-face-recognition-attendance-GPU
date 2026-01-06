import EmployeeListTable from "@/components/employees/EmployeeListTable";
import React from "react";

const page = () => {
  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Employee List</h1>
      <EmployeeListTable />
    </div>
  );
};

export default page;
