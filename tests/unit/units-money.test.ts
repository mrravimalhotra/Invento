import { test } from "node:test";
import assert from "node:assert/strict";
import { convertUnit, compatibleUnits, entryUnitsFor, unitFamily, UNITS } from "@/lib/constants/units";
import { toPaise, roundMoney, sumMoney, lineMoney } from "@/lib/money";
import { round3, MIN_STOCK_QTY } from "@/lib/stock-precision";
import { quantityLimit, quantityLimitError, unitPriceLimitError, textLimitError, firstLimitError, UNIT_PRICE_MAX } from "@/lib/limits";

test("weight and volume convert within their family", () => {
  assert.equal(convertUnit(250, "g", "kg"), 0.25);
  assert.equal(convertUnit(1.5, "kg", "g"), 1500);
  assert.equal(convertUnit(500, "mg", "g"), 0.5);
  assert.equal(convertUnit(2, "ltr", "ml"), 2000);
  assert.equal(convertUnit(7, "nos", "nos"), 7);
});

test("units from different families do not convert", () => {
  assert.equal(convertUnit(1, "kg", "ltr"), null);
  assert.equal(convertUnit(1, "nos", "pack"), null);
  assert.equal(convertUnit(1, "kg", "nos"), null);
});

test("entry units follow the item's unit family", () => {
  assert.deepEqual([...compatibleUnits("kg")], ["mg", "g", "kg"]);
  assert.deepEqual([...compatibleUnits("bottle")], ["bottle"]);
  assert.deepEqual([...entryUnitsFor(null)], [...UNITS]);
  assert.equal(unitFamily("ml"), "volume");
  assert.equal(unitFamily("pack"), null);
});

test("money rounds half a paisa up, also for negatives", () => {
  assert.equal(toPaise(1.005), 101);
  assert.equal(toPaise(-1.005), -101);
  assert.equal(toPaise(Number.NaN), 0);
  assert.equal(roundMoney(10.004), 10);
  assert.equal(sumMoney([0.1, 0.2]), 0.3);
});

test("a purchase line: base, GST and total each rounded to the paisa", () => {
  const m = lineMoney({ quantity: "3", unit_price: "33.333", gst_pct: 18 });
  assert.equal(m.itemTotalExclGst, 100);
  assert.equal(m.gstAmount, 18);
  assert.equal(m.lineTotal, 118);
  const blank = lineMoney({ quantity: null, unit_price: undefined, gst_pct: "" });
  assert.equal(blank.lineTotal, 0);
});

test("stock is kept to three decimals", () => {
  assert.equal(round3(0.6958000000000002), 0.696);
  assert.equal(round3(1.0005), 1.001);
  assert.equal(MIN_STOCK_QTY, 0.0005);
});

test("quantity and price ceilings (E60)", () => {
  assert.equal(quantityLimit("KG "), 1_000_000);
  assert.equal(quantityLimit("mg"), 1_000_000_000_000);
  assert.equal(quantityLimit("nos"), 100_000_000);
  assert.equal(quantityLimitError("Quantity", 1_000_000, "kg"), null);
  assert.match(quantityLimitError("Quantity", 1_000_001, "kg") ?? "", /above the largest value/);
  assert.equal(unitPriceLimitError(UNIT_PRICE_MAX), null);
  assert.match(unitPriceLimitError(UNIT_PRICE_MAX + 1) ?? "", /Unit price is above/);
  assert.match(textLimitError("Name", "x".repeat(201), 200) ?? "", /too long \(201 characters/);
  assert.equal(firstLimitError(null, "b", "c"), "b");
});
