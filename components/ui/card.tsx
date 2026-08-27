import { cn } from "@/lib/utils";

export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-lg border border-border bg-card shadow-sm", className)}>{children}</div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function CardBody({ className, children }: { className?: string; children: React.ReactNode }) {
  return <div className={cn("p-5", className)}>{children}</div>;
}

export function StatCard({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const content = (
    <Card className="p-4 hover:border-brand/50 transition-colors h-full">
      <p className="text-xs font-medium text-muted uppercase tracking-wide">{label}</p>
      <p className="mt-1.5 text-2xl font-semibold text-foreground">{value}</p>
    </Card>
  );
  if (href) {
    return (
      <a href={href} className="block">
        {content}
      </a>
    );
  }
  return content;
}
