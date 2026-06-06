import type { Employee, Camera as CameraOption } from "@/types";

export type LeaveType = string;
export type GatepassStatus = "out" | "returned";

export type GatepassLeaveTypeOption = {
  id: string;
  label: string;
  companyId?: string | null;
};

export type GatepassEmployee = {
  id: string;
  employeeCode: string;
  name: string;
  section: string;
  department: string;
  unit: string;
  shift: string;
  headcountNote: string;
};

export type GatepassRecord = {
  id: string;
  employee: GatepassEmployee;
  type: LeaveType;
  typeId?: string | null;
  outDate: string;
  outTime: string;
  inTime: string;
  status: GatepassStatus;
  note: string;
  requestedAt: string;
};

export type GatepassApiRecord = {
  id: string;
  employeeId: string;
  employeeName: string;
  department?: string | null;
  section?: string | null;
  unit?: string | null;
  leaveType: LeaveType;
  leaveTypeId?: string | null;
  purpose: string;
  destination?: string | null;
  outTime: string;
  inTime?: string | null;
  status: GatepassStatus;
  requestedAt?: string;
};

export type EmployeeDirectoryRow = Employee & {
  id: string;
  empId?: string | null;
  name: string;
  unit?: string | null;
  section?: string | null;
  department?: string | null;
  line?: string | null;
  designation?: string | null;
  shift?: string | null;
};

export type AttendanceEventPayload = {
  seq?: number;
  at?: string;
  attendanceId?: string;
  employeeId?: string;
  timestamp?: string;
  cameraId?: string | null;
};

export type RecognizedPerson = {
  key: string;
  employee: GatepassEmployee;
  recognizedAt: Date;
};

export type RecognizedGatepassRow = RecognizedPerson & {
  latestRecord: GatepassRecord | null;
};

export type FormErrors = {
  leaveType?: string;
  purpose?: string;
};

export type GatepassCamera = CameraOption;
