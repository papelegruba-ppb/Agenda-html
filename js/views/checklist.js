import { getAllTasks, updateTask } from "../db.js";
import { getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";

export async function renderChecklist(root) {
  const all = await getAllTasks();
  const pending = all.filter(t => !t.date && !t.done);
  const done = all.filter(t => !t.date && t.done);

  root.innerHTML = `
    <div class="checklist-view">
      <div class="checklist-head">
        <h2 class="view-title">Checklist</h2>
        <button class="btn-primary" id="newTask">+ Nueva</button>
      </div>

      <h3 class="section-title">Pendientes</h3>
      <ul class="checklist-list">
        ${pending.length ? pending.map(renderItem).join("") : `<li class="empty">Sin tareas pendientes</li>`}
      </ul>

      ${done.length ? `
        <h3 class="section-title">Hechas</h3>
        <ul class="checklist-list past">
          ${done.map(renderItem).join("")}
        </ul>
      ` : ""}
    </div>
  `;

  root.querySelector("#newTask").onclick = () => {
    openTaskForm({ date: null, type: "personal" }, () => renderChecklist(root));
  };

  root.querySelectorAll(".checklist-list .task-item").forEach(li => {
    const id = li.dataset.taskId;

    li.querySelector(".task-check").onclick = async (e) => {
      e.stopPropagation();
      const done = li.classList.toggle("done");
      await updateTask(id, { done });
    };

    li.onclick = () => {
      const task = all.find(t => t.id === id);
      openTaskForm(task, () => renderChecklist(root));
    };
  });
}

function renderItem(t) {
  const cat = getCategory(t.type);
  return `
    <li class="task-item ${t.done ? "done" : ""} type-${cat.id}" data-task-id="${t.id}">
      <button class="task-check" aria-label="Marcar"></button>
      <div class="task-body">
        <div class="task-line">
          <span class="task-title">${escapeHtml(t.title)}</span>
        </div>
        ${t.notes ? `<small class="task-notes">${escapeHtml(truncate(t.notes, 60))}</small>` : ""}
      </div>
      <span class="butterfly type-${cat.id}" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path class="wing" d="M12 6 C9 2 3 2 2 7 C1 12 6 14 10 13 C7 15 4 19 8 21 C11 22 12 18 12 15 C12 18 13 22 16 21 C20 19 17 15 14 13 C18 14 23 12 22 7 C21 2 15 2 12 6 Z"/>
        </svg>
      </span>
    </li>
  `;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + "…" : s; }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
