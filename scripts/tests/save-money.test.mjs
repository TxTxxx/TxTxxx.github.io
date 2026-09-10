import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fresh,
  cents,
  calculate,
  validate,
  budgetAt,
} from "../../public/save-money/ledger.js";
const state = (entries, mode = "daily", transfers = []) => ({
  ...fresh("2026-09-07"),
  configured: true,
  mode,
  entries: entries.map(([date, spent]) => ({ date, spent })),
  transfers,
});
test("money uses integer cents and rejects ambiguous inputs", () => {
  assert.equal(cents("0.29"), 29);
  assert.equal(cents("123.4"), 12340);
  for (const n of ["", "-1", "1.234", "1e2", "NaN"])
    assert.throws(() => cents(n));
});
test("overspend is repaid before a new transfer", () => {
  const s = state([
    ["2026-09-07", 13000],
    ["2026-09-08", 8000],
    ["2026-09-09", 6000],
  ]);
  assert.equal(calculate(s, "2026-09-07").debt, 3000);
  assert.equal(calculate(s, "2026-09-08").debt, 1000);
  assert.equal(calculate(s, "2026-09-09").available, 3000);
});
test("missing days are not free allowances and block subsequent settlements", () => {
  const s = state([
    ["2026-09-07", 6000],
    ["2026-09-09", 1000],
  ]);
  const c = calculate(s, "2026-09-09");
  assert.equal(c.missing, "2026-09-08");
  assert.equal(c.available, 4000);
});
test("known later overspending reduces earlier untransferred balance", () => {
  const s = state([
    ["2026-09-07", 6000],
    ["2026-09-09", 13000],
  ]);
  assert.equal(calculate(s, "2026-09-09").available, 1000);
});
test("weekly settlement waits for Sunday and complete records", () => {
  const s = state(
    Array.from({ length: 7 }, (_, i) => [
      `2026-09-${String(7 + i).padStart(2, "0")}`,
      8000,
    ]),
    "weekly",
  );
  assert.equal(calculate(s, "2026-09-12").available, 0);
  assert.equal(calculate(s, "2026-09-13").available, 14000);
});
test("switching modes never duplicates confirmed transfers", () => {
  const s = state(
    Array.from({ length: 7 }, (_, i) => [
      `2026-09-${String(7 + i).padStart(2, "0")}`,
      8000,
    ]),
    "weekly",
    [{ id: "a", date: "2026-09-07", amount: 2000 }],
  );
  assert.equal(calculate(s, "2026-09-08").debt, 0);
  assert.equal(calculate(s, "2026-09-13").available, 12000);
  s.mode = "daily";
  assert.equal(calculate(s, "2026-09-13").available, 12000);
});
test("editing an already transferred day creates future debt", () => {
  const s = state([["2026-09-07", 9000]], "daily", [
    { id: "a", date: "2026-09-07", amount: 4000 },
  ]);
  assert.equal(calculate(s, "2026-09-07").available, 0);
  assert.equal(calculate(s, "2026-09-07").debt, 3000);
  assert.equal(calculate(s, "2026-09-07").saved, 4000);
});
test("budget changes preserve past allowances", () => {
  const s = state([
    ["2026-09-07", 5000],
    ["2026-09-08", 5000],
  ]);
  s.budgets.push({ date: "2026-09-08", amount: 8000 });
  assert.equal(budgetAt(s, "2026-09-07"), 10000);
  assert.equal(calculate(s, "2026-09-08").available, 8000);
});
test("backup validation rejects invalid dates, duplicate entries and negative amounts", () => {
  const s = state([["2026-09-07", 0]]);
  assert.equal(validate(s), s);
  for (const bad of [
    { ...s, start: "2026-02-30" },
    { ...s, entries: [...s.entries, ...s.entries] },
    { ...s, entries: [{ date: "2026-09-07", spent: -1 }] },
  ])
    assert.throws(() => validate(bad));
});
