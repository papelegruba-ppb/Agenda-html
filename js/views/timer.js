import { getAllTasks, getAllSessions, getAllPayments, addSession, updateSession, deleteSession, addPayment } from "../db.js";
import { CATEGORIES, getCategory } from "../categories.js";
import { getActiveTimer, startTimer, stopTimer, getElapsedMs, formatElapsed, onChange } from "../hours.js";
import { openSessionForm } from "../ui/session-form.js";
import { openPaymentForm } from "../ui/payment-form.js";

let currentCategory = "work-sye";
let unsub = null;

export async function renderTimer(root) {
  if (unsub) { unsub(); unsub = null; }

  const sessions = await getAllSessions();
  const payments = await getAllPayments();
  const timer = getActiveTimer();

  const cat = getCategory(currentCategory);
  const catSessions = sessions.filter(s => s.categoryId === currentCategory);
  const catPayments = payments.filter(p => p.categoryId === currentCategory);

  const totals = computeTotals(catSessions, catPayments);

  root.innerHTML = `
    <div class="hours-view">
      <div class="hours-head">
        <h2 class="hours-title">Horas</h2>
        <div class="hours-cat-picker">
  ${CATEGORIES.filter(c => ["work-sye", "work-jac", "extra-client"].includes(c.id)).map(c => `
    <button type="button" class="hours-cat-chip ${c.id === currentCategory ? "active" : ""}" data-cat="${c.id}">
      <span class="dot" style="background:${c.color}"></span>
      ${c.label}
    </button>
  `).join("")}
</div>
      </div>

      <div class="hours-summary">
        ${cat.billable ? `
          <div class="hours-card">
            <div class="hours-card-label">Pendiente de cobrar</div>
            <div class="hours-card-value highlight">${totals.pendingAmount.toFixed(2)} €</div>
            <div class="hours-card-sub">${totals.pendingHours.toFixed(1)} h</div>
          </div>
          <div class="hours-card">
            <div class="hours-card-label">Cobrado</div>
            <div class="hours-card-value">${totals.billedAmount.toFixed(2)} €</div>
            <div class="hours-card-sub">${totals.billedHours.toFixed(1)} h</div>
          </div>
        ` : `
          <div class="hours-card">
            <div class="hours-card-label">Este mes</div>
            <div class="hours-card-value">${totals.monthHours.toFixed(1)} h</div>
          </div>
          <div class="hours-card">
            <div class="hours-card-label">Este año</div>
            <div class="hours-card-value">${totals.yearHours.toFixed(1)} h</div>
          </div>
        `}
      </div>

      <div class="hours-timer" id="timerBox">
        <div class="hours-timer-display" id="timerDisplay">${timer ? formatElapsed(getElapsedMs()) : "00:00:00"}</div>
        <div class="hours-timer-hint" id="timerHint">
          ${timer
            ? (timer.taskTitle ? `En curso · ${escapeHtml(timer.taskTitle)}` : "En curso · sin tarea asignada")
            : "Cronómetro detenido"}
        </div>
        <div class="hours-timer-actions">
          ${timer
            ? `<button class="btn-stop" id="btnStop">Detener</button>`
            : `<button class="btn-primary" id="btnStart">Iniciar</button>`}
        </div>
      </div>

      <div class="hours-actions-row">
        <button class="btn-ghost" id="btnAddSession">+ Sesión</button>
        ${cat.billable ? `<button class="btn-ghost" id="btnAddPayment">+ Cobro</button>` : ""}
      </div>

      <div class="hours-history" id="hoursHistory">
        ${renderHistory(catSessions)}
      </div>
    </div>
  `;

  root.querySelectorAll(".hours-cat-chip").forEach(chip => {
    chip.onclick = () => {
      currentCategory = chip.dataset.cat;
      renderTimer(root);
    };
  });

  root.querySelector("#btnStart")?.addEventListener("click", () => {
    startTimer({ categoryId: currentCategory });
    renderTimer(root);
  });

  root.querySelector("#btnStop")?.addEventListener("click", async () => {
    const t = getActiveTimer();
    if (!t) return;
    stopTimer();
    openSessionForm({
      startedAt: t.startedAt,
      categoryId: t.categoryId || currentCategory,
      taskId: t.taskId,
      taskTitle: t.taskTitle
    }, () => renderTimer(root));
  });

  root.querySelector("#btnAddSession").onclick = () => {
    openSessionForm({ categoryId: currentCategory }, () => renderTimer(root));
  };

  root.querySelector("#btnAddPayment")?.addEventListener("click", () => {
    openPaymentForm({ categoryId: currentCategory }, () => renderTimer(root));
  });

  root.querySelectorAll(".session-item").forEach(li => {
    li.onclick = () => {
      const id = li.dataset.sessionId;
      const session = sessions.find(s => s.id === id);
      if (session) openSessionForm(session, () => renderTimer(root));
    };
  });

  unsub = onChange(() => {
    const disp = document.getElementById("timerDisplay");
    const hint = document.getElementById("timerHint");
    const t = getActiveTimer();
    if (disp) disp.textContent = t ? formatElapsed(getElapsedMs()) : "00:00:00";
    if (hint) hint.textContent = t
      ? (t.taskTitle ? `En curso · ${t.taskTitle}` : "En curso · sin tarea asignada")
      : "Cronómetro detenido";
  });
}

function computeTotals(sessions, payments) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  let pendingHours = 0, pendingAmount = 0;
  let billedHours = 0, billedAmount = 0;
  let monthHours = 0, yearHours = 0;

  for (const s of sessions) {
    const h = (s.durationMinutes || 0) / 60;
    const d = new Date(s.date + "T00:00:00");
    if (d.getFullYear() === year) {
      yearHours += h;
      if (d.getMonth() === month) monthHours += h;
    }
    if (s.billable) {
      if (s.billed) {
        billedHours += h;
        billedAmount += (s.amount || 0);
      } else {
        pendingHours += h;
        pendingAmount += (s.amount || 0);
      }
    }
  }

  const totalPaid = payments.reduce((a, p) => a + (p.amount || 0), 0);
  pendingAmount = Math.max(0, pendingAmount - totalPaid);

  return { pendingHours, pendingAmount, billedHours, billedAmount, monthHours, yearHours };
}

function renderHistory(sessions) {
  if (!sessions.length) {
    return `<p class="empty">Sin sesiones todavía.</p>`;
  }

  const byMonth = new Map();
  for (const s of sessions) {
    const key = s.date.slice(0, 7);
    if (!byMonth.has(key)) byMonth.set(key, []);
    byMonth.get(key).push(s);
  }

  const sortedKeys = [...byMonth.keys()].sort().reverse();

  return sortedKeys.map(key => {
    const list = byMonth.get(key).sort((a, b) => b.date.localeCompare(a.date));
    const monthName = new Date(key + "-01T00:00:00").toLocaleDateString("es-ES", { month: "long", year: "numeric" });
    const totalH = list.reduce((a, s) => a + (s.durationMinutes || 0) / 60, 0);
    const totalE = list.reduce((a, s) => a + (s.amount || 0), 0);

    return `
      <h3 class="hours-month-label">${cap(monthName)} · ${totalH.toFixed(1)} h${totalE ? " · " + totalE.toFixed(2) + " €" : ""}</h3>
      ${list.map(renderSession).join("")}
    `;
  }).join("");
}

function renderSession(s) {
  const cat = getCategory(s.categoryId);
  return `
    <div class="session-item ${s.billed ? "billed" : ""}" data-session-id="${s.id}"
         style="border-left-color:${cat.color}">
      <div class="time-col">
        <strong>${s.durationMinutes ? (s.durationMinutes / 60).toFixed(1) + " h" : "—"}</strong>
        ${s.startTime && s.endTime && s.startTime !== "00:00"
          ? `<span>${s.startTime} → ${s.endTime}</span>`
          : `<span>${s.date.slice(5)}</span>`}
      </div>
      <div class="body-col">
        <div class="session-desc">${escapeHtml(s.description || "(sin descripción)")}</div>
        ${s.taskTitle ? `<div class="session-meta">📌 ${escapeHtml(s.taskTitle)}</div>` : ""}
      </div>
      <div class="amount-col">
        ${s.amount ? s.amount.toFixed(2) + " €" : ""}
      </div>
    </div>
  `;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
