import Sidebar from "@/components/layout/Sidebar";
import AuthGuard from "@/components/layout/AuthGuard"; // or your ProtectedLayout guard

export default function ProtectedShell({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <div className="flex h-dvh overflow-hidden bg-gradient-to-br from-slate-400 via-slate-300 to-zinc-400">
        <Sidebar />
        <main className="ui-readable flex-1 overflow-y-auto overscroll-y-contain px-4 pb-[calc(env(safe-area-inset-bottom)+1rem)] pt-[calc(env(safe-area-inset-top)+5.5rem)] md:px-5 md:pb-3 md:pt-4 lg:p-4">
          {children}
        </main>
      </div>
    </AuthGuard>
  );
}
