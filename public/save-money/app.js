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
  if (typeof $("toast").showPopover === "function") $("toast").showPopover();
  clearTimeout(notify.timer);
  notify.timer = setTimeout(() => {
    if (typeof $("toast").hidePopover === "function") $("toast").hidePopover();
    $("toast").hidden = true;
  }, 4000);
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
    ? "攒钱设置"
    : "给自己一个每日额度";
  $("backup-section").hidden = !state.configured && !broken;
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
    ? "已保存，可修改金额。已确认转存的记录会保留。"
    : "只填生活消费，不包括转到攒钱号的钱；没消费填 0。";
  $("daily-budget").textContent = `¥${money(budget)}`;
  let spentForMeter = 0;
  try {
    spentForMeter = cents($("amount").value);
  } catch {}
  const used = Math.min(100, Math.round((spentForMeter / budget) * 100));
  $("budget-fill").style.width = `${used}%`;
  $("budget-fill").classList.toggle("over-budget", spentForMeter > budget);
  $("budget-progress").setAttribute("aria-valuenow", String(used));
  $("budget-progress").setAttribute(
    "aria-valuetext",
    `已输入消费 ${money(spentForMeter)} 元，每日额度 ${money(budget)} 元`,
  );
  try {
    const spent = cents($("amount").value);
    $("live-difference").textContent =
      spent <= budget
        ? `当日结余 ¥${money(budget - spent)}`
        : `当日超支 ¥${money(spent - budget)}，之后慢慢补齐`;
  } catch {
    $("live-difference").textContent = "输入金额，看看今天能留下多少。";
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
function renderWeek(today) {
  const monday = addDays(
    today,
    -((new Date(`${today}T12:00:00`).getDay() + 6) % 7),
  );
  const strip = $("week-strip");
  strip.replaceChildren();
  let count = 0;
  for (let i = 0; i < 7; i++) {
    const day = addDays(monday, i);
    const recorded = state.entries.some((entry) => entry.date === day);
    if (recorded) count++;
    const cell = document.createElement("button");
    cell.type = "button";
    cell.className = `week-day${recorded ? " recorded" : ""}${day === today ? " today" : ""}`;
    cell.disabled = day > today || day < state.start;
    cell.setAttribute("aria-label", `${day} ${recorded ? "已记录" : "未记录"}`);
    cell.setAttribute("aria-current", day === today ? "date" : "false");
    const label = document.createElement("span");
    label.textContent = ["一", "二", "三", "四", "五", "六", "日"][i];
    const status = document.createElement("strong");
    status.textContent = recorded ? "✓" : String(Number(day.slice(-2)));
    cell.append(label, status);
    cell.onclick = () => {
      selectDate(day);
      $("amount").focus();
    };
    strip.append(cell);
  }
  $("week-count").textContent = `${count} / 7 天`;
}
function render() {
  const c = calculate(state),
    today = dateKey();
  $("saved").textContent = money(c.saved);
  $("available").textContent = money(c.available);
  $("debt").textContent = `¥${money(c.debt)}`;
  $("transfer-count").textContent = state.transfers.length
    ? `${state.transfers.length} 笔转存，都是你的积累`
    : "期待你的第一笔积累";
  $("mode-label").textContent =
    state.mode === "daily" ? "每日结算" : "每周结算";
  $("record-count").textContent = `${c.days} 天记录`;
  $("debt-row").hidden = c.debt === 0;
  renderWeek(today);
  $("entry-date").min = state.start;
  $("entry-date").max = today;
  $("transfer-open").disabled =
    !state.configured || c.available === 0 || broken;
  $("settle-label").textContent =
    state.mode === "weekly" ? "已完成周的可转存金额" : "本次可转存";
  $("settle-note").textContent = c.missing
    ? c.missing === today
      ? `记下今天的消费，再算这一笔。${c.available > 0 ? "之前的结余现在也可以攒入。" : ""}`
      : `${c.missing} 还没记，补上后继续结算。${c.available > 0 ? "之前的结余可先攒入。" : ""}`
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
    const symbol = document.createElement("span");
    symbol.className = "empty-symbol";
    symbol.textContent = "01";
    const message = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = "从今天这一笔开始";
    const hint = document.createElement("p");
    hint.textContent = "记下消费，你的每一天会留在这里。";
    message.append(title, hint);
    empty.append(symbol, message);
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
$("backup-open").onclick = () => {
  openSettings();
  $("backup-section").hidden = false;
  $("backup-section").scrollIntoView({ block: "nearest" });
};
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
