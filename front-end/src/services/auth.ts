import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";
import {
  setTokens,
  clearAccessToken,
  getRefreshToken,
  setUser,
} from "@/lib/authStorage";

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
    const res = await axiosInstance.post(API.LOGIN, input, {
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

    const res = await axiosInstance.post(API.SIGNUP, payload, {
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
      await axiosInstance.post(API.LOGOUT, { refreshToken });
    }
  } catch {
    // ignore
  } finally {
    clearAccessToken();
  }
}
