import { openModal } from "./modal.js";
import { renderCategoryPicker, bindCategoryPicker, getSelectedCategory } from "./category-picker.js";
import { addTask, updateTask } from "../db.js";
import { iso } from "../dates.js";
import { startTimer, getActiveTimer, stopTimer } from "../hours.js";

const MEDICAL_FIELDS = `
  <div class="med-only">
    <label>Especialidad
      <input name="specialty" list="specialties" placeholder="Traumatología, Dentista...">
      <datalist id="specialties">
        <option>Medicina general</option>
        <option>Traumatología</option>
        <option>Dentista</option>
        <option>Oftalmología</option>
        <option>Dermatología</option>
        <option>Ginecología</option>
        <option>Análisis</option>
        <option>Radiología</option>
        <option>Otorrino/TAC</option>
        <option>Cardiología</option>
        <option>Neurología</option>
      </datalist>
    </label>
    <label>Doctor/a
      <input name="doctor" placeholder="Dr./Dra. ...">
    </label>
    <label>Centro
      <input name="center" placeholder="Hospital, clínica, consulta...">
    </label>
    <label>Dirección
      <div style="display:flex; gap:.4rem; align-items:center;">
        <input name="address" placeholder="Empieza a escribir el lugar o la ciudad…" style="flex:1;" autocomplete="off" aria-autocomplete="list" aria-expanded="false"><div class="photon-suggestions" role="listbox" hidden></div>
        <button type="button" class="btn-maps" title="Buscar en Google Maps">🗺️</button>
      </div>
    </label>
    <label>Teléfono
      <input name="phone" type="tel" placeholder="+34 ...">
    </label>
    <label>Recordatorio
      <select name="reminderMinutes">
        <option value="">Sin recordatorio</option>
        <option value="15">15 minutos antes</option>
        <option value="60">1 hora antes</option>
        <option value="1440">1 día antes</option>
      </select>
    </label>
  </div>
`;

export function openTaskForm(task = null, onSaved) {
  const isEdit = !!(task && task.id);
  const today = iso(new Date());
  const t = task || {
    title: "", notes: "", date: task?.isChecklist ? "" : today, time: "", endTime: "",
    type: "personal", priority: 0, duration: 25
  };

  const activeTimer = getActiveTimer();
  const thisTaskIsTimer = activeTimer && t.id && activeTimer.taskId === t.id;

  const body = `
    <form class="task-form" autocomplete="off">\n      <input type="hidden" name="isChecklist" value="${t.isChecklist ? "true" : "false"}">
      <label class="fld-title">Título
        <input name="title" required value="${escapeAttr(t.title)}" placeholder="¿Qué hay que hacer?">
      </label>

      <div class="fld-row">
        <label>Fecha
          <input name="date" type="date" value="${t.isChecklist ? (t.date || "") : (t.date || today)}">
        </label>
        <label>Hora
          <input name="time" type="time" value="${t.time || ""}">
        </label>
      </div>

      <div class="fld-row med-only-hidden">
        <label>Hora fin
          <input name="endTime" type="time" value="${t.endTime || ""}">
        </label>
        <label>Duración (min)
          <input name="duration" type="number" min="5" step="5" value="${t.duration ?? 25}">
        </label>
      </div>

      <div class="fld-block">
        <span class="fld-label">Categoría</span>
        ${renderCategoryPicker(t.type)}
      </div>

      <label>Notas
        <textarea name="notes" rows="3" placeholder="Detalles, enlaces...">${escapeHtml(t.notes || "")}</textarea>
      </label>

      ${MEDICAL_FIELDS}
    </form>
  `;

  const actions = [
    { label: "Cancelar", onClick: ({ close }) => close() }
  ];

  // Botón "Empezar a contar" solo si la tarea ya existe (isEdit)
  if (isEdit) {
    if (thisTaskIsTimer) {
      actions.push({
        label: "⏹ Parar cronómetro",
        onClick: ({ close }) => {
          stopTimer();
          close();
          onSaved?.();
        }
      });
    } else {
      actions.push({
        label: "⏱ Empezar a contar",
        onClick: ({ close }) => {
          startTimer({
            taskId: t.id,
            taskTitle: t.title,
            categoryId: t.type || "personal"
          });
          close();
          onSaved?.();
        }
      });
    }
  }

  actions.push({
    label: isEdit ? "Guardar" : "Crear",
    primary: true,
    onClick: async ({ close, bodyEl }) => {
      try {
        const data = readTaskForm(bodyEl);
        if (!data.title) { alert("Falta el título"); return; }
        if (isEdit) {
          await updateTask(t.id, data);
        } else {
          await addTask(data);
        }
        close();
        onSaved?.();
      } catch (e) {
        alert("ERROR AL GUARDAR:\n\n" + (e.stack || e.message || e));
      }
    }
  });

  const { bodyEl, close } = openModal({
    title: isEdit ? "Editar tarea" : "Nueva tarea",
    body,
    actions
  });

  const picker = bodyEl.querySelector(".cat-picker");
  bindCategoryPicker(picker, (catId) => {
    const medOnly = bodyEl.querySelector(".med-only");
    if (medOnly) medOnly.style.display = catId === "medical" ? "" : "none";
    const medRow = bodyEl.querySelector(".med-only-hidden");
    if (medRow) medRow.style.display = catId === "medical" ? "" : "none";
  });

  const initialCat = t.type || "personal";
  const medOnly = bodyEl.querySelector(".med-only");
  const medRow = bodyEl.querySelector(".med-only-hidden");
  if (medOnly) medOnly.style.display = initialCat === "medical" ? "" : "none";
  if (medRow) medRow.style.display = initialCat === "medical" ? "" : "none";

  if (t.specialty) bodyEl.querySelector('[name="specialty"]').value = t.specialty;
  if (t.doctor)    bodyEl.querySelector('[name="doctor"]').value = t.doctor;
  if (t.center)    bodyEl.querySelector('[name="center"]').value = t.center;
  if (t.address)   bodyEl.querySelector('[name="address"]').value = t.address;
  if (t.phone)     bodyEl.querySelector('[name="phone"]').value = t.phone;
  if (t.reminderMinutes) bodyEl.querySelector('[name="reminderMinutes"]').value = String(t.reminderMinutes);

  // Autocompletado de direcciones con Photon (OpenStreetMap). Consulta solo tras 3 caracteres y espera a que el usuario deje de escribir.
  const addressInput = bodyEl.querySelector('[name="address"]');
  const suggestions = bodyEl.querySelector('.photon-suggestions');
  let photonTimer = null;
  let photonController = null;
  let photonRequest = 0;
  const hideSuggestions = () => { if (suggestions) { suggestions.hidden = true; suggestions.innerHTML = ''; } addressInput?.setAttribute('aria-expanded', 'false'); };
  if (addressInput && suggestions) {
    addressInput.addEventListener('input', () => {
      clearTimeout(photonTimer);
      if (photonController) photonController.abort();
      const query = addressInput.value.trim();
      if (query.length < 3) { hideSuggestions(); return; }
      photonTimer = setTimeout(async () => {
        const requestId = ++photonRequest;
        photonController = new AbortController();
        try {
          const url = 'https://photon.komoot.io/api/?q=' + encodeURIComponent(query) + '&limit=5&lang=es';
          const response = await fetch(url, { signal: photonController.signal, headers: { 'Accept': 'application/json' } });
          if (!response.ok) throw new Error('Photon no disponible');
          const result = await response.json();
          if (requestId !== photonRequest || document.activeElement !== addressInput) return;
          const features = (result.features || []).filter(f => f.properties);
          suggestions.innerHTML = '';
          features.forEach(feature => {
            const p = feature.properties;
            const label = [p.name, p.street && p.housenumber ? `${p.street} ${p.housenumber}` : p.street, p.postcode, p.city || p.town || p.village, p.state, p.country].filter(Boolean).filter((v,i,a)=>a.indexOf(v)===i).join(', ');
            if (!label) return;
            const button = document.createElement('button');
            button.type = 'button'; button.className = 'photon-suggestion'; button.setAttribute('role','option'); button.textContent = label;
            button.addEventListener('click', () => { addressInput.value = label; hideSuggestions(); addressInput.dispatchEvent(new Event('change', { bubbles: true })); });
            suggestions.appendChild(button);
          });
          if (!suggestions.children.length) {
            const empty = document.createElement('div'); empty.className = 'photon-empty'; empty.textContent = 'No se encontraron sugerencias'; suggestions.appendChild(empty);
          }
          suggestions.hidden = false; addressInput.setAttribute('aria-expanded', 'true');
        } catch (error) { if (error.name !== 'AbortError') hideSuggestions(); }
      }, 350);
    });
    addressInput.addEventListener('keydown', e => { if (e.key === 'Escape') hideSuggestions(); });
    document.addEventListener('click', e => { if (!suggestions.contains(e.target) && e.target !== addressInput) hideSuggestions(); }, { once: false });
  }

  bodyEl.querySelector(".btn-maps")?.addEventListener("click", () => {
    const dir = bodyEl.querySelector('[name="address"]').value.trim();
    if (!dir) { alert("Escribe una dirección primero."); return; }
    const url = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`;
    window.open(url, "_blank");
  });

  setTimeout(() => bodyEl.querySelector('[name="title"]')?.focus(), 100);
}

function readTaskForm(root) {
  const form = root.querySelector("form");
  const fd = new FormData(form);
  const cat = root.querySelector('.cat-chip[aria-checked="true"]')?.dataset.cat || "personal";
  const data = {
    title: (fd.get("title") || "").toString().trim(),
    notes: (fd.get("notes") || "").toString(),
    date: fd.get("isChecklist") === "true" ? "" : (fd.get("date") || null),
    time: fd.get("isChecklist") === "true" ? null : (fd.get("time") || null),
    endTime: fd.get("isChecklist") === "true" ? null : (fd.get("endTime") || null),
    duration: Number(fd.get("duration")) || 25,
    type: cat,
    priority: 0
  };
  if (cat === "medical") {
    data.specialty = fd.get("specialty") || null;
    data.doctor = fd.get("doctor") || null;
    data.center = fd.get("center") || null;
    data.address = fd.get("address") || null;
    data.phone = fd.get("phone") || null;
    const r = fd.get("reminderMinutes");
    data.reminderMinutes = r ? Number(r) : null;
  }
  return data;
}

function escapeAttr(s) { return (s || "").replace(/"/g, "&quot;"); }
function escapeHtml(s) { return (s || "").replace(/[&<>]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c])); }
