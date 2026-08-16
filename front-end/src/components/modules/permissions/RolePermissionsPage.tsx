"use client";

import React, { useState } from "react";
import { ShieldCheck, Save, Loader2, Lock, ChevronDown, ChevronUp } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useRolePermissions } from "./hooks/useRolePermissions";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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

export default function RolePermissionsPage() {
  const [isEmployeesExpanded, setIsEmployeesExpanded] = useState(false);
  const [isVisitorsExpanded, setIsVisitorsExpanded] = useState(false);
  const {
    roles,
    selectedRole,
    setSelectedRole,
    permissions,
    systemModules,
    loadingRoles,
    loadingPerms,
    saving,
    handleToggle,
    handleSave,
  } = useRolePermissions();

  if (loadingRoles) {
    return (
      <div className="min-h-[60vh] flex flex-col justify-center items-center">
        <Loader2 className="w-8 h-8 text-[#0c1b33] animate-spin" />
        <span className="text-zinc-500 text-sm font-semibold mt-2">Loading permissions...</span>
      </div>
    );
  }

  return (
    <div className="w-full pb-10 space-y-6">
      {/* Top Banner Header */}
      <div className="flex items-center justify-between rounded-xl bg-[#0c1b33] p-5 text-white shadow-md">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
            <ShieldCheck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h1 className="text-white text-xl font-bold">Role Permissions</h1>
            <p className="text-xs text-zinc-300">
              Configure system module visibility and access control for each user role
            </p>
          </div>
        </div>
      </div>

      {/* Role Selection Dropdown & Action Bar */}
      <div className="bg-white border border-zinc-200 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div className="space-y-1.5">
          <label className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">
            Select User Role
          </label>
          <div className="relative">
            <ShieldCheck className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 z-10" />
            <Select
              value={selectedRole}
              onValueChange={setSelectedRole}
            >
              <SelectTrigger className="h-10 w-[240px] rounded-xl border-zinc-200 bg-slate-50/50 pl-10 pr-8 text-left text-zinc-800 text-sm font-semibold cursor-pointer">
                <SelectValue placeholder="Select Role" />
              </SelectTrigger>
              <SelectContent position="popper" className="bg-white border border-zinc-200 rounded-xl">
                {roles.map((r) => (
                  <SelectItem key={r} value={r} className="cursor-pointer">
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || loadingPerms}
          className="h-10 rounded-xl bg-[#0c1b33] px-6 text-sm font-semibold text-white hover:bg-[#11274c] flex items-center justify-center gap-2 shadow-sm cursor-pointer w-full sm:w-auto"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Permissions
        </Button>
      </div>

      {/* Permissions List Grid */}
      {loadingPerms ? (
        <div className="bg-white border border-zinc-200 rounded-xl p-10 min-h-[30vh] flex flex-col justify-center items-center shadow-xs">
          <Loader2 className="w-6 h-6 text-[#0c1b33] animate-spin" />
          <span className="text-zinc-400 text-xs font-semibold mt-2">Loading module list...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
          {permissions
            .filter((p) => !p.module.startsWith("/employees/") && p.module !== "/visitors/delete")
            .map((p) => {
              const dbModule = systemModules.find((sm) => sm.route === p.module);
              const meta = dbModule
                ? {
                    label: dbModule.name,
                    icon: getIconForRoute(dbModule.route, dbModule.name),
                    desc: dbModule.description || `Access control module for ${dbModule.name} page.`,
                  }
                : {
                    label: p.module,
                    icon: ShieldCheck,
                    desc: "Custom system route or feature mapping",
                  };
              const Icon = meta.icon;

              return (
                <div
                  key={p.module}
                  className="flex flex-col p-4 bg-white border border-zinc-200 rounded-xl shadow-xs hover:border-zinc-300 hover:shadow-sm transition-all duration-200"
                >
                  <div className="flex items-center justify-between w-full">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 shrink-0 rounded-xl bg-slate-50 flex items-center justify-center border border-zinc-200 text-zinc-600">
                        <Icon className="w-5 h-5 text-[#0c1b33]" />
                      </div>
                      <div className="min-w-0">
                        <span className="text-sm font-bold text-zinc-800 truncate block">
                          {meta.label}
                        </span>
                        <span className="text-xs text-zinc-400 block truncate max-w-[200px] sm:max-w-[280px]">
                          {meta.desc}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {/* Chevron expand button for Employees */}
                      {p.module === "/employees" && (
                        <button
                          type="button"
                          onClick={() => setIsEmployeesExpanded(!isEmployeesExpanded)}
                          title="Toggle actions permission list"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
                        >
                          {isEmployeesExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Chevron expand button for Visitor List */}
                      {p.module === "/visitors" && (
                        <button
                          type="button"
                          onClick={() => setIsVisitorsExpanded(!isVisitorsExpanded)}
                          title="Toggle actions permission list"
                          className="p-1.5 rounded-lg hover:bg-slate-100 text-zinc-500 hover:text-zinc-800 transition cursor-pointer"
                        >
                          {isVisitorsExpanded ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                      )}

                      {/* Switch Toggle */}
                      <label className="relative inline-flex items-center cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={p.allowed}
                          onChange={() => handleToggle(p.module)}
                          className="sr-only peer"
                        />
                        <div className="w-10 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#0c1b33]"></div>
                      </label>
                    </div>
                  </div>

                  {/* Collapsible Action Toggles under Employees */}
                  {p.module === "/employees" && isEmployeesExpanded && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                        Employee Grid Action Permissions
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {permissions
                          .filter((sub) => sub.module.startsWith("/employees/"))
                          .map((sub) => {
                            const subName = sub.module === "/employees/edit"
                              ? "Edit"
                              : sub.module === "/employees/re-enroll"
                              ? "Re-enroll Face"
                              : sub.module === "/employees/delete"
                              ? "Delete"
                              : sub.module.replace("/employees/", "");
                            return (
                              <div
                                key={sub.module}
                                className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-50 border border-zinc-100 rounded-lg transition-all duration-200"
                              >
                                <span className="text-xs font-semibold text-zinc-700">
                                  {subName} Action
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={sub.allowed}
                                    onChange={() => handleToggle(sub.module)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0c1b33]"></div>
                                </label>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}

                  {/* Collapsible Action Toggles under Visitor List */}
                  {p.module === "/visitors" && isVisitorsExpanded && (
                    <div className="mt-4 pt-4 border-t border-zinc-100 space-y-3">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400 block mb-1">
                        Visitor Grid Action Permissions
                      </span>
                      <div className="grid grid-cols-1 gap-2">
                        {permissions
                          .filter((sub) => sub.module === "/visitors/delete")
                          .map((sub) => {
                            const subName = "Delete";
                            return (
                              <div
                                key={sub.module}
                                className="flex items-center justify-between p-2.5 bg-slate-50/50 hover:bg-slate-50 border border-zinc-100 rounded-lg transition-all duration-200"
                              >
                                <span className="text-xs font-semibold text-zinc-700">
                                  {subName} Action
                                </span>
                                <label className="relative inline-flex items-center cursor-pointer select-none">
                                  <input
                                    type="checkbox"
                                    checked={sub.allowed}
                                    onChange={() => handleToggle(sub.module)}
                                    className="sr-only peer"
                                  />
                                  <div className="w-8 h-5 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#0c1b33]"></div>
                                </label>
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
        </div>
      )}

      {/* Access info footer */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest justify-center pt-2">
        <Lock className="w-3.5 h-3.5" />
        Role Settings are Encrypted and Scoped to Company Profile
      </div>
    </div>
  );
}
