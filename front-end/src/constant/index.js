// src/constant/index.js

export const HOST =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://127.0.0.1:8001";

// ✅ Common backend API base so you don't repeat "/api" everywhere
export const BACKEND_API_BASE = `${HOST}/api/v1`;

export const AI_HOST =
  process.env.NEXT_PUBLIC_AI_URL || "http://127.0.0.1:8000";

// ✅ If your AI server also uses "/api", change to: `${AI_HOST}/api`
export const AI_API_BASE = `${AI_HOST}`;

export const ERP_HOST =
  process.env.NEXT_PUBLIC_ERP_URL || "http://172.20.60.101:7001";

export const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_URL || "";
export const CLIENT_ADDRESS = process.env.NEXT_PUBLIC_CLIENT_ADDRESS || "";
