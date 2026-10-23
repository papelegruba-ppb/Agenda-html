// =====================================================================
// ARCHIVO DESACTIVADO TEMPORALMENTE PARA MIGRACIÓN A FIREBASE
// Ya no sincronizamos con Google Calendar/Tasks de forma automática.
// =====================================================================

export function installGoogleSyncListeners() {
  // Desactivado
}

export async function syncGoogleData() {
  return { skipped: true, reason: "Google sync desactivado" };
}

export async function trySyncOnOpen() {
  // Desactivado: evita que pida la cuenta de Google al abrir la app
  return null;
}
