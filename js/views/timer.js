import {
  getAllSessions, getSessionsByCategory, addSession,
  updateSession, deleteSession, getAllPayments, addPayment, deletePayment,
  getAllTasks
} from "../db.js";
import { CATEGORIES, getCategory, DEFAULT_CATEGORY } from "../categories.js";
import { getActiveTimer, startTimer, stopTimer, getElapsedMs, formatElapsed } from "../hours.js";
import { openSessionForm } from "../ui/session-form.js";
import { openPaymentForm } from "../ui/payment-form.js";

let currentCategoryId = "work-sye";
let tickInterval = null;

export async function renderTimer(root) {
  const sessions = await getAllSessions();
  const payments = await getAllPayments();
  const tasks = await getAllTasks();

  const cat = getCategory(currentCategoryId);

  // Filtrar por categoría
  const catSessions = sessions.filter(s => s.categoryId === currentCategoryId);
  const catPayments = payments.filter(p => p.categoryId === currentCategoryId);

  // Calcular totales
  const stats = computeStats(catSessions, catPayments, cat);

  const activeTimer = getActiveTimer();
  const elapsed = activeTimer ? getElapsedMs() : 0;

  root.innerHTML = `
    <div class="hours-view">
      <div class="hours-head">
        <h2 class="hours-title">Horas</h2>
        <div class="hours-cat-picker">
          ${CATEGORIES.filter(c => c.id !== "medical" && c.id !== "vacation" && c.id !== "event").map(c => `
            <button type="button" class="hours-cat-chip ${c.id === currentCategoryId ? "active" : ""}" data-cat="${c.id}">
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
            <div class="hours-card-value highlight">${fmtMoney(stats.pendingAmount)}</div>
            <div class="hours-card-sub">${fmtHours(stats.pendingMinutes)} sin cobrar</div>
          </div>
          <div class="hours-card">
            <div class="hours-card-label">Cobrado este año</div>
            <div class="hours-card-value">${fmtMoney(stats.paidAmount)}</div>
            <div class="hours-card-sub">${fmtHours(stats.paidMinutes)} cobradas</div>
          </div>
        ` : `
          <div class="hours-card">
            <div class="hours-card-label">Este mes</div>
            <div class="hours-card-value">${fmtHours(stats.monthMinutes)}</div>
          </div>
          <div class="hours-card">
            <div class="hours-card-label">Este año</div>
            <div class="hours-card-value">${fmtHours(stats.yearMinutes)}</div>
          </div>
        `}
      </div>

      <div class="hours-timer">
        <div class="hours-timer-display" id="timerDisplay">${activeTimer ? formatElapsed(elapsed) : "00:00:00"}</div>
        <div class="hours-timer-hint" id="timerHint">
          ${activeTimer
            ? (activeTimer.taskTitle ? `En curso: ${escapeHtml(activeTimer.taskTitle)}` : "En curso · Sin asignar")
            : "Listo para empezar"}
        </div>
        <div class="hours-timer-actions">
          ${activeTimer
            ? `<button class="btn-stop" id="btnStop">Detener</button>`
            : `<button class="btn-primary" id="btnStart">Empezar</button>`}
        </div>
      </div>

      <div class="hours-timer-actions" style="justify-content:center;">
        <button class="btn-ghost" id="btnAddSession">+ Sesión manual</button>
        ${cat.billable ? `<button class="btn-ghost" id="btnAddPayment">+ Cobro</button>` : ""}
      </div>

      <div class="hours-history" id="hoursHistory">
        ${renderHistory(catSessions, tasks)}
      </div>
    </div>
  `;

  // Cambio de categoría
  root.querySelectorAll(".hours-cat-chip").forEach(chip => {
    chip.onclick = () => {
      currentCategoryId = chip.dataset.cat;
      renderTimer(root);
    };
  });

  // Iniciar / Detener cronómetro
  root.querySelector("#btnStart")?.addEventListener("click", () => {
    startTimer({ categoryId: currentCategoryId });
    renderTimer(root);
