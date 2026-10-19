import { getAllTasks, addTask, updateTask, deleteTask, deleteTaskLocalOnly, getSetting, setSetting } from "./db.js";
import {
  initGoogle, requestToken, isConnected, importAllEvents, gcalEventToTask,
  listGoogleTasks, createGoogleTask, updateGoogleTask, deleteGoogleTask,
  createCalendarEvent, updateCalendarEvent, deleteCalendarEvent, getCalendarEvent
} from "./google.js";

let syncing = false;
let applyingRemote = false;
let listenerInstalled = false;
let pollStarted = false;

const isChecklist = task => task?.isChecklist === true ||
  (!task?.date && !task?.gcalEventId && task?.type !== "medical");
const timestamp = value => value ? Date.parse(value) || 0 : 0;
const nowIso = () => new Date().toISOString();

function eventFingerprint(task) {
  return [String(task.title || "").trim().toLocaleLowerCase(), task.date || "", task.time || ""].join("|");
}

function calendarPayload(task) {
  const payload = {
    summary: task.title || "(sin título)",
    description: task.notes || "",
    extendedProperties: { private: { papelegruba: "1", type: task.type || "personal" } }
  };
  if (!task.date) throw new Error("El evento no tiene fecha.");
  if (!task.time) {
    const startDate = task.date;
    let endDate = task.date;
    if (task.endDate && task.endDate > task.date) endDate = task.endDate;
    else {
      const next = new Date(task.date + "T12:00:00");
      next.setDate(next.getDate() + 1);
      endDate = next.toISOString().slice(0, 10);
    }
    payload.start = { date: startDate };
    payload.end = { date: endDate };
  } else {
    const start = new Date(task.date + "T" + task.time);
    const endClock = task.endTime || "";
    const end = endClock
      ? new Date(task.date + "T" + endClock)
      : new Date(start.getTime() + Math.max(5, Number(task.duration) || 25) * 60000);
    payload.start = { dateTime: start.toISOString() };
    payload.end = { dateTime: (end > start ? end : new Date(start.getTime() + 25 * 60000)).toISOString() };
  }
  return payload;
}

function taskPayload(task) {
  const payload = {
    title: task.title || "(sin título)",
    notes: task.notes || ""
  };
  if (task.date) payload.due = new Date(task.date + "T12:00:00Z").toISOString();
  if (task.done) {
    payload.status = "completed";
    payload.completed = task.doneAt || nowIso();
  } else {
    payload.status = "needsAction";
  }
  return payload;
}

async function saveLocal(task, patch) {
  applyingRemote = true;
  try { return await updateTask(task.id, patch); }
  finally { applyingRemote = false; }
}

async function queueDeletion(task) {
  const queue = (await getSetting("googleSyncPendingDeletes")) || [];
  const key = task.isChecklist || task.gtaskId ? "task" : "event";
  const remoteId = key === "task" ? task.gtaskId : task.gcalEventId;
  if (!remoteId) return;
  const identity = key + ":" + remoteId;
  const next = queue.filter(item => item.identity !== identity);
  next.push({ identity, kind: key, remoteId, createdAt: nowIso() });
  await setSetting("googleSyncPendingDeletes", next);
}

async function deleteRemote(kind, id) {
  try {
    if (kind === "task") await deleteGoogleTask(id);
    else await deleteCalendarEvent(id);
  } catch (error) {
    if (!/API 404/.test(error.message || "")) throw error;
  }
}

async function flushDeletionQueue() {
  const queue = (await getSetting("googleSyncPendingDeletes")) || [];
  const remaining = [];
  for (const item of queue) {
    try { await deleteRemote(item.kind, item.remoteId); }
    catch (_) { remaining.push(item); }
  }
  await setSetting("googleSyncPendingDeletes", remaining);
}

function checklistFingerprint(task) {
  const title = String(task?.title || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es").replace(/\s+/g, " ");
  const dateValue = task?.due || task?.date || "";
  const date = String(dateValue).slice(0, 10);
  const notes = String(task?.notes || "").replace(/\r\n?/g, "\n").trim();
  return JSON.stringify([title, date, notes]);
}

async function syncChecklistTasks(localTasks, remoteTasks) {
  const remoteById = new Map(remoteTasks.map(task => [task.id, task]));
  const remoteLive = remoteTasks.filter(task => !task.deleted && task.status !== "completed");
  const liveRemoteIds = new Set(remoteLive.map(task => task.id));

  // Un ID remoto solo puede estar enlazado a un registro local.
  const linkedGroups = new Map();
  for (const task of localTasks.filter(item => item.gtaskId)) {
    if (!linkedGroups.has(task.gtaskId)) linkedGroups.set(task.gtaskId, []);
    linkedGroups.get(task.gtaskId).push(task);
  }
  for (const copies of linkedGroups.values()) {
    if (copies.length < 2) continue;
    copies.sort((a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt));
    for (const duplicate of copies.slice(1)) await deleteTaskLocalOnly(duplicate.id);
  }

  // Aplicar cambios de tareas que ya están enlazadas.
  let currentLocal = await getAllTasks();
  const localByRemoteId = new Map(
    currentLocal.filter(task => isChecklist(task) && task.gtaskId).map(task => [task.gtaskId, task])
  );
  for (const remote of remoteTasks) {
    const local = localByRemoteId.get(remote.id);
    if (!local) continue;
    if (remote.deleted || remote.status === "completed") {
      applyingRemote = true;
      try {
        if (remote.deleted) await deleteTask(local.id);
        else await deleteTaskLocalOnly(local.id);
      } finally { applyingRemote = false; }
      localByRemoteId.delete(remote.id);
      continue;
    }

    const localChanged = !!local.gtaskSyncedAt && timestamp(local.updatedAt) > timestamp(local.gtaskSyncedAt);
    const remoteChanged = timestamp(remote.updated) > timestamp(local.gtaskUpdated);
    if (remoteChanged && !localChanged) {
      await saveLocal(local, {
        title: remote.title || "(sin título)",
        notes: remote.notes || "",
        date: remote.due ? remote.due.slice(0, 10) : "",
        isChecklist: true,
        done: false,
        doneAt: null,
        gtaskId: remote.id,
        gtaskUpdated: remote.updated || null,
        gtaskSyncedAt: nowIso()
      });
    } else if (localChanged) {
      const updated = await updateGoogleTask(remote.id, taskPayload(local));
      await saveLocal(local, { gtaskUpdated: updated.updated || nowIso(), gtaskSyncedAt: nowIso() });
    }
  }

  // Usar datos actualizados tras la primera fase.
  currentLocal = (await getAllTasks()).filter(isChecklist);

  // Eliminar duplicados locales con mismo título+fecha+notas, aunque tengan IDs distintos.
  // Se conserva el enlazado preferentemente y, después, el registro más reciente.
  const localFingerprintGroups = new Map();
  for (const task of currentLocal) {
    const fingerprint = checklistFingerprint(task);
    if (!localFingerprintGroups.has(fingerprint)) localFingerprintGroups.set(fingerprint, []);
    localFingerprintGroups.get(fingerprint).push(task);
  }
  for (const copies of localFingerprintGroups.values()) {
    if (copies.length < 2) continue;
    copies.sort((a, b) => {
      const linkedDiff = Number(!!b.gtaskId) - Number(!!a.gtaskId);
      if (linkedDiff) return linkedDiff;
      return timestamp(b.updatedAt) - timestamp(a.updatedAt);
    });
    const keeper = copies[0];
    for (const duplicate of copies.slice(1)) {
      if (duplicate.gtaskId && duplicate.gtaskId !== keeper.gtaskId && liveRemoteIds.has(duplicate.gtaskId)) {
        try { await deleteGoogleTask(duplicate.gtaskId); }
        catch (error) {
          console.warn("No se pudo eliminar una tarea remota duplicada:", error?.message || error);
          continue;
        }
      }
      applyingRemote = true;
      try { await deleteTaskLocalOnly(duplicate.id); }
      finally { applyingRemote = false; }
    }
  }

  currentLocal = (await getAllTasks()).filter(isChecklist);
  const linkedRemoteIds = new Set(currentLocal.filter(task => task.gtaskId).map(task => task.gtaskId));

  // Importar o enlazar tareas remotas abiertas usando una clave estricta:
  // título, fecha y notas. El proceso es idempotente y enlaza cada ID una sola vez.
  for (const remote of remoteLive) {
    if (linkedRemoteIds.has(remote.id)) continue;
    const fingerprint = checklistFingerprint(remote);
    const duplicate = currentLocal.find(task => checklistFingerprint(task) === fingerprint);
    if (duplicate) {
      if (duplicate.gtaskId && duplicate.gtaskId !== remote.id) {
        // Ya existe la misma tarea enlazada a otro ID remoto: no reimportarla.
        try { await deleteGoogleTask(remote.id); }
        catch (error) { console.warn("No se pudo eliminar una tarea de Google Tasks duplicada:", error?.message || error); }
        continue;
      }
      await saveLocal(duplicate, {
        gtaskId: remote.id,
        gtaskUpdated: remote.updated || null,
        gtaskSyncedAt: nowIso(),
        isChecklist: true
      });
      duplicate.gtaskId = remote.id;
      duplicate.gtaskUpdated = remote.updated || null;
      duplicate.gtaskSyncedAt = nowIso();
      linkedRemoteIds.add(remote.id);
      continue;
    }

    applyingRemote = true;
    let added;
    try {
      added = await addTask({
        title: remote.title || "(sin título)",
        notes: remote.notes || "",
        date: remote.due ? remote.due.slice(0, 10) : "",
        type: "personal",
        isChecklist: true,
        done: false,
        doneAt: null,
        gtaskId: remote.id,
        gtaskUpdated: remote.updated || null,
        gtaskSyncedAt: nowIso()
      });
    } finally { applyingRemote = false; }
    currentLocal.push(added);
    linkedRemoteIds.add(remote.id);
  }

  // Subir solo las tareas locales todavía sin enlace. Si ya existe una tarea remota
  // idéntica, reutilizar su ID; nunca crear un segundo remoto para la misma clave.
  currentLocal = (await getAllTasks()).filter(isChecklist);
  const claimedRemoteIds = new Set(currentLocal.filter(task => task.gtaskId).map(task => task.gtaskId));
  const remoteByFingerprint = new Map();
  for (const remote of remoteLive) {
    if (!remoteByFingerprint.has(checklistFingerprint(remote))) remoteByFingerprint.set(checklistFingerprint(remote), remote);
  }
  for (const local of currentLocal.filter(task => !task.gtaskId)) {
    const candidate = remoteByFingerprint.get(checklistFingerprint(local));
    if (candidate && !claimedRemoteIds.has(candidate.id)) {
      await saveLocal(local, {
        gtaskId: candidate.id,
        gtaskUpdated: candidate.updated || null,
        gtaskSyncedAt: nowIso(),
        isChecklist: true
      });
      claimedRemoteIds.add(candidate.id);
      continue;
    }
    const created = await createGoogleTask(taskPayload(local));
    await saveLocal(local, {
      gtaskId: created.id,
      gtaskUpdated: created.updated || nowIso(),
      gtaskSyncedAt: nowIso(),
      isChecklist: true
    });
    claimedRemoteIds.add(created.id);
  }

  // La API puede ocultar tareas archivadas o antiguas; no borrar por ausencia.
  void remoteById;
}
async function syncCalendar(localTasks) {
  const remoteEvents = await importAllEvents({
    from: "2020-01-01T00:00:00Z",
    to: new Date(Date.now() + 5 * 365 * 864e5).toISOString()
  });
  const remoteById = new Map(remoteEvents.map(event => [event.id, event]));
  const localEvents = localTasks.filter(task => !isChecklist(task) && task.date);
  const linked = localEvents.filter(task => task.gcalEventId);

  // Consultar los eventos vinculados que no aparecen en el listado para detectar
  // eliminaciones en Google Calendar (incluidos eventos cancelados).
  for (const local of linked) {
    let remote = remoteById.get(local.gcalEventId);
    if (!remote) remote = await getCalendarEvent(local.gcalEventId);
    if (!remote || remote.status === "cancelled") {
      applyingRemote = true;
      try { await deleteTask(local.id); } finally { applyingRemote = false; }
      continue;
    }
    if (remote.eventType === "birthday") {
      // Mantener los cumpleaños visibles solo en las vistas de calendario.
      // Nunca editarlos, convertirlos en horas/checklist ni borrarlos de Google.
      await saveLocal(local, { calendarOnly: true, isChecklist: false, type: "personal", gcalEventType: "birthday", gcalUpdated: remote.updated || null, gcalSyncedAt: nowIso() });
      continue;
    }
    const localChanged = timestamp(local.updatedAt) > timestamp(local.gcalSyncedAt);
    const remoteChanged = timestamp(remote.updated) > timestamp(local.gcalUpdated);
    if (localChanged && local.gcalSyncedAt) {
      const updated = await updateCalendarEvent(local.gcalEventId, calendarPayload(local));
      await saveLocal(local, { gcalUpdated: updated.updated || nowIso(), gcalSyncedAt: nowIso() });
    } else if (remoteChanged || !local.gcalSyncedAt) {
      const mapped = gcalEventToTask(remote);
      await saveLocal(local, {
        title: mapped.title, notes: mapped.notes, date: mapped.date,
        time: mapped.time || "", endTime: mapped.endTime || "",
        allDay: mapped.allDay, type: mapped.type,
        gcalEventType: remote.eventType || "default", gcalUpdated: remote.updated || null, gcalSyncedAt: nowIso()
      });
    }
  }

  const localIds = new Set(linked.map(task => task.gcalEventId));
  const remoteFingerprints = new Map(remoteEvents.map(event => [eventFingerprint(gcalEventToTask(event)), event]));
  // Importar eventos de Google Calendar o enlazarlos a tareas locales equivalentes.
  for (const remote of remoteEvents) {
    if (localIds.has(remote.id)) continue;
    const mapped = gcalEventToTask(remote);
    const unlinkedMatch = localEvents.find(task => !task.gcalEventId && eventFingerprint(task) === eventFingerprint(mapped));
    if (unlinkedMatch) {
      await saveLocal(unlinkedMatch, {
        title: mapped.title, notes: mapped.notes, date: mapped.date,
        time: mapped.time || "", endTime: mapped.endTime || "", type: mapped.type,
        allDay: mapped.allDay, gcalEventId: remote.id,
        gcalEventType: remote.eventType || "default", gcalUpdated: remote.updated || null, gcalSyncedAt: nowIso()
      });
      localIds.add(remote.id);
    } else {
      applyingRemote = true;
      try {
        await addTask({ ...mapped, gcalEventType: remote.eventType || "default", gcalUpdated: remote.updated || null, gcalSyncedAt: nowIso() });
      } finally { applyingRemote = false; }
    }
  }

  // Crear en Google los eventos locales nuevos; si coinciden con uno remoto por
  // título/fecha/hora, vincularlos en vez de crear una copia duplicada.
  const refreshed = await getAllTasks();
  const knownIds = new Set(refreshed.filter(t => t.gcalEventId).map(t => t.gcalEventId));
  for (const local of refreshed.filter(t => !t.calendarOnly && !isChecklist(t) && t.date && !t.gcalEventId)) {
    const match = remoteFingerprints.get(eventFingerprint(local));
    if (match) {
      await saveLocal(local, { gcalEventId: match.id, gcalUpdated: match.updated || null, gcalSyncedAt: nowIso() });
      knownIds.add(match.id);
      continue;
    }
    const created = await createCalendarEvent(calendarPayload(local));
    await saveLocal(local, { gcalEventId: created.id, gcalUpdated: created.updated || nowIso(), gcalSyncedAt: nowIso() });
    knownIds.add(created.id);
  }
  void knownIds;
}

export function installGoogleSyncListeners() {
  if (listenerInstalled) return;
  listenerInstalled = true;
  window.addEventListener("papelegruba:task-change", async event => {
    if (applyingRemote) return;
    const { action, task } = event.detail || {};
    if (!task) return;
    if (action === "delete") {
      try {
        if (isConnected()) {
          if (task.gtaskId) await deleteGoogleTask(task.gtaskId);
          if (task.gcalEventId && !isChecklist(task)) await deleteCalendarEvent(task.gcalEventId);
        } else {
          await queueDeletion(task);
        }
      } catch (_) {
        await queueDeletion(task);
      }
      return;
    }
    // Si no hay sesión OAuth activa, el próximo ciclo inicial enviará el cambio.
    if (!isConnected()) return;
    try {
      if (isChecklist(task)) {
        if (task.gtaskId) {
          const remote = await updateGoogleTask(task.gtaskId, taskPayload(task));
          await saveLocal(task, { gtaskUpdated: remote.updated || nowIso(), gtaskSyncedAt: nowIso() });
        } else {
          const remote = await createGoogleTask(taskPayload(task));
          await saveLocal(task, { gtaskId: remote.id, gtaskUpdated: remote.updated || nowIso(), gtaskSyncedAt: nowIso() });
        }
      } else if (task.date) {
        if (task.gcalEventId) {
          const remote = await updateCalendarEvent(task.gcalEventId, calendarPayload(task));
          await saveLocal(task, { gcalUpdated: remote.updated || nowIso(), gcalSyncedAt: nowIso() });
        } else {
          const remote = await createCalendarEvent(calendarPayload(task));
          await saveLocal(task, { gcalEventId: remote.id, gcalUpdated: remote.updated || nowIso(), gcalSyncedAt: nowIso() });
        }
      }
    } catch (error) {
      console.warn("No se pudo sincronizar el cambio con Google; se reintentará al sincronizar:", error);
    }
  });

  if (!pollStarted) {
    pollStarted = true;
    // Google Calendar/Tasks no notifican directamente a una PWA estática;
    // consultar periódicamente permite recoger cambios externos mientras está abierta.
    window.setInterval(() => {
      if (document.visibilityState === "visible" && isConnected()) {
        syncGoogleData({ interactive: false }).catch(error =>
          console.info("Sincronización periódica pendiente:", error?.message || error)
        );
      }
    }, 5 * 60 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && isConnected()) {
        syncGoogleData({ interactive: false }).catch(() => {});
      }
    });
  }
}

export async function syncGoogleData({ interactive = false } = {}) {
  if (syncing) return { skipped: true };
  syncing = true;
  try {
    if (!isConnected()) {
      await initGoogle();
      await requestToken({ silent: !interactive });
    }
    await flushDeletionQueue();
    const local = await getAllTasks();
    const [remoteTasks] = await Promise.all([listGoogleTasks()]);
    await syncChecklistTasks(local.filter(isChecklist), remoteTasks);
    const current = await getAllTasks();
    await syncCalendar(current);
    const completedAt = new Date().toLocaleString("es-ES");
    await setSetting("googleLastSync", completedAt);
    return { completedAt };
  } finally {
    syncing = false;
  }
}

export async function trySyncOnOpen() {
  installGoogleSyncListeners();
  if (!(await getSetting("googleConnected"))) return;
  try {
    await syncGoogleData({ interactive: false });
  } catch (error) {
    console.info("Sincronización automática pendiente de autorización de Google:", error?.message || error);
  }
}
