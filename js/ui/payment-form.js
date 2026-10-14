import { openModal } from "./modal.js";
import { addPayment, updatePayment, deletePayment, getAllTasks } from "../db.js";
import { CATEGORIES } from "../categories.js";

export function openPaymentForm(payment, onSaved) {
  const isEdit = !!(payment && payment.id);
  const now = new Date();

  const defaults = {
    date: payment?.date || now.toISOString().slice(0, 10),
    amount: payment?.amount || 0,
    categoryId: payment?.categoryId || "work-sye",
    method: payment?.method || "bizum",
    note: payment?.note || ""
  };

  const billableCats = CATEGORIES.filter(c => c.billable);\n  const isClientExtra = defaults.categoryId === "extra-client";\n  const clientTasks = isClientExtra ? (await getAllTasks()).filter(t => t.type === "extra-client" && t.isChecklist !== true) : [];

  const body = `
    <form class="payment-form" autocomplete="off">
      <div class="fld-row">
        <label>Fecha
          <input name="date" type="date" value="${defaults.date}">
        </label>
        <label>Importe (€)
          <input name="amount" type="number" step="0.01" min="0" value="${defaults.amount}">
        </label>
      </div>

      <label>Categoría
        <select name="categoryId">
          ${billableCats.map(c => `
            <option value="${c.id}" ${c.id === defaults.categoryId ? "selected" : ""}>${c.label}</option>
          `).join("")}
        </select>
      </label>

      <label>Método
        <select name="method">
          <option value="bizum" ${defaults.method === "bizum" ? "selected" : ""}>Bizum</option>
          <option value="efectivo" ${defaults.method === "efectivo" ? "selected" : ""}>Efectivo</option>
          <option value="transferencia" ${defaults.method === "transferencia" ? "selected" : ""}>Transferencia</option>
          <option value="revolut" ${defaults.method === "revolut" ? "selected" : ""}>Revolut</option>
          <option value="otro" ${defaults.method === "otro" ? "selected" : ""}>Otro</option>
        </select>
      </label>

      <label>Nota
        <input name="note" value="${escapeAttr(defaults.note)}" placeholder="Ej: pago a cuenta, liquidación...">
      </label>
    </form>
  `;

  const { bodyEl, close } = openModal({
    title: isEdit ? "Editar cobro" : "Nuevo cobro",
    body,
    actions: [
      { label: "Cancelar", onClick: ({ close }) => close() },
      { label: isEdit ? "Guardar" : "Añadir", primary: true, onClick: async ({ close, bodyEl }) => {
        const fd = new FormData(bodyEl.querySelector("form"));
        const data = {
          date: fd.get("date"),
          amount: Number(fd.get("amount")) || 0,
          categoryId: fd.get("categoryId"),
          method: fd.get("method"),
          note: (fd.get("note") || "").toString(),\n          ...(isClientExtra ? { taskId: (fd.get("taskId") || "").toString() || null } : {})
        };
        if (isEdit) {
          await updatePayment(payment.id, data);
        } else {
          await addPayment(data);
        }
        close();
        onSaved?.();
      }}
    ]
  });
}

function escapeAttr(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }\nfunction escapeHtml(s) { return String(s || "").replace(/[&<>"]/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;" }[c])); }
