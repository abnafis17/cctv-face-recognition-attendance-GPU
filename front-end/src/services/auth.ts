import axiosInstance from "@/config/axiosInstance";
import {
  setTokens,
  clearAccessToken,
  getRefreshToken,
  setUser,
} from "@/lib/authStorage";

// Adjust to your backend API path constants if you have them.
const AUTH = {
  LOGIN: "/auth/login",
  REGISTER: "/auth/register",
  LOGOUT: "/auth/logout",
};

type AuthUser = {
  id: string;
  name?: string | null;
  email: string;
  companyName?: string | null;
  organizationId?: string | null;
  oragnizationId?: string | null;
  role: string;
  isActive: boolean;
};

type AuthResponse = {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
};

export async function loginApi(input: { email: string; password: string }) {
  try {
    const res = await axiosInstance.post(AUTH.LOGIN, input, {
      _skipAuth: true,
    } as any);

    const data: AuthResponse = res?.data?.results;
    if (!data?.accessToken || !data?.refreshToken)
      throw new Error("Invalid login response");
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  } catch (err: any) {
    const msg = err?.response?.data?.message ?? err?.message ?? "Login failed";
    throw new Error(msg);
  }
}

export async function registerApi(input: {
  name?: string;
  email: string;
  password: string;
  companyName: string;
}) {
  try {
    const payload = {
      ...input,
      name: input.name?.trim() ? input.name.trim() : undefined,
      companyName: input.companyName.trim(),
    };

    const res = await axiosInstance.post(AUTH.REGISTER, payload, {
      _skipAuth: true,
    } as any);

    const data: AuthResponse = res?.data?.results;
    if (!data?.accessToken || !data?.refreshToken)
      throw new Error("Invalid register response");

    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
    return data.user;
  } catch (err: any) {
    const msg =
      err?.response?.data?.message ?? err?.message ?? "Register failed";
    throw new Error(msg);
  }
}

export async function logoutApi() {
  try {
    const refreshToken = getRefreshToken();
    if (refreshToken) {
      await axiosInstance.post(AUTH.LOGOUT, { refreshToken });
    }
  } catch {
    // ignore
  } finally {
    clearAccessToken();
  }
}
