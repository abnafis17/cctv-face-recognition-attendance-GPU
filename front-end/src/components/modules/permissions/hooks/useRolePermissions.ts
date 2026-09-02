"use client";

import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { API } from "@/constant/API_PATH";

export function useRolePermissions() {
  const [roles, setRoles] = useState<string[]>([]);
  const [selectedRole, setSelectedRole] = useState<string>("");
  const [permissions, setPermissions] = useState<Array<{ module: string; allowed: boolean }>>([]);
  const [systemModules, setSystemModules] = useState<any[]>([]);
  const [loadingRoles, setLoadingRoles] = useState(true);
  const [loadingPerms, setLoadingPerms] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function fetchRoles() {
      try {
        const res = await axiosInstance.get(API.ROLES);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setRoles(res.data.results);
          if (res.data.results.length > 0) {
            setSelectedRole(res.data.results[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load roles:", err);
        toast.error("Failed to load user roles");
      } finally {
        setLoadingRoles(false);
      }
    }
    async function fetchSystemModules() {
      try {
        const res = await axiosInstance.get(API.MODULES);
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          const list: any[] = [];
          res.data.results.forEach((m: any) => {
            if (m.route) {
              list.push(m);
            }
            if (m.subModules && m.subModules.length > 0) {
              m.subModules.forEach((sub: any) => {
                if (sub.route) {
                  list.push(sub);
                }
              });
            }
          });
          setSystemModules(list);
        }
      } catch (err) {
        console.error("Failed to load modules:", err);
      }
    }
    fetchRoles();
    fetchSystemModules();
  }, []);

  useEffect(() => {
    if (!selectedRole) return;
    async function fetchPermissions() {
      setLoadingPerms(true);
      try {
        const res = await axiosInstance.get(
          `${API.PERMISSIONS}?role=${encodeURIComponent(selectedRole)}`
        );
        if (res.data?.ok && Array.isArray(res.data?.results)) {
          setPermissions(res.data.results);
        }
      } catch (err) {
        console.error("Failed to fetch permissions:", err);
        toast.error("Failed to load permissions for role");
      } finally {
        setLoadingPerms(false);
      }
    }
    fetchPermissions();
  }, [selectedRole]);

  const handleToggle = (moduleKey: string) => {
    setPermissions((prev) =>
      prev.map((p) => (p.module === moduleKey ? { ...p, allowed: !p.allowed } : p))
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axiosInstance.post(API.PERMISSIONS, {
        role: selectedRole,
        permissions: permissions,
      });
      toast.success("Permissions updated successfully!");

      const raw = localStorage.getItem("userInfo");
      const userInfo = raw ? JSON.parse(raw) : null;
      if (userInfo && userInfo.role === selectedRole) {
        const meRes = await axiosInstance.get(API.ME);
        const nextUserInfo = {
          ...userInfo,
          ...meRes.data.results,
        };
        localStorage.setItem("userInfo", JSON.stringify(nextUserInfo));
        window.dispatchEvent(new Event("userInfoUpdated"));
      }
    } catch (err: any) {
      console.error("Failed to save permissions:", err);
      toast.error(err?.response?.data?.message || "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  };

  return {
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
  };
}
