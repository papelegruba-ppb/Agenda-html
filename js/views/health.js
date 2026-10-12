import { getAllHealthEpisodes, addHealthEpisode, updateHealthEpisode, deleteHealthEpisode, getAllMedicationIntakes, addMedicationIntake, updateMedicationIntake, deleteMedicationIntake } from "../db.js";

const TYPES = ["Migraña", "Cervicalgia", "Conjuntivitis", "Tendinitis", "Otros"];
const esc = v => String(v ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const localNow = () => { const d = new Date(); return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,16); };
const duration = (a,b) => { if(!a||!b)return "En curso"; const ms=new Date(b)-new Date(a); if(!Number.isFinite(ms)||ms<0)return "—"; const mins=Math.floor(ms/60000); const days=Math.floor(mins/1440), hours=Math.floor((mins%1440)/60), rem=mins%60; return [days?days+" d":"",hours?hours+" h":"",rem+" min"].filter(Boolean).join(" "); };
const pretty = v => v ? new Date(v).toLocaleString("es-ES",{dateStyle:"medium",timeStyle:"short"}) : "—";

export async function renderHealth(root) {
 let episodes = await getAllHealthEpisodes(), intakes = await getAllMedicationIntakes();
 const refresh = () => renderHealth(root);
 root.innerHTML = `
 <section class="health-view">
   <header class="health-head"><div><h2 class="view-title">Control de salud</h2><p class="hint">Registro privado guardado en este dispositivo.</p></div><button class="btn-primary" id="newEpisode">+ Episodio</button></header>
   <div class="health-stats">
    <article><strong>${episodes.length}</strong><span>Episodios</span></article>
    <article><strong>${episodes.filter(e=>!e.endAt).length}</strong><span>En curso</span></article>
    <article><strong>${intakes.length}</strong><span>Tomas registradas</span></article>
   </div>
   <section class="settings-block"><div class="health-section-head"><h3>Episodios</h3><select id="healthFilter" aria-label="Filtrar episodios"><option value="">Todos los tipos</option>${TYPES.map(t=>`<option>${t}</option>`).join("")}</select></div>
   <div id="episodeList"></div></section>
   <section class="settings-block"><div class="health-section-head"><h3>Medicamentos y tomas</h3><button class="btn-ghost" id="newIntake">+ Registrar toma</button></div><p class="hint small">Cada registro corresponde a una toma concreta; puedes anotar medicamento, dosis, hora y efecto percibido.</p><div id="intakeList"></div></section>
   <section class="settings-block"><h3>Exportar registro de salud</h3><p class="hint small">CSV para hojas de cálculo o JSON para conservar los datos estructurados.</p><div class="gcal-actions"><button class="btn-ghost" id="exportHealthCSV">Exportar CSV</button><button class="btn-ghost" id="exportHealthJSON">Exportar JSON</button></div></section>
 </section>`;
 const epList=root.querySelector("#episodeList"), inList=root.querySelector("#intakeList");
 function renderLists(){
  const filter=root.querySelector("#healthFilter").value;
  const visible=episodes.filter(e=>!filter||e.type===filter).sort((a,b)=>(b.startAt||"").localeCompare(a.startAt||""));
  epList.innerHTML=visible.length?visible.map(e=>`<article class="health-record" data-episode="${esc(e.id)}">
   <div class="health-record-head"><div><span class="health-type">${esc(e.type)}</span><h4>${esc(e.title||e.type)}</h4></div><span class="health-duration">${esc(duration(e.startAt,e.endAt))}</span></div>
   <p class="hint small">${esc(pretty(e.startAt))} · fin: ${esc(pretty(e.endAt))}</p>
   ${e.intensity!==null&&e.intensity!==""? `<p><strong>Intensidad:</strong> ${esc(e.intensity)}/10</p>`:""}
   ${e.symptoms?`<p><strong>Síntomas:</strong> ${esc(e.symptoms)}</p>`:""}${e.triggers?`<p><strong>Desencadenantes:</strong> ${esc(e.triggers)}</p>`:""}${e.notes?`<p>${esc(e.notes)}</p>`:""}
   <div class="health-record-actions"><button class="btn-ghost" data-edit-episode="${esc(e.id)}">Editar</button><button class="btn-ghost" data-end-episode="${esc(e.id)}" ${e.endAt?"disabled":""}>Finalizar ahora</button><button class="btn-ghost" data-delete-episode="${esc(e.id)}">Eliminar</button></div>
   <p class="hint small">${intakes.filter(i=>i.episodeId===e.id).length} toma(s) vinculada(s)</p></article>`).join(""):'<p class="empty">Todavía no hay episodios registrados.</p>';
  const sorted=intakes.slice().sort((a,b)=>(b.takenAt||"").localeCompare(a.takenAt||""));
  inList.innerHTML=sorted.length?sorted.map(i=>{const ep=episodes.find(e=>e.id===i.episodeId);return `<article class="health-intake" data-intake="${esc(i.id)}"><div><strong>${esc(i.medication||"Medicamento sin nombre")}</strong><p class="hint small">${esc(pretty(i.takenAt))}${i.dose?" · "+esc(i.dose):""}${ep?" · "+esc(ep.type):""}</p>${i.effect?`<p><strong>Efecto percibido:</strong> ${esc(i.effect)}</p>`:""}${i.notes?`<p>${esc(i.notes)}</p>`:""}</div><div class="health-record-actions"><button class="btn-ghost" data-edit-intake="${esc(i.id)}">Editar</button><button class="btn-ghost" data-delete-intake="${esc(i.id)}">Eliminar</button></div></article>`}).join(""):'<p class="empty">No hay tomas registradas.</p>';
 }
 renderLists();
 root.querySelector("#healthFilter").onchange=renderLists;
 root.querySelector("#newEpisode").onclick=()=>editEpisode();
 root.querySelector("#newIntake").onclick=()=>editIntake();
 epList.addEventListener("click",async e=>{
  const edit=e.target.closest("[data-edit-episode]"), end=e.target.closest("[data-end-episode]"), del=e.target.closest("[data-delete-episode]");
  if(edit){const item=episodes.find(x=>x.id===edit.dataset.editEpisode);await editEpisode(item);}
  if(end){const item=episodes.find(x=>x.id===end.dataset.endEpisode);if(item&&!item.endAt){await updateHealthEpisode(item.id,{endAt:localNow()});await refresh();}}
  if(del){const item=episodes.find(x=>x.id===del.dataset.deleteEpisode);if(item&&confirm("¿Eliminar este episodio? Las tomas se conservarán, desvinculadas del episodio.")){await deleteHealthEpisode(item.id);await refresh();}}
 });
 inList.addEventListener("click",async e=>{const edit=e.target.closest("[data-edit-intake]"),del=e.target.closest("[data-delete-intake]");if(edit){await editIntake(intakes.find(x=>x.id===edit.dataset.editIntake));}if(del){const item=intakes.find(x=>x.id===del.dataset.deleteIntake);if(item&&confirm("¿Eliminar este registro de toma?")){await deleteMedicationIntake(item.id);await refresh();}}});
 async function editEpisode(item=null){
  const body=`<form class="health-form"><label>Tipo de episodio<select name="type">${TYPES.map(t=>`<option ${(item?.type||"Migraña")===t?"selected":""}>${t}</option>`).join("")}</select></label>
  <label>Nombre o título (opcional)<input name="title" value="${esc(item?.title||"")}" placeholder="Ej. migraña con aura"></label>
  <div class="fld-row"><label>Inicio<input required type="datetime-local" name="startAt" value="${esc(item?.startAt||localNow())}"></label><label>Fin<input type="datetime-local" name="endAt" value="${esc(item?.endAt||"")}"></label></div>
  <label>Intensidad (0–10)<input type="number" min="0" max="10" name="intensity" value="${esc(item?.intensity??"")}" placeholder="Opcional"></label>
  <label>Síntomas<textarea name="symptoms" rows="2">${esc(item?.symptoms||"")}</textarea></label><label>Posibles desencadenantes<textarea name="triggers" rows="2">${esc(item?.triggers||"")}</textarea></label><label>Notas<textarea name="notes" rows="3">${esc(item?.notes||"")}</textarea></label></form>`;
  const {openModal}=await import("../ui/modal.js");
  openModal({title:item?"Editar episodio":"Registrar episodio",body,actions:[{label:"Cancelar",onClick:({close})=>close()},{label:"Guardar",primary:true,onClick:async({bodyEl,close})=>{const f=bodyEl.querySelector("form"),fd=new FormData(f),startAt=String(fd.get("startAt")||""),endAt=String(fd.get("endAt")||"");if(!startAt){alert("Indica cuándo comenzó el episodio.");return;}if(endAt&&new Date(endAt)<new Date(startAt)){alert("La fecha de fin no puede ser anterior al inicio.");return;}const iv=fd.get("intensity");const data={type:fd.get("type"),title:String(fd.get("title")||"").trim(),startAt,endAt,intensity:iv===""?null:Number(iv),symptoms:String(fd.get("symptoms")||"").trim(),triggers:String(fd.get("triggers")||"").trim(),notes:String(fd.get("notes")||"").trim()};if(item)await updateHealthEpisode(item.id,data);else await addHealthEpisode(data);close();await refresh();}}]});
 }
 async function editIntake(item=null){
  const body=`<form class="health-form"><label>Medicamento <input name="medication" required value="${esc(item?.medication||"")}" placeholder="Nombre del medicamento"></label>
  <div class="fld-row"><label>Dosis / cantidad <input name="dose" value="${esc(item?.dose||"")}" placeholder="Tal como la tomaste"></label><label>Fecha y hora<input type="datetime-local" name="takenAt" required value="${esc(item?.takenAt||localNow())}"></label></div>
  <label>Vincular a episodio<select name="episodeId"><option value="">Sin vincular</option>${episodes.slice().sort((a,b)=>(b.startAt||"").localeCompare(a.startAt||"")).map(ep=>`<option value="${esc(ep.id)}" ${item?.episodeId===ep.id?"selected":""}>${esc(ep.type)} · ${esc(ep.startAt||"")}</option>`).join("")}</select></label>
  <label>Efecto percibido<input name="effect" value="${esc(item?.effect||"")}" placeholder="Ej. alivio, sin cambio, efecto adverso"></label><label>Notas<textarea name="notes" rows="2">${esc(item?.notes||"")}</textarea></label></form>`;
  const {openModal}=await import("../ui/modal.js");
  openModal({title:item?"Editar toma":"Registrar toma",body,actions:[{label:"Cancelar",onClick:({close})=>close()},{label:"Guardar toma",primary:true,onClick:async({bodyEl,close})=>{const f=bodyEl.querySelector("form"),fd=new FormData(f);const medication=String(fd.get("medication")||"").trim(),takenAt=String(fd.get("takenAt")||"");if(!medication||!takenAt){alert("Indica el medicamento y cuándo lo tomaste.");return;}const data={medication,dose:String(fd.get("dose")||"").trim(),takenAt,episodeId:String(fd.get("episodeId")||"")||null,effect:String(fd.get("effect")||"").trim(),notes:String(fd.get("notes")||"").trim()};if(item)await updateMedicationIntake(item.id,data);else await addMedicationIntake(data);close();await refresh();}}]});
 }
 root.querySelector("#exportHealthJSON").onclick=()=>download("papelegruba-salud.json",JSON.stringify({format:"papelegruba-health",version:1,exportedAt:new Date().toISOString(),healthEpisodes:episodes,medicationIntakes:intakes},null,2),"application/json");
 root.querySelector("#exportHealthCSV").onclick=()=>{const rows=[["registro","id","tipo","titulo_o_medicamento","inicio_o_toma","fin","intensidad","dosis","episodio_id","sintomas","desencadenantes","efecto","notas"],...episodes.map(e=>["episodio",e.id,e.type,e.title,e.startAt,e.endAt,e.intensity,"","",e.symptoms,e.triggers,"",e.notes]),...intakes.map(i=>["toma",i.id,episodes.find(e=>e.id===i.episodeId)?.type||"",i.medication,i.takenAt,"","",i.dose,i.episodeId||"", "", "",i.effect,i.notes])];download("papelegruba-salud.csv","\uFEFF"+rows.map(row=>row.map(csv).join(",")).join("\r\n"),"text/csv;charset=utf-8");};
}
function csv(v){return '"'+String(v??"").replace(/"/g,'""')+'"';}
function download(name,data,type){const blob=new Blob([data],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
