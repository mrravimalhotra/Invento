import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { helpHref, HELP_SECTION_IDS } from "../../lib/help-links";

test("help link picks the longest matching path", () => {
  assert.equal(helpHref("/"), "/user-guide#dashboard");
  assert.equal(helpHref("/items/123"), "/user-guide#item-master");
  assert.equal(helpHref("/item-types"), "/user-guide#item-type-master");
  assert.equal(helpHref("/admin/stock-integrity"), "/user-guide#stock-integrity-check");
  assert.equal(helpHref("/user-guide"), null);
  assert.equal(helpHref("/admin/bmr-deprecated"), null);
});

test("every help section exists in the generated guide", () => {
  const html = readFileSync(new URL("../../app/(dashboard)/user-guide/guide-html.ts", import.meta.url), "utf8");
  for (const id of HELP_SECTION_IDS) assert.ok(html.includes(`id=\\"${id}\\"`), id);
});
