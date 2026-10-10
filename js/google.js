import { GOOGLE_CLIENT_ID, GOOGLE_SCOPES, DEFAULT_CALENDAR_ID } from "../config.js";
import { getSetting, setSetting } from "./db.js";

let tokenClient = null;
let accessToken = null;
let tokenExpiresAt = 0;
let currentEmail = null;

const CAL_API = "https://www.googleapis.com/calendar/v3";

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
export async function requestToken() {
  if (accessToken && Date.now() < tokenExpiresAt - 60000) {
    return accessToken;
  }
  if (!tokenClient) await initGoogle();

  return new Promise((resolve, reject) => {
    tokenClient.callback = async (resp) => {
      if (resp.error) {
        reject(new Error(resp.error));
        return;
      }
      accessToken = resp.access_token;
      tokenExpiresAt = Date.now() + (resp.expires_in || 3600) * 1000;
      await setSetting("googleConnected", true);
      try {
        const info = await api("/users/me/calendarList?maxResults=1");
        currentEmail = info.items?.[0]?.id || null;
        if (currentEmail) await setSetting("googleEmail", currentEmail);
      } catch (_) {}
      resolve(accessToken);
    };
    tokenClient.requestAccessToken({
      prompt: accessToken ? "" : "consent"
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
    google.accounts.oauth2.revoke(accessToken);
  }
  accessToken = null;
  tokenExpiresAt = 0;
  currentEmail = null;
  setSetting("googleConnected", false);
  setSetting("googleEmail", null);
}

/* ---------- Fetch con token ---------- */
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
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Google API ${res.status}: ${txt}`);
  }
  return res.status === 204 ? null : res.json();
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
