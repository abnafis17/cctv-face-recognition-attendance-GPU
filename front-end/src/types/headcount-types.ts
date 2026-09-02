export type HeadcountCameraOption = {
  id: string;
  name: string;
  rtspUrl?: string | null;
  rtspUrlEnc?: string | null;
  relayAgentId?: string | null;
  isActive?: boolean;
};

export type HeadcountType = "" | "headcount" | "ot";
export type HeadcountStatus = "MATCH" | "UNMATCH" | "ABSENT";
export type HeadcountStatusFilter = "ALL" | HeadcountStatus;

export type HeadcountHierarchyFilters = {
  unit: string;
  department: string;
  section: string;
  line: string;
};

export type HeadcountFilterEmployee = {
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
};

export type HeadcountRunResult = {
  runKey: string;
  runIndex: number;
  runStartTime?: string | null;
  runEndTime?: string | null;
  headcountTime?: string | null;
  headcountCameraId?: string | null;
  headcountCameraName?: string | null;
  headcountConfidence?: number | null;
  status: HeadcountStatus;
};

export type HeadcountCrosscheckRow = {
  id: string;
  employeeId: string;
  name: string;
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
  status: HeadcountStatus;
  headcountRuns: HeadcountRunResult[];
};

export type HeadcountOtRow = {
  id: string;
  employeeId: string;
  name: string;
  unit?: string | null;
  department?: string | null;
  section?: string | null;
  line?: string | null;
  cameraName?: string | null;
  headcountTime?: string | null;
};

export type HeadcountDynamicRun = {
  runKey: string;
  runIndex: number;
  runStartTime: string | null;
  runEndTime: string | null;
};

export type HeadcountCounts = {
  match: number;
  unmatch: number;
  absent: number;
  total: number;
};

export type HeadcountHierarchyResult = {
  options: {
    units: string[];
    departments: string[];
    sections: string[];
    lines: string[];
  };
  availability: {
    hasUnit: boolean;
    hasDepartment: boolean;
    hasSection: boolean;
    hasLine: boolean;
  };
  normalizedSelection: HeadcountHierarchyFilters;
  filteredRows: HeadcountFilterEmployee[];
};
