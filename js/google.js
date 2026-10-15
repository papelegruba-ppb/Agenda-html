import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, DEFAULT_CALENDAR_ID } from "../config.js";
import { getSetting, setSetting } from "./db.js";

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let currentEmail = null;

const CAL_API = "https://www.googleapis.com/calendar/v3";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

/* ---------- Carga de la librería GIS ---------- */
function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.defer = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error("No se pudo cargar Google Identity Services"));
    document.head.appendChild(s);
  });
}

async function getClientId() {
  return (await getSetting("googleClientId")) || GOOGLE_CLIENT_ID;
}

/* ---------- Inicializar cliente OAuth ---------- */
export async function initGoogle() {
  await loadGis();
  const clientId = await getClientId();

  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: () => {}
  });
}

/* ---------- Pedir token (popup) ---------- */
export async function requestToken({ silent = false } = {}) {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }
  if (!tokenClient) await initGoogle();

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
      setSetting("googleConnected", true);
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({
      prompt: silent || accessToken ? "" : "consent"
    });
  });
}

export function isConnected() {
  return !!accessToken && Date.now() < tokenExpiresAt - 60000;
}

export async function getStoredEmail() {
  return await getSetting("googleEmail");
}

export function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2) {
    try { google.accounts.oauth2.revoke(accessToken); } catch (_) {}
  }
  accessToken = null;
  tokenExpiresAt = 0;
  currentEmail = null;
  setSetting("googleConnected", false);
  setSetting("googleEmail", null);
}

/* ---------- Fetch con token ---------- */
async function api(path, init = {}) {
  if (!accessToken || Date.now() >= tokenExpiresAt - 60000) {
    throw new Error("Token no disponible. Conecta con Google primero.");
  }
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${txt}`);
  }
  return res.status === 204 ? null : res.json();
}

/* ---------- Obtener email del usuario conectado ---------- */
export async function fetchUserEmail() {
  const info = await api("/users/me/calendarList?maxResults=1");
  currentEmail = info.items?.[0]?.id || null;
  if (currentEmail) await setSetting("googleEmail", currentEmail);
  return currentEmail;
}

/* ---------- Listar eventos ---------- */
export async function listEvents({ timeMin, timeMax, calendarId = DEFAULT_CALENDAR_ID }) {
  const params = new URLSearchParams({
    timeMin,
    timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250"
  });
  return api(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
}

/* ---------- Info básica (para diagnóstico) ---------- */
export async function pingCalendar() {
  return api(`/users/me/calendarList?maxResults=5`);
}

/* ---------- Importar todos los eventos de un rango ---------- */
export async function importAllEvents({ from = "2025-01-01T00:00:00Z", to = null, calendarId = DEFAULT_CALENDAR_ID, onProgress } = {}) {
  const timeMin = from;
  const timeMax = to || new Date(Date.now() + 5 * 365 * 864e5).toISOString();

  let pageToken = null;
  const allEvents = [];
  let page = 0;

  do {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250"
    });
    if (pageToken) params.set("pageToken", pageToken);

    const data = await api(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
    const items = (data.items || []).filter(e => e.status !== "cancelled");
    allEvents.push(...items);
    pageToken = data.nextPageToken || null;
    page++;

    if (onProgress) onProgress(allEvents.length, page);
  } while (pageToken);

  return allEvents;
}

/* ---------- Convertir evento de Google a tarea de Papelegruba ---------- */
export function gcalEventToTask(event) {
  const start = event.start?.dateTime || event.start?.date;
  const end = event.end?.dateTime || event.end?.date;
  const isAllDay = !event.start?.dateTime;

  const date = (start || "").slice(0, 10);
  const time = isAllDay ? null : (start || "").slice(11, 16);
  const endTime = (!isAllDay && end) ? end.slice(11, 16) : null;

  // Mapeo de color de Google a categoría de Papelegruba
  const colorMap = {
    "1": "personal",
    "2": "vacation",
    "3": "work-sye",
    "4": "personal",
    "5": "app",
    "6": "personal",
    "7": "medical",
    "8": "event",
    "9": "own",
    "10": "personal",
    "11": "work-jac"
  };

  const type = event.extendedProperties?.private?.type
             || colorMap[String(event.colorId)] || "personal";

  return {
    type,
    title: event.summary || "(sin título)",
    notes: event.description || "",
    date,
    time,
    endTime,
    done: false,
    gcalEventId: event.id,
    gcalEventType: event.eventType || "default",
    calendarOnly: event.eventType === "birthday",
    gcalUpdated: event.updated,
    allDay: isAllDay
  };
}



/* ---------- Sincronización bidireccional de Calendar y Tasks ---------- */
const TASKS_API = "https://tasks.googleapis.com/tasks/v1";

async function tasksApi(path, init = {}) {
  if (!accessToken || Date.now() >= tokenExpiresAt - 60000) {
    throw new Error("Token de Google no disponible.");
  }
  const res = await fetch(`${TASKS_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google Tasks API ${res.status}: ${txt}`);
  }
  return res.status === 204 ? null : res.json();
}

export async function listGoogleTasks() {
  const all = [];
  let pageToken = null;
  do {
    const params = new URLSearchParams({ maxResults: "100", showCompleted: "true", showHidden: "true", showDeleted: "true" });
    if (pageToken) params.set("pageToken", pageToken);
    const data = await tasksApi(`/lists/@default/tasks?${params}`);
    all.push(...(data.items || []));
    pageToken = data.nextPageToken || null;
  } while (pageToken);
  return all;
}

export async function createGoogleTask(task) {
  return tasksApi("/lists/@default/tasks", {
    method: "POST",
    body: JSON.stringify(task)
  });
}

export async function updateGoogleTask(id, task) {
  return tasksApi(`/lists/@default/tasks/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(task)
  });
}

export async function deleteGoogleTask(id) {
  return tasksApi(`/lists/@default/tasks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function createCalendarEvent(event) {
  return api(`/calendars/${encodeURIComponent(DEFAULT_CALENDAR_ID)}/events`, {
    method: "POST",
    body: JSON.stringify(event)
  });
}

export async function updateCalendarEvent(id, event) {
  return api(`/calendars/${encodeURIComponent(DEFAULT_CALENDAR_ID)}/events/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(event)
  });
}

export async function deleteCalendarEvent(id) {
  return api(`/calendars/${encodeURIComponent(DEFAULT_CALENDAR_ID)}/events/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getCalendarEvent(id) {
  try {
    return await api(`/calendars/${encodeURIComponent(DEFAULT_CALENDAR_ID)}/events/${encodeURIComponent(id)}`);
  } catch (error) {
    if (/Google API 404/.test(error.message || "")) return null;
    throw error;
  }
}

/* ---------- Copias de seguridad completas en Google Drive ---------- */
async function driveFetch(url, init = {}) {
  if (!accessToken || Date.now() >= tokenExpiresAt - 60000) {
    throw new Error("Conecta con Google y autoriza el acceso a Drive antes de continuar.");
  }
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers || {})
    }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Google Drive ${response.status}: ${detail || response.statusText}`);
  }
  return response;
}

export async function uploadBackupToDrive(payload) {
  // Una única copia viva: cada guardado reemplaza la anterior en vez de crear otra por fecha.
  const latestName = "papelegruba-backup-latest.json";
  const files = await listBackupsOnDrive();
  const latest = files.find(file => file.name === latestName);
  const body = JSON.stringify({ ...payload, exportedAt: new Date().toISOString() }, null, 2);
  let saved;
  if (latest) {
    const response = await driveFetch(`${DRIVE_UPLOAD_API}/files/${encodeURIComponent(latest.id)}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json; charset=UTF-8" },
      body
    });
    saved = { ...(await response.json().catch(() => ({}))), id: latest.id, name: latestName };
  } else {
    const boundary = "papelegruba_backup_boundary";
    const metadata = {
      name: latestName,
      mimeType: "application/json",
      description: "Última copia automática completa de Papelegruba"
    };
    const multipart = [
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      JSON.stringify(metadata),
      `--${boundary}`,
      "Content-Type: application/json; charset=UTF-8",
      "",
      body,
      `--${boundary}--`,
      ""
    ].join("\r\n");
    const response = await driveFetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,createdTime,size,webViewLink`, {
      method: "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: multipart
    });
    saved = await response.json();
  }
  // Limpiar las copias antiguas solo después de guardar correctamente la nueva copia.
  const oldFiles = files.filter(file => file.id !== saved.id);
  for (const old of oldFiles) {
    await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(old.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true })
    });
  }
  return saved;
}

export async function listBackupsOnDrive() {
  const q = "name contains 'papelegruba-backup-' and trashed = false";
  const params = new URLSearchParams({
    q,
    orderBy: "createdTime desc",
    pageSize: "100",
    fields: "files(id,name,createdTime,size,mimeType,webViewLink)"
  });
  const response = await driveFetch(`${DRIVE_API}/files?${params}`);
  const data = await response.json();
  return (data.files || []).filter(file => file.mimeType === "application/json");
}

export async function downloadBackupFromDrive(fileId) {
  if (!fileId) throw new Error("Selecciona una copia de seguridad.");
  const response = await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`);
  return response.text();
}
