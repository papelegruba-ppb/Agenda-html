import { getAllTasks } from "../db.js";

export async function renderSettings(root) {
  const count = (await getAllTasks()).length;

  root.innerHTML = `
    <div class="settings-view">
      <h2 class="view-title">Ajustes</h2>

      <section class="settings-block">
        <h3>Datos locales</h3>
        <p class="hint">Tienes ${count} tareas guardadas en este dispositivo.</p>
        <div class="gcal-actions">
          <button class="btn-ghost" id="export">Exportar JSON</button>
          <button class="btn-ghost" id="import">Importar JSON</button>
        </div>
      </section>

      <section class="settings-block">
        <h3>Google Calendar</h3>
        <p class="hint">La conexión con Google Calendar llegará en la próxima versión.</p>
        <div class="gcal-status">Próximamente</div>
      </section>

      <section class="settings-block">
        <h3>Acerca de</h3>
        <p class="hint">Papelegruba · v0.1</p>
      </section>
    </div>
  `;

  root.querySelector("#export").onclick = async () => {
    const tasks = await getAllTasks();
    const blob = new Blob([JSON.stringify({ version: 1, tasks }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "papelegruba.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  root.querySelector("#import").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";
    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;
      const data = JSON.parse(await file.text());
      if (!confirm(`¿Importar ${data.tasks?.length || 0} tareas?`)) return;
      const { addTask } = await import("../db.js");
      for (const t of (data.tasks || [])) {
        await addTask({ ...t, id: undefined });
      }
      alert("Importado.");
      renderSettings(root);
    };
    inp.click();
  };
}
