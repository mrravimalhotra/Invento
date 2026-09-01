"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/lib/auth/session";
import { FEEDBACK_CATEGORIES, FEEDBACK_STATUSES } from "@/lib/constants/feedback";

export type ActionState = { error?: string; success?: string } | undefined;

export type FeedbackRow = {
  id: string;
  ticket_number: string;
  page_path: string;
  page_label: string;
  url_path: string;
  observation: string;
  submitted_by: string | null;
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

  // Short, stable identifier a tester or Ravi can reference in chat
  // ("implement FB-0003") — the uuid id isn't practical to read back.
  // Generated server-side via RPC, never in JavaScript (see
  // get_next_po_number/get_next_ar_number etc. for the same convention).
  const { data: ticketNumber, error: ticketError } = await supabase.rpc("get_next_feedback_ticket");
  if (ticketError) return { error: ticketError.message };

  const { error } = await supabase.from("page_feedback").insert({
    ticket_number: ticketNumber,
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
    // submitted_by included (not previously selected) so the widget can
    // show Edit/Delete only on the current tester's own tickets — FB-0012.
    .select(
      "id, ticket_number, page_path, page_label, url_path, observation, submitted_by, submitted_by_name, category, status, claude_notes, resolved_at, created_at, updated_at"
    )
    .eq("page_path", pagePath)
    .order("created_at", { ascending: false });
  if (error) return [];
  return data ?? [];
}

// FB-0012 (1 Sept 2026): "there should be option to edit/delete the
// feedback throughout the app" — a tester can fix or retract their own
// observation text, but only while it's still 'new' (not yet triaged) —
// see 0017_feedback_owner_crud.sql for why. This never touches
// category/status/claude_notes — those stay admin-only via triageFeedback().
const updateOwnSchema = z.object({
  observation: z.string().trim().min(5, "Please describe the observation in a bit more detail."),
});

export async function updateOwnFeedback(id: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to edit feedback." };

  const parsed = updateOwnSchema.safeParse({ observation: String(formData.get("observation") || "") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  // RLS (page_feedback_owner_update) is the real backstop — this WHERE
  // clause just makes the "not yours / already triaged" case return zero
  // rows instead of a generic RLS error, so we can show a clear message.
  const { data, error } = await supabase
    .from("page_feedback")
    .update({ observation: parsed.data.observation, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq("id", id)
    .eq("submitted_by", user.id)
    .eq("status", "new")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This ticket has already been reviewed and can no longer be edited." };
  }

  revalidatePath("/feedback");
  return { success: "Updated." };
}

export async function deleteOwnFeedback(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  const user = await getCurrentUser();
  if (!user) return { error: "You must be signed in to delete feedback." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("page_feedback")
    .delete()
    .eq("id", id)
    .eq("submitted_by", user.id)
    .eq("status", "new")
    .select("id");
  if (error) return { error: error.message };
  if (!data || data.length === 0) {
    return { error: "This ticket has already been reviewed and can no longer be deleted." };
  }

  revalidatePath("/feedback");
  return { success: "Deleted." };
}

export async function listAllFeedback(): Promise<FeedbackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("page_feedback")
    .select(
      "id, ticket_number, page_path, page_label, url_path, observation, submitted_by, submitted_by_name, category, status, claude_notes, resolved_at, created_at, updated_at"
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
