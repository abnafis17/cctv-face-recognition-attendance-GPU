"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  Video,
  UserPlus,
  Users,
  CalendarClock,
  LogOut,
} from "lucide-react";
import { clearAccessToken } from "@/lib/authStorage";

const nav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/cameras", label: "Cameras (Live)", icon: Video },
  { href: "/headcount", label: "Headcount Camera", icon: Video },
  { href: "/enroll", label: "Enrollment(Auto)", icon: UserPlus },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/daily-attendance", label: "Daily Attendance", icon: CalendarClock },
  { href: "/attendance", label: "Recognition History", icon: CalendarClock },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(href + "/");
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  function onLogout() {
    clearAccessToken();
    router.replace("/login");
  }

  return (
    <aside className="flex h-screen w-72 flex-col border-r bg-white">
      {/* Header (fixed) */}
      <div className="shrink-0 border-b px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-900 text-white">
            <Video className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-900">
              CCTV Panel
            </div>
            <div className="text-xs text-zinc-500">Face Recognition Admin</div>
          </div>
        </div>
      </div>

      {/* Nav (scrolls only if too long) */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mb-2 px-2 text-[11px] font-medium uppercase tracking-wider text-zinc-400">
          Main
        </div>

        <div className="space-y-1">
          {nav.map((n) => {
            const active = isActive(pathname, n.href);
            const Icon = n.icon;

            return (
              <Link
                key={n.href}
                href={n.href}
                className={[
                  "flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition",
                  active
                    ? "bg-zinc-900 text-white"
                    : "text-zinc-700 hover:bg-zinc-100",
                ].join(" ")}
              >
                <Icon
                  className={[
                    "h-4 w-4",
                    active ? "text-white" : "text-zinc-500",
                  ].join(" ")}
                />
                <span className="truncate">{n.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      {/* Bottom actions (fixed) */}
      <div className="shrink-0 border-t p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center justify-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100"
        >
          <LogOut className="h-4 w-4" />
          Logout
        </button>

        <div className="mt-3 px-1 text-center text-xs text-zinc-400">
          © {new Date().getFullYear()} Pakiza Software Ltd
        </div>
      </div>
    </aside>
  );
}
