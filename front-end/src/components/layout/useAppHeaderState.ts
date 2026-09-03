import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import axiosInstance from "@/config/axiosInstance";
import { useModal } from "@/hooks/useModal";

export type UserProfile = {
  id: string;
  name: string | null;
  email: string;
  role: string;
  companyName: string | null;
  profilePicture: string | null;
};

export function useAppHeaderState() {
  const { isOpen, open, close } = useModal();
  const [profile, setProfile] = useState<UserProfile>({
    id: "",
    name: "",
    email: "",
    role: "OPERATOR",
    companyName: "",
    profilePicture: null,
  });

  const [formName, setFormName] = useState("");
  const [formEmail, setFormEmail] = useState("");
  const [formPassword, setFormPassword] = useState("");
  const [formProfilePicture, setFormProfilePicture] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadProfile = useCallback(() => {
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
          companyName,
          profilePicture: userInfo?.profilePicture ?? null,
        });
      }
    } catch (err) {
      console.error("Failed to load user info in header:", err);
    }
  }, []);

  useEffect(() => {
    loadProfile();
    window.addEventListener("userInfoUpdated", loadProfile);
    return () => {
      window.removeEventListener("userInfoUpdated", loadProfile);
    };
  }, [loadProfile]);

  const handleOpenModal = () => {
    setFormName(profile.name || "");
    setFormEmail(profile.email);
    setFormPassword("");
    setFormProfilePicture(profile.profilePicture);
    setShowPassword(false);
    open();
  };

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
      reader.onloadend = () => setFormProfilePicture(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleRemovePicture = () => setFormProfilePicture(null);

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

      const res = await axiosInstance.patch(`/settings/users/${profile.id}`, payload);
      if (res.data?.ok) {
        toast.success("Profile updated successfully!");
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

  const getInitials = (nameStr: string) => {
    if (!nameStr) return "U";
    const parts = nameStr.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameStr.slice(0, 2).toUpperCase();
  };

  return {
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
  };
}
