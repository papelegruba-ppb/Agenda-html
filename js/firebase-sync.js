import { initializeApp } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js";
import { getFirestore, collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from "https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js";
import { updateTask, deleteTaskLocalOnly, getAllTasks, addTask } from "./db.js";

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

onSnapshot(tareasCol, (snapshot) => {
  isSyncingFromCloud = true;
  snapshot.docChanges().forEach(async (change) => {
    const data = change.doc.data();
    const id = change.doc.id;

    if (change.type === "added" || change.type === "modified") {
      try {
        await updateTask(id, {
          title: data.titulo || "(sin título)", date: data.fecha || "", time: data.hora || "",
          notes: data.notas || "", type: data.tipo || "personal", gcalEventId: data.gcalEventId || null
        });
      } catch (e) {
        await addTask({ id: id, ...data });
      }
    }
    if (change.type === "removed") {
      await deleteTaskLocalOnly(id);
    }
  });
  isSyncingFromCloud = false;
});

window.addEventListener("papelegruba:task-change", async (e) => {
  if (isSyncingFromCloud) return;
  const { action, task } = e.detail;
  if (!task) return;
  
  if (action === "upsert") {
    await setDoc(doc(db, "tareas", task.id), {
      titulo: task.title, fecha: task.date, hora: task.time, notas: task.notes, tipo: task.type,
      gcalEventId: task.gcalEventId || null, updatedAt: new Date().toISOString()
    }, { merge: true });
  } 
  else if (action === "delete") {
    await deleteDoc(doc(db, "tareas", task.id));
  }
});

export async function subirTareasLocalesIniciales() {
  const tareasLocales = await getAllTasks();
  if (tareasLocales.length === 0) return;
  
  const nubeSnapshot = await getDocs(tareasCol);
  if (nubeSnapshot.size === 0) {
    console.log("Subiendo tareas locales a Firebase por primera vez...");
    for (const t of tareasLocales) {
      await setDoc(doc(db, "tareas", t.id), {
        titulo: t.title, fecha: t.date, hora: t.time, notas: t.notes, tipo: t.type,
        gcalEventId: t.gcalEventId || null, updatedAt: new Date().toISOString()
      });
    }
    console.log("¡Subida completada!");
  }
}
