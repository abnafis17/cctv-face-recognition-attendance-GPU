"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ShieldAlert, ArrowLeft } from "lucide-react";
import Link from "next/link";

import Sidebar from "@/components/layout/Sidebar";
import AuthGuard from "@/components/layout/AuthGuard";
import { getLandingRoute } from "@/lib/authStorage";
import axiosInstance from "@/config/axiosInstance";

function getModuleKeyForPath(pathname: string): string | null {
  if (pathname.startsWith("/cameras")) return "/cameras";
  if (pathname.startsWith("/camera-list")) return "/camera-list";
  if (pathname.startsWith("/enroll")) return "/enroll";
  if (pathname.startsWith("/employees")) return "/employees";
  if (pathname.startsWith("/daily-attendance")) return "/daily-attendance";
  if (pathname.startsWith("/attendance")) return "/attendance";
  if (pathname.startsWith("/unknown-recognition")) return "/unknown-recognition";
  if (pathname.startsWith("/gatepass")) return "/gatepass";
  if (pathname.startsWith("/visitors")) return "/visitors";
  if (pathname.startsWith("/master-data")) return "/master-data";
  if (pathname.startsWith("/settings/urls")) return "/settings/urls";
  if (pathname.startsWith("/settings")) return "/settings/urls";
  if (pathname.startsWith("/permissions")) return "/permissions";
  return null;
}

function getModuleName(moduleKey: string): string {
  switch (moduleKey) {
    case "/cameras": return "Cameras (Live)";
    case "/camera-list": return "Camera List";
    case "/enroll": return "Enrollment (Auto)";
    case "/employees": return "Employees";
    case "/daily-attendance": return "Daily Attendance";
    case "/attendance": return "Recognition History";
    case "/unknown-recognition": return "Unknown History";
    case "/gatepass": return "Gate Pass";
    case "/visitors": return "Visitor";
    case "/master-data": return "Master Data";
    case "/settings/urls": return "URLs";
    case "/permissions": return "Permissions";
    default: return "this";
  }
}

export default function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    html.classList.add("overflow-hidden", "h-screen");
    body.classList.add("overflow-hidden", "h-screen");

    return () => {
      html.classList.remove("overflow-hidden", "h-screen");
      body.classList.remove("overflow-hidden", "h-screen");
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function syncProfile() {
      try {
        const res = await axiosInstance.get("/auth/me");
        if (cancelled) return;

        if (res.data?.ok && res.data?.results) {
          const me = res.data.results;
          const raw = localStorage.getItem("userInfo");
          const current = raw ? JSON.parse(raw) : {};
          const nextUserInfo = {
            ...current,
            ...me,
          };
          localStorage.setItem("userInfo", JSON.stringify(nextUserInfo));
          setPermissions(me.permissions || {});
          window.dispatchEvent(new Event("userInfoUpdated"));
        }
      } catch (err) {
        console.error("Failed to sync user profile in layout:", err);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    // First load from localStorage to render immediately if possible
    try {
      const raw = localStorage.getItem("userInfo");
      const userInfo = raw ? JSON.parse(raw) : null;
      if (userInfo?.permissions) {
        setPermissions(userInfo.permissions);
      }
    } catch (err) {
      console.error("Failed to load initial permissions:", err);
    }

    void syncProfile();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handleUpdate() {
      try {
        const raw = localStorage.getItem("userInfo");
        const userInfo = raw ? JSON.parse(raw) : null;
        if (userInfo?.permissions) {
          setPermissions(userInfo.permissions);
        }
      } catch (err) {
        console.error("Failed to load permissions on event update:", err);
      }
    }
    window.addEventListener("userInfoUpdated", handleUpdate);
    return () => {
      window.removeEventListener("userInfoUpdated", handleUpdate);
    };
  }, []);

  const moduleKey = getModuleKeyForPath(pathname);
  const isAllowed = !moduleKey || permissions[moduleKey] !== false;

  useEffect(() => {
    if (!loading && !isAllowed) {
      const landing = getLandingRoute(permissions);
      if (landing !== pathname) {
        router.replace(landing);
      }
    }
  }, [loading, isAllowed, permissions, pathname, router]);

  return (
    <AuthGuard>
      <div className="flex h-dvh overflow-hidden bg-slate-50">
        <Sidebar />
        <main className="ui-readable min-w-0 flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-5 md:pb-3 md:pt-4 lg:p-4 flex flex-col">
          {loading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="w-8 h-8 border-4 border-violet-200 border-t-violet-600 rounded-full animate-spin" />
            </div>
          ) : isAllowed ? (
            children
          ) : (
            <div className="flex-1 flex flex-col justify-center items-center p-6">
              <div className="w-full max-w-md bg-white border border-zinc-200/80 rounded-2xl p-8 shadow-xl text-center space-y-6">
                <div className="mx-auto w-16 h-16 rounded-full bg-rose-50 flex items-center justify-center border border-rose-100 animate-pulse">
                  <ShieldAlert className="w-8 h-8 text-rose-600" />
                </div>
                <div className="space-y-2">
                  <h1 className="text-xl font-bold tracking-tight text-zinc-900">Access Restricted</h1>
                  <p className="text-sm text-zinc-500 leading-relaxed">
                    Your user role does not have permission to access the{" "}
                    <span className="font-semibold text-zinc-800">
                      {getModuleName(moduleKey!)}
                    </span>{" "}
                    module. Please contact your organization administrator if you believe this is an error.
                  </p>
                </div>
                <div>
                  <Link
                    href={getLandingRoute(permissions)}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-zinc-900 text-white hover:bg-zinc-800 text-sm font-semibold transition"
                  >
                    <ArrowLeft className="w-4 h-4" />
                    Back to Home
                  </Link>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </AuthGuard>
  );
}
