"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  UserPlus,
  Video,
  Activity,
  Users,
  CalendarClock,
  LogOut,
  Building2,
  Cctv,
  History,
  UserX,
  ListVideo,
  Menu,
  X,
  Settings,
  Link2,
  ChevronDown,
  ChevronUp,
  Database,
  ChevronLeft,
  ChevronRight,
  ScanFace,
  IdCard,
  UserSearch,
  ClipboardList,
  PieChart,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useEffect, useState } from "react";
import { clearAccessToken } from "@/lib/authStorage";
import { cn } from "@/lib/utils";
import axiosInstance from "@/config/axiosInstance";

function getIconForRoute(route: string | null | undefined, label: string) {
  if (route === "/cameras") return LucideIcons.Cctv;
  if (route === "/camera-list") return LucideIcons.ListVideo;
  if (route === "/enroll") return LucideIcons.ScanFace;
  if (route === "/employees") return LucideIcons.Users;
  if (route === "/daily-attendance") return LucideIcons.CalendarClock;
  if (route === "/attendance") return LucideIcons.History;
  if (route === "/unknown-recognition") return LucideIcons.UserX;
  if (route === "/gatepass") return LucideIcons.ScanFace;
  if (route === "/gatepass/history") return LucideIcons.ClipboardList;
  if (route === "/visitors/add") return LucideIcons.UserPlus;
  if (route === "/visitors") return LucideIcons.ClipboardList;
  if (route === "/visitors/employee-wise-visit") return LucideIcons.BarChart3;
  if (route === "/visitors/visitor-wise-visit") return LucideIcons.PieChart;
  if (route === "/master-data") return LucideIcons.Database;
  if (route === "/settings/urls") return LucideIcons.Link2;
  if (route === "/settings/users") return LucideIcons.Users;
  if (route === "/settings") return LucideIcons.Settings;
  if (route === "/permissions") return LucideIcons.ShieldCheck;

  if (label === "Gate Pass") return LucideIcons.IdCard;
  if (label === "Visitor") return LucideIcons.UserSearch;
  if (label === "Settings" || label === "Setting") return LucideIcons.Settings;

  return LucideIcons.ShieldAlert;
}

interface SubNavItem {
  href: string;
  label: string;
  icon: any;
}

interface NavItem {
  href?: string;
  label: string;
  icon: any;
  subItems?: SubNavItem[];
}

const staticNav: NavItem[] = [
  { href: "/cameras", label: "Cameras (Live)", icon: Cctv },
  { href: "/camera-list", label: "Camera List", icon: ListVideo },
  { href: "/enroll", label: "Enrollment (Auto)", icon: ScanFace },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/daily-attendance", label: "Daily Attendance", icon: CalendarClock },
  { href: "/attendance", label: "Recognition History", icon: History },
  { href: "/unknown-recognition", label: "Unknown History", icon: UserX },
  {
    label: "Gate Pass",
    icon: IdCard,
    subItems: [
      { href: "/gatepass", label: "Gate Pass Form", icon: ScanFace },
      { href: "/gatepass/history", label: "Gate Pass Log", icon: ClipboardList },
    ],
  },
  {
    label: "Visitor",
    icon: UserSearch,
    subItems: [
      { href: "/visitors/add", label: "Add Visitor", icon: UserPlus },
      { href: "/visitors", label: "Visitor List", icon: ClipboardList },
      { href: "/visitors/employee-wise-visit", label: "Employee Wise Visit", icon: BarChart3 },
      { href: "/visitors/visitor-wise-visit", label: "Visitor Wise Visit", icon: PieChart },
    ],
  },
  { href: "/master-data", label: "Master Data", icon: Database },
  {
    label: "Settings",
    icon: Settings,
    subItems: [
      { href: "/settings/urls", label: "URLs", icon: Link2 },
      { href: "/settings/users", label: "Users", icon: Users },
    ],
  },
  { href: "/permissions", label: "Permissions", icon: ShieldCheck },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/visitors") return pathname === "/visitors";
  if (href === "/gatepass") return pathname === "/gatepass";
  return pathname === href || pathname.startsWith(href + "/");
}

type SidebarIdentity = {
  companyName: string;
  email: string;
};

function SidebarContent({
  compact = false,
  onNavigate,
  isCollapsed,
  onToggleCollapse,
}: {
  compact?: boolean;
  onNavigate?: () => void;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
}) {
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
            subItems: m.subModules && m.subModules.length > 0
              ? (() => {
                  const filtered = m.subModules.filter((sub: any) => sub.route && !sub.route.startsWith("/employees/"));
                  return filtered.length > 0
                    ? filtered.map((sub: any) => ({
                        href: sub.route,
                        label: sub.name,
                        icon: getIconForRoute(sub.route, sub.name)
                      }))
                    : undefined;
                })()
              : undefined
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

  function onLogout() {
    clearAccessToken();
    router.replace("/login");
    onNavigate?.();
  }

  const filteredNav = currentNav.filter((n) => {
    if (Object.keys(permissions).length === 0) return true;

    if (n.subItems && n.subItems.length > 0) {
      const allowedSubs = n.subItems.filter(
        (sub) => permissions[sub.href] !== false
      );
      return allowedSubs.length > 0;
    }

    if (n.href) {
      return permissions[n.href] !== false;
    }

    return true;
  });

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b border-zinc-150 bg-[#f8fafc]",
          compact ? "p-4 flex items-center justify-center" : "px-5 py-4 flex items-center justify-between gap-3",
        )}
      >
        {!compact ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white ring-2 ring-violet-500/25 shadow-lg shadow-violet-500/10">
                <Video className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-base font-black tracking-tight text-zinc-900 leading-tight">
                  CRIPTON VISION
                </div>
                <div className="truncate text-[10px] font-bold uppercase tracking-[0.2em] text-violet-600">
                  AI Attendance
                </div>
              </div>
            </div>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden md:flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition"
                title="Collapse sidebar"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-md">
              <Video className="h-5 w-5" />
            </div>
            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                className="hidden md:flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 transition"
                title="Expand sidebar"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="space-y-1">
          {filteredNav.map((n) => {
            if (n.subItems && n.subItems.length > 0) {
              const visibleSubItems = n.subItems.filter(
                (sub) => Object.keys(permissions).length === 0 || permissions[sub.href] !== false
              );
              if (visibleSubItems.length === 0) return null;

              const isGroupActive = visibleSubItems.some((sub) =>
                isActive(pathname, sub.href),
              );
              const isOpen = openMenus[n.label] ?? isGroupActive;
              const ParentIcon = n.icon;

              return (
                <div key={n.label} className="space-y-1">
                  <button
                    onClick={() => toggleMenu(n.label)}
                    title={compact ? n.label : undefined}
                    className={cn(
                      "group flex w-full items-center rounded-lg transition-all duration-200 border-l-2 cursor-pointer",
                      compact ? "justify-center px-2 py-3 border-l-transparent" : "justify-between px-3 py-2.5",
                      isGroupActive
                        ? "bg-violet-50/70 text-violet-900 border-l-violet-600 font-bold"
                        : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 border-l-transparent",
                    )}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ParentIcon
                        className={cn(
                          compact ? "h-5 w-5" : "h-4 w-4",
                          isGroupActive
                            ? "text-violet-600"
                            : "text-zinc-450 group-hover:text-zinc-750",
                        )}
                      />
                      {!compact && (
                        <span className="truncate text-sm font-medium">
                          {n.label}
                        </span>
                      )}
                    </div>
                    {!compact && (
                      <span className="text-zinc-400">
                        {isOpen ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <div className={cn("space-y-1", compact ? "pl-0" : "pl-7")}>
                      {visibleSubItems.map((sub) => {
                        const subActive = isActive(pathname, sub.href);
                        const SubIcon = sub.icon;

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={onNavigate}
                            title={compact ? sub.label : undefined}
                            className={cn(
                              "group flex items-center rounded-lg transition-all duration-200 font-medium",
                              compact ? "justify-center px-2 py-2" : "gap-2.5 px-3 py-2",
                              subActive
                                ? "bg-violet-100/70 text-violet-900 font-bold"
                                : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-900",
                            )}
                          >
                            <SubIcon
                              className={cn(
                                compact ? "h-4 w-4" : "h-4 w-4",
                                subActive
                                  ? "text-violet-600"
                                  : "text-zinc-400 group-hover:text-zinc-750",
                              )}
                            />
                            {!compact && (
                              <span className="truncate text-sm">{sub.label}</span>
                            )}
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            }

            const active = n.href ? isActive(pathname, n.href) : false;
            const Icon = n.icon;

            return (
              <Link
                key={n.href || "#"}
                href={n.href || "#"}
                onClick={onNavigate}
                title={compact ? n.label : undefined}
                className={cn(
                  "group flex items-center rounded-lg transition-all duration-200 border-l-2",
                  compact ? "justify-center px-2 py-3 border-l-transparent" : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-violet-50 text-violet-700 border-l-violet-600 font-bold shadow-xs"
                    : "text-zinc-650 hover:bg-zinc-50 hover:text-zinc-900 border-l-transparent",
                )}
              >
                <Icon
                  className={cn(
                    compact ? "h-5 w-5" : "h-4 w-4",
                    active
                      ? "text-violet-600"
                      : "text-zinc-450 group-hover:text-zinc-750",
                  )}
                />
                {compact ? (
                  <span className="sr-only">{n.label}</span>
                ) : (
                  <span className="truncate text-sm font-medium">{n.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-zinc-150 bg-[#f8fafc]",
          compact ? "px-2 pb-3 pt-3" : "p-3",
        )}
      >
        {!compact && identity.companyName && (
          <div className="mb-3 px-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider truncate text-center" title={identity.companyName}>
            {identity.companyName}
          </div>
        )}

        <button
          onClick={onLogout}
          title={compact ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center rounded-lg border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-655 hover:bg-zinc-50 hover:text-zinc-800 transition cursor-pointer",
            compact
              ? "justify-center"
              : "justify-center gap-2 active:scale-[0.99] shadow-xs",
          )}
        >
          <LogOut className="h-4 w-4" />
          {compact ? <span className="sr-only">Logout</span> : "Logout"}
        </button>

        {!compact && (
          <div className="mt-3 px-1 text-center text-[10px] text-zinc-400">
            (c) {new Date().getFullYear()} Pakiza Software Ltd
          </div>
        )}
      </div>
    </>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("sidebar-collapsed") === "true";
    }
    return false;
  });

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  useEffect(() => {
    if (pathname === "/visitors/add") {
      setIsCollapsed(true);
    } else {
      if (typeof window !== "undefined") {
        setIsCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
      }
    }
  }, [pathname]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;

    const previousOverflow = document.body.style.overflow;
    const previousTouchAction = document.body.style.touchAction;

    document.body.style.overflow = "hidden";
    document.body.style.touchAction = "none";

    return () => {
      document.body.style.overflow = previousOverflow;
      document.body.style.touchAction = previousTouchAction;
    };
  }, [mobileOpen]);

  useEffect(() => {
    if (!mobileOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileOpen]);

  return (
    <>
      <header className="fixed inset-x-0 top-0 z-40 border-b border-zinc-100 bg-white/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white shadow-md shadow-violet-500/20">
              <Video className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-bold text-zinc-900 tracking-tight">
                Cripton Vision
              </div>
              <div className="truncate text-[9.5px] font-bold uppercase tracking-wider text-violet-600 mt-0.5">
                AI Attendance
              </div>
            </div>
          </div>

          <button
            type="button"
            aria-label={mobileOpen ? "Close sidebar" : "Open sidebar"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-sidebar"
            onClick={() => setMobileOpen((prev) => !prev)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-zinc-200 bg-white text-zinc-700 shadow-sm transition hover:bg-zinc-100 active:scale-[0.98]"
          >
            {mobileOpen ? (
              <X className="h-5 w-5" />
            ) : (
              <Menu className="h-5 w-5" />
            )}
          </button>
        </div>
      </header>

      <div
        className={cn(
          "fixed inset-0 z-50 md:hidden",
          mobileOpen ? "pointer-events-auto" : "pointer-events-none",
        )}
        aria-hidden={!mobileOpen}
      >
        <button
          aria-label="Close sidebar"
          onClick={() => setMobileOpen(false)}
          className={cn(
            "absolute inset-0 bg-zinc-950/25 backdrop-blur-[1px] transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />

        <aside
          id="mobile-sidebar"
          className={cn(
            "ui-readable absolute inset-y-0 left-0 flex w-[85vw] max-w-[330px] flex-col bg-white pt-[env(safe-area-inset-top)] text-zinc-800 shadow-[5px_0_30px_rgba(0,0,0,0.12)] transition-transform duration-300 ease-out border-r border-zinc-150",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
          <div className="h-[calc(env(safe-area-inset-bottom)+0.75rem)] shrink-0" />
        </aside>
      </div>

      <aside className={cn(
        "ui-readable hidden h-dvh flex-col bg-slate-50 p-3 md:flex transition-all duration-350 ease-in-out shrink-0",
        isCollapsed ? "w-20" : "w-72"
      )}>
        <div className="flex flex-col h-full bg-white rounded-2xl border border-zinc-200/80 shadow-[0_8px_30px_rgb(0,0,0,0.04),_0_1px_3px_rgba(0,0,0,0.02)] overflow-hidden">
          <SidebarContent 
            compact={isCollapsed} 
            isCollapsed={isCollapsed} 
            onToggleCollapse={toggleCollapse} 
          />
        </div>
      </aside>
    </>
  );
}
