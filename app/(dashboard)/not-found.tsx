import { LinkButton } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

// SCAN-P7-19: shown inside the Invento layout (menu and top bar kept) when a
// page calls notFound() — a deleted or mistyped record address.
export default function DashboardNotFound() {
  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-lg">
        <CardHeader title="Record not found" />
        <CardBody className="flex flex-col gap-3 text-sm text-muted">
          <p>
            This record was not found. It may have been deleted, or the address may be mistyped. Use the
            menu to open the list again.
          </p>
          <div className="flex flex-wrap gap-2">
            <LinkButton href="/">Go to Dashboard</LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
