export function openModal({ title, body, actions = [], onClose }) {
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-sheet" role="dialog" aria-modal="true">
      <header class="modal-head">
        <button class="modal-close" aria-label="Cerrar">✕</button>
        <h2 class="modal-title">${title}</h2>
        <div class="modal-actions-top"></div>
      </header>
      <div class="modal-body"></div>
      <footer class="modal-foot"></footer>
    </div>
  `;
  const sheet = overlay.querySelector(".modal-sheet");
  const bodyEl = overlay.querySelector(".modal-body");
  const footEl = overlay.querySelector(".modal-foot");

  if (typeof body === "string") bodyEl.innerHTML = body;
  else if (body instanceof Node) bodyEl.appendChild(body);

  const close = () => {
    overlay.classList.remove("open");
    setTimeout(() => { overlay.remove(); onClose?.(); }, 180);
  };

  overlay.querySelector(".modal-close").onclick = close;
  overlay.addEventListener("click", e => { if (e.target === overlay) close(); });

  for (const a of actions) {
    const btn = document.createElement("button");
    btn.className = a.primary ? "btn-primary" : "btn-ghost";
    btn.textContent = a.label;
    btn.onclick = () => a.onClick?.({ close, bodyEl });
    footEl.appendChild(btn);
  }

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add("open"));
  return { close, bodyEl, footEl, sheet };
}
