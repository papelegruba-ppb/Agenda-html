import test from "node:test";
import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  initDB, getAllTasks, getAllHabits, getAllHealthEpisodes, getAllMedicationIntakes, getTrash, restoreTrashItem,
  addHealthEpisode, addMedicationIntake, updateHealthEpisode, updateMedicationIntake,
  deleteHealthEpisode, deleteMedicationIntake, convertTaskToHabit, mergeBackupData,
  getAllProjects, getAllNotes, getAllSessions, getAllPayments, getAllSettings
} from "../js/db.js";

function openLegacyDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("papelegruba", 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      const taskStore = db.createObjectStore("tasks", { keyPath: "id" });
      taskStore.createIndex("by_date", "date");
      taskStore.createIndex("by_type", "type");
      taskStore.createIndex("by_date_type", ["date", "type"]);
      db.createObjectStore("projects", { keyPath: "id" });
      db.createObjectStore("notes", { keyPath: "id" });
      db.createObjectStore("habits", { keyPath: "id" });
      const sessions = db.createObjectStore("sessions", { keyPath: "id" });
      sessions.createIndex("by_date", "date");
      sessions.createIndex("by_category", "categoryId");
      const payments = db.createObjectStore("payments", { keyPath: "id" });
      payments.createIndex("by_date", "date");
      payments.createIndex("by_category", "categoryId");
      db.createObjectStore("settings", { keyPath: "key" });
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction(["tasks", "habits", "settings"], "readwrite");
      tx.objectStore("tasks").put({ id: "check-1", title: "Tarea de checklist", type: "personal", isChecklist: true, date: "", done: false });
      tx.objectStore("habits").put({ id: "habit-existing", name: "Hábito existente", days: [0,1,2,3,4,5,6] });
      tx.objectStore("settings").put({ key: "lastSync", value: "valor-preservado" });
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

test("migra v2 a v4 sin borrar datos y permite CRUD, conversión idempotente y backup completo", async () => {
  await new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase("papelegruba");
    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("La base de datos quedó bloqueada"));
  });
  await openLegacyDatabase();

  const db = await initDB();
  assert.equal(db.version, 4);
  assert.ok(db.objectStoreNames.contains("trash"));
  assert.ok(db.objectStoreNames.contains("healthEpisodes"));
  assert.ok(db.objectStoreNames.contains("medicationIntakes"));
  assert.equal((await getAllTasks()).length, 1);
  assert.equal((await getAllHabits()).length, 1);
  assert.equal((await getAllSettings())[0].value, "valor-preservado");

  const episode = await addHealthEpisode({ type: "Migraña", title: "Prueba", startAt: "2026-10-12T09:00" });
  await updateHealthEpisode(episode.id, { endAt: "2026-10-12T10:00", intensity: 7 });
  const savedEpisode = (await getAllHealthEpisodes()).find(item => item.id === episode.id);
  assert.equal(savedEpisode.endAt, "2026-10-12T10:00");
  assert.equal(savedEpisode.intensity, 7);

  const intake = await addMedicationIntake({ medication: "Medicamento de prueba", dose: "1 unidad", takenAt: "2026-10-12T09:10", episodeId: episode.id });
  await updateMedicationIntake(intake.id, { effect: "Alivio" });
  assert.equal((await getAllMedicationIntakes()).find(item => item.id === intake.id).effect, "Alivio");

  const firstHabit = await convertTaskToHabit("check-1");
  const secondHabit = await convertTaskToHabit("check-1");
  assert.equal(firstHabit.id, secondHabit.id);
  assert.equal((await getAllHabits()).filter(item => item.sourceTaskId === "check-1").length, 1);
  assert.equal((await getAllTasks()).find(item => item.id === "check-1").done, false);

  const imported = await mergeBackupData({
    tasks: [{ id: "backup-task", title: "Tarea respaldada", isChecklist: true, date: "" }],
    habits: [{ id: "backup-habit", title: "Hábito respaldado", sourceTaskId: "backup-task" }],
    projects: [{ id: "backup-project", name: "Proyecto respaldado" }],
    notes: [{ id: "backup-note", title: "Nota respaldada" }],
    sessions: [{ id: "backup-session", date: "2026-10-12", amount: 0 }],
    payments: [{ id: "backup-payment", date: "2026-10-12", amount: 0 }],
    settings: [{ key: "backupSetting", value: true }],
    healthEpisodes: [{ id: "backup-episode", type: "Otros", startAt: "2026-10-12T11:00" }],
    medicationIntakes: [{ id: "backup-intake", medication: "Medicamento respaldado", takenAt: "2026-10-12T11:10" }]
  });
  assert.equal(imported, 9);
  assert.ok((await getAllTasks()).some(item => item.id === "check-1"));
  assert.ok((await getAllTasks()).some(item => item.id === "backup-task"));
  assert.ok((await getAllHabits()).some(item => item.id === "habit-existing"));
  assert.ok((await getAllProjects()).some(item => item.id === "backup-project"));
  assert.ok((await getAllNotes()).some(item => item.id === "backup-note"));
  assert.ok((await getAllSessions()).some(item => item.id === "backup-session"));
  assert.ok((await getAllPayments()).some(item => item.id === "backup-payment"));
  assert.ok((await getAllSettings()).some(item => item.key === "backupSetting"));
  assert.ok((await getAllHealthEpisodes()).some(item => item.id === "backup-episode"));
  assert.ok((await getAllMedicationIntakes()).some(item => item.id === "backup-intake"));

  await deleteMedicationIntake(intake.id);
  assert.ok((await getTrash()).some(item => item.collection === "medicationIntakes" && item.recordId === intake.id));
  await deleteHealthEpisode(episode.id);
  assert.ok(!(await getAllMedicationIntakes()).some(item => item.id === intake.id));
  assert.ok(!(await getAllHealthEpisodes()).some(item => item.id === episode.id));
});
