import { initDB } from "./js/db.js";

const root = document.getElementById("view-root");
root.innerHTML = `<pre style="padding:1rem;font-family:monospace;">Cargando diagnóstico...</pre>`;
const log = root.querySelector("pre");

async function testImport(name, path) {
  try {
    await import(path);
    log.textContent += `✅ ${name}\n`;
  } catch (e) {
    log.textContent += `❌ ${name} → ${e.message}\n`;
    throw e;
  }
}

(async () => {
  try {
    await testImport("db.js", "./js/db.js");
    await testImport("hours.js", "./js/hours.js");
    await testImport("butterfly.js", "./js/ui/butterfly.js");
    await testImport("modal.js", "./js/ui/modal.js");
    await testImport("session-form.js", "./js/ui/session-form.js");
    await testImport("payment-form.js", "./js/ui/payment-form.js");
    await testImport("timer.js", "./js/views/timer.js");
    log.textContent += "\n✅ Todos los imports funcionan.";
  } catch (e) {
    log.textContent += "\n❌ El que falla es el último marcado arriba.";
  }
})();
