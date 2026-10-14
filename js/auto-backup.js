import {
  getAllTasks, getAllHabits, getAllProjects, getAllNotes, getAllSessions,
  getAllPayments, getAllSettings, getAllHealthEpisodes, getAllMedicationIntakes, getTrash
} from "./db.js";
import { initGoogle, requestToken, uploadBackupToDrive } from "./google.js";
import { getActiveTimer } from "./hours.js";

let installed = false;
let timer = null;
let running = false;
let rerun = false;

async function buildPayload() {
  const [tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes, trash] = await Promise.all([
    getAllTasks(), getAllHabits(), getAllProjects(), getAllNotes(), getAllSessions(),
    getAllPayments(), getAllSettings(), getAllHealthEpisodes(), getAllMedicationIntakes(), getTrash()
  ]);
  return {
    format: "papelegruba-backup",
    version: 4,
    exportedAt: new Date().toISOString(),
    activeTimer: getActiveTimer(),
    tasks, habits, projects, notes, sessions, payments, settings, healthEpisodes, medicationIntakes, trash
  };
}

async function runBackup() {
  if (running) { rerun = true; return; }
  running = true;
  try {
    await initGoogle();
    // Solicita un token sin popup. Si Google exige interacción, los cambios quedan
    // guardados localmente y el siguiente cambio vuelve a intentar la copia.
    await requestToken({ silent: true });
    await uploadBackupToDrive(await buildPayload());
    try { window.dispatchEvent(new CustomEvent("papelegruba:backup-status", { detail: { ok: true, at: new Date().toISOString() } })); } catch (_) {}
  } catch (error) {
    console.info("Copia automática pendiente de autorización de Google Drive:", error?.message || error);
    try { window.dispatchEvent(new CustomEvent("papelegruba:backup-status", { detail: { ok: false, message: error?.message || String(error) } })); } catch (_) {}
  } finally {
    running = false;
    if (rerun) { rerun = false; scheduleBackup(500); }
  }
}

function scheduleBackup(delay = 1200) {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { timer = null; runBackup(); }, delay);
}

export function installAutoBackup() {
  if (installed) return;
  installed = true;
  window.addEventListener("papelegruba:data-change", () => scheduleBackup());
  window.addEventListener("papelegruba:task-change", () => scheduleBackup());
  // Intenta mantener actualizada la última copia al abrir la aplicación.
  scheduleBackup(2500);
}
