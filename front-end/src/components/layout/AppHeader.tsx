"use client";

import React from "react";
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
import { useHeader } from "./HeaderContext";
import ReusableModal from "../reusable/ReusableModal";
import { useAppHeaderState } from "./useAppHeaderState";

export default function AppHeader() {
  const { headerState } = useHeader();
  const {
    isOpen,
    close,
    profile,
    formName,
    setFormName,
    formEmail,
    setFormEmail,
    formPassword,
    setFormPassword,
    formProfilePicture,
    showPassword,
    setShowPassword,
    submitting,
    handleOpenModal,
    handleFileChange,
    handleRemovePicture,
    handleSubmit,
    getInitials,
  } = useAppHeaderState();

  const toggleMobileSidebar = () => {
    window.dispatchEvent(new Event("toggleSidebar"));
  };

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-zinc-200/60 bg-slate-50/95 px-4 py-2 md:px-6 md:py-2.5 backdrop-blur-md shrink-0 shadow-[0_4px_16px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={toggleMobileSidebar}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-650 hover:bg-zinc-50 hover:text-zinc-800 transition md:hidden shrink-0 cursor-pointer shadow-xs"
            aria-label="Toggle Sidebar"
          >
            <Menu className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-sm md:text-base font-bold text-zinc-850 truncate">
              {headerState.title || "Dashboard"}
            </h1>
          </div>
        </div>

        {/* User profile avatar / button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenModal}
            className="flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white p-1.5 pr-3 hover:bg-zinc-50 transition cursor-pointer shadow-2xs group"
          >
            {profile.profilePicture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.profilePicture}
                alt="Avatar"
                className="h-7 w-7 rounded-lg object-cover ring-1 ring-zinc-200"
              />
            ) : (
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-tr from-violet-600 to-indigo-500 text-[11px] font-extrabold text-white shadow-2xs">
                {getInitials(profile.name || profile.email)}
              </div>
            )}
            <div className="text-left hidden sm:block min-w-0">
              <div className="text-xs font-semibold text-zinc-800 truncate max-w-[120px]">
                {profile.name || profile.email.split("@")[0]}
              </div>
              <div className="text-[10px] font-bold text-violet-600 uppercase tracking-wider">
                {profile.role}
              </div>
            </div>
          </button>
        </div>
      </header>

      {/* Edit Profile Modal */}
      <ReusableModal open={isOpen} onClose={close} title="Edit User Profile" maxWidth="md">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col items-center justify-center gap-3 pb-2 border-b border-zinc-100">
            <div className="relative group">
              {formProfilePicture ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={formProfilePicture}
                  alt="Profile Preview"
                  className="h-20 w-20 rounded-full object-cover ring-2 ring-violet-500/30"
                />
              ) : (
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-tr from-violet-600 to-indigo-500 text-xl font-bold text-white shadow-md">
                  {getInitials(formName || formEmail)}
                </div>
              )}
              <label
                htmlFor="avatar-upload"
                className="absolute bottom-0 right-0 p-1.5 rounded-full bg-violet-600 text-white cursor-pointer hover:bg-violet-700 shadow-md transition"
              >
                <Camera className="w-3.5 h-3.5" />
                <input
                  id="avatar-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>
            {formProfilePicture && (
              <button
                type="button"
                onClick={handleRemovePicture}
                className="text-[11px] font-semibold text-rose-600 hover:underline flex items-center gap-1"
              >
                <Trash2 className="w-3 h-3" />
                Remove photo
              </button>
            )}
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Full Name</label>
            <div className="relative mt-1">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">Email Address *</label>
            <div className="relative mt-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type="email"
                required
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-4 py-2 text-sm outline-none focus:border-violet-500"
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-700">New Password (optional)</label>
            <div className="relative mt-1">
              <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-400" />
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Leave blank to keep current"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-xl border border-zinc-200 pl-10 pr-10 py-2 text-sm outline-none focus:border-violet-500"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={close}
              className="px-4 py-2 text-sm font-semibold text-zinc-600 hover:bg-zinc-100 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl flex items-center gap-1.5"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              Save Profile
            </button>
          </div>
        </form>
      </ReusableModal>
    </>
  );
}
