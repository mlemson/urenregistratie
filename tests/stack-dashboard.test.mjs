import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const end="window.addEventListener('DOMContentLoaded',init);\n})();";
assert.ok(source.includes(end));

function store(){const m=new Map();return {getItem:key=>m.get(key)||null,setItem:(key,v)=>m.set(key,String(v)),removeItem:key=>m.delete(key),map:m};}
function setup(){
 const local=store(),session=store(),els=new Map(),classes=new Set();
 const node=id=>{if(!els.has(id))els.set(id,{id,value:'',hidden:false,innerHTML:'',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},style:{},appendChild(){},setAttribute(){},removeAttribute(){},querySelector(){return null;}});return els.get(id);};
 const fakeXLSX={utils:{book_new:()=>({sheets:[]}),json_to_sheet:(rows,opts)=>({rows,opts}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(wb,sheet,name)=>wb.sheets.push({name,sheet}),sheet_to_json:s=>s.rows},read:()=>({SheetNames:['Projecten','Registraties','Activiteiten','Instellingen'],Sheets:{Projecten:{rows:[{Projectnummer:'P1',Omschrijving:'Bestaand'}]},Registraties:{rows:[{Id:'old',Datum:'2026-11-20',Projectnummer:'P1',Activiteit:'1 ontwerp',Uren:5}]},Activiteiten:{rows:[{Naam:'1 ontwerp',SoortUren:'DIRECT'}]},Instellingen:{rows:[{Sleutel:'StandaardUurtarief',Waarde:'100'}]}}}),write:(w)=>{fakeXLSX.last=w;return new Uint8Array([80,75]);}};
 const context={window:{localStorage:local,sessionStorage:session,LA_SEED:null,XLSX:fakeXLSX,addEventListener(){},LAAgenda:{render:()=>'<div class="agenda-mock">Agenda</div>'}},XLSX:fakeXLSX,document:{title:'',getElementById:node,querySelector:q=>q==='.tabs'?node('tabs'):null,querySelectorAll:()=>[],createElement:t=>({tagName:t,appendChild(){},classList:{add(){},remove(){}}}),body:{addEventListener(){},classList:{toggle:(name,on)=>on?classes.add(name):classes.delete(name)}}},URL,Response,Intl,Date,TextEncoder,Math,Number,String,Array,Object,JSON,RegExp,console,setTimeout:()=>1,clearTimeout(){},confirm:()=>true};
 const hook="globalThis.__testing={app,defaultDB,cleanDB,render,renderOverview,renderProjects,renderClients,renderAgenda,renderSettings,renderKilometers,renderBilling,initializeBilling,computedBill,availableEntries,overviewRows,overviewHours,overviewAvailable,overviewProjectCard,overviewWarnings,budgetStats,workbookBytes,parseWorkbook,setting,setSetting,moduleEnabled,repeatEntry,timerRead,timerWrite,timerPanel};openEntryEditor=(id,defaults)=>{globalThis.__testing.draft=defaults;};";
 vm.runInNewContext(source.replace(end,hook+'\n'+end),vm.createContext(context),{filename:'app.js'});
 const h=context.__testing;h.app.year=2026;h.app.month=11;h.app.dashboardMonth=11;h.app.cloud.connected=true;h.app.db=h.defaultDB(2026);
 h.app.db.Projecten.push({Projectnummer:'P1',Omschrijving:'Woonhuis',Actueel:'J',Uurtarief:100,BudgetUren:2,BudgetEuro:250});
 h.app.db.Registraties.push({Id:'R1',Datum:'2026-11-20',Projectnummer:'P1',Activiteit:'1 ontwerp',SoortUren:'DIRECT',Omschrijving:'Schets',Uren:3,Km:30,Begintijd:'09:00',Eindtijd:'12:00',VroegerGedeclareerdeUren:1});
 h.app.db.Declaraties.push({Id:'D1',Status:'verzonden',Datum:'2026-11-20',BedragExBtw:200});
 return {h,node,classes,fakeXLSX,local};
}
test('original STACK dashboard shows real hours, km and open hours without mutating data',()=>{
 const {h,node,classes}=setup();const before=JSON.stringify(h.app.db);
 h.render();
 assert.equal(h.app.page,'overzicht');assert.ok(classes.has('stack-authed'));assert.match(node('app').innerHTML,/Woonhuis/);assert.match(node('app').innerHTML,/30 km/);assert.match(node('app').innerHTML,/2 u/);assert.match(node('app').innerHTML,/Verzonden declaraties/);assert.match(node('app').innerHTML,/Uitgebreid overzicht/);assert.equal(JSON.stringify(h.app.db),before);
 h.app.dashboardMonth=10;h.renderOverview();assert.match(node('app').innerHTML,/0 km/);h.app.dashboardMonth=0;h.renderOverview();assert.match(node('app').innerHTML,/30 km/);
});
test('optional client records and budgets appear only when enabled, but remain stored when hidden',()=>{
 const {h,node}=setup();h.app.db.Klanten.push({Id:'C1',Naam:'Klant B',Actueel:'J'});h.app.db.Projecten[0].KlantId='C1';
 h.setSetting('ModuleKlanten','1');h.setSetting('ModuleBudgetten','1');h.setSetting('ModuleWaarschuwingen','1');
 h.renderOverview();assert.match(node('app').innerHTML,/Klant B/);assert.match(node('app').innerHTML,/Budgetwaarschuwingen/);assert.match(node('app').innerHTML,/Jaarurenbudget/);
 h.renderProjects();assert.match(node('app').innerHTML,/<th>Klant<\/th>/);assert.match(node('app').innerHTML,/<th>Jaarbudget<\/th>/);
 h.renderClients();assert.match(node('app').innerHTML,/Klant B/);
 h.setSetting('ModuleKlanten','0');h.setSetting('ModuleBudgetten','0');h.setSetting('ModuleWaarschuwingen','0');h.renderProjects();
 assert.doesNotMatch(node('app').innerHTML,/<th>Klant<\/th>/);assert.equal(h.app.db.Klanten[0].Naam,'Klant B');assert.equal(h.app.db.Projecten[0].BudgetUren,2);
});
test('existing Excel format imports without clients or new columns and exports both safely',()=>{
 const {h,fakeXLSX}=setup();const old=h.parseWorkbook(new Uint8Array([80,75]).buffer);
 assert.equal(old.Registraties[0].Uren,5);assert.equal(old.Projecten[0].Omschrijving,'Bestaand');assert.equal(old.Klanten.length,0);
 assert.equal(old.Projecten[0].KlantId,undefined);
 h.app.db.Klanten.push({Id:'C1',Naam:'Klant'});h.workbookBytes();
 assert.ok(fakeXLSX.last.sheets.some(s=>s.name==='Klanten'));
 const projects=fakeXLSX.last.sheets.find(s=>s.name==='Projecten').sheet;
 assert.ok(projects.opts.header.includes('BudgetUren'));assert.ok(projects.opts.header.includes('KlantId'));
 assert.ok(fakeXLSX.last.sheets.some(s=>s.name==='Registraties'));
 assert.ok(fakeXLSX.last.sheets.some(s=>s.name==='Declaratieregels'));
});
test('repeat uses only activity, hours, description and project, not prior time or kilometers',()=>{
 const {h}=setup();h.setSetting('ModuleHerhalen','1');h.repeatEntry('R1');
 assert.equal(h.draft.Projectnummer,'P1');assert.equal(h.draft.Activiteit,'1 ontwerp');assert.equal(h.draft.Uren,3);assert.equal(h.draft.Omschrijving,'Schets');
 assert.equal(h.draft.Begintijd,undefined);assert.equal(h.draft.Km,undefined);assert.equal(h.app.db.Registraties.length,1);
});
test('dark mode applies only after STACK login and stopwatch stays browser local',()=>{
 const {h,classes,node,local}=setup();
 h.setSetting('ModuleDonker','1');h.setSetting('ModuleStopwatch','1');h.render();assert.ok(classes.has('stack-dark'));
 h.renderAgenda();assert.match(node('app').innerHTML,/Stopwatch/);
 h.timerWrite({date:'2026-11-20',elapsed:3_600_000,started:0});assert.equal(h.timerRead().elapsed,3_600_000);
 assert.equal(h.app.db.Instellingen.some(s=>s.Sleutel==='Stopwatch'),false);
 h.app.cloud.connected=false;h.render();assert.ok(!classes.has('stack-dark'));assert.ok(!classes.has('stack-authed'));assert.doesNotMatch(node('app').innerHTML,/Woonhuis/);
});


test('declaratievoorstel telt voorgeselecteerde open uren direct mee',()=>{
 const {h,node}=setup();
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.app.page='declaraties';
 h.renderBilling();
 assert.equal(h.app.billHours.R1,2,'3 geregistreerd en 1 eerder gedeclareerd geeft 2 open uren');
 assert.equal(h.computedBill().hrs,2);
 assert.equal(h.computedBill().amount,200);
 const screen=node('app').innerHTML;
 assert.match(screen,/data-bill-check="R1" checked/);
 assert.match(screen,/data-bill-hours="R1" value="2"/);
 assert.match(screen,/2 uur × €(?:&nbsp;|\\u00a0|\\s)*100,00/);
 assert.match(screen,/Geselecteerde uren/);
 assert.match(screen,/€(?:&nbsp;|\\u00a0|\\s)*200,00/);
});

test('declaratievoorstel ondersteunt gedeeltelijk declareren en regels uitschakelen',()=>{
 const {h}=setup();
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.app.db.Registraties[0].Uren=5;
 h.app.db.Registraties[0].VroegerGedeclareerdeUren=0;
 h.initializeBilling('P1');
 assert.equal(h.computedBill().hrs,5);
 assert.equal(h.computedBill().amount,500);
 h.app.billHours.R1=3;
 assert.equal(h.computedBill().hrs,3);
 assert.equal(h.computedBill().amount,300);
 h.app.billHours.R1=0;
 assert.equal(h.computedBill().hrs,0);
 assert.equal(h.computedBill().amount,0);
 h.app.billHours.R1=3;
 assert.equal(h.computedBill().hrs,3);
});

test('declaratievoorstel wordt per gekozen project opnieuw opgebouwd, zonder verouderde regels',()=>{
 const {h}=setup();
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.app.db.Projecten.push({Projectnummer:'P2',Omschrijving:'Restauratie',Actueel:'J',Uurtarief:90});
 h.app.db.Registraties.push({Id:'R2',Datum:'2026-11-21',Projectnummer:'P2',Activiteit:'Bespreking',Uren:1.5,FacturatieStatus:'open'});
 h.initializeBilling('P1');
 assert.equal(h.computedBill().amount,200);
 h.initializeBilling('P2');
 assert.equal(h.app.billHours.R1,undefined);
 assert.equal(h.app.billHours.R2,1.5);
 assert.equal(h.computedBill().hrs,1.5);
 assert.equal(h.computedBill().amount,135);
 h.initializeBilling('P1');
 assert.equal(h.computedBill().hrs,2);
 assert.equal(h.computedBill().amount,200);
});

test('declaratievoorstel telt niet mee wat al eerder is toegewezen',()=>{
 const {h}=setup();
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.app.db.Declaraties.push({Id:'D2',Status:'concept',Projectnummer:'P1'});
 h.app.db.Declaratieregels.push({Id:'L1',DeclaratieId:'D2',RegistratieId:'R1',Uren:0.5});
 h.initializeBilling('P1');
 assert.equal(h.app.billHours.R1,1.5);
 assert.equal(h.computedBill().hrs,1.5);
 assert.equal(h.computedBill().amount,150);
});
