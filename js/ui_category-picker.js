import { CATEGORIES, DEFAULT_CATEGORY } from "../categories.js";

export function renderCategoryPicker(selectedId = DEFAULT_CATEGORY) {
  return `
    <div class="cat-picker" role="radiogroup" aria-label="Categoría">
      ${CATEGORIES.map(c => `
        <button type="button"
                class="cat-chip type-${c.id}"
                role="radio"
                aria-checked="${c.id === selectedId}"
                data-cat="${c.id}">
          <span class="cat-dot" style="background:${c.color}"></span>
          <span class="cat-label">${c.label}</span>
        </button>
      `).join("")}
    </div>
  `;
}

export function bindCategoryPicker(container, onChange) {
  const chips = container.querySelectorAll(".cat-chip");
  chips.forEach(chip => {
    chip.onclick = () => {
      chips.forEach(c => c.setAttribute("aria-checked", "false"));
      chip.setAttribute("aria-checked", "true");
      onChange?.(chip.dataset.cat);
    };
  });
}

export function getSelectedCategory(container) {
  const active = container.querySelector('.cat-chip[aria-checked="true"]');
  return active?.dataset.cat || DEFAULT_CATEGORY;
}
