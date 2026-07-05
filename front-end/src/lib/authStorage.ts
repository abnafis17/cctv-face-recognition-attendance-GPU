const ACCESS_TOKEN_KEY = "accessToken";
const REFRESH_TOKEN_KEY = "refreshToken";
const USER_INFO = "userInfo";

const isBrowser = () => typeof window !== "undefined";

function decodeJwtPayload(token: string): any | null {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);

  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

export function setTokens(accessToken: string, refreshToken: string) {
  if (!isBrowser()) return;
  localStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
}

export function setUser(user: any) {
  if (!isBrowser()) return;
  localStorage.setItem(USER_INFO, JSON.stringify(user));
}

export function clearAccessToken() {
  if (!isBrowser()) return;
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_INFO);
}

export function getAccessToken() {
  return isBrowser() ? localStorage.getItem(ACCESS_TOKEN_KEY) : null;
}

export function getRefreshToken() {
  return isBrowser() ? localStorage.getItem(REFRESH_TOKEN_KEY) : null;
}

export function getCompanyIdFromToken(): string | null {
  if (!isBrowser()) return null;
  const token = getAccessToken();
  if (!token) return null;

  const payload = decodeJwtPayload(token);
  const value = payload?.companyId ?? payload?.company_id;
  return value ? String(value) : null;
}

export function getLandingRoute(permissions: Record<string, boolean> | null | undefined): string {
  const defaultOrder = [
    "/cameras",
    "/camera-list",
    "/enroll",
    "/employees",
    "/daily-attendance",
    "/attendance",
    "/unknown-recognition",
    "/gatepass",
    "/visitors",
    "/master-data",
    "/settings",
    "/permissions",
  ];
  if (permissions) {
    for (const route of defaultOrder) {
      if (permissions[route] !== false) {
        return route;
      }
    }
  }
  return "/cameras";
}

export function getLandingRouteFromStorage(): string {
  if (!isBrowser()) return "/cameras";
  try {
    const raw = localStorage.getItem("userInfo");
    const userInfo = raw ? JSON.parse(raw) : null;
    return getLandingRoute(userInfo?.permissions);
  } catch {
    return "/cameras";
  }
}
