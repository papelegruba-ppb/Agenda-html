import { getTasksInRange } from "../db.js";
import { iso, addDays } from "../dates.js";

let yearCursor = new Date().getFullYear();

export async function renderYear(root) {
  const start = new Date(yearCursor, 0, 1);
  const end = new Date(yearCursor, 11, 31);
  const tasks = await getTasksInRange(iso(start), iso(end));
  const dates = new Set(tasks.filter(t => t.date && !t.isChecklist).map(t => t.date));
  const today = iso(new Date());
  const months = Array.from({length:12}, (_,m) => {
    const first = new Date(yearCursor, m, 1);
    const offset = (first.getDay() + 6) % 7;
    const daysInMonth = new Date(yearCursor, m + 1, 0).getDate();
    const cells = [];
    for (let i=0;i<offset;i++) cells.push('<span class="year-day empty-day"></span>');
    for (let d=1;d<=daysInMonth;d++) {
      const date = iso(new Date(yearCursor,m,d));
      const hasTask = dates.has(date);
      cells.push(`<span class="year-day ${date===today?'is-today':''} ${hasTask?'has-events':''}" title="${hasTask?'Hay eventos':''}">${d}</span>`);
    }
    return `<section class="year-month"><h3>${first.toLocaleDateString('es-ES',{month:'long'})}</h3><div class="year-weekdays">${['L','M','X','J','V','S','D'].map(x=>`<span>${x}</span>`).join('')}</div><div class="year-grid">${cells.join('')}</div></section>`;
  });
  root.innerHTML = `<section class="year-view"><header class="year-head"><button class="nav-prev" aria-label="Año anterior">‹</button><h2>Calendario ${yearCursor}</h2><button class="nav-next" aria-label="Año siguiente">›</button></header><div class="year-months">${months.join('')}</div></section>`;
  root.querySelector('.nav-prev').onclick=()=>{yearCursor--;renderYear(root);};
  root.querySelector('.nav-next').onclick=()=>{yearCursor++;renderYear(root);};
}
