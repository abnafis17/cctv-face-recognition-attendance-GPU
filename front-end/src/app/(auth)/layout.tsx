export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="ui-readable min-h-screen w-full bg-slate-50 flex flex-col">
      {children}
    </div>
  );
}
