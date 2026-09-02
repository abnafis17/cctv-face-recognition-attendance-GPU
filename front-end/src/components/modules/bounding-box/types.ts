export type BoundingBoxPoint = {
  x: number;
  y: number;
};

export type BoundingBoxRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type BoundingBoxCorners = {
  topLeft: BoundingBoxPoint;
  topRight: BoundingBoxPoint;
  bottomLeft: BoundingBoxPoint;
  bottomRight: BoundingBoxPoint;
};

export type BoundingBoxResizeHandle =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type BoundingBoxEmployeeOption = {
  id: string;
  empId: string | null;
  publicId: string;
  name: string;
  unit: string | null;
  section: string | null;
  department: string | null;
  line: string | null;
};

export type CameraBoundingBoxRecord = BoundingBoxCorners & {
  id: string;
  name: string;
  sortOrder: number;
  employeeIds: string[];
  employeePublicIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type CameraBoundingBoxesState = {
  camera: {
    id: string;
    camId: string | null;
    name: string;
    isActive: boolean;
  };
  employees: BoundingBoxEmployeeOption[];
  boxes: CameraBoundingBoxRecord[];
};

export type EditableBoundingBox = {
  id: string;
  persistedId: string | null;
  name: string;
  rect: BoundingBoxRect;
  employeeIds: string[];
};

export type CameraBoundingBoxPayload = BoundingBoxCorners & {
  id?: string;
  name: string;
  employeeIds: string[];
};

export type CameraBoundingBoxTrackingBox = {
  id: string;
  name: string;
  sortOrder: number;
};

export type CameraBoundingBoxTrackingRecord = {
  id: string;
  cameraId: string;
  cameraName: string;
  boundingBoxId: string;
  boundingBoxName: string;
  employeePkId: string;
  employeeId: string;
  employeeName: string;
  outTime: string;
  inTime: string | null;
  durationSeconds: number | null;
  status: "out" | "in" | string;
  confidence?: number | null;
};

export type CameraBoundingBoxTrackingState = {
  camera: {
    id: string;
    camId: string | null;
    name: string;
  };
  boxes: CameraBoundingBoxTrackingBox[];
  records: CameraBoundingBoxTrackingRecord[];
};
