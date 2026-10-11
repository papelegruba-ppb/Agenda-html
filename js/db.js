const DB_NAME = "papelegruba";
const DB_VERSION = 2;
let dbPromise;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;

      const mk = (name, opts = { keyPath: "id" }) => {
        if (!db.objectStoreNames.contains(name)) {
          return db.createObjectStore(name, opts);
        }
        return null;
      };

      // Tareas
      const tasksStore = db.objectStoreNames.contains("tasks")
        ? e.target.transaction.objectStore("tasks")
        : db.createObjectStore("tasks", { keyPath: "id" });
      if (!tasksStore.indexNames.contains("by_date")) {
        tasksStore.createIndex("by_date", "date");
      }
      if (!tasksStore.indexNames.contains("by_type")) {
        tasksStore.createIndex("by_type", "type");
      }

      // Resto de stores
      mk("projects");
      mk("notes");
      mk("habits");

      // Sesiones de tiempo
      const sessionsStore = db.objectStoreNames.contains("sessions")
        ? e.target.transaction.objectStore("sessions")
        : db.createObjectStore("sessions", { keyPath: "id" });
      if (!sessions
