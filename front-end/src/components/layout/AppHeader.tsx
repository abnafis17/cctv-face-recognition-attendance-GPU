"use client";

import React, { useState, useEffect } from "react";
import {
  Menu,
  User,
  Mail,
  Key,
  Loader2,
  Eye,
  EyeOff,
  Shield,
  Building2,
  Camera,
  Trash2,
} from "lucide-react";
import toast from "react-hot-toast";

import { useHeader } from "./HeaderContext";
import axiosInstance from "@/config/axiosInstance";
import ReusableModal from "../reusable/ReusableModal";
import { useModal } from "@/hooks/useModal";

type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  companyName: string | null;
  profilePicture: string | null;
};

export default function AppHeader() {
  const { headerState } = useHeader();
  const { isOpen, open, close } = useModal();

  // User Profile details
  const [profile, setProfile] = useState<UserProfile>({
    id: "",
    name: "",
    email: "",
    role: "OPERATOR",
    companyName: "",
    profilePicture: null,
  });

  // Form states
  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formProfilePicture, setFormProfilePicture] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Sync profile details from localStorage
  const loadProfile = () => {
    try {
      const raw = localStorage.getItem("userInfo");
      if (raw) {
        const userInfo = JSON.parse(raw);
        const companyName = String(
          userInfo?.companyName ?? userInfo?.company?.companyName ?? "Company Account"
        ).trim();

        setProfile({
          id: userInfo?.id ?? "",
          name: userInfo?.name ?? "",
          email: userInfo?.email ?? "",
          role: userInfo?.role ?? "OPERATOR",
          companyName: companyName,
          profilePicture: userInfo?.profilePicture ?? null,
        });
      }
    } catch (err) {
      console.error("Failed to load user info in header:", err);
    }
  };

  useEffect(() => {
    loadProfile();
    window.addEventListener("userInfoUpdated", loadProfile);
    return () => {
      window.removeEventListener("userInfoUpdated", loadProfile);
    };
  }, []);

  // Set form states when opening modal
  const handleOpenModal = () => {
    setFormName(profile.name || "");
    setFormEmail(profile.email);
    setFormPassword("");
    setFormProfilePicture(profile.profilePicture);
    setShowPassword(false);
    open();
  };

  // Convert uploaded image to Base64
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 2 * 1024 * 1024) {
        toast.error("Image size must be less than 2MB");
        return;
      }
      if (!file.type.startsWith("image/")) {
        toast.error("File must be an image");
        return;
      }

      const reader = new FileReader();
      reader.onloadend = () => {
        setFormProfilePicture(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePicture = () => {
    setFormProfilePicture(null);
  };

  // Handle Edit Profile Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile.id) {
      toast.error("User session not found");
      return;
    }

    const emailTrim = formEmail.trim().toLowerCase();
    if (!emailTrim) {
      toast.error("Email cannot be empty");
      return;
    }

    try {
      setSubmitting(true);
      const payload: any = {
        name: formName.trim() || null,
        email: emailTrim,
        profilePicture: formProfilePicture,
      };

      if (formPassword.trim()) {
        payload.password = formPassword.trim();
      }

      const res = await axiosInstance.patch(
        `/settings/users/${profile.id}`,
        payload
      );

      if (res.data?.ok) {
        toast.success("Profile updated successfully!");

        // Update local storage and dispatch event
        const raw = localStorage.getItem("userInfo");
        const currentInfo = raw ? JSON.parse(raw) : {};
        const nextInfo = {
          ...currentInfo,
          name: payload.name,
          email: payload.email,
          profilePicture: payload.profilePicture,
        };
        localStorage.setItem("userInfo", JSON.stringify(nextInfo));
        window.dispatchEvent(new Event("userInfoUpdated"));

        close();
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update profile");
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to extract initials for avatar fallback
  const getInitials = (nameStr: string) => {
    if (!nameStr) return "U";
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameStr.slice(0, 2).toUpperCase();
  };

  const toggleMobileSidebar = () => {
    window.dispatchEvent(new Event("toggleSidebar"));
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200/60 bg-slate-50/95 px-4 py-2 md:px-6 md:py-2.5 backdrop-blur-md shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 min-w-0">
          {/* Mobile Menu Icon */}
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-655 hover:bg-zinc-50 hover:text-zinc-800 transition md:hidden shrink-0 cursor-pointer shadow-xs"
            aria-label="Toggle Sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>

          <div className="min-w-0">
            <h1 className="text-sm font-bold tracking-tight text-zinc-900 md:text-base truncate">
              {headerState.title}
            </h1>
            {headerState.subtitle && (
              <p className="text-[10px] text-zinc-505 md:text-xs mt-0.5 truncate hidden sm:block">
                {headerState.subtitle}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-4 shrink-0">
          {/* Action components injected by specific pages */}
          {headerState.actions && (
            <div className="hidden lg:flex items-center gap-2">
              {headerState.actions}
            </div>
          )}

          {/* User Profile Card */}
          <div
            onClick={handleOpenModal}
            className="flex items-center gap-2.5 cursor-pointer group select-none hover:opacity-95 transition"
          >
            <div className="hidden md:flex flex-col text-right">
              <span className="text-xs font-bold text-zinc-800 group-hover:text-violet-600 transition">
                {profile.name || "User Account"}
              </span>
              <span className="text-[9px] font-bold text-zinc-400 uppercase tracking-wider mt-0.5">
                {profile.role.replace(/_/g, " ")}
              </span>
            </div>

            {/* Profile Avatar */}
            <div className="relative h-8.5 w-8.5 overflow-hidden rounded-full border border-zinc-200 bg-zinc-50 shadow-xs ring-2 ring-transparent group-hover:ring-violet-500/30 transition duration-250 flex items-center justify-center">
              {profile.profilePicture ? (
                <img
                  src={profile.profilePicture}
                  alt="Profile"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-violet-600 to-indigo-500 text-xs font-bold text-white uppercase tracking-wider">
                  {getInitials(profile.name || profile.email)}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Profile Edit Modal */}
      <ReusableModal
        open={isOpen}
        onClose={close}
        title="Account Profile"
        description="Update your personal details and credentials."
        maxWidth="md"
      >
        <form onSubmit={handleSubmit} className="space-y-5 pt-1">
          {/* Profile Picture Upload Section */}
          <div className="flex items-center gap-5 p-4 bg-slate-50/50 border border-zinc-200/60 rounded-2xl mb-2">
            {/* Clickable/Hoverable Avatar Circle */}
            <label className="relative h-20 w-20 shrink-0 rounded-full border border-zinc-200 bg-zinc-50 shadow-inner flex items-center justify-center overflow-hidden cursor-pointer group ring-4 ring-slate-100 transition duration-250 select-none">
              <input
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
              
              {formProfilePicture ? (
                <img
                  src={formProfilePicture}
                  alt="Profile Preview"
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-tr from-violet-600 to-indigo-500 text-2xl font-bold text-white uppercase">
                  {getInitials(formName || formEmail)}
                </div>
              )}

              {/* Hover Edit Overlay */}
              <div className="absolute inset-0 bg-zinc-900/60 flex flex-col items-center justify-center gap-1 text-white opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <Camera className="w-4 h-4 text-white/90" />
                <span className="text-[8px] font-extrabold uppercase tracking-wider text-white/90">
                  Change
                </span>
              </div>
            </label>

            {/* Info and Actions */}
            <div className="flex flex-col gap-1.5 min-w-0">
              <div>
                <h3 className="text-sm font-bold text-zinc-800 truncate leading-tight">
                  {formName || "User Account"}
                </h3>
                <p className="text-xs text-zinc-500 truncate leading-tight mt-0.5">
                  {formEmail || "email@example.com"}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 items-center mt-1">
                <label className="h-8 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-850 text-white text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition shadow-xs">
                  <Camera className="w-3.5 h-3.5" />
                  Upload Photo
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleFileChange}
                    className="hidden"
                  />
                </label>
                
                {formProfilePicture && (
                  <button
                    type="button"
                    onClick={handleRemovePicture}
                    className="h-8 px-3 rounded-lg bg-rose-50 hover:bg-rose-100 border border-rose-100/60 text-rose-600 text-[11px] font-semibold flex items-center justify-center gap-1.5 cursor-pointer transition"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
              
              <p className="text-[10px] text-zinc-400 leading-normal">
                JPG or PNG. Max size 2MB.
              </p>
            </div>
          </div>

          {/* User Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5 text-zinc-400" /> Account Role
              </label>
              <div className="h-10 w-full rounded-lg bg-zinc-50 border border-zinc-150 px-3 text-sm text-zinc-500 flex items-center select-none font-medium">
                {profile.role.replace(/_/g, " ")}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-400" /> Organization
              </label>
              <div className="h-10 w-full rounded-lg bg-zinc-50 border border-zinc-150 px-3 text-sm text-zinc-500 flex items-center select-none truncate font-medium" title={profile.companyName || ""}>
                {profile.companyName || "N/A"}
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-zinc-400" /> Full Name
            </label>
            <input
              type="text"
              placeholder="e.g. Nafis Inno"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-violet-500/10 focus:ring-2 focus:border-violet-500 transition duration-200"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-zinc-400" /> Email Address *
            </label>
            <input
              type="email"
              required
              placeholder="e.g. nafis@pakizasoftware.com"
              value={formEmail}
              onChange={(e) => setFormEmail(e.target.value)}
              className="h-10 w-full rounded-lg border border-zinc-200 bg-white px-3 text-sm text-zinc-900 outline-none ring-violet-500/10 focus:ring-2 focus:border-violet-500 transition duration-200"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-zinc-600 flex items-center gap-1.5">
              <Key className="w-3.5 h-3.5 text-zinc-400" /> Reset Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank to keep current password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="h-10 w-full rounded-lg border border-zinc-200 bg-white pl-3 pr-10 text-sm text-zinc-900 outline-none ring-violet-500/10 focus:ring-2 focus:border-violet-500 transition duration-200"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 focus:outline-none cursor-pointer"
              >
                {showPassword ? (
                  <EyeOff className="w-4.5 h-4.5" />
                ) : (
                  <Eye className="w-4.5 h-4.5" />
                )}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-zinc-100 mt-2">
            <button
              type="button"
              onClick={close}
              disabled={submitting}
              className="h-10 px-5 rounded-lg border border-zinc-200 bg-white text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-5 rounded-lg bg-violet-600 text-sm font-semibold text-white hover:bg-violet-700 transition flex items-center justify-center gap-2 shadow-xs cursor-pointer disabled:opacity-75"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </button>
          </div>
        </form>
      </ReusableModal>
    </>
  );
}
