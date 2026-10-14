const STORAGE_KEY = "papelegruba-timer-active";
let listeners = [];

export function getActiveTimer() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

export function startTimer({ categoryId = null, taskId = null, taskTitle = null } = {}) {
  const timer = {
    running: true,
    startedAt: new Date().toISOString(),
    categoryId,
    taskId,
    taskTitle
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(timer));
  try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "activeTimer" } })); } catch (_) {}
  notify();
  return timer;
}

export function stopTimer() {
  localStorage.removeItem(STORAGE_KEY);
  try { window.dispatchEvent(new CustomEvent("papelegruba:data-change", { detail: { collection: "activeTimer" } })); } catch (_) {}
  notify();
  return null;
}

export function getElapsedMs() {
  const t = getActiveTimer();
  if (!t || !t.running) return 0;
  return Date.now() - new Date(t.startedAt).getTime();
}

export function formatElapsed(ms) {
  const totalSecs = Math.floor(ms / 1000);
  const h = String(Math.floor(totalSecs / 3600)).padStart(2, "0");
  const m = String(Math.floor((totalSecs % 3600) / 60)).padStart(2, "0");
  const s = String(totalSecs % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export function onChange(fn) {
  listeners.push(fn);
  return () => { listeners = listeners.filter(l => l !== fn); };
}

function notify() {
  listeners.forEach(fn => { try { fn(); } catch (_) {} });
}

setInterval(notify, 1000);

// Refrescar la interfaz cuando Drive restaura el cronómetro o cuando cambia en otra pestaña.
window.addEventListener("papelegruba:timer-sync", notify);
window.addEventListener("storage", event => {
  if (event.key === STORAGE_KEY) notify();
});
