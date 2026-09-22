"use client";

import { downloadCoaPdf, type CoaPdfData } from "@/lib/coa-pdf";
import { Button } from "@/components/ui/button";

export function CoaPdfButton({ data }: { data: CoaPdfData }) {
  return <Button onClick={() => downloadCoaPdf(data)}>Download PDF</Button>;
}
