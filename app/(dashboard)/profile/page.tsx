import { getCurrentUser } from "@/lib/auth/session";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ROLE_LABELS } from "@/lib/constants/roles";
import { redirect } from "next/navigation";
import { ProfileForm, PasswordForm } from "./profile-forms";

export default async function ProfilePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return (
    <div>
      <PageHeader
        title="My Profile"
        description="Self-service name, email, and password — item 1 on both the Quality Control and Store sections of the handwritten requirements list; the baseline had no equivalent."
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
          <CardBody>
            <ProfileForm defaultName={user.fullName} />
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
