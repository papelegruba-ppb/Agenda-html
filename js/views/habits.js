import { initDB } from "../db.js";

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
async function getHabits(){ const db=await initDB(); return new Promise((resolve,reject)=>{const r=db.transaction('habits').objectStore('habits').getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);}); }
async function saveHabit(habit){ const db=await initDB(); return new Promise((resolve,reject)=>{const tx=db.transaction('habits','readwrite');tx.objectStore('habits').put(habit);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
async function removeHabit(id){ const db=await initDB(); return new Promise((resolve,reject)=>{const tx=db.transaction('habits','readwrite');tx.objectStore('habits').delete(id);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);}); }
export async function renderHabits(root) {
 const habits=await getHabits();
 root.innerHTML=`<section class="habits-view"><header class="habits-head"><h2 class="view-title">Hábitos</h2><button class="btn-primary" id="newHabit">+ Nuevo hábito</button></header><p class="habits-intro">Crea rutinas y define cuánto duran y qué días quieres hacerlas.</p><ul class="habit-list">${habits.length?habits.map(h=>`<li class="habit-row" data-id="${esc(h.id)}"><div class="habit-main"><strong>${esc(h.name || h.title)}</strong><small>${Number(h.duration)||15} minutos · ${esc(h.frequencyLabel||'Sin frecuencia definida')}</small>${h.notes?`<small>${esc(h.notes)}</small>`:''}</div><button class="habit-edit" title="Editar hábito" aria-label="Editar hábito">✎</button><button class="habit-delete" title="Eliminar hábito" aria-label="Eliminar hábito">×</button></li>`).join(''):'<li class="empty">Todavía no tienes hábitos. Puedes crear una rutina aquí.</li>'}</ul></section>`;
 root.querySelector('#newHabit').onclick=()=>editHabit();
 root.querySelectorAll('.habit-row').forEach(row=>{const h=habits.find(x=>x.id===row.dataset.id);row.querySelector('.habit-edit').onclick=()=>editHabit(h);row.querySelector('.habit-delete').onclick=async()=>{if(confirm(`¿Eliminar el hábito «${h.name}»? La tarea original de Checklist no se eliminará.`)){await removeHabit(h.id);renderHabits(root);}};});
 async function editHabit(existing=null){
  const name=prompt('Nombre del hábito:',existing?.name||existing?.title||''); if(name===null)return; if(!name.trim()){alert('Escribe un nombre para el hábito.');return;}
  const duration=prompt('Duración de cada sesión en minutos:',String(existing?.duration||15)); if(duration===null)return; const mins=Number(duration); if(!Number.isFinite(mins)||mins<1||mins>1440){alert('Introduce una duración entre 1 y 1440 minutos.');return;}
  const current=existing?.days||[0,1,2,3,4,5,6]; const daysInput=prompt('Días de repetición separados por coma (1=lun, 2=mar, 3=mié, 4=jue, 5=vie, 6=sáb, 7=dom). Para todos los días escribe 1,2,3,4,5,6,7.',current.map(n=>n+1).join(',')); if(daysInput===null)return;
  const days=[...new Set(daysInput.split(',').map(v=>Number(v.trim())-1).filter(v=>Number.isInteger(v)&&v>=0&&v<=6))].sort(); if(!days.length){alert('Selecciona al menos un día válido.');return;}
  const notes=prompt('Notas opcionales:',existing?.notes||'') ;if(notes===null)return;
  const frequencyLabel=days.length===7?'Todos los días':days.map(n=>['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'][n]).join(', ');
  await saveHabit({...existing,id:existing?.id||uid(),name:name.trim(),title:name.trim(),duration:mins,days,frequencyLabel,notes:notes.trim(),updatedAt:new Date().toISOString(),createdAt:existing?.createdAt||new Date().toISOString()}); renderHabits(root);
 }
}
function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
