// =====================================================================
// ARCHIVO DESACTIVADO TEMPORALMENTE PARA MIGRACIÓN A FIREBASE
// Evita que la app pida la cuenta de Google al arrancar.
// =====================================================================

export async function initGoogle() { return; }
export async function requestToken() { return null; }
export function isConnected() { return false; }
export async function getStoredEmail() { return null; }
export function disconnect() { return; }

// Funciones de Calendar y Tasks (vacías para que no den error)
export async function fetchUserEmail() { return null; }
export async function listEvents() { return { items: [] }; }
export async function pingCalendar() { return { items: [] }; }
export async function importAllEvents() { return []; }
export function gcalEventToTask() { return {}; }
export async function listGoogleTasks() { return []; }
export async function createGoogleTask() { return {}; }
export async function updateGoogleTask() { return {}; }
export async function deleteGoogleTask() { return {}; }
export async function createCalendarEvent() { return {}; }
export async function updateCalendarEvent() { return {}; }
export async function deleteCalendarEvent() { return {}; }
export async function getCalendarEvent() { return null; }

// Funciones de Drive (vacías)
export async function uploadBackupToDrive() { return {}; }
export async function listBackupsOnDrive() { return []; }
export async function downloadBackupFromDrive() { return "{}"; }
