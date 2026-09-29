"use client";

import { useEffect } from "react";
import { setPdfUser } from "@/lib/pdf-user";

// Renders nothing; records the signed-in user's name for PDF footers.
export function PdfUserSetter({ name }: { name: string | null }) {
  useEffect(() => {
    setPdfUser(name);
  }, [name]);
  return null;
}
