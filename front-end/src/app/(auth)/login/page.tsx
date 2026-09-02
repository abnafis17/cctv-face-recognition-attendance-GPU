"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff, Lock, Mail, ArrowRight, Keyboard } from "lucide-react";
import toast from "react-hot-toast";

import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { loginApi } from "@/services/auth";
import { getAccessToken, getLandingRouteFromStorage } from "@/lib/authStorage";
import AuthSidePanel from "@/components/modules/auth/AuthSidePanel";
import PulsingLogo from "@/components/modules/auth/PulsingLogo";
import "@/components/modules/auth/authStyles.css";
import { VirtualKeyboard } from "@/components/reusable/VirtualKeyboard";

const schema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type FormValues = z.infer<typeof schema>;

function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback;
  return next;
}

export default function LoginPage() {
  const router = useRouter();
  const accessToken = getAccessToken();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [kbEnabled, setKbEnabled] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setKbEnabled(localStorage.getItem("virtual-keyboard-enabled") !== "false");
    }
  }, []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  const { onBlur: emailBlur, ...emailRegister } = form.register("email");
  const { onBlur: passwordBlur, ...passwordRegister } = form.register("password");

  useEffect(() => {
    if (!accessToken) return;
    const next = safeNextUrl(
      new URLSearchParams(window.location.search).get("next"),
      getLandingRouteFromStorage()
    );
    router.replace(next);
  }, [accessToken, router]);

  async function onSubmit(values: FormValues) {
    setLoading(true);

    try {
      await loginApi(values);
      toast.dismiss("login-error");

      const next = safeNextUrl(
        new URLSearchParams(window.location.search).get("next"),
        getLandingRouteFromStorage()
      );
      router.replace(next);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Login failed";

      toast.error(message, { id: "login-error" });
    } finally {
      setLoading(false);
    }
  }

  if (accessToken) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen lg:h-screen w-full lg:overflow-hidden bg-slate-50">
      {/* ═══════ LEFT PANEL — Immersive Visual ═══════ */}
      <AuthSidePanel />

      {/* ═══════ RIGHT PANEL — Form ═══════ */}
      <div className="col-span-1 lg:col-span-6 min-h-screen lg:h-screen p-6 md:p-10 relative bg-slate-50/40 dot-grid overflow-y-auto flex flex-col">
        <div
          className="absolute pointer-events-none"
          style={{
            width: 500,
            height: 500,
            left: "50%",
            top: "50%",
            transform: "translate(-50%, -50%)",
            background: "radial-gradient(circle, rgba(124, 58, 237, 0.04), transparent 70%)",
          }}
        />

        <div className="w-full min-h-full flex flex-col items-center py-6 md:py-8 relative z-10">
          <div className="w-full max-w-[420px] my-auto">
            <div
              className="gradient-border rounded-2xl p-8 md:p-10 shadow-xl shadow-zinc-200/35"
              style={{
                animation: "scaleIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards",
              }}
            >
              {/* Virtual Keyboard Toggle Switch Header */}
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-4 w-4 text-violet-600" />
                  <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                    Virtual Keyboard
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const current = localStorage.getItem("virtual-keyboard-enabled") !== "false";
                    localStorage.setItem("virtual-keyboard-enabled", current ? "false" : "true");
                    window.dispatchEvent(new Event("virtualKeyboardSettingsChanged"));
                    setKbEnabled(!current);
                  }}
                  className={cn(
                    "relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                    kbEnabled ? "bg-violet-600" : "bg-zinc-300"
                  )}
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out",
                      kbEnabled ? "translate-x-5" : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Mobile Logo */}
              <div className="flex items-center gap-3 mb-8 lg:hidden">
                <PulsingLogo size={40} />
                <div>
                  <h1 className="text-lg font-black tracking-tight text-zinc-900">
                    CRIPTON VISION
                  </h1>
                  <p className="text-[9px] font-bold uppercase tracking-[0.25em] text-zinc-400 mt-0.5">
                    Vision AI Platform
                  </p>
                </div>
              </div>

              {/* Header / Shield Badge */}
              <div className="flex flex-col items-center text-center mb-8">
                <div
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-3"
                  style={{
                    background: "rgba(124, 58, 237, 0.06)",
                    border: "1px solid rgba(124, 58, 237, 0.12)",
                  }}
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-violet-700 ml-1">
                    Secure AI Gateway
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-zinc-900">
                  Welcome back
                </h2>
                <p className="text-xs text-zinc-500">
                  Enter your admin credentials to access the AI control panel
                </p>
              </div>

              {/* Form */}
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <Label
                    className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                    htmlFor="email"
                  >
                    Email Address
                  </Label>
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                    <Mail
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "email" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      id="email"
                      type="text"
                      onFocus={() => setFocusedField("email")}
                      onBlur={(e) => {
                        setFocusedField(null);
                        emailBlur(e);
                      }}
                      placeholder="Enter your email (e.g. admin@company.com)"
                      className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                      autoComplete="email"
                      {...emailRegister}
                    />
                  </div>
                  {form.formState.errors.email?.message ? (
                    <p className="text-xs text-rose-600 font-semibold mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  ) : null}
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label
                      className="text-[10px] font-bold uppercase tracking-wider text-zinc-400"
                      htmlFor="password"
                    >
                      Password
                    </Label>
                    <Link
                      href="#"
                      className="text-[10px] font-bold text-violet-600 hover:underline"
                      tabIndex={-1}
                    >
                      Forgot?
                    </Link>
                  </div>
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                    <Lock
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "password" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      id="password"
                      type={show ? "text" : "password"}
                      onFocus={() => setFocusedField("password")}
                      onBlur={(e) => {
                        setFocusedField(null);
                        passwordBlur(e);
                      }}
                      placeholder="Enter your password"
                      className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                      autoComplete="current-password"
                      {...passwordRegister}
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="flex-shrink-0 p-1 rounded-lg transition-all duration-300 text-zinc-400 hover:text-zinc-600"
                      tabIndex={-1}
                      aria-label={show ? "Hide password" : "Show password"}
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password?.message ? (
                    <p className="text-xs text-rose-600 font-semibold mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center justify-between pt-1">
                  <label
                    className="flex items-center gap-2 cursor-pointer select-none"
                    htmlFor="remember"
                  >
                    <input
                      type="checkbox"
                      id="remember"
                      className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-zinc-500">Remember me</span>
                  </label>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="btn-shine group w-full py-3.5 rounded-md text-xs font-bold text-white flex items-center justify-center gap-2 mt-1 cursor-pointer"
                >
                  {loading ? (
                    <div className="spinner-ring" />
                  ) : (
                    <>
                      <span>Sign In to Workspace</span>
                      <ArrowRight className="w-4 h-4 transition-transform duration-250 group-hover:translate-x-1" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-zinc-500">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-bold text-violet-600 hover:underline">
                  Create one
                </Link>
              </div>

              <div className="mt-2 text-center text-[10px] text-zinc-400">
                By continuing, you agree to your organization&apos;s security policy.
              </div>

              {/* Compliance badges */}
              <div className="mt-8 pt-6 border-t border-zinc-200/50">
                <div className="flex items-center justify-center gap-6">
                  {["AES-256", "SOC 2", "GDPR"].map((badge) => (
                    <div key={badge} className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                        {badge}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Footer links */}
            <div className="mt-8 text-center space-y-3">
              <div className="text-[10px] text-zinc-400">
                © 2026 Cripton Vision. All rights reserved. •{" "}
                <Link href="#" className="hover:underline">
                  Privacy
                </Link>{" "}
                •{" "}
                <Link href="#" className="hover:underline">
                  Terms
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
      <VirtualKeyboard />
    </div>
  );
}
