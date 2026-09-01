"use server";

import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { canWrite } from "@/lib/constants/roles";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error?: string; success?: string } | undefined;

export async function createDocument(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const docType = String(formData.get("doc_type") || "");
  const title = String(formData.get("title") || "").trim();
  const revisionRaw = String(formData.get("revision_number") || "0").trim();
  const fileUrl = String(formData.get("file_url") || "").trim();
  const effectiveDate = String(formData.get("effective_date") || "").trim();

  if (docType !== "sop" && docType !== "stp") return { error: "Document type is required." };
  if (!title) return { error: "Title is required." };
  if (!fileUrl) return { error: "File URL is required." };

  const revisionNumber = revisionRaw === "" ? 0 : Number(revisionRaw);
  if (Number.isNaN(revisionNumber)) return { error: "Revision number must be a number." };

  const user = await getCurrentUser();
  if (!canWrite(user?.roles ?? [], "documents")) return { error: "Not authorized." };

  const supabase = await createClient();
  const { error } = await supabase.from("documents").insert({
    doc_type: docType,
    title,
    revision_number: revisionNumber,
    file_url: fileUrl,
    effective_date: effectiveDate || null,
    created_by: user!.id,
  });
  if (error) return { error: error.message };

  revalidatePath("/documents");
  redirect("/documents?created=1");
}
