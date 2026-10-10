import { getSetting, setSetting } from "../db.js";
import { GOOGLE_CLIENT_ID } from "../config.js";
import { initGoogle, requestToken, isConnected, disconnect } from "../google.js";

export async function renderSettings(root) {
  const clientId = (await getSetting("googleClientId")) || GOOGLE_CLIENT_ID;
  const connected = isConnected();
  const connectedBefore = await getSetting("googleConnected");

  root.innerHTML = `
    <div class="settings-view">
      <h2 class="view-title">Ajustes</h2>

      <section class="settings-block">
        <h3>Google Calendar</h3>
        <p class="hint">
          Conecta tu cuenta para sincronizar tareas y citas. Los colores se
          mantienen igual que en tu Google Calendar.
        </p>

        <label class="fld-label">Client ID
          <input id="clientId" type="text" value="${escapeAttr(clientId)}"
                 placeholder="...apps.googleusercontent.com">
        </label>
        <button class="btn-ghost" id="saveClientId">Guardar Client ID</button>

        <div class="gcal-status ${connected ? "ok" : ""}" id="gcalStatus">
          ${connected
            ? "✅ Conectado a Google Calendar"
            : connectedBefore
              ? "⚠️ Sesión caducada · reconecta cuando quieras"
              : "Sin conectar"}
        </div>

        <div class="gcal-actions">
          ${connected
            ? `
              <button class="btn-primary" id="btnSyncNow">Sincronizar ahora</button>
              <button class="btn-ghost" id="btnPull">Solo traer</button>
              <button class="btn-ghost" id="btnPush">Solo enviar</button>
              <button class="btn-ghost" id="btnDisconnect">Desconectar</button>
            `
            : `<button class="btn-primary" id="btnConnect">Conectar con Google</button>`}
        </div>

        <p class="hint small" id="syncStatus"></p>

        <p class="hint small">
          El token dura ~1 hora. Cuando caduque, la app te pedirá reconectar con un popup.
        </p>
      </section>

      <section class="settings-block">
        <h3>Datos</h3>
        <div class="gcal-actions">
          <button class="btn-ghost" id="btnExport">Exportar JSON</button>
          <button class="btn-ghost" id="btnImport">Importar JSON</button>
        </div>
      </section>

      <section class="settings-block">
        <h3>Acerca de</h3>
        <p class="hint small">Papelegruba · Agenda HTML v0.1</p>
      </section>
    </div>
  `;

  root.querySelector("#saveClientId").onclick = async () => {
    const v = root.querySelector("#clientId").value.trim();
    await setSetting("googleClientId", v);
    alert("Client ID guardado. Recarga la app para aplicarlo.");
  };

  root.querySelector("#btnConnect")?.addEventListener("click", async () => {
    try {
      await initGoogle();
      await requestToken();
      renderSettings(root);
    } catch (e) {
      alert("Error al conectar: " + (e.message || e));
    }
  });

  root.querySelector("#btnDisconnect")?.addEventListener("click", async () => {
    disconnect();
    renderSettings(root);
  });

  const syncStatus = root.querySelector("#syncStatus");

  root.querySelector("#btnSyncNow")?.addEventListener("click", async () => {
    syncStatus.textContent = "Sincronizando…";
    try {
      const { syncBoth } = await import("../google.js");
      const r = await syncBoth();
      syncStatus.textContent = `Traídas: ${r.pull.created} nuevas, ${r.pull.updated} actualizadas. Enviadas: ${r.push.created} nuevas, ${r.push.updated} actualizadas.`;
    } catch (e) {
      syncStatus.textContent = "Error: " + (e.message || e);
    }
  });

  root.querySelector("#btnPull")?.addEventListener("click", async () => {
    syncStatus.textContent = "Trayendo de Google…";
    try {
      const { pullFromGoogle } = await import("../google.js");
      const r = await pullFromGoogle();
      syncStatus.textContent = `Traídas: ${r.created} nuevas, ${r.updated} actualizadas (${r.total} eventos revisados).`;
    } catch (e) {
      syncStatus.textContent = "Error: " + (e.message || e);
    }
  });

  root.querySelector("#btnPush")?.addEventListener("click", async () => {
    syncStatus.textContent = "Enviando a Google…";
    try {
      const { pushToGoogle } = await import("../google.js");
      const r = await pushToGoogle();
      syncStatus.textContent = `Enviadas: ${r.created} nuevas, ${r.updated} actualizadas.`;
    } catch (e) {
      syncStatus.textContent = "Error: " + (e.message || e);
    }
  });

  root.querySelector("#btnExport").onclick = exportJson;
  root.querySelector("#btnImport").onclick = importJson;
}

async function exportJson() {
  const { getAllTasks, getAllProjects } = await import("../db.js");
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    tasks: await getAllTasks(),
    projects: await getAllProjects()
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `papelegruba-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function importJson() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "application/json";
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    const text = await file.text();
    const data = JSON.parse(text);
    if (!confirm(`¿Importar ${data.tasks?.length || 0} tareas y ${data.projects?.length || 0} proyectos?`)) return;

    const { addTask, addProject } = await import("../db.js");
    for (const p of (data.projects || [])) await addProject({ ...p, id: undefined });
    for (const t of (data.tasks || [])) await addTask({ ...t, id: undefined });
    alert("Importación completada.");
    location.reload();
  };
  input.click();
}

function escapeAttr(s) { return (s || "").replace(/"/g, "&quot;"); }