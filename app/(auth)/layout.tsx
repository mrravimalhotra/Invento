export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-brand">INVENTO</h1>
          <p className="mt-1 text-sm text-muted">Ayurvedic Inventory &amp; Manufacturing ERP</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
