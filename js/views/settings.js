import { getAllTasks, getAllProjects, getAllSessions, getAllPayments, getAllHabits, getAllNotes, getAllSettings, mergeBackupData, getSetting, setSetting, getAllHealthEpisodes, getAllMedicationIntakes, updateTask, deleteTask } from "../db.js";
import { GOOGLE_CLIENT_ID } from "../../config.js";
import { connectDriveSync, getDriveSyncAccount, disconnectDriveSync, previewDriveSync, applyDriveSync, downloadConflictReport } from "../drive-sync.js";
import {
  initGoogle,
  requestToken,
  isConnected,
  disconnect,
  getStoredEmail,
  fetchUserEmail,
  importAllEvents,
  gcalEventToTask,
  uploadBackupToDrive,
  listBackupsOnDrive,
  downloadBackupFromDrive
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
              <button class="btn-ghost" id="btnFindDuplicates">Revisar duplicados importados</button>
              <button class="btn-ghost" id="btnDisconnect">Desconectar</button>
            `
            : `<button class="btn-primary" id="btnConnect">Conectar con Google</button>`}
        </div>

        <p class="hint small" id="gcalMsg"></p>
        <div id="duplicateReview" class="duplicate-review"></div>
        ${lastSync ? `<p class="hint small">Última sincronización: ${escapeHtml(lastSync)}</p>` : ""}
      </section>

      <section class="settings-block" id="driveSyncBlock">
        <h3>Sincronización entre dispositivos</h3>
        <p class="hint">Sincroniza los datos de Papelegruba con el espacio privado appDataFolder de la cuenta de Google que elijas. Puede ser la misma de Calendar o una distinta; no accede a tus archivos normales de Drive.</p>
        <p class="hint" id="driveSyncAccountLabel">Consultando cuenta…</p>
        <div class="gcal-actions">
          <button class="btn-primary" id="btnDriveChooseAccount">Elegir cuenta de Google</button>
          <button class="btn-ghost" id="btnDriveSyncDisconnect">Desvincular cuenta</button>
        </div>
        <div class="gcal-actions" style="margin-top:.6rem">
          <button class="btn-primary" id="btnDriveSyncPreview">Analizar cambios</button>
          <button class="btn-ghost" id="btnDriveSyncApply" disabled>Aplicar sincronización</button>
        </div>
        <p class="hint small" id="driveSyncMsg">Sincronización manual con vista previa. No se propagan eliminaciones y los cambios incompatibles bloquean la operación.</p>
        <div id="driveSyncReview"></div>
      </section>

      <section class="settings-block">
        <h3>Copia de seguridad completa</h3>
        <p class="hint">Incluye tareas, Checklist, Hábitos, proyectos, notas, sesiones, facturación, ajustes y el registro de salud. El archivo se descarga en este dispositivo y no se envía a ningún servidor.</p>\n        <p class="hint small">Tienes <span id="taskCount">${count}</span> tareas guardadas en este dispositivo.</p>
        <div class="gcal-actions">
          <button class="btn-ghost" id="btnExport">Descargar backup en este dispositivo</button>
          <button class="btn-ghost" id="btnImport">Restaurar archivo local</button>
        </div>
        <div class="gcal-actions" style="margin-top:.6rem">
          <button class="btn-primary" id="btnDriveBackup">Guardar backup en Google Drive</button>
          <button class="btn-ghost" id="btnDriveList">Buscar copias en Drive</button>
        </div>
        <label class="fld-label" style="margin-top:.6rem">Copia de Drive
          <select id="driveBackupSelect" style="width:100%;padding:.6rem;border:1px solid var(--c-border);border-radius:9px;background:#fff;color:var(--c-ink)"><option value="">Primero busca copias guardadas</option></select>
        </label>
        <button class="btn-ghost" id="btnDriveRestore">Restaurar copia seleccionada de Drive</button>
        <p class="hint small" id="localMsg">La copia local se descarga como JSON. Drive requiere autorizar el acceso a archivos creados por Papelegruba.</p>
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
  let driveSyncPlan = null;
  const driveSyncMsg = root.querySelector("#driveSyncMsg");
  const driveSyncReview = root.querySelector("#driveSyncReview");
  const driveSyncApplyButton = root.querySelector("#btnDriveSyncApply");

  async function refreshDriveSyncAccountLabel() {
    const account = await getDriveSyncAccount();
    const label = root.querySelector("#driveSyncAccountLabel");
    if (label) label.textContent = account.email
      ? `Cuenta elegida: ${account.email}. Tras recargar la página tendrás que volver a autorizar el acceso.`
      : "No hay una cuenta de sincronización elegida.";
  }
  await refreshDriveSyncAccountLabel();

  root.querySelector("#btnDriveChooseAccount")?.addEventListener("click", async () => {
    driveSyncPlan = null;
    driveSyncApplyButton.disabled = true;
    driveSyncReview.innerHTML = "";
    driveSyncMsg.textContent = "Abriendo selección de cuenta de Google…";
    try {
      const result = await connectDriveSync({ chooseAccount: true });
      await refreshDriveSyncAccountLabel();
      driveSyncMsg.textContent = `Cuenta autorizada: ${result.email || "Google"}. Ahora analiza los cambios.`;
    } catch (error) {
      driveSyncMsg.textContent = "No se ha conectado la cuenta: " + (error.message || error);
    }
  });

  root.querySelector("#btnDriveSyncDisconnect")?.addEventListener("click", async () => {
    if (!confirm("¿Desvincular la cuenta de este dispositivo? Los datos locales y el archivo remoto se conservarán.")) return;
    await disconnectDriveSync();
    driveSyncPlan = null;
    driveSyncApplyButton.disabled = true;
    driveSyncReview.innerHTML = "";
    await refreshDriveSyncAccountLabel();
    driveSyncMsg.textContent = "Cuenta desvinculada. No se han borrado datos.";
  });

  root.querySelector("#btnDriveSyncPreview")?.addEventListener("click", async () => {
    driveSyncPlan = null;
    driveSyncApplyButton.disabled = true;
    driveSyncReview.innerHTML = "";
    driveSyncMsg.textContent = "Comparando datos locales y de Drive…";
    try {
      const plan = await previewDriveSync();
      driveSyncPlan = plan;
      const localTotal = Object.values(plan.localCounts).reduce((a, b) => a + b, 0);
      const remoteTotal = Object.values(plan.remoteCounts).reduce((a, b) => a + b, 0);
      const mergedTotal = Object.values(plan.merged).reduce((a, list) => a + list.length, 0);
      const detail = Object.keys(plan.localCounts).map(key =>
        `<li><strong>${escapeHtml(key)}:</strong> local ${plan.localCounts[key]} · Drive ${plan.remoteCounts[key] || 0} · previsto ${plan.merged[key].length}</li>`
      ).join("");
      driveSyncReview.innerHTML = `
        <div class="duplicate-review" style="margin-top:.75rem;padding:.75rem;border:1px solid var(--c-border);border-radius:10px">
          <p><strong>Vista previa</strong></p>
          <p class="hint small">Local: ${localTotal} registros · Drive: ${remoteTotal} · Resultado previsto: ${mergedTotal}</p>
          <ul>${detail}</ul>
          ${plan.conflicts.length
            ? `<p class="hint"><strong>Conflictos: ${plan.conflicts.length}.</strong> Hay registros con el mismo ID modificados de forma diferente. No se aplicará ningún cambio hasta resolverlos.</p><button type="button" class="btn-ghost" id="btnDriveSyncConflictReport">Descargar informe de conflictos</button>`
            : '<p class="hint">No se han detectado conflictos. Las eliminaciones no se propagan.</p>'}
          <p class="hint small">${plan.remoteExists ? "Archivo remoto encontrado." : "No existe aún un archivo remoto."} Se comprobará de nuevo antes de guardar.</p>
        </div>`;
      if (plan.conflicts.length) {
        driveSyncMsg.textContent = "Sincronización bloqueada por conflictos. No se ha cambiado ningún dato.";
        driveSyncReview.querySelector("#btnDriveSyncConflictReport")?.addEventListener("click", () => downloadConflictReport(plan.conflicts));
      } else {
        driveSyncMsg.textContent = "Revisa el resumen y confirma para aplicar.";
        driveSyncApplyButton.disabled = false;
      }
    } catch (error) {
      driveSyncMsg.textContent = "No se pudo analizar: " + (error.message || error);
    }
  });

  driveSyncApplyButton?.addEventListener("click", async () => {
    if (!driveSyncPlan || driveSyncPlan.conflicts.length) return;
    const localTotal = Object.values(driveSyncPlan.localCounts).reduce((a, b) => a + b, 0);
    const remoteTotal = Object.values(driveSyncPlan.remoteCounts).reduce((a, b) => a + b, 0);
    if (!confirm(`Se sincronizarán los datos de Papelegruba. Local: ${localTotal}; Drive: ${remoteTotal}. No se propagarán eliminaciones. Si Drive ha cambiado desde la vista previa, se cancelará. ¿Continuar?`)) return;
    driveSyncApplyButton.disabled = true;
    driveSyncMsg.textContent = "Aplicando sincronización…";
    try {
      await applyDriveSync(driveSyncPlan);
      driveSyncPlan = null;
      driveSyncReview.innerHTML = "";
      driveSyncMsg.textContent = "Sincronización completada. Los datos locales se conservan.";
      setTimeout(() => renderSettings(root), 1200);
    } catch (error) {
      driveSyncMsg.textContent = "No se ha completado: " + (error.message || error);
      driveSyncApplyButton.disabled = false;
    }
  });

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
      "Los eventos se convertirán en tareas de Papelegruba. Los ya importados se actualizarán en lugar de duplicarse.\n\n" +
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

      const { addTask, getAllTasks } = await import("../db.js");
      const existingTasks = await getAllTasks();
      const byGoogleId = new Map();
      for (const task of existingTasks) {
        if (task.gcalEventId && !byGoogleId.has(task.gcalEventId)) byGoogleId.set(task.gcalEventId, task);
      }
      let created = 0;
      let updated = 0;
      let skipped = 0;
      for (const ev of events) {
        const task = gcalEventToTask(ev);
        if (!task.date || !ev.id) { skipped++; continue; }
        const existing = byGoogleId.get(ev.id);
        if (existing) {
          const { id: keepId, ...patch } = task;
          await updateTask(existing.id, { ...patch, gcalEventId: ev.id, done: existing.done, doneAt: existing.doneAt, projectId: existing.projectId, createdAt: existing.createdAt });
          updated++;
        } else {
          const added = await addTask(task);
          byGoogleId.set(ev.id, added);
          created++;
        }
      }

      await setSetting("lastSync", new Date().toLocaleString("es-ES"));
      msg.textContent = `Importación terminada: ${created} nuevos, ${updated} actualizados y ${skipped} omitidos. No se han creado copias nuevas de eventos ya importados.`;

      setTimeout(() => renderSettings(root), 1500);
    } catch (e) {
      msg.textContent = "❌ Error: " + (e.message || e);
    }
  });

  /* Revisar y eliminar duplicados importados, uno por uno */
  root.querySelector("#btnFindDuplicates")?.addEventListener("click", async () => {
    const panel = root.querySelector("#duplicateReview");
    panel.innerHTML = "Buscando duplicados…";
    try {
      const tasks = (await getAllTasks()).filter(t => t.gcalEventId && !t.isChecklist);
      const groups = new Map();
      for (const task of tasks) {
        if (!groups.has(task.gcalEventId)) groups.set(task.gcalEventId, []);
        groups.get(task.gcalEventId).push(task);
      }
      const duplicates = [...groups.values()].filter(group => group.length > 1).flatMap(group => group.slice(1));
      if (!duplicates.length) { panel.innerHTML = '<p class="hint small">No se han encontrado duplicados con el mismo identificador de Google Calendar.</p>'; return; }
      panel.innerHTML = '<h4>Duplicados detectados: ' + duplicates.length + '</h4><p class="hint small">Elige qué copia adicional eliminar. Cada elemento se elimina por separado.</p><div class="duplicate-list">' + duplicates.map(t => '<article class="duplicate-item" data-task-id="' + escapeAttr(t.id) + '" style="display:flex;justify-content:space-between;gap:.75rem;align-items:center;padding:.6rem 0;border-bottom:1px solid var(--c-border)"><div><strong>' + escapeHtml(t.title || "Evento sin título") + '</strong><small style="display:block">' + escapeHtml(t.date || "Sin fecha") + (t.time ? " · " + escapeHtml(t.time) : "") + '</small></div><button class="btn-ghost duplicate-delete" type="button">Eliminar esta copia</button></article>').join("") + '</div>';
      panel.querySelectorAll(".duplicate-delete").forEach(button => {
        button.addEventListener("click", async () => {
          const item = button.closest(".duplicate-item");
          const task = duplicates.find(t => t.id === item.dataset.taskId);
          if (!task || !confirm('¿Eliminar solo esta copia de "' + (task.title || "evento") + '" del dispositivo? No se borrará el evento de Google Calendar.')) return;
          await deleteTask(task.id);
          item.remove();
          const heading = panel.querySelector("h4");
          const remaining = panel.querySelectorAll(".duplicate-item").length;
          if (heading) heading.textContent = "Duplicados pendientes: " + remaining;
          if (!remaining) panel.innerHTML = '<p class="hint small">Revisión terminada. No quedan copias adicionales en esta lista.</p>';
        });
      });
    } catch (e) { panel.textContent = "No se pudieron revisar los duplicados: " + (e.message || e); }
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
      tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes
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

  /* Copia completa en Google Drive */
  root.querySelector("#btnDriveBackup").onclick = async () => {
    localMsg.textContent = "Conectando con Google Drive…";
    try {
      await initGoogle();
      await requestToken();
      const [tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes] = await Promise.all([getAllTasks(), getAllHabits(), getAllProjects(), getAllNotes(), getAllSessions(), getAllPayments(), getAllSettings(), getAllHealthEpisodes(), getAllMedicationIntakes()]);
      const payload = { format: "papelegruba-backup", version: 3, exportedAt: new Date().toISOString(), tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes };
      const file = await uploadBackupToDrive(payload);
      localMsg.textContent = "Copia guardada en Google Drive: " + (file.name || "Papelegruba");
      await refreshDriveBackups();
    } catch (e) { localMsg.textContent = "Error guardando en Drive: " + (e.message || e); }
  };

  root.querySelector("#btnDriveList").onclick = refreshDriveBackups;

  async function refreshDriveBackups() {
    localMsg.textContent = "Buscando copias en Drive…";
    try {
      await initGoogle();
      await requestToken();
      const files = await listBackupsOnDrive();
      const select = root.querySelector("#driveBackupSelect");
      select.innerHTML = "";
      const first = document.createElement("option");
      first.value = ""; first.textContent = files.length ? "Selecciona una copia…" : "No hay copias de Papelegruba en Drive";
      select.appendChild(first);
      files.forEach(file => {
        const option = document.createElement("option");
        option.value = file.id;
        option.textContent = (file.name || "Backup") + (file.createdTime ? " · " + new Date(file.createdTime).toLocaleString("es-ES") : "");
        select.appendChild(option);
      });
      localMsg.textContent = files.length ? "Encontradas " + files.length + " copias." : "No hay copias guardadas por Papelegruba en Drive.";
    } catch (e) { localMsg.textContent = "Error buscando copias: " + (e.message || e); }
  }

  root.querySelector("#btnDriveRestore").onclick = async () => {
    const fileId = root.querySelector("#driveBackupSelect").value;
    if (!fileId) { localMsg.textContent = "Selecciona primero una copia de Drive."; return; }
    if (!confirm("Se combinará la copia con los datos de este dispositivo. Los registros con la misma ID se actualizarán y no se borrarán datos. ¿Continuar?")) return;
    localMsg.textContent = "Descargando copia de Drive…";
    try {
      await initGoogle();
      await requestToken();
      const raw = await downloadBackupFromDrive(fileId);
      const data = JSON.parse(raw);
      if (data.format !== "papelegruba-backup") throw new Error("El archivo no es una copia de Papelegruba.");
      const collections = ["tasks", "habits", "projects", "notes", "sessions", "payments", "settings", "healthEpisodes", "medicationIntakes"];
      const total = collections.reduce((sum, key) => sum + (Array.isArray(data[key]) ? data[key].length : 0), 0);
      if (!total) throw new Error("La copia no contiene datos reconocibles.");
      const count = await mergeBackupData(data);
      localMsg.textContent = "Restauración completada: " + count + " registros procesados. No se han borrado datos.";
    } catch (e) { localMsg.textContent = "Error restaurando desde Drive: " + (e.message || e); }
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
