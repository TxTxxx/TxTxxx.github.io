import {
  KEY,
  dateKey,
  addDays,
  cents,
  money,
  fresh,
  budgetAt,
  calculate,
  validate,
} from "./ledger.js";
const $ = (id) => document.getElementById(id);
let state = fresh(),
  raw = null,
  broken = false,
  stagedTransfer = null,
  restore = null;
function notify(text) {
  $("toast").textContent = text;
  $("toast").hidden = false;
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => ($("toast").hidden = true), 4000);
}
function storageError(text) {
  broken = true;
  $("storage-error").textContent = text;
  $("storage-error").hidden = false;
}
try {
  raw = localStorage.getItem(KEY);
  if (raw) state = validate(JSON.parse(raw));
  localStorage.setItem(`${KEY}.check`, "1");
  localStorage.removeItem(`${KEY}.check`);
} catch {
  storageError(
    "无法读取或保存账本。请不要清除网站数据；可在设置中导出原始备份，或恢复有效备份。",
  );
}
function save(next, { replace = false } = {}) {
  if (broken && !replace) throw Error("账本存储不可用，请先处理顶部提示。");
  if (localStorage.getItem(KEY) !== raw)
    throw Error("账本已在另一个窗口更新，请刷新后再操作。");
  next.revision = state.revision + 1;
  validate(next);
  const encoded = JSON.stringify(next);
  localStorage.setItem(KEY, encoded);
  state = next;
  raw = encoded;
  broken = false;
  $("storage-error").hidden = true;
  render();
}
function openSettings() {
  const today = dateKey();
  $("budget").value = (budgetAt(state, today) / 100).toFixed(2);
  $("start").value = state.start;
  $("start").max = today;
  $("start").disabled = state.entries.length > 0 || state.transfers.length > 0;
  $("mode").value = state.mode;
  $("settings-title").textContent = state.configured
    ? "设置与备份"
    : "给自己一个每日额度";
  $("settings").showModal();
}
function selectDate(day) {
  $("entry-date").value = day;
  const entry = state.entries.find((e) => e.date === day);
  $("amount").value = entry ? (entry.spent / 100).toFixed(2) : "";
  updateHint();
}
function updateHint() {
  const day = $("entry-date").value,
    existing = state.entries.find((e) => e.date === day),
    budget = budgetAt(state, day);
  $("entry-submit").textContent = existing ? "更新这一天" : "记下这一天";
  $("entry-hint").textContent = existing
    ? "已记录。修改会重新计算待攒金额，已转存不变。"
    : "当天没有消费也请填 0；空白不会算成零消费。";
  try {
    const spent = cents($("amount").value);
    $("live-difference").textContent =
      spent <= budget
        ? `当天结余 ¥${money(budget - spent)} · 先补超支，再攒新钱`
        : `当天超支 ¥${money(spent - budget)} · 由未来结余补齐`;
  } catch {
    $("live-difference").textContent = `当天额度 ¥${money(budget)}`;
  }
}
function row(main, sub, right, action) {
  const node = document.createElement("div");
  node.className = "history-row";
  const left = document.createElement("div");
  left.textContent = main;
  const small = document.createElement("small");
  small.textContent = sub;
  left.append(small);
  const value = document.createElement("strong");
  value.className = "row-amount";
  value.textContent = right;
  node.append(left, value);
  if (action) {
    const b = document.createElement("button");
    b.textContent = "修改";
    b.onclick = action;
    node.append(b);
  }
  return node;
}
function render() {
  const c = calculate(state),
    today = dateKey();
  $("saved").textContent = money(c.saved);
  $("available").textContent = money(c.available);
  $("debt").textContent = `¥${money(c.debt)}`;
  $("transfer-count").textContent = state.transfers.length
    ? `${state.transfers.length} 次认真积累`
    : "从第一笔开始";
  $("mode-label").textContent =
    state.mode === "daily" ? "每日结算" : "每周结算";
  $("record-count").textContent = `${c.days} 天记录`;
  $("entry-date").min = state.start;
  $("entry-date").max = today;
  $("transfer-open").disabled =
    !state.configured || c.available === 0 || broken;
  $("settle-label").textContent =
    state.mode === "weekly" ? "已完成周的可转存金额" : "本次可转存";
  $("settle-note").textContent = c.missing
    ? `${c.missing} 尚未记录，后续日期暂不结算。${c.available > 0 ? "之前完整日期仍可转存。" : ""}`
    : c.debt > 0
      ? `先用之后的结余补齐 ¥${money(c.debt)}，再开始下一笔积累。`
      : state.mode === "weekly"
        ? `每周日记完后结算。本周未结算的结余保留，当前总待攒 ¥${money(c.pending)}。`
        : c.available > 0
          ? "这是扣除之前超支与已转存后的金额。"
          : "今天已经安排妥当，明天继续。";
  const list = $("history-list");
  list.replaceChildren();
  if (!state.entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty";
    empty.textContent = "还没有记录。今天，就是开始积累的第一天。";
    list.append(empty);
  }
  for (const e of [...state.entries].sort((a, b) =>
    b.date.localeCompare(a.date),
  )) {
    const diff = budgetAt(state, e.date) - e.spent;
    list.append(
      row(
        e.date,
        `额度 ¥${money(budgetAt(state, e.date))} · ${diff >= 0 ? "结余" : "超支"} ¥${money(Math.abs(diff))}`,
        `¥${money(e.spent)}`,
        () => {
          selectDate(e.date);
          $("entry-form").scrollIntoView({
            behavior: "smooth",
            block: "center",
          });
          $("amount").focus();
        },
      ),
    );
  }
  const transfers = $("transfers-list");
  transfers.replaceChildren();
  $("transfers-details").hidden = !state.transfers.length;
  for (const t of [...state.transfers].reverse())
    transfers.append(row(t.date, "已手动确认转存", `+ ¥${money(t.amount)}`));
  updateHint();
}
$("entry-form").onsubmit = (e) => {
  e.preventDefault();
  try {
    if (!state.configured) {
      openSettings();
      return;
    }
    const day = $("entry-date").value;
    if (day < state.start || day > dateKey())
      throw Error("请选择开始日期至今天之间的日期。");
    const spent = cents($("amount").value),
      next = structuredClone(state);
    next.entries = next.entries.filter((e) => e.date !== day);
    next.entries.push({ date: day, spent });
    save(next);
    notify("这一天记好了。");
  } catch (err) {
    notify(err.message);
  }
};
$("entry-date").onchange = () => selectDate($("entry-date").value);
$("amount").oninput = updateHint;
$("settings-open").onclick = openSettings;
$("settings-form").onsubmit = (e) => {
  e.preventDefault();
  try {
    const budget = cents($("budget").value);
    if (budget <= 0) throw Error("每日额度需要大于 0。");
    const next = structuredClone(state),
      today = dateKey();
    if (!next.entries.length && !next.transfers.length) {
      next.start = $("start").value;
      if (next.start > today) throw Error("开始日期不能晚于今天。");
      next.budgets = [{ date: next.start, amount: budget }];
    } else if (budget !== budgetAt(next, today)) {
      next.budgets = next.budgets.filter((b) => b.date !== today);
      next.budgets.push({ date: today, amount: budget });
    }
    next.mode = $("mode").value;
    next.configured = true;
    save(next);
    $("settings").close();
    selectDate(today);
    notify("设置已保存。");
  } catch (err) {
    notify(err.message);
  }
};
for (const b of document.querySelectorAll("[data-close]"))
  b.onclick = () => $(b.dataset.close).close();
$("transfer-open").onclick = () => {
  stagedTransfer = {
    amount: calculate(state).available,
    revision: state.revision,
  };
  $("transfer-amount").textContent = money(stagedTransfer.amount);
  $("transfer").showModal();
};
$("copy").onclick = async () => {
  try {
    await navigator.clipboard.writeText(
      (stagedTransfer.amount / 100).toFixed(2),
    );
    notify("金额已复制，请到微信付款。");
  } catch {
    notify("复制不可用，请手动输入上方金额。");
  }
};
$("confirm-transfer").onclick = () => {
  try {
    if (
      !stagedTransfer ||
      stagedTransfer.revision !== state.revision ||
      stagedTransfer.amount !== calculate(state).available
    )
      throw Error("账本已变化，请关闭后重新核对金额。");
    const next = structuredClone(state),
      amount = stagedTransfer.amount;
    if (amount <= 0) throw Error("当前没有可转存金额。");
    next.transfers.push({ id: crypto.randomUUID(), date: dateKey(), amount });
    save(next);
    stagedTransfer = null;
    $("transfer").close();
    $("celebrate-amount").textContent = `+ ¥${money(amount)}`;
    $("celebration").hidden = false;
    setTimeout(() => ($("celebration").hidden = true), 1800);
  } catch (err) {
    notify(err.message);
  }
};
$("export").onclick = () => {
  const blob = new Blob(
      [broken && raw ? raw : JSON.stringify(state, null, 2)],
      { type: "application/json" },
    ),
    url = URL.createObjectURL(blob),
    a = document.createElement("a");
  a.href = url;
  a.download = `一点点账本-${dateKey()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  notify("备份已导出，请保存到“文件”。");
};
$("import").onclick = () => $("import-file").click();
$("import-file").onchange = async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    if (file.size > 8_000_000) throw Error("备份文件过大。");
    restore = validate(JSON.parse(await file.text()));
    $("restore-summary").textContent =
      `${restore.entries.length} 天记录，${restore.transfers.length} 笔转存，累计 ¥${money(calculate(restore).saved)}。`;
    $("restore").showModal();
  } catch (err) {
    notify(err instanceof SyntaxError ? "无法读取此备份文件。" : err.message);
  }
  e.target.value = "";
};
$("restore-confirm").onclick = () => {
  try {
    if (!restore) return;
    save(structuredClone(restore), { replace: true });
    restore = null;
    $("restore").close();
    $("settings").close();
    selectDate(dateKey());
    notify("账本已恢复。");
  } catch (err) {
    notify(err.message);
  }
};
window.addEventListener("storage", (e) => {
  if (e.key === KEY) {
    try {
      raw = localStorage.getItem(KEY);
      state = raw ? validate(JSON.parse(raw)) : fresh();
      render();
      notify("已同步此浏览器另一个窗口的更改。");
    } catch {
      storageError("另一个窗口的账本无法读取，请导出备份后检查。");
    }
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) render();
});
selectDate(dateKey());
render();
if (!state.configured && !broken) openSettings();
if ("serviceWorker" in navigator)
  navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {});
if (document.modelContext?.registerTool) {
  const lifecycle = new AbortController();
  try {
    Promise.resolve(
      document.modelContext.registerTool(
        {
          name: "read_savings_summary",
          description: "读取当前浏览器攒钱本的结算摘要；不会转账或修改记录。",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true },
          execute: () => ({
            ...calculate(state),
            currency: "CNY",
            amountUnit: "fen",
            mode: state.mode,
          }),
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => {});
  } catch {}
  window.addEventListener("pagehide", () => lifecycle.abort(), { once: true });
}
