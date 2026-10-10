import { iso, isSameDay, addDays } from "../dates.js";
import { getTasksByDate, updateTask, deleteTask } from "../db.js";
import { openTaskForm } from "../ui/task-form.js";
import { getCategory } from "../categories.js";

let cursor = new Date();

export function setDayCursor(date) {
  cursor = typeof date === "string" ? new Date(date + "T00:00:00") : new Date(date);
}

export async function renderDay(root) {
  const dateStr = iso(cursor);
  const tasks = await getTasksByDate(dateStr);
  tasks.sort((a, b) => {
    if (!a.time && b.time) return 1;
    if (a.time && !b.time) return -1;
    return (a.time || "").localeCompare(b.time || "");
  });

  const now = new Date();
  const isToday = isSameDay(cursor, now);

  const dayName = cursor.toLocaleDateString("es-ES", { weekday: "long" });
  const monthName = cursor.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  root.innerHTML = `
    <div class="day-view">
      <div class="day-head">
        <button class="nav-prev" aria-label="Día anterior">‹</button>
        <div class="day-titles">
          <h2 class="day-name">${cap(dayName)}${isToday ? " · Hoy" : ""}</h2>
          <span class="day-date">${cursor.getDate()} de ${monthName}</span>
        </div>
        <button class="nav-next" aria-label="Día siguiente">›</button>
      </div>

      <ul class="day-list">
        ${tasks.length ? tasks.map(renderTaskItem).join("")
                       : `<li class="empty">Sin tareas para este día</li>`}
      </ul>

      <button class="fab" aria-label="Nueva tarea">+</button>
    </div>
  `;

  root.querySelector(".nav-prev").onclick = () => { cursor = addDays(cursor, -1); renderDay(root); };
  root.querySelector(".nav-next").onclick = () => { cursor = addDays(cursor, 1); renderDay(root); };
  root.querySelector(".fab").onclick = () => {
    openTaskForm({ date: dateStr }, () => renderDay(root));
  };

  root.querySelectorAll(".task-item").forEach(li => {
    const id = li.dataset.taskId;

    li.querySelector(".task-check").onclick = async (e) => {
      e.stopPropagation();
      const done = li.classList.toggle("done");
      await updateTask(id, { done, doneAt: done ? new Date().toISOString() : null });
    };

    li.onclick = async () => {
      const task = tasks.find(t => t.id === id);
      openTaskForm(task, () => renderDay(root));
    };

    li.querySelector(".task-delete")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Borrar esta tarea?")) return;
      await deleteTask(id);
      renderDay(root);
    });
  });
}

function renderTaskItem(t) {
  const cat = getCategory(t.type);
  const time = t.time ? `${t.time}${t.endTime ? "–" + t.endTime : ""}` : "";
  const subtitle = [t.specialty, t.doctor, t.center].filter(Boolean).join(" · ");

  return `
    <li class="task-item ${t.done ? "done" : ""} type-${cat.id}" data-task-id="${t.id}">
      <button class="task-check" aria-label="Marcar"></button>
      <div class="task-body">
        <div class="task-line">
          ${time ? `<time>${time}</time>` : ""}
          <span class="task-title">${escapeHtml(t.title)}</span>
        </div>
        ${subtitle ? `<small class="task-sub">${escapeHtml(subtitle)}</small>` : ""}
        ${t.notes ? `<small class="task-notes">${escapeHtml(t.notes)}</small>` : ""}
      </div>
      <span class="butterfly type-${cat.id}" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16">
          <path class="wing" d="M12 4 C10 8 6 8 4 10 C2 12 2 16 5 17 C8 18 11 15 12 12 C13 15 16 18 19 17 C22 16 22 12 20 10 C18 8 14 8 12 4 Z"/>
        </svg>
      </span>
      <button class="task-delete" aria-label="Borrar">✕</button>
    </li>
  `;
}

function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
