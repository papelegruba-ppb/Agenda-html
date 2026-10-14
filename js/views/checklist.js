import { getAllTasks, updateTask, deleteTask, convertTaskToHabit } from "../db.js";
import { getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";
import { butterflySvg } from "../ui/butterfly.js";


export async function renderChecklist(root) {
  const all = await getAllTasks();
  const items = all.filter(t => !t.calendarOnly && (t.isChecklist === true || (!t.date && t.type !== "medical" && !t.gcalEventId)));
  const pending = items.filter(t => !t.done);
  const done = items.filter(t => t.done);

  root.innerHTML = `
    <div class="checklist-view">
      <div class="checklist-head">
        <h2 class="view-title">Checklist</h2>
        <div class="checklist-actions"><button class="icon-action" id="selectChecklist" title="Seleccionar tareas" aria-label="Seleccionar tareas">☑</button><button class="icon-action" id="moveToHabits" title="Trasladar a Hábitos" aria-label="Trasladar tareas a Hábitos">⇢</button><button class="btn-primary" id="newChecklist">+ Nueva</button></div>
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

  let selectionMode = false;
  const selectButton = root.querySelector('#selectChecklist');
  const transferButton = root.querySelector('#moveToHabits');
  const refreshSelection = () => {
    root.querySelectorAll('.checklist-list .task-item').forEach(li => {
      let box = li.querySelector('.bulk-select');
      if (selectionMode && !box) { box=document.createElement('input'); box.type='checkbox'; box.className='bulk-select'; box.setAttribute('aria-label','Seleccionar tarea'); box.addEventListener('click', e => e.stopPropagation()); li.prepend(box); }
      if (!selectionMode && box) box.remove();
    });
    selectButton?.classList.toggle('active', selectionMode);
  };
  selectButton.onclick=()=>{selectionMode=!selectionMode;refreshSelection();};
  transferButton.onclick=async()=>{
    const selected=[...root.querySelectorAll('.bulk-select:checked')].map(el=>el.closest('[data-task-id]')).filter(Boolean).map(li=>items.find(t=>t.id===li.dataset.taskId)).filter(Boolean);
    let targets=selected;
    if(!selectionMode){const choice=confirm('¿Quieres trasladar TODAS las tareas pendientes a Hábitos? Pulsa Cancelar para elegir algunas.');if(choice) targets=pending;else{selectionMode=true;refreshSelection();alert('Marca las tareas que quieras trasladar y vuelve a pulsar la flecha.');return;}}
    if(!targets.length){alert('Selecciona al menos una tarea.');return;}
    if(!confirm(`¿Crear ${targets.length} hábito(s) a partir de las tareas seleccionadas? Las tareas originales se conservarán.`))return;
    try { for (const task of targets) await convertTaskToHabit(task.id); alert("Hábitos creados o vinculados. Las tareas originales siguen en Checklist y el estado del hábito es independiente."); renderChecklist(root); } catch (error) { alert("No se pudieron crear los hábitos: " + (error.message || error)); }
  };
  refreshSelection();

  /* Botón nueva tarea (sin fecha) */
  root.querySelector("#newChecklist").onclick = () => {
    openTaskForm(
      { date: "", type: "personal", title: "", notes: "", isChecklist: true },
      () => renderChecklist(root)
    );
  };

  /* Click en tarea → abrir formulario */
  root.querySelectorAll(".checklist-list .task-item").forEach(li => {
    const id = li.dataset.taskId;
    const task = items.find(t => t.id === id);
    if (!task) return;

    /* Check para marcar como hecha */
    li.querySelector(".task-check-round")?.addEventListener("click", async (e) => {
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
      openTaskForm({ ...task, isChecklist: true }, () => renderChecklist(root));
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
        <span class="category-mark type-${cat.id}" aria-hidden="true"></span>
        <button class="task-delete" aria-label="Borrar">✕</button>
      </div>
    </li>
  `;
}

function truncate(s, n) { return s.length > n ? s.slice(0, n).trim() + "…" : s; }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
