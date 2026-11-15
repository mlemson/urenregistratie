/* Week-, dag- en maandagenda; alleen de aangeleverde registratiegegevens worden getoond. */
(function(root){
'use strict';
const COLORS=[
 ['#287564','#e7f4ef'],['#4874ae','#eaf1fc'],['#976536','#f8f0e5'],
 ['#80599a','#f3eafa'],['#ad596c','#fbedf0'],['#3f8191','#e8f4f7'],
 ['#777b3e','#f2f5e7'],['#53718c','#eaf0f6']
];
const DAYS=['ma','di','wo','do','vr','za','zo'];
const MONTHS=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const esc=value=>String(value==null?'':value).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]});
const pad=n=>String(n).padStart(2,'0');
function toDate(iso){const m=/^(\d{4})-(\d\d)-(\d\d)$/.exec(String(iso||''));if(!m)return null;const d=new Date(Number(m[1]),Number(m[2])-1,Number(m[3]),12);return d.getFullYear()===Number(m[1])&&d.getMonth()===Number(m[2])-1&&d.getDate()===Number(m[3])?d:null;}
function iso(date){return date.getFullYear()+'-'+pad(date.getMonth()+1)+'-'+pad(date.getDate());}
function shift(isoDate,days){const d=toDate(isoDate);if(!d)return iso(new Date());d.setDate(d.getDate()+days);return iso(d);}
function weekStart(isoDate){const d=toDate(isoDate)||new Date();d.setDate(d.getDate()-((d.getDay()+6)%7));return iso(d);}
function isoWeek(dateISO){const d=toDate(dateISO);if(!d)return 1;const utc=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));utc.setUTCDate(utc.getUTCDate()+4-(utc.getUTCDay()||7));return Math.ceil((((utc-new Date(Date.UTC(utc.getUTCFullYear(),0,1)))/86400000)+1)/7);}
function minute(t){if(!/^\d\d:\d\d$/.test(String(t||'')))return null;const [h,m]=String(t).split(':').map(Number);return h<24&&m<60?h*60+m:null;}
function interval(row){const start=minute(row.Begintijd),end=minute(row.Eindtijd);return start!==null&&end!==null&&end>start?{start,end}:null;}
function duration(start,end){const s=minute(start),e=minute(end);return s!==null&&e!==null&&e>s?Math.round(((e-s)/60)*100)/100:null;}
function palette(projectNo){let hash=0;for(const c of String(projectNo||''))hash=((hash*31)+c.charCodeAt(0))|0;return COLORS[Math.abs(hash)%COLORS.length];}
function selectedInYear(isoDate,year){return String(isoDate).slice(0,4)===String(year);}
function isRelevant(row,filters){return selectedInYear(row.Datum,filters.year)&&(!filters.project||String(row.Projectnummer)===String(filters.project))&&(!filters.kind||String(row.SoortUren||'DIRECT')===filters.kind);}
function weekDates(anchor){const start=weekStart(anchor);return Array.from({length:7},(_,i)=>shift(start,i));}
function monthDates(anchor){const d=toDate(anchor)||new Date();const first=iso(new Date(d.getFullYear(),d.getMonth(),1,12));const start=weekStart(first);const last=new Date(d.getFullYear(),d.getMonth()+1,0,12);const days=Math.ceil((Math.round((last-toDate(start))/86400000)+1)/7)*7;return Array.from({length:days},(_,i)=>shift(start,i));}
function dateText(d){const v=toDate(d);return v?DAYS[(v.getDay()+6)%7]+' '+v.getDate()+' '+MONTHS[v.getMonth()].slice(0,3):d;}
function rowTitle(r,getName){return String(r.Projectnummer||'')+' · '+String(getName(r.Projectnummer)||'')+(r.Activiteit?' · '+r.Activiteit:'');}
function layout(entries){
 const events=entries.map(r=>({row:r,time:interval(r)})).filter(x=>x.time).sort((a,b)=>a.time.start-b.time.start||a.time.end-b.time.end);
 const clusters=[];let cluster=[],finish=-1;
 for(const e of events){if(cluster.length&&e.time.start>=finish){clusters.push(cluster);cluster=[];finish=-1;}cluster.push(e);finish=Math.max(finish,e.time.end);}
 if(cluster.length)clusters.push(cluster);
 for(const group of clusters){let ends=[];for(const e of group){let col=ends.findIndex(v=>v<=e.time.start);if(col<0){col=ends.length;ends.push(e.time.end);}else ends[col]=e.time.end;e.column=col;}for(const e of group)e.columns=ends.length;}
 return events;
}
function button(text,action,cls='',more=''){return '<button type="button" class="agenda-btn '+cls+'" data-action="'+action+'" '+more+'>'+text+'</button>';}
function projectOptions(projects,selected){return '<option value="">Alle projecten</option>'+[...projects].sort((a,b)=>String(a.Projectnummer).localeCompare(String(b.Projectnummer),'nl',{numeric:true})).map(p=>'<option value="'+esc(p.Projectnummer)+'" '+(String(p.Projectnummer)===String(selected)?'selected':'')+'>'+esc(p.Projectnummer)+' · '+esc(p.Omschrijving)+'</option>').join('');}
function agendaHeader(ctx,rangeRows,title){
 const hours=rangeRows.reduce((n,r)=>n+(Number(r.Uren)||0),0);
 const untimed=rangeRows.filter(r=>!interval(r));
 const hasTime=rangeRows.length-untimed.length;
 return '<div class="agenda-top"><div><h1>Agenda</h1><p>'+esc(title)+' · '+ctx.year+'</p></div><div class="agenda-top-actions">'+button('Vandaag','agenda-today')+button('‹','agenda-prev','agenda-arrow','aria-label="Vorige periode"')+button('›','agenda-next','agenda-arrow','aria-label="Volgende periode"')+button('+ Registratie','agenda-new','agenda-primary')+'</div></div>'+
 '<div class="agenda-summary"><div><span>Geregistreerd</span><strong>'+fmt(hours)+' <small>uur</small></strong></div><div><span>Met tijd</span><strong>'+hasTime+'</strong></div><div><span>Zonder tijd</span><strong>'+untimed.length+'</strong></div><div class="agenda-view-switch">'+['dag','werkweek','week','maand'].map(m=>button(m.charAt(0).toUpperCase()+m.slice(1),'agenda-mode',ctx.mode===m?'active':'','data-mode="'+m+'"')).join('')+'</div></div>';
}
function fmt(v){return new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2}).format(Math.round((Number(v)||0)*100)/100);}
function rightDetail(ctx,selected){
 const r=selected;const time=r&&interval(r);const color=r?palette(r.Projectnummer)[0]:'#287564';
 const name=ctx.getProjectName||(()=> '');
 return '<aside class="agenda-aside"><div class="agenda-aside-title">Registratie</div>'+(r?'<div class="agenda-detail"><div class="agenda-detail-date">'+esc(dateText(r.Datum))+'</div><div class="agenda-detail-project"><span class="agenda-detail-dot" style="background:'+color+'"></span>'+esc(r.Projectnummer)+' · '+esc(name(r.Projectnummer))+'</div><h3>'+esc(r.Activiteit||'Werkzaamheden')+'</h3><p>'+esc(r.Omschrijving||'Geen aanvullende omschrijving')+'</p><dl><dt>Tijd</dt><dd>'+(time?esc(r.Begintijd)+'–'+esc(r.Eindtijd):'Geen vaste tijden')+'</dd><dt>Uren</dt><dd>'+fmt(r.Uren)+' uur</dd><dt>Kilometers</dt><dd>'+fmt(r.Km)+' km</dd></dl>'+button('Bewerken','agenda-edit','agenda-primary','data-id="'+esc(r.Id)+'"')+'</div>':'<div class="agenda-aside-empty">Klik op een registratie om deze te bewerken. Klik op een leeg tijdvak om uren toe te voegen.</div>')+
 '<div class="agenda-aside-hint"><strong>Registreren zonder tijd</strong><p>Gebruik + Registratie en laat de begintijd en eindtijd leeg. Bestaande uren blijven gewoon meetellen.</p></div></aside>';
}
function controls(ctx){return '<div class="agenda-filters"><label>Project <select id="agendaProjectFilter">'+projectOptions(ctx.projects||[],ctx.project)+'</select></label><label>Uren <select id="agendaKindFilter"><option value="">Direct en indirect</option><option value="DIRECT" '+(ctx.kind==='DIRECT'?'selected':'')+'>Direct</option><option value="INDIRECT" '+(ctx.kind==='INDIRECT'?'selected':'')+'>Indirect</option></select></label><span class="agenda-filters-caption">Klik op een tijdvak om uren te registreren</span></div>';}
function timeWeek(ctx,days,rows){
 const now=ctx.today;
 const assigned=days.map(date=>rows.filter(r=>r.Datum===date));
 const intervals=assigned.flat().map(interval).filter(Boolean);
 const minHour=Math.max(0,Math.min(7,...intervals.map(t=>Math.floor(t.start/60))));
 const maxHour=Math.min(24,Math.max(19,...intervals.map(t=>Math.ceil(t.end/60))));
 const totalMin=(maxHour-minHour)*60,pxPerHour=76,height=(maxHour-minHour)*pxPerHour;
 const headers=days.map((date,i)=>'<div class="agenda-day-header '+(date===now?'today ':'')+(selectedInYear(date,ctx.year)?'':'outside-year')+'"><span>'+DAYS[i%7]+'</span><strong>'+Number(date.slice(-2))+'</strong><small>'+fmt(assigned[i].reduce((a,r)=>a+Number(r.Uren||0),0))+' u</small></div>').join('');
 const timeAxis=Array.from({length:maxHour-minHour+1},(_,i)=>'<span style="top:'+(i*pxPerHour)+'px">'+pad(minHour+i)+':00</span>').join('');
 const schedules=days.map((date,idx)=>{
  const allowed=selectedInYear(date,ctx.year);
  const timed=layout(assigned[idx]);
  const slots=allowed?Array.from({length:(maxHour-minHour)*2},(_,i)=>'<button type="button" class="agenda-slot" style="top:'+(i*pxPerHour/2)+'px;height:'+(pxPerHour/2)+'px" data-action="agenda-new" data-date="'+date+'" data-time="'+pad(minHour+Math.floor(i/2))+':'+(i%2?'30':'00')+'" aria-label="Toevoegen '+esc(date)+' '+pad(minHour+Math.floor(i/2))+':'+(i%2?'30':'00')+'"></button>').join(''):'';
  const cards=timed.map(x=>{
    const r=x.row,t=x.time;const c=palette(r.Projectnummer),top=(t.start-minHour*60)*pxPerHour/60,cardH=Math.max(18,(t.end-t.start)*pxPerHour/60-3);
    const width=100/x.columns,left=x.column*width;
    return '<button type="button" data-action="agenda-edit" data-id="'+esc(r.Id)+'" class="agenda-event" style="--event-color:'+c[0]+';--event-bg:'+c[1]+';top:'+Math.max(0,top)+'px;height:'+cardH+'px;left:calc('+left+'% + 2px);width:calc('+width+'% - 4px)" title="'+esc(rowTitle(r,ctx.getProjectName))+'"><span class="agenda-event-time">'+esc(r.Begintijd)+'–'+esc(r.Eindtijd)+'</span><strong>'+esc(r.Projectnummer)+' · '+esc(r.Activiteit||'Werk')+'</strong><small>'+esc(ctx.getProjectName(r.Projectnummer))+'</small></button>';
  }).join('');
  return '<div class="agenda-day-track '+(date===now?'today ':'')+(allowed?'':'outside-year')+'" style="height:'+height+'px">'+slots+cards+'</div>';
 }).join('');
 const untimed=assigned.map((records,i)=>({date:days[i],items:records.filter(r=>!interval(r))})).filter(x=>x.items.length);
 const untimedMarkup=untimed.length?untimed.map(x=>'<div class="agenda-unscheduled-day"><div><strong>'+esc(dateText(x.date))+'</strong></div><div class="agenda-unscheduled-cards">'+x.items.map(r=>{const c=palette(r.Projectnummer);return '<button type="button" data-action="agenda-edit" data-id="'+esc(r.Id)+'" class="agenda-unscheduled-item" style="--event-color:'+c[0]+';--event-bg:'+c[1]+'"><strong>'+esc(r.Projectnummer)+'</strong><span>'+esc(r.Activiteit||'Werk')+'</span><em>'+fmt(r.Uren)+' u</em></button>';}).join('')+'</div></div>').join(''):'<p class="agenda-blank-note">Geen registraties zonder tijd in deze periode.</p>';
 return '<div class="agenda-main"><div class="agenda-grid-scroll"><div class="agenda-grid" style="--agenda-days:'+days.length+'"><div class="agenda-top-corner">Tijd</div>'+headers+'<div class="agenda-times" style="height:'+height+'px">'+timeAxis+'</div>'+schedules+'</div></div><div class="agenda-unscheduled"><div class="agenda-unscheduled-heading"><strong>Zonder tijd</strong><span>Historische registraties en handmatige uren</span></div>'+untimedMarkup+'</div></div>';
}
function monthView(ctx,rows){const grid=monthDates(ctx.anchor),month=(toDate(ctx.anchor)||new Date()).getMonth();const dayNames=DAYS.map(x=>'<span>'+x+'</span>').join('');
 const days=grid.map(date=>{const values=rows.filter(r=>r.Datum===date),active=toDate(date)?.getMonth()===month,valid=selectedInYear(date,ctx.year);
 return '<button type="button" data-action="agenda-select-day" data-date="'+date+'" '+(!valid?'disabled':'')+' class="agenda-month-day '+(!active?'other-month ':'')+(date===ctx.today?'today':'')+'"><span class="agenda-month-number">'+Number(date.slice(-2))+'</span>'+(values.length?'<strong>'+fmt(values.reduce((n,r)=>n+Number(r.Uren||0),0))+' u</strong>':'')+values.slice(0,3).map(r=>{const c=palette(r.Projectnummer);return '<span class="agenda-month-item" style="--event-color:'+c[0]+';--event-bg:'+c[1]+'">'+esc(r.Projectnummer)+' · '+esc(r.Activiteit||'Werk')+'</span>';}).join('')+(values.length>3?'<small>+'+(values.length-3)+' meer</small>':'')+'</button>';}).join('');
 return '<div class="agenda-month-wrap"><div class="agenda-month-labels">'+dayNames+'</div><div class="agenda-month-grid">'+days+'</div></div>';
}
function render(ctx){
 const week=weekDates(ctx.anchor),days=ctx.mode==='dag'?[ctx.anchor]:(ctx.mode==='werkweek'?week.slice(0,5):week);
 const range=ctx.mode==='maand'?monthDates(ctx.anchor):days;
 const allRows=(ctx.entries||[]).filter(r=>isRelevant(r,ctx));
 const filtered=allRows.filter(r=>range.includes(r.Datum)&&(ctx.mode!=='maand'||(toDate(r.Datum)&&toDate(r.Datum).getMonth()===(toDate(ctx.anchor)||new Date()).getMonth())));
 const anchor=toDate(ctx.anchor)||new Date();
 const title=ctx.mode==='maand'?MONTHS[anchor.getMonth()]+' '+anchor.getFullYear():ctx.mode==='dag'?dateText(ctx.anchor)+' '+anchor.getFullYear():(ctx.mode==='werkweek'?'Werkweek ':'Week ')+isoWeek(week[0])+' · '+Number(week[0].slice(-2))+' '+MONTHS[toDate(week[0]).getMonth()].slice(0,3)+' – '+Number(days[days.length-1].slice(-2))+' '+MONTHS[toDate(days[days.length-1]).getMonth()].slice(0,3);
 const selected=allRows.find(r=>r.Id===ctx.selectedId)||null;
 return agendaHeader(ctx,filtered,title)+'<div class="agenda-shell"><section class="agenda-content">'+controls(ctx)+(ctx.mode==='maand'?monthView(ctx,filtered):timeWeek(ctx,days,filtered))+'</section>'+rightDetail(ctx,selected)+'</div>';
}
root.LAAgenda={render,shift,iso,weekStart,weekDates,monthDates,minute,interval,duration,layout,isoWeek};
})(window);