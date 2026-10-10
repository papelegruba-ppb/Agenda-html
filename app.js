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
  // Marcar el botón activo (aria-current="page" en el que corresponde)
  buttons.forEach(b => {
    if (b.dataset.view === view) {
      b.setAttribute("aria-current", "page");
    } else {
      b.removeAttribute("aria-current");
    }
  });

  // Renderizar la vista
  root.innerHTML = "";
  if (views[view]) {
    await views[view](root);
  } else {
    root.innerHTML = `<h2 class="view-title">${view}</h2><p class="empty">Vista en construcción.</p>`;
  }
}

// Enganchar todos los botones con data-view
buttons.forEach(b => {
  b.addEventListener("click", () => navigate(b.dataset.view));
});

// Navegación desde otras vistas (por ejemplo, al pulsar un día del calendario)
document.addEventListener("navigate-day", e => {
  if (e.detail && e.detail.date) {
    setDayCursor(e.detail.date);
    navigate("day");
  }
});

// Arranque
(async () => {
  try {
    await initDB();
    await navigate("day");
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("sw.js").catch(() => {});
    }
  } catch (e) {
    console.error("Error al arrancar:", e);
    document.body.insertAdjacentHTML(
      "beforeend",
      `<pre style="position:fixed;bottom:0;left:0;right:0;background:#DC2127;color:#fff;padding:10px;font-size:12px;z-index:9999;white-space:pre-wrap;">ERROR: ${e.message || e}</pre>`
    );
  }
})();
