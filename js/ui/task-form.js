import { openModal } from "./modal.js";
import { renderCategoryPicker, bindCategoryPicker } from "./category-picker.js";
import { addTask, updateTask } from "../db.js";
import { iso } from "../dates.js";
import { startTimer, getActiveTimer, stopTimer } from "../hours.js";

const MEDICAL_FIELDS = `
  <div class="med-only">
    <label>Especialidad<input name="specialty" list="specialties" placeholder="Traumatología, Dentista..."><datalist id="specialties"><option>Medicina general</option><option>Traumatología</option><option>Dentista</option><option>Oftalmología</option><option>Dermatología</option><option>Ginecología</option><option>Análisis</option><option>Radiología</option><option>Otorrino/TAC</option><option>Cardiología</option><option>Neurología</option></datalist></label>
    <label>Doctor/a<input name="doctor" placeholder="Dr./Dra. ..."></label><label>Centro<input name="center" placeholder="Hospital, clínica, consulta..."></label>
    <label>Dirección<div style="display:flex;gap:.4rem;align-items:center"><input name="address" placeholder="Calle, número, ciudad" style="flex:1"><button type="button" class="btn-maps" title="Buscar en Google Maps">🗺️</button></div></label><label>Teléfono<input name="phone" type="tel" placeholder="+34 ..."></label>
    <label>Recordatorio<select name="reminderMinutes"><option value="">Sin recordatorio</option><option value="15">15 minutos antes</option><option value="60">1 hora antes</option><option value="1440">1 día antes</option></select></label>
  </div>`;

export function openTaskForm(task = null, onSaved) {
  const isEdit=!!(task&&task.id); const isChecklist=task?.isChecklist===true; const today=iso(new Date());
  const t=task||{title:"",notes:"",date:today,time:"",endTime:"",type:"personal",priority:0,duration:25,isChecklist:false};
  const activeTimer=getActiveTimer(); const thisTaskIsTimer=activeTimer&&t.id&&activeTimer.taskId===t.id;
  const body=`<form class="task-form" autocomplete="off"><label class="fld-title">Título<input name="title" required value="${attr(t.title)}" placeholder="¿Qué hay que hacer?"></label>
    <div class="fld-row"><label>Fecha<input name="date" type="date" value="${isChecklist?(t.date||""):(t.date||today)}" ${isChecklist?'placeholder="Sin fecha"':""}></label><label>Hora<input name="time" type="time" value="${attr(t.time||"")}"></label></div>
    ${isChecklist?`<p class="task-form-hint">Esta tarea pertenece al Checklist y no se crea como evento del calendario.</p>`:""}
    <div class="fld-row med-only-hidden"><label>Hora fin<input name="endTime" type="time" value="${attr(t.endTime||"")}"></label><label>Duración (min)<input name="duration" type="number" min="5" step="5" value="${t.duration??25}"></label></div>
    <div class="fld-block"><span class="fld-label">Categoría</span>${renderCategoryPicker(t.type||"personal")}</div><label>Notas<textarea name="notes" rows="3" placeholder="Detalles, enlaces...">${esc(t.notes||"")}</textarea></label>${MEDICAL_FIELDS}</form>`;
  const actions=[{label:"Cancelar",onClick:({close})=>close()}];
  if(isEdit){if(thisTaskIsTimer)actions.push({label:"⏹ Parar cronómetro",onClick:({close})=>{stopTimer();close();onSaved?.();}});else actions.push({label:"⏱ Empezar a contar",onClick:({close})=>{startTimer({taskId:t.id,taskTitle:t.title,categoryId:t.type||"personal"});close();onSaved?.();}});}
  actions.push({label:isEdit?"Guardar":"Crear",primary:true,onClick:async({close,bodyEl})=>{try{const data=readTaskForm(bodyEl);if(!data.title){alert("Falta el título");return;}if(isEdit)await updateTask(t.id,data);else await addTask(data);close();onSaved?.();}catch(e){alert("ERROR AL GUARDAR:\n\n"+(e.stack||e.message||e));}}});
  const {bodyEl}=openModal({title:isEdit?(isChecklist?"Editar tarea del Checklist":"Editar evento/tarea"):(isChecklist?"Nueva tarea del Checklist":"Nueva tarea"),body,actions});
  bindCategoryPicker(bodyEl.querySelector(".cat-picker"),catId=>{const show=catId==="medical";bodyEl.querySelectorAll(".med-only,.med-only-hidden").forEach(el=>el.style.display=show?"":"none");});
  const show=t.type==="medical";bodyEl.querySelectorAll(".med-only,.med-only-hidden").forEach(el=>el.style.display=show?"":"none");
  for(const field of ["specialty","doctor","center","address","phone","reminderMinutes"])if(t[field]!=null) {const el=bodyEl.querySelector(`[name="${field}"]`);if(el)el.value=String(t[field]);}
  bodyEl.querySelector(".btn-maps")?.addEventListener("click",()=>{const dir=bodyEl.querySelector('[name="address"]').value.trim();if(!dir){alert("Escribe una dirección primero.");return;}window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(dir)}`,"_blank");});
  setTimeout(()=>bodyEl.querySelector('[name="title"]')?.focus(),100);
}
function readTaskForm(root){const fd=new FormData(root.querySelector("form"));const cat=root.querySelector('.cat-chip[aria-checked="true"]')?.dataset.cat||"personal";const checklistHint=root.querySelector(".task-form-hint");const dateRaw=(fd.get("date")||"").toString();const data={title:(fd.get("title")||"").toString().trim(),notes:(fd.get("notes")||"").toString(),date:checklistHint?dateRaw:(dateRaw||""),time:(fd.get("time")||"").toString(),endTime:(fd.get("endTime")||"").toString(),duration:Number(fd.get("duration"))||25,type:cat,priority:0};if(checklistHint)data.isChecklist=true;if(cat==="medical"){data.specialty=fd.get("specialty")||null;data.doctor=fd.get("doctor")||null;data.center=fd.get("center")||null;data.address=fd.get("address")||null;data.phone=fd.get("phone")||null;const r=fd.get("reminderMinutes");data.reminderMinutes=r?Number(r):null;}return data;}
function attr(s){return String(s||"").replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}
function esc(s){return attr(s).replace(/'/g,"&#39;");}
