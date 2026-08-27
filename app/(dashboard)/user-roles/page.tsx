import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { UserRoleRow } from "./user-role-row";

type ProfileRow = { id: string; full_name: string | null };
type RoleRow = { user_id: string; role: string };

export default async function UserRolesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canManage = canWrite(user.roles, "user_roles");

  return (
    <div>
      <PageHeader
        title="User Roles & Access"
        description="Assign roles to control who can write to each module. Reads stay open to every signed-in user; writes are role-gated."
      />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-bg px-4 py-3 text-sm text-amber">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          This is now database-enforced — even a direct API call from a non-admin account is
          rejected, not just this screen. The <code className="font-mono">user_roles</code> table&apos;s
          Row Level Security policy requires the caller to already hold System Admin before any
          write is accepted, so this screen can no longer be used to self-escalate the way the old
          baseline&apos;s unrestricted version could.
        </p>
      </div>

      {!canManage ? (
        <Card>
          <CardHeader title="Access restricted" />
          <CardBody className="text-sm text-muted">
            You need System Admin access to manage roles. Ask an existing System Admin to grant it
            to you, or contact the system owner.
          </CardBody>
        </Card>
      ) : (
        <UserRolesManager currentUserId={user.id} />
      )}
    </div>
  );
}

async function UserRolesManager({ currentUserId }: { currentUserId: string }) {
  const supabase = await createClient();

  const [{ data: profiles, error: profilesError }, { data: roleRows, error: rolesError }] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
    ]);

  const roleMap = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as RoleRow[]) {
    const list = roleMap.get(r.user_id) ?? [];
    list.push(r.role);
    roleMap.set(r.user_id, list);
  }

  const users = (profiles ?? []) as ProfileRow[];

  return (
    <Card>
      <CardHeader title={`Users (${users.length})`} />
      {(profilesError || rolesError) && (
        <CardBody className="text-sm text-red">
          {profilesError?.message ?? rolesError?.message ?? "Could not load users."}
        </CardBody>
      )}
      <div className="divide-y divide-border">
        {users.length === 0 && !profilesError && (
          <CardBody className="text-sm text-muted">No users found yet.</CardBody>
        )}
        {users.map((u) => (
          <UserRoleRow
            key={u.id}
            userId={u.id}
            displayName={u.full_name || "(no name set)"}
            isSelf={u.id === currentUserId}
            currentRoles={roleMap.get(u.id) ?? []}
          />
        ))}
      </div>
    </Card>
  );
}
