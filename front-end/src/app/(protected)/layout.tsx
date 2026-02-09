import Sidebar from "@/components/layout/Sidebar";
import AuthGuard from "@/components/layout/AuthGuard"; // or your ProtectedLayout guard

export default function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-dvh overflow-hidden bg-gradient-to-br from-slate-200 via-slate-100 to-zinc-200">
        <Sidebar />
        <main className="flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-5 md:pb-5 md:pt-6 lg:p-6">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
