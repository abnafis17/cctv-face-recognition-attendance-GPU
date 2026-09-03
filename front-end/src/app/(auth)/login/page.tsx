"use client";

import React from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock, Mail, ArrowRight, Keyboard } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import AuthSidePanel from "@/components/modules/auth/AuthSidePanel";
import PulsingLogo from "@/components/modules/auth/PulsingLogo";
import "@/components/modules/auth/authStyles.css";
import { VirtualKeyboard } from "@/components/reusable/VirtualKeyboard";
import { useLoginState } from "./useLoginState";

export default function LoginPage() {
  const {
    accessToken,
    show,
    setShow,
    loading,
    focusedField,
    setFocusedField,
    kbEnabled,
    toggleKb,
    form,
    onSubmit,
  } = useLoginState();

  if (accessToken) return null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 min-h-screen lg:h-screen w-full lg:overflow-hidden bg-slate-50">
      <AuthSidePanel />

      <div className="col-span-1 lg:col-span-6 min-h-screen lg:h-screen p-6 md:p-10 relative bg-slate-50/40 dot-grid overflow-y-auto flex flex-col">
        <div className="w-full min-h-full flex flex-col items-center py-6 md:py-8 relative z-10">
          <div className="w-full max-w-[420px] my-auto">
            <div className="gradient-border rounded-2xl p-8 md:p-10 shadow-xl shadow-zinc-200/35">
              {/* Virtual Keyboard Toggle */}
              <div className="flex items-center justify-between mb-6 pb-3 border-b border-zinc-100">
                <div className="flex items-center gap-2">
                  <Keyboard className="h-4 w-4 text-violet-600" />
                  <span className="text-[11px] font-bold text-zinc-600 uppercase tracking-wider">
                    Virtual Keyboard
                  </span>
                </div>
                <button
                  type="button"
                  onClick={toggleKb}
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

              {/* Header */}
              <div className="flex flex-col items-center text-center mb-8">
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
                  Welcome back
                </h2>
                <p className="text-xs text-zinc-500">
                  Enter your admin credentials to access the AI control panel
                </p>
              </div>

              {/* Form */}
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <div>
                  <Label className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400">
                    Email Address
                  </Label>
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                    <Mail
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "email" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      type="email"
                      placeholder="admin@company.com"
                      {...form.register("email")}
                      onFocus={() => setFocusedField("email")}
                      onBlur={() => setFocusedField(null)}
                      className="w-full bg-transparent text-sm font-medium outline-none text-zinc-900 placeholder:text-zinc-400"
                    />
                  </div>
                  {form.formState.errors.email && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      {form.formState.errors.email.message}
                    </p>
                  )}
                </div>

                <div>
                  <Label className="block text-[10px] font-bold mb-2 uppercase tracking-wider text-zinc-400">
                    Password
                  </Label>
                  <div className="login-glass-input rounded-md flex items-center gap-3 px-4 py-3.5">
                    <Lock
                      className="w-[18px] h-[18px] flex-shrink-0 transition-all duration-300"
                      style={{ color: focusedField === "password" ? "#7c3aed" : "#a1a1aa" }}
                    />
                    <input
                      type={show ? "text" : "password"}
                      placeholder="••••••••"
                      {...form.register("password")}
                      onFocus={() => setFocusedField("password")}
                      onBlur={() => setFocusedField(null)}
                      className="w-full bg-transparent text-sm font-medium outline-none text-zinc-900 placeholder:text-zinc-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShow(!show)}
                      className="text-zinc-400 hover:text-zinc-600 transition-colors"
                    >
                      {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {form.formState.errors.password && (
                    <p className="text-[11px] font-semibold text-rose-500 mt-1">
                      {form.formState.errors.password.message}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3.5 px-4 rounded-xl bg-violet-600 text-white font-bold text-xs hover:bg-violet-700 transition flex items-center justify-center gap-2 shadow-lg shadow-violet-600/25 cursor-pointer mt-4"
                >
                  {loading ? (
                    <span>Authenticating...</span>
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              <div className="mt-8 text-center text-xs text-zinc-500">
                Don&apos;t have an account?{" "}
                <Link href="/register" className="font-bold text-violet-600 hover:underline">
                  Create company account
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {kbEnabled && <VirtualKeyboard />}
    </div>
  );
}
