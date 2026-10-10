import { startOfWeek, addDays, iso, isSameDay } from "../dates.js";
import { getTasksInRange } from "../db.js";
import { getCategory } from "../categories.js";

let cursor = new Date();

export async function renderWeek(root) {
  const start = startOfWeek(cursor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const fromStr = iso(days[0]);
  const toStr = iso(days[6]);
  const tasks = await getTasksInRange(fromStr, toStr);

  const byDate = new Map();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }
  for (const list of byDate.values()) {
    list.sort((a, b) => {
      if (a.type !== b.type) return a.type === "medical" ? -1 : 1;
      return (a.time || "99:99").localeCompare(b.time || "99:99");
    });
  }

  const today = new Date();
  const monthName = start.toLocaleDateString("es-ES", { month: "long", year: "numeric" });

  root.innerHTML = `
    <div class="week-view">
      <div class="week-head">
        <button class="nav-prev">‹</button>
        <h2 class="week-title">Semana del ${start.getDate()} de ${monthName}</h2>
        <button class="nav-next">›</button>
      </div>
      <div class="week-columns">
        ${days.map(d => {
          const key = iso(d);
          const list = byDate.get(key) || [];
          const isToday = isSameDay(d, today);
          return `
            <section class="week-col ${isToday ? "today" : ""}" data-date="${key}">
              <header>
                <span class="wd">${d.toLocaleDateString("es-ES",{weekday:"short"})}</span>
                <span class="dn">${d.getDate()}</span>
              </header>
              <ul class="week-items">
                ${list.map(t => {
                  const cat = getCategory(t.type);
                  return `
                    <li class="wi type-${cat.id} ${t.done ? "done" : ""}"
                        data-task-id="${t.id}">
                      ${t.time ? `<time>${t.time}</time>` : ""}
                      <span class="wi-title">${escapeHtml(t.title)}</span>
                      ${t.specialty ? `<small>${escapeHtml(t.specialty)}</small>` : ""}
                    </li>
                  `;
                }).join("")}
              </ul>
            </section>
          `;
        }).join("")}
      </div>
    </div>
  `;

  root.querySelector(".nav-prev").onclick = () => { cursor = addDays(cursor, -7); renderWeek(root); };
  root.querySelector(".nav-next").onclick = () => { cursor = addDays(cursor, 7); renderWeek(root); };
  root.querySelectorAll(".week-col").forEach(col => {
    col.addEventListener("click", e => {
      if (e.target.closest(".wi")) return;
      document.dispatchEvent(new CustomEvent("navigate-day", { detail: { date: col.dataset.date } }));
    });
  });
}

function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }