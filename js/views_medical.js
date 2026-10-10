import { getAllTasks } from "../db.js";
import { openTaskForm } from "../ui/task-form.js";

export async function renderMedical(root) {
  const all = (await getAllTasks()).filter(t => t.type === "medical");
  const todayStr = new Date().toISOString().slice(0, 10);

  const upcoming = all
    .filter(t => t.date >= todayStr)
    .sort((a, b) => (a.date + (a.time || "99:99")).localeCompare(b.date + (b.time || "99:99")));

  const past = all
    .filter(t => t.date < todayStr)
    .sort((a, b) => (b.date + (b.time || "99:99")).localeCompare(a.date + (a.time || "99:99")));

  root.innerHTML = `
    <div class="medical-view">
      <div class="medical-head">
        <h2 class="view-title">Citas médicas</h2>
        <button class="btn-primary" id="newMedical">+ Nueva</button>
      </div>

      <h3 class="section-title">Próximas</h3>
      <ul class="medical-list">
        ${upcoming.length ? upcoming.map(renderItem).join("") : `<li class="empty">Sin citas próximas</li>`}
      </ul>

      <h3 class="section-title">Historial</h3>
      <ul class="medical-list past">
        ${past.length ? past.map(renderItem).join("") : `<li class="empty">Sin historial</li>`}
      </ul>
    </div>
  `;

  root.querySelector("#newMedical").onclick = () => {
    openTaskForm({ type: "medical", date: todayStr }, () => renderMedical(root));
  };

  root.querySelectorAll(".medical-item").forEach(li => {
    li.onclick = async () => {
      const task = all.find(t => t.id === li.dataset.taskId);
      openTaskForm(task, () => renderMedical(root));
    };
  });
}

function renderItem(t) {
  const d = new Date(t.date + "T00:00:00");
  const dateStr = d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
  const timeStr = t.time ? `${t.time}${t.endTime ? "–" + t.endTime : ""}` : "";
  const sub = [t.specialty, t.doctor, t.center].filter(Boolean).join(" · ");

  return `
    <li class="medical-item" data-task-id="${t.id}">
      <div class="mi-date">
        <strong>${dateStr}</strong>
        ${timeStr ? `<span>${timeStr}</span>` : ""}
      </div>
      <div class="mi-body">
        <span class="mi-title">${escapeHtml(t.title)}</span>
        ${sub ? `<small>${escapeHtml(sub)}</small>` : ""}
        ${t.address ? `<small>📍 ${escapeHtml(t.address)}</small>` : ""}
        ${t.phone ? `<small>📞 ${escapeHtml(t.phone)}</small>` : ""}
      </div>
    </li>
  `;
}

function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
