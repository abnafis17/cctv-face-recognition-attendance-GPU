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
  Mail,
  Cctv,
  History,
  UserX,
  ListVideo,
  Menu,
  X,
  Settings,
  Home,
  ChevronDown,
  ChevronUp,
  List,
  BarChart3,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { clearAccessToken, getAccessToken } from "@/lib/authStorage";
import { cn } from "@/lib/utils";
import axiosInstance from "@/config/axiosInstance";

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

const nav: NavItem[] = [
  { href: "/dashboard", label: "Home", icon: Home },
  { href: "/cameras", label: "Cameras (Live)", icon: Cctv },
  { href: "/camera-list", label: "Camera List", icon: ListVideo },
  { href: "/headcount", label: "Headcount Camera", icon: Video },
  { href: "/presence", label: "Presence (Dwell)", icon: Activity },
  { href: "/enroll", label: "Enrollment(Auto)", icon: UserPlus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/daily-attendance", label: "Daily Attendance", icon: CalendarClock },
  { href: "/attendance", label: "Recognition History", icon: History },
  { href: "/unknown-recognition", label: "Unknown History", icon: UserX },
  { href: "/gatepass", label: "Gate Pass", icon: Mail },
  {
    label: "Visitor",
    icon: UserPlus,
    subItems: [
      { href: "/visitors/add", label: "Add Visitor", icon: UserPlus },
      { href: "/visitors", label: "Visitor List", icon: List },
      { href: "/visitors/employee-wise-visit", label: "Employee Wise Visit Report", icon: BarChart3 },
      { href: "/visitors/visitor-wise-visit", label: "Visitor Wise Visit Report", icon: BarChart3 },
    ],
  },
  { href: "/bounding-box", label: "Bounding Box", icon: Video },
  { href: "/settings", label: "Settings", icon: Settings }
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/visitors") return pathname === "/visitors";
  return pathname === href || pathname.startsWith(href + "/");
}

type SidebarIdentity = {
  companyName: string;
  email: string;
};

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  const raw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const padded = raw + "=".repeat((4 - (raw.length % 4)) % 4);

  try {
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function readSidebarIdentity(): SidebarIdentity {
  if (typeof window === "undefined") {
    return {
      companyName: "Company Account",
      email: "Not available",
    };
  }

  let companyName = "";
  let email = "";

  try {
    const rawUserInfo = localStorage.getItem("userInfo");
    const userInfo = rawUserInfo ? JSON.parse(rawUserInfo) : null;

    companyName = String(
      userInfo?.companyName ?? userInfo?.company?.companyName ?? "",
    ).trim();
    email = String(userInfo?.email ?? "").trim();
  } catch {
    // ignore localStorage parse errors
  }

  const accessToken = getAccessToken();
  const payload = accessToken ? decodeJwtPayload(accessToken) : null;

  if (payload) {
    if (!email) {
      email = String(payload.email ?? "").trim();
    }

    if (!companyName) {
      companyName = String(
        payload.companyName ?? payload.company_name ?? "",
      ).trim();
    }
  }

  return {
    companyName: companyName || "Company Account",
    email: email || "Not available",
  };
}

function SidebarContent({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [identity, setIdentity] = useState<SidebarIdentity>(() =>
    readSidebarIdentity(),
  );
  const syncedTokenRef = useRef<string>("");

  const [openMenus, setOpenMenus] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (pathname.startsWith("/visitors")) {
      setOpenMenus((prev) => ({ ...prev, Visitor: true }));
    }
  }, [pathname]);

  const toggleMenu = (label: string) => {
    setOpenMenus((prev) => ({
      ...prev,
      [label]: !prev[label],
    }));
  };

  useEffect(() => {
    const localIdentity = readSidebarIdentity();
    setIdentity(localIdentity);

    const token = getAccessToken();
    if (!token) {
      syncedTokenRef.current = "";
      return;
    }

    if (syncedTokenRef.current === token) return;

    let cancelled = false;

    const syncIdentityFromDb = async () => {
      try {
        const res = await axiosInstance.get("/auth/me");
        const me = res?.data?.results ?? {};
        const companyName = String(
          me?.companyName ?? me?.company?.companyName ?? "",
        ).trim();
        const email = String(me?.email ?? "").trim();

        if (!cancelled && (companyName || email)) {
          syncedTokenRef.current = token;
          const nextIdentity: SidebarIdentity = {
            companyName: companyName || localIdentity.companyName,
            email: email || localIdentity.email,
          };
          setIdentity(nextIdentity);

          try {
            const raw = localStorage.getItem("userInfo");
            const current = raw ? JSON.parse(raw) : {};
            localStorage.setItem(
              "userInfo",
              JSON.stringify({
                ...current,
                ...me,
                companyName: companyName || current?.companyName || "",
              }),
            );
          } catch {
            // ignore localStorage parse errors
          }
        }
      } catch {
        // keep local identity if /auth/me fails
      }
    };

    void syncIdentityFromDb();

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  function onLogout() {
    clearAccessToken();
    router.replace("/login");
    onNavigate?.();
  }

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b border-white/10",
          compact ? "px-3 py-4" : "px-5 py-5",
        )}
      >
        <div
          className={cn(
            "flex items-center",
            compact ? "justify-center" : "gap-3",
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white ring-1 ring-white/20">
            <Video className="h-5 w-5" />
          </div>
          {!compact && (
            <div>
              <div className="text-sm font-semibold text-white">CCTV Panel</div>
              <div className="text-xs text-zinc-400">
                Face Recognition Admin
              </div>
            </div>
          )}
        </div>
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto",
          compact ? "px-2 py-3" : "px-3 py-4",
        )}
        style={{ WebkitOverflowScrolling: "touch" }}
      >
        {!compact && (
          <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-zinc-500">
            Navigation
          </div>
        )}

        <div className="space-y-1">
          {nav.map((n) => {
            const hasSubItems = !!n.subItems && n.subItems.length > 0;

            if (hasSubItems) {
              const isOpen = openMenus[n.label] ?? false;
              const Icon = n.icon;

              return (
                <div key={n.label} className="space-y-1">
                  <button
                    onClick={() => toggleMenu(n.label)}
                    title={compact ? n.label : undefined}
                    className={cn(
                      "group flex w-full items-center justify-between rounded-2xl transition-all duration-200 cursor-pointer text-left",
                      compact ? "justify-center px-2 py-3" : "px-3 py-2.5",
                      "text-zinc-300 hover:bg-white/10 hover:text-white",
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <Icon
                        className={cn(
                          compact ? "h-5 w-5" : "h-4 w-4",
                          "text-zinc-400 group-hover:text-zinc-100",
                        )}
                      />
                      {!compact && <span className="truncate text-sm">{n.label}</span>}
                    </div>
                    {!compact && (
                      isOpen ? (
                        <ChevronUp className="h-4 w-4 text-zinc-400 group-hover:text-zinc-100" />
                      ) : (
                        <ChevronDown className="h-4 w-4 text-zinc-400 group-hover:text-zinc-100" />
                      )
                    )}
                  </button>

                  {isOpen && (
                    <div
                      className={cn(
                        "space-y-1 relative transition-all duration-200",
                        !compact && "ml-5 pl-3 border-l border-white/10"
                      )}
                    >
                      {n.subItems!.map((sub) => {
                        const subActive = isActive(pathname, sub.href);
                        const SubIcon = sub.icon;

                        return (
                          <Link
                            key={sub.href}
                            href={sub.href}
                            onClick={onNavigate}
                            title={compact ? sub.label : undefined}
                            className={cn(
                              "group flex items-center rounded-xl transition-all duration-200",
                              compact ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
                              subActive
                                ? "bg-white/10 text-white font-medium"
                                : "text-zinc-400 hover:bg-white/5 hover:text-white",
                            )}
                          >
                            <SubIcon
                              className={cn(
                                compact ? "h-4 w-4" : "h-4 w-4",
                                subActive
                                  ? "text-white"
                                  : "text-zinc-500 group-hover:text-zinc-300",
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
                key={n.href}
                href={n.href || "#"}
                onClick={onNavigate}
                title={compact ? n.label : undefined}
                className={cn(
                  "group flex items-center rounded-2xl transition-all duration-200",
                  compact ? "justify-center px-2 py-3" : "gap-3 px-3 py-2.5",
                  active
                    ? "bg-white text-zinc-900 shadow-sm"
                    : "text-zinc-300 hover:bg-white/10 hover:text-white",
                )}
              >
                <Icon
                  className={cn(
                    compact ? "h-5 w-5" : "h-4 w-4",
                    active
                      ? "text-zinc-900"
                      : "text-zinc-400 group-hover:text-zinc-100",
                  )}
                />
                {compact ? (
                  <span className="sr-only">{n.label}</span>
                ) : (
                  <span className="truncate text-sm">{n.label}</span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>

      <div
        className={cn(
          "shrink-0 border-t border-white/10",
          compact ? "px-2 pb-3 pt-3" : "p-3",
        )}
      >
        {!compact && (
          <div className="mb-3 rounded-xl border border-white/15 bg-white/5 px-3 py-2.5">
            <div className="text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">
              Account
            </div>
            <div className="mt-2 flex items-start gap-2.5">
              <div className="mt-0.5 rounded-md bg-white/10 p-1.5 text-zinc-300">
                <Building2 className="h-3.5 w-3.5" />
              </div>
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-semibold text-white"
                  title={identity.companyName}
                >
                  {identity.companyName}
                </div>
                <div
                  className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-zinc-400"
                  title={identity.email}
                >
                  <Mail className="h-3 w-3 shrink-0" />
                  <span className="truncate">{identity.email}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <button
          onClick={onLogout}
          title={compact ? "Logout" : undefined}
          className={cn(
            "flex w-full items-center rounded-xl border border-white/20 px-3 py-2.5 text-sm font-medium text-zinc-100 transition",
            compact
              ? "justify-center"
              : "justify-center gap-2 hover:bg-white/10 active:scale-[0.99]",
          )}
        >
          <LogOut className="h-4 w-4" />
          {compact ? <span className="sr-only">Logout</span> : "Logout"}
        </button>

        {!compact && (
          <div className="mt-3 px-1 text-center text-xs text-zinc-500">
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
      <header className="fixed inset-x-0 top-0 z-40 border-b border-zinc-200/80 bg-white/90 px-4 pb-3 pt-[calc(env(safe-area-inset-top)+0.75rem)] backdrop-blur md:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-900 text-white">
              <Video className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-zinc-900">
                CCTV Panel
              </div>
              <div className="truncate text-[11px] text-zinc-500">
                Face Recognition Admin
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
            "absolute inset-0 bg-zinc-950/45 backdrop-blur-[2px] transition-opacity duration-200",
            mobileOpen ? "opacity-100" : "opacity-0",
          )}
        />

        <aside
          id="mobile-sidebar"
          className={cn(
            "ui-readable-dark absolute inset-y-0 left-0 flex w-[85vw] max-w-[330px] flex-col bg-zinc-950 pt-[env(safe-area-inset-top)] text-zinc-100 shadow-2xl transition-transform duration-300 ease-out",
            mobileOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <SidebarContent onNavigate={() => setMobileOpen(false)} />
          <div className="h-[calc(env(safe-area-inset-bottom)+0.75rem)] shrink-0" />
        </aside>
      </div>

      <aside className="ui-readable-dark hidden h-dvh w-20 flex-col border-r border-zinc-200 bg-zinc-950 text-zinc-100 md:flex lg:hidden">
        <SidebarContent compact />
      </aside>

      <aside className="ui-readable-dark hidden h-dvh w-72 flex-col border-r border-zinc-200 bg-zinc-950 text-zinc-100 lg:flex">
        <SidebarContent />
      </aside>
    </>
  );
}
