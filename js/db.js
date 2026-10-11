const DB_NAME = "papelegruba";
const DB_VERSION = 2;
let dbPromise;

export function initDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      const oldVersion = e.oldVersion || 0;

      // ---------- v1: stores base ----------
      const mk = (name, opts = { keyPath: "id" }) => {
        if (!db.objectStoreNames.contains(name)) {
          return db.createObjectStore(name, opts);
        }
        return null
