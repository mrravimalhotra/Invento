// UX-09 (Ravi, 25 Oct 2026): "You have unsaved changes" on every form. A form counts
// as changed once something is typed or picked in it, until it is submitted or reset
// (or disappears, as an edit form does on Cancel). Leaving the page then asks first:
// a link click asks in the page, closing or reloading the tab asks through the
// browser. Filter and search forms (a plain GET to a page address, such as the Ledger
// or Audit Log filters) and search boxes never count. A form or field can opt out
// with data-unsaved="ignore". Used by components/shell/unsaved-changes-guard.tsx.

export const UNSAVED_MESSAGE = "You have unsaved changes on this page. Leave without saving?";

function isFilterForm(form: HTMLFormElement): boolean {
  const action = form.getAttribute("action") ?? "";
  return form.method.toLowerCase() === "get" && action.startsWith("/");
}

function trackedForm(target: EventTarget | null): HTMLFormElement | null {
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) {
    return null;
  }
  if (target instanceof HTMLInputElement && (target.type === "search" || target.type === "hidden")) return null;
  if (target.closest('[data-unsaved="ignore"]')) return null;
  const form = target.form ?? target.closest("form");
  if (!form || isFilterForm(form)) return null;
  return form;
}

/** Starts watching the page; returns the function that stops it. */
export function installUnsavedGuard(): () => void {
  const dirty = new Set<HTMLFormElement>();
  const hasUnsaved = () => {
    for (const f of dirty) if (!f.isConnected) dirty.delete(f);
    return dirty.size > 0;
  };

  const onEdit = (e: Event) => {
    const form = trackedForm(e.target);
    if (form) dirty.add(form);
  };
  const onDone = (e: Event) => {
    if (e.target instanceof HTMLFormElement) dirty.delete(e.target);
  };
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const link = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
    if (!link || link.target === "_blank" || link.hasAttribute("download")) return;
    const url = new URL(link.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search) return; // same page (e.g. #anchor)
    if (!hasUnsaved()) return;
    if (window.confirm(UNSAVED_MESSAGE)) {
      dirty.clear();
    } else {
      e.preventDefault();
      e.stopImmediatePropagation();
    }
  };
  const onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (!hasUnsaved()) return;
    e.preventDefault();
    e.returnValue = "";
  };

  document.addEventListener("input", onEdit, true);
  document.addEventListener("change", onEdit, true);
  document.addEventListener("submit", onDone, true);
  document.addEventListener("reset", onDone, true);
  document.addEventListener("click", onClick, true);
  window.addEventListener("beforeunload", onBeforeUnload);
  return () => {
    document.removeEventListener("input", onEdit, true);
    document.removeEventListener("change", onEdit, true);
    document.removeEventListener("submit", onDone, true);
    document.removeEventListener("reset", onDone, true);
    document.removeEventListener("click", onClick, true);
    window.removeEventListener("beforeunload", onBeforeUnload);
  };
}
