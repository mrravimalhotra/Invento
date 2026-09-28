// SEC-12 (28 Sept 2026, security bundle — claude/security-bundle-decision.md):
// turn a database error into a message a user can act on, instead of showing
// raw Postgres text such as `duplicate key value violates unique constraint
// "items_item_code_key"` — confusing, and it reveals internal table and
// column names.
//
// - Messages written by Invento's own database rules (RAISE EXCEPTION in the
//   migrations: workflow guards, "At least one System Admin must remain",
//   QC gate, …) are already written for users and pass through unchanged.
// - Standard Postgres/PostgREST errors are mapped to plain wording.
// - Anything unexpected becomes a generic message with the error code as a
//   reference; the full raw error is written to the server log (Vercel →
//   Logs) so it can still be diagnosed.
// - Errors that aren't database errors (Supabase Auth, the app's own thrown
//   Errors) pass through unchanged.
//
// Plain module on purpose (not "use server"): imported by Server Actions.

type ErrorLike = { code?: string | null; message?: string | null; details?: string | null } | null | undefined;

const GENERIC = "Something went wrong. Please try again.";

// Codes our own migrations raise with a user-facing message.
const APP_MESSAGE_CODES = new Set(["P0001", "P0002", "22023"]);

function isDatabaseCode(code: string): boolean {
  return /^[0-9A-Z]{5}$/.test(code) || code.startsWith("PGRST");
}

export function friendlyDbError(error: ErrorLike, fallback: string = GENERIC): string {
  if (!error) return fallback;
  const code = error.code ?? "";
  const message = error.message ?? "";

  if (!code || !isDatabaseCode(code)) return message || fallback;
  if (APP_MESSAGE_CODES.has(code)) return message || fallback;

  const mapped = mapKnown(code, message);
  if (mapped) {
    console.error(`[db-error] ${code}: ${message}${error.details ? ` — ${error.details}` : ""}`);
    return mapped;
  }

  console.error(`[db-error] unexpected ${code}: ${message}${error.details ? ` — ${error.details}` : ""}`);
  return `${fallback === GENERIC ? "Something went wrong" : fallback.replace(/\.$/, "")} (reference ${code}). Please try again, or report it with the Feedback button.`;
}

function mapKnown(code: string, message: string): string | null {
  switch (code) {
    case "42501":
      // Our own role checks raise 42501 with a readable message; Postgres'
      // own permission / row-level-security refusals get a plain one.
      if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that.";
      return message || "You don't have permission to do that.";
    case "23505":
      return "That already exists — a record with the same code, number or name is already saved.";
    case "23503":
      if (/update or delete on/i.test(message)) {
        return "This record is still used elsewhere (for example by a purchase, QC check or batch), so it can't be removed.";
      }
      return "A linked record (such as the item, vendor or batch) no longer exists. Refresh the page and try again.";
    case "23514":
      return "One of the values isn't allowed — check that quantities aren't negative or above what's available.";
    case "23502":
      return "A required field is missing.";
    case "22P02":
    case "22007":
    case "22008":
      return "One of the values isn't in the right format — check numbers and dates.";
    case "22003":
      return "A number is too large.";
    case "22001":
      return "One of the texts is too long.";
    case "40001":
    case "40P01":
      return "Someone else was saving related data at the same moment. Please try again.";
    case "57014":
      return "That took too long and was stopped. Please try again.";
    case "PGRST116":
      return "That record wasn't found — it may have been removed. Refresh the page.";
    case "PGRST301":
    case "PGRST303":
      return "Your session has expired. Please sign in again.";
    default:
      return null;
  }
}
