function emitTaskChange(action, task) {
  try { window.dispatchEvent(new CustomEvent("papelegruba:task-change", { detail: { action, task } })); } catch (_) {}
}

const DB_NAME = "papelegruba";
const DB_VERSION = 4;
let dbPromise;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const mk = (name, opts = { keyPath: "id" }) => {
        if (!db.objectStoreNames.contains(name)) return db.createObjectStore(name, opts);
        return null;
      };
      if (!db.objectStoreNames.contains("tasks")) {
        const s = db.createObjectStore("tasks", { keyPath: "id" });
        s.createIndex("by_date", "date");
        s.createIndex("by_type", "type");
        s.createIndex("by_date_type", ["date", "type"]);
      }
      mk("projects"); mk("notes"); mk("habits"); mk("healthEpisodes"); mk("medicationIntakes"); mk("trash");
      if (!db.objectStoreNames.contains("sessions")) {
        const s = db.createObjectStore("sessions", { keyPath: "id" });
        s.createIndex("by_date", "date"); s.createIndex("by_category", "categoryId");
      }
      if (!db.objectStoreNames.contains("payments")) {
        const p = db.createObjectStore("payments", { keyPath: "id" });
        p.createIndex("by_date", "date"); p.createIndex("by_category", "categoryId");
      }
      if (!db.objectStoreNames.contains("settings")) db.createObjectStore("settings", { keyPath: "key" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => {
      if (mode === "readwrite") {
        try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: Array.isArray(store) ? store.join(",") : store } })); } catch (_) {}
      }
      resolve(out?.result ?? out);
    };
    t.onerror = () => reject(t.error);
  });
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export async function addTask(partial) {
  const now = new Date().toISOString();
  const { id: _ignoredId, ...safePartial } = partial || {};

  if (safePartial.title && safePartial.date) {
    const tareasExistentes = await getTasksByDate(safePartial.date);
    const tituloLimpio = safePartial.title.trim().toLowerCase();
    const notasLimpias = (safePartial.notes || "").trim().toLowerCase();
    const hora = safePartial.time || "";

    const coincidencias = tareasExistentes.filter(t => (t.title || "").trim().toLowerCase() === tituloLimpio);

    if (coincidencias.length > 0) {
      const esClonExacto = coincidencias.some(t => (t.time || "") === hora && (t.notes || "").trim().toLowerCase() === notasLimpias);
      if (esClonExacto) {
        console.warn("Bloqueado: Es un clon exacto.");
        return null;
      }
      const confirmar = confirm(`Ya existe una tarea llamada "${safePartial.title}" para el día ${safePartial.date}.\n\n¿Quieres crearla de todos modos?`);
      if (!confirmar) return null;
    }
  }

  const task = {
    id: uid(), type: "personal", title: "", notes: "", date: "", time: "", endTime: "", duration: 25,
    projectId: null, tags: [], priority: 0, done: false, doneAt: null,
    createdAt: now, updatedAt: now, gcalEventId: null, ...safePartial
  };

  if (!task.id) task.id = uid();
  if (task.date === null || task.date === undefined) task.date = "";
  if (typeof task.date !== "string") task.date = String(task.date);
  if (task.isChecklist === true) {
    if (typeof task.type !== "string") task.type = "";
  } else if (!task.type || typeof task.type !== "string") {
    task.type = "personal";
  }

  await tx("tasks", "readwrite", s => s.put(task));
  emitTaskChange("upsert", task);
  return task;
}

export async function updateTask(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("tasks", "readwrite");
    const s = t.objectStore("tasks");
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error(`No existe la tarea ${id}`)); return; }
      const merged = { ...req.result, ...(patch && typeof patch === "object" ? patch : {}), id, updatedAt: new Date().toISOString() };
      if (merged.date === null || merged.date === undefined) merged.date = "";
      if (typeof merged.date !== "string") merged.date = String(merged.date);
      if (merged.isChecklist === true) {
        if (typeof merged.type !== "string") merged.type = "";
      } else if (!merged.type || typeof merged.type !== "string") merged.type = "personal";
      s.put(merged);
      t.oncomplete = () => { emitTaskChange("upsert", merged); resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteTask(id) {
  const all = await getAllTasks();
  const existing = all.find(task => task.id === id);
  if (existing) await moveToTrash("tasks", existing);
  if (existing) emitTaskChange("delete", existing);
}

export async function deleteTaskLocalOnly(id) {
  return tx("tasks", "readwrite", s => s.delete(id));
}

export async function getTasksByDate(dateStr) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const idx = db.transaction("tasks").objectStore("tasks").index("by_date");
    const req = idx.getAll(IDBKeyRange.only(dateStr));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getTasksInRange(fromStr, toStr) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const idx = db.transaction("tasks").objectStore("tasks").index("by_date");
    const req = idx.getAll(IDBKeyRange.bound(fromStr, toStr));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllTasks() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("tasks").objectStore("tasks").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getMedicalInRange(fromStr, toStr) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const idx = db.transaction("tasks").objectStore("tasks").index("by_date_type");
    const req = idx.getAll(IDBKeyRange.bound([fromStr, "medical"], [toStr, "medical"]));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getUpcomingMedical(limit = 5) {
  const all = await getAllTasks();
  const today = new Date().toISOString().slice(0, 10);
  return all.filter(t => t.type === "medical" && t.isChecklist !== true && !t.done && t.date && t.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))).slice(0, limit);
}

export async function getSetting(key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("settings").objectStore("settings").get(key);
    req.onsuccess = () => resolve(req.result?.value ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function setSetting(key, value) {
  await tx("settings", "readwrite", s => s.put({ key, value }));
}

export async function addProject(partial = {}) {
  const now = new Date().toISOString();
  const project = { name: "", color: "#C9A7E8", archived: false, createdAt: now, ...(partial && typeof partial === "object" ? partial : {}) };
  project.id = uid();
  await tx("projects", "readwrite", s => s.put(project));
  return project;
}

export async function getAllProjects() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("projects").objectStore("projects").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addSession(partial) {
  const now = new Date().toISOString();
  const session = { id: uid(), date: now.slice(0, 10), startTime: "00:00", endTime: "00:00", durationMinutes: 0, categoryId: "personal", taskId: null, taskTitle: null, description: "", billable: false, rate: 0, amount: 0, billed: false, billedAt: null, adjustment: false, createdAt: now, ...(partial && typeof partial === "object" ? partial : {}) };
  session.id = uid();
  await tx("sessions", "readwrite", s => s.put(session));
  return session;
}

export async function updateSession(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("sessions", "readwrite");
    const s = t.objectStore("sessions");
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { try { t.abort(); } catch (_) {} reject(new Error(`No existe la sesión ${id}`)); return; }
      const merged = { ...req.result, ...(patch && typeof patch === "object" ? patch : {}), id };
      s.put(merged);
      t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "sessions" } })); } catch (_) {} resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteSession(id) {
  const all = await getAllSessions();
  const item = all.find(x => x.id === id);
  if (item) await moveToTrash("sessions", item);
}

export async function getAllSessions() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("sessions").objectStore("sessions").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getSessionsByCategory(categoryId) {
  const all = await getAllSessions();
  return all.filter(s => s.categoryId === categoryId);
}

export async function addPayment(partial) {
  const now = new Date().toISOString();
  const payment = { id: uid(), date: now.slice(0, 10), amount: 0, categoryId: "work-sye", method: "otro", note: "", appliedToSessions: [], createdAt: now, ...(partial && typeof partial === "object" ? partial : {}) };
  payment.id = uid();
  await tx("payments", "readwrite", s => s.put(payment));
  return payment;
}

export async function updatePayment(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("payments", "readwrite");
    const s = t.objectStore("payments");
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { try { t.abort(); } catch (_) {} reject(new Error(`No existe el cobro ${id}`)); return; }
      const merged = { ...req.result, ...(patch && typeof patch === "object" ? patch : {}), id };
      s.put(merged);
      t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "payments" } })); } catch (_) {} resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deletePayment(id) {
  const all = await getAllPayments();
  const item = all.find(x => x.id === id);
  if (item) await moveToTrash("payments", item);
}

export async function getAllPayments() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("payments").objectStore("payments").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addHabit(partial = {}) {
  const now = new Date().toISOString();
  const { id: _ignoredId, ...safe } = partial || {};
  const habit = { id: uid(), title: "", notes: "", type: "personal", sourceTaskId: null, done: false, doneAt: null, active: true, createdAt: now, updatedAt: now, ...safe };
  await tx("habits", "readwrite", s => s.add(habit));
  return habit;
}

export async function getAllHabits() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("habits").objectStore("habits").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function updateHabit(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("habits", "readwrite");
    const store = t.objectStore("habits");
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error(`No existe el hábito ${id}`)); return; }
      const merged = { ...req.result, ...patch, updatedAt: new Date().toISOString() };
      store.put(merged);
      t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "habits" } })); } catch (_) {} resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}

export async function deleteHabit(id) {
  const all = await getAllHabits();
  const item = all.find(h => h.id === id);
  if (item) await moveToTrash("habits", item);
}

export async function convertTaskToHabit(taskId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(["tasks", "habits"], "readwrite");
    const tasks = t.objectStore("tasks");
    const habits = t.objectStore("habits");
    let result = null;
    let failure = null;
    const req = tasks.get(taskId);
    req.onsuccess = () => {
      const task = req.result;
      if (!task) { failure = new Error(`No existe la tarea ${taskId}`); t.abort(); return; }
      const allReq = habits.getAll();
      allReq.onsuccess = () => {
        const existing = allReq.result.find(h => h.id === task.habitId || h.sourceTaskId === task.id);
        if (existing) {
          if (task.habitId !== existing.id) tasks.put({ ...task, habitId: existing.id, updatedAt: new Date().toISOString() });
          result = existing;
          return;
        }
        const now = new Date().toISOString();
        const habit = { id: uid(), title: task.title || "", notes: task.notes || "", type: task.type || "personal", sourceTaskId: task.id, done: false, doneAt: null, active: true, createdAt: now, updatedAt: now };
        habits.add(habit);
        tasks.put({ ...task, habitId: habit.id, updatedAt: now });
        result = habit;
      };
      allReq.onerror = () => { failure = allReq.error; t.abort(); };
    };
    req.onerror = () => { failure = req.error; t.abort(); };
    t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "habits" } })); } catch (_) {} resolve(result); };
    t.onabort = () => reject(failure || t.error || new Error("No se pudo convertir la tarea en hábito"));
    t.onerror = () => reject(failure || t.error);
  });
}

function normalizeDuplicateText(value) {
  return String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("es").replace(/[^a-z0-9]+/g, " ").trim();
}
function backupRecordName(collection, item) {
  if (!item || typeof item !== "object") return "";
  if (collection === "tasks") return normalizeDuplicateText(item.title || item.name);
  if (collection === "projects" || collection === "habits") return normalizeDuplicateText(item.name || item.title);
  if (collection === "notes") return normalizeDuplicateText(item.title || item.name);
  if (collection === "healthEpisodes") return normalizeDuplicateText(item.title || item.type);
  if (collection === "medicationIntakes") return normalizeDuplicateText(item.medication || item.name || item.title);
  return "";
}
function backupDuplicateKey(collection, item) {
  const name = backupRecordName(collection, item);
  if (!name) return "";
  if (collection === "tasks") {
    const date = normalizeDuplicateText(item.date || item.dueDate || item.startDate || item.startAt || "");
    const notes = normalizeDuplicateText(item.notes || item.note || item.description || "");
    return [name, date, notes].join("|");
  }
  if (collection === "projects" || collection === "habits" || collection === "notes") return name;
  return name + "|" + String(item.date || item.startAt || item.createdAt || "");
}
export async function mergeBackupData(data) {
  const db = await initDB();
  const storeNames = ["tasks", "habits", "projects", "notes", "sessions", "payments", "settings", "healthEpisodes", "medicationIntakes", "trash"];
  const payload = Object.fromEntries(storeNames.map(name => [name, Array.isArray(data?.[name]) ? data[name] : []]));
  return new Promise((resolve, reject) => {
    const t = db.transaction(storeNames, "readwrite");
    const existing = {};
    let imported = 0, skippedExisting = 0, invalid = 0;
    for (const name of storeNames) {
      const store = t.objectStore(name);
      const req = store.getAll();
      req.onsuccess = () => {
        existing[name] = req.result || [];
        const existingIds = new Set(existing[name].map(item => name === "settings" ? item.key : String(item.id)));
        const existingNames = new Set(existing[name].map(item => backupDuplicateKey(name, item)).filter(Boolean));
        const incomingIds = new Set();
        for (const item of payload[name]) {
          if (!item || typeof item !== "object" || (name === "settings" ? typeof item.key !== "string" : item.id == null || item.id === "")) {
            invalid++; continue;
          }
          const id = name === "settings" ? item.key : String(item.id);
          const duplicateKey = backupDuplicateKey(name, item);
          if (existingIds.has(id) || incomingIds.has(id) || (duplicateKey && existingNames.has(duplicateKey))) {
            skippedExisting++; continue;
          }
          store.put(item);
          imported++;
          existingIds.add(id);
          incomingIds.add(id);
          if (duplicateKey) existingNames.add(duplicateKey);
        }
      };
      req.onerror = () => { try { t.abort(); } catch (_) {} };
    }
    t.oncomplete = () => {
      try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "restore" } })); } catch (_) {}
      resolve({ imported, skippedExisting, invalid, total: imported + skippedExisting + invalid });
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("No se pudo restaurar el respaldo"));
  });
}
export async function replaceSyncedCollections(data) {
  const db = await initDB();
  const names = ["tasks", "habits", "projects", "notes", "sessions", "payments", "healthEpisodes", "medicationIntakes", "trash"];
  return new Promise((resolve, reject) => {
    const t = db.transaction(names, "readwrite");
    let count = 0;
    for (const name of names) {
      const store = t.objectStore(name);
      store.clear();
      for (const item of Array.isArray(data[name]) ? data[name] : []) {
        if (!item || typeof item !== "object" || item.id == null || item.id === "") continue;
        store.put(item); count++;
      }
    }
    t.oncomplete = () => {
      try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "drive-sync" } })); } catch (_) {}
      resolve(count);
    };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("No se pudieron aplicar los datos sincronizados."));
  });
}

export async function getAllSettings() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("settings").objectStore("settings").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getAllNotes() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("notes").objectStore("notes").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

const TRASH_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
export async function moveToTrash(collection, record) {
  const allowed = ["tasks", "habits", "projects", "notes", "sessions", "payments", "healthEpisodes", "medicationIntakes"];
  if (!allowed.includes(collection) || !record || record.id == null) throw new Error("Registro no válido");
  const now = new Date().toISOString();
  const entry = { id: uid(), collection, recordId: record.id, record, deletedAt: now, expiresAt: new Date(Date.now() + TRASH_RETENTION_MS).toISOString() };
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction([collection, "trash"], "readwrite");
    t.objectStore("trash").put(entry);
    t.objectStore(collection).delete(record.id);
    t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "trash" } })); } catch (_) {} resolve(entry); };
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("No se pudo mover a la papelera."));
  });
}
export async function getTrash() {
  const db = await initDB();
  const entries = await new Promise((resolve, reject) => {
    const req = db.transaction("trash").objectStore("trash").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
  const now = Date.now();
  const valid = entries.filter(item => Date.parse(item.expiresAt || "") > now);
  const expired = entries.filter(item => !valid.includes(item));
  if (expired.length) await new Promise((resolve, reject) => {
    const t = db.transaction("trash", "readwrite");
    expired.forEach(item => t.objectStore("trash").delete(item.id));
    t.oncomplete = resolve; t.onerror = () => reject(t.error);
  });
  return valid.sort((a,b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
}
export async function restoreTrashItem(trashId) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(["trash", "tasks", "habits", "projects", "notes", "sessions", "payments", "healthEpisodes", "medicationIntakes"], "readwrite");
    const trash = t.objectStore("trash");
    const req = trash.get(trashId);
    let restored = false;
    let restoredRecord = null;
    req.onsuccess = () => {
      const entry = req.result;
      if (!entry || Date.parse(entry.expiresAt || "") <= Date.now()) { if (entry) trash.delete(trashId); return; }
      if (!["tasks", "habits", "projects", "notes", "sessions", "payments", "healthEpisodes", "medicationIntakes"].includes(entry.collection)) return;
      t.objectStore(entry.collection).put(entry.record);
      restoredRecord = entry.collection === "tasks" ? entry.record : null;
      trash.delete(trashId);
      restored = true;
    };
    req.onerror = () => reject(req.error);
    t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "restore" } })); if (restoredRecord) window.dispatchEvent(new CustomEvent("papelegruba:task-change", { detail: { action: "upsert", task: restoredRecord } })); } catch (_) {} resolve(restored); };
    t.onerror = () => reject(t.error);
  });
}
export async function permanentlyDeleteTrashItem(trashId) {
  return tx("trash", "readwrite", s => s.delete(trashId));
}

export async function getAllHealthEpisodes() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("healthEpisodes").objectStore("healthEpisodes").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function addHealthEpisode(partial = {}) {
  const now = new Date().toISOString();
  const episode = { type: "Otros", title: "", startAt: now.slice(0,16), endAt: "", intensity: null, symptoms: "", triggers: "", notes: "", createdAt: now, updatedAt: now, ...(partial && typeof partial === "object" ? partial : {}) };
  episode.id = uid();
  await tx("healthEpisodes", "readwrite", s => s.add(episode));
  return episode;
}
export async function updateHealthEpisode(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("healthEpisodes", "readwrite");
    const s = t.objectStore("healthEpisodes");
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error("No se encuentra el episodio")); return; }
      const merged = { ...req.result, ...patch, updatedAt: new Date().toISOString() };
      s.put(merged);
      t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "healthEpisodes" } })); } catch (_) {} resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}
export async function deleteHealthEpisode(id) {
  const allEpisodes = await getAllHealthEpisodes();
  const episode = allEpisodes.find(item => item.id === id);
  if (episode) await moveToTrash("healthEpisodes", episode);
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(["healthEpisodes", "medicationIntakes"], "readwrite");
    const episodes = t.objectStore("healthEpisodes");
    const intakes = t.objectStore("medicationIntakes");
    const req = intakes.getAll();
    req.onsuccess = () => {
      req.result.filter(x => x.episodeId === id).forEach(x => intakes.put({ ...x, episodeId: null, updatedAt: new Date().toISOString() }));
      if (!episode) episodes.delete(id);
    };
    req.onerror = () => { try { t.abort(); } catch {} reject(req.error); };
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error || new Error("No se pudo eliminar el episodio"));
  });
}
export async function getAllMedicationIntakes() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("medicationIntakes").objectStore("medicationIntakes").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
export async function addMedicationIntake(partial = {}) {
  const now = new Date().toISOString();
  const intake = { medication: "", dose: "", takenAt: now.slice(0,16), episodeId: null, effect: "", notes: "", createdAt: now, updatedAt: now, ...(partial && typeof partial === "object" ? partial : {}) };
  intake.id = uid();
  await tx("medicationIntakes", "readwrite", s => s.add(intake));
  return intake;
}
export async function updateMedicationIntake(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("medicationIntakes", "readwrite");
    const s = t.objectStore("medicationIntakes");
    const req = s.get(id);
    req.onsuccess = () => {
      if (!req.result) { reject(new Error("No se encuentra la toma")); return; }
      const merged = { ...req.result, ...patch, updatedAt: new Date().toISOString() };
      s.put(merged);
      t.oncomplete = () => { try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "medicationIntakes" } })); } catch (_) {} resolve(merged); };
    };
    req.onerror = () => reject(req.error);
    t.onerror = () => reject(t.error);
  });
}
export async function deleteMedicationIntake(id) {
  const all = await getAllMedicationIntakes();
  const item = all.find(x => x.id === id);
  if (item) await moveToTrash("medicationIntakes", item);
}
