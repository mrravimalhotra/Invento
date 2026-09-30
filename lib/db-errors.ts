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

  // Unknown code: still say WHY in plain words where the code family tells us,
  // and always give the code as a reference so it can be traced in the log.
  console.error(`[db-error] unexpected ${code}: ${message}${error.details ? ` — ${error.details}` : ""}`);
  const lead = fallback === GENERIC ? "Something went wrong" : fallback.replace(/\.$/, "");
  return `${lead}. ${explainFamily(code)} (reference ${code})`;
}

// Plain-language reason for a code we have no exact wording for.
function explainFamily(code: string): string {
  if (code.startsWith("PGRST")) {
    return "The app asked the database for something it doesn't have — this usually means a database update hasn't been applied yet. Please tell your administrator, or report it with the Feedback button.";
  }
  switch (code.slice(0, 2)) {
    case "08":
    case "53":
    case "57":
    case "58":
      return "The database is busy or temporarily unreachable. Please wait a minute and try again.";
    case "42":
      return "This feature needs a database update that hasn't been applied yet. Please tell your administrator, or report it with the Feedback button.";
    case "22":
      return "One of the values isn't acceptable — please check the numbers, dates and texts you entered.";
    case "23":
      return "The data conflicts with existing records or rules. Please check it and try again.";
    default:
      return "Please try again; if it keeps happening, report it with the Feedback button.";
  }
}

function mapKnown(code: string, message: string): string | null {
  switch (code) {
    case "42501":
      // Our own role checks raise 42501 with a readable message; Postgres'
      // own permission / row-level-security refusals get a plain one.
      if (/row-level security|permission denied/i.test(message)) return "You don't have permission to do that. Ask an administrator if you need access.";
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
    case "22012":
      return "A calculation tried to divide by zero — check that quantities and conversion factors aren't zero.";
    case "40001":
    case "40P01":
    case "55P03":
      return "Someone else was saving related data at the same moment. Please try again.";
    case "57014":
      return "That took too long and was stopped. Please try again, or narrow the dates/filters.";
    case "PGRST116":
      return "That record wasn't found — it may have been removed. Refresh the page.";
    case "PGRST301":
    case "PGRST303":
      return "Your session has expired. Please sign in again.";
    case "PGRST202":
      // The API cannot find a database function the app calls: the database is
      // missing an update (or its function list is stale).
      return "This feature isn't available in the database yet — a database update hasn't been applied. Nothing was saved. Please tell your administrator (reference PGRST202).";
    case "PGRST200":
    case "PGRST204":
    case "PGRST205":
    case "42703":
    case "42P01":
    case "42883":
      return `This screen needs a database update that hasn't been applied yet. Nothing was saved. Please tell your administrator (reference ${code}).`;
    case "PGRST100":
    case "PGRST102":
      return "The request wasn't understood. Please refresh the page and try again.";
    default:
      return null;
  }
}
