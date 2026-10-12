import { startOfWeek, addDays, iso, isSameDay } from "../dates.js";
import { getTasksInRange, deleteTask } from "../db.js";
import { getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";
import { butterflySvg } from "../ui/butterfly.js";

let cursor = new Date();

export async function renderWeek(root) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fromStr = iso(days[0]);
  const toStr = iso(days[6]);
  const tasks = (await getTasksInRange(fromStr, toStr)).filter(t => t.isChecklist !== true);

  const byDate = new Map();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  const today = new Date();
  const monthName = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const endMonthName = days[6].toLocaleDateString("es-ES", { month: "long" });

  root.innerHTML = `
    <div class="week-view">
      <div class="week-head">
        <button class="nav-prev" aria-label="Semana anterior">‹</button>
        <h2 class="week-title">${start.getDate()} – ${days[6].getDate()} de ${monthName === endMonthName ? monthName : endMonthName + " " + days[6].getFullYear()}</h2>
        <button class="nav-next" aria-label="Semana siguiente">›</button>
      </div>
      <div class="week-days">
        ${days.map(d => {
          const key = iso(d);
          const list = byDate.get(key) || [];
          const isToday = isSameDay(d, today);
          const dayName = d.toLocaleDateString("es-ES", { weekday: "long" });
          return `
            <section class="week-day ${isToday ? "today" : ""}" data-date="${key}">
              <header class="week-day-head">
                <span class="week-day-name">${cap(dayName)}</span>
                <span class="week-day-num">${d.getDate()}</span>
              </header>
              <ul class="week-day-list">
                ${list.length ? list.map(renderWeekItem).join("") : `<li class="empty-small">Sin tareas</li>`}
              </ul>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;

  root.querySelector(".nav-prev").onclick = () => { cursor = addDays(cursor, -7); renderWeek(root); };
  root.querySelector(".nav-next").onclick = () => { cursor = addDays(cursor, 7); renderWeek(root); };

  // Click en cabecera de día → ir a vista Día
  root.querySelectorAll(".week-day-head").forEach(h => {
    h.onclick = () => {
      const section = h.closest(".week-day");
      document.dispatchEvent(new CustomEvent("navigate-day", { detail: { date: section.dataset.date } }));
    };
  });

  // Click en tarea → abrir formulario
  root.querySelectorAll(".week-day-list .task-item").forEach(li => {
    li.onclick = (e) => {
      if (e.target.closest(".task-delete")) return;
      e.stopPropagation();
      const id = li.dataset.taskId;
      const task = tasks.find(t => t.id === id);
      if (task) openTaskForm(task, () => renderWeek(root));
    };
    li.querySelector(".task-delete")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      const task = tasks.find(t => t.id === li.dataset.taskId);
      if (!task || !confirm('¿Eliminar solo este evento de Papelegruba? No se borrará de Google Calendar.')) return;
      await deleteTask(task.id);
      await renderWeek(root);
    });
  });
}

function renderWeekItem(t) {
  const cat = getCategory(t.type);
  const time = t.time ? t.time : "";
  const desc = t.notes ? truncate(t.notes, 40) : "";
  const sub = t.specialty || t.center || "";

  return `
    <li class="task-item ${t.done ? "done" : ""} type-${cat.id}" data-task-id="${t.id}">
      <span class="task-time">${time}</span>
      <div class="task-body">
        <div class="task-line">
          <span class="task-title">${escapeHtml(t.title)}</span>
        </div>
        ${sub ? `<small class="task-sub">${escapeHtml(sub)}</small>` : ""}
        ${desc ? `<small class="task-notes">${escapeHtml(desc)}</small>` : ""}
      </div>
      <span class="butterfly type-${cat.id}" aria-hidden="true">${butterflySvg()}</span>
      <button class="task-delete" type="button" aria-label="Eliminar este evento" title="Eliminar solo este evento">✕</button>
    </li>
  `;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + "…" : s; }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
