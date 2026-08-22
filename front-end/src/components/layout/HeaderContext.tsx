"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { usePathname } from "next/navigation";

type HeaderState = {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
};

type HeaderContextType = {
  headerState: HeaderState;
  setHeaderState: (state: HeaderState) => void;
  resetHeader: () => void;
};

const HeaderContext = createContext<HeaderContextType | undefined>(undefined);

export function HeaderProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [headerState, setHeaderState] = useState<HeaderState>({
    title: "",
    subtitle: "",
    actions: null,
  });

  const getModuleName = (path: string): string => {
    if (path.startsWith("/cameras")) return "Cameras (Live)";
    if (path.startsWith("/camera-list")) return "Camera List";
    if (path.startsWith("/enroll")) return "Enrollment (Auto)";
    if (path.startsWith("/employees")) return "Employees";
    if (path.startsWith("/daily-attendance")) return "Daily Attendance";
    if (path.startsWith("/attendance")) return "Recognition History";
    if (path.startsWith("/unknown-recognition")) return "Unknown History";
    if (path.startsWith("/gatepass")) return "Gate Pass";
    if (path.startsWith("/visitors")) return "Visitor";
    if (path.startsWith("/master-data")) return "Master Data";
    if (path.startsWith("/settings/users")) return "Users";
    if (path.startsWith("/settings/urls")) return "URLs";
    if (path.startsWith("/settings")) return "Settings";
    if (path.startsWith("/permissions")) return "Permissions";
    return "Dashboard";
  };

  const getModuleSubtitle = (path: string): string => {
    if (path.startsWith("/camera-list")) return "Manage camera metadata, stream settings, and cleanup inactive entries.";
    if (path.startsWith("/cameras")) return "View and manage active live camera streams.";
    if (path.startsWith("/enroll")) return "Register and train face recognition models.";
    if (path.startsWith("/employees")) return "Manage organization employees and their profiles.";
    if (path.startsWith("/daily-attendance")) return "View and filter daily employee attendance records.";
    if (path.startsWith("/attendance")) return "View face recognition activity logs.";
    if (path.startsWith("/unknown-recognition")) return "Review unrecognized face records and register them.";
    if (path.startsWith("/gatepass")) return "Manage visitor and employee gate passes.";
    if (path.startsWith("/visitors")) return "Manage visitors and visit logs.";
    if (path.startsWith("/settings")) return "Configure database and camera stream URLs.";
    if (path.startsWith("/permissions")) return "Configure roles and module authorization settings.";
    return "";
  };

  // Reset header state or set default title based on route when pathname changes
  useEffect(() => {
    setHeaderState({
      title: getModuleName(pathname),
      subtitle: getModuleSubtitle(pathname),
      actions: null,
    });
  }, [pathname]);

  const resetHeader = () => {
    setHeaderState({
      title: getModuleName(pathname),
      subtitle: getModuleSubtitle(pathname),
      actions: null,
    });
  };

  return (
    <HeaderContext.Provider value={{ headerState, setHeaderState, resetHeader }}>
      {children}
    </HeaderContext.Provider>
  );
}

export function useHeader() {
  const context = useContext(HeaderContext);
  if (!context) {
    throw new Error("useHeader must be used within a HeaderProvider");
  }
  return context;
}
