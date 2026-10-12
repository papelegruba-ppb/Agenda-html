import { getAllProjects, getAllTasks, addProject, initDB } from "../db.js";
import { openProjectForm } from "../ui/project-form.js";
import { openTaskForm } from "../ui/task-form.js";

export async function renderProjects(root) {
  let showArchived = false;
  await draw();

  async function draw() {
    const [allProjects, tasks] = await Promise.all([getAllProjects(), getAllTasks()]);
    const projects = allProjects.filter(p => showArchived ? p.archived : !p.archived);
    projects.sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
    root.innerHTML = `
      <section class="projects-view">
        <header class="projects-head">
          <h2 class="view-title">Proyectos</h2>
          <button class="btn-primary" id="newProject">+ Nuevo proyecto</button>
        </header>
        <p class="hint">Organiza las tareas de tus proyectos y consulta su progreso. Puedes asignar un proyecto al crear o editar una tarea.</p>
        <div class="projects-toolbar">
          <span>${allProjects.filter(p => !p.archived).length} activos · ${allProjects.filter(p => p.archived).length} archivados</span>
          <button class="btn-ghost" id="toggleArchived">${showArchived ? "Ver activos" : "Ver archivados"}</button>
        </div>
        <div class="projects-list">
          ${projects.length ? projects.map(p => {
            const linked = tasks.filter(t => t.projectId === p.id);
            const done = linked.filter(t => t.done).length;
            const progress = linked.length ? Math.round(done / linked.length * 100) : 0;
            return `
              <article class="project-card" data-project-id="${esc(p.id)}">
                <div class="project-card-head">
                  <span class="project-color" style="background:${safeColor(p.color)}"></span>
                  <div class="project-card-title"><h3>${esc(p.name || "Proyecto sin nombre")}</h3><small>${linked.length} tareas · ${done} completadas</small></div>
                  <button class="icon-action project-edit" title="Cambiar nombre" aria-label="Cambiar nombre">✎</button>
                </div>
                <div class="project-progress" aria-label="Progreso del proyecto"><span style="width:${progress}%;background:${safeColor(p.color)}"></span></div>
                <div class="project-tasks">
                  ${linked.length ? linked.slice().sort((a,b) => (a.date || "").localeCompare(b.date || "")).slice(0,5).map(t => `
                    <div class="project-task ${t.done ? "done" : ""}">
                      <span>${t.done ? "✓" : "○"}</span>
                      <span>${esc(t.title || "Sin título")}</span>
                      <small>${t.date ? esc(t.date) : (t.isChecklist ? "Checklist" : "Sin fecha")}</small>
                    </div>`).join("") : '<p class="hint small">Todavía no hay tareas asignadas a este proyecto.</p>'}
                  ${linked.length > 5 ? `<p class="hint small">Y ${linked.length - 5} tareas más…</p>` : ""}
                </div>
                <div class="project-actions">
                  <button class="btn-ghost project-add-task">+ Añadir tarea</button>
                  <button class="btn-ghost project-archive">${p.archived ? "Desarchivar" : "Archivar"}</button>
                </div>
              </article>`;
          }).join("") : `<div class="empty">${showArchived ? "No hay proyectos archivados." : "Todavía no tienes proyectos. Crea uno para agrupar sus tareas."}</div>`}
        </div>
      </section>`;

    root.querySelector("#newProject").onclick = () => openProjectForm(draw);
    root.querySelector("#toggleArchived").onclick = () => { showArchived = !showArchived; draw(); };
    root.querySelectorAll(".project-card").forEach(card => {
      const p = projects.find(x => x.id === card.dataset.projectId);
      if (!p) return;
      card.querySelector(".project-edit").onclick = async () => {
        const name = prompt("Nombre del proyecto:", p.name || "");
        if (name === null) return;
        if (!name.trim()) { alert("El nombre no puede estar vacío."); return; }
        await updateProject(p.id, { name: name.trim() });
        await draw();
      };
      card.querySelector(".project-add-task").onclick = () => openTaskForm({ projectId: p.id }, draw);
      card.querySelector(".project-archive").onclick = async () => {
        await updateProject(p.id, { archived: !p.archived });
        await draw();
      };
    });
  }
}

async function updateProject(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    const store = tx.objectStore("projects");
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error("No se encuentra el proyecto.")); return; }
      store.put({ ...req.result, ...patch, updatedAt: new Date().toISOString() });
    };
    req.onerror = () => reject(req.error);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
}
function safeColor(value) {
  return /^#[0-9a-f]{6}$/i.test(value || "") ? value : "#C9A7E8";
}
