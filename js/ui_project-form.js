import { openModal } from "./modal.js";
import { addProject } from "../db.js";
import { CATEGORIES } from "../categories.js";

export function openProjectForm(onSaved) {
  const body = `
    <form class="project-form" autocomplete="off">
      <label>Nombre
        <input name="name" required placeholder="Nombre del proyecto">
      </label>
      <div class="fld-block">
        <span class="fld-label">Color</span>
        <div class="proj-color-picker">
          ${CATEGORIES.map(c => `
            <button type="button" class="color-swatch" data-color="${c.color}" style="background:${c.color}" aria-label="${c.label}"></button>
          `).join("")}
        </div>
      </div>
    </form>
  `;

  const { bodyEl, close } = openModal({
    title: "Nuevo proyecto",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      { label: "Crear", primary: true, onClick: async ({ close }) => {
        const name = bodyEl.querySelector('[name="name"]').value.trim();
        if (!name) return;
        const color = bodyEl.querySelector(".color-swatch.active")?.dataset.color || "#C9A7E8";
        const project = await addProject({ name, color });
        close();
        onSaved?.(project);
      }}
    ]
  });

  bodyEl.querySelectorAll(".color-swatch").forEach(sw => {
    sw.onclick = () => {
      bodyEl.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("active"));
      sw.classList.add("active");
    };
  });
  bodyEl.querySelector(".color-swatch")?.classList.add("active");
  bodyEl.querySelector('[name="name"]')?.focus();
}
