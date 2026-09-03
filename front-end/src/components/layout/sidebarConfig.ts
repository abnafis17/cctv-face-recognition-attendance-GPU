import * as LucideIcons from "lucide-react";
import {
  Video,
  Cctv,
  ListVideo,
  ScanFace,
  Users,
  CalendarClock,
  Activity,
  History,
  UserX,
  IdCard,
  ClipboardList,
  UserSearch,
  UserPlus,
  BarChart3,
  PieChart,
  Database,
  Settings,
  Link2,
  ShieldCheck,
} from "lucide-react";

export interface SubNavItem {
  href: string;
  label: string;
  icon: any;
}

export interface NavItem {
  href?: string;
  label: string;
  icon: any;
  subItems?: SubNavItem[];
}

export function getIconForRoute(route: string | null | undefined, label: string) {
  if (route === "/cameras") return LucideIcons.Cctv;
  if (route === "/camera-list") return LucideIcons.ListVideo;
  if (route === "/enroll") return LucideIcons.ScanFace;
  if (route === "/employees") return LucideIcons.Users;
  if (route === "/daily-attendance") return LucideIcons.CalendarClock;
  if (route === "/headcount") return LucideIcons.Activity;
  if (route === "/presence") return LucideIcons.Video;
  if (route === "/bounding-box") return LucideIcons.Activity;
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

export const staticNav: NavItem[] = [
  { href: "/cameras", label: "Cameras (Live)", icon: Cctv },
  { href: "/camera-list", label: "Camera List", icon: ListVideo },
  { href: "/enroll", label: "Enrollment (Auto)", icon: ScanFace },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/daily-attendance", label: "Daily Attendance", icon: CalendarClock },
  { href: "/headcount", label: "Headcount (Realtime)", icon: Activity },
  { href: "/presence", label: "Presence Monitor", icon: Video },
  { href: "/bounding-box", label: "Bounding Box Config", icon: Activity },
  { href: "/attendance", label: "Recognition History", icon: History },
  { href: "/unknown-recognition", label: "Unknown History", icon: UserX },
  {
    label: "Gate Pass",
    icon: IdCard,
    subItems: [
      { href: "/gatepass", label: "Gate Pass Form", icon: ScanFace },
      { href: "/gatepass/history", label: "Gate Pass Log", icon: ClipboardList },
    ],
  },
  {
    label: "Visitor",
    icon: UserSearch,
    subItems: [
      { href: "/visitors/add", label: "Add Visitor", icon: UserPlus },
      { href: "/visitors", label: "Visitor List", icon: ClipboardList },
      { href: "/visitors/employee-wise-visit", label: "Employee Wise Visit", icon: BarChart3 },
      { href: "/visitors/visitor-wise-visit", label: "Visitor Wise Visit", icon: PieChart },
    ],
  },
  { href: "/master-data", label: "Master Data", icon: Database },
  {
    label: "Settings",
    icon: Settings,
    subItems: [
      { href: "/settings/urls", label: "URLs", icon: Link2 },
      { href: "/settings/users", label: "Users", icon: Users },
    ],
  },
  { href: "/permissions", label: "Permissions", icon: ShieldCheck },
];

export function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/visitors") return pathname === "/visitors";
  if (href === "/gatepass") return pathname === "/gatepass";
  return pathname === href || pathname.startsWith(href + "/");
}
