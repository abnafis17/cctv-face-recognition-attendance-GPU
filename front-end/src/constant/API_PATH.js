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

  UNKNOWN_RECOGNITIONS: "/unknown-recognitions",
  GATEPASS_TABLE: "/gatepass",
  GATEPASS_TYPES: "/gatepass/types",
  SETTINGS_RELAY: "/settings/relay",
  SETTINGS_ERP: "/settings/erp",
};
