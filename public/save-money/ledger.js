export const KEY = "txtxx.save-money.v1";
export const dateKey = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export function validDate(s) {
  return (
    typeof s === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(s) &&
    dateKey(new Date(`${s}T12:00:00`)) === s &&
    s >= "2000-01-01" &&
    s <= "2100-12-31"
  );
}
export function cents(s) {
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(String(s).trim()))
    throw Error("请输入非负金额，最多两位小数。");
  const [a, b = ""] = String(s).trim().split(".");
  return Number(a) * 100 + Number(b.padEnd(2, "0"));
}
export const money = (n) =>
  (n / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
export function fresh(today = dateKey()) {
  return {
    version: 1,
    revision: 0,
    configured: false,
    start: today,
    mode: "daily",
    budgets: [{ date: today, amount: 10000 }],
    entries: [],
    transfers: [],
  };
}
export function budgetAt(s, date) {
  return (
    [...s.budgets]
      .sort((a, b) => a.date.localeCompare(b.date))
      .filter((b) => b.date <= date)
      .at(-1)?.amount ?? s.budgets[0].amount
  );
}
export function calculate(s, today = dateKey()) {
  const entries = s.entries.filter((e) => e.date <= today);
  const saved = s.transfers.reduce((a, t) => a + t.amount, 0);
  const net = entries.reduce((a, e) => a + budgetAt(s, e.date) - e.spent, 0);
  // A missing day never earns an allowance. Settlement waits for a complete sequence.
  const byDate = new Map(entries.map((e) => [e.date, e]));
  let end = addDays(s.start, -1),
    missing = null;
  for (let day = s.start; day <= today; day = addDays(day, 1)) {
    if (!byDate.has(day)) {
      missing = day;
      break;
    }
    end = day;
  }
  let cutoff = end;
  if (s.mode === "weekly") {
    while (cutoff >= s.start && new Date(`${cutoff}T12:00:00`).getDay() !== 0)
      cutoff = addDays(cutoff, -1);
  }
  const settled = entries
    .filter((e) => e.date <= cutoff)
    .reduce((a, e) => a + budgetAt(s, e.date) - e.spent, 0);
  // Confirmed transfers remain deducted after edits and mode changes; never count twice.
  return {
    saved,
    net,
    debt: Math.max(0, saved - net),
    available: Math.max(0, Math.min(settled, net) - saved),
    missing,
    cutoff,
    days: entries.length,
    pending: Math.max(0, net - saved),
  };
}
export function validate(s) {
  const fail = () => {
    throw Error("备份格式不正确，当前账本未更改。");
  };
  const amount = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 999999999;
  if (
    !s ||
    s.version !== 1 ||
    typeof s.configured !== "boolean" ||
    !Number.isSafeInteger(s.revision) ||
    s.revision < 0 ||
    !validDate(s.start) ||
    !["daily", "weekly"].includes(s.mode)
  )
    fail();
  if (
    !Array.isArray(s.budgets) ||
    !s.budgets.length ||
    s.budgets.length > 40000 ||
    !Array.isArray(s.entries) ||
    s.entries.length > 40000 ||
    !Array.isArray(s.transfers) ||
    s.transfers.length > 100000
  )
    fail();
  for (const b of s.budgets)
    if (!b || !validDate(b.date) || !amount(b.amount) || b.amount === 0) fail();
  if (
    new Set(s.budgets.map((b) => b.date)).size !== s.budgets.length ||
    !s.budgets.some((b) => b.date <= s.start)
  )
    fail();
  for (const e of s.entries)
    if (!e || !validDate(e.date) || e.date < s.start || !amount(e.spent))
      fail();
  if (new Set(s.entries.map((e) => e.date)).size !== s.entries.length) fail();
  for (const t of s.transfers)
    if (
      !t ||
      typeof t.id !== "string" ||
      !validDate(t.date) ||
      !amount(t.amount) ||
      t.amount === 0
    )
      fail();
  if (new Set(s.transfers.map((t) => t.id)).size !== s.transfers.length) fail();
  return s;
}
