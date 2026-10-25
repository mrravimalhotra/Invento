// UX-14 (25 Oct 2026): when a save fails because of one field, the action returns that
// field's name (`field`) next to `error`. The form outlines the field in red, puts the
// message under it and moves the cursor there; the notice at the top stays as before.
// The mark goes as soon as the field is changed or the form is submitted again.

const MSG_ATTR = "data-field-error";

export function clearFieldErrors(form: HTMLFormElement) {
  form.querySelectorAll(`[${MSG_ATTR}]`).forEach((n) => n.remove());
  form.querySelectorAll("[data-invalid]").forEach((n) => n.removeAttribute("data-invalid"));
  form.querySelectorAll('[aria-invalid="true"][data-marked]').forEach((n) => {
    n.removeAttribute("aria-invalid");
    n.removeAttribute("data-marked");
  });
}

// A visually hidden control (the combobox's real <select>) can't take focus; use the
// visible box in the same Field instead.
function focusTarget(control: HTMLElement, wrapper: Element | null): HTMLElement {
  const hidden =
    control.getAttribute("aria-hidden") === "true" ||
    (control instanceof HTMLInputElement && control.type === "hidden") ||
    control.tabIndex < 0;
  if (!hidden || !wrapper) return control;
  return (
    wrapper.querySelector<HTMLElement>(
      'input:not([type="hidden"]):not([aria-hidden="true"]), textarea, select:not([aria-hidden="true"])'
    ) ?? control
  );
}

export function markFieldError(form: HTMLFormElement, field: string, message: string): boolean {
  clearFieldErrors(form);
  const control = Array.from(form.elements).find(
    (el): el is HTMLElement => el instanceof HTMLElement && el.getAttribute("name") === field
  );
  if (!control) return false;
  const wrapper = control.closest("[data-field]");
  const target = focusTarget(control, wrapper);
  if (!target.hasAttribute("aria-invalid")) {
    target.setAttribute("aria-invalid", "true");
    target.setAttribute("data-marked", "");
  }
  const msg = document.createElement("p");
  msg.setAttribute(MSG_ATTR, "");
  msg.setAttribute("role", "alert");
  msg.className = "text-xs text-red";
  msg.textContent = message;
  if (wrapper) {
    wrapper.setAttribute("data-invalid", "");
    wrapper.appendChild(msg);
  } else {
    target.insertAdjacentElement("afterend", msg);
  }
  target.focus({ preventScroll: true });
  target.scrollIntoView({ block: "center", behavior: "smooth" });
  const clear = () => {
    clearFieldErrors(form);
    form.removeEventListener("input", clear, true);
    form.removeEventListener("change", clear, true);
  };
  form.addEventListener("input", clear, true);
  form.addEventListener("change", clear, true);
  return true;
}
