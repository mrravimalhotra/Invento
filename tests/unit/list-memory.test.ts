import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { rememberListUrl, recallListUrl, markReturnTo, isReturnTo, saveTableState, loadTableState } from "@/lib/list-memory";

// A minimal sessionStorage for Node.
function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
  };
}
beforeEach(() => {
  (globalThis as unknown as { window: unknown }).window = { sessionStorage: fakeStorage() };
});

test("the back link returns to the list address as last seen (UX-16)", () => {
  assert.equal(recallListUrl("/audit"), "/audit");
  rememberListUrl("/audit", "table=items&page=2");
  assert.equal(recallListUrl("/audit"), "/audit?table=items&page=2");
  rememberListUrl("/audit", "");
  assert.equal(recallListUrl("/audit"), "/audit");
});

test("table state is restored only right after the back link was used", () => {
  assert.equal(isReturnTo("/items"), false);
  markReturnTo("/items");
  assert.equal(isReturnTo("/items"), true);
  assert.equal(isReturnTo("/vendors"), false);
  saveTableState("/items|Item Master", { query: "oil", source: "all", showInactive: true, sort: { header: "Name", dir: "desc" }, page: 1 });
  assert.deepEqual(loadTableState("/items|Item Master"), { query: "oil", source: "all", showInactive: true, sort: { header: "Name", dir: "desc" }, page: 1 });
  assert.equal(loadTableState("/vendors|x"), null);
});

test("no storage (private mode, blocked): plain list, nothing breaks", () => {
  (globalThis as unknown as { window: unknown }).window = {
    get sessionStorage(): Storage {
      throw new Error("blocked");
    },
  };
  rememberListUrl("/qc", "x=1");
  assert.equal(recallListUrl("/qc"), "/qc");
  markReturnTo("/qc");
  assert.equal(isReturnTo("/qc"), false);
});
