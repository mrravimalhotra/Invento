import Link from "next/link";
import { Card } from "@/components/ui/card";
import { ROLE_LABELS, type Role } from "@/lib/constants/roles";
import { tasksFor, type TaskKey } from "@/lib/my-tasks";

// UX-04: first card on the Dashboard — what waits for this user, by role.
export function MyTasksCard({ roles, counts }: { roles: readonly Role[]; counts: Partial<Record<TaskKey, number>> }) {
  const tasks = tasksFor(roles).filter((t) => counts[t.key] !== undefined);
  if (tasks.length === 0) return null;
  const nothing = tasks.every((t) => counts[t.key] === 0);
  const roleNames = roles.map((r) => ROLE_LABELS[r]).join(", ");

  return (
    <Card className="mb-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-5 py-3.5">
        <h2 className="text-sm font-semibold text-foreground">My tasks</h2>
        <span className="text-xs text-muted">from your roles: {roleNames}</span>
      </div>
      {nothing ? (
        <p className="px-5 py-3 text-sm text-muted">Nothing waiting for you.</p>
      ) : (
        <ul>
          {tasks.map((t) => {
            const n = counts[t.key] ?? 0;
            return (
              <li key={t.key} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 px-5 py-2.5 text-sm last:border-0">
                <span className="flex items-center gap-2.5">
                  <span
                    className={`inline-flex min-w-7 justify-center rounded-full px-2 py-0.5 text-xs font-semibold ${n > 0 ? "bg-brand text-white" : "bg-border text-muted"}`}
                  >
                    {n}
                  </span>
                  <span className={n > 0 ? "text-foreground" : "text-muted"}>{t.label(n)}</span>
                </span>
                {n > 0 ? (
                  <Link href={t.href} className="text-xs text-brand-dark underline max-md:min-h-11 max-md:inline-flex max-md:items-center">
                    {t.link} →
                  </Link>
                ) : (
                  <span className="text-xs text-muted">nothing to do</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
