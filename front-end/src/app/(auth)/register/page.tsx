"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Eye,
  EyeOff,
  Mail,
  User,
  Video,
  ShieldCheck,
  Building2,
} from "lucide-react";
import toast from "react-hot-toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { registerApi } from "@/services/auth";
import { getAccessToken } from "@/lib/authStorage";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

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
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
});

type FormValues = z.infer<typeof schema>;

function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register"))
    return fallback;
  return next;
}

export default function RegisterPage() {
  const router = useRouter();
  const accessToken = getAccessToken();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", companyName: "", email: "", password: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!accessToken) return;
    const next = safeNextUrl(
      new URLSearchParams(window.location.search).get("next"),
      "/cameras",
    );
    router.replace(next);
  }, [accessToken, router]);

  async function onSubmit(values: FormValues) {
    setLoading(true);

    try {
      await registerApi(values);

      // Optional: clear previous error toast if any
      toast.dismiss("register-error");

      const next = safeNextUrl(
        new URLSearchParams(window.location.search).get("next"),
        "/cameras",
      );
      router.replace(next);
    } catch (e: unknown) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : "Register failed";

      toast.error(message, { id: "register-error" });
    } finally {
      setLoading(false);
    }
  }

  if (accessToken) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="w-full max-w-md"
    >
      <Card className="rounded-2xl shadow-sm">
        <CardHeader className="space-y-2">
          <div className="flex items-center gap-2 text-zinc-900">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <Video className="h-5 w-5" />
            </div>
            <div>
              <CardTitle className="text-xl">Create account</CardTitle>
              <div className="text-sm text-zinc-500">
                Admin access for attendance + cameras
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          <div className="rounded-xl border bg-white p-3 text-sm text-zinc-600">
            <div className="flex items-center gap-2 font-medium text-zinc-900">
              <ShieldCheck className="h-4 w-4" />
              Security note
            </div>
            <div className="mt-1">
              Use a strong password. Accounts may access employee identity and
              camera streams.
            </div>
          </div>

          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name (optional)</Label>
              <div className="relative">
                <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="name"
                  className="pl-10 rounded-xl"
                  placeholder="Admin Name"
                  autoComplete="name"
                  {...form.register("name")}
                />
              </div>
              {form.formState.errors.name?.message ? (
                <p className="text-sm text-red-600">
                  {form.formState.errors.name.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="companyName">Company name</Label>
              <div className="relative">
                <Building2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="companyName"
                  className="pl-10 rounded-xl"
                  placeholder="Company name"
                  autoComplete="organization"
                  {...form.register("companyName")}
                />
              </div>
              {form.formState.errors.companyName?.message ? (
                <p className="text-sm text-red-600">
                  {form.formState.errors.companyName.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
                <Input
                  id="email"
                  className="pl-10 rounded-xl"
                  placeholder="admin@company.com"
                  autoComplete="email"
                  {...form.register("email")}
                />
              </div>
              {form.formState.errors.email?.message ? (
                <p className="text-sm text-red-600">
                  {form.formState.errors.email.message}
                </p>
              ) : null}
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  className="pr-10 rounded-xl"
                  type={show ? "text" : "password"}
                  placeholder="Minimum 8 characters"
                  autoComplete="new-password"
                  {...form.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShow((s) => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-900"
                  aria-label={show ? "Hide password" : "Show password"}
                >
                  {show ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {form.formState.errors.password?.message ? (
                <p className="text-sm text-red-600">
                  {form.formState.errors.password.message}
                </p>
              ) : null}
            </div>

            <Button
              type="submit"
              className="w-full rounded-xl"
              disabled={loading}
            >
              {loading ? "Creating..." : "Create account"}
            </Button>
          </form>

          <Separator />

          <div className="text-sm text-zinc-600">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-medium text-zinc-900 underline underline-offset-4"
            >
              Sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
