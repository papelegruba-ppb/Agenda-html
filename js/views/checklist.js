import { getAllTasks, addTask, updateTask, deleteTask, getAllHabits, addHabit, updateHabit, deleteHabit } from "../db.js";
import { CATEGORIES, getCategory } from "../categories.js";
import { openTaskForm } from "../ui/task-form.js";
import { openModal } from "../ui/modal.js";
import { butterflySvg } from "../ui/butterfly.js";

const DAYS = [{v:1,l:"L"},{v:2,l:"M"},{v:3,l:"X"},{v:4,l:"J"},{v:5,l:"V"},{v:6,l:"S"},{v:0,l:"D"}];

export async function renderChecklist(root) {
  await resetDueRecurringTasks();
  let selected = new Set();
  let selectionMode = false;
  const draw = async () => {
    const all = await getAllTasks();
    const items = all.filter(t => t.isChecklist === true).sort((a,b) => (a.createdAt||"").localeCompare(b.createdAt||""));
    const pending = items.filter(t => !t.done);
    const done = items.filter(t => t.done);
    const groups = (list) => {
      const map = new Map();
      list.forEach(t => { const key = t.type || "__none"; if (!map.has(key)) map.set(key, []); map.get(key).push(t); });
      return [...map.entries()].map(([key, tasks]) => ({key, label:key === "__none" ? "Sin categoría" : getCategory(key).label, tasks}));
    };
    root.innerHTML = `
      <section class="checklist-view">
        <header class="checklist-head"><div><h2 class="view-title">Checklist</h2><p class="checklist-intro">Tareas independientes de tu calendario</p></div><button class="btn-primary" id="newChecklist">+ Nueva</button></header>
        <div class="checklist-toolbar"><button class="btn-ghost" id="toggleSelection">${selectionMode ? "Cancelar selección" : "Seleccionar"}</button><button class="btn-ghost" id="convertAll">Convertir lista en hábitos</button><span class="checklist-count">${pending.length} pendientes · ${done.length} hechas</span></div>
        ${selectionMode ? `<div class="checklist-bulk" id="bulkActions"><span>${selected.size} seleccionadas</span><button data-bulk="category">Categoría</button><button data-bulk="repeat">Repetición</button><button data-bulk="habit">A hábitos</button><button data-bulk="delete">Borrar</button></div>` : ""}
        <h3 class="section-title">Pendientes</h3>${renderGroups(groups(pending), selectionMode, selected)}
        <h3 class="section-title">Hechas</h3>${done.length ? renderGroups(groups(done), selectionMode, selected) : `<p class="empty">Todavía no hay tareas hechas.</p>`}
      </section>`;

    root.querySelector("#newChecklist").onclick = () => openTaskForm({isChecklist:true,date:"",type:"personal",title:"",notes:""}, draw);
    root.querySelector("#toggleSelection").onclick = () => { selectionMode = !selectionMode; selected.clear(); draw(); };
    root.querySelector("#convertAll").onclick = async () => { for (const task of items) await convertToHabit(task); await draw(); };
    root.querySelectorAll("[data-select-task]").forEach(cb => cb.onchange = () => { if (cb.checked) selected.add(cb.dataset.selectTask); else selected.delete(cb.dataset.selectTask); const label=root.querySelector(".checklist-bulk span"); if(label) label.textContent=`${selected.size} seleccionadas`; });
    root.querySelectorAll(".checklist-list .task-item").forEach(li => {
      const id = li.dataset.taskId; const task = items.find(t => t.id === id); if (!task) return;
      li.querySelector(".task-check-round")?.addEventListener("click", async e => { e.stopPropagation(); const nextDone=!task.done; await updateTask(id,{done:nextDone,doneAt:nextDone?new Date().toISOString():null,checklistDoneDate:nextDone?new Date().toISOString():null}); draw(); });
      li.querySelector(".task-delete")?.addEventListener("click", async e => { e.stopPropagation(); if (!confirm("¿Borrar esta tarea del Checklist?")) return; if(task.habitId){ const habits=await getAllHabits(); const h=habits.find(x=>x.id===task.habitId); if(h) await updateHabit(h.id,{sourceTaskDeleted:true}); } await deleteTask(id); draw(); });
      li.querySelector(".task-repeat")?.addEventListener("click", e => { e.stopPropagation(); openRepeatModal(task, async patch => { await updateTask(id,patch); await draw(); }); });
      li.querySelector(".task-habit")?.addEventListener("click", async e => { e.stopPropagation(); await convertToHabit(task); await draw(); });
      li.querySelector(".task-select")?.addEventListener("click", e => e.stopPropagation());
      li.onclick = e => { if(e.target.closest("button,input")) return; openTaskForm(task, draw); };
    });
    root.querySelectorAll("[data-bulk]").forEach(btn => btn.onclick = async () => {
      const chosen=items.filter(t=>selected.has(t.id)); if(!chosen.length){alert("Selecciona al menos una tarea.");return;}
      if(btn.dataset.bulk==="delete") { if(!confirm(`¿Borrar ${chosen.length} tareas?`))return; for(const t of chosen) await deleteTask(t.id); selected.clear(); await draw(); }
      if(btn.dataset.bulk==="habit") { for(const t of chosen) await convertToHabit(t); selected.clear(); await draw(); }
      if(btn.dataset.bulk==="repeat") openRepeatModal({checklistRepeat:null,checklistRepeatDays:[]}, async patch=>{for(const t of chosen) await updateTask(t.id,patch); selected.clear(); await draw();});
      if(btn.dataset.bulk==="category") openCategoryModal(async type=>{for(const t of chosen) await updateTask(t.id,{type}); selected.clear(); await draw();});
    });
  };
  await draw();
}

function renderGroups(groups, selectionMode, selected) {
  if (!groups.length) return `<p class="empty">No hay tareas en esta sección.</p>`;
  return groups.map(g => `<section class="checklist-group"><h4>${escapeHtml(g.label)}</h4><ul class="checklist-list ${g.tasks.every(t=>t.done)?"past":""}">${g.tasks.map(t=>renderItem(t,selectionMode,selected)).join("")}</ul></section>`).join("");
}
function renderItem(t, selectionMode, selected) {
  const cat = t.type ? getCategory(t.type) : {id:"none",color:"#B8B1A7"};
  const sub = [t.specialty,t.doctor,t.center].filter(Boolean).join(" · ");
  const repeatLabel = ({daily:"Diaria",weekly:"Semanal",monthly:"Mensual",custom:"Días concretos"})[t.checklistRepeat] || "Sin repetición";
  return `<li class="task-item checklist-item ${t.done?"done":""} ${t.type?`type-${cat.id}`:""}" data-task-id="${escapeAttr(t.id)}" style="--task-category:${cat.color}">
    ${selectionMode?`<input class="task-select" data-select-task="${escapeAttr(t.id)}" type="checkbox" aria-label="Seleccionar tarea" ${selected.has(t.id)?"checked":""}>`:""}
    <button class="task-check-round ${t.done?"is-checked":""}" aria-label="${t.done?"Marcar pendiente":"Marcar como hecha"}">${t.done?"✓":""}</button>
    <div class="task-body"><div class="task-line"><span class="task-title">${escapeHtml(t.title)}</span></div>${sub?`<small class="task-sub">${escapeHtml(sub)}</small>`:""}${t.notes?`<small class="task-notes">${escapeHtml(truncate(t.notes,100))}</small>`:""}${t.checklistRepeat?`<small class="checklist-repeat-label">↻ ${repeatLabel}</small>`:""}</div>
    <div class="task-icon"><span class="butterfly type-${cat.id}" aria-hidden="true">${butterflySvg()}</span><button class="task-repeat icon-action" aria-label="Configurar repetición" title="${repeatLabel}">${calendarSvg()}</button><button class="task-habit icon-action" aria-label="Convertir en hábito" title="${t.habitId?"Hábito vinculado":"Convertir en hábito"}">${targetSvg()}</button><button class="task-delete" aria-label="Borrar">✕</button></div>
  </li>`;
}

async function convertToHabit(task) {
  const habits = await getAllHabits();
  const existing = habits.find(h => h.id === task.habitId || h.sourceTaskId === task.id);
  if (existing) { if (!task.habitId) await updateTask(task.id,{habitId:existing.id}); return existing; }
  const habit = await addHabit({title:task.title,notes:task.notes||"",type:task.type||"personal",sourceTaskId:task.id,done:false,doneAt:null,active:true,createdAt:new Date().toISOString()});
  await updateTask(task.id,{habitId:habit.id});
  return habit;
}

async function resetDueRecurringTasks() {
  const today = localDate(); const tasks=await getAllTasks();
  for(const t of tasks) {
    if(t.isChecklist!==true || !t.done || !t.checklistRepeat || !t.checklistDoneDate) continue;
    const doneDay=String(t.checklistDoneDate).slice(0,10); if(doneDay>=today) continue;
    const shouldReset=occursOn(t,today);
    if(shouldReset) await updateTask(t.id,{done:false,doneAt:null,checklistDoneDate:null});
  }
}
function occursOn(t,dateStr) {
  const d=new Date(`${dateStr}T12:00:00`); const start=t.createdAt?new Date(t.createdAt):d;
  if(t.checklistRepeat==="daily") return true;
  if(t.checklistRepeat==="weekly") return d.getDay()===start.getDay();
  if(t.checklistRepeat==="monthly") return d.getDate()===start.getDate();
  if(t.checklistRepeat==="custom") return Array.isArray(t.checklistRepeatDays)&&t.checklistRepeatDays.includes(d.getDay());
  return false;
}
function openRepeatModal(task,onSave) {
  const repeat=task.checklistRepeat||"none"; const days=Array.isArray(task.checklistRepeatDays)?task.checklistRepeatDays:[];
  const body=`<div class="repeat-modal"><p>Elige cuándo quieres que esta tarea vuelva a estar pendiente.</p><label class="repeat-option"><input type="radio" name="repeat" value="none" ${repeat==="none"?"checked":""}> Sin repetición</label><label class="repeat-option"><input type="radio" name="repeat" value="daily" ${repeat==="daily"?"checked":""}> Diaria</label><label class="repeat-option"><input type="radio" name="repeat" value="weekly" ${repeat==="weekly"?"checked":""}> Semanal</label><label class="repeat-option"><input type="radio" name="repeat" value="monthly" ${repeat==="monthly"?"checked":""}> Mensual</label><label class="repeat-option"><input type="radio" name="repeat" value="custom" ${repeat==="custom"?"checked":""}> Días concretos</label><div class="repeat-days">${DAYS.map(d=>`<label><input type="checkbox" value="${d.v}" ${days.includes(d.v)?"checked":""}>${d.l}</label>`).join("")}</div></div>`;
  const {bodyEl}=openModal({title:"Repetición de tarea",body,actions:[{label:"Cancelar",onClick:({close})=>close()},{label:"Guardar",primary:true,onClick:({close})=>{const mode=bodyEl.querySelector('[name="repeat"]:checked')?.value||"none";const selectedDays=[...bodyEl.querySelectorAll(".repeat-days input:checked")].map(x=>Number(x.value));if(mode==="custom"&&!selectedDays.length){alert("Selecciona al menos un día.");return;}onSave({checklistRepeat:mode==="none"?null:mode,checklistRepeatDays:mode==="custom"?selectedDays:[]});close();}}]});
  const sync=()=>{const custom=bodyEl.querySelector('[name="repeat"]:checked')?.value==="custom";bodyEl.querySelector(".repeat-days").style.display=custom?"flex":"none";}; bodyEl.querySelectorAll('[name="repeat"]').forEach(x=>x.addEventListener("change",sync));sync();
}
function openCategoryModal(onSave){const body=`<label class="bulk-category-label">Nueva categoría<select id="bulkCategory"><option value="">Sin categoría</option>${CATEGORIES.map(c=>`<option value="${c.id}">${escapeHtml(c.label)}</option>`).join("")}</select></label>`;const {bodyEl}=openModal({title:"Cambiar categoría",body,actions:[{label:"Cancelar",onClick:({close})=>close()},{label:"Aplicar",primary:true,onClick:({close})=>{onSave(bodyEl.querySelector("#bulkCategory").value);close();}}]});}
function calendarSvg(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="16" rx="2"/><path d="M7.5 3v4M16.5 3v4M3.5 9.5h17"/></svg>`;}
function targetSvg(){return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/><path d="m14.8 9.2 5-5"/></svg>`;}
function localDate(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;}
function truncate(s,n){return s.length>n?s.slice(0,n).trim()+"…":s;}
function escapeHtml(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
function escapeAttr(s){return escapeHtml(s);}
