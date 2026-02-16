import DailyAttendanceTable from "@/components/daily-attendance/DailyAttendanceTable";
import React from "react";

const page = () => {
  return (
    <div className="space-y-4">
      <div className="page-header">
        <h1 className="page-title">Daily Attendance</h1>
        <p className="page-subtitle">
          Daily first-entry and last-entry attendance overview.
        </p>
      </div>
      <DailyAttendanceTable />
    </div>
  );
};

export default page;
