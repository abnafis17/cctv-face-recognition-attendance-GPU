export type Employee = {
  id: string;
  empId?: string | null;
  name: string;
  section?: string | null;
  department?: string | null;
  line?: string | null;
};

export type AttendanceRow = {
  id: string;
  employeeId: string;
  name: string;
  timestamp: string;
  cameraId?: string | null;
  cameraName?: string | null;
  confidence?: number | null;
};

export type Camera = {
  id: string;
  camId?: string | null;
  name: string;
  rtspUrl: string;
  isActive: boolean;
};
