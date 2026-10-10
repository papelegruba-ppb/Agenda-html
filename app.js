// app.js de diagnóstico
const root = document.getElementById("view-root");
root.innerHTML = `<pre id="log" style="padding:1rem;font-family:monospace;font-size:14px;white-space:pre-wrap;"></pre>`;
const log = document.getElementById("log");

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
    await testImport("dates.js", "./js/dates.js");
    await testImport("categories.js", "./js/categories.js");
    await testImport("views/year.js", "./js/views/year.js");
    await testImport("views/month.js", "./js/views/month.js");
    await testImport("views/week.js", "./js/views/week.js");
    await testImport("views/day.js", "./js/views/day.js");
    await testImport("views/checklist.js", "./js/views/checklist.js");
    await testImport("views/timer.js", "./js/views/timer.js");
    await testImport("views/projects.js", "./js/views/projects.js");
    await testImport("views/habits.js", "./js/views/habits.js");
    await testImport("views/settings.js", "./js/views/settings.js");
    await testImport("views/medical.js", "./js/views/medical.js");
    log.textContent += "\n✅ Todos los imports funcionan.";
  } catch (e) {
    log.textContent += "\n❌ El que falla es el último marcado arriba.";
  }
})();
