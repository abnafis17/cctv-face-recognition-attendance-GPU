"use client";

import { ShieldCheck, Save, Loader2, Lock } from "lucide-react";
import * as LucideIcons from "lucide-react";
import { useRolePermissions } from "./hooks/useRolePermissions";

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
  if (route === "/settings") return LucideIcons.Settings;
  if (route === "/permissions") return LucideIcons.ShieldCheck;

  if (label === "Gate Pass") return LucideIcons.IdCard;
  if (label === "Visitor") return LucideIcons.UserSearch;

  return LucideIcons.ShieldAlert;
}

export default function RolePermissionsPage() {
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
        <Loader2 className="w-8 h-8 text-violet-600 animate-spin" />
        <span className="text-zinc-500 text-sm font-semibold mt-2">Loading permissions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 pb-5">
        <div>
          <h1 className="text-2xl font-black text-zinc-900 tracking-tight flex items-center gap-2.5">
            <ShieldCheck className="w-7 h-7 text-violet-600" />
            Role Permissions
          </h1>
          <p className="text-zinc-500 text-xs font-semibold mt-1">
            Configure system module visibility and access control for each user role.
          </p>
        </div>
      </div>

      {/* Role Selection Dropdown */}
      <div className="bg-white border border-zinc-200/80 rounded-xl p-5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <label className="text-[10px] font-black uppercase tracking-wider text-zinc-400">
            Select User Role
          </label>
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="min-w-[220px] bg-slate-50 border border-zinc-200 text-zinc-800 text-sm font-semibold rounded-lg px-4 py-2.5 outline-none focus:border-violet-500 transition-colors cursor-pointer appearance-none"
            >
              {roles.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-zinc-400">
              <ShieldCheck className="w-4 h-4 text-zinc-400" />
            </div>
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || loadingPerms}
          className="sm:self-end flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white font-bold text-xs transition duration-200 disabled:opacity-60 disabled:cursor-not-allowed shadow-md shadow-violet-500/10 cursor-pointer"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Permissions
        </button>
      </div>

      {/* Permissions List */}
      <div className="bg-white border border-zinc-200/80 rounded-xl shadow-xs overflow-hidden">
        {loadingPerms ? (
          <div className="min-h-[30vh] flex flex-col justify-center items-center py-10">
            <Loader2 className="w-6 h-6 text-violet-600 animate-spin" />
            <span className="text-zinc-400 text-xs font-semibold mt-2">Loading module list...</span>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {permissions.map((p) => {
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
                  className="flex items-center justify-between p-4 sm:p-5 hover:bg-slate-50/50 transition duration-150"
                >
                  <div className="flex items-start gap-4 min-w-0">
                    <div className="h-10 w-10 shrink-0 rounded-lg bg-slate-50 flex items-center justify-center border border-zinc-200/60 text-zinc-600">
                      <Icon className="w-5 h-5 text-zinc-500" />
                    </div>
                    <div className="min-w-0 space-y-0.5">
                      <span className="text-sm font-bold text-zinc-800 truncate block">
                        {meta.label}
                      </span>
                      <span className="text-xs text-zinc-400 block truncate sm:max-w-md">
                        {meta.desc}
                      </span>
                    </div>
                  </div>

                  {/* Switch Toggle */}
                  <label className="relative inline-flex items-center cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={p.allowed}
                      onChange={() => handleToggle(p.module)}
                      className="sr-only peer"
                    />
                    <div className="w-10 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-violet-600"></div>
                  </label>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Access info footer */}
      <div className="flex items-center gap-2 text-[10px] font-bold text-zinc-400 uppercase tracking-widest justify-center">
        <Lock className="w-3.5 h-3.5" />
        Role Settings are Encrypted and Scoped to Company Profile
      </div>
    </div>
  );
}
