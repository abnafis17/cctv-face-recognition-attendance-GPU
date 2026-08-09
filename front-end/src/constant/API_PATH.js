export const API = {
  // Auth
  GENERATE_ACCESS_TOKEN: "/auth/refresh",
  LOGIN: "/auth/login",
  SIGNUP: "/auth/register",
  LOGOUT: "/auth/logout",
  ME: "/auth/me",

  // Employees
  EMPLOYEE_LIST: "/employees",
  EMPLOYEE_GROUP_VALUES: "/employees/group-values",

  // Attendance
  ATTENDANCE_LIST: "/attendance",
  DAILY_ATTENDANCE_LIST: "/attendance/daily",
  ATTENDANCE_EVENTS: "/attendance/events",

  // Attendance Control
  ATTENDANCE_CONTROL_STATUS: "/attendance-control/status",
  ATTENDANCE_CONTROL_START: "/attendance-control/start",
  ATTENDANCE_CONTROL_STOP: "/attendance-control/stop",
  ATTENDANCE_CONTROL_ENABLE: "/attendance-control/enable",
  ATTENDANCE_CONTROL_DISABLE: "/attendance-control/disable",
  ATTENDANCE_CONTROL_VOICE_EVENTS: "/attendance-control/voice-events",

  // Presence Control
  PRESENCE_CONTROL: "/presence-control",

  // Cameras
  CAMERAS: "/cameras",

  // Headcount
  HEADCOUNT_CAMERAS: "/headcount/cameras",
  HEADCOUNT_LIST: "/headcount",
  HEADCOUNT_EVENTS: "/headcount/events",

  // Unknown Recognitions
  UNKNOWN_RECOGNITIONS: "/unknown-recognitions",

  // Gatepass
  GATEPASS_TABLE: "/gatepass",
  GATEPASS_TYPES: "/gatepass/types",
  GATEPASS_MARK_RETURN: "/gatepass/mark-return",

  // Settings
  SETTINGS_RELAY: "/settings/relay",
  SETTINGS_ERP: "/settings/erp",
  SETTINGS_USERS: "/settings/users",

  // Master Data
  MASTER_DATA_VISITOR_TYPES: "/master-data/visitor-types",
  MASTER_DATA_PURPOSES_OF_VISIT: "/master-data/purposes-of-visit",

  // Auto Enrollment
  AUTO_ENROLL_SESSION_STATUS: "/enroll2-auto/session/status",
  AUTO_ENROLL_SESSION_START: "/enroll2-auto/session/start",
  AUTO_ENROLL_SESSION_STOP: "/enroll2-auto/session/stop",

  // Visitors
  VISITORS: "/visitors",
  VISITORS_LOOKUP: "/visitors/lookup",
  VISITORS_REPORT_VISITOR_WISE: "/visitors/reports/visitor-wise",
  VISITORS_REPORT_EMPLOYEE_WISE: "/visitors/reports/employee-wise",
};
