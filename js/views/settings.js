import {
  getAllTasks, getAllHabits, getAllProjects, getAllNotes, getAllSessions,
  getAllPayments, getAllSettings, getAllHealthEpisodes, getAllMedicationIntakes,
  mergeBackupData, getTrash, restoreTrashItem, permanentlyDeleteTrashItem
} from "../db.js";
import { getActiveTimer } from "../hours.js";

export async function renderSettings(root) {
  const count = (await getAllTasks()).length;

  root.innerHTML = `
    <div class="settings-view">
      <h2 class="view-title">Ajustes</h2>

      <section class="settings-block">
        <h3>Copia de seguridad local</h3>
        <p class="hint">
          Descarga un archivo JSON con todos tus datos (tareas, hábitos, proyectos, notas, salud, papelera...).
          <strong>Nota:</strong> La sincronización entre dispositivos ahora es automática e instantánea gracias a Firebase, por lo que ya no necesitas conectar Google Drive.
        </p>
        <p class="hint small">Tienes <span id="taskCount">${count}</span> tareas guardadas en este dispositivo.</p>
        
        <div class="gcal-actions">
          <button class="btn-ghost" id="btnExport">Descargar backup en este dispositivo</button>
          <button class="btn-ghost" id="btnImport">Restaurar archivo local</button>
        </div>
        <p class="hint small" id="localMsg"></p>
      </section>

      <section class="settings-block">
        <h3>Papelera · últimos 7 días</h3>
        <p class="hint">Los registros eliminados se conservan durante 7 días y después se eliminan definitivamente. Puedes recuperarlos antes de que caduquen.</p>
        <div class="gcal-actions"><button class="btn-ghost" id="btnShowTrash">Ver eliminados recientes</button></div>
        <div id="trashReview"></div>
      </section>

      <section class="settings-block">
        <h3>Acerca de</h3>
        <p class="hint">Papelegruba · v0.3 (Firebase Edition)</p>
      </section>
    </div>
  `;

  const localMsg = root.querySelector("#localMsg");

  /* Papelera */
  root.querySelector("#btnShowTrash")?.addEventListener("click", refreshTrash);
  async function refreshTrash() {
    const panel = root.querySelector("#trashReview");
    if (!panel) return;
    panel.textContent = "Cargando papelera…";
    try {
      const items = await getTrash();
      if (!items.length) {
        panel.innerHTML = '<p class="hint small">La papelera está vacía.</p>';
        return;
      }
      panel.innerHTML = items.map(item => {
        const title = item.record?.title || item.record?.name || item.record?.medication || item.record?.description || item.collection;
        const expires = item.expiresAt ? new Date(item.expiresAt).toLocaleString("es-ES") : "en 7 días";
        return `<article class="duplicate-item" data-trash-id="${escapeAttr(item.id)}" style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--c-border)">
          <div><strong>${escapeHtml(title)}</strong><small style="display:block">${escapeHtml(item.collection)} · caduca: ${escapeHtml(expires)}</small></div>
          <div class="gcal-actions"><button class="btn-ghost trash-restore">Recuperar</button><button class="btn-ghost trash-delete">Eliminar definitivamente</button></div>
        </article>`;
      }).join("");
      panel.querySelectorAll(".trash-restore").forEach(button => button.addEventListener("click", async () => {
        const item = button.closest("[data-trash-id]");
        try {
          const ok = await restoreTrashItem(item.dataset.trashId);
          if (!ok) alert("Ese registro ya ha caducado y no se puede recuperar.");
          await refreshTrash();
        } catch (error) { alert("No se pudo recuperar: " + (error.message || error)); }
      }));
      panel.querySelectorAll(".trash-delete").forEach(button => button.addEventListener("click", async () => {
        const item = button.closest("[data-trash-id]");
        if (!confirm("¿Eliminar definitivamente este registro? No se podrá recuperar.")) return;
        await permanentlyDeleteTrashItem(item.dataset.trashId);
        await refreshTrash();
      }));
    } catch (error) { panel.textContent = "No se pudo abrir la papelera: " + (error.message || error); }
  }

  /* Exportar JSON */
  root.querySelector("#btnExport").onclick = async () => {
    const [tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes, trash] = await Promise.all([
      getAllTasks(), getAllHabits(), getAllProjects(), getAllNotes(), getAllSessions(),
      getAllPayments(), getAllSettings(), getAllHealthEpisodes(), getAllMedicationIntakes(), getTrash()
    ]);
    const payload = {
      format: "papelegruba-backup",
      version: 4,
      exportedAt: new Date().toISOString(),
      activeTimer: getActiveTimer(),
      tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes, trash
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `papelegruba-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* Importar JSON */
  root.querySelector("#btnImport").onclick = () => {
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json";

    inp.onchange = async () => {
      const file = inp.files[0];
      if (!file) return;

      localMsg.textContent = "Leyendo archivo…";

      let data;
      try {
        const text = await file.text();
        data = JSON.parse(text);
      } catch (e) {
        localMsg.textContent = "❌ JSON inválido: " + (e.message || e);
        return;
      }

      const collections = ["tasks", "habits", "projects", "notes", "sessions", "payments", "settings", "healthEpisodes", "medicationIntakes", "trash"];
      const total = collections.reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0);
      if (!total) {
        localMsg.textContent = "⚠️ El archivo no contiene datos reconocibles.";
        return;
      }
      if (!confirm(`Se combinarán ${total} registros del respaldo con los datos de este dispositivo. Los registros con el mismo ID/clave se actualizarán; los demás se conservarán. No se borrarán datos. ¿Continuar?`)) {
        localMsg.textContent = "";
        return;
      }
      try {
        const result = await mergeBackupData(data);
        restoreTimerFromBackup(data);
        localMsg.textContent = `✅ Restauración completada: ${result.imported} registros nuevos añadidos; ${result.skippedExisting} ya existentes o duplicados omitidos. Los registros locales existentes se han conservado.`;
      } catch (e) {
        localMsg.textContent = "❌ Error restaurando el respaldo: " + (e.message || e);
        return;
      }
      setTimeout(() => renderSettings(root), 1500);
    };

    inp.click();
  };
}

function restoreTimerFromBackup(data) {
  if (!Object.prototype.hasOwnProperty.call(data || {}, "activeTimer")) return;
  const timer = data.activeTimer;
  localStorage.setItem("papelegruba-timer-active", timer && typeof timer === "object" && timer.startedAt ? JSON.stringify(timer) : "null");
  window.dispatchEvent(new CustomEvent("papelegruba:timer-sync"));
}

function escapeAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
