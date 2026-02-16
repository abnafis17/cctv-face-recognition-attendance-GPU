export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-400 via-slate-300 to-zinc-400 p-6">
      <div className="mx-auto max-w-6xl">
        <h1 className="page-title">CCTV Face Recognition Dashboard</h1>
        <p className="page-subtitle">
          Backend:{" "}
          {process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001"}
        </p>

        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}
