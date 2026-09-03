"use client";

import React from "react";
import Link from "next/link";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  ArrowRight,
  User,
  Building2,
  ShieldCheck,
} from "lucide-react";
import { Label } from "@/components/ui/label";
import AuthSidePanel from "@/components/modules/auth/AuthSidePanel";
import PulsingLogo from "@/components/modules/auth/PulsingLogo";
import "@/components/modules/auth/authStyles.css";
import { useRegisterState } from "./useRegisterState";

export default function RegisterPage() {
  const {
    accessToken,
    show,
    setShow,
    loading,
    focusedField,
    setFocusedField,
    rolesList,
    companiesList,
    form,
    onSubmit,
  } = useRegisterState();

  if (accessToken) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen lg:h-screen w-full lg:overflow-hidden bg-slate-50">
      <AuthSidePanel />

      <div className="col-span-1 lg:col-span-6 h-screen p-6 md:p-10 relative bg-slate-50/40 dot-grid overflow-y-auto flex flex-col">
        <div className="w-full min-h-full flex flex-col items-center py-6 md:py-8 relative z-10">
          <div className="w-full max-w-[420px] my-auto">
            <div className="gradient-border rounded-2xl p-8 md:p-10 shadow-xl shadow-zinc-200/35">
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

              <div className="flex flex-col items-center text-center mb-6">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full mb-3 bg-violet-50 border border-violet-100">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-violet-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-violet-600"></span>
                  </span>
                  <span className="text-[9px] font-black uppercase tracking-widest text-violet-700 ml-1">
                    Secure AI Gateway
                  </span>
                </div>
                <h2 className="text-2xl md:text-3xl font-black tracking-tight mb-2 text-zinc-900">
                  Create account
                </h2>
                <p className="text-xs text-zinc-500">
                  Register a new admin workspace for attendance + cameras
                </p>
              </div>

              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <Label className="text-xs font-bold text-zinc-700">Full Name</Label>
                  <div className="relative mt-1">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Jane Doe"
                      {...form.register("name")}
                      className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2.5 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
                    />
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-zinc-700">Company Name *</Label>
                  <div className="relative mt-1">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="Acme Corp"
                      {...form.register("companyName")}
                      className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2.5 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
                    />
                  </div>
                  {form.formState.errors.companyName && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      {form.formState.errors.companyName.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-bold text-zinc-700">Email Address *</Label>
                  <div className="relative mt-1">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type="email"
                      placeholder="admin@acme.com"
                      {...form.register("email")}
                      className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2.5 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-bold text-zinc-700">Password *</Label>
                  <div className="relative mt-1">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <input
                      type={show ? "text" : "password"}
                      placeholder="••••••••"
                      {...form.register("password")}
                      className="w-full rounded-xl border border-zinc-200 pl-10 pr-10 py-2.5 text-xs text-zinc-900 outline-none focus:border-violet-600 focus:ring-2 focus:ring-violet-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                    >
                      {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="text-xs font-bold text-zinc-700">Initial User Role</Label>
                  <div className="relative mt-1">
                    <ShieldCheck className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
                    <select
                      {...form.register("role")}
                      className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2.5 text-xs text-zinc-900 outline-none focus:border-violet-600 bg-white"
                    >
                      {rolesList.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 px-4 rounded-xl bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 transition flex items-center justify-center gap-2 shadow-lg shadow-violet-600/25 cursor-pointer mt-2"
                >
                  {loading ? (
                    <span>Registering workspace...</span>
                  ) : (
                    <>
                      <span>Complete Registration</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-6 text-center text-xs text-zinc-500">
                Already have an account?{" "}
                <Link href="/login" className="font-bold text-violet-600 hover:underline">
                  Sign in instead
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
