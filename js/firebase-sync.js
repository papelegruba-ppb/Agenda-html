import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { getAllTasks, deleteTaskLocalOnly } from "./db.js";

const firebaseConfig = {
  apiKey: "AIzaSyAfwZwOB90JNgQ1hewbTGwVsyrDK-GYvPg",
  authDomain: "agenda-html-511217-90781.firebaseapp.com",
  projectId: "agenda-html-511217-90781",
  storageBucket: "agenda-html-511217-90781.firebasestorage.app",
  messagingSenderId: "313777943876",
  appId: "1:313777943876:web:83677168f68b8c62e41311"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const tareasCol = collection(db, "tareas");

let isSyncingFromCloud = false;

// 1. ESCUCHAR CAMBIOS DESDE LA NUBE (Instantáneo)
onSnapshot(tareasCol, (snapshot) => {
  isSyncingFromCloud = true;
  snapshot.docChanges().forEach(async (change) => {
    const data = change.doc.data();
    const id = change.doc.id;

    if (change.type === "added" || change.type === "modified") {
      // Actualizamos el IndexedDB local (esto lo hace tu db.js)
      // Usamos updateTask de tu db.js para que se refleje en la interfaz
      const { updateTask } = await import("./db.js");
      try {
        await updateTask(id, data);
      } catch (e) {
        // Si la tarea no existe localmente, la importamos (esto es un parche rápido)
        console.log("Tarea nueva de la nube, recargando...", data);
      }
    }
    if (change.type === "removed") {
      await deleteTaskLocalOnly(id);
    }
  });
  isSyncingFromCloud = false;
});

// 2. ESCUCHAR CAMBIOS LOCALES (Para enviarlos a la nube)
window.addEventListener("papelegruba:task-change", async (e) => {
  if (isSyncingFromCloud) return; // Evitar bucles infinitos
  
  const { action, task } = e.detail;
  
  if (action === "upsert") {
    // Enviamos la tarea a Firestore. Usamos setDoc con el mismo ID para que no se duplique.
    await setDoc(doc(db, "tareas", task.id), {
      titulo: task.title,
      fecha: task.date,
      hora: task.time,
      notas: task.notes,
      tipo: task.type,
      gcalEventId: task.gcalEventId || null, // Para que no se dupliquen en Calendar
      updatedAt: new Date().toISOString()
    }, { merge: true });
  } 
  else if (action === "delete") {
    await deleteDoc(doc(db, "tareas", task.id));
  }
});

// 3. AL ARRANCAR, SUBIR LO QUE YA TENGAS EN LOCAL (Solo la primera vez)
export async function subirTareasLocalesIniciales() {
  const tareasLocales = await getAllTasks();
  if (tareasLocales.length === 0) return;
  
  // Verificamos si la nube está vacía para no sobreescribir
  const nubeSnapshot = await getDocs(tareasCol);
  if (nubeSnapshot.size === 0) {
    console.log("Subiendo tareas locales a Firebase por primera vez...");
    for (const t of tareasLocales) {
      await setDoc(doc(db, "tareas", t.id), {
        titulo: t.title,
        fecha: t.date,
        hora: t.time,
        notas: t.notes,
        tipo: t.type,
        gcalEventId: t.gcalEventId || null,
        updatedAt: new Date().toISOString()
      });
    }
  }
}
