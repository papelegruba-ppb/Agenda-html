import { monthMatrix, iso, addMonths, isSameDay } from "../dates.js";
import { getTasksInRange } from "../db.js";
import { getCategory } from "../categories.js";

let cursor = new Date();

// Mariposa SVG mejorada — de frente, alas simétricas y cuerpo central
function butterflySvg(size = 12) {
  return `
    <svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true">
      <path class="wing"
        d="M12 6 C9 2 3 2 2 7 C1 12 6 14 10 13 C7 15 4 19 8 21 C11 22 12 18 12 15 C12 18 13 22 16 21 C20 19 17 15 14 13 C18 14 23 12 22 7 C21 2 15 2 12 6 Z"/>
      <line x1="12" y1="6" x2="12" y2="15"
        stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
    </svg>
  `;
}

export async function renderMonth(root) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const grid = monthMatrix(year, month);
  const firstCell = grid[0][0];
  const lastCell = grid[5][6];
  const fromStr = iso(firstCell);
  const toStr = iso(lastCell);

  const tasks = await getTasksInRange(fromStr, toStr);
  const byDate = new Map();
  for (const t of tasks) {
    if (!byDate.has(t.date)) byDate.set(t.date, []);
    byDate.get(t.date).push(t);
  }

  const today = new Date();
  const monthName = cursor.toLocaleDateString("es-ES", { month: "long", year: "numeric" });
  const weekdayLabels = ["L", "M", "X", "J", "V", "S", "D"];

  root.innerHTML = `
    <div class="month-view">
      <div class="month-head">
        <button class="nav-prev" aria-label="Mes anterior">‹</button>
        <h2 class="month-title">${monthName}</h2>
        <button class="nav-next" aria-label="Mes siguiente">›</button>
      </div>
      <div class="month-weekdays">
        ${weekdayLabels.map(l => `<span>${l}</span>`).join("")}
      </div>
      <div class="month-grid">
        ${grid.flat().map(d => {
          const key = iso(d);
          const inMonth = d.getMonth() === month;
          const isToday = isSameDay(d, today);
          const dayTasks = byDate.get(key) || [];
          const doneCount = dayTasks.filter(t => t.done).length;
          const total = dayTasks.length;
          return `
            <button class="day-cell ${inMonth ? "" : "out"} ${isToday ? "today" : ""}"
                    data-date="${key}">
              <span class="day-num">${d.getDate()}</span>
              ${total ? `<span class="day-dots">
                ${dayTasks.slice(0, 4).map(t => {
                  const cat = getCategory(t.type);
                  return `<span class="butterfly type-${cat.id}">${butterflySvg(11)}</span>`;
                }).join("")}
              </span>` : ""}
              ${total ? `<span class="day-count">${doneCount}/${total}</span>` : ""}
            </button>
          `;
        }).join("")}
      </div>
    </div>
  `;

  root.querySelector(".nav-prev").onclick = () => {
    cursor = addMonths(cursor, -1);
    renderMonth(root);
  };
  root.querySelector(".nav-next").onclick = () => {
    cursor = addMonths(cursor, 1);
    renderMonth(root);
  };
  root.querySelectorAll(".day-cell").forEach(btn => {
    btn.onclick = () => {
      document.dispatchEvent(
        new CustomEvent("navigate-day", { detail: { date: btn.dataset.date } })
      );
    };
  });
}
