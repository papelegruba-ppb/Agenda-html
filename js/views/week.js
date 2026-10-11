import { startOfWeek, addDays, iso, isSameDay } from "../dates.js";
import { getTasksInRange } from "../db.js";
import { getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";

let cursor = new Date();

const BUTTERFLY_SVG = `
  <svg viewBox="0 0 24 24" width="100%" height="100%" aria-hidden="true">
    <path d="M12 6 C9 2 3 2 2 7 C1 12 6 14 10 13 C7 15 4 19 8 21 C11 22 12 18 12 15 C12 18 13 22 16 21 C20 19 17 15 14 13 C18 14 23 12 22 7 C21 2 15 2 12 6 Z" fill="currentColor"/>
    <line x1="12" y1="6" x2="12" y2="15" stroke="var(--c-ink)" stroke-width="1"/>
  </svg>
`;

export async function renderWeek(root) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fromStr = iso(days[0]);
  const toStr = iso(days[6]);
  const tasks = await getTasksInRange(fromStr, toStr);

  const byDate = new Map();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => {
      if (!a.time && b.time) return 1;
      if (a.time && !b.time) return -1;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }

  const today = new Date();
  const monthName = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  root.innerHTML = `
    <div class="week-view">
      <div class="week-head">
        <button class="nav-prev" aria-label="Semana anterior">‹</button>
        <h2 class="week-title">Semana del ${start.getDate()} de ${monthName}</h2>
        <button class="nav-next" aria-label="Semana siguiente">›</button>
      </div>
      <div class="week-days">
        ${days.map(d => {
          const key = iso(d);
          const list = byDate.get(key) || [];
          const isToday = isSameDay(d, today);
          return `
            <section class="week-day ${isToday ? "today" : ""}" data-date="${key}">
              <header class="week-day-head">
                <span class="week-day-name">${d.toLocaleDateString("es-ES",{weekday:"long"})}</span>
                <span class="week-day-num">${d.getDate()}</span>
                <button class="week-day-add" data-date="${key}" aria-label="Añadir tarea">+</button>
              </header>
              <ul class="week-day-list">
                ${list.length ? list.map(t => renderItem(t)).join("") : `<li class="empty-week">Sin tareas</li>`}
              </ul>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;

  /* Navegación */
  root.querySelector(".nav-prev").onclick = () => { cursor = addDays(cursor, -7); renderWeek(root); };
  root.querySelector(".nav-next").onclick = () => { cursor = addDays(cursor, 7); renderWeek(root); };

  /* Abrir tarea al pulsar */
  root.querySelectorAll(".wi").forEach(li => {
    li.onclick = () => {
      const task = tasks.find(t => t.id === li.dataset.taskId);
      if (task) openTaskForm(task, () => renderWeek(root));
    };
  });

  /* Crear tarea desde el "+" del día */
  root.querySelectorAll(".week-day-add").forEach(btn => {
    btn.onclick = (e) => {
      e.stopPropagation();
      openTaskForm({ date: btn.dataset.date }, () => renderWeek(root));
    };
  });

  /* Navegar al Día desde el nombre del día */
  root.querySelectorAll(".week-day-head").forEach(head => {
    head.querySelector(".week-day-name").onclick = () => {
      const date = head.closest(".week-day").dataset.date;
      document.dispatchEvent(new CustomEvent("navigate-day", { detail: { date } }));
    };
  });
}

function renderItem(t) {
  const cat = getCategory(t.type);
  const time = t.time ? `${t.time}${t.endTime ? "–" + t.endTime : ""}` : "";
  const sub = [t.specialty, t.center].filter(Boolean).join(" · ");

  return `
    <li class="wi type-${cat.id} ${t.done ? "done" : ""}" data-task-id="${t.id}">
      <span class="wi-butterfly type-${cat.id}">${BUTTERFLY_SVG}</span>
      <div class="wi-content">
        ${time ? `<time>${time}</time>` : ""}
        <span class="wi-title">${escapeHtml(t.title)}</span>
        ${sub ? `<small>${escapeHtml(sub)}</small>` : ""}
      </div>
    </li>
  `;
}

function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
