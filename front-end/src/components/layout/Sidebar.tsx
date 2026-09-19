"use client";

import Link from "next/link";
import {
  Video,
  Menu,
  X,
  ChevronDown,
  ChevronUp,
  LogOut,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { staticNav, isActive } from "./sidebarConfig";
import { useSidebarState } from "./useSidebarState";

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
  const {
    pathname,
    identity,
    openMenus,
    permissions,
    currentNav,
    toggleMenu,
    onLogout,
  } = useSidebarState(onNavigate);

  return (
    <>
      <div
        className={cn(
          "shrink-0 border-b border-zinc-150 bg-[#f8fafc]",
          compact ? "p-4 flex items-center justify-center" : "px-5 py-4 flex items-center justify-between gap-3"
        )}
      >
        {!compact ? (
          <>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-tr from-violet-600 to-indigo-500 text-white ring-2 ring-violet-500/25 shadow-lg shadow-violet-500/10">
                <Video className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-bold tracking-wide text-zinc-800">
                  Cripton Vision
                </div>
                <div className="text-[9.5px] font-bold uppercase tracking-wider text-violet-600 mt-0.5">
                  AI Attendance
                </div>
              </div>
            </div>

            {onToggleCollapse && (
              <button
                type="button"
                onClick={onToggleCollapse}
                title="Collapse Sidebar"
                className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition flex items-center justify-center cursor-pointer shrink-0 shadow-xs"
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </>
        ) : (
          onToggleCollapse && (
            <button
              type="button"
              onClick={onToggleCollapse}
              title="Expand Sidebar"
              className="h-9 w-9 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-800 hover:bg-zinc-50 transition flex items-center justify-center cursor-pointer shadow-sm"
            >
              <Menu className="h-4.5 w-4.5" />
            </button>
          )
        )}
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] bg-white",
          compact ? "px-2 py-3" : "px-3 py-4"
        )}
      >
        {!compact && (
          <div className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-400">
            Navigation
          </div>
        )}

        <div className="space-y-1">
          {currentNav
            .filter((n) => {
              if (n.subItems) {
                const allowedSub = n.subItems.filter(
                  (sub) => permissions[sub.href] !== false
                );
                return allowedSub.length > 0;
              }
              if (n.href) return permissions[n.href] !== false;
              return true;
            })
            .map((n) => {
              const hasSubItems = !!n.subItems && n.subItems.length > 0;
              const Icon = n.icon;

              if (hasSubItems) {
                const isOpen = openMenus[n.label] ?? false;
                return (
                  <div key={n.label} className="space-y-1">
                    <button
                      onClick={() => toggleMenu(n.label)}
                      title={compact ? n.label : undefined}
                      className={cn(
                        "group flex w-full items-center justify-between rounded-lg transition-all duration-200 cursor-pointer text-left border-l-2 border-l-transparent",
                        compact ? "justify-center px-2 py-3" : "px-3 py-2.5",
                        "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900"
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <Icon className={cn(compact ? "h-5 w-5" : "h-4 w-4", "text-zinc-450")} />
                        {!compact && <span className="truncate text-sm font-medium">{n.label}</span>}
                      </div>
                      {!compact &&
                        (isOpen ? (
                          <ChevronUp className="h-4 w-4 text-zinc-450" />
                        ) : (
                          <ChevronDown className="h-4 w-4 text-zinc-450" />
                        ))}
                    </button>

                    {isOpen && (
                      <div
                        className={cn(
                          "space-y-1 relative transition-all duration-200",
                          !compact && "ml-5 pl-3 border-l border-zinc-100"
                        )}
                      >
                        {n.subItems!
                          .filter((sub) => permissions[sub.href] !== false)
                          .map((sub) => {
                            const subActive = isActive(pathname, sub.href);
                            const SubIcon = sub.icon;
                            return (
                              <Link
                                key={sub.href}
                                href={sub.href}
                                onClick={onNavigate}
                                title={compact ? sub.label : undefined}
                                className={cn(
                                  "group flex items-center rounded-lg transition-all duration-200 border-l-2",
                                  compact
                                    ? "justify-center px-2 py-2 border-l-transparent"
                                    : "gap-3 px-3 py-2",
                                  subActive
                                    ? "bg-violet-50 text-violet-700 border-l-violet-600 font-semibold"
                                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-900 border-l-transparent"
                                )}
                              >
                                <SubIcon className={cn("h-4 w-4", subActive ? "text-violet-600" : "text-zinc-400")} />
                                {!compact && <span className="truncate text-sm">{sub.label}</span>}
                              </Link>
                            );
                          })}
                      </div>
                    )}
                  </div>
                );
              }

              const active = n.href ? isActive(pathname, n.href) : false;
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
                      : "text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 border-l-transparent"
                  )}
                >
                  <Icon className={cn(compact ? "h-5 w-5" : "h-4 w-4", active ? "text-violet-600" : "text-zinc-450")} />
                  {!compact && <span className="truncate text-sm font-medium">{n.label}</span>}
                </Link>
              );
            })}
        </div>
      </nav>

      <div className={cn("shrink-0 border-t border-zinc-150 bg-[#f8fafc]", compact ? "px-2 pb-3 pt-3" : "p-3")}>
        {!compact && identity.companyName && (
          <div className="mb-3 px-2 text-[11px] font-bold text-zinc-500 uppercase tracking-wider truncate text-center">
            {identity.companyName}
          </div>
        )}
        <button
          onClick={onLogout}
          className={cn(
            "flex w-full items-center justify-center gap-2 rounded-xl text-rose-600 hover:bg-rose-50 border border-rose-100 font-semibold text-xs transition cursor-pointer py-2"
          )}
        >
          <LogOut className="h-4 w-4" />
          {!compact && <span>Sign Out</span>}
        </button>
      </div>
    </>
  );
}

export function Sidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  return (
    <>
      <div className="md:hidden fixed top-3 left-3 z-40">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white border border-zinc-200 shadow-md text-zinc-700"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div className="fixed inset-0 bg-black/40 backdrop-blur-xs" onClick={() => setMobileOpen(false)} />
          <div className="relative flex w-72 flex-col bg-white shadow-2xl z-10 h-full">
            <SidebarContent onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      <aside
        className={cn(
          "hidden md:flex flex-col border-r border-zinc-200/80 bg-white transition-all duration-300 h-full shrink-0",
          isCollapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent
          compact={isCollapsed}
          isCollapsed={isCollapsed}
          onToggleCollapse={() => setIsCollapsed(!isCollapsed)}
        />
      </aside>
    </>
  );
}

export default Sidebar;

