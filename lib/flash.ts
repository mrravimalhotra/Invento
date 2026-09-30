// Every operation ends with a visible message. Two routes feed it:
//  - actions that return { success } / { error } to a form -> useFlashActionState (lib/use-flash-action.ts)
//  - actions that redirect to another page -> `?saved=<key>` (lib/saved-messages.ts), picked up by FlashHost
// Both end up here, and <FlashHost/> (mounted once in the dashboard layout) shows a
// notice at the top of the screen that stays visible however far the page is scrolled.
export type FlashKind = "success" | "error";
export const FLASH_EVENT = "invento:flash";
export type FlashDetail = { message: string; kind: FlashKind };

export function flash(message: string, kind: FlashKind = "success"): void {
  if (typeof window === "undefined" || !message) return;
  window.dispatchEvent(new CustomEvent<FlashDetail>(FLASH_EVENT, { detail: { message, kind } }));
}
