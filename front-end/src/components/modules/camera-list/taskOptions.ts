export const CAMERA_TASK_OPTIONS = [
  { value: "attendance", label: "Attendance" },
  { value: "gate_pass", label: "Gate Pass" },
  { value: "headcount", label: "Headcount" },
  { value: "presence", label: "Presence" },
  { value: "box", label: "Bounding Box" },
] as const;

export const DEFAULT_CAMERA_TASK = CAMERA_TASK_OPTIONS[0].value;
