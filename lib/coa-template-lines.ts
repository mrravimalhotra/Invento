// Shared by every screen and action that defines a Certificate of Analysis
// template: Item Master (raw materials), MFR, and the template cards on
// their detail pages. Not a "use server" file, so it can export helpers.

export type EditableTemplateLine = { test: string; specification: string };

// Field names are prefixed ("coa_") so the editor can sit inside another
// form (new item, new MFR) without clashing with that form's own fields
// (the MFR recipe editor already uses `lineCount`).
export const COA_FIELD_PREFIX = "coa_";

// Same parsing convention as the MFR procedure steps: <prefix>lineCount
// plus indexed test_/specification_ fields. A row left completely blank
// (or removed client-side) is skipped; a row with only one side filled in
// is a real validation error.
export function parseCoaTemplateLines(
  formData: FormData,
  { optional }: { optional: boolean }
): EditableTemplateLine[] | { error: string } {
  const count = Number(formData.get(`${COA_FIELD_PREFIX}lineCount`) || 0);
  const lines: EditableTemplateLine[] = [];
  for (let i = 0; i < count; i++) {
    const test = String(formData.get(`${COA_FIELD_PREFIX}test_${i}`) || "").trim();
    const specification = String(formData.get(`${COA_FIELD_PREFIX}specification_${i}`) || "").trim();
    if (!test && !specification) continue;
    if (!test) return { error: `COA template row ${i + 1}: Test is required.` };
    if (!specification) return { error: `COA template row ${i + 1}: Specification is required.` };
    lines.push({ test, specification });
  }
  if (lines.length === 0 && !optional) return { error: "At least one test is required." };
  return lines;
}
