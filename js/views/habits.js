import { getAllHabits, updateHabit, deleteHabit, getAllTasks, updateTask } from "../db.js";
import { getCategory } from "../categories.js";
import { butterflySvg } from "../ui/butterfly.js";

export async function renderHabits(root) {
  const habits = (await getAllHabits()).filter(h => h.active !== false).sort((a,b)=>(a.createdAt||"").localeCompare(b.createdAt||""));
  const tasks = await getAllTasks();
  root.innerHTML = `<section class="habits-view"><header class="habits-head"><div><h2 class="view-title">Hábitos</h2><p class="checklist-intro">Rutinas vinculadas al Checklist, con estado independiente.</p></div><span class="habits-total">${habits.length}</span></header>${habits.length?`<ul class="habits-list">${habits.map(h=>renderHabit(h,tasks)).join("")}</ul>`:`<p class="empty">Todavía no hay hábitos. En Checklist, pulsa el icono de objetivo de una tarea para convertirla en hábito.</p>`}</section>`;
  root.querySelectorAll("[data-habit-check]").forEach(btn=>btn.onclick=async()=>{const h=habits.find(x=>x.id===btn.dataset.habitCheck);if(!h)return;const done=!h.done;await updateHabit(h.id,{done,doneAt:done?new Date().toISOString():null});await renderHabits(root);});
  root.querySelectorAll("[data-habit-delete]").forEach(btn=>btn.onclick=async()=>{const h=habits.find(x=>x.id===btn.dataset.habitDelete);if(!h||!confirm("¿Eliminar este hábito? La tarea original del Checklist se conservará."))return;await deleteHabit(h.id);const source=tasks.find(t=>t.id===h.sourceTaskId);if(source&&source.habitId===h.id)await updateTask(source.id,{habitId:null});await renderHabits(root);});
}
function renderHabit(h,tasks){const cat=getCategory(h.type||"personal");const source=tasks.find(t=>t.id===h.sourceTaskId);return `<li class="habit-item ${h.done?"done":""}" style="--task-category:${cat.color}"><button class="habit-check ${h.done?"is-checked":""}" data-habit-check="${esc(h.id)}" aria-label="${h.done?"Marcar pendiente":"Marcar como hecho"}">${h.done?"✓":""}</button><div class="habit-body"><strong class="habit-title">${esc(h.title||"Hábito sin título")}</strong><small>${esc(cat.label)}${source?" · Vinculado al Checklist":" · Hábito independiente"}</small>${h.notes?`<p>${esc(h.notes)}</p>`:""}</div><span class="butterfly type-${cat.id}" aria-hidden="true">${butterflySvg()}</span><button class="task-delete" data-habit-delete="${esc(h.id)}" aria-label="Eliminar hábito">✕</button></li>`;}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));}
