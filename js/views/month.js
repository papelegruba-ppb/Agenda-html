import { monthMatrix, iso, addMonths, isSameDay } from "../dates.js";
import { getTasksInRange } from "../db.js";
import { getCategory } from "../categories.js";
import { butterflySvg } from "../ui/butterfly.js";

let cursor = new Date();

export async function renderMonth(root) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();

  const grid = monthMatrix(year, month);
  const firstCell = grid[0][0];
  const lastCell = grid[5][6];
  const fromStr = iso(firstCell);
  const toStr = iso(lastCell);

  const tasks = (await getTasksInRange(fromStr, toStr)).filter(t => t.isChecklist !== true);
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
                  return `<span class="butterfly type-${cat.id}"${t.done ? ' style="opacity:.4"' : ""}>${butterflySvg()}</span>`;
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
