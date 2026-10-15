import { GOOGLE_CLIENT_ID } from "../config.js";
import { getActiveTimer } from "./hours.js";
import {
  getAllTasks, getAllHabits, getAllProjects, getAllNotes, getAllSessions,
  getAllPayments, getAllHealthEpisodes, getAllMedicationIntakes, getAllSettings, getTrash,
  getSetting, setSetting, mergeBackupData
} from "./db.js";

const SCOPE = "https://www.googleapis.com/auth/drive.appdata openid email profile";
const FILE_NAME = "papelegruba-sync-v1.json";
const DRIVE = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";
const COLLECTIONS = ["tasks", "habits", "projects", "notes", "sessions", "payments", "healthEpisodes", "medicationIntakes", "trash", "appState"];
let tokenClient = null;
let accessToken = null;
let expiresAt = 0;
let accountEmail = null;
let autoSyncInstalled = false;
let autoSyncTimer = null;
let autoSyncRunning = false;
let autoSyncAgain = false;
let lastAutoSyncSignature = "";

function scheduleAutoDriveSync(delay = 900) {
  if (autoSyncTimer) clearTimeout(autoSyncTimer);
  autoSyncTimer = setTimeout(() => {
    autoSyncTimer = null;
    runAutoDriveSync();
  }, delay);
}

async function runAutoDriveSync() {
  if (autoSyncRunning) { autoSyncAgain = true; return; }
  if (!accessToken || Date.now() >= expiresAt - 30000 || document.visibilityState !== "visible") return;
  autoSyncRunning = true;
  try {
    const plan = await previewDriveSync();
    // Evita reescrituras en bucle cuando solo cambia la marca de sincronización.
    const signature = stable(plan.merged);
    if (signature !== lastAutoSyncSignature || plan.conflicts.length || !plan.remoteExists) {
      await applyDriveSync(plan);
      lastAutoSyncSignature = stable(plan.merged);
      window.dispatchEvent(new CustomEvent("papelegruba:drive-sync-status", {
        detail: { ok: true, at: new Date().toISOString(), conflicts: plan.conflicts.length }
      }));
    }
  } catch (error) {
    window.dispatchEvent(new CustomEvent("papelegruba:drive-sync-status", {
      detail: { ok: false, message: error?.message || String(error) }
    }));
  } finally {
    autoSyncRunning = false;
    if (autoSyncAgain) { autoSyncAgain = false; scheduleAutoDriveSync(400); }
  }
}

export function installDriveSyncListeners() {
  if (autoSyncInstalled) return;
  autoSyncInstalled = true;
  const changed = event => {
    // Los eventos que genera la propia aplicación de un plan no deben iniciar
    // una segunda sincronización concurrente.
    if (event?.detail?.source === "drive-sync") return;
    scheduleAutoDriveSync();
  };
  window.addEventListener("papelegruba:data-change", changed);
  window.addEventListener("papelegruba:task-change", changed);
  window.addEventListener("papelegruba:drive-sync-connected", () => scheduleAutoDriveSync(250));
  window.addEventListener("online", () => scheduleAutoDriveSync(250));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") scheduleAutoDriveSync(250);
  });
  // Una PWA estática no recibe notificaciones push de Drive; consulta mientras
  // permanece abierta para recoger cambios realizados desde otros dispositivos.
  window.setInterval(() => {
    if (document.visibilityState === "visible") scheduleAutoDriveSync(100);
  }, 30000);
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = () => reject(new Error("No se pudo cargar Google Identity Services."));
    document.head.appendChild(script);
  });
}

async function getClientId() {
  return (await getSetting("googleClientId")) || GOOGLE_CLIENT_ID;
}

export async function connectDriveSync({ chooseAccount = true } = {}) {
  await loadGis();
  const clientId = await getClientId();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: SCOPE,
    callback: () => {}
  });
  return new Promise((resolve, reject) => {
    tokenClient.callback = async response => {
      if (response.error) {
        reject(new Error(response.error_description || response.error));
        return;
      }
      accessToken = response.access_token;
      expiresAt = Date.now() + (response.expires_in || 3600) * 1000;
      try {
        const userResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        if (!userResponse.ok) throw new Error("Google no ha permitido consultar la cuenta autorizada.");
        const user = await userResponse.json();
        accountEmail = user.email || null;
        await setSetting("driveSyncAccountEmail", accountEmail);
        await setSetting("driveSyncConnected", true);
        window.dispatchEvent(new CustomEvent("papelegruba:drive-sync-connected"));
        resolve({ email: accountEmail });
      } catch (error) {
        accessToken = null;
        expiresAt = 0;
        reject(error);
      }
    };
    tokenClient.requestAccessToken({ prompt: chooseAccount ? "select_account consent" : "consent" });
  });
}

export async function getDriveSyncAccount() {
  return {
    email: (await getSetting("driveSyncAccountEmail")) || null,
    connected: (await getSetting("driveSyncConnected")) === true
  };
}

export async function disconnectDriveSync() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken); } catch (_) {}
  }
  accessToken = null;
  expiresAt = 0;
  accountEmail = null;
  await setSetting("driveSyncConnected", false);
  await setSetting("driveSyncAccountEmail", null);
}

function requireToken() {
  if (!accessToken || Date.now() >= expiresAt - 30000) {
    throw new Error("La autorización de Drive ha caducado. Pulsa «Elegir cuenta de Google» y vuelve a intentarlo.");
  }
}

async function driveRequest(url, init = {}) {
  requireToken();
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Drive (${response.status}): ${detail || response.statusText}`);
  }
  return response;
}

async function listSyncFile() {
  const params = new URLSearchParams({
    spaces: "appDataFolder",
    q: `name = '${FILE_NAME}' and trashed = false`,
    pageSize: "100",
    fields: "files(id,name,modifiedTime,version)"
  });
  const response = await driveRequest(`${DRIVE}/files?${params}`);
  const data = await response.json();
  if ((data.files || []).length > 1) {
    throw new Error("Hay más de un archivo de sincronización en esta cuenta. No se ha modificado ninguno para evitar mezclar datos.");
  }
  return data.files?.[0] || null;
}

async function readRemote() {
  const file = await listSyncFile();
  if (!file) return { file: null, envelope: null, stamp: "missing" };
  const response = await driveRequest(`${DRIVE}/files/${encodeURIComponent(file.id)}?alt=media`);
  const envelope = await response.json();
  if (envelope?.format !== "papelegruba-sync" || envelope.version !== 1 || !envelope.collections) {
    throw new Error("El archivo de appDataFolder no tiene un formato de sincronización reconocido. No se ha modificado.");
  }
  for (const name of COLLECTIONS) {
    // Compatibilidad con backups anteriores a la sincronización del estado del cronómetro.
    if ((name === "appState" || name === "trash") && envelope.collections[name] === undefined) envelope.collections[name] = [];
    if (!Array.isArray(envelope.collections[name])) throw new Error(`El archivo remoto está incompleto (${name}). No se ha modificado.`);
  }
  return { file, envelope, stamp: `${file.id}:${file.version || file.modifiedTime || envelope.updatedAt}` };
}

async function readLocal() {
  const [tasks, habits, projects, notes, sessions, payments, healthEpisodes, medicationIntakes, trash, openingBalance] = await Promise.all([
    getAllTasks(), getAllHabits(), getAllProjects(), getAllNotes(), getAllSessions(),
    getAllPayments(), getAllHealthEpisodes(), getAllMedicationIntakes(), getTrash(),
    getSetting("papelegruba-hours-opening-balance-v1-work-sye")
  ]);
  // El cronómetro activo se guarda en localStorage, no en IndexedDB: se añade explícitamente a Drive.
  const appState = [
    { id: "activeTimer", value: getActiveTimer() },
    { id: "hoursOpeningBalance", value: openingBalance }
  ];
  return { tasks, habits, projects, notes, sessions, payments, healthEpisodes, medicationIntakes, trash, appState };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}
const same = (a, b) => stable(a) === stable(b);
// Los relojes de sincronización no representan cambios de contenido y no deben
// generar conflictos por sí solos.
const SYNC_METADATA_FIELDS = new Set(["updatedAt", "gtaskUpdated", "gtaskSyncedAt", "gcalUpdated", "gcalSyncedAt"]);
function sameRecord(a, b) {
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) {
    return same(a, b);
  }
  const stripSyncMetadata = value => Object.fromEntries(
    Object.entries(value).filter(([key]) => !SYNC_METADATA_FIELDS.has(key))
  );
  return same(stripSyncMetadata(a), stripSyncMetadata(b));
}
const recordMap = list => new Map(list.filter(item => item && item.id != null).map(item => [String(item.id), item]));

function planMerge(local, remote, base) {
  const merged = {};
  const conflicts = [];
  const counts = { localToCloud: 0, cloudToLocal: 0, unchanged: 0 };
  for (const name of COLLECTIONS) {
    const lm = recordMap(local[name] || []);
    const rm = recordMap(remote[name] || []);
    const bm = recordMap(base?.[name] || []);
    const ids = new Set([...lm.keys(), ...rm.keys(), ...bm.keys()]);
    const out = new Map();
    for (const id of ids) {
      const l = lm.get(id), r = rm.get(id), b = bm.get(id);
      // Deletions are intentionally not propagated. If both copies are absent but the base had the record,
      // restore the base version instead of treating absence as an instruction to delete it remotely.
      if (l === undefined && r === undefined) { if (b !== undefined) out.set(id, b); continue; }
      if (l === undefined) { if (r !== undefined) out.set(id, r); continue; }
      if (r === undefined) { out.set(id, l); continue; }
      if (sameRecord(l, r)) { out.set(id, l); counts.unchanged++; continue; }
      if (b !== undefined) {
        const localChanged = !sameRecord(l, b);
        const remoteChanged = !sameRecord(r, b);
        if (localChanged && remoteChanged) {
          // Agenda HTML es la fuente de verdad: conservar todos los campos locales
          // y registrar el conflicto solo para auditoría, sin bloquear la sincronización.
          out.set(id, l);
          conflicts.push({ collection: name, id, base: b, local: l, drive: r });
          counts.localToCloud++;
        } else if (localChanged) {
          out.set(id, l); counts.localToCloud++;
        } else if (remoteChanged) {
          out.set(id, r); counts.cloudToLocal++;
        } else {
          out.set(id, l);
        }
      } else {
        // Sin una base previa, Agenda HTML también prevalece para IDs coincidentes.
        out.set(id, l);
        counts.localToCloud++;
        conflicts.push({ collection: name, id, base: null, local: l, drive: r });
      }
    }
    merged[name] = [...out.values()];
  }
  return { merged, conflicts, counts };
}

export async function previewDriveSync() {
  requireToken();
  const [local, remoteState, accountEmail] = await Promise.all([
    readLocal(), readRemote(), getSetting("driveSyncAccountEmail")
  ]);
  if (!accountEmail) throw new Error("Elige primero una cuenta de Google para la sincronización.");
  const base = await getSetting(`driveSyncBase:${accountEmail}`);
  const remote = remoteState.envelope?.collections || Object.fromEntries(COLLECTIONS.map(name => [name, []]));
  const result = planMerge(local, remote, base || null);
  return {
    ...result,
    accountEmail,
    remoteStamp: remoteState.stamp,
    remoteExists: !!remoteState.envelope,
    remoteUpdatedAt: remoteState.envelope?.updatedAt || null,
    localCounts: Object.fromEntries(COLLECTIONS.map(name => [name, local[name].length])),
    remoteCounts: Object.fromEntries(COLLECTIONS.map(name => [name, remote[name]?.length || 0])),
    emptyLocal: COLLECTIONS.every(name => local[name].length === 0),
    emptyRemote: COLLECTIONS.every(name => (remote[name] || []).length === 0)
  };
}

async function uploadEnvelope(file, collections) {
  const envelope = {
    format: "papelegruba-sync",
    version: 1,
    updatedAt: new Date().toISOString(),
    collections
  };
  if (file) {
    await driveRequest(`${UPLOAD}/files/${encodeURIComponent(file.id)}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body: JSON.stringify(envelope)
    });
  } else {
    const boundary = "papelegruba_sync_boundary";
    const metadata = { name: FILE_NAME, mimeType: "application/json", parents: ["appDataFolder"] };
    const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(envelope)}\r\n--${boundary}--`;
    await driveRequest(`${UPLOAD}/files?uploadType=multipart&fields=id,name,version,modifiedTime`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body
    });
  }
}

export async function applyDriveSync(plan) {
  requireToken();
  if (!plan || !plan.merged || !Array.isArray(plan.conflicts)) throw new Error("La vista previa ha caducado. Vuelve a sincronizar.");
  if (!accountEmail || accountEmail !== plan.accountEmail) throw new Error("La cuenta de Google ha cambiado desde la vista previa. Analiza los cambios de nuevo.");
  // Los conflictos ya están resueltos en el plan a favor de Agenda HTML.
  // Se conserva el informe para auditoría, pero no se bloquea la aplicación.
  const latest = await readRemote();
  if (latest.stamp !== plan.remoteStamp) {
    throw new Error("Drive ha cambiado desde la vista previa. No se ha aplicado nada; vuelve a pulsar «Analizar cambios».");
  }
  // Write cloud first. If the local write fails, the next preview can recover the remote changes.
  await uploadEnvelope(latest.file, plan.merged);
  const settings = await getAllSettings();
  await mergeBackupData({
    format: "papelegruba-backup",
    version: 3,
    ...plan.merged,
    settings
  });
  // Restaurar el cronómetro activo y el saldo inicial desde el estado sincronizado.
  const appState = new Map((plan.merged.appState || []).map(item => [item.id, item.value]));
  if (appState.has("activeTimer")) {
    const activeTimer = appState.get("activeTimer");
    localStorage.setItem("papelegruba-timer-active",
      activeTimer && typeof activeTimer === "object" && activeTimer.startedAt
        ? JSON.stringify(activeTimer)
        : "null");
    window.dispatchEvent(new CustomEvent("papelegruba:timer-sync"));
  }
  if (appState.has("hoursOpeningBalance")) {
    await setSetting("papelegruba-hours-opening-balance-v1-work-sye", appState.get("hoursOpeningBalance"));
  }
  await setSetting(`driveSyncBase:${plan.accountEmail}`, plan.merged);
  await setSetting("driveSyncLastAt", new Date().toISOString());
  return { updatedAt: new Date().toISOString() };
}

export function downloadConflictReport(conflicts) {
  const blob = new Blob([JSON.stringify({
    format: "papelegruba-sync-conflicts",
    exportedAt: new Date().toISOString(),
    note: "No se ha aplicado ni borrado ninguna versión. Cada conflicto contiene la versión local y la de Google Drive.",
    conflicts
  }, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `papelegruba-conflictos-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
}
