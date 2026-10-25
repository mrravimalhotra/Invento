import { test } from "node:test";
import assert from "node:assert/strict";
import { termsIn, GLOSSARY } from "@/lib/glossary";

const names = (t: string) => termsIn(t).map((x) => x.term);

test("headings get the meanings of the short terms they use (UX-07)", () => {
  assert.deepEqual(names("AR No."), ["AR No."]);
  assert.deepEqual(names("AR Number"), ["AR No."]);
  assert.deepEqual(names("RM-FP item code"), ["RM-FP"]);
  assert.deepEqual(names("FP Batch"), ["FP"]);
  assert.deepEqual(names("QC / Stability / R&D"), ["R&D"]);
  assert.deepEqual(names("Rate incl. GST(₹)"), ["GST"]);
  assert.deepEqual(names("PQTY"), ["PQTY"]);
  assert.deepEqual(names("MFR code"), ["MFR"]);
});

test("ordinary words are not mistaken for terms", () => {
  assert.deepEqual(names("Retest date"), []);
  assert.deepEqual(names("Armour"), []);
  assert.deepEqual(names("Formula"), []);
  assert.deepEqual(names("Batch number"), []);
});

test("every glossary entry has a meaning", () => {
  for (const g of GLOSSARY) assert.ok(g.meaning.length > 10, g.term);
});
