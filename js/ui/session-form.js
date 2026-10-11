import { openModal } from "./modal.js";
import { addSession, updateSession, deleteSession } from "../db.js";
import { CATEGORIES, getCategory } from "../categories.js";

export function openSessionForm(session, onSaved) {
  const isEdit = !!(session && session.id);

  const now = new Date();
  const defaults = {
    date: session?.date || now.toISOString().slice(0, 10),
    startTime: session?.startTime || now.toTimeString().slice(0, 5),
    endTime: session?.endTime || "",
    durationMinutes: session?.durationMinutes || 60,
    categoryId: session?.categoryId || "work-sye",
    taskId: session?.taskId || null,
    taskTitle: session?.taskTitle || null,
    description: session?.description || "",
    billable: session?.billable ?? getCategory(session?.categoryId || "work-sye").billable,
    rate: session?.rate ?? getCategory(session?.categoryId || "work-sye").rate,
    amount: session?.amount ?? 0,
    billed: session?.billed ?? false,
    adjustment: session?.adjustment ?? false
  };

  if (session?.startedAt && !isEdit) {
    const start = new Date(session.startedAt);
    const end = new Date();
    const mins = Math.max(1, Math.round((end - start) / 60000));
    defaults.date = start.toISOString().slice(0, 10);
    defaults.startTime = start.toTimeString().slice(0, 5);
    defaults.endTime = end.toTimeString().slice(0, 5);
    defaults.durationMinutes = mins;
    defaults.description = session.description || "";
    defaults.taskId = session.taskId || null;
    defaults.taskTitle = session.taskTitle || null;
    defaults.categoryId = session.categoryId || "work-sye";
    const cat = getCategory(defaults.categoryId);
    defaults.billable = cat.billable;
    defaults.rate = cat.rate;
  }

  const body = `
    <form class="session-form" autocomplete="off">
      <div class="fld-row">
        <label>Fecha
          <input name="date" type="date" value="${defaults.date}">
        </label>
        <label>Duración (min)
          <input name="durationMinutes" type="number" min="1" step="5" value="${defaults.durationMinutes}">
        </label>
      </div>

      <div class="fld-row">
        <label>Hora inicio
          <input name="startTime" type="time" value="${defaults.startTime}">
        </label>
        <label>Hora fin
          <input name="endTime" type="time" value="${defaults.endTime}">
        </label>
      </div>

      <div class="fld-block">
        <span class="fld-label">Categoría</span>
        <div class="cat-picker" id="sessionCatPicker">
          ${CATEGORIES.map(c => `
            <button type="button" class="cat-chip type-${c.id}"
                    role="radio"
                    aria-checked="${c.id === defaults.categoryId}"
                    data-cat="${c.id}">
              <span class="cat-dot" style="background:${c.color}"></span>
              <span>${c.label}</span>
            </button>
          `).join("")}
        </div>
      </div>

      ${defaults.taskTitle ? `
        <p class="hint small">Tarea asociada: <strong>${escapeHtml(defaults.taskTitle)}</strong></p>
      ` : ""}

      <label>Descripción
        <input name="description" value="${escapeAttr(defaults.description)}" placeholder="¿Qué has hecho?">
      </label>

      <div class="billable-row" id="billableRow">
        <label class="checkbox-label">
          <input type="checkbox" name="billable" ${defaults.billable ? "checked" : ""}>
          Facturable
        </label>
        <label>Tarifa €/h
          <input name="rate" type="number" step="0.5" min="0" value="${defaults.rate}">
        </label>
      </div>

      <label class="checkbox-label">
        <input type="checkbox" name="adjustment" ${defaults.adjustment ? "checked" : ""}>
        Es un ajuste (descuento)
      </label>
    </form>
  `;

  const actions = [
    { label: "Cancelar", onClick: ({ close }) => close() },
    { label: isEdit ? "Guardar" : "Añadir", primary: true, onClick: async ({ close, bodyEl }) => {
      const data = readForm(bodyEl);
      if (isEdit) {
        await updateSession(session.id, data);
      } else {
        await addSession(data);
      }
      close();
      onSaved?.();
    }}
  ];

  if (isEdit) {
    actions.unshift({
      label: "Borrar",
      onClick: async ({ close }) => {
        if (!confirm("¿Borrar esta sesión?")) return;
        await deleteSession(session.id);
        close();
        onSaved?.();
      }
    });
  }

  const { bodyEl, close } = openModal({
    title: isEdit ? "Editar sesión" : "Nueva sesión",
    body,
    actions
  });

  const picker = bodyEl.querySelector("#sessionCatPicker");
  picker.querySelectorAll(".cat-chip").forEach(chip => {
    chip.onclick = () => {
      picker.querySelectorAll(".cat-chip").forEach(c => c.setAttribute("aria-checked", "false"));
      chip.setAttribute("aria-checked", "true");
      const cat = getCategory(chip.dataset.cat);
      const billable = bodyEl.querySelector('[name="billable"]');
      const rate = bodyEl.querySelector('[name="rate"]');
      const row = bodyEl.querySelector("#billableRow");
      billable.checked = cat.billable;
      rate.value = cat.rate;
      row.style.display = cat.billable ? "" : "none";
    };
  });

  const row = bodyEl.querySelector("#billableRow");
  row.style.display = defaults.billable ? "" : "none";

  const durEl = bodyEl.querySelector('[name="durationMinutes"]');
  const startEl = bodyEl.querySelector('[name="startTime"]');
  const endEl = bodyEl.querySelector('[name="endTime"]');
  const syncFromTimes = () => {
    if (!startEl.value || !endEl.value) return;
    const [h1, m1] = startEl.value.split(":").map(Number);
    const [h2, m2] = endEl.value.split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins < 0) mins += 24 * 60;
    durEl.value = mins;
  };
  startEl.onchange = syncFromTimes;
  endEl.onchange = syncFromTimes;
}

function readForm(root) {
  const fd = new FormData(root.querySelector("form"));
  const catId = root.querySelector('.cat-chip[aria-checked="true"]')?.dataset.cat || "personal";
  const cat = getCategory(catId);
  const durationMinutes = Number(fd.get("durationMinutes")) || 0;
  const billable = fd.get("billable") === "on";
  const rate = Number(fd.get("rate")) || 0;
  const amount = billable ? (durationMinutes / 60) * rate : 0;

  return {
    date: fd.get("date") || null,
    startTime: fd.get("startTime") || "00:00",
    endTime: fd.get("endTime") || "00:00",
    durationMinutes,
    categoryId: catId,
    description: (fd.get("description") || "").toString(),
    billable,
    rate,
    amount,
    adjustment: fd.get("adjustment") === "on"
  };
}

function escapeAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
