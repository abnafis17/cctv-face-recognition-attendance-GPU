"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye, EyeOff, Lock, Mail, ArrowRight,
  User, Building2, ShieldCheck
} from "lucide-react";
import toast from "react-hot-toast";

import { Label } from "@/components/ui/label";
import { registerApi } from "@/services/auth";
import { getAccessToken, getLandingRouteFromStorage } from "@/lib/authStorage";
import axiosInstance from "@/config/axiosInstance";
import AuthSidePanel from "@/components/modules/auth/AuthSidePanel";
import PulsingLogo from "@/components/modules/auth/PulsingLogo";
import "@/components/modules/auth/authStyles.css";

const schema = z.object({
  name: z
    .string()
    .trim()
    .max(60)
    .refine((value) => value.length === 0 || value.length >= 2, {
      message: "Name must be at least 2 characters",
    }),
  companyName: z
    .string()
    .trim()
    .min(2, "Company name must be at least 2 characters")
    .max(120, "Company name must be at most 120 characters"),
  organization_id: z.string().trim().optional(),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  role: z.string().trim().optional(),
});

type FormValues = z.infer<typeof schema>;

function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback;
  return next;
}

export default function RegisterPage() {
  const router = useRouter();
  const accessToken = getAccessToken();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [rolesList, setRolesList] = useState<string[]>(["ADMIN", "GENERAL_USER", "OPERATOR"]);
  const [showCompaniesDropdown, setShowCompaniesDropdown] = useState(false);
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", companyName: "", organization_id: "", email: "", password: "", role: "ADMIN" },
    mode: "onSubmit",
  });

  const { onBlur: nameBlur, ...nameRegister } = form.register("name");
  const { onBlur: companyNameBlur, ...companyNameRegister } = form.register("companyName");
  const { onBlur: emailBlur, ...emailRegister } = form.register("email");
  const { onBlur: passwordBlur, ...passwordRegister } = form.register("password");
  const { onBlur: roleBlur, ...roleRegister } = form.register("role");

  useEffect(() => {
    if (!accessToken) return;
    const next = safeNextUrl(
      new URLSearchParams(window.location.search).get("next"),
      getLandingRouteFromStorage()
    );
    router.replace(next);
  }, [accessToken, router]);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await axiosInstance.get("/auth/roles", {
          _skipAuth: true,
        } as any);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setRolesList(res.data.results);
        }
      } catch (err) {
        console.error("Failed to fetch roles:", err);
      }
    }
    async function fetchCompanies() {
      try {
        const res = await axiosInstance.get("/auth/companies", {
          _skipAuth: true,
        } as any);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setCompaniesList(res.data.results);
        }
      } catch (err) {
        console.error("Failed to fetch ERP companies:", err);
      }
    }
    fetchRoles();
    fetchCompanies();
  }, []);

  async function onSubmit(values: FormValues) {
    setLoading(true);

    try {
      await registerApi(values);
      toast.dismiss("register-error");

      const next = safeNextUrl(
        new URLSearchParams(window.location.search).get("next"),
        getLandingRouteFromStorage()
      );
      router.replace(next);
    } catch (e: unknown) {
      const message =
        e instanceof Error ? e.message : typeof e === "string" ? e : "Registration failed";

      toast.error(message, { id: "register-error" });
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
            top: "15%",
            right: "10%",
            width: 400,
            height: 400,
            borderRadius: "50%",
            background: "radial-gradient(circle, rgba(124, 58, 237, 0.04), transparent 70%)",
          }}
        />

        <div className="w-full max-w-[440px] mx-auto my-auto py-6">
          <div className="gradient-border rounded-2xl p-7 md:p-9 transition-all duration-300">
            {/* Top mobile header */}
            <div className="flex lg:hidden items-center justify-between mb-6 pb-4 border-b border-zinc-150">
              <div className="flex items-center gap-2.5">
                <PulsingLogo size={36} />
                <div>
                  <h1 className="text-sm font-black tracking-tight text-zinc-900 leading-none">
                    CRIPTON VISION
                  </h1>
                  <p className="text-[8px] font-bold uppercase tracking-[0.2em] text-violet-600 mt-0.5">
                    Vision AI
                  </p>
                </div>
              </div>
            </div>

            {/* Header */}
            <div className="mb-6">
              <div
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full mb-3"
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
                  Enterprise Onboarding
                </span>
              </div>
              <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-zinc-900">
                Create Workspace
              </h2>
              <p className="text-xs text-zinc-500">
                Setup your company profile to activate AI computer vision
              </p>
            </div>

            {/* Form */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Full Name */}
              <div>
                <Label
                  className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                  htmlFor="name"
                >
                  Full Name (Optional)
                </Label>
                <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3">
                  <User
                    className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                    style={{ color: focusedField === "name" ? "#7c3aed" : "#a1a1aa" }}
                  />
                  <input
                    id="name"
                    type="text"
                    onFocus={() => setFocusedField("name")}
                    onBlur={(e) => {
                      setFocusedField(null);
                      nameBlur(e);
                    }}
                    placeholder="e.g. John Doe"
                    className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                    autoComplete="name"
                    {...nameRegister}
                  />
                </div>
                {form.formState.errors.name?.message ? (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {form.formState.errors.name.message}
                  </p>
                ) : null}
              </div>

              {/* Company Name */}
              <div>
                <Label
                  className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                  htmlFor="companyName"
                >
                  Company Name
                </Label>
                <div className="relative">
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3">
                    <Building2
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "companyName" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      id="companyName"
                      type="text"
                      onFocus={() => {
                        setFocusedField("companyName");
                        setShowCompaniesDropdown(true);
                      }}
                      onBlur={(e) => {
                        setFocusedField(null);
                        setTimeout(() => setShowCompaniesDropdown(false), 200);
                        companyNameBlur(e);
                      }}
                      placeholder="Select or type company name"
                      className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                      autoComplete="off"
                      {...companyNameRegister}
                      onChange={(e) => {
                        companyNameRegister.onChange(e);
                        const value = e.target.value;
                        const matched = companiesList.find(
                          (c) => c.name.toLowerCase() === value.trim().toLowerCase()
                        );
                        if (matched) {
                          form.setValue("organization_id", matched.id);
                        } else {
                          form.setValue("organization_id", "");
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCompaniesDropdown(!showCompaniesDropdown)}
                      className="flex-shrink-0 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4 rotate-90 transition-transform duration-200" />
                    </button>
                  </div>

                  {showCompaniesDropdown && companiesList.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-md shadow-lg max-h-40 overflow-y-auto z-50 py-1">
                      {companiesList
                        .filter((c) =>
                          c.name
                            .toLowerCase()
                            .includes((form.watch("companyName") || "").toLowerCase())
                        )
                        .map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            onMouseDown={() => {
                              form.setValue("companyName", c.name, { shouldValidate: true });
                              form.setValue("organization_id", c.id);
                            }}
                            className="w-full text-left px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-violet-50 hover:text-violet-700 transition-colors cursor-pointer"
                          >
                            {c.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
                {form.formState.errors.companyName?.message ? (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {form.formState.errors.companyName.message}
                  </p>
                ) : null}
              </div>

              {/* Email */}
              <div>
                <Label
                  className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                  htmlFor="email"
                >
                  Email Address
                </Label>
                <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3">
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
                    placeholder="admin@company.com"
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

              {/* User Role Selection (Combobox) */}
              <div>
                <Label
                  className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                  htmlFor="role"
                >
                  User Role
                </Label>
                <div className="relative">
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3">
                    <ShieldCheck
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "role" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      id="role"
                      type="text"
                      onFocus={() => {
                        setFocusedField("role");
                        setShowRolesDropdown(true);
                      }}
                      onBlur={(e) => {
                        setFocusedField(null);
                        setTimeout(() => setShowRolesDropdown(false), 200);
                        roleBlur(e);
                      }}
                      placeholder="Select or type user role (e.g. ADMIN)"
                      className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                      autoComplete="off"
                      {...roleRegister}
                    />
                    <button
                      type="button"
                      onClick={() => setShowRolesDropdown(!showRolesDropdown)}
                      className="flex-shrink-0 p-1 text-zinc-400 hover:text-zinc-600 cursor-pointer"
                    >
                      <ArrowRight className="w-4 h-4 rotate-90 transition-transform duration-200" />
                    </button>
                  </div>

                  {showRolesDropdown && (
                    <div className="absolute left-0 right-0 mt-1 bg-white/95 backdrop-blur-md border border-zinc-200/80 rounded-md shadow-lg max-h-40 overflow-y-auto z-50 py-1">
                      {rolesList.map((r) => (
                        <button
                          key={r}
                          type="button"
                          onMouseDown={() => {
                            form.setValue("role", r);
                          }}
                          className="w-full text-left px-4 py-2 text-xs font-semibold text-zinc-700 hover:bg-violet-50 hover:text-violet-700 transition-colors cursor-pointer"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                {form.formState.errors.role?.message ? (
                  <p className="text-xs text-rose-600 font-semibold mt-1">
                    {form.formState.errors.role.message}
                  </p>
                ) : null}
              </div>

              {/* Password */}
              <div>
                <Label
                  className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400"
                  htmlFor="password"
                >
                  Password
                </Label>
                <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3">
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
                    placeholder="Minimum 8 characters"
                    className="w-full bg-transparent outline-none text-xs font-semibold text-zinc-800 placeholder:text-zinc-400"
                    autoComplete="new-password"
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

              <button
                type="submit"
                disabled={loading}
                className="btn-shine group w-full py-3.5 rounded-md text-xs font-bold text-white flex items-center justify-center gap-2 mt-2 cursor-pointer"
              >
                {loading ? (
                  <div className="spinner-ring" />
                ) : (
                  <>
                    <span>Create Workspace Account</span>
                    <ArrowRight className="w-4 h-4 transition-transform duration-250 group-hover:translate-x-1" />
                  </>
                )}
              </button>
            </form>

            {/* Switch to login */}
            <div className="mt-6 text-center text-xs text-zinc-500">
              Already have an account?{" "}
              <Link href="/login" className="font-bold text-violet-600 hover:underline">
                Sign in
              </Link>
            </div>

            <div className="mt-2 text-center text-[10px] text-zinc-400">
              By continuing, you agree to your organization&apos;s security policy.
            </div>

            {/* Compliance badges */}
            <div className="mt-6 pt-6 border-t border-zinc-200/50">
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
  );
}
