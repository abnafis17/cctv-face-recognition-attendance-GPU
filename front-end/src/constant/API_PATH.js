export const API = {
  // Auth
  LOGIN: "/auth/login",
  SIGNUP: "/auth/register",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
  GENERATE_ACCESS_TOKEN: "/auth/refresh",
  REFRESH: "/auth/refresh",
  ROLES: "/auth/roles",
  COMPANIES: "/auth/companies",
  MODULES: "/auth/modules",
  ME: "/auth/me",
  PERMISSIONS: "/auth/permissions",

  // Employees
  EMPLOYEE_LIST: "/employees",
  EMPLOYEE_GROUP_VALUES: "/employees/group-values",
  EMPLOYEES_EDIT: "/employees/edit",
  EMPLOYEES_RE_ENROLL: "/employees/re-enroll",
  EMPLOYEES_DELETE: "/employees/delete",

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

  // Cameras
  CAMERAS: "/cameras",
  CAMERAS_START: "/cameras/start",
  CAMERAS_STOP: "/cameras/stop",

  // Unknown Recognitions
  UNKNOWN_RECOGNITIONS: "/unknown-recognitions",

  // Gatepass
  GATEPASS_TABLE: "/gatepass",
  GATEPASS_TYPES: "/gatepass/types",
  GATEPASS_MARK_RETURN: "/gatepass/mark-return",
  GATEPASS_EXTERNAL_DETAILS: "/gatepass/external-details",

  // Visitors
  VISITORS: "/visitors",
  VISITORS_LOOKUP: "/visitors/lookup",
  VISITORS_RECOGNIZE_FACE: "/visitors/recognize-face",
  VISITORS_CHECKOUT: "/visitors/checkout",
  VISITORS_DELETE: "/visitors/delete",
  VISITORS_REPORT_EMPLOYEE_WISE: "/visitors/reports/employee-wise",
  VISITORS_REPORT_VISITOR_WISE: "/visitors/reports/visitor-wise",

  // Master Data
  MASTER_DATA_VISITOR_TYPES: "/master-data/visitor-types",
  MASTER_DATA_PURPOSES_OF_VISIT: "/master-data/purposes-of-visit",
  MASTER_DATA_USER_ROLES: "/master-data/user-roles",

  // Settings
  SETTINGS_RELAY: "/settings/relay",
  SETTINGS_ERP: "/settings/erp",
  SETTINGS_USERS: "/settings/users",

  // Presence
  PRESENCE_CONTROL: "/presence-control",
  PRESENCE_START: "/presence-control/start",
  PRESENCE_STOP: "/presence-control/stop",

  // Bounding Box
  BOUNDING_BOX: "/bounding-box",

  // Auto Enroll
  AUTO_ENROLL_SESSION_STATUS: "/enroll2-auto/session/status",
  AUTO_ENROLL_SESSION_START: "/enroll2-auto/session/start",
  AUTO_ENROLL_SESSION_STOP: "/enroll2-auto/session/stop",

  // Headcount
  HEADCOUNT_LIST: "/headcount",
  HEADCOUNT_EVENTS: "/headcount/events",
  HEADCOUNT_CAMERAS: "/headcount/cameras",
};

export const AUTH = {
  LOGIN: API.LOGIN,
  REGISTER: API.REGISTER,
  LOGOUT: API.LOGOUT,
  REFRESH: API.REFRESH,
};

export default API;
