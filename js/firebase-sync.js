// =====================================================================
// ARCHIVO DESACTIVADO TEMPORALMENTE PARA MIGRACIÓN A FIREBASE
// Ya no sincronizamos con Google Calendar/Tasks de forma automática.
// Evita que la app pida la cuenta de Google al arrancar o duplique tareas.
// =====================================================================

export function installGoogleSyncListeners() {
  // Desactivado para evitar que escuche eventos locales y los envíe a Google
}

export async function syncGoogleData() {
  return { skipped: true, reason: "Google sync desactivado por migración a Firebase" };
}

export async function trySyncOnOpen() {
  // Desactivado: impide que pida la cuenta de Google cada vez que se abre la app
  return null;
}
