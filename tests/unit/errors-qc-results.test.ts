import { test } from "node:test";
import assert from "node:assert/strict";
import { friendlyDbError } from "@/lib/db-errors";
import { reasonError, parseResultLines, checkResultsAgainstTemplate, resultsDiffer, finalResults } from "@/lib/qc-results";
import { normName, validBarcode } from "@/lib/name-rules";
import { clampPage } from "@/lib/paging";

test("database messages written for people reach them as written", () => {
  assert.equal(friendlyDbError({ code: "P0001", message: "Purchase order not found." }), "Purchase order not found.");
  assert.equal(friendlyDbError({ code: "22023", message: "Retest period over 180 days." }), "Retest period over 180 days.");
  assert.equal(friendlyDbError(null, "Could not save."), "Could not save.");
});

test("technical database errors become plain sentences", () => {
  const quiet = console.error;
  console.error = () => {};
  try {
    assert.match(friendlyDbError({ code: "23505", message: "duplicate key" }), /already exists/);
    assert.match(friendlyDbError({ code: "42501", message: "new row violates row-level security" }), /permission/);
    assert.match(friendlyDbError({ code: "22P02", message: "invalid input" }), /isn't in the right format/);
    const unknown = friendlyDbError({ code: "XX001", message: "data corrupted" }, "Could not save the batch.");
    assert.match(unknown, /^Could not save the batch\. Please try again; if it keeps happening/);
    assert.match(unknown, /\(reference XX001\)$/);
    assert.match(friendlyDbError({ code: "PGRST202", message: "x" }), /database update hasn't been applied/);
  } finally {
    console.error = quiet;
  }
});

test("QC results: reason length and template match (E67)", () => {
  assert.match(reasonError("ok", "Reason") ?? "", /at least/);
  assert.equal(reasonError("Within limits", "Reason"), null);
  assert.equal(parseResultLines("not json"), null);
  assert.equal(parseResultLines('{"a":1}'), null);
  const template = [{ seq: 1, test: "pH", specification: "5 to 7" }];
  const lines = parseResultLines(JSON.stringify([{ seq: 1, test: "pH", specification: "5 to 7", result: "6.1" }]));
  assert.ok(lines);
  const ok = checkResultsAgainstTemplate(lines, template as never, true);
  assert.equal(ok.ok, true);
  const wrong = checkResultsAgainstTemplate([], template as never, true);
  assert.equal(wrong.ok, false);
  assert.equal(resultsDiffer(lines, lines), false);
  assert.equal(resultsDiffer(lines, [{ ...lines[0], result: "6.2" }]), true);
  assert.equal(finalResults({ checker_results: lines, reviewer_results: null }), lines);
});

test("names compare without case, extra spaces or a trailing dot", () => {
  assert.equal(normName("  Tab  Ostopix. "), "tab ostopix");
  assert.equal(validBarcode("ABC-123"), true);
  assert.equal(validBarcode("ab"), false);
  assert.equal(validBarcode("café"), false);
});

test("a page number stays inside the list", () => {
  assert.equal(clampPage(5, 30, 25), 1);
  assert.equal(clampPage(-1, 30, 25), 0);
  assert.equal(clampPage(0, 0, 25), 0);
});
