import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAccessToken } from "@/lib/authStorage";
import axiosInstance from "@/config/axiosInstance";
import { staticNav, getIconForRoute, NavItem } from "./sidebarConfig";

export type SidebarIdentity = {
  companyName: string;
  email: string;
};

export function useSidebarState(onNavigate?: () => void) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<SidebarIdentity>({
    companyName: "",
    email: "",
  });
  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [dynamicNav, setDynamicNav] = useState<NavItem[]>([]);

  useEffect(() => {
    if (pathname.startsWith("/visitors")) {
      setOpenMenus((prev) => ({ ...prev, Visitor: true }));
    }
    if (pathname.startsWith("/gatepass")) {
      setOpenMenus((prev) => ({ ...prev, "Gate Pass": true }));
    }
    if (pathname.startsWith("/settings")) {
      setOpenMenus((prev) => ({ ...prev, Settings: true }));
    }
  }, [pathname]);

  useEffect(() => {
    function loadUserInfo() {
      try {
        const raw = localStorage.getItem("userInfo");
        const userInfo = raw ? JSON.parse(raw) : null;
        if (userInfo?.permissions) {
          setPermissions(userInfo.permissions);
        }
        const companyName = String(
          userInfo?.companyName ?? userInfo?.company?.companyName ?? "Company Account"
        ).trim();
        const email = String(userInfo?.email ?? "Not available").trim();
        setIdentity({ companyName, email });
      } catch (err) {
        console.error("Failed to load user info in sidebar:", err);
      }
    }
    loadUserInfo();

    window.addEventListener("userInfoUpdated", loadUserInfo);
    return () => {
      window.removeEventListener("userInfoUpdated", loadUserInfo);
    };
  }, []);

  useEffect(() => {
    async function fetchModules() {
      try {
        const res = await axiosInstance.get("/auth/modules");
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          const mapped: NavItem[] = res.data.results.map((m: any) => ({
            href: m.route || undefined,
            label: m.name,
            icon: getIconForRoute(m.route, m.name),
            subItems:
              m.subModules && m.subModules.length > 0
                ? (() => {
                    const filtered = m.subModules.filter(
                      (sub: any) => sub.route && !sub.route.startsWith("/employees/")
                    );
                    return filtered.length > 0
                      ? filtered.map((sub: any) => ({
                          href: sub.route,
                          label: sub.name,
                          icon: getIconForRoute(sub.route, sub.name),
                        }))
                      : undefined;
                  })()
                : undefined,
          }));
          setDynamicNav(mapped);
        }
      } catch (err) {
        console.error("Failed to load dynamic nav modules:", err);
      }
    }
    fetchModules();
  }, []);

  const currentNav = dynamicNav.length > 0 ? dynamicNav : staticNav;

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  const onLogout = () => {
    clearAccessToken();
    router.replace("/login");
    onNavigate?.();
  };

  return {
    pathname,
    identity,
    openMenus,
    permissions,
    currentNav,
    toggleMenu,
    onLogout,
  };
}
