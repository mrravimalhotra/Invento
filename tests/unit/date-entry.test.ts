import { test } from "node:test";
import assert from "node:assert/strict";
import { dateEntryError, dmyToIso, isoToDmy } from "../../lib/date-entry";

test("dd-mm-yyyy is read day first, in any separator", () => {
  assert.equal(dmyToIso("05-10-2026"), "2026-10-05");
  assert.equal(dmyToIso("5/10/2026"), "2026-10-05");
  assert.equal(dmyToIso("5.10.2026"), "2026-10-05");
  assert.equal(dmyToIso("05102026"), "2026-10-05");
  assert.equal(dmyToIso(" 29-02-2028 "), "2028-02-29");
});

test("impossible dates are refused", () => {
  for (const t of ["31-04-2026", "29-02-2027", "00-01-2026", "10-13-2026", "2026-10-05", "5-10-26", "abc"]) {
    assert.equal(dmyToIso(t), null, t);
  }
});

test("iso is shown as dd-mm-yyyy", () => {
  assert.equal(isoToDmy("2026-10-05"), "05-10-2026");
  assert.equal(isoToDmy(""), "");
  assert.equal(isoToDmy(null), "");
});

test("messages for blank, wrong and out-of-range dates", () => {
  assert.equal(dateEntryError("", {}), "");
  assert.match(dateEntryError("", { required: true }), /Enter a date/);
  assert.match(dateEntryError("31-04-2026", {}), /real date/);
  assert.equal(dateEntryError("25-10-2026", { max: "2026-10-25" }), "");
  assert.match(dateEntryError("26-10-2026", { max: "2026-10-25" }), /after 25-10-2026/);
  assert.match(dateEntryError("01-01-2020", { min: "2021-01-01" }), /before 01-01-2021/);
});
