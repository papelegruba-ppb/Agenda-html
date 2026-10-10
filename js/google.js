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

  // Mapear color de Google a categoría de Papelegruba
  const colorMap = {
    "1": "personal",       // Lavanda
    "2": "vacation",       // Verde
    "3": "work-sye",       // Uva negra / Morado
    "4": "extra-client",   // Flamenco / Coral
    "5": "app",            // Plátano / Amarillo
    "6": "extra-client",   // Mandarina
    "7": "medical",        // Pavo real / Azul claro
    "8": "event",          // Grafito / Gris
    "9": "own",            // Achicoria / Azul
    "10": "personal",      // Verde bosque
    "11": "work-jac"       // Tomate / Rojo
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
    gcalUpdated: event.updated,
    allDay: isAllDay
  };
}
