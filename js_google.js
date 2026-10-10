import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES } from "../config.js";
import { getSetting, setSetting, addTask, updateTask, getAllTasks } from "./db.js";
import { typeToGcalColor, gcalToType } from "./google-colors.js";

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;

const CAL_API = "https://www.googleapis.com/calendar/v3";

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function getClientId() {
  return (await getSetting("googleClientId")) || GOOGLE_CLIENT_ID;
}

export async function initGoogle() {
  await loadGis();
  const clientId = await getClientId();
  tokenClient = google.accounts.oauth2.initTokenClient({
    client_id: clientId,
    scope: GOOGLE_SCOPES,
    callback: () => {}
  });
}

export async function requestToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;
  if (!tokenClient) await initGoogle();

  return new Promise((resolve, reject) => {
    tokenClient.callback = (resp) => {
      if (resp.error) return reject(resp);
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
      setSetting("googleConnected", true);
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({ prompt: accessToken ? "" : "consent" });
  });
}

export function isConnected() {
  return !!accessToken && Date.now() < tokenExpiresAt - 60000;
}

export function disconnect() {
  if (accessToken && window.google?.accounts?.oauth2) {
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiresAt = 0;
  setSetting("googleConnected", false);
}

async function api(path, init = {}) {
  const token = await requestToken();
  const res = await fetch(`${CAL_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Google API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

export async function listEvents({ timeMin, timeMax, calendarId = "primary" }) {
  const params = new URLSearchParams({
    timeMin, timeMax,
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250"
  });
  return api(`/calendars/${encodeURIComponent(calendarId)}/events?${params}`);
}

export async function createEventFromTask(task, calendarId = "primary") {
  return api(`/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify(taskToGcalEvent(task))
  });
}

export async function updateEvent(eventId, task, calendarId = "primary") {
  return api(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "PATCH",
    body: JSON.stringify(taskToGcalEvent(task))
  });
}

export async function deleteEvent(eventId, calendarId = "primary") {
  return api(`/calendars/${encodeURIComponent(calendarId)}/events/${eventId}`, {
    method: "DELETE"
  });
}

function taskToGcalEvent(task) {
  const color = typeToGcalColor(task.type);
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  const start = task.time
    ? { dateTime: `${task.date}T${task.time}:00`, timeZone: tz }
    : { date: task.date };

  const end = task.endTime
    ? { dateTime: `${task.date}T${task.endTime}:00`, timeZone: tz }
    : task.time
      ? { dateTime: `${task.date}T${addMinutes(task.time, task.duration || 60)}:00`, timeZone: tz }
      : { date: task.date };

  return {
    summary: task.title,
    description: buildDescription(task),
    location: task.address || task.center || "",
    start, end,
    colorId: color.colorId,
    extendedProperties: {
      private: {
        papelegrubaId: task.id,
        type: task.type,
        colorName: color.colorName
      }
    },
    reminders: task.reminderMinutes
      ? { useDefault: false, overrides: [{ method: "popup", minutes: task.reminderMinutes }] }
      : { useDefault: true }
  };
}

function buildDescription(task) {
  const lines = [];
  if (task.notes) lines.push(task.notes);
  if (task.specialty) lines.push(`Especialidad: ${task.specialty}`);
  if (task.doctor) lines.push(`Doctor/a: ${task.doctor}`);
  if (task.center) lines.push(`Centro: ${task.center}`);
  if (task.phone) lines.push(`Teléfono: ${task.phone}`);
  return lines.join("\n");
}

function addMinutes(hhmm, mins) {
  const [h, m] = hhmm.split(":").map(Number);
  const total = h * 60 + m + mins;
  const hh = String(Math.floor(total / 60) % 24).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function gcalEventToTask(event) {
  const type = gcalToType(event);
  const start = event.start.dateTime || event.start.date;
  const end = event.end.dateTime || event.end.date;
  const date = start.slice(0, 10);
  const time = event.start.dateTime ? start.slice(11, 16) : null;
  const endTime = event.end.dateTime ? end.slice(11, 16) : null;

  return {
    type,
    title: event.summary || "(sin título)",
    notes: event.description || "",
    date, time, endTime,
    address: event.location || null,
    reminderMinutes: event.reminders?.overrides?.[0]?.minutes ?? null,
    gcalEventId: event.id
  };
}

export async function pullFromGoogle({ daysBack = 30, daysForward = 90 } = {}) {
  const timeMin = new Date(Date.now() - daysBack * 864e5).toISOString();
  const timeMax = new Date(Date.now() + daysForward * 864e5).toISOString();

  const data = await listEvents({ timeMin, timeMax });
  const events = data.items || [];
  const existing = await getAllTasks();
  const byGcalId = new Map(existing.filter(t => t.gcalEventId).map(t => [t.gcalEventId, t]));

  let created = 0, updated = 0;

  for (const ev of events) {
    if (ev.status === "cancelled") continue;

    const local = byGcalId.get(ev.id);
    const converted = gcalEventToTask(ev);

    if (local) {
      const gcalUpdated = new Date(ev.updated || 0).getTime();
      const localUpdated = new Date(local.updatedAt || 0).getTime();
      if (gcalUpdated > localUpdated) {
        await updateTask(local.id, converted);
        updated++;
      }
    } else {
      await addTask(converted);
      created++;
    }
  }

  await setSetting("lastPull", new Date().toISOString());
  return { created, updated, total: events.length };
}

export async function pushToGoogle() {
  const tasks = await getAllTasks();
  const calendarId = (await getSetting("googleCalendarId")) || "primary";

  let created = 0, updated = 0, errors = 0;

  for (const t of tasks) {
    if (!t.date) continue;
    if (t.type === "personal" && !t.gcalEventId) continue;

    try {
      if (t.gcalEventId) {
        await updateEvent(t.gcalEventId, t, calendarId);
        updated++;
      } else {
        const ev = await createEventFromTask(t, calendarId);
        await updateTask(t.id, { gcalEventId: ev.id });
        created++;
      }
    } catch (e) {
      console.warn("Error sincronizando tarea", t.id, e);
      errors++;
    }
  }

  await setSetting("lastPush", new Date().toISOString());
  return { created, updated, errors, total: tasks.length };
}

export async function syncBoth() {
  const pull = await pullFromGoogle();
  const push = await pushToGoogle();
  return { pull, push };
}

export async function maybeSyncTask(task) {
  if (!isConnected()) return null;
  const calendarId = (await getSetting("googleCalendarId")) || "primary";
  try {
    if (task.gcalEventId) {
      await updateEvent(task.gcalEventId, task, calendarId);
      return task.gcalEventId;
    } else if (task.date) {
      const ev = await createEventFromTask(task, calendarId);
      await updateTask(task.id, { gcalEventId: ev.id });
      return ev.id;
    }
  } catch (e) {
    console.warn("No se pudo sincronizar con Google:", e);
  }
  return null;
}