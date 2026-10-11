"use client";

import { Button, LinkButton } from "@/components/ui/button";
import { Card, CardHeader, CardBody } from "@/components/ui/card";

// SCAN-P7-19: a page that throws used to show the framework's bare white
// "Application error" screen with no way back. This keeps the menu and top
// bar (it renders inside the dashboard layout), says what to do, and shows
// the error code so it can be quoted when reporting the problem.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex justify-center py-8">
      <Card className="w-full max-w-lg">
        <CardHeader title="Something went wrong" />
        <CardBody className="flex flex-col gap-3 text-sm text-muted">
          <p>
            This page could not be shown. Nothing you saved earlier has been lost. Try again, and if the
            problem comes back, tell your administrator and quote the code below.
          </p>
          {error.digest && (
            <p>
              Error code: <span className="font-mono text-foreground">{error.digest}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => reset()}>Try again</Button>
            <LinkButton href="/" variant="secondary">
              Go to Dashboard
            </LinkButton>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
