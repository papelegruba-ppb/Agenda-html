import { getAllTasks, getAllProjects, getAllSessions, getAllPayments, getAllHabits, getAllNotes, getAllSettings, mergeBackupData, getSetting, setSetting, getAllHealthEpisodes, getAllMedicationIntakes } from "../db.js";
import { GOOGLE_CLIENT_ID } from "../../config.js";
import {
  initGoogle,
  requestToken,
  isConnected,
  disconnect,
  getStoredEmail,
  fetchUserEmail,
  importAllEvents,
  gcalEventToTask
} from "../google.js";

export async function renderSettings(root) {
  const clientId = (await getSetting("googleClientId")) || GOOGLE_CLIENT_ID;
  const connected = isConnected();
  const email = (await getStoredEmail()) || null;
  const count = (await getAllTasks()).length;
  const lastSync = (await getSetting("lastSync")) || null;

  root.innerHTML = `
    <div class="settings-view">
      <h2 class="view-title">Ajustes</h2>

      <section class="settings-block">
        <h3>Google Calendar</h3>
        <p class="hint">
          Conecta tu cuenta para sincronizar tareas y citas entre dispositivos.
          Los datos se guardan en tu calendario principal de Google.
        </p>

        <div class="gcal-status ${connected ? "ok" : ""}">
          ${connected
            ? `✅ Conectado${email ? " como " + escapeHtml(email) : ""}`
            : "Sin conectar"}
        </div>

        <div class="gcal-actions">
          ${connected
            ? `
              <button class="btn-primary" id="btnImportGCAL">Importar desde Google Calendar</button>
              <button class="btn-ghost" id="btnDisconnect">Desconectar</button>
            `
            : `<button class="btn-primary" id="btnConnect">Conectar con Google</button>`}
        </div>

        <p class="hint small" id="gcalMsg"></p>
        ${lastSync ? `<p class="hint small">Última sincronización: ${escapeHtml(lastSync)}</p>` : ""}
      </section>

      <section class="settings-block">
        <h3>Datos locales</h3>
        <p class="hint">Tienes <span id="taskCount">${count}</span> tareas guardadas en este dispositivo.</p>
        <div class="gcal-actions">
          <button class="btn-ghost" id="btnExport">Exportar JSON</button>
          <button class="btn-ghost" id="btnImport">Importar JSON</button>
        </div>
        <p class="hint small" id="localMsg"></p>
      </section>

      <section class="settings-block">
        <h3>Avanzado</h3>
        <label class="fld-label">Client ID de Google
          <input id="clientId" type="text" value="${escapeAttr(clientId)}">
        </label>
        <button class="btn-ghost" id="saveClientId">Guardar Client ID</button>
      </section>

      <section class="settings-block">
        <h3>Acerca de</h3>
        <p class="hint">Papelegruba · v0.2</p>
      </section>
    </div>
  `;

  const msg = root.querySelector("#gcalMsg");
  const localMsg = root.querySelector("#localMsg");

  /* Conectar */
  root.querySelector("#btnConnect")?.addEventListener("click", async () => {
    try {
      await initGoogle();
      await requestToken();
      try { await fetchUserEmail(); } catch (e) {}
      renderSettings(root);
    } catch (e) {
      alert("Error al conectar:\n\n" + (e.message || e));
    }
  });

  /* Desconectar */
  root.querySelector("#btnDisconnect")?.addEventListener("click", async () => {
    if (!confirm("¿Desconectar de Google Calendar?")) return;
    disconnect();
    renderSettings(root);
  });

  /* Importar desde Google Calendar */
  root.querySelector("#btnImportGCAL")?.addEventListener("click", async () => {
    if (!confirm(
      "Se van a importar TODOS los eventos de tu calendario de Google desde 2025 hasta hoy.\n\n" +
      "Los eventos se convertirán en tareas de Papelegruba y se guardarán en este dispositivo.\n\n" +
      "Si ya has importado antes, se crearán duplicados.\n\n" +
      "¿Continuar?"
    )) return;

    msg.textContent = "Descargando eventos de Google…";
    try {
      const events = await importAllEvents({
        from: "2025-01-01T00:00:00Z",
        onProgress: (n, page) => {
          msg.textContent = `Descargados ${n} eventos (página ${page})…`;
        }
      });

      msg.textContent = `Descargados ${events.length}. Guardando en Papelegruba…`;

      const { addTask } = await import("../db.js");
      let saved = 0;
      for (const ev of events) {
        const t = gcalEventToTask(ev);
        if (!t.date) continue;
        await addTask(t);
        saved++;
      }

      await setSetting("lastSync", new Date().toLocaleString("es-ES"));
      msg.textContent = `✅ Importados ${saved} eventos. Ábrelos en Día, Semana o Mes.`;

      setTimeout(() => renderSettings(root), 1500);
    } catch (e) {
      msg.textContent = "❌ Error: " + (e.message || e);
    }
  });

  /* Guardar Client ID */
  root.querySelector("#saveClientId").addEventListener("click", async () => {
    const v = root.querySelector("#clientId").value.trim();
    if (!v) { alert("Pega un Client ID válido"); return; }
    await setSetting("googleClientId", v);
    alert("Client ID guardado. Recarga la app para aplicarlo.");
  });

  /* Exportar JSON */
  root.querySelector("#btnExport").onclick = async () => {
    const [tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes] = await Promise.all([getAllTasks(), getAllHabits(), getAllProjects(), getAllNotes(), getAllSessions(), getAllPayments(), getAllSettings(), getAllHealthEpisodes(), getAllMedicationIntakes()]);
    const payload = {
      format: "papelegruba-backup",
      version: 3,
      exportedAt: new Date().toISOString(),
      tasks, habits, projects, notes, sessions, payments, settings
    };
    const blob = new Blob(
      [JSON.stringify(payload, null, 2)],
      { type: "application/json" }
    );
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

      const collections = ["tasks", "habits", "projects", "notes", "sessions", "payments", "settings", "healthEpisodes", "medicationIntakes"];
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
        const count = await mergeBackupData(data);
        localMsg.textContent = `✅ Restauración completada: ${count} registros procesados. Los datos existentes no se han borrado.`;
      } catch (e) {
        localMsg.textContent = "❌ Error restaurando el respaldo: " + (e.message || e);
        return;
      }
      setTimeout(() => renderSettings(root), 1500);
    };

    inp.click();
  };
}

function escapeAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
