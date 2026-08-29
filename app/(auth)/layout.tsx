import Image from "next/image";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <Image
            src="/atharva-logo.png"
            alt="Atharva Nature Healthcare"
            width={117}
            height={49}
            priority
            className="h-14 w-auto"
          />
          <p className="mt-2 text-sm text-muted">Ayurvedic Inventory &amp; Manufacturing ERP</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
