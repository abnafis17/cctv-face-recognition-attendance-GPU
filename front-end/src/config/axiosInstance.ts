// src/config/axiosInstance.ts
import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";

import {
  HOST,
  AI_HOST,
  MEDIA_HOST,
  CLIENT_ADDRESS,
  BACKEND_API_BASE,
  AI_API_BASE,
  ERP_HOST,
} from "@/constant";
import { API } from "@/constant/API_PATH";

/**
 * STORAGE KEYS (change here only if needed)
 */
const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";

/**
 * Safe storage access (Next.js SSR safe)
 */
const isBrowser = () => typeof window !== "undefined";

const getAccessToken = () =>
  isBrowser() ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
const getRefreshToken = () =>
  isBrowser() ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;

const setAccessToken = (token: string) => {
  if (isBrowser()) localStorage.setItem(ACCESS_TOKEN_KEY, token);
};

const clearAuthTokens = () => {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
};

/**
 * Redirect helper
 */
const redirectToLogin = () => {
  if (!isBrowser()) return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?next=${encodeURIComponent(next)}`;
};

/**
 * A small marker to avoid infinite retry loops.
 */
type RetryAxiosRequestConfig = InternalAxiosRequestConfig & {
  _retry?: boolean;
  _skipAuth?: boolean; // allow skipping auth header when needed
};

/**
 * Refresh token: single-flight + queue requests while refreshing.
 */
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

const resolveQueue = (token: string | null) => {
  pendingQueue.forEach((cb) => cb(token));
  pendingQueue = [];
};

/**
 * Backend refresh token call (uses plain axios, not interceptor axiosInstance)
 * - GET /api/v1/auth/refresh
 * - Sends refresh token in header: refreshtoken: Bearer <token> (matches backend)
 */
const refreshAccessToken = async (): Promise<string | null> => {
  try {
    const refreshToken = getRefreshToken();
    if (!refreshToken) throw new Error("No refresh token found");

    const response = await axios.get(`${BACKEND_API_BASE}/auth/refresh`, {
      headers: {
        refreshtoken: `Bearer ${refreshToken}`,
        Accept: "application/json",
      },
      withCredentials: true,
    });

    const newAccessToken = response?.data?.results?.accessToken;

    if (response.status === 200 && newAccessToken) {
      setAccessToken(newAccessToken);
      return newAccessToken;
    }

    throw new Error("Invalid refresh token response");
  } catch (error: any) {
    console.error("refreshAccessToken failed:", error);
    clearAuthTokens();
    return null;
  }
};

/**
 * Create a flexible axios instance.
 * - Supports choosing a baseURL (backend/ai/anything else)
 * - Optional auth attach + refresh support
 */
function createAxiosClient(options: {
  baseURL: string;
  withCredentials?: boolean;
  attachAuth?: boolean; // attach Authorization from localStorage
  enableRefresh?: boolean; // auto refresh on 401
}) {
  const {
    baseURL,
    withCredentials = true,
    attachAuth = true,
    enableRefresh = true,
  } = options;

  const client = axios.create({
    baseURL,
    withCredentials,
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
  });

  // REQUEST: attach token + keep Content-Type flexible
  client.interceptors.request.use(
    async (config: RetryAxiosRequestConfig) => {
      // Allow skipping auth for specific calls
      if (attachAuth && !config._skipAuth) {
        const token = getAccessToken();
        if (token) {
          config.headers = config.headers || {};
          config.headers.Authorization = `Bearer ${token}`;
        }
      }

      // Do not overwrite Content-Type if caller sets it (e.g. multipart/form-data)
      if (!config.headers?.["Content-Type"]) {
        config.headers["Content-Type"] = "application/json";
      }

      return config;
    },
    (error: any) => Promise.reject(error)
  );

  // RESPONSE: refresh token flow (backend only usually)
  client.interceptors.response.use(
    (response: any) => response,
    async (error: AxiosError) => {
      const originalRequest = error.config as
        | RetryAxiosRequestConfig
        | undefined;

      // If no config, nothing to retry
      if (!originalRequest) return Promise.reject(error);

      // If refresh disabled, reject
      if (!enableRefresh) return Promise.reject(error);

      // Only handle 401
      const status = error.response?.status;
      if (status !== 401) return Promise.reject(error);

      // Do not attempt refresh for unauthenticated endpoints (login/register/etc)
      if (originalRequest._skipAuth) return Promise.reject(error);

      // Prevent loops
      if (originalRequest._retry) {
        // refresh failed or still 401 after retry -> hard logout
        clearAuthTokens();
        redirectToLogin();
        return Promise.reject(error);
      }

      originalRequest._retry = true;

      // If already refreshing, queue this request
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(client(originalRequest));
          });
        });
      }

      // Start refresh
      isRefreshing = true;

      try {
        const newToken = await refreshAccessToken();

        // notify queued requests
        resolveQueue(newToken);

        if (!newToken) {
          clearAuthTokens();
          redirectToLogin();
          return Promise.reject(error);
        }

        // retry original request
        originalRequest.headers = originalRequest.headers || {};
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        return client(originalRequest);
      } finally {
        isRefreshing = false;
      }
    }
  );

  return client;
}

/**
 * ✅ Default export = BACKEND axios (same usage as your current file)
 */
const axiosInstance = createAxiosClient({
  baseURL: BACKEND_API_BASE,
  attachAuth: true,
  enableRefresh: true,
});

/**
 * ✅ Named export for AI host
 * - Usually AI endpoints do NOT need auth refresh. But auth attach is kept ON (toggle if needed).
 */
export const aiAxios = createAxiosClient({
  baseURL: AI_API_BASE,
  attachAuth: true,
  enableRefresh: false,
});

/**
 * ✅ Named export for ERP server host (from env)
 */
export const erpAxios = createAxiosClient({
  baseURL: ERP_HOST,
  attachAuth: false,
  enableRefresh: false,
});

/**
 * Optional: if you want more clients later without new files.
 * Example:
 *   const other = createAxiosClient({ baseURL: "https://x.com" })
 */
export const createClient = createAxiosClient;

export default axiosInstance;

/**
 * Keep same exports you used earlier (so no project break)
 */
export { MEDIA_HOST, HOST, AI_HOST, CLIENT_ADDRESS, API };
