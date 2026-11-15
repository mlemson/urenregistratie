/* Tijdsselectie voor de agenda. Werkt met muis/pen; aanraakschermen blijven gewoon scrollen. */
(function(root){
'use strict';
const STEP=30;
function minutes(value){
 const match=/^(\d{2}):(\d{2})$/.exec(String(value||''));
 if(!match)return null;
 const h=Number(match[1]),m=Number(match[2]);
 return h>=0&&h<=23&&m>=0&&m<60?h*60+m:null;
}
function clock(value){return String(Math.floor(value/60)).padStart(2,'0')+':'+String(value%60).padStart(2,'0');}
function rangeAt(anchor,y,base,pxPerHour,height){
 if(!Number.isFinite(anchor)||!Number.isFinite(y)||!Number.isFinite(base)||!Number.isFinite(pxPerHour)||pxPerHour<=0||!Number.isFinite(height)||height<=0)return null;
 const last=Math.min(1440,base+Math.round(height/pxPerHour*60));
 const endpoint=Math.min(last,Math.max(base,base+Math.round((Math.max(0,Math.min(height,y))/pxPerHour*60)/STEP)*STEP));
 const start=Math.min(anchor,endpoint);
 const end=endpoint===anchor?Math.min(last,anchor+STEP):Math.max(anchor,endpoint);
 if(end<=start)return null;
 return {start,end,hours:Math.round((end-start)/60*100)/100};
}
function install({element,onSelect}={}){
 if(!element||typeof onSelect!=='function'||element.__laCalendarDragInstalled)return;
 element.__laCalendarDragInstalled=true;
 const doc=element.ownerDocument||root.document;
 let active=null,swallow=false;
 function clear(){
  if(active?.preview?.parentNode)active.preview.remove();
  active=null;
 }
 element.addEventListener('pointerdown',event=>{
  if(event.button!==0||event.pointerType==='touch'||active)return;
  const slot=event.target?.closest?.('.agenda-slot');
  if(!slot||!element.contains(slot))return;
  const track=slot.closest('.agenda-day-track');
  if(!track||track.classList.contains('outside-year'))return;
  const date=track.dataset.agendaDate;
  const base=Number(track.dataset.startMinute),hourPx=Number(track.dataset.hourHeight);
  const anchor=minutes(slot.dataset.time);
  if(!date||anchor===null||!Number.isFinite(base)||!hourPx)return;
  active={pointerId:event.pointerId,track,date,base,hourPx,anchor,startY:event.clientY,moved:false,range:null,preview:null};
 },true);
 function update(event){
  if(!active||event.pointerId!==active.pointerId)return;
  const rect=active.track.getBoundingClientRect();
  const selection=rangeAt(active.anchor,event.clientY-rect.top,active.base,active.hourPx,active.track.offsetHeight||rect.height);
  if(!selection)return;
  active.range=selection;
  if(selection.start===active.anchor&&selection.end===active.anchor+STEP&&Math.abs(event.clientY-active.startY)<7)return;
  active.moved=true;
  if(!active.preview){
   active.preview=doc.createElement('div');
   active.preview.className='agenda-selection-preview';
   const label=doc.createElement('span');label.className='agenda-selection-label';
   active.preview.appendChild(label);
   active.track.appendChild(active.preview);
  }
  active.preview.style.top=(selection.start-active.base)*active.hourPx/60+'px';
  active.preview.style.height=(selection.end-selection.start)*active.hourPx/60+'px';
  active.preview.firstChild.textContent=clock(selection.start)+'–'+clock(selection.end)+' · '+String(selection.hours).replace('.',',')+' u';
  event.preventDefault();
 }
 element.addEventListener('pointermove',update,true);
 element.addEventListener('pointerup',event=>{
  if(!active||event.pointerId!==active.pointerId)return;
  update(event);
  const chosen=active.moved?{date:active.date,...active.range}:null;
  clear();
  if(!chosen)return; // Normale klik gebruikt de bestaande knop en stelt één uur voor.
  event.preventDefault();
  swallow=true;
  // De browser kan na pointerup nog een click afvuren op het oorspronkelijke vak.
  setTimeout(()=>{swallow=false;},0);
  onSelect({date:chosen.date,start:clock(chosen.start),end:clock(chosen.end)});
 },true);
 element.addEventListener('pointercancel',clear,true);
 element.addEventListener('keydown',event=>{if(event.key==='Escape')clear();},true);
 element.addEventListener('click',event=>{
  if(!swallow)return;
  event.preventDefault();event.stopImmediatePropagation?.();event.stopPropagation?.();
  swallow=false;
 },true);
}
root.LAAgendaDrag={install,minutes,clock,rangeAt};
})(window);
