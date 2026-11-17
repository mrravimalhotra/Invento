import { BackLink } from "@/components/ui/back-link";
import { HelpLink } from "@/components/ui/help-link";

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
    <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="min-w-0 flex-1 basis-64">
        {back && <BackLink href={back.href} label={back.label} />}
        <h1 className="text-xl font-semibold text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted max-w-2xl">{description}</p>}
      </div>
      <div className="flex min-w-0 max-w-full flex-wrap items-start gap-3">
        <HelpLink />
        {action}
      </div>
    </div>
  );
}
