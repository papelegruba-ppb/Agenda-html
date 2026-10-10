const DB_NAME = "papelegruba";
const DB_VERSION = 1;
let dbPromise;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const mk = (name, opts = { keyPath: "id" }) => {
        if (!db.objectStoreNames.contains(name)) {
          const s = db.createObjectStore(name, opts);
          if (name === "tasks") {
            s.createIndex("by_date", "date");
            s.createIndex("by_type", "type");
            s.createIndex("by_date_type", ["date", "type"]);
          }
        }
      };
      mk("tasks"); mk("projects"); mk("notes"); mk("habits");
      mk("sessions"); mk("settings", { keyPath: "key" });
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
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));

export async function addTask(partial) {
  const now = new Date().toISOString();
  const task = {
    id: uid(),
    type: "personal",
    title: "", notes: "", date: null, time: null, endTime: null,
    duration: 25, projectId: null, tags: [], priority: 0,
    done: false, doneAt: null,
    createdAt: now, updatedAt: now, gcalEventId: null,
    ...partial
  };
  await tx("tasks", "readwrite", s => s.put(task));
  return task;
}

export async function updateTask(id, patch) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction("tasks", "readwrite");
    const s = t.objectStore("tasks");
    const req = s.get(id);
    req.onsuccess = () => {
      const merged = { ...req.result, ...patch, updatedAt: new Date().toISOString() };
      s.put(merged);
      t.oncomplete = () => resolve(merged);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteTask(id) {
  return tx("tasks", "readwrite", s => s.delete(id));
}

export async function getTasksByDate(dateStr) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const s = db.transaction("tasks").objectStore("tasks");
    const idx = s.index("by_date");
    const req = idx.getAll(IDBKeyRange.only(dateStr));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getTasksInRange(fromStr, toStr) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const s = db.transaction("tasks").objectStore("tasks");
    const idx = s.index("by_date");
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
    const s = db.transaction("tasks").objectStore("tasks");
    const idx = s.index("by_date_type");
    const req = idx.getAll(IDBKeyRange.bound([fromStr, "medical"], [toStr, "medical"]));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function getUpcomingMedical(limit = 5) {
  const all = await getAllTasks();
  const today = new Date().toISOString().slice(0, 10);
  return all
    .filter(t => t.type === "medical" && !t.done && t.date >= today)
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")))
    .slice(0, limit);
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

export async function addProject(partial) {
  const now = new Date().toISOString();
  const project = {
    id: uid(), name: "", color: "#C9A7E8", archived: false,
    createdAt: now, ...partial
  };
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
export async function getAllProjects() {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction("projects").objectStore("projects").getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
