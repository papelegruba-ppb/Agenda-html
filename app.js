import { initDB } from "./js/db.js";
import { renderYear } from "./js/views/year.js";
import { renderMonth } from "./js/views/month.js";
import { renderWeek } from "./js/views/week.js";
import { renderDay, setDayCursor } from "./js/views/day.js";
import { renderChecklist } from "./js/views/checklist.js";
import { renderTimer } from "./js/views/timer.js";
import { renderProjects } from "./js/views/projects.js";
import { renderHabits } from "./js/views/habits.js";
import { renderSettings } from "./js/views/settings.js";
import { renderMedical } from "./js/views/medical.js";
import { getActiveTimer, getElapsedMs, formatElapsed, onChange } from "./js/hours.js";

const views = {
  year: renderYear,
  month: renderMonth,
  week: renderWeek,
  day: renderDay,
  checklist: renderChecklist,
  timer: renderTimer,
  projects: renderProjects,
  habits: renderHabits,
  settings: renderSettings,
  medical: renderMedical
};

const root = document.getElementById("view-root");
const buttons = document.querySelectorAll("[data-view]");

async function navigate(view) {
  buttons.forEach(b => {
    if (b.dataset.view === view) {
      b.setAttribute("aria-current", "page");
    } else {
      b.removeAttribute("aria-current");
    }
  });
  root.innerHTML = "";
  if (views[view]) {
    await views[view](root);
  } else {
    root.innerHTML = `<h2 class="view-title">${view}</h2><p class="empty">Vista en construcción.</p>`;
  }
  updateFloatingBadge();
}

buttons.forEach(b => {
  b.addEventListener("click", () => navigate(b.dataset.view));
});

document.addEventListener("navigate-day", e => {
  if (e.detail && e.detail.date) {
    setDayCursor(e.detail.date);
    navigate("day");
  }
});

/* ============ Indicador flotante del cronómetro ============ */
function ensureBadge() {
  let badge = document.getElementById("timerBadge");
  if (!badge) {
    badge = document.createElement("div");
    badge.id = "timerBadge";
    badge.className = "timer-badge";
    badge.style.display = "none";
    badge.innerHTML = `<span class="pulse"></span><span class="badge-time">00:00:00</span><span class="badge-title"></span>`;
    badge.onclick = () => navigate("timer");
    document.body.appendChild(badge);
  }
  return badge;
}

function updateFloatingBadge() {
  const badge = ensureBadge();
  const t = getActiveTimer();
  if (!t) {
    badge.style.display = "none";
    return;
  }
  badge.style.display = "flex";
  badge.querySelector(".badge-time").textContent = formatElapsed(getElapsedMs());
  badge.querySelector(".badge-title").textContent = t.taskTitle ? "· " + t.taskTitle : "";
}

onChange(updateFloatingBadge);

/* ============ Arranque ============ */
(async () => {
  try {
    await initDB();
    await navigate("day");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
    updateFloatingBadge();
  } catch (e) {
    console.error("Error al arrancar:", e);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<pre style="position:fixed;bottom:0;left:0;right:0;background:#DC2127;color:#fff;padding:10px;font-size:12px;z-index:9999;white-space:pre-wrap;">ERROR: ${e.message || e}</pre>`
    );
  }
})();
