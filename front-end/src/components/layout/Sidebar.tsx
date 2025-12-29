import Link from "next/link";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/cameras", label: "Cameras (Live)" },
  { href: "/enroll", label: "Enrollment (KYC)" },
  { href: "/employees", label: "Employees" },
  { href: "/attendance", label: "Attendance History" },
  { href: "/enrollment-control", label: "Enrollment Control" },
];

export default function Sidebar() {
  return (
    <aside className="w-64 border-r bg-white p-4">
      <div className="text-lg font-bold">CCTV Panel</div>
      <nav className="mt-4 space-y-1">
        {nav.map((n: any) => (
          <Link
            key={n.href}
            href={n.href}
            className="block rounded-md px-3 py-2 text-sm hover:bg-gray-100"
          >
            {n.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
