export type Employee = {
  id: string;
  empId?: string | null;
  name: string;
  unit?: string | null;
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
  rtspUrl?: string | null;
  isActive: boolean;
  attendance?: boolean | null;
  relayAgentId?: string | null;
  rtspUrlEnc?: string | null;
  sendFps?: number;
  sendWidth?: number;
  sendHeight?: number;
  jpegQuality?: number;
  createdAt?: string;
  updatedAt?: string;
};
