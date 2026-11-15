/* LA uren en kilometers · data blijven eigendom van de gebruiker. */
(() => {
'use strict';
const MONTHS=['januari','februari','maart','april','mei','juni','juli','augustus','september','oktober','november','december'];
const DEFAULT_ACTIVITIES=['1 ontwerp','2 def ontwerp','3 bouwaanvraag','4 esth begeleiding','Bespreking','Offertes','Acquisitie','Administratie /boekh','Scholing / meeting','Overig'];
const DB_VERSION=3;
function fallbackStore(name){try{const st=window[name];if(st){st.getItem('la-storage-check');return st;}}catch(e){}const cache={};return {getItem:k=>cache[k]??null,setItem:(k,v)=>{cache[k]=String(v)},removeItem:k=>{delete cache[k]}};}
const safeLocal=fallbackStore('localStorage');
const safeSession=fallbackStore('sessionStorage');
const SESSION_PASSWORD_KEY='la-stack-session-password';
function rememberCloudPassword(password){safeSession.setItem(SESSION_PASSWORD_KEY,password);}
function forgetCloudPassword(){safeSession.removeItem(SESSION_PASSWORD_KEY);}
const FIELDS={
 Projecten:['Projectnummer','Omschrijving','Actueel','Uurtarief','Prijsafspraak','Contractbedrag','Opmerking'],
 Activiteiten:['Naam','SoortUren'],
 Registraties:['Id','Datum','Begintijd','Eindtijd','Projectnummer','Activiteit','Omschrijving','Uren','SoortUren','VanPostcode','NaarPostcode','Retour','Km','ReistijdMinuten','KmMethode','OdometerBegin','OdometerEind','WerkelijkVertrek','WerkelijkeBestemming','RouteOpmerking','FacturatieStatus','VroegerGedeclareerdeUren','BronMaand','BronRij','Aangemaakt','Gewijzigd'],
 Declaraties:['Id','Projectnummer','Datum','Kenmerk','Status','Methode','Uurtarief','Percentage','Grondslag','BedragExBtw','BtwPercentage','Opmerking','Aangemaakt'],
 Declaratieregels:['Id','DeclaratieId','RegistratieId','Uren','Omschrijving'],
 HistorischeDeclaraties:['Projectnummer','BronKolom','Brontitel','Waarde','BronRij'],
 Instellingen:['Sleutel','Waarde'],
 Mutaties:['Id','Tijdstip','Actie','Type','ObjectId','Details']
};
const $=id=>document.getElementById(id);
const E=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=v=>{let s=typeof v==='number'?v:String(v??'').replace(',','.');let n=Number(s);return Number.isFinite(n)?n:0};
const money=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(num(n));
const dec=n=>new Intl.NumberFormat('nl-NL',{maximumFractionDigits:2,minimumFractionDigits:0}).format(num(n));
const today=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
const uid=()=> globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const normalizedProject=s=>String(s??'').trim().toUpperCase();
const yearFromDate=d=>parseInt(String(d||'').slice(0,4),10);
const monthOf=r=>r.Datum?Number(r.Datum.slice(5,7)):num(r.BronMaand);
const sourceRows=r=>Number.isFinite(num(r.Uren))&&num(r.Uren)>0;
const round=n=>Math.round(n*100)/100;
function defaultDB(year){return {schema:DB_VERSION,year,Projecten:[],Activiteiten:DEFAULT_ACTIVITIES.map(a=>({Naam:a,SoortUren:/Administratie|Scholing|Acquisitie/i.test(a)?'INDIRECT':'DIRECT'})),Registraties:[],Declaraties:[],Declaratieregels:[],HistorischeDeclaraties:[],Instellingen:[{Sleutel:'StandaardUurtarief',Waarde:'0'},{Sleutel:'KilometerTarief',Waarde:year===2026?'0.25':''},{Sleutel:'Bedrijfsnaam',Waarde:'Lemson Architecten'}],Mutaties:[]};}
function cleanDB(data,year){let b=defaultDB(year);if(!data||typeof data!=='object')return b;for(const k of Object.keys(FIELDS)){if(Array.isArray(data[k]))b[k]=data[k].map(r=>({...r}));}b.year=year;b.schema=DB_VERSION;return b;}
function stored(y){try{let s=safeLocal.getItem(`la-db-${y}`);return s?cleanDB(JSON.parse(s),y):null;}catch(e){return null;}}
function initDB(y){return stored(y)||((y===2026&&window.LA_SEED)?cleanDB(window.LA_SEED,2026):defaultDB(y));}
const app={year:2026,db:null,page:'agenda',month:11,agendaDate:today(),agendaMode:'week',agendaProject:'',agendaKind:'',agendaSelected:'',projectFilter:'actueel',projectQuery:'',billingProject:'',billMethod:'',billHours:{},billOverride:'',billPercentage:0,billBase:0,showLegacy:false,showAllEntries:false,wizard:null,projectWizard:null,archiveYear:2026,monthProject:'',cloud:{url:safeLocal.getItem('la-stack-url')||'',password:safeSession.getItem(SESSION_PASSWORD_KEY)||'',etag:'',connected:false,dirty:false,busy:false,conflict:false},notifying:false};
const pendingKey=y=>`la-pending-${y}`;
const syncedKey=y=>`la-last-synced-${y}`;
const hasPending=y=>safeLocal.getItem(pendingKey(y))==='1';
let localRevision=0;
app.db=initDB(app.year);
function setting(k){return app.db.Instellingen.find(x=>x.Sleutel===k)?.Waarde??'';}
function setSetting(k,v){let s=app.db.Instellingen.find(x=>x.Sleutel===k);if(!s){s={Sleutel:k,Waarde:String(v)};app.db.Instellingen.push(s);}else s.Waarde=String(v);}
const dateLabel=(iso)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||'')))return 'Datum onbekend';
 const d=new Date(iso+'T12:00:00');return Number.isNaN(+d)?'Datum onbekend':new Intl.DateTimeFormat('nl-NL',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'}).format(d).replace(/\.$/,'');};
const logoValue=()=>{const v=setting('Bedrijfslogo');return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)&&v.length<31000?v:'';};
let pendingLogo=null;
function renderBrand(){
 const name=setting('Bedrijfsnaam').trim()||'Lemson Architecten';
 const el=document.getElementById('brandName'),icon=document.getElementById('brandIcon');if(!el||!icon)return;
 el.textContent=name;document.title=`${name} · Uren en kilometers`;
 const v=logoValue();if(v){icon.textContent='';const im=document.createElement('img');im.alt='Bedrijfslogo';im.src=v;icon.appendChild(im);icon.classList.add('has-logo');}
 else {icon.classList.remove('has-logo');icon.textContent=(name.match(/\b[\p{L}\p{N}]/gu)||['L','A']).slice(0,2).join('').toUpperCase();}
}
function showLogoPreview(){const el=$('brandLogoPreview');if(!el)return;const value=pendingLogo===null?logoValue():pendingLogo;
 el.innerHTML=value?`<img src="${E(value)}" alt="Voorbeeld logo">`:'Geen afbeelding gekozen';}
async function prepareLogo(file){
 if(!file)return; if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error('Gebruik PNG, JPG of WebP.');
 if(file.size>6*1024*1024)throw Error('Het logo mag maximaal 6 MB zijn.');
 const url=URL.createObjectURL(file);let img;
 try{img=await new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('Logo kon niet worden gelezen.'));im.src=url;});}
 finally{URL.revokeObjectURL(url);}
 let scale=Math.min(1,360/img.width,160/img.height),v='';
 for(let n=0;n<7;n++){
  const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));
  c.getContext('2d').drawImage(img,0,0,c.width,c.height);
  v=c.toDataURL('image/webp',.82);if(!v.startsWith('data:image/webp'))v=c.toDataURL('image/png');
  if(v.length<22000){pendingLogo=v;showLogoPreview();return;}scale*=.7;
 }
 throw Error('Logo te groot na verkleinen. Kies een eenvoudiger afbeelding.');
}
function saveBrand(){const name=$('businessName')?.value.trim();if(!name||name.length>100){notify('Vul een bedrijfsnaam in van maximaal 100 tekens.',true);return;}
 setSetting('Bedrijfsnaam',name);if(pendingLogo!==null)setSetting('Bedrijfslogo',pendingLogo);
 pendingLogo=null;audit('Gewijzigd','Instellingen','Bedrijfsidentiteit','Bedrijfsnaam of logo');persist();render();notify('Naam en logo bewaard.',false,true);
}
function project(n){return app.db.Projecten.find(p=>normalizedProject(p.Projectnummer)===normalizedProject(n));}
function projectName(n){return project(n)?.Omschrijving||'Onbekend project';}
function isActive(p){return !/^(n|nee|false|0)$/i.test(String(p.Actueel||'J'));}
function tariff(p){return num(p?.Uurtarief)||num(setting('StandaardUurtarief'));}
function regHours(r){return num(r.Uren);}
function allocations(rid){let ids=new Set(app.db.Declaraties.filter(d=>d.Status!=='vervallen').map(d=>d.Id));return app.db.Declaratieregels.filter(d=>d.RegistratieId===rid&&ids.has(d.DeclaratieId)).reduce((s,d)=>s+num(d.Uren),0);}
function availableHours(r){return Math.max(0,round(regHours(r)-num(r.VroegerGedeclareerdeUren)-allocations(r.Id)));}
function availableEntries(p){return app.db.Registraties.filter(r=>normalizedProject(r.Projectnummer)===normalizedProject(p)&&r.FacturatieStatus==='open'&&availableHours(r)>0).sort((a,b)=>String(a.Datum).localeCompare(String(b.Datum)));}
function unknownEntries(p){return app.db.Registraties.filter(r=>normalizedProject(r.Projectnummer)===normalizedProject(p)&&r.FacturatieStatus==='onbekend'&&regHours(r)>0).sort((a,b)=>String(b.Datum).localeCompare(String(a.Datum))||String(b.Aangemaakt||'').localeCompare(String(a.Aangemaakt||'')));}
function audit(action,type,id,details){app.db.Mutaties.push({Id:uid(),Tijdstip:new Date().toISOString(),Actie:action,Type:type,ObjectId:id,Details:typeof details==='string'?details:JSON.stringify(details)});}
function persist(){try{safeLocal.setItem(`la-db-${app.year}`,JSON.stringify(app.db));safeLocal.setItem(pendingKey(app.year),'1');localRevision++;app.cloud.dirty=true;syncStatus();if(app.cloud.connected&&!app.cloud.conflict) queueSave();}catch(e){notify('Opslaan op dit apparaat mislukt. Exporteer het bestand.',true);}}
let saveTimer=null;
function queueSave(){clearTimeout(saveTimer);saveTimer=setTimeout(()=>saveCloud(),1000);}
function syncStatus(){let label=hasPending(app.year)?'Lokale wijzigingen':'Lokaal bewaard',color='amber';if(app.cloud.connected){label=app.cloud.conflict?'Conflict · download eerst':app.cloud.busy?'Opslaan…':app.cloud.dirty?'Niet gesynchroniseerd':'STACK bijgewerkt';color=app.cloud.conflict?'red':app.cloud.dirty?'amber':'';}
 $('syncLabel').textContent=label;$('syncDot').className=`dot ${color}`;$('fileName').textContent=`LA-Uren-Km-${app.year}.xlsx`;$('footerHint').textContent=app.cloud.connected?'Moederbestand op STACK · automatisch synchroniseren': 'Lokaal op dit apparaat · exporteer het Excel-bestand of verbind STACK';}
function notify(message,error=false,ok=false){const el=$('notice');el.textContent=message;el.className='notice'+(error?' error':ok?' ok':'');el.hidden=false;clearTimeout(app.notifying);app.notifying=setTimeout(()=>{el.hidden=true},8500);}
function eventRender(){document.querySelectorAll('.tab').forEach(b=>{b.classList.toggle('active',b.dataset.page===app.page)});$('year').value=String(app.year);syncStatus();render();}
function pageTitle(title,caption='',actions=''){return `<div class="page-top"><div><h1>${title}</h1>${caption?`<p>${caption}</p>`:''}</div>${actions?`<div class="actions">${actions}</div>`:''}</div>`;}
function b(text,action,cls='',attrs=''){return `<button type="button" class="btn ${cls}" data-action="${action}" ${attrs}>${text}</button>`;}
function currentMonthRegs(){return app.db.Registraties.filter(r=>monthOf(r)===app.month&&(!r.Datum||yearFromDate(r.Datum)===app.year)).sort((a,b)=>String(b.Datum).localeCompare(String(a.Datum))||String(b.Aangemaakt).localeCompare(String(a.Aangemaakt)));}
function monthStats(){let rs=currentMonthRegs();return {hours:round(rs.reduce((s,r)=>s+regHours(r),0)),km:round(rs.reduce((s,r)=>s+num(r.Km),0)),yearHours:round(app.db.Registraties.reduce((s,r)=>s+regHours(r),0))};}
function initWizard(editId=''){let reg=editId?app.db.Registraties.find(r=>r.Id===editId):null;app.wizard={step:0,id:editId,Datum:reg?.Datum|| (today().startsWith(`${app.year}-`)?today():`${app.year}-${String(app.month).padStart(2,'0')}-01`),Projectnummer:reg?.Projectnummer||'',Activiteit:reg?.Activiteit||'',Uren:reg?.Uren??'',Omschrijving:reg?.Omschrijving||'',hasRide:!!num(reg?.Km),VanPostcode:reg?.VanPostcode||setting('StandaardVertrekPostcode')||'',NaarPostcode:reg?.NaarPostcode||'',Retour:reg?.Retour!=='Nee',Km:reg?.Km||'',ReistijdMinuten:reg?.ReistijdMinuten||'',KmMethode:reg?.KmMethode||'',SoortUren:reg?.SoortUren||'',OdometerBegin:reg?.OdometerBegin||'',OdometerEind:reg?.OdometerEind||'',WerkelijkVertrek:reg?.WerkelijkVertrek||'',WerkelijkeBestemming:reg?.WerkelijkeBestemming||'',RouteOpmerking:reg?.RouteOpmerking||''};}
function wizardSummary(w){let t=[];if(w.Datum)t.push(dateLabel(w.Datum));if(w.Projectnummer)t.push(w.Projectnummer);if(w.Activiteit)t.push(w.Activiteit);if(w.Uren)t.push(`${dec(w.Uren)} uur`);return t.map(x=>`<span>${E(x)}</span>`).join('');}
function stepMarkup(w){const s=w.step;let question='',content='',hint='';const field=(title,control,extra='')=>`<div class="field"><label>${title}</label>${control}${extra?`<small>${extra}</small>`:''}</div>`;
if(s===0){question='Op welke datum?';content=field('Datum',`<input id="wizValue" type="date" value="${E(w.Datum)}" max="${app.year}-12-31" min="${app.year}-01-01">`);}
if(s===1){question='Voor welk project?';let pro=[...app.db.Projecten].sort((a,b)=>Number(isActive(b))-Number(isActive(a))||String(a.Projectnummer).localeCompare(String(b.Projectnummer),'nl',{numeric:true}));content=field('Projectnummer',`<select id="wizValue" class="focus-input"><option value="">Kies project</option>${pro.map(p=>`<option value="${E(p.Projectnummer)}" ${normalizedProject(w.Projectnummer)===normalizedProject(p.Projectnummer)?'selected':''}>${E(p.Projectnummer)} · ${E(p.Omschrijving)}</option>`).join('')}</select>`)+(w.Projectnummer?`<p class="tagline">${E(projectName(w.Projectnummer))}</p>`:'')+`<button class="link-btn" type="button" data-action="new-project">+ Nieuw project</button>`;}
if(s===2){question='Wat heb je gedaan?';let opts=app.db.Activiteiten.map(a=>a.Naam);if(w.Activiteit&&!opts.includes(w.Activiteit))opts.unshift(w.Activiteit);content=field('Activiteit',`<select id="wizValue" class="focus-input"><option value="">Kies activiteit</option>${opts.map(a=>`<option value="${E(a)}" ${w.Activiteit===a?'selected':''}>${E(a)}</option>`).join('')}</select>`);}
if(s===3){question='Hoeveel uur?';content=field('Uren',`<input id="wizValue" class="focus-input" type="number" min="0" max="24" step="0.25" inputmode="decimal" placeholder="Bijv. 2,5" value="${E(w.Uren)}">`,'Een kwartier is 0,25 uur');}
if(s===4){question='Nog een toelichting?';content=field('Omschrijving · optioneel',`<textarea id="wizValue" placeholder="Korte toelichting">${E(w.Omschrijving)}</textarea>`);}
if(s===5){question='Kilometers gereden?';content=`<div class="actions">${b('Nee, opslaan','wizard-no-ride','primary')}${b('Ja, rit toevoegen','wizard-yes-ride')}</div>`;}
if(s===6){question='Waar vertrok je?';content=field('Postcode vertrek',`<input id="wizValue" class="focus-input" autocomplete="postal-code" placeholder="7462 MR" value="${E(w.VanPostcode)}">`,'Postcode of volledig adres');}
if(s===7){question='Waar ging je naartoe?';content=field('Postcode bestemming',`<input id="wizValue" class="focus-input" autocomplete="postal-code" placeholder="7511 AB" value="${E(w.NaarPostcode)}">`)+`<label class="check"><input type="checkbox" id="wizReturn" ${w.Retour?'checked':''}> Heen en terug</label><p class="subnote">Je kunt de afstand bij de volgende stap controleren.</p>`;}
if(s===8){question='Controleer de afstand';content=field('Kilometers totaal',`<input id="wizValue" class="focus-input" type="number" min="0" step="0.1" placeholder="Vul kilometers in" value="${E(w.Km)}">`)+`<div class="route-result" id="routeInfo">${w.Km?`${dec(w.Km)} km · ${E(w.KmMethode||'handmatig')}`:'Afstand wordt berekend of kan handmatig worden ingevuld.'}</div>`+`<details><summary class="link-btn">Ritgegevens aanvullen</summary><div class="divider"></div><div class="field"><label>Werkelijk vertrekadres</label><input id="rideStart" value="${E(w.WerkelijkVertrek)}"></div><div class="field"><label>Werkelijk aankomstadres</label><input id="rideEnd" value="${E(w.WerkelijkeBestemming)}"></div><div class="rowform"><div class="field"><label>Km-stand vertrek</label><input type="number" id="rideOdoStart" value="${E(w.OdometerBegin)}"></div><div class="field"><label>Km-stand aankomst</label><input type="number" id="rideOdoEnd" value="${E(w.OdometerEind)}"></div></div><div class="field"><label>Afwijkende route / toelichting</label><input id="rideRoute" value="${E(w.RouteOpmerking)}"></div><div class="field"><label>Reistijd (minuten)</label><input type="number" id="rideMinutes" min="0" value="${E(w.ReistijdMinuten)}"></div></details>`;}
let controls=s===5?'':`<div class="step-actions">${b('Vorige','wizard-back','ghost',s===0?'disabled':'')}<div class="actions">${s===4?b('Overslaan','wizard-skip'):''}${s===8?b('Opslaan','wizard-save','primary'):b('Verder','wizard-next','primary')}</div></div>`;
return `<div class="card"><div class="card-pad"><div class="step-marker">${w.id?'Registratie aanpassen':'Nieuwe registratie'} · ${Math.min(s+1,9)} / 9</div><div class="progress"><span style="width:${(s+1)/9*100}%"></span></div><div class="summary-tags">${wizardSummary(w)}</div><div class="guided-input"><h2 class="question">${question}</h2>${content}<div class="form-error" id="wizError"></div></div>${controls}${s===5?`<div class="step-actions">${b('Vorige','wizard-back','ghost')}</div>`:''}${w.id?`<div style="margin-top:12px">${b('Registratie verwijderen','delete-entry','small danger',`data-id="${E(w.id)}"`)}</div>`:''}</div></div>`;}
function renderRegistration(){const m=monthStats();const openHint=!app.db.Projecten.length?'<div class="card card-pad" style="margin-bottom:18px"><strong>Open het Excel-moederbestand</strong><p class="tagline">Importeer de urenregistratie 2026 of verbind STACK om te beginnen.</p><div class="actions"><button class="btn primary" data-action="open-first-import">Excel openen</button><button class="btn" data-action="open-stack-settings">STACK verbinden</button></div></div>':'';const entries=currentMonthRegs(),shown=app.showAllEntries?entries:entries.slice(0,6);let caption=`${MONTHS[app.month-1]} ${app.year}`;$('app').innerHTML=pageTitle('Registreren',caption,`<div class="month-nav">${b('‹','prev-month','small')}<span>${MONTHS[app.month-1]} ${app.year}</span>${b('›','next-month','small')}</div>`)+openHint+`<div class="kpis"><div class="kpi"><span>Uren deze maand</span><strong>${dec(m.hours)}</strong></div><div class="kpi"><span>Kilometers</span><strong>${dec(m.km)}</strong></div><div class="kpi"><span>Uren dit jaar</span><strong>${dec(m.yearHours)}</strong></div></div><div class="two-col"><div>${stepMarkup(app.wizard)}</div><div class="card"><div class="section-head"><h2>Registraties · ${MONTHS[app.month-1]}</h2><span class="muted">${entries.length} regels</span></div>${entries.length?`<div class="stack-list">${shown.map(r=>`<div class="entry"><div class="entry-day">${r.Datum?String(Number(r.Datum.slice(-2))).padStart(2,'0'):'—'}<small>${r.Datum?MONTHS[monthOf(r)-1].slice(0,3):'geen datum'}</small></div><div class="entry-label"><strong>${E(r.Activiteit||'Werkzaamheden')}</strong><small class="entry-full-date">${E(dateLabel(r.Datum))}${r.Begintijd&&r.Eindtijd?` · ${E(r.Begintijd)}–${E(r.Eindtijd)}`:""}</small><small>${E(r.Projectnummer)} · ${E(projectName(r.Projectnummer))}${r.Omschrijving?' · '+E(r.Omschrijving):''}</small></div><div class="entry-numbers"><strong>${dec(r.Uren)} u</strong><small>${num(r.Km)?dec(r.Km)+' km':''}</small><button class="link-btn" data-action="edit-entry" data-id="${E(r.Id)}">Wijzig</button></div></div>`).join('')}</div>${entries.length>6?`<div class="section-head">${b(app.showAllEntries?'Toon minder':'Toon alle regels','toggle-entries','small')}</div>`:''}`:`<div class="empty">Nog geen registraties voor deze maand.</div>`}</div></div>`;}
function projectHours(p,m){return round(app.db.Registraties.filter(r=>normalizedProject(r.Projectnummer)===normalizedProject(p)&&(m===0||monthOf(r)===m)).reduce((s,r)=>s+regHours(r),0));}
function renderProjects(){let pro=app.db.Projecten.filter(p=>(app.projectFilter==='alle'||(app.projectFilter==='actueel'&&isActive(p))||(app.projectFilter==='afgerond'&&!isActive(p)))&&(`${p.Projectnummer} ${p.Omschrijving}`.toLowerCase().includes(app.projectQuery.toLowerCase()))).sort((a,b)=>String(a.Projectnummer).localeCompare(String(b.Projectnummer),'nl',{numeric:true}));let total=round(app.db.Registraties.reduce((s,r)=>s+regHours(r),0));
 $('app').innerHTML=pageTitle('Projecten',`${pro.length} projecten · ${dec(total)} uur dit jaar`,b('+ Project','new-project','primary'))+`<div class="toolbar"><select id="projectFilter"><option value="actueel" ${app.projectFilter==='actueel'?'selected':''}>Actueel</option><option value="afgerond" ${app.projectFilter==='afgerond'?'selected':''}>Niet actueel</option><option value="alle" ${app.projectFilter==='alle'?'selected':''}>Alle projecten</option></select><input id="projectQuery" placeholder="Project zoeken" value="${E(app.projectQuery)}"><span class="muted" style="font-size:12px">Uren per maand · ${app.year}</span></div><div class="card table-scroll"><table class="data-table"><thead><tr><th>Project</th><th>Omschrijving</th><th>Status</th><th class="num">Totaal</th>${MONTHS.map(m=>`<th class="num">${m.slice(0,3)}</th>`).join('')}<th class="num">€/uur</th><th></th></tr></thead><tbody>${pro.map(p=>`<tr><td><strong>${E(p.Projectnummer)}</strong></td><td class="project-desc" title="${E(p.Omschrijving)}">${E(p.Omschrijving)}</td><td><span class="pill ${isActive(p)?'':'off'}">${isActive(p)?'Actueel':'Afgerond'}</span></td><td class="num"><strong>${dec(projectHours(p.Projectnummer,0))}</strong></td>${MONTHS.map((m,i)=>{let n=projectHours(p.Projectnummer,i+1);return `<td class="num ${!n?'empty-month':''}">${n?dec(n):'–'}</td>`}).join('')}<td class="num">${tariff(p)?money(tariff(p)):'—'}</td><td>${b('Wijzig','edit-project','small',`data-id="${E(p.Projectnummer)}"`)}</td></tr>`).join('')}</tbody></table>${!pro.length?`<div class="empty">Geen projecten in deze selectie.</div>`:''}</div>`;}
function billProjectOptions(){return app.db.Projecten.filter(p=>availableEntries(p.Projectnummer).length||unknownEntries(p.Projectnummer).length||app.db.Declaraties.some(d=>d.Projectnummer===p.Projectnummer)).sort((a,b)=>String(a.Projectnummer).localeCompare(String(b.Projectnummer),'nl',{numeric:true}));}
function initializeBilling(p){let pr=project(p);app.billingProject=p;app.billHours={};app.billOverride='';app.billPercentage=0;app.billBase=num(pr?.Contractbedrag);app.billMethod=pr?.Prijsafspraak||'Uren';}
function computedBill(){const p=project(app.billingProject),hrs=Object.values(app.billHours).reduce((s,v)=>s+num(v),0),rate=tariff(p),mode=app.billMethod;let result=mode==='Vast bedrag'?num(app.billBase):mode==='Percentage'?num(app.billBase)*num(app.billPercentage)/100:mode==='Vrij bedrag'?num(app.billOverride):hrs*rate;return {hrs:round(hrs),amount:round(result),rate};}
function billRecords(){let p=app.billingProject;let entries=availableEntries(p),unknown=unknownEntries(p);let histories=app.db.Declaraties.filter(d=>normalizedProject(d.Projectnummer)===normalizedProject(p)).sort((a,b)=>String(b.Datum).localeCompare(String(a.Datum)));let old=app.db.HistorischeDeclaraties.filter(d=>normalizedProject(d.Projectnummer)===normalizedProject(p));let {hrs,amount,rate}=computedBill();let mode=app.billMethod;return `<div class="billing-grid"><div><div class="card"><div class="section-head"><h2>Uren nog te declareren</h2><span class="muted">${entries.length} registraties</span></div>${entries.length?`<div class="bill-rows">${entries.map(r=>{let left=availableHours(r);let val=app.billHours[r.Id]??left;return `<div class="bill-row"><input type="checkbox" data-bill-check="${E(r.Id)}" ${val>0?'checked':''} aria-label="Regel opnemen"><div><strong>${r.Datum?new Date(r.Datum+'T12:00:00').toLocaleDateString('nl-NL'):'Datum onbekend'} · ${E(r.Activiteit)}</strong><small>${E(r.Omschrijving||'')}${r.Omschrijving?' · ':''}${dec(regHours(r))} uur geregistreerd${num(r.VroegerGedeclareerdeUren)?` · ${dec(r.VroegerGedeclareerdeUren)} uur eerder gedeclareerd`:''}</small></div><input type="number" min="0" max="${left}" step="0.25" data-bill-hours="${E(r.Id)}" value="${E(val)}" aria-label="Uren te declareren"></div>`}).join('')}</div>`:`<div class="empty">Geen vrijgegeven, openstaande uren.</div>`}</div>${unknown.length?`<div class="card history"><div class="section-head"><h2>Te beoordelen oude uren <span class="pill pending">${unknown.length}</span></h2>${b(app.showLegacy?'Sluiten':'Bekijken','toggle-legacy','small')}</div>${app.showLegacy?`<div class="bill-rows"><p class="tagline">In het oude bestand is niet per registratie vastgelegd wat al gedeclareerd is.</p>${unknown.map(r=>`<div class="bill-row"><span class="muted">?</span><div><strong>${E(r.Datum)} · ${E(r.Activiteit)}</strong><small>${E(r.Omschrijving)} · ${dec(r.Uren)} uur</small></div>${b('Beoordeel','review-legacy','small',`data-id="${E(r.Id)}"`)}</div>`).join('')}</div>`:''}</div>`:''}${histories.length?`<div class="card history"><div class="section-head"><h2>Declaraties</h2></div><div class="table-scroll"><table class="data-table"><thead><tr><th>Datum</th><th>Kenmerk</th><th>Uren</th><th>Bedrag excl.</th><th>Status</th><th></th></tr></thead><tbody>${histories.map(d=>{let hs=app.db.Declaratieregels.filter(x=>x.DeclaratieId===d.Id).reduce((s,r)=>s+num(r.Uren),0);return `<tr><td>${E(d.Datum)}</td><td>${E(d.Kenmerk||'—')}</td><td>${dec(hs)}</td><td>${money(d.BedragExBtw)}</td><td><span class="pill ${d.Status==='concept'?'pending':'off'}">${E(d.Status)}</span></td><td>${d.Status==='concept'?b('Verzonden','mark-sent','small',`data-id="${E(d.Id)}"`):''} ${d.Status==='concept'?b('Verwijder','delete-bill','small danger',`data-id="${E(d.Id)}"`):''}</td></tr>`}).join('')}</tbody></table></div></div>`:''}${old.length?`<details class="card history"><summary class="section-head" style="cursor:pointer"><h2>Bedragen uit oude projectlijst</h2></summary><div class="card-pad"><p class="tagline">Dit zijn oorspronkelijke bedragen en factuurnummers. De koppeling met specifieke uren is niet bekend.</p>${old.map(r=>`<div class="spaced" style="font-size:12px;padding:5px 0"><span>${E(r.Brontitel||r.BronKolom)}</span><strong>${E(r.Waarde)}</strong></div>`).join('')}</div></details>`:''}</div><div class="card bill-summary"><h2 style="font-size:15px;margin:0 0 18px">Declaratievoorstel</h2><div class="field"><label>Berekening</label><select id="billMethod"><option value="Uren" ${mode==='Uren'?'selected':''}>Uren × uurtarief</option><option value="Vast bedrag" ${mode==='Vast bedrag'?'selected':''}>Vast bedrag</option><option value="Percentage" ${mode==='Percentage'?'selected':''}>Percentage van projectbedrag</option><option value="Vrij bedrag" ${mode==='Vrij bedrag'?'selected':''}>Ander bedrag</option></select></div>${mode==='Uren'?`<p class="tagline">${dec(hrs)} uur × ${money(rate)}</p>`:''}${mode==='Vast bedrag'||mode==='Percentage'?`<div class="field"><label>Projectbedrag exclusief btw</label><input id="billBase" type="number" step="0.01" min="0" value="${E(app.billBase)}"></div>`:''}${mode==='Percentage'?`<div class="field"><label>Te declareren percentage</label><input id="billPercentage" type="number" step="0.1" min="0" max="100" value="${E(app.billPercentage)}"></div>`:''}${mode==='Vrij bedrag'?`<div class="field"><label>Bedrag exclusief btw</label><input id="billOverride" type="number" step="0.01" min="0" value="${E(app.billOverride)}"></div>`:''}<div class="bill-total"><small>Geselecteerde uren</small><strong>${dec(hrs)} <span class="smaller">uur</span></strong><div class="divider"></div><small>Voorgesteld bedrag exclusief btw</small><strong>${money(amount)}</strong></div><div class="field"><label>Kenmerk / factuurnummer · optioneel</label><input id="billReference" placeholder="Bijv. 26067"></div><div class="field"><label>Omschrijving · optioneel</label><input id="billNote" placeholder="Bijv. termijn 2"></div>${b('Declaratie vastleggen','create-bill','primary','style="width:100%"')}<p class="subnote">Dit registreert de declaratie. Het vervangt geen volledige btw-factuur.</p></div></div>`;}
function renderBilling(){let options=billProjectOptions();if(!app.billingProject||!project(app.billingProject)){initializeBilling(options[0]?.Projectnummer||'');}let p=project(app.billingProject);$('app').innerHTML=pageTitle('Declaraties','Openstaande uren en vastgelegde declaraties')+`<div class="toolbar"><select id="billingProject" style="min-width:min(100%,400px)">${options.map(x=>`<option value="${E(x.Projectnummer)}" ${app.billingProject===x.Projectnummer?'selected':''}>${E(x.Projectnummer)} · ${E(x.Omschrijving)}</option>`).join('')}</select></div>${p?billRecords():`<div class="card empty">Nog geen projecten met te declareren uren.</div>`}`;}
function renderOverview(){const months=MONTHS.map((m,i)=>{let rs=app.db.Registraties.filter(r=>monthOf(r)===i+1);return {m,hrs:round(rs.reduce((s,r)=>s+regHours(r),0)),direct:round(rs.filter(r=>r.SoortUren!=='INDIRECT').reduce((s,r)=>s+regHours(r),0)),indirect:round(rs.filter(r=>r.SoortUren==='INDIRECT').reduce((s,r)=>s+regHours(r),0)),km:round(rs.reduce((s,r)=>s+num(r.Km),0))};});let totals=months.reduce((a,x)=>({hrs:a.hrs+x.hrs,direct:a.direct+x.direct,indirect:a.indirect+x.indirect,km:a.km+x.km}),{hrs:0,direct:0,indirect:0,km:0});let rate=num(setting('KilometerTarief'));
 $('app').innerHTML=pageTitle('Overzicht',`Totaal ${app.year}`,`${b('Excel downloaden','export-excel')}${b('Afdrukken / PDF','print-report','primary')}`)+`<div class="kpis"><div class="kpi"><span>Totale uren</span><strong>${dec(totals.hrs)}</strong></div><div class="kpi"><span>Zakelijke kilometers</span><strong>${dec(totals.km)}</strong></div><div class="kpi"><span>Km-berekening privéauto</span><strong>${money(totals.km*rate)}</strong><small>${money(rate)} per km · indien van toepassing</small></div></div><div class="card table-scroll"><table class="data-table"><thead><tr><th>Maand</th><th class="num">Direct</th><th class="num">Indirect</th><th class="num">Totaal uren</th><th class="num">Kilometers</th><th class="num">Rekenbedrag km</th><th class="hide-print"></th></tr></thead><tbody>${months.map((r,i)=>`<tr><td>${E(r.m)}</td><td class="num">${dec(r.direct)}</td><td class="num">${dec(r.indirect)}</td><td class="num"><strong>${dec(r.hrs)}</strong></td><td class="num">${dec(r.km)}</td><td class="num">${money(r.km*rate)}</td><td class="hide-print">${b('Overzicht','month-overview','small',`data-month="${i+1}"`)}</td></tr>`).join('')}<tr><td><strong>Jaar</strong></td><td class="num"><strong>${dec(totals.direct)}</strong></td><td class="num"><strong>${dec(totals.indirect)}</strong></td><td class="num"><strong>${dec(totals.hrs)}</strong></td><td class="num"><strong>${dec(totals.km)}</strong></td><td class="num"><strong>${money(totals.km*rate)}</strong></td><td></td></tr></tbody></table></div><p class="tagline" style="margin-top:13px">Het kilometerbedrag is alleen een berekening voor privévervoer. Voor een zakelijke auto kan een andere fiscale behandeling gelden.</p>`;}
function renderMonthOverview(){const entries=currentMonthRegs().filter(r=>!app.monthProject||normalizedProject(r.Projectnummer)===normalizedProject(app.monthProject));const by={};for(const r of entries){let k=normalizedProject(r.Projectnummer);if(!by[k])by[k]={name:projectName(k),hrs:0,km:0};by[k].hrs+=regHours(r);by[k].km+=num(r.Km)};$('app').innerHTML=pageTitle(`${MONTHS[app.month-1]} ${app.year}`,'Maandoverzicht per project',`${b('CSV downloaden','export-month-csv')}${b('Afdrukken / PDF','print-report','primary')}`)+`<div class="toolbar hide-print"><div class="month-nav">${b('‹','prev-month','small')}<span>${MONTHS[app.month-1]} ${app.year}</span>${b('›','next-month','small')}</div><select id="monthProjectFilter"><option value="">Alle projecten</option>${app.db.Projecten.map(p=>`<option value="${E(p.Projectnummer)}" ${app.monthProject===p.Projectnummer?'selected':''}>${E(p.Projectnummer)} · ${E(p.Omschrijving)}</option>`).join('')}</select></div><div class="card table-scroll"><table class="data-table"><thead><tr><th>Project</th><th>Omschrijving</th><th class="num">Uren</th><th class="num">Km</th></tr></thead><tbody>${Object.entries(by).sort((a,b)=>a[0].localeCompare(b[0])).map(([no,row])=>`<tr><td>${E(no)}</td><td>${E(row.name)}</td><td class="num">${dec(row.hrs)}</td><td class="num">${dec(row.km)}</td></tr>`).join('')}${!entries.length?`<tr><td colspan="4" class="empty">Geen registraties</td></tr>`:''}</tbody></table></div><div class="card table-scroll history"><div class="section-head"><h2>Werkzaamheden</h2></div><table class="data-table"><thead><tr><th>Datum</th><th>Project</th><th>Activiteit</th><th>Omschrijving</th><th class="num">Uren</th><th class="num">Km</th></tr></thead><tbody>${entries.map(r=>`<tr><td>${E(dateLabel(r.Datum))}</td><td>${E(r.Projectnummer)}</td><td>${E(r.Activiteit)}</td><td>${E(r.Omschrijving)}</td><td class="num">${dec(r.Uren)}</td><td class="num">${dec(r.Km)}</td></tr>`).join('')}</tbody></table></div>`;}
function renderSettings(){let a=app.db.Activiteiten;let summary=app.cloud.connected?`<span class="pill">Verbonden</span>`:`<span class="pill pending">Niet verbonden</span>`;
 $('app').innerHTML=pageTitle('Instellingen','Gegevensbestand en vaste keuzes')+`<div class="card setting-card"><div class="section-head" style="padding:0 0 12px"><h2>Bedrijf</h2></div>
<div class="field"><label>Naam</label><input id="businessName" maxlength="100" value="${E(setting('Bedrijfsnaam')||'Lemson Architecten')}"></div>
<div class="field"><label>Logo · PNG, JPG of WebP</label><input id="businessLogoFile" type="file" accept="image/png,image/jpeg,image/webp"></div>
<div class="logo-setting-preview" id="brandLogoPreview"></div><div class="actions">${b('Logo verwijderen','remove-brand-logo','small')}${b('Naam en logo bewaren','save-brand','primary')}</div>
<div class="divider"></div><div class="section-head" style="padding:0 0 12px"><h2>Bestand</h2></div><div class="setting-row"><div><strong>Moederbestand</strong><small>LA-Uren-Km-${app.year}.xlsx</small></div><div class="actions">${b('Importeren','import-excel')}${b('Downloaden','export-excel','primary')}</div></div><input type="file" id="importFile" accept=".xlsx,.xls" hidden><div class="setting-row"><div><strong>STACK</strong><small>Opslaan en openen op verschillende computers</small></div>${summary}</div><div class="field"><label>Adres van beveiligde koppeling</label><input id="cloudUrl" type="url" placeholder="https://la-uren-stack.naam.workers.dev" value="${E(app.cloud.url)}"></div><p class="subnote">Dit is niet je STACK-adres. Het adres wordt zichtbaar zodra de beveiligde koppeling is ingericht.</p><div class="field"><label>Toegangscode</label><input id="cloudPassword" type="password" placeholder="${app.cloud.password?'Toegangscode is ingevoerd':'Toegangscode'}" autocomplete="off"></div><div class="actions">${b('Verbinden met STACK','connect-cloud','primary')}${app.cloud.connected?b('Verbinding verbreken','disconnect-cloud'):''}</div><div class="divider"></div><div class="section-head" style="padding:0 0 12px"><h2>Tarieven</h2></div><div class="setting-row"><div><strong>Standaard uurtarief</strong><small>Alleen gebruikt als een project geen eigen tarief heeft.</small></div><div class="field" style="margin:0"><input class="setting-input" type="number" min="0" step="0.01" id="defaultRate" value="${E(setting('StandaardUurtarief'))}" aria-label="Standaard uurtarief"></div></div><div class="setting-row"><div><strong>Kilometerbedrag voor eigen berekening</strong><small>Voor privévervoer in 2026 is de fiscale aftrek € 0,25 per zakelijke km.</small></div><div class="field" style="margin:0"><input class="setting-input" type="number" min="0" step="0.01" id="kmRate" value="${E(setting('KilometerTarief'))}" aria-label="Kilometertarief"></div></div><div class="actions" style="justify-content:flex-end;margin-top:12px">${b('Tarieven bewaren','save-settings','primary')}</div><div class="divider"></div><div class="section-head" style="padding:0 0 12px"><h2>Activiteiten</h2><span class="muted" style="font-size:12px">10 keuzes</span></div>${a.map((x,i)=>`<div class="setting-row"><div><strong>${i+1}. ${E(x.Naam)}</strong><small>${x.SoortUren==='INDIRECT'?'Indirect':'Direct'}</small></div>${b('Wijzig','edit-activity','small',`data-index="${i}"`)}</div>`).join('')}<div class="divider"></div><div class="section-head" style="padding:0 0 12px"><h2>Jaren</h2></div><div class="setting-row"><div><strong>Nieuw jaar</strong><small>Neem de projecten over. Uren en declaraties beginnen opnieuw.</small></div>${b(`${app.year+1} aanmaken`,'create-next-year')}</div><div class="divider"></div><div class="section-head" style="padding:0 0 12px"><h2>Archief</h2></div><p class="subnote">Bewaar het oorspronkelijke Numbers-bestand en geëxporteerde Excel-bestanden. Conceptdeclaraties zijn geen vervanging van verzonden facturen. Mutaties worden in het bestand geregistreerd.</p><div class="actions">${b('Mutaties exporteren','export-audit')}${b('Registraties CSV','export-register-csv')}</div></div>`;}
function renderAgenda(){
 const calendar=window.LAAgenda;
 if(!calendar){$('app').innerHTML='<div class="card card-pad">Agenda is niet geladen. Vernieuw de website.</div>';return;}
 if(!calendar.toDate && !/^\\d{4}-\\d{2}-\\d{2}$/.test(app.agendaDate))app.agendaDate=`${app.year}-01-01`;
 $('app').innerHTML=calendar.render({
  year:app.year,anchor:app.agendaDate,mode:app.agendaMode,project:app.agendaProject,kind:app.agendaKind,
  selectedId:app.agendaSelected,today:today(),entries:app.db.Registraties,projects:app.db.Projecten,
  getProjectName:projectName
 });
}
function render(){renderBrand();if(!app.wizard)initWizard();switch(app.page){case 'agenda':renderAgenda();break;case 'registreren':renderRegistration();break;case 'projecten':renderProjects();break;case 'declaraties':renderBilling();break;case 'overzicht':renderOverview();break;case 'maandoverzicht':renderMonthOverview();break;case 'instellingen':renderSettings();showLogoPreview();break;}}
function wizardRead(){let w=app.wizard,s=w.step,input=$('wizValue');if(s===0){w.Datum=input?.value||'';if(!w.Datum||yearFromDate(w.Datum)!==app.year)throw Error('Kies een datum in het geselecteerde jaar.');}
if(s===1){w.Projectnummer=input?.value||'';if(!project(w.Projectnummer))throw Error('Kies een project.');}
if(s===2){w.Activiteit=input?.value||'';if(!w.Activiteit)throw Error('Kies een activiteit.');let a=app.db.Activiteiten.find(x=>x.Naam===w.Activiteit);w.SoortUren=a?.SoortUren||w.SoortUren||'DIRECT';}
if(s===3){w.Uren=String(input?.value??'');if(!(num(w.Uren)>0&&num(w.Uren)<=24))throw Error('Vul het aantal uren in (maximaal 24).');}
if(s===4)w.Omschrijving=input?.value||'';
if(s===6){w.VanPostcode=input?.value.trim()||'';if(!w.VanPostcode)throw Error('Vul een vertrekpostcode of adres in.');}
if(s===7){w.NaarPostcode=input?.value.trim()||'';w.Retour=$('wizReturn')?.checked??true;if(!w.NaarPostcode)throw Error('Vul een bestemmingspostcode of adres in.');}
if(s===8){w.Km=String(input?.value??'');if(!(num(w.Km)>0))throw Error('Vul de gereden kilometers in.');for(const [key,id] of [['WerkelijkVertrek','rideStart'],['WerkelijkeBestemming','rideEnd'],['OdometerBegin','rideOdoStart'],['OdometerEind','rideOdoEnd'],['RouteOpmerking','rideRoute'],['ReistijdMinuten','rideMinutes']]){if($(id))w[key]=$(id).value;}if(!w.KmMethode)w.KmMethode='Handmatig';}}
function wizardNext(skip=false){try{if(!skip)wizardRead();}catch(e){$('wizError').textContent=e.message;return;}app.wizard.step++;render();if(app.wizard.step===8&&app.wizard.hasRide)routeAuto();else $('wizValue')?.focus();}
function wizardBack(){if(app.wizard.step>0){if(app.wizard.step===5)app.wizard.step=4;else app.wizard.step--;render();}}
async function routeAuto(){let w=app.wizard;let info=$('routeInfo');if(!info||!w.VanPostcode||!w.NaarPostcode)return;info.textContent='Afstand berekenen…';try{let data=await routeDistance(w.VanPostcode,w.NaarPostcode);if(app.wizard!==w||w.step!==8)return;w.Km=String(round(data.km*(w.Retour?2:1)));w.KmMethode=data.source||'Routeberekening (postcode)';$('wizValue').value=w.Km;info.textContent=`${dec(w.Km)} km ${w.Retour?'retour':'enkele reis'} · berekend vanaf postcodecentra. Controleer de werkelijk gereden afstand.`;}catch(e){if(!info.isConnected)return;info.textContent=`Automatisch berekenen mislukt: ${e.message}. Vul de gereden kilometers zelf in.`;}}
async function geocode(q){
 const postcode=String(q).trim().toUpperCase().replace(/\s+/g,'');
 const exact=/^[1-9][0-9]{3}[A-Z]{2}$/.test(postcode),u=new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
 u.searchParams.set('q',exact?postcode:q);u.searchParams.set('rows','10');
 if(exact)u.searchParams.set('fq','type:postcode');
 const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('Postcodezoeker niet beschikbaar');
 const json=await r.json(),rows=json?.response?.docs||[];
 const match=exact?rows.find(d=>String(d.postcode||d.weergavenaam||'').toUpperCase().replace(/\s+/g,'').includes(postcode)):rows[0];
 const d=match||(!exact?rows[0]:null);
 const text=d?.centroide_ll;
 const m=String(text||'').match(/^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i);
 if(!m)throw Error(`Geen locatie gevonden voor ${q}`);
 return [Number(m[1]),Number(m[2])];
}
async function routeDistance(from,to){
 if(app.cloud.connected){let q=`?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;
  try{let r=await fetch(`${app.cloud.url}/api/route${q}`,{headers:{Authorization:`Bearer ${app.cloud.password}`}});if(r.ok)return await r.json();}catch(e){/* gebruik publieke router indien beschikbaar */}}
 const [a,b]=await Promise.all([geocode(from),geocode(to)]);
 const u=`https://router.project-osrm.org/route/v1/driving/${a.join(',')};${b.join(',')}?overview=false`;
 const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw Error('Autoroute niet beschikbaar');
 const j=await r.json(),meters=j?.routes?.[0]?.distance;
 if(!Number.isFinite(meters)||meters<0)throw Error('Geen autoroute gevonden');
 return {km:round(meters/1000),source:'OSRM · postcodecentra (indicatief)'};
}
function saveWizard(){try{wizardRead();}catch(e){$('wizError').textContent=e.message;return;}let w=app.wizard,old=w.id?app.db.Registraties.find(r=>r.Id===w.id):null;if(!project(w.Projectnummer)){notify('Project niet gevonden.',true);return;}let now=new Date().toISOString();let val={Id:old?.Id||uid(),Datum:w.Datum,Begintijd:old?.Begintijd||'',Eindtijd:old?.Eindtijd||'',Projectnummer:w.Projectnummer,Activiteit:w.Activiteit,Omschrijving:w.Omschrijving,Uren:round(num(w.Uren)),SoortUren:w.SoortUren||'DIRECT',VanPostcode:w.hasRide?w.VanPostcode:'',NaarPostcode:w.hasRide?w.NaarPostcode:'',Retour:w.hasRide?(w.Retour?'Ja':'Nee'):'',Km:w.hasRide?round(num(w.Km)):0,ReistijdMinuten:w.hasRide?num(w.ReistijdMinuten):0,KmMethode:w.hasRide?w.KmMethode:'',OdometerBegin:w.hasRide?w.OdometerBegin:'',OdometerEind:w.hasRide?w.OdometerEind:'',WerkelijkVertrek:w.hasRide?w.WerkelijkVertrek:'',WerkelijkeBestemming:w.hasRide?w.WerkelijkeBestemming:'',RouteOpmerking:w.hasRide?w.RouteOpmerking:'',FacturatieStatus:old?.FacturatieStatus||'open',VroegerGedeclareerdeUren:old?.VroegerGedeclareerdeUren||0,BronMaand:old?.BronMaand||monthOf({Datum:w.Datum}),BronRij:old?.BronRij||'',Aangemaakt:old?.Aangemaakt||now,Gewijzigd:now};if(old&&regHours(val)<num(old.VroegerGedeclareerdeUren)+allocations(old.Id)){notify('De uren kunnen niet lager zijn dan de al gedeclareerde uren.',true);return;}if(old){let before={...old};Object.assign(old,val);audit('Gewijzigd','Registratie',old.Id,{voor:before,na:val});}else{app.db.Registraties.push(val);audit('Toegevoegd','Registratie',val.Id,val.Datum);}if(w.hasRide&&w.VanPostcode)setSetting('StandaardVertrekPostcode',w.VanPostcode);app.month=monthOf(val);initWizard();app.showAllEntries=false;persist();render();notify('Registratie opgeslagen.',false,true);}
function modal(title,body,actions){$('dialogRoot').innerHTML=`<div class="dialog-backdrop" role="presentation"><div class="dialog" role="dialog" aria-modal="true" aria-label="${E(title)}"><h2>${E(title)}</h2>${body}<div class="dialog-actions">${actions}</div></div></div>`;}
function closeModal(){clearTimeout(editRouteTimer);editRouteRun++;$('dialogRoot').innerHTML='';}
function initProjectWizard(id=''){if(id){openProjectEditor(id);return;}const old=id?project(id):null;app.projectWizard={id,step:0,Projectnummer:old?.Projectnummer||'',Omschrijving:old?.Omschrijving||'',Actueel:old?.Actueel||'J',Uurtarief:old?.Uurtarief||'',Prijsafspraak:old?.Prijsafspraak||'Uren',Contractbedrag:old?.Contractbedrag||'',Opmerking:old?.Opmerking||''};renderProjectWizard();}
function renderProjectWizard(){const w=app.projectWizard,s=w.step;let q=['Projectnummer','Omschrijving','Is dit project actueel?','Uurtarief','Prijsafspraak','Contractbedrag'][s];let val=w[q]||'',ctl='';if(s===2)ctl=`<select id="projectValue"><option value="J" ${w.Actueel==='J'?'selected':''}>Ja</option><option value="N" ${w.Actueel==='N'?'selected':''}>Nee</option></select>`;else if(s===4)ctl=`<select id="projectValue"><option value="Uren" ${w.Prijsafspraak==='Uren'?'selected':''}>Uurtarief</option><option value="Vast bedrag" ${w.Prijsafspraak==='Vast bedrag'?'selected':''}>Vast bedrag</option><option value="Percentage" ${w.Prijsafspraak==='Percentage'?'selected':''}>Percentage</option></select>`;else ctl=`<input id="projectValue" type="${s===3||s===5?'number':'text'}" ${s===3||s===5?'min="0" step="0.01"':''} ${s===0&&w.id?'readonly':''} value="${E(val)}" placeholder="${s===3?'Leeg = standaardtarief':''}">`;
let detail=s===3?'Leeg laten om het standaardtarief te gebruiken.':s===5?'Alleen nodig bij vaste bedragen of percentages.':'';modal(w.id?'Project wijzigen':'Nieuw project',`<div class="step-marker">${s+1} / 6</div><h3 class="question">${q}</h3><div class="field">${ctl}${detail?`<small>${detail}</small>`:''}</div><div id="projectError" class="form-error"></div>`,`${b('Vorige','project-back','ghost',s===0?'disabled':'')}${b(s===5?'Bewaren':'Verder','project-next','primary')}`);$('projectValue')?.focus();}
function saveProjectWizard(){let w=app.projectWizard,pr={Projectnummer:normalizedProject(w.Projectnummer),Omschrijving:w.Omschrijving,Actueel:w.Actueel,Uurtarief:round(num(w.Uurtarief))||'',Prijsafspraak:w.Prijsafspraak,Contractbedrag:round(num(w.Contractbedrag))||'',Opmerking:w.Opmerking};let old=w.id?project(w.id):null;if(old){Object.assign(old,pr);audit('Gewijzigd','Project',pr.Projectnummer,pr.Omschrijving);}else{app.db.Projecten.push(pr);audit('Toegevoegd','Project',pr.Projectnummer,pr.Omschrijving);}closeModal();persist();render();notify('Project bewaard.',false,true);if(app.page==='registreren'&&!old){app.wizard.Projectnummer=pr.Projectnummer;app.wizard.step=2;render();}}
function projectWizardNext(){let w=app.projectWizard,s=w.step,val=$('projectValue')?.value.trim();if(s===0){let no=normalizedProject(val);if(!no){$('projectError').textContent='Projectnummer invullen.';return;}if(!w.id&&project(no)){$('projectError').textContent='Dit nummer bestaat al.';return;}w.Projectnummer=no;}if(s===1){if(!val){$('projectError').textContent='Omschrijving invullen.';return;}w.Omschrijving=val;}if(s===2)w.Actueel=val;if(s===3)w.Uurtarief=val;if(s===4)w.Prijsafspraak=val;if(s===5)w.Contractbedrag=val;if(s<5){w.step++;renderProjectWizard();}else saveProjectWizard();}
// Eén compleet venster voor bestaande registraties. Nieuwe registraties behouden de stapsgewijze invoer.
let editRouteTimer=null,editRouteRun=0,editLastRouteKey='';
function editField(label,control){return `<div class="field"><label>${label}</label>${control}</div>`;}
function openEntryEditor(id,defaults={}){
 editLastRouteKey='';editRouteRun++;clearTimeout(editRouteTimer);
 const original=id?app.db.Registraties.find(x=>x.Id===id):null;
 if(id&&!original)return;
 if(!app.db.Projecten.length){notify('Voeg eerst een project toe of importeer het Excel-moederbestand.',true);return;}
 const r=original||{Id:'',Datum:defaults.Datum||today(),Projectnummer:app.agendaProject||app.db.Projecten.find(isActive)?.Projectnummer||app.db.Projecten[0].Projectnummer,Activiteit:app.db.Activiteiten[0]?.Naam||'',Omschrijving:'',Uren:defaults.Uren||1,Begintijd:defaults.Begintijd||'',Eindtijd:defaults.Eindtijd||'',Km:0,Retour:'Ja'};
 const projects=[...app.db.Projecten].sort((a,b)=>Number(isActive(b))-Number(isActive(a))||String(a.Projectnummer).localeCompare(String(b.Projectnummer),'nl',{numeric:true}));
 const activityNames=[...new Set([...app.db.Activiteiten.map(x=>x.Naam),r.Activiteit].filter(Boolean))];
 const ride=!!(num(r.Km)||r.VanPostcode||r.NaarPostcode);
 const input=(id,value,extra='')=>`<input id="${id}" value="${E(value??'')}" ${extra}>`;
 const body=`<div class="editor-grid">
  ${editField('Datum',input('editDate',r.Datum,`type="date" min="${app.year}-01-01" max="${app.year}-12-31"`))}
  ${editField('Project',`<select id="editProject">${projects.map(p=>`<option value="${E(p.Projectnummer)}" ${normalizedProject(r.Projectnummer)===normalizedProject(p.Projectnummer)?'selected':''}>${E(p.Projectnummer)} · ${E(p.Omschrijving)}</option>`).join('')}</select>`)}
  ${editField('Activiteit',`<select id="editActivity">${activityNames.map(x=>`<option ${x===r.Activiteit?'selected':''} value="${E(x)}">${E(x)}</option>`).join('')}</select>`)}
  ${editField('Begintijd · optioneel',input('editStartTime',r.Begintijd||'','type="time" step="300"'))}
  ${editField('Eindtijd · optioneel',input('editEndTime',r.Eindtijd||'','type="time" step="300"'))}
  ${editField('Uren',input('editHours',r.Uren,'type="number" min="0.01" max="24" step="0.01"'))}
  <div class="editor-wide">${editField('Omschrijving',`<textarea id="editDescription">${E(r.Omschrijving)}</textarea>`)}</div>
  </div><p class="agenda-time-hint" id="editTimeHint">Met twee tijden wordt het aantal uren automatisch berekend. Laat beide leeg om alleen uren te registreren.</p>
  <label class="check"><input id="editHasRide" type="checkbox" ${ride?'checked':''}> Autorit registreren</label>
  <div id="editRideFields" ${ride?'':'hidden'}>
    <div class="editor-grid">
    ${editField('Van postcode',input('editFrom',r.VanPostcode,'placeholder="7462 MR" autocomplete="postal-code"'))}
    ${editField('Naar postcode',input('editTo',r.NaarPostcode,'placeholder="7511 AB" autocomplete="postal-code"'))}
    <label class="check"><input id="editReturn" type="checkbox" ${r.Retour!=='Nee'?'checked':''}> Heen en terug</label>
    ${editField('Km totaal',input('editKm',r.Km,'type="number" min="0" step="0.1"'))}
    </div><p class="subnote" id="editRouteStatus">${E(r.KmMethode||'Berekening op basis van autoroute')}</p>
    ${b('Km opnieuw berekenen','recalculate-edit-km','small')}
    <details class="editor-details"><summary>Aanvullende ritgegevens</summary>
      <div class="editor-grid">${editField('Werkelijk vertrek',input('editAddressFrom',r.WerkelijkVertrek))}${editField('Werkelijke bestemming',input('editAddressTo',r.WerkelijkeBestemming))}${editField('Km-stand begin',input('editOdoFrom',r.OdometerBegin,'type="number" min="0"'))}${editField('Km-stand eind',input('editOdoTo',r.OdometerEind,'type="number" min="0"'))}${editField('Reistijd minuten',input('editRideMinutes',r.ReistijdMinuten,'type="number" min="0"'))}${editField('Route-opmerking',input('editRideNote',r.RouteOpmerking))}</div>
    </details>
  </div><div id="editError" class="form-error" aria-live="polite"></div>`;
 modal(original?'Registratie wijzigen':'Registratie toevoegen',body,`${b('Annuleren','close-modal')}${b('Bewaren','save-entry-edit','primary',`data-id="${E(id)}"`)}`);
 const d=$('dialogRoot').querySelector('.dialog');d.classList.add('wide-editor');syncEditDuration();
}
function syncEditDuration(){
 const start=$('editStartTime')?.value||'',end=$('editEndTime')?.value||'';
 const hours=$('editHours'),hint=$('editTimeHint');if(!hours||!hint)return;
 const calculated=window.LAAgenda?.duration(start,end);
 if(start&&end){
  if(calculated!==null&&calculated>0){hours.readOnly=true;hours.value=String(calculated);hint.textContent='Duur automatisch berekend op basis van begin- en eindtijd.';hint.classList.remove('error');}
  else{hours.readOnly=true;hint.textContent='Eindtijd moet later zijn dan begintijd, op dezelfde dag.';hint.classList.add('error');}
 }else{
  hours.readOnly=false;
  hint.textContent=start||end?'Vul beide tijden in, of verwijder beide tijden om uren handmatig in te voeren.':'Geen tijden ingevuld: vul het aantal uren zelf in.';
  hint.classList.remove('error');
 }
}
function toggleEditRide(){const panel=$('editRideFields');if(panel)panel.hidden=!$('editHasRide').checked;if($('editHasRide').checked)scheduleEditRoute();}
function scheduleEditRoute(){const from=$('editFrom')?.value.trim(),to=$('editTo')?.value.trim();
 if(!$('editHasRide')?.checked||!from||!to)return;const key=JSON.stringify([from,to,$('editReturn')?.checked]);if(key===editLastRouteKey)return;
 editLastRouteKey=key;editRouteRun++;clearTimeout(editRouteTimer);if($('editKm'))$('editKm').value='';const status=$('editRouteStatus');if(status)status.textContent='Autoroute wordt berekend…';editRouteTimer=setTimeout(calculateEditKm,650);
}
async function calculateEditKm(){
 clearTimeout(editRouteTimer);const from=$('editFrom')?.value.trim(),to=$('editTo')?.value.trim(),ret=$('editReturn')?.checked;
 const status=$('editRouteStatus');if(!status)return;
 if(!from||!to){status.textContent='Vul beide postcodes in.';return;}
 status.textContent='Autoroute berekenen…';const request=++editRouteRun;
 try{const result=await routeDistance(from,to);if(request!==editRouteRun||!$('editFrom')||$('editFrom').value.trim()!==from||$('editTo').value.trim()!==to)return;
  const distance=round(result.km*(ret?2:1));$('editKm').value=distance;$('editKm').dataset.method=result.source||'Autoroute op postcodes';
  status.textContent=`${dec(distance)} km ${ret?'heen en terug':'enkele reis'} · indicatief, corrigeer indien nodig.`;
 }catch(e){if(request!==editRouteRun||!$('editRouteStatus'))return;status.textContent=`Niet automatisch berekend: ${e.message}. Vul km handmatig in.`;}
}
function saveEntryEdit(id){
 const original=id?app.db.Registraties.find(r=>r.Id===id):null;if(id&&!original)return;
 const msg=$('editError'),fail=t=>{if(msg)msg.textContent=t;};
 const date=$('editDate').value,pr=$('editProject').value,activity=$('editActivity').value;
 const start=$('editStartTime')?.value||'',end=$('editEndTime')?.value||'';
 if(yearFromDate(date)!==app.year||!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return fail('Vul een datum in dit jaar in.');
 if(!project(pr))return fail('Kies een geldig project.');
 if(!activity)return fail('Kies een activiteit.');
 if(Boolean(start)!==Boolean(end))return fail('Vul beide tijden in, of laat beide leeg.');
 const duration=start?window.LAAgenda?.duration(start,end):null;
 if(start&&(duration===null||duration===undefined||duration<=0))return fail('Eindtijd moet later zijn dan begintijd op dezelfde dag.');
 const hours=start?duration:num($('editHours').value);
 if(!(hours>0&&hours<=24))return fail('Vul een geldig aantal uren in (maximaal 24).');
 if(original&&hours+0.0001<num(original.VroegerGedeclareerdeUren)+allocations(id))return fail('Minder uren dan al gedeclareerd is niet toegestaan.');
 if(start){
  const a=window.LAAgenda.minute(start),b=window.LAAgenda.minute(end);
  const overlap=app.db.Registraties.find(r=>r.Id!==id&&r.Datum===date&&window.LAAgenda.interval(r)&&a<window.LAAgenda.interval(r).end&&b>window.LAAgenda.interval(r).start);
  if(overlap&&!confirm('Dit tijdvak overlapt een andere registratie op '+date+'. Toch bewaren?'))return;
 }
 const ride=$('editHasRide').checked,from=ride?$('editFrom').value.trim():'',to=ride?$('editTo').value.trim():'',km=ride?num($('editKm').value):0;
 if(ride&&(!from||!to))return fail('Vul de vertrek- en bestemmingspostcode in.');
 if(ride&&(!(km>=0)||!Number.isFinite(km)))return fail('Vul geldige kilometers in.');
 if(ride&&!$('editKm').value.trim())return fail('Laat de kilometers berekenen of vul ze zelf in.');
 const now=new Date().toISOString();
 const updated={Datum:date,Begintijd:start,Eindtijd:end,Projectnummer:pr,Activiteit:activity,Omschrijving:$('editDescription').value,Uren:round(hours),SoortUren:app.db.Activiteiten.find(a=>a.Naam===activity)?.SoortUren||original?.SoortUren||'DIRECT',VanPostcode:from,NaarPostcode:to,Retour:ride?($('editReturn').checked?'Ja':'Nee'):'',Km:ride?round(km):0,KmMethode:ride?($('editKm').dataset.method||(km!==num(original?.Km)?'Handmatig':original?.KmMethode||'Handmatig')):'',WerkelijkVertrek:ride?$('editAddressFrom').value:'',WerkelijkeBestemming:ride?$('editAddressTo').value:'',OdometerBegin:ride?$('editOdoFrom').value:'',OdometerEind:ride?$('editOdoTo').value:'',ReistijdMinuten:ride?num($('editRideMinutes').value):0,RouteOpmerking:ride?$('editRideNote').value:'',BronMaand:Number(date.slice(5,7)),Gewijzigd:now};
 let saved;
 if(original){
  const previous={...original};Object.assign(original,updated);saved=original;
  audit('Gewijzigd','Registratie',id,{voor:previous,na:{...original}});
 }else{
  saved={Id:uid(),...updated,FacturatieStatus:'open',VroegerGedeclareerdeUren:0,BronRij:'',Aangemaakt:now};
  app.db.Registraties.push(saved);audit('Toegevoegd','Registratie',saved.Id,{datum:date,project:pr,uren:hours});
 }
 if(ride&&from)setSetting('StandaardVertrekPostcode',from);
 app.month=Number(date.slice(5,7));app.agendaDate=date;app.agendaSelected=saved.Id;
 closeModal();initWizard();persist();render();notify(original?'Registratie gewijzigd.':'Registratie toegevoegd.',false,true);
}
function openProjectEditor(id){
 const p=project(id);if(!p)return;const input=(name,v,attr='')=>`<input id="${name}" value="${E(v??'')}" ${attr}>`;
 modal('Project wijzigen',`<div class="editor-grid">
  ${editField('Projectnummer',input('projectEditNo',p.Projectnummer,'maxlength="32"'))}
  ${editField('Omschrijving',input('projectEditName',p.Omschrijving,'maxlength="200"'))}
  ${editField('Actueel',`<select id="projectEditActive"><option value="J" ${isActive(p)?'selected':''}>Ja</option><option value="N" ${!isActive(p)?'selected':''}>Nee</option></select>`)}
  ${editField('Uurtarief (leeg = standaard)',input('projectEditRate',p.Uurtarief,'type="number" min="0" step="0.01"'))}
  ${editField('Prijsafspraak',`<select id="projectEditType">${['Uren','Vast bedrag','Percentage'].map(x=>`<option value="${x}" ${p.Prijsafspraak===x?'selected':''}>${x}</option>`).join('')}</select>`)}
  ${editField('Contractbedrag',input('projectEditAmount',p.Contractbedrag,'type="number" min="0" step="0.01"'))}
  <div class="editor-wide">${editField('Opmerking',`<textarea id="projectEditNote">${E(p.Opmerking)}</textarea>`)}</div>
 </div><div id="projectEditError" class="form-error" aria-live="polite"></div>`,`${b('Annuleren','close-modal')}${b('Bewaren','save-project-edit','primary',`data-id="${E(id)}"`)}`);
 $('dialogRoot').querySelector('.dialog').classList.add('wide-editor');
}
function saveProjectEdit(id){
 const p=project(id);if(!p)return;
 const no=normalizedProject($('projectEditNo').value),desc=$('projectEditName').value.trim(),rate=$('projectEditRate').value,amount=$('projectEditAmount').value;
 if(!no||no.length>32){$('projectEditError').textContent='Vul een geldig projectnummer in.';return;}
 if(no!==normalizedProject(id)&&project(no)){$('projectEditError').textContent='Dit projectnummer bestaat al.';return;}
 if(!desc){$('projectEditError').textContent='Omschrijving invullen.';return;}
 if((rate&&(!Number.isFinite(Number(rate))||Number(rate)<0))||(amount&&(!Number.isFinite(Number(amount))||Number(amount)<0))){$('projectEditError').textContent='Gebruik positieve bedragen.';return;}
 const old={...p};Object.assign(p,{Projectnummer:no,Omschrijving:desc,Actueel:$('projectEditActive').value,Uurtarief:rate?round(Number(rate)):'',Prijsafspraak:$('projectEditType').value,Contractbedrag:amount?round(Number(amount)):'',Opmerking:$('projectEditNote').value});
 if(no!==normalizedProject(id)){for(const sheet of ['Registraties','Declaraties','HistorischeDeclaraties'])for(const row of app.db[sheet])if(normalizedProject(row.Projectnummer)===normalizedProject(id))row.Projectnummer=no;if(normalizedProject(app.billingProject)===normalizedProject(id))app.billingProject=no;if(normalizedProject(app.wizard?.Projectnummer)===normalizedProject(id))app.wizard.Projectnummer=no;}
 audit('Gewijzigd','Project',id,{voor:old,na:{...p}});closeModal();persist();render();notify('Project gewijzigd.',false,true);
}
function reviewLegacy(id){let r=app.db.Registraties.find(x=>x.Id===id);if(!r)return;modal('Historische uren beoordelen',`<p class="tagline">${E(r.Datum)} · ${E(r.Activiteit)} · ${dec(r.Uren)} uur</p><div class="field"><label>Wat is al gedeclareerd?</label><select id="reviewMode"><option value="0">Nog niets</option><option value="${num(r.Uren)}">Alles</option><option value="partial">Een deel</option></select></div><div class="field hide" id="reviewPartialWrap"><label>Reeds gedeclareerde uren</label><input id="reviewPartial" type="number" min="0" max="${num(r.Uren)}" step="0.25"></div><p class="subnote">De resterende uren worden beschikbaar voor nieuwe declaraties.</p>`,`${b('Annuleren','close-modal')}${b('Bewaren','save-review','primary',`data-id="${E(id)}"`)}`);$('reviewMode').addEventListener('change',e=>$('reviewPartialWrap').classList.toggle('hide',e.target.value!=='partial'));}
function saveReview(id){let r=app.db.Registraties.find(x=>x.Id===id);if(!r)return;let selected=$('reviewMode').value,v=selected==='partial'?num($('reviewPartial').value):num(selected);if(v>num(r.Uren)||v<0){notify('Aantal al gedeclareerde uren is ongeldig.',true);return;}r.VroegerGedeclareerdeUren=v;r.FacturatieStatus='open';r.Gewijzigd=new Date().toISOString();audit('Beoordeeld','Historische uren',id,`${v} van ${r.Uren} uur al gedeclareerd`);closeModal();persist();render();}
function createBill(){let p=project(app.billingProject);if(!p)return;for(let r of availableEntries(p.Projectnummer)){let v=num(app.billHours[r.Id]??availableHours(r));if(v<0||v>availableHours(r)+.0001){notify('Uren overschrijden het openstaande saldo.',true);return;}}let {hrs,amount,rate}=computedBill(),mode=app.billMethod;if((mode==='Uren'&&hrs<=0)||(mode==='Percentage'&&num(app.billPercentage)<=0)||(mode!=='Uren'&&amount<=0)){notify('Selecteer uren of vul een geldig bedrag in.',true);return;}if(amount<=0&&mode==='Uren'){notify('Stel eerst een uurtarief in bij het project.',true);return;}let d={Id:uid(),Projectnummer:p.Projectnummer,Datum:today(),Kenmerk:$('billReference')?.value.trim()||'',Status:'concept',Methode:mode,Uurtarief:rate,Percentage:mode==='Percentage'?num(app.billPercentage):'',Grondslag:mode==='Percentage'||mode==='Vast bedrag'?num(app.billBase):'',BedragExBtw:amount,BtwPercentage:'',Opmerking:$('billNote')?.value||'',Aangemaakt:new Date().toISOString()};for(let r of availableEntries(p.Projectnummer)){let v=num(app.billHours[r.Id]??availableHours(r));if(v>0)app.db.Declaratieregels.push({Id:uid(),DeclaratieId:d.Id,RegistratieId:r.Id,Uren:v,Omschrijving:r.Activiteit});}app.db.Declaraties.push(d);audit('Toegevoegd','Declaratie',d.Id,`${p.Projectnummer}, ${hrs} uur, ${amount} euro`);persist();initializeBilling(p.Projectnummer);render();notify('Declaratievoorstel vastgelegd. Uren zijn gereserveerd.',false,true);}
function createNextYear(){let target=app.year+1;let existing=stored(target);if(existing){notify(`Bestand voor ${target} bestaat al.`,true);return;}modal(`Nieuw jaar ${target}`,`<p>Projecten en activiteiten overnemen uit ${app.year}. Registraties, declaraties en uren beginnen op nul.</p><p class="subnote">Het bestaande jaar blijft ongewijzigd.</p>`,`${b('Annuleren','close-modal')}${b('Jaar aanmaken','confirm-new-year','primary')}`);}
function confirmNextYear(){let next=app.year+1,n=defaultDB(next);n.Projecten=app.db.Projecten.map(p=>({...p}));n.Activiteiten=app.db.Activiteiten.map(a=>({...a}));for(let key of ['Bedrijfsnaam','Bedrijfslogo']){const found=app.db.Instellingen.find(x=>x.Sleutel===key);if(found)n.Instellingen.push({...found});}let oldR=setting('StandaardUurtarief');n.Instellingen.find(x=>x.Sleutel==='StandaardUurtarief').Waarde=oldR;audit('Jaar aangemaakt','Jaar',String(next),'Projectlijst meegenomen');safeLocal.setItem(`la-db-${next}`,JSON.stringify(n));safeLocal.setItem(pendingKey(next),'1');closeModal();changeYear(next);notify(`${next} aangemaakt. Download het nieuwe Excel-bestand of koppel STACK.`,false,true);}
function changeYear(y){pendingLogo=null;if(!Number.isInteger(y)||y<2020||y>2100)return;clearTimeout(saveTimer);if(app.cloud.connected&&(app.cloud.dirty||app.cloud.busy)){notify('Het vorige jaar is nog niet gesynchroniseerd. Download het bestand eerst.',true);$('year').value=String(app.year);return;}app.year=y;app.db=initDB(y);app.agendaDate=y===new Date().getFullYear()?today():`${y}-01-01`;app.agendaSelected='';app.agendaProject='';localRevision=0;app.month=y===new Date().getFullYear()?new Date().getMonth()+1:1;app.cloud.etag='';app.cloud.connected=false;app.cloud.dirty=hasPending(y);app.cloud.conflict=false;app.showLegacy=false;app.billingProject='';initWizard();eventRender();if(app.cloud.url&&app.cloud.password)void connectCloud({automatic:true});}
function workbookBytes(){if(!window.XLSX)throw Error('Excelbibliotheek niet geladen. Controleer de internetverbinding.');let wb=XLSX.utils.book_new();for(let [name,headers] of Object.entries(FIELDS)){let rows=app.db[name].map(r=>Object.fromEntries(headers.map(k=>[k,r[k]??''])));let ws=XLSX.utils.json_to_sheet(rows,{header:headers,skipHeader:false});ws['!cols']=headers.map(h=>({wch:Math.min(35,Math.max(12,h.length+3))}));XLSX.utils.book_append_sheet(wb,ws,name);}const hd=['Projectnummer','Omschrijving','Actueel','Jaaruren',...MONTHS.map(m=>m.slice(0,3)),'Uurtarief','Prijsafspraak'];const report=[hd];for(const p of app.db.Projecten){const monthly=MONTHS.map((_,i)=>projectHours(p.Projectnummer,i+1));report.push([p.Projectnummer,p.Omschrijving,p.Actueel,round(monthly.reduce((a,b)=>a+b,0)),...monthly,p.Uurtarief||'',p.Prijsafspraak||'']);}const sheet=XLSX.utils.aoa_to_sheet(report);sheet['!cols']=hd.map((h,i)=>({wch:i===1?45:Math.max(12,h.length+2)}));XLSX.utils.book_append_sheet(wb,sheet,'Projectoverzicht');return XLSX.write(wb,{bookType:'xlsx',type:'array'});}
function parseWorkbook(buf){if(!window.XLSX)throw Error('Excelbibliotheek niet geladen.');const wb=XLSX.read(buf,{type:'array',cellDates:false});if(!wb.SheetNames.includes('Registraties')||!wb.SheetNames.includes('Projecten'))throw Error('Dit is geen LA-urenbestand. Gebruik de bijgeleverde 2026-database.');let data=defaultDB(app.year);for(const name of Object.keys(FIELDS)){let sheet=wb.Sheets[name];data[name]=sheet?XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}):[];}return cleanDB(data,app.year);}
function downloadBytes(bytes,name,mime){let blob=new Blob([bytes],{type:mime});let u=URL.createObjectURL(blob);let a=document.createElement('a');a.href=u;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),3000);}
function exportExcel(){try{downloadBytes(workbookBytes(),`LA-Uren-Km-${app.year}.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');}catch(e){notify(e.message,true);}}
function downloadCSV(rows,headers,name){let qs=v=>`"${String(v??'').replace(/"/g,'""')}"`;let text='\uFEFF'+[headers.join(';'),...rows.map(r=>headers.map(h=>qs(r[h])).join(';'))].join('\r\n');downloadBytes(text,name,'text/csv;charset=utf-8');}
function importWorkbook(file){if(!file)return;const found=file.name.match(/20\d{2}/);if(found&&Number(found[0])!==app.year){notify(`Bestand is voor ${found[0]}. Selecteer eerst dat jaar.`,true);return;}file.arrayBuffer().then(buf=>{let db=parseWorkbook(buf);if(!confirm(`Huidig jaar ${app.year} vervangen door ${file.name}? Niet geëxporteerde wijzigingen gaan verloren.`))return;app.db=db;app.cloud.dirty=true;app.cloud.connected=false;app.cloud.etag='';app.month=app.year===new Date().getFullYear()?new Date().getMonth()+1:1;initWizard();persist();app.page='registreren';eventRender();notify('Bestand geïmporteerd. Maak eerst een export of verbind opnieuw met STACK.',false,true);}).catch(e=>notify(e.message,true));}
function makeBaseUrl(s){let u=new URL(s);if(u.protocol!=='https:')throw Error('Gebruik een HTTPS-adres.');return u.origin+u.pathname.replace(/\/$/,'');}
function cloudHeaders(extra={}){return {Authorization:`Bearer ${app.cloud.password}`,...extra};}
let cloudConnecting=false;
async function connectCloud({automatic=false}={}){
 if(cloudConnecting)return;
 cloudConnecting=true;
 const revisionBefore=localRevision;
 try {
  const fieldUrl=automatic?app.cloud.url:($('cloudUrl')?.value.trim()||app.cloud.url);
  const url=makeBaseUrl(fieldUrl);
  const password=automatic?app.cloud.password:($('cloudPassword')?.value||app.cloud.password);
  if(!password){if(!automatic)throw Error('Toegangscode invullen.');return;}
  if(url.includes('stack.storage'))throw Error('Vul hier het Cloudflare Worker-adres in, niet het STACK-adres.');
  const year=app.year;
  const r=await fetch(`${url}/api/year/${year}`,{headers:{Authorization:`Bearer ${password}`},cache:'no-store'});
  if(year!==app.year||revisionBefore!==localRevision){if(!automatic)notify('Er zijn tijdens verbinden wijzigingen gemaakt. Verbind opnieuw om ze veilig op te slaan.',true);return;}
  if(r.status===404){
   if(automatic){notify(`Geen online jaarbestand voor ${year}. Open Instellingen om dit jaarbestand op STACK aan te maken.`);return;}
   if(!confirm(`Er staat nog geen ${year}-bestand op STACK. De gegevens van dit apparaat als nieuw moederbestand opslaan?`))return;
   app.cloud.url=url;app.cloud.password=password;safeLocal.setItem('la-stack-url',url);rememberCloudPassword(password);
   app.cloud.connected=true;app.cloud.etag='*';app.cloud.dirty=true;app.cloud.conflict=false;
   await saveCloud();eventRender();return;
  }
  if(!r.ok)throw Error(`STACK: ${r.status} · ${await r.text()}`);
  const etag=r.headers.get('etag')||'';
  if(!etag)throw Error('Bestandsversie ontbreekt. De koppeling kan niet veilig werken.');
  const remote=parseWorkbook(await r.arrayBuffer());
  if(year!==app.year||revisionBefore!==localRevision){if(!automatic)notify('Er zijn tijdens verbinden wijzigingen gemaakt. Verbind opnieuw om ze veilig op te slaan.',true);return;}
  const localExists=!!safeLocal.getItem(`la-db-${year}`);
  const pending=hasPending(year);
  const lastSynced=safeLocal.getItem(syncedKey(year));
  if(pending&&lastSynced===etag){
   // De lokale kopie is gebaseerd op exact dezelfde online bestandsversie.
   // Daardoor kunnen wijzigingen veilig met If-Match worden weggeschreven.
   app.cloud.url=url;app.cloud.password=password;safeLocal.setItem('la-stack-url',url);rememberCloudPassword(password);
   app.cloud.connected=true;app.cloud.etag=etag;app.cloud.dirty=true;app.cloud.conflict=false;
   eventRender();queueSave();notify('Lokale wijzigingen worden op STACK opgeslagen.',false,true);
   return;
  }
  if(pending){
   // Zonder overeenkomende ETag nooit oude of onbekende online wijzigingen overschrijven.
   if(automatic){
    notify('Er staan lokale wijzigingen en een andere versie op STACK. Je gegevens blijven lokaal bewaard. Open Instellingen om dit te controleren.',true);
   }else{
    if(confirm('Dit apparaat heeft lokale wijzigingen, maar het online bestand heeft een andere of onbekende versie. Een lokale Excel-back-up downloaden? Het online bestand blijft ongewijzigd.')){
     downloadBytes(workbookBytes(),`LA-Uren-Km-${year}-LOKALE-BACKUP.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    }
    notify('Er is geen veilige automatische samenvoeging mogelijk. Je lokale wijzigingen zijn bewaard; het bestand op STACK is niet overschreven.',true);
   }
   return;
  }
  if(localExists&&!lastSynced){
   if(automatic){notify('Er staat een lokale versie zonder synchronisatiegeschiedenis. Verbind handmatig om een back-up te maken.');return;}
   if(!confirm(`Dit apparaat heeft een eigen bestand voor ${year}. Eerst een Excel-back-up downloaden voordat het bestand van STACK wordt geopend?`))return;
   downloadBytes(workbookBytes(),`LA-Uren-Km-${year}-LOKALE-BACKUP.xlsx`,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
   if(!confirm('Controleer de gedownloade back-up. Lokale gegevens vervangen door de versie op STACK?'))return;
  }
  app.db=remote;localRevision=0;
  app.cloud.url=url;app.cloud.password=password;safeLocal.setItem('la-stack-url',url);rememberCloudPassword(password);
  app.cloud.connected=true;app.cloud.etag=etag;app.cloud.dirty=false;app.cloud.conflict=false;
  safeLocal.setItem(`la-db-${year}`,JSON.stringify(remote));
  safeLocal.removeItem(pendingKey(year));safeLocal.setItem(syncedKey(year),etag);
  initWizard();if(!automatic)app.page='agenda';eventRender();
  if(!automatic)notify('Bestand opgehaald van STACK.',false,true);
 }catch(e){app.cloud.connected=false;app.cloud.dirty=hasPending(app.year);notify(e.message,true);}
 finally {cloudConnecting=false;syncStatus();}
}
let cloudSaving=false;
async function saveCloud(){
 if(!app.cloud.connected||cloudSaving||app.cloud.conflict||!app.cloud.dirty)return;
 cloudSaving=true;app.cloud.busy=true;syncStatus();
 const year=app.year,revision=localRevision;
 try {
  const token=app.cloud.etag,bytes=workbookBytes();
  const headers=cloudHeaders({'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
  if(token==='*')headers['If-None-Match']='*';
  else if(token)headers['If-Match']=token;
  else throw Error('Onbekende bestandsversie. Laad STACK opnieuw.');
  const r=await fetch(`${app.cloud.url}/api/year/${year}`,{method:'PUT',headers,body:bytes,cache:'no-store'});
  if(r.status===409||r.status===412){app.cloud.conflict=true;throw Error('STACK is elders gewijzigd. Download je lokale Excel-bestand en verbind daarna opnieuw.');}
  if(!r.ok)throw Error(`Opslaan op STACK mislukt (${r.status}): ${await r.text()}`);
  const etag=r.headers.get('etag')||'';
  if(!etag)throw Error('Geen bestandsversie ontvangen. Verbind opnieuw voordat je verder werkt.');
  if(app.year!==year)return;
  app.cloud.etag=etag;safeLocal.setItem(syncedKey(year),etag);
  app.cloud.dirty=localRevision!==revision;
  if(!app.cloud.dirty)safeLocal.removeItem(pendingKey(year));
  if(app.cloud.dirty)queueSave();
 }catch(e){app.cloud.dirty=true;notify(e.message,true);}
 finally{cloudSaving=false;app.cloud.busy=false;syncStatus();}
}
function agendaNavigate(delta){
 if(!window.LAAgenda)return;
 let date=app.agendaDate;
 if(app.agendaMode==='maand'){
  const d=new Date(date+'T12:00:00');d.setDate(1);d.setMonth(d.getMonth()+delta);date=window.LAAgenda.iso(d);
 }else date=window.LAAgenda.shift(date,delta*(app.agendaMode==='dag'?1:7));
 if(yearFromDate(date)!==app.year){notify('Selecteer bovenaan eerst het andere jaar om verder te bladeren.',true);return;}
 app.agendaDate=date;app.agendaSelected='';render();
}
function agendaNew(btn){
 const date=btn?.dataset?.date||app.agendaDate||today();
 if(yearFromDate(date)!==app.year){notify('Kies eerst het juiste jaar.',true);return;}
 const start=btn?.dataset?.time||'';
 let end='';
 if(start&&window.LAAgenda){
  const n=window.LAAgenda.minute(start);
  if(n!==null&&n+60<24*60)end=String(Math.floor((n+60)/60)).padStart(2,'0')+':'+String((n+60)%60).padStart(2,'0');
 }
 openEntryEditor('',{Datum:date,Begintijd:start&&end?start:'',Eindtijd:end,Uren:1});
}
function clickAction(action,btn){switch(action){
case 'agenda-prev':agendaNavigate(-1);break;
case 'agenda-next':agendaNavigate(1);break;
case 'agenda-today':app.agendaDate=yearFromDate(today())===app.year?today():`${app.year}-01-01`;app.agendaSelected='';render();break;
case 'agenda-mode':app.agendaMode=btn.dataset.mode||'week';render();break;
case 'agenda-select-day':app.agendaDate=btn.dataset.date;app.agendaMode='dag';app.agendaSelected='';render();break;
case 'agenda-new':agendaNew(btn);break;
case 'agenda-edit':app.agendaSelected=btn.dataset.id;openEntryEditor(btn.dataset.id);break;
case 'prev-month':app.month=app.month===1?12:app.month-1;app.showAllEntries=false;render();break;case 'next-month':app.month=app.month===12?1:app.month+1;app.showAllEntries=false;render();break;case 'wizard-next':wizardNext();break;case 'wizard-back':wizardBack();break;case 'wizard-skip':wizardNext(false);break;case 'wizard-no-ride':app.wizard.hasRide=false;app.wizard.Km='';saveWithoutRide();break;case 'wizard-yes-ride':app.wizard.hasRide=true;app.wizard.step=6;render();break;case 'wizard-save':saveWizard();break;case 'edit-entry':openEntryEditor(btn.dataset.id);break;case 'delete-entry':{let r=app.db.Registraties.find(x=>x.Id===btn.dataset.id);if(r){if(allocations(r.Id)>0){notify('Deze uren zijn al in een declaratie opgenomen. Verwijderen is niet toegestaan.',true);break;}if(confirm('Deze registratie verwijderen? De wijziging wordt in het mutatielog vastgelegd.')){audit('Verwijderd','Registratie',r.Id,r);app.db.Registraties=app.db.Registraties.filter(x=>x.Id!==r.Id);persist();render();}}break;}case 'toggle-entries':app.showAllEntries=!app.showAllEntries;render();break;
case 'open-first-import':app.page='instellingen';eventRender();$('importFile')?.click();break;case 'open-stack-settings':app.page='instellingen';eventRender();break;case 'new-project':initProjectWizard();break;case 'edit-project':initProjectWizard(btn.dataset.id);break;case 'project-back':app.projectWizard.step=Math.max(0,app.projectWizard.step-1);renderProjectWizard();break;case 'project-next':projectWizardNext();break;case 'save-project-edit':saveProjectEdit(btn.dataset.id);break;case 'save-entry-edit':saveEntryEdit(btn.dataset.id);break;case 'recalculate-edit-km':calculateEditKm();break;case 'save-brand':saveBrand();break;case 'remove-brand-logo':pendingLogo='';showLogoPreview();break;
case 'toggle-legacy':app.showLegacy=!app.showLegacy;render();break;case 'review-legacy':reviewLegacy(btn.dataset.id);break;case 'save-review':saveReview(btn.dataset.id);break;case 'create-bill':createBill();break;case 'mark-sent':{let d=app.db.Declaraties.find(x=>x.Id===btn.dataset.id);if(d){d.Status='verzonden';audit('Status','Declaratie',d.Id,'verzonden');persist();render();}break;}case 'delete-bill':{let d=app.db.Declaraties.find(x=>x.Id===btn.dataset.id);if(d&&d.Status==='concept'&&confirm('Concept verwijderen en gereserveerde uren vrijgeven?')){d.Status='vervallen';audit('Vervallen','Declaratie',d.Id,'concept verwijderd');persist();render();}break;}
case 'month-overview':app.month=Number(btn.dataset.month);app.monthProject='';app.page='maandoverzicht';eventRender();break;case 'export-excel':exportExcel();break;case 'import-excel':$('importFile')?.click();break;case 'print-report':window.print();break;case 'export-month-csv':{let rows=currentMonthRegs().filter(r=>!app.monthProject||normalizedProject(r.Projectnummer)===normalizedProject(app.monthProject)).map(r=>({Datum:r.Datum,Dag:dateLabel(r.Datum).split(' ')[0],Jaar:r.Datum?.slice(0,4)||'',Projectnummer:r.Projectnummer,Project:projectName(r.Projectnummer),Activiteit:r.Activiteit,Omschrijving:r.Omschrijving,Uren:r.Uren,Km:r.Km}));downloadCSV(rows,['Datum','Dag','Jaar','Projectnummer','Project','Activiteit','Omschrijving','Uren','Km'],`LA-${app.year}-${String(app.month).padStart(2,'0')}-uren.csv`);break;}
case 'export-register-csv':downloadCSV(app.db.Registraties,FIELDS.Registraties,`LA-${app.year}-registraties.csv`);break;case 'export-audit':downloadCSV(app.db.Mutaties,FIELDS.Mutaties,`LA-${app.year}-mutaties.csv`);break;
case 'save-settings':setSetting('StandaardUurtarief',round(num($('defaultRate').value)));setSetting('KilometerTarief',round(num($('kmRate').value)));audit('Bijgewerkt','Instellingen','Tarieven','Tarieven');persist();render();notify('Tarieven bijgewerkt.',false,true);break;
case 'edit-activity':{let i=Number(btn.dataset.index),a=app.db.Activiteiten[i];modal(`Activiteit ${i+1}`,`<div class="field"><label>Naam</label><input id="activityName" value="${E(a.Naam)}"></div><div class="field"><label>Uren</label><select id="activityType"><option ${a.SoortUren==='DIRECT'?'selected':''}>DIRECT</option><option ${a.SoortUren==='INDIRECT'?'selected':''}>INDIRECT</option></select></div>`,`${b('Annuleren','close-modal')}${b('Bewaren','save-activity','primary',`data-index="${i}"`)}`);break;}case 'save-activity':{let i=Number(btn.dataset.index),name=$('activityName').value.trim();if(!name||app.db.Activiteiten.some((a,j)=>j!==i&&a.Naam===name)){notify('Kies een unieke naam.',true);break;}let a=app.db.Activiteiten[i];a.Naam=name;a.SoortUren=$('activityType').value;audit('Gewijzigd','Activiteit',String(i),name);closeModal();persist();render();break;}
case 'connect-cloud':connectCloud();break;case 'disconnect-cloud':clearTimeout(saveTimer);forgetCloudPassword();app.cloud.connected=false;app.cloud.etag='';app.cloud.password='';app.cloud.dirty=hasPending(app.year);app.cloud.conflict=false;render();syncStatus();break;case 'create-next-year':createNextYear();break;case 'confirm-new-year':confirmNextYear();break;case 'close-modal':closeModal();break;default:break;}}
function saveWithoutRide(){try{app.wizard.Omschrijving=app.wizard.Omschrijving||'';app.wizard.step=8;app.wizard.hasRide=false;app.wizard.Km='';saveWizardNoRide();}catch(e){notify(e.message,true);}}
function saveWizardNoRide(){let w=app.wizard;w.step=8;/* saveWizard requires an input on step 8: use a transient skip to avoid mileage validation */let oldStep=w.step;w.step=4;let node=$('wizValue');let saved=node?.value;/* leave read at step 4 harmless */w.step=oldStep;let now=new Date().toISOString();let old=w.id?app.db.Registraties.find(r=>r.Id===w.id):null;let record={Id:old?.Id||uid(),Datum:w.Datum,Begintijd:old?.Begintijd||'',Eindtijd:old?.Eindtijd||'',Projectnummer:w.Projectnummer,Activiteit:w.Activiteit,Omschrijving:w.Omschrijving,Uren:round(num(w.Uren)),SoortUren:w.SoortUren||'DIRECT',VanPostcode:'',NaarPostcode:'',Retour:'',Km:0,ReistijdMinuten:0,KmMethode:'',OdometerBegin:'',OdometerEind:'',WerkelijkVertrek:'',WerkelijkeBestemming:'',RouteOpmerking:'',FacturatieStatus:old?.FacturatieStatus||'open',VroegerGedeclareerdeUren:old?.VroegerGedeclareerdeUren||0,BronMaand:old?.BronMaand||monthOf(w),BronRij:old?.BronRij||'',Aangemaakt:old?.Aangemaakt||now,Gewijzigd:now};if(!w.Datum||!project(w.Projectnummer)||!w.Activiteit||num(w.Uren)<=0){notify('Registratie is niet volledig.',true);return;}if(old&&regHours(record)<num(old.VroegerGedeclareerdeUren)+allocations(old.Id)){notify('Er zijn meer uren gedeclareerd dan het nieuwe totaal.',true);return;}if(old){let prev={...old};Object.assign(old,record);audit('Gewijzigd','Registratie',old.Id,{voor:prev,na:record});}else{app.db.Registraties.push(record);audit('Toegevoegd','Registratie',record.Id,record.Datum);}app.month=monthOf(record);initWizard();app.showAllEntries=false;persist();render();notify('Registratie opgeslagen.',false,true);}
function init(){let y=Number(new Date().getFullYear());if([2026,2027].includes(y))app.year=y;app.agendaDate=app.year===y?today():`${app.year}-01-01`;app.db=initDB(app.year);app.cloud.dirty=hasPending(app.year);app.month=app.year===new Date().getFullYear()?new Date().getMonth()+1:1;initWizard();$('year').innerHTML=Array.from({length:10},(_,i)=>2024+i).map(y=>`<option value="${y}" ${y===app.year?'selected':''}>${y}</option>`).join('');document.querySelector('.tabs').addEventListener('click',e=>{let tab=e.target.closest('[data-page]');if(tab){app.page=tab.dataset.page;eventRender();}});document.body.addEventListener('click',e=>{let el=e.target.closest('[data-action]');if(el){e.preventDefault();clickAction(el.dataset.action,el);}if(e.target.classList.contains('dialog-backdrop'))closeModal();});document.body.addEventListener('change',e=>{let t=e.target;switch(t.id){case 'year':changeYear(Number(t.value));break;case 'projectFilter':app.projectFilter=t.value;render();break;case 'billingProject':initializeBilling(t.value);render();break;case 'monthProjectFilter':app.monthProject=t.value;render();break;case 'agendaProjectFilter':app.agendaProject=t.value;render();break;case 'agendaKindFilter':app.agendaKind=t.value;render();break;case 'billMethod':app.billMethod=t.value;render();break;case 'importFile':importWorkbook(t.files?.[0]);break;case 'businessLogoFile':prepareLogo(t.files?.[0]).catch(e=>notify(e.message,true));break;case 'editHasRide':toggleEditRide();break;case 'billPercentage':app.billPercentage=num(t.value);render();break;case 'billBase':app.billBase=num(t.value);render();break;case 'billOverride':app.billOverride=t.value;render();break;default:break;}if(['editStartTime','editEndTime'].includes(t.id))syncEditDuration();if(['editFrom','editTo','editReturn'].includes(t.id))scheduleEditRoute();if(t.id==='editKm'){editRouteRun++;t.dataset.method='Handmatig';const msg=$('editRouteStatus');if(msg)msg.textContent='Handmatig aangepast';}if(t.dataset.billCheck){let id=t.dataset.billCheck;app.billHours[id]=t.checked?availableHours(app.db.Registraties.find(r=>r.Id===id)):0;render();}if(t.dataset.billHours){let id=t.dataset.billHours;let r=app.db.Registraties.find(r=>r.Id===id);app.billHours[id]=Math.min(Math.max(0,num(t.value)),availableHours(r));render();}});document.body.addEventListener('input',e=>{if(['editStartTime','editEndTime'].includes(e.target.id))syncEditDuration();if(['editFrom','editTo','editReturn'].includes(e.target.id))scheduleEditRoute();if(e.target.id==='editKm'){editRouteRun++;e.target.dataset.method='Handmatig';}if(e.target.id==='projectQuery'){let caret=e.target.selectionStart;app.projectQuery=e.target.value;render();let q=$('projectQuery');q?.focus();q?.setSelectionRange(caret,caret);}});document.body.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.closest('.guided-input')&&e.target.tagName!=='TEXTAREA'&&!e.target.closest('button')){e.preventDefault();if(app.wizard.step!==5&&app.wizard.step!==8)wizardNext();else if(app.wizard.step===8)saveWizard();}});$('syncButton').addEventListener('click',()=>{app.page='instellingen';eventRender();});eventRender();if(app.cloud.url&&app.cloud.password)void connectCloud({automatic:true});}
window.addEventListener('DOMContentLoaded',init);
})();