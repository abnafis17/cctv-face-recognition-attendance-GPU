// src/constant/index.js

export const HOST =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:3001";

// Keep one canonical backend prefix env across frontend modules.
const rawBackendApiPrefix =
  process.env.NEXT_PUBLIC_BACKEND_API_PREFIX || "/api/v1";
export const BACKEND_API_PREFIX = rawBackendApiPrefix.startsWith("/")
  ? rawBackendApiPrefix
  : `/${rawBackendApiPrefix}`;
export const BACKEND_API_BASE = `${HOST}${BACKEND_API_PREFIX}`;

export const AI_HOST =
  process.env.NEXT_PUBLIC_AI_URL || "http://127.0.0.1:8000";

// If your AI server also uses "/api", change to: `${AI_HOST}/api`
export const AI_API_BASE = `${AI_HOST}`;

export const ERP_HOST =
  process.env.NEXT_PUBLIC_ERP_URL || "http://172.20.60.101:7001";

// New HRM Module API
export const NEW_HRM_URL =
  process.env.NEXT_PUBLIC_NEW_HRM_URL || "http://10.81.100.69:9070/api/v1";
export const NEW_HRM_MEDIA_URL =
  process.env.NEXT_PUBLIC_NEW_HRM_MEDIA_URL ||
  (NEW_HRM_URL
    ? NEW_HRM_URL.replace(/\/api\/v1\/?$/, "").replace(/\/+$/, "")
    : "http://10.81.100.69:9070");
export const NEW_HRM_ACCESS_TOKEN =
  process.env.NEXT_PUBLIC_NEW_HRM_ACCESS_TOKEN || "";
export const NEW_HRM_REFRESH_TOKEN =
  process.env.NEXT_PUBLIC_NEW_HRM_REFRESH_TOKEN || "";

export const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_URL || "";
export const CLIENT_ADDRESS = process.env.NEXT_PUBLIC_CLIENT_ADDRESS || "";
