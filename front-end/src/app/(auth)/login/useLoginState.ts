import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { loginApi } from "@/services/auth";
import { getAccessToken, getLandingRouteFromStorage } from "@/lib/authStorage";

export const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback;
  return next;
}

export function useLoginState() {
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

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
    mode: "onSubmit",
  });

  useEffect(() => {
    if (!accessToken) return;
    const next = safeNextUrl(
      new URLSearchParams(window.location.search).get("next"),
      getLandingRouteFromStorage()
    );
    router.replace(next);
  }, [accessToken, router]);

  const onSubmit = async (values: LoginFormValues) => {
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
  };

  const toggleKb = () => {
    const current = localStorage.getItem("virtual-keyboard-enabled") !== "false";
    localStorage.setItem("virtual-keyboard-enabled", current ? "false" : "true");
    window.dispatchEvent(new Event("virtualKeyboardSettingsChanged"));
    setKbEnabled(!current);
  };

  return {
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
  };
}
