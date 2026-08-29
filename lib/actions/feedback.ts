"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@/lib/constants/feedback";

export type ActionState = { error?: string; success?: string } | undefined;

export type FeedbackRow = {
  id: string;
  page_path: string;
  page_label: string;
  url_path: string;
  observation: string;
  submitted_by_name: string;
  category: string | null;
  status: string;
  claude_notes: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string | null;
};

const submitSchema = z.object({
  pagePath: z.string().trim().min(1),
  pageLabel: z.string().trim().min(1),
  urlPath: z.string().trim().min(1),
  observation: z.string().trim().min(5, "Please describe the observation in a bit more detail."),
});

export async function submitFeedback(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to submit feedback." };

  const parsed = submitSchema.safeParse({
    pagePath: String(formData.get("pagePath") || ""),
    pageLabel: String(formData.get("pageLabel") || ""),
    urlPath: String(formData.get("urlPath") || ""),
    observation: String(formData.get("observation") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.from("page_feedback").insert({
    page_path: parsed.data.pagePath,
    page_label: parsed.data.pageLabel,
    url_path: parsed.data.urlPath,
    observation: parsed.data.observation,
    submitted_by: user.id,
    submitted_by_name: user.fullName,
  });
  if (error) return { error: error.message };

  revalidatePath(parsed.data.pagePath === "/" ? "/" : parsed.data.pagePath);
  revalidatePath("/feedback");
  return { success: "Thanks — your observation has been recorded." };
}

export async function listPageFeedback(pagePath: string): Promise<FeedbackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("page_feedback")
    .select(
      "id, page_path, page_label, url_path, observation, submitted_by_name, category, status, claude_notes, resolved_at, created_at, updated_at"
    )
    .eq("page_path", pagePath)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

export async function listAllFeedback(): Promise<FeedbackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("page_feedback")
    .select(
      "id, page_path, page_label, url_path, observation, submitted_by_name, category, status, claude_notes, resolved_at, created_at, updated_at"
    )
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

const triageSchema = z.object({
  category: z.enum(FEEDBACK_CATEGORIES).nullable(),
  status: z.enum(FEEDBACK_STATUSES),
  claudeNotes: z.string().trim().optional(),
});

export async function triageFeedback(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user?.roles.includes("system_admin")) return { error: "System Admin access required." };

  const rawCategory = String(formData.get("category") || "");
  const parsed = triageSchema.safeParse({
    category: rawCategory ? rawCategory : null,
    status: String(formData.get("status") || "new"),
    claudeNotes: String(formData.get("claudeNotes") || ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase
    .from("page_feedback")
    .update({
      category: parsed.data.category,
      status: parsed.data.status,
      claude_notes: parsed.data.claudeNotes || null,
      resolved_at: ["implemented", "rejected"].includes(parsed.data.status) ? new Date().toISOString() : null,
    })
    .eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/feedback");
  return { success: "Saved." };
}
