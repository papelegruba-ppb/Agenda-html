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
  year: renderYear, month: renderMonth, week: renderWeek, day: renderDay,
  checklist: renderChecklist, timer: renderTimer,
  projects: renderProjects, habits: renderHabits, settings: renderSettings,
  medical: renderMedical
};

const root = document.getElementById("view-root");
const buttons = document.querySelectorAll(".view-switch button");

async function navigate(view) {
  buttons.forEach(b => b.toggleAttribute("aria-current", b.dataset.view === view));
  root.innerHTML = "";
  await views[view](root);
}

buttons.forEach(b => b.addEventListener("click", () => navigate(b.dataset.view)));

document.addEventListener("navigate-day", e => {
  setDayCursor(e.detail.date);
  navigate("day");
});

(async () => {
  await initDB();
  navigate("day");
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js");
  }
})();
