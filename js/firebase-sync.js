import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js";
import {
  getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, getDocs
} from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { initDB, getAllTasks } from "./db.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfwZwOB90JNgQ1hewbTGwVsyrDK-GYvPg",
  authDomain: "agenda-html-511217-90781.firebaseapp.com",
  projectId: "agenda-html-511217-90781",
  storageBucket: "agenda-html-511217-90781.firebasestorage.app",
  messagingSenderId: "313777943876",
  appId: "1:313777943876:web:83677168f68b8c62e41311"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const EXPECTED_GOOGLE_EMAIL = "pelegribassipatricia@gmail.com";
const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: "select_account" });

function requireGoogleAccount() {
  return new Promise((resolve) => {
    let settled = false;
    let overlay = document.getElementById("papelegruba-auth-gate");
    if (!overlay) {
      overlay = document.createElement("section");
      overlay.id = "papelegruba-auth-gate";
      overlay.style.cssText = "position:fixed;inset:0;z-index:100000;background:#faf8fc;color:#3f3f46;display:flex;align-items:center;justify-content:center;padding:24px;font:15px/1.5 system-ui,sans-serif;";
      overlay.innerHTML = '<div style="width:min(440px,100%);background:white;border:1px solid #e8e4ee;border-radius:18px;padding:26px;box-shadow:0 8px 36px #0001"><h2 style="margin:0 0 8px">Papelegruba · sincronización</h2><p>Inicia sesión con la cuenta de Google que quieres usar en el PC y en el móvil.</p><p style="font-weight:600;overflow-wrap:anywhere">pelegribassipatricia@gmail.com</p><button id="papelegruba-google-login" type="button" style="border:0;border-radius:10px;padding:12px 16px;background:#8e7cc3;color:white;font-weight:600;width:100%;cursor:pointer">Continuar con Google</button><p id="papelegruba-auth-message" role="status" style="font-size:13px;margin-bottom:0">La sincronización de datos se activará al iniciar sesión.</p></div>';
      document.body.appendChild(overlay);
    }
    const button = overlay.querySelector("#papelegruba-google-login");
    const message = overlay.querySelector("#papelegruba-auth-message");
    const finish = user => {
      if (settled) return;
      settled = true;
      overlay.remove();
      resolve(user);
    };
    onAuthStateChanged(auth, user => {
      if (!user) return;
      if ((user.email || "").toLowerCase() !== EXPECTED_GOOGLE_EMAIL) {
        message.textContent = "Has iniciado sesión con " + (user.email || "otra cuenta") + ". Se necesita " + EXPECTED_GOOGLE_EMAIL + ". Cerrando esa sesión…";
        signOut(auth).catch(() => {});
        return;
      }
      finish(user);
    }, error => {
      message.textContent = "No se pudo comprobar la sesión: " + (error.message || error);
    });
    getRedirectResult(auth).catch(error => {
      message.textContent = "No se pudo completar el inicio de sesión: " + (error.message || error);
    });
    button.addEventListener("click", async () => {
      button.disabled = true;
      button.textContent = "Conectando…";
      message.textContent = "Abriendo Google…";
      try {
        await signInWithPopup(auth, provider);
      } catch (error) {
        if (error.code === "auth/popup-blocked" || error.code === "auth/cancelled-popup-request") {
          try { await signInWithRedirect(auth, provider); return; } catch (redirectError) {
            message.textContent = "No se pudo abrir Google: " + (redirectError.message || redirectError);
          }
        } else {
          message.textContent = "No se pudo iniciar sesión: " + (error.message || error) + ". Comprueba que Google esté habilitado en Firebase Authentication.";
        }
      } finally {
        button.disabled = false;
        button.textContent = "Continuar con Google";
      }
    });
  });
}

const signedInUser = await requireGoogleAccount();
const currentUid = signedInUser.uid;
const cloudDb = getFirestore(app);
const userCollection = name => collection(cloudDb, "users", currentUid, name);
const userDoc = (name, id) => doc(cloudDb, "users", currentUid, name, String(id));
const tareasCol = userCollection("tareas");

// Indicador visible: los errores de Firebase no deben quedar ocultos en la consola.
function setSyncStatus(state, message) {
  let el = document.getElementById("papelegruba-sync-status");
  if (!el) {
    el = document.createElement("div");
    el.id = "papelegruba-sync-status";
    el.setAttribute("role", "status");
    el.style.cssText = "position:fixed;left:12px;bottom:12px;z-index:99999;max-width:min(440px,calc(100vw - 24px));padding:9px 12px;border-radius:10px;font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 12px #0002;border:1px solid #d8d2df;background:#faf8fc;color:#3f3f46;";
    document.body.appendChild(el);
  }
  const styles = {
    connecting: ["#faf3c0", "#514b20"],
    connected: ["#e5f6ec", "#14532d"],
    error: ["#fee2e2", "#991b1b"]
  };
  const colors = styles[state] || styles.connecting;
  el.style.background = colors[0];
  el.style.color = colors[1];
  el.textContent = message;
  window.dispatchEvent(new CustomEvent("papelegruba:sync-status", { detail: { state, message } }));
}
setSyncStatus("connecting", "Papelegruba · conectando con Firebase…");

let ready = false;
let initializing = false;
let queuedSnapshot = null;
let snapshotQueue = Promise.resolve();
let applyingRemote = false;

const nowIso = () => new Date().toISOString();
const stamp = value => {
  const n = Date.parse(value || "");
  return Number.isFinite(n) ? n : 0;
};

function taskFingerprint(task) {
  const normalize = value => String(value || "").normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("es")
    .replace(/\s+/g, " ");
  return JSON.stringify([
    normalize(task?.title),
    String(task?.date || "").slice(0, 10),
    normalize(task?.notes)
  ]);
}

function normalizeCloudTask(id, raw) {
  // Formato nuevo: documento completo dentro de "task".
  if (raw?.task && typeof raw.task === "object") {
    return { ...raw.task, id, updatedAt: raw.task.updatedAt || raw.updatedAt || null };
  }
  // Compatibilidad con documentos creados por la versión anterior.
  return {
    id,
    title: raw?.titulo || raw?.title || "(sin título)",
    date: raw?.fecha || raw?.date || "",
    time: raw?.hora || raw?.time || "",
    notes: raw?.notas || raw?.notes || "",
    type: raw?.tipo || raw?.type || "personal",
    gcalEventId: raw?.gcalEventId || null,
    updatedAt: raw?.updatedAt || null
  };
}

async function readLocalTask(id) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction("tasks", "readonly").objectStore("tasks").get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Aplica datos remotos sin emitir "task-change": evita el eco nube -> local -> nube.
// Conserva los campos locales que la versión antigua de Firebase no guardaba.
async function writeLocalFromCloud(remote) {
  const db = await initDB();
  const existing = await readLocalTask(remote.id);
  const merged = { ...(existing || {}), ...remote, id: remote.id };
  if (!merged.title) merged.title = "(sin título)";
  if (merged.date == null) merged.date = "";
  if (typeof merged.date !== "string") merged.date = String(merged.date);
  if (!merged.type || typeof merged.type !== "string") merged.type = "personal";

  applyingRemote = true;
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction("tasks", "readwrite");
      tx.objectStore("tasks").put(merged);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error("Se canceló la escritura local"));
    });
  } finally {
    applyingRemote = false;
  }
  try {
    window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "tasks" } }));
  } catch (_) {}
}

async function applyRemoteDocument(docSnapshot) {
  const remote = normalizeCloudTask(docSnapshot.id, docSnapshot.data());
  const local = await readLocalTask(remote.id);
  if (!local) {
    // Los IDs de las versiones antiguas no siempre coinciden. Antes de importar,
    // busca una tarea equivalente por título + fecha + notas para no crear clones.
    const allLocal = await getAllTasks();
    const equivalent = allLocal.find(item => taskFingerprint(item) === taskFingerprint(remote));
    if (equivalent) {
      if (stamp(remote.updatedAt) > stamp(equivalent.updatedAt)) {
        // Conserva el ID local y sus campos adicionales; solo actualiza la versión equivalente.
        await writeLocalFromCloud({ ...remote, id: equivalent.id });
      }
      // Migra el documento remoto al ID local estable antes de retirar el ID antiguo.
      const canonical = await readLocalTask(equivalent.id);
      if (canonical) await uploadTask(canonical);
      if (String(remote.id) !== String(equivalent.id)) {
        await deleteDoc(userDoc("tareas", remote.id));
      }
      return;
    }
    await writeLocalFromCloud(remote);
    return;
  }
  // La nube solo reemplaza al registro local si tiene una versión realmente más reciente.
  if (stamp(remote.updatedAt) > stamp(local.updatedAt)) {
    await writeLocalFromCloud(remote);
  }
}

async function uploadTask(task) {
  if (!task?.id) return;
  const fullTask = { ...task, id: String(task.id) };
  await setDoc(userDoc("tareas", fullTask.id), {
    task: fullTask,
    updatedAt: fullTask.updatedAt || nowIso(),
    schemaVersion: 2
  });
}

async function applySnapshot(snapshot, initial = false) {
  if (initial) {
    // Bootstrap aplica todos los documentos presentes; no infiere borrados de una
    // instantánea inicial, para no eliminar datos locales por una nube incompleta.
    for (const item of snapshot.docs) await applyRemoteDocument(item);
    return;
  }
  for (const change of snapshot.docChanges()) {
    if (change.type === "removed") {
      // IDs estables: solo se elimina la tarea que corresponde al documento eliminado.
      const local = await readLocalTask(change.doc.id);
      if (local) {
        const db = await initDB();
        await new Promise((resolve, reject) => {
          const tx = db.transaction("tasks", "readwrite");
          tx.objectStore("tasks").delete(change.doc.id);
          tx.oncomplete = resolve;
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error("No se pudo aplicar el borrado remoto"));
        });
        try {
          window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "tasks" } }));
        } catch (_) {}
      }
    } else {
      await applyRemoteDocument(change.doc);
    }
  }
}

onSnapshot(tareasCol, snapshot => {
  if (!ready) {
    queuedSnapshot = snapshot;
    return;
  }
  snapshotQueue = snapshotQueue
    .then(() => applySnapshot(snapshot, false))
    .catch(error => { console.error("Error al aplicar cambios de Firebase:", error); setSyncStatus("error", "Firebase: " + (error?.message || error)); });
}, error => {
  console.error("Error de escucha de Firebase:", error);
  setSyncStatus("error", "Firebase no permite sincronizar: " + (error?.message || error));
});

window.addEventListener("papelegruba:task-change", event => {
  if (applyingRemote || !ready) return;
  const { action, task } = event.detail || {};
  if (!task?.id) return;
  snapshotQueue = snapshotQueue.then(async () => {
    if (action === "delete") await deleteDoc(userDoc("tareas", task.id));
    else if (action === "upsert") await uploadTask(task);
  }).catch(error => { console.error("No se pudo sincronizar el cambio con Firebase:", error); setSyncStatus("error", "No se pudo guardar en la nube: " + (error?.message || error)); });
});


// Sincronización adicional de todos los almacenes locales de IndexedDB.
// Las tareas mantienen compatibilidad con la colección histórica "tareas".
const OTHER_STORES = ["projects", "notes", "habits", "healthEpisodes", "medicationIntakes", "trash", "sessions", "payments", "settings"];
const otherCols = Object.fromEntries(OTHER_STORES.map(name => [name, userCollection("sync_" + name)]));
const otherQueuedSnapshots = Object.create(null);
let otherReady = false;
let otherSyncQueue = Promise.resolve();

function recordKey(storeName, record) {
  const key = storeName === "settings" ? record?.key : record?.id;
  return key == null || key === "" ? null : String(key);
}
function cloudKey(key) { return encodeURIComponent(String(key)); }
function stableJSON(value) {
  if (Array.isArray(value)) return "[" + value.map(stableJSON).join(",") + "]";
  if (value && typeof value === "object") {
    return "{" + Object.keys(value).sort().map(k => JSON.stringify(k) + ":" + stableJSON(value[k])).join(",") + "}";
  }
  return JSON.stringify(value);
}
async function readStore(storeName) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(storeName, "readonly").objectStore(storeName).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}
async function putStoreRecord(storeName, record) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).put(record);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("No se pudo guardar " + storeName));
  });
}
async function deleteStoreRecord(storeName, key) {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, "readwrite");
    tx.objectStore(storeName).delete(storeName === "settings" ? key : key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error("No se pudo borrar " + storeName));
  });
}
async function uploadStoreRecord(storeName, record, forcedUpdatedAt = null) {
  const key = recordKey(storeName, record);
  if (key == null) return;
  const updatedAt = forcedUpdatedAt || record.updatedAt || record.createdAt || nowIso();
  const normalized = { ...record, updatedAt };
  await setDoc(userDoc("sync_" + storeName, cloudKey(key)), {
    key,
    record: normalized,
    updatedAt,
    deleted: false,
    schemaVersion: 1
  });
  // Normaliza la marca temporal local para que futuras modificaciones se puedan comparar.
  if (record.updatedAt !== updatedAt) await putStoreRecord(storeName, normalized);
}
async function applyStoreSnapshot(storeName, snapshot) {
  const localRecords = await readStore(storeName);
  const localByKey = new Map(localRecords.map(record => [recordKey(storeName, record), record]).filter(([key]) => key != null));
  for (const change of snapshot.docChanges()) {
    const data = change.doc.data() || {};
    const key = String(data.key ?? decodeURIComponent(change.doc.id));
    if (change.type === "removed") {
      // Solo se propagan eliminaciones explícitas (tombstones), nunca se infiere un borrado
      // por la desaparición de un documento durante una carga inicial.
      if (data.deleted) await deleteStoreRecord(storeName, key);
      continue;
    }
    const local = localByKey.get(key);
    if (data.deleted === true) {
      if (local && stamp(local.updatedAt) > stamp(data.updatedAt)) {
        await uploadStoreRecord(storeName, local);
      } else if (local) {
        await deleteStoreRecord(storeName, key);
      }
      continue;
    }
    const remote = data.record;
    if (!remote || typeof remote !== "object") continue;
    if (!local) {
      await putStoreRecord(storeName, remote);
      continue;
    }
    if (stableJSON(local) === stableJSON(remote)) continue;
    const localTime = stamp(local.updatedAt || local.createdAt);
    const remoteTime = stamp(data.updatedAt || remote.updatedAt || remote.createdAt);
    if (localTime >= remoteTime) {
      await uploadStoreRecord(storeName, local, nowIso());
    } else {
      const normalized = { ...remote, updatedAt: remote.updatedAt || data.updatedAt || nowIso() };
      await putStoreRecord(storeName, normalized);
    }
  }
  try {
    window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: storeName, remote: true } }));
  } catch (_) {}
}
async function syncStore(storeName) {
  const [localRecords, cloudSnapshot] = await Promise.all([readStore(storeName), getDocs(otherCols[storeName])]);
  const cloudByKey = new Map(cloudSnapshot.docs.map(item => [String(item.data()?.key ?? decodeURIComponent(item.id)), item]));
  const localKeys = new Set();
  for (const local of localRecords) {
    const key = recordKey(storeName, local);
    if (key == null) continue;
    localKeys.add(key);
    const remoteDoc = cloudByKey.get(key);
    if (!remoteDoc) {
      await uploadStoreRecord(storeName, local);
      continue;
    }
    const remoteData = remoteDoc.data() || {};
    if (remoteData.deleted === true) {
      if (stamp(local.updatedAt || local.createdAt) > stamp(remoteData.updatedAt)) {
        await uploadStoreRecord(storeName, local, nowIso());
      } else {
        await deleteStoreRecord(storeName, key);
      }
      continue;
    }
    const remote = remoteData.record;
    if (!remote || stableJSON(local) === stableJSON(remote)) continue;
    const localTime = stamp(local.updatedAt || local.createdAt);
    const remoteTime = stamp(remoteData.updatedAt || remote.updatedAt || remote.createdAt);
    if (localTime >= remoteTime) await uploadStoreRecord(storeName, local, nowIso());
    else await putStoreRecord(storeName, { ...remote, updatedAt: remote.updatedAt || remoteData.updatedAt || nowIso() });
  }
  // Solo se importan registros remotos que no existen localmente; no se borran datos
  // locales por el hecho de que una colección remota esté vacía.
  for (const remoteDoc of cloudSnapshot.docs) {
    const data = remoteDoc.data() || {};
    const key = String(data.key ?? decodeURIComponent(remoteDoc.id));
    if (localKeys.has(key)) continue;
    if (data.deleted === true) continue;
    if (data.record && typeof data.record === "object") await putStoreRecord(storeName, data.record);
  }
}
async function syncTrashTombstones() {
  const entries = await readStore("trash");
  for (const entry of entries) {
    const storeName = entry?.collection;
    const key = entry?.recordId;
    if (!OTHER_STORES.includes(storeName) && storeName !== "tasks") continue;
    if (key == null) continue;
    const deletedAt = entry.deletedAt || nowIso();
    if (storeName === "tasks") {
      await deleteDoc(doc(cloudDb, "tareas", String(key)));
    } else {
      await setDoc(userDoc("sync_" + storeName, cloudKey(key)), {
        key: String(key), deleted: true, updatedAt: deletedAt, schemaVersion: 1
      });
    }
  }
}
for (const storeName of OTHER_STORES) {
  onSnapshot(otherCols[storeName], snapshot => {
    if (!otherReady) {
      otherQueuedSnapshots[storeName] = snapshot;
      return;
    }
    otherSyncQueue = otherSyncQueue
      .then(() => applyStoreSnapshot(storeName, snapshot))
      .catch(error => {
        console.error("Error de sincronización en " + storeName + ":", error);
        setSyncStatus("error", "Firebase (" + storeName + "): " + (error?.message || error));
      });
  }, error => {
    console.error("Error de escucha Firebase en " + storeName + ":", error);
    setSyncStatus("error", "Firebase (" + storeName + "): " + (error?.message || error));
  });
}
window.addEventListener("papelegruba:data-change", event => {
  if (applyingRemote || !otherReady) return;
  const collectionName = String(event.detail?.collection || "");
  const requested = collectionName === "restore" || collectionName === "drive-sync"
    ? OTHER_STORES.slice()
    : collectionName.split(",").filter(name => OTHER_STORES.includes(name));
  if (collectionName === "trash" && !requested.includes("trash")) requested.push("trash");
  if (!requested.length) return;
  otherSyncQueue = otherSyncQueue.then(async () => {
    for (const storeName of requested) await syncStore(storeName);
    if (requested.includes("trash")) await syncTrashTombstones();
  }).catch(error => {
    console.error("No se pudo sincronizar todos los datos:", error);
    setSyncStatus("error", "No se pudieron sincronizar todos los datos: " + (error?.message || error));
  });
});

// El cronómetro vive en localStorage, no en IndexedDB; se sincroniza por separado.
const timerDoc = userDoc("sync_activeTimer", "current");
let timerSyncReady = false;
let timerQueuedSnapshot = null;
async function syncTimerFromCloud(snapshot) {
  const remote = snapshot?.exists() ? snapshot.data() : null;
  const localRaw = localStorage.getItem("papelegruba-timer-active");
  let local = null;
  try { local = localRaw ? JSON.parse(localRaw) : null; } catch (_) {}
  if (!remote) {
    if (local && timerSyncReady) await setDoc(timerDoc, { record: local, updatedAt: local.startedAt || nowIso(), deleted: false });
    return;
  }
  if (remote.deleted) {
    if (!local || stamp(local.startedAt) <= stamp(remote.updatedAt)) localStorage.removeItem("papelegruba-timer-active");
    return;
  }
  if (!remote.record) return;
  if (!local || stamp(remote.updatedAt || remote.record.startedAt) > stamp(local.startedAt)) {
    localStorage.setItem("papelegruba-timer-active", JSON.stringify(remote.record));
    window.dispatchEvent(new CustomEvent("papelegruba:timer-sync"));
  } else if (local && stamp(local.startedAt) > stamp(remote.updatedAt || remote.record.startedAt)) {
    await setDoc(timerDoc, { record: local, updatedAt: local.startedAt || nowIso(), deleted: false });
  }
}
onSnapshot(timerDoc, snapshot => {
  if (!timerSyncReady) { timerQueuedSnapshot = snapshot; return; }
  syncTimerFromCloud(snapshot).catch(error => {
    console.error("Error al sincronizar el cronómetro:", error);
    setSyncStatus("error", "Firebase (cronómetro): " + (error?.message || error));
  });
}, error => {
  console.error("Error de escucha del cronómetro:", error);
  setSyncStatus("error", "Firebase (cronómetro): " + (error?.message || error));
});
window.addEventListener("papelegruba:data-change", event => {
  if (event.detail?.collection !== "activeTimer" || !otherReady) return;
  const localRaw = localStorage.getItem("papelegruba-timer-active");
  let record = null;
  try { record = localRaw ? JSON.parse(localRaw) : null; } catch (_) {}
  setDoc(timerDoc, { record, updatedAt: nowIso(), deleted: !record })
    .catch(error => {
      console.error("No se pudo sincronizar el cronómetro:", error);
      setSyncStatus("error", "Firebase (cronómetro): " + (error?.message || error));
    });
});

async function initializeOtherStores() {
  for (const storeName of OTHER_STORES) await syncStore(storeName);
  const timerSnapshot = await getDocs(userCollection("sync_activeTimer"));
  const currentTimer = timerSnapshot.docs.find(item => item.id === "current");
  if (currentTimer) await syncTimerFromCloud({ exists: () => true, data: () => currentTimer.data() });
  else {
    const localTimerRaw = localStorage.getItem("papelegruba-timer-active");
    if (localTimerRaw) {
      try { const localTimer = JSON.parse(localTimerRaw); if (localTimer) await setDoc(timerDoc, { record: localTimer, updatedAt: localTimer.startedAt || nowIso(), deleted: false }); } catch (_) {}
    }
  }
  timerSyncReady = true;
  if (timerQueuedSnapshot) { const snapshot = timerQueuedSnapshot; timerQueuedSnapshot = null; await syncTimerFromCloud(snapshot); }
  otherReady = true;
  for (const storeName of OTHER_STORES) {
    if (otherQueuedSnapshots[storeName]) {
      const snapshot = otherQueuedSnapshots[storeName];
      delete otherQueuedSnapshots[storeName];
      await applyStoreSnapshot(storeName, snapshot);
    }
  }
  await syncTrashTombstones();
}

export async function subirTareasLocalesIniciales() {
  if (initializing || ready) return;
  initializing = true;
  setSyncStatus("connecting", "Papelegruba · comprobando conexión con Firebase…");
  try {
    await initDB();
    await initializeOtherStores();
    const [localTasks, cloudSnapshot] = await Promise.all([getAllTasks(), getDocs(tareasCol)]);
    const cloudById = new Map(cloudSnapshot.docs.map(item => [item.id, item]));
    const localById = new Map(localTasks.filter(task => task?.id).map(task => [String(task.id), task]));

    // Primero sube las tareas locales que no existen en la nube. Si existen en ambos
    // lados, conserva la versión más reciente. No limpia ninguna colección.
    for (const local of localTasks) {
      if (!local?.id) continue;
      const id = String(local.id);
      const remoteDoc = cloudById.get(id);
      if (!remoteDoc) {
        await uploadTask(local);
        continue;
      }
      const remote = normalizeCloudTask(id, remoteDoc.data());
      if (stamp(local.updatedAt) >= stamp(remote.updatedAt)) await uploadTask(local);
      else await writeLocalFromCloud(remote);
    }

    for (const remoteDoc of cloudSnapshot.docs) {
      if (localById.has(remoteDoc.id)) continue;
      await applyRemoteDocument(remoteDoc);
    }

    ready = true;
    setSyncStatus("connected", "Sesión: " + signedInUser.email + " · sincronización de la agenda activa");
    if (queuedSnapshot) {
      const latest = queuedSnapshot;
      queuedSnapshot = null;
      await applySnapshot(latest, true);
    }
  } catch (error) {
    setSyncStatus("error", "Firebase no sincroniza: " + (error?.message || error));
    throw error;
  } finally {
    initializing = false;
  }
}
