import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { PasswordForm } from "./profile-forms";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Your account details and password. Your display name is set by the System Administrator."
      />
      <div className="grid max-w-2xl gap-6">
        <Card>
          <CardHeader title="Account" />
          <CardBody className="grid gap-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted">Email</span>
              <span>{user.email}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted">Roles</span>
              <span>
                {user.roles.length ? user.roles.map((r) => ROLE_LABELS[r]).join(", ") : "None assigned yet"}
              </span>
            </div>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Display name" />
          <CardBody className="grid gap-2 text-sm">
            <p className="font-medium">{user.fullName || "(no name set)"}</p>
            <p className="text-muted">
              The name shown on QC decisions, certificates and the audit trail is set by the System Administrator. If it
              is wrong, ask them to change it on User Roles &amp; Access.
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Change password" />
          <CardBody>
            <PasswordForm />
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
