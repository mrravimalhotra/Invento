"use client";

import type { CoaPdfData } from "@/lib/coa-pdf";
import { Button } from "@/components/ui/button";

// Loaded on click, not with the page (PERF-06): the PDF / Word library only
// downloads when someone actually asks for the file.
const downloadCoaPdf = async (...args: Parameters<typeof import("@/lib/coa-pdf").downloadCoaPdf>) =>
  (await import("@/lib/coa-pdf")).downloadCoaPdf(...args);

export function CoaPdfButton({ data }: { data: CoaPdfData }) {
  return <Button onClick={() => downloadCoaPdf(data)}>Download PDF</Button>;
}
