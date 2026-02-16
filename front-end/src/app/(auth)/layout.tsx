export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ui-readable min-h-screen bg-gradient-to-b from-zinc-50 to-zinc-100">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl items-center justify-center px-4 py-10">
        {children}
      </div>
    </div>
  );
}
