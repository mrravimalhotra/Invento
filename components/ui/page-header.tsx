import { BackLink } from "@/components/ui/back-link";

export function PageHeader({
  title,
  description,
  action,
  back,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  /** UX-16: "← Back to <label>" above the title, returning to the list as it was left. */
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {back && <BackLink href={back.href} label={back.label} />}
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted max-w-2xl">{description}</p>}
      </div>
      {action}
    </div>
  );
}
