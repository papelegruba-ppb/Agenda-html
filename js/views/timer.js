import { getAllSessions, getAllPayments, getSetting, setSetting } from "../db.js";
import { CATEGORIES, getCategory } from "../categories.js";
import { getActiveTimer, startTimer, stopTimer, getElapsedMs, formatElapsed, onChange } from "../hours.js";
import { openSessionForm } from "../ui/session-form.js";
import { openPaymentForm } from "../ui/payment-form.js";

let currentCategory = "work-sye";
let unsub = null;
let cachedOpeningBalance = 0;

const OPENING_BALANCE_KEY = "papelegruba-hours-opening-balance-v1-work-sye";
const OPENING_BALANCE_TARGET = 121;
const OPENING_BALANCE_CUTOFF = "2026-10-14";
const DEFAULT_RATE = 10;

export async function renderTimer(root) {
  if (unsub) { unsub(); unsub = null; }
  const [sessions, payments] = await Promise.all([getAllSessions(), getAllPayments()]);
  await ensureOpeningBalance(sessions, payments);
  await refreshOpeningBalanceCache();

  const timer = getActiveTimer();
  const cat = getCategory(currentCategory);
  const catSessions = sessions.filter(s => s.categoryId === currentCategory);
  const catPayments = payments.filter(p => p.categoryId === currentCategory);
  const totals = computeTotals(catSessions, catPayments, currentCategory);

  root.innerHTML = `
    <div class="hours-view">
      <div class="hours-head">
        <h2 class="hours-title">Horas</h2>
        <div class="hours-cat-picker">
          ${CATEGORIES.filter(c => ["work-sye", "work-jac", "extra-client"].includes(c.id)).map(c => `
            <button type="button" class="hours-cat-chip ${c.id === currentCategory ? "active" : ""}" data-cat="${c.id}">
              <span class="dot" style="background:${c.color}"></span>${c.label}
            </button>`).join("")}
        </div>
      </div>
      <div class="hours-summary">
        ${cat.billable ? `
          <div class="hours-card">
            <div class="hours-card-label">Saldo actual</div>
            <div class="hours-card-value ${totals.balance >= 0 ? "hours-positive" : "hours-negative"}">${totals.balance >= 0 ? "+" : "−"}${Math.abs(totals.balance).toFixed(2)} €</div>
            <div class="hours-card-sub ${totals.balance >= 0 ? "hours-positive" : "hours-negative"}">${totals.balance >= 0 ? "+" : "−"}${(Math.abs(totals.balance) / totals.rate).toFixed(1)} h ${totals.balance >= 0 ? "a tu favor" : "que debes trabajar"}</div>
          </div>` : `
          <div class="hours-card"><div class="hours-card-label">Este mes</div><div class="hours-card-value">${totals.monthHours.toFixed(1)} h</div></div>
          <div class="hours-card"><div class="hours-card-label">Este año</div><div class="hours-card-value">${totals.yearHours.toFixed(1)} h</div></div>`}
      </div>
      ${cat.billable ? '<p class="hours-balance-help">Saldo positivo en verde: la empresa te debe. Saldo negativo en rojo: debes horas por anticipos. Los ajustes por servicios personales descuentan su importe del saldo.</p>' : ""}
      <div class="hours-timer" id="timerBox">
        <div class="hours-timer-display" id="timerDisplay">${timer ? formatElapsed(getElapsedMs()) : "00:00:00"}</div>
        <div class="hours-timer-hint" id="timerHint">${timer ? (timer.taskTitle ? `En curso · ${escapeHtml(timer.taskTitle)}` : "En curso · sin tarea asignada") : "Cronómetro detenido"}</div>
        <div class="hours-timer-actions">${timer ? '<button class="btn-stop" id="btnStop">Detener</button>' : '<button class="btn-primary" id="btnStart">Iniciar</button>'}</div>
      </div>
      <div class="hours-actions-row">
        <button class="btn-ghost" id="btnAddSession">+ Sesión</button>
        ${cat.billable ? '<button class="btn-ghost" id="btnAddPayment">+ Cobro</button>' : ""}
      </div>
      <div class="hours-history" id="hoursHistory">${renderHistory(catSessions)}</div>
    </div>`;

  root.querySelectorAll(".hours-cat-chip").forEach(chip => chip.onclick = () => { currentCategory = chip.dataset.cat; renderTimer(root); });
  root.querySelector("#btnStart")?.addEventListener("click", () => { startTimer({ categoryId: currentCategory }); renderTimer(root); });
  root.querySelector("#btnStop")?.addEventListener("click", () => {
    const t = getActiveTimer();
    if (!t) return;
    stopTimer();
    openSessionForm({ startedAt: t.startedAt, categoryId: t.categoryId || currentCategory, taskId: t.taskId, taskTitle: t.taskTitle }, () => renderTimer(root));
  });
  root.querySelector("#btnAddSession")?.addEventListener("click", () => openSessionForm({ categoryId: currentCategory }, () => renderTimer(root)));
  root.querySelector("#btnAddPayment")?.addEventListener("click", () => openPaymentForm({ categoryId: currentCategory }, () => renderTimer(root)));
  root.querySelectorAll(".session-item").forEach(li => {
    li.onclick = () => {
      const session = catSessions.find(s => s.id === li.dataset.sessionId);
      if (session) openSessionForm(session, () => renderTimer(root));
    };
  });
  unsub = onChange(() => {
    const disp = document.getElementById("timerDisplay");
    const hint = document.getElementById("timerHint");
    const t = getActiveTimer();
    if (disp) disp.textContent = t ? formatElapsed(getElapsedMs()) : "00:00:00";
    if (hint) hint.textContent = t ? (t.taskTitle ? `En curso · ${t.taskTitle}` : "En curso · sin tarea asignada") : "Cronómetro detenido";
  });
}

async function ensureOpeningBalance(sessions, payments) {
  const saved = await getSetting(OPENING_BALANCE_KEY);
  if (saved && saved.version === 1 && Number.isFinite(Number(saved.amount))) return;

  const historicalSessions = sessions.filter(s => s.categoryId === "work-sye" && s.date && s.date <= OPENING_BALANCE_CUTOFF);
  const historicalPayments = payments.filter(p => p.categoryId === "work-sye" && p.date && p.date <= OPENING_BALANCE_CUTOFF);
  const historicalNet = historicalSessions.reduce((sum, s) => {
    if (!s.billable && !s.adjustment) return sum;
    const amount = getSessionAmount(s);
    return sum + (s.adjustment ? -amount : (s.billable ? amount : 0));
  }, 0) - historicalPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  // Ajuste residual: al sumar los movimientos existentes, el saldo histórico
  // resultante será exactamente +121 €, sin duplicar los registros que ya haya.
  await setSetting(OPENING_BALANCE_KEY, {
    version: 1,
    amount: roundMoney(OPENING_BALANCE_TARGET - historicalNet),
    targetBalance: OPENING_BALANCE_TARGET,
    cutoff: OPENING_BALANCE_CUTOFF,
    createdAt: new Date().toISOString()
  });
}

async function refreshOpeningBalanceCache() {
  const saved = await getSetting(OPENING_BALANCE_KEY);
  cachedOpeningBalance = Number(saved?.amount || 0);
}

function computeTotals(sessions, payments, categoryId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  let monthHours = 0, yearHours = 0;
  for (const s of sessions) {
    const d = s.date ? new Date(s.date + "T00:00:00") : null;
    const h = Number(s.durationMinutes || 0) / 60;
    if (d && !Number.isNaN(d.getTime()) && d.getFullYear() === year) {
      yearHours += h;
      if (d.getMonth() === month) monthHours += h;
    }
  }

  const paidAmount = payments.reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0)), 0);
  const monthPaid = payments.filter(p => {
    const d = p.date ? new Date(p.date + "T00:00:00") : null;
    return d && !Number.isNaN(d.getTime()) && d.getFullYear() === year && d.getMonth() === month;
  }).reduce((sum, p) => sum + Math.max(0, Number(p.amount || 0)), 0);

  let balance = categoryId === "work-sye" ? cachedOpeningBalance : 0;
  let advanceAmount = 0;
  let rate = DEFAULT_RATE;

  // Los movimientos de sesión son lo trabajado y facturable. Un ajuste personal
  // compensa dinero que la empresa te debe, pero nunca es un cobro en efectivo.
  for (const s of sessions) {
    if (s.adjustment) {
      balance -= getSessionAmount(s);
    } else if (s.billable) {
      const amount = getSessionAmount(s);
      balance += amount;
      if (categoryId !== "work-sye" && Number(s.rate) > 0) rate = Number(s.rate);
    }
  }

  // Los cobros primero liquidan deuda de la empresa; solo el excedente es anticipo.
  // Así, un cobro nunca aparece simultáneamente como saldo pendiente y anticipo.
  const pendingAmount = Math.max(0, roundMoney(balance - paidAmount));
  advanceAmount = Math.max(0, roundMoney(paidAmount - balance));
  const netBalance = roundMoney(balance - paidAmount);

  return {
    balance: netBalance,
    pendingAmount,
    pendingHours: pendingAmount / rate,
    advanceAmount,
    advanceHours: advanceAmount / rate,
    rate,
    paidAmount: roundMoney(paidAmount),
    monthPaid: roundMoney(monthPaid),
    monthHours,
    yearHours
  };
}

function getSessionAmount(s) {
  const explicit = Number(s.amount);
  if (Number.isFinite(explicit) && explicit !== 0) return Math.abs(explicit);
  return Math.abs(Number(s.durationMinutes || 0) / 60 * Number(s.rate || DEFAULT_RATE));
}
function roundMoney(value) { return Math.round((Number(value) + Number.EPSILON) * 100) / 100; }

function renderHistory(sessions) {
  if (!sessions.length) return '<p class="empty">Sin sesiones todavía.</p>';
  const byMonth = new Map();
  for (const s of sessions) {
    const key = (s.date || "").slice(0, 7) || "sin-fecha";
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(s);
  }
  return [...byMonth.keys()].sort().reverse().map(key => {
    const list = byMonth.get(key).sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    const monthName = key === "sin-fecha" ? "Sin fecha" : new Date(key + "-01T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const totalH = list.reduce((a, s) => a + Number(s.durationMinutes || 0) / 60, 0);
    const totalE = list.reduce((a, s) => a + (s.adjustment ? -getSessionAmount(s) : (s.billable ? getSessionAmount(s) : 0)), 0);
    return `<h3 class="hours-month-label">${cap(monthName)} · ${totalH.toFixed(1)} h${totalE ? " · " + totalE.toFixed(2) + " €" : ""}</h3>${list.map(renderSession).join("")}`;
  }).join("");
}

function renderSession(s) {
  const cat = getCategory(s.categoryId);
  const amount = s.adjustment ? -getSessionAmount(s) : (s.billable ? getSessionAmount(s) : Number(s.amount || 0));
  return `<div class="session-item ${s.billed ? "billed" : ""} ${s.adjustment ? "adjustment" : ""}" data-session-id="${escapeAttr(s.id)}" style="border-left-color:${cat.color}">
    <div class="time-col"><strong>${s.durationMinutes ? (s.durationMinutes / 60).toFixed(1) + " h" : "—"}</strong>
      ${s.startTime && s.endTime && s.startTime !== "00:00" ? `<span>${escapeHtml(s.startTime)} → ${escapeHtml(s.endTime)}</span>` : `<span>${escapeHtml((s.date || "").slice(5))}</span>`}</div>
    <div class="body-col"><div class="session-desc">${escapeHtml(s.description || "(sin descripción)")}</div>
      ${s.adjustment ? '<div class="session-meta">Ajuste · compensa un servicio</div>' : ""}
      ${s.taskTitle ? `<div class="session-meta">📌 ${escapeHtml(s.taskTitle)}</div>` : ""}</div>
    <div class="amount-col ${amount < 0 ? "hours-negative" : (amount > 0 ? "hours-positive" : "")}">${amount ? (amount < 0 ? "−" : "+") + Math.abs(amount).toFixed(2) + " €" : ""}</div>
  </div>`;
}
function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
function escapeAttr(s) { return String(s || "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
