import { getAllTasks, addTask, updateTask, deleteTask } from "../db.js";
import { getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";
import { butterflySvg } from "../ui/butterfly.js";

export async function renderChecklist(root) {
  const all = await getAllTasks();
  const items = all.filter(t => !t.date);
  const pending = items.filter(t => !t.done);
  const done = items.filter(t => t.done);

  root.innerHTML = `
    <div class="checklist-view">
      <div class="checklist-head">
        <h2 class="view-title">Checklist</h2>
        <button class="btn-primary" id="newChecklist">+ Nueva</button>
      </div>

      <ul class="checklist-list" id="pendingList">
        ${pending.length
          ? pending.map(renderItem).join("")
          : `<li class="empty">No hay tareas pendientes</li>`}
      </ul>

      ${done.length ? `
        <h3 class="section-title">Hechas</h3>
        <ul class="checklist-list past" id="doneList">
          ${done.map(renderItem).join("")}
        </ul>
      ` : ""}
    </div>
  `;

  /* Botón nueva tarea (sin fecha) */
  root.querySelector("#newChecklist").onclick = () => {
    openTaskForm(
      { date: null, type: "personal", title: "", notes: "" },
      () => renderChecklist(root)
    );
  };

  /* Click en tarea → abrir formulario */
  root.querySelectorAll(".checklist-list .task-item").forEach(li => {
    const id = li.dataset.taskId;
    const task = items.find(t => t.id === id);
    if (!task) return;

    /* Check para marcar como hecha */
    li.querySelector(".task-check")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      await updateTask(id, {
        done: !task.done,
        doneAt: !task.done ? new Date().toISOString() : null
      });
      renderChecklist(root);
    });

    /* Borrar */
    li.querySelector(".task-delete")?.addEventListener("click", async (e) => {
      e.stopPropagation();
      if (!confirm("¿Borrar esta tarea?")) return;
      await deleteTask(id);
      renderChecklist(root);
    });

    /* Abrir formulario */
    li.onclick = () => {
      openTaskForm(task, () => renderChecklist(root));
    };
  });
}

function renderItem(t) {
  const cat = getCategory(t.type);
  const sub = [t.specialty, t.doctor, t.center].filter(Boolean).join(" · ");

  return `
    <li class="task-item checklist-item ${t.done ? "done" : ""} type-${cat.id}" data-task-id="${t.id}">
      <button class="task-check-round" aria-label="Marcar como hecha"></button>
      <div class="task-body">
        <div class="task-line">
          <span class="task-title">${escapeHtml(t.title)}</span>
        </div>
        ${sub ? `<small class="task-sub">${escapeHtml(sub)}</small>` : ""}
        ${t.notes ? `<small class="task-notes">${escapeHtml(truncate(t.notes, 100))}</small>` : ""}
      </div>
      <div class="task-icon">
        <span class="butterfly type-${cat.id}" aria-hidden="true">${butterflySvg()}</span>
        <button class="task-delete" aria-label="Borrar">✕</button>
      </div>
    </li>
  `;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + "…" : s; }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
