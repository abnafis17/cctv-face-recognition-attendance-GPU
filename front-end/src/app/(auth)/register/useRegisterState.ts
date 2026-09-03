import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import toast from "react-hot-toast";
import { registerApi } from "@/services/auth";
import { getAccessToken, getLandingRouteFromStorage } from "@/lib/authStorage";
import axiosInstance from "@/config/axiosInstance";

export const registerSchema = z.object({
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

export type RegisterFormValues = z.infer<typeof registerSchema>;

export function safeNextUrl(next: string | null, fallback: string) {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.startsWith("/login") || next.startsWith("/register")) return fallback;
  return next;
}

export function useRegisterState() {
  const router = useRouter();
  const accessToken = getAccessToken();
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [showRolesDropdown, setShowRolesDropdown] = useState(false);
  const [rolesList, setRolesList] = useState<string[]>(["ADMIN", "GENERAL_USER", "OPERATOR"]);
  const [showCompaniesDropdown, setShowCompaniesDropdown] = useState(false);
  const [companiesList, setCompaniesList] = useState<{ id: string; name: string }[]>([]);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: "",
      companyName: "",
      organization_id: "",
      email: "",
      password: "",
      role: "ADMIN",
    },
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

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await axiosInstance.get("/auth/roles", { _skipAuth: true } as any);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setRolesList(res.data.results);
        }
      } catch (err) {
        console.error("Failed to fetch roles:", err);
      }
    }
    async function fetchCompanies() {
      try {
        const res = await axiosInstance.get("/auth/companies", { _skipAuth: true } as any);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setCompaniesList(res.data.results);
        }
      } catch (err) {
        console.error("Failed to fetch companies:", err);
      }
    }
    fetchRoles();
    fetchCompanies();
  }, []);

  const onSubmit = async (values: RegisterFormValues) => {
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
        e instanceof Error ? e.message : typeof e === "string" ? e : "Register failed";
      toast.error(message, { id: "register-error" });
    } finally {
      setLoading(false);
    }
  };

  return {
    accessToken,
    show,
    setShow,
    loading,
    focusedField,
    setFocusedField,
    showRolesDropdown,
    setShowRolesDropdown,
    rolesList,
    showCompaniesDropdown,
    setShowCompaniesDropdown,
    companiesList,
    form,
    onSubmit,
  };
}
