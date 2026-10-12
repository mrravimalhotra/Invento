import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { getUserAccountStatuses } from "@/lib/auth/user-accounts";
import { UserRoleRow } from "./user-role-row";
import { AddUserForm } from "./add-user-form";
import { IdleTimeoutForm } from "./idle-timeout-form";
import { fetchIdleTimeoutMinutes } from "@/lib/company-server";

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
        description="Create user accounts, reset passwords, assign roles, and disable the accounts of people who leave. Self-registration is closed — every account is created here."
      />

      <div className="mb-6 flex items-start gap-3 rounded-lg border border-amber/30 bg-amber-bg px-4 py-3 text-sm text-amber">
        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Only a System Admin can change roles. The database refuses any role change from another account, even one made outside this screen.
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

  // Only reached for system_admin (canManage above) — getUserAccountStatuses
  // reads Supabase Auth through the service-role client.
  const [{ data: profiles, error: profilesError }, { data: roleRows, error: rolesError }, accounts] =
    await Promise.all([
      supabase.from("profiles").select("id, full_name").order("full_name", { ascending: true }),
      supabase.from("user_roles").select("user_id, role"),
      getUserAccountStatuses(),
    ]);
  const idleMinutes = await fetchIdleTimeoutMinutes(supabase);

  const roleMap = new Map<string, string[]>();
  for (const r of (roleRows ?? []) as RoleRow[]) {
    const list = roleMap.get(r.user_id) ?? [];
    list.push(r.role);
    roleMap.set(r.user_id, list);
  }

  // Disabled (leaver) accounts go to the bottom of the list.
  const isDisabled = (id: string) => accounts?.get(id)?.disabled ?? false;
  const users = [...((profiles ?? []) as ProfileRow[])].sort(
    (a, b) => Number(isDisabled(a.id)) - Number(isDisabled(b.id))
  );
  const disabledCount = users.filter((u) => isDisabled(u.id)).length;

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader title="Add user" />
        {accounts ? (
          <AddUserForm />
        ) : (
          <CardBody className="text-sm text-amber">
            Adding users and resetting passwords needs the Supabase service-role key on the server
            (<code className="font-mono">SUPABASE_SERVICE_ROLE_KEY</code>). It isn&apos;t set yet — see
            docs/SUPABASE_SETUP.md. Role assignment below still works.
          </CardBody>
        )}
      </Card>
      <Card>
        <CardHeader title="Automatic sign-out" />
        <CardBody>
          <IdleTimeoutForm minutes={idleMinutes} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader
          title={`Users (${users.length - disabledCount}${disabledCount ? ` active, ${disabledCount} disabled` : ""})`}
        />
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
              account={accounts?.get(u.id) ?? null}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}
