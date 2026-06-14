export const API = {
  // Auth (backend: /api/v1/auth/*)
  GENERATE_ACCESS_TOKEN: "/auth/refresh",
  LOGIN: "/auth/login",
  SIGNUP: "/auth/register",
  LOGOUT: "/auth/logout",

  EMPLOYEE_LIST: "/employees",
  EMPLOYEE_GROUP_VALUES: "/employees/group-values",
  ATTENDANCE_LIST: "/attendance",
  CAMERAS: "/cameras",

  DAILY_ATTENDANCE_LIST: "/attendance/daily",

  HEADCOUNT_CAMERAS: "/headcount/cameras",
  HEADCOUNT_LIST: "/headcount",
  UNKNOWN_RECOGNITIONS: "/unknown-recognitions",
  GATEPASS_TABLE: "/gatepass",
  GATEPASS_TYPES: "/gatepass/types",
  SETTINGS_RELAY: "/settings/relay",
  SETTINGS_ERP: "/settings/erp",
  MASTER_DATA_VISITOR_TYPES: "/master-data/visitor-types",
  MASTER_DATA_PURPOSES_OF_VISIT: "/master-data/purposes-of-visit",
};
