import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
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
const cloudDb = getFirestore(app);
const tareasCol = collection(cloudDb, "tareas");

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
        await deleteDoc(doc(cloudDb, "tareas", String(remote.id)));
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
  await setDoc(doc(cloudDb, "tareas", fullTask.id), {
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
    .catch(error => console.error("Error al aplicar cambios de Firebase:", error));
}, error => {
  console.error("Error de escucha de Firebase:", error);
});

window.addEventListener("papelegruba:task-change", event => {
  if (applyingRemote || !ready) return;
  const { action, task } = event.detail || {};
  if (!task?.id) return;
  snapshotQueue = snapshotQueue.then(async () => {
    if (action === "delete") await deleteDoc(doc(cloudDb, "tareas", String(task.id)));
    else if (action === "upsert") await uploadTask(task);
  }).catch(error => console.error("No se pudo sincronizar el cambio con Firebase:", error));
});

export async function subirTareasLocalesIniciales() {
  if (initializing || ready) return;
  initializing = true;
  try {
    await initDB();
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
    if (queuedSnapshot) {
      const latest = queuedSnapshot;
      queuedSnapshot = null;
      await applySnapshot(latest, true);
    }
  } finally {
    initializing = false;
  }
}
