const CACHE = "papelegruba-v19";
const ASSETS = [
  "./", "./index.html", "./styles.css", "./app.js", "./manifest.json",
  "./js/db.js", "./js/dates.js", "./js/categories.js", "./js/google-colors.js", "./js/google.js", "./js/google-sync.js", "./js/drive-sync.js",
  "./js/views/year.js", "./js/views/month.js", "./js/views/week.js", "./js/views/day.js",
  "./js/views/checklist.js", "./js/views/timer.js", "./js/views/projects.js",
  "./js/views/habits.js", "./js/views/medical.js", "./js/views/health.js", "./js/views/settings.js",
  "./js/ui/modal.js", "./js/ui/category-picker.js", "./js/ui/task-form.js", "./js/ui/project-form.js",
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);

  if (url.hostname.endsWith("googleapis.com") || url.hostname === "accounts.google.com") return;

  if (e.request.destination === "font") {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }))
    );
    return;
  }

  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
