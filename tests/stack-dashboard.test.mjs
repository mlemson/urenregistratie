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
 const hook="globalThis.__testing={app,defaultDB,cleanDB,render,renderOverview,renderRegistration,renderProjects,renderClients,renderAgenda,renderSettings,renderKilometers,overviewChart,renderBilling,initializeBilling,computedBill,availableEntries,projectRegistrations,ledgerTotals,entryBillingStatus,claimedParts,claimRestorable,cancelConcept,reverseClaim,restoreClaim,billingClaimDetail,billingEntryDetail,billProjectOptions,reviewLegacy,saveReview,availableHours,allocations,overviewRows,overviewHours,overviewAvailable,overviewProjectCard,overviewWarnings,budgetStats,workbookBytes,parseWorkbook,setting,setSetting,moduleEnabled,repeatEntry,canDeleteEntry,deleteEntry,timerRead,timerWrite,timerPanel};openEntryEditor=(id,defaults)=>{globalThis.__testing.draft=defaults;};";
 vm.runInNewContext(source.replace(end,hook+'\n'+end),vm.createContext(context),{filename:'app.js'});
 const h=context.__testing;h.app.year=2026;h.app.month=11;h.app.dashboardMonth=11;h.app.cloud.connected=true;h.app.db=h.defaultDB(2026);
 h.app.db.Projecten.push({Projectnummer:'P1',Omschrijving:'Woonhuis',Actueel:'J',Uurtarief:100,BudgetUren:2,BudgetEuro:250});
 h.app.db.Registraties.push({Id:'R1',Datum:'2026-11-20',Projectnummer:'P1',Activiteit:'1 ontwerp',SoortUren:'DIRECT',Omschrijving:'Schets',Uren:3,Km:30,FacturatieStatus:'open',Begintijd:'09:00',Eindtijd:'12:00',VroegerGedeclareerdeUren:1});
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
 assert.match(screen,/2 uur × €(?:&nbsp;|\u00a0|\s)*100,00/);
 assert.match(screen,/Geselecteerde uren/);
 assert.match(screen,/€(?:&nbsp;|\u00a0|\s)*200,00/);
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

test('declaratiekenmerk en omschrijving blijven behouden bij aanpassen uren',()=>{
 const {h,node}=setup();
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.initializeBilling('P1');
 h.app.billReference='2026-041';
 h.app.billNote='Deels uitgevoerd';
 h.app.billHours.R1=1;
 h.renderBilling();
 const html=node('app').innerHTML;
 assert.match(html,/id="billReference"[^>]*value="2026-041"/);
 assert.match(html,/id="billNote"[^>]*value="Deels uitgevoerd"/);
 assert.match(html,/Geselecteerde uren/);
 assert.equal(h.computedBill().amount,100);
});

test('het volledige overzicht bevat ook afgesloten, onduidelijke en al gedeclareerde uren',()=>{
 const {h,node}=setup();
 const r=h.app.db.Registraties[0];
 r.FacturatieStatus='open';
 h.app.db.Registraties.push(
  {Id:'R2',Datum:'2026-09-01',Projectnummer:'P1',Activiteit:'Overleg',Uren:2,FacturatieStatus:'onbekend'},
  {Id:'R3',Datum:'2026-09-02',Projectnummer:'P1',Activiteit:'Offerte',Uren:1,FacturatieStatus:'uitgesloten'},
  {Id:'R4',Datum:'2026-09-03',Projectnummer:'P1',Activiteit:'Revisie',Uren:3,FacturatieStatus:'open'}
 );
 h.app.db.Declaraties.push({Id:'DC',Projectnummer:'P1',Status:'concept',Datum:'2026-11-21'});
 h.app.db.Declaratieregels.push({Id:'LC',RegistratieId:'R4',DeclaratieId:'DC',Uren:3});
 h.initializeBilling('P1');h.renderBilling();
 const x=node('app').innerHTML;
 assert.match(x,/Alle registraties van dit project/);
 assert.match(x,/4 registraties · inclusief gedeclareerd/);
 assert.match(x,/Te beoordelen oude uren/);
 assert.match(x,/Offerte/);
 assert.match(x,/Revisie/);
 assert.match(x,/In concept/);
 assert.match(x,/Declaratiehistorie/);
 assert.equal(h.availableEntries('P1').length,1);
 assert.equal(h.billProjectOptions().length,1);
 assert.equal(h.ledgerTotals(h.projectRegistrations('P1')).review,1);
 assert.equal(h.ledgerTotals(h.projectRegistrations('P1')).excluded,1);
 const before=JSON.stringify(h.app.db);h.renderBilling();assert.equal(JSON.stringify(h.app.db),before);
});
test('onbekende status is niet automatisch beschikbaar, ook zonder eerder gedeclareerde uren',()=>{
 const {h,node}=setup();
 h.app.db.Registraties[0].FacturatieStatus='';
 h.initializeBilling('P1');h.renderBilling();
 assert.equal(h.availableEntries('P1').length,0);
 assert.equal(h.computedBill().hrs,0);
 assert.equal(h.ledgerTotals(h.projectRegistrations('P1')).review,1);
 assert.match(node('app').innerHTML,/Te beoordelen/);
 h.app.db.Registraties[0].FacturatieStatus='onbekend';
 assert.equal(h.availableEntries('P1').length,0);
});
test('concept intrekken geeft de uren vrij met onveranderde historie en audit',()=>{
 const {h}=setup();const row=h.app.db.Registraties[0];
 row.FacturatieStatus='open';row.VroegerGedeclareerdeUren=0;
 h.app.db.Declaraties.push({Id:'C1',Projectnummer:'P1',Datum:'2026-11-20',Status:'concept',BedragExBtw:300});
 h.app.db.Declaratieregels.push({Id:'CL1',DeclaratieId:'C1',RegistratieId:'R1',Uren:3});
 assert.equal(h.availableHours(row),0);
 assert.equal(h.cancelConcept('C1'),true);
 assert.equal(h.app.db.Declaraties.find(d=>d.Id==='C1').Status,'vervallen');
 assert.equal(h.availableHours(row),3);
 assert.equal(h.app.db.Declaratieregels.length,1);
 assert.equal(h.app.db.Mutaties.some(m=>m.Type==='Declaratie'&&m.ObjectId==='C1'&&m.Actie==='Ingetrokken'),true);
 assert.equal(h.claimRestorable(h.app.db.Declaraties.find(d=>d.Id==='C1')),true);
 assert.equal(h.restoreClaim('C1'),true);
 assert.equal(h.availableHours(row),0);
 assert.equal(h.app.db.Declaraties.find(d=>d.Id==='C1').Status,'concept');
});
test('verzonden declaratie mag niet zonder reden worden teruggedraaid; historie blijft intact',()=>{
 const {h}=setup();const row=h.app.db.Registraties[0];
 row.FacturatieStatus='open';row.VroegerGedeclareerdeUren=0;
 h.app.db.Declaraties.push({Id:'S1',Projectnummer:'P1',Datum:'2026-11-20',Status:'verzonden',Kenmerk:'26067',BedragExBtw:300});
 h.app.db.Declaratieregels.push({Id:'SL1',DeclaratieId:'S1',RegistratieId:'R1',Uren:3});
 assert.equal(h.availableHours(row),0);
 assert.equal(h.reverseClaim('S1','nee'),false);
 assert.equal(h.app.db.Declaraties.find(d=>d.Id==='S1').Status,'verzonden');
 assert.equal(h.reverseClaim('S1','Extern gecrediteerd'),true);
 assert.equal(h.availableHours(row),3);
 assert.equal(h.app.db.Declaratieregels.length,1);
 assert.equal(h.app.db.Mutaties.some(m=>m.ObjectId==='S1'&&m.Details.includes('Extern gecrediteerd')),true);
 const restored=h.restoreClaim('S1');
 assert.equal(restored,true);
 assert.equal(h.availableHours(row),0);
 assert.equal(h.app.db.Declaraties.find(d=>d.Id==='S1').Status,'verzonden');
});
test('herstel weigert een dubbel claim op uren die opnieuw zijn gedeclareerd',()=>{
 const {h}=setup();const row=h.app.db.Registraties[0];
 row.FacturatieStatus='open';row.VroegerGedeclareerdeUren=0;
 h.app.db.Declaraties.push({Id:'C1',Projectnummer:'P1',Datum:'2026-11-20',Status:'vervallen',BedragExBtw:200});
 h.app.db.Declaratieregels.push({Id:'CL1',DeclaratieId:'C1',RegistratieId:'R1',Uren:2});
 h.app.db.Declaraties.push({Id:'C2',Projectnummer:'P1',Datum:'2026-11-21',Status:'concept',BedragExBtw:250});
 h.app.db.Declaratieregels.push({Id:'CL2',DeclaratieId:'C2',RegistratieId:'R1',Uren:2});
 assert.equal(h.availableHours(row),1);
 assert.equal(h.claimRestorable(h.app.db.Declaraties.find(d=>d.Id==='C1')),false);
 assert.equal(h.restoreClaim('C1'),false);
 assert.equal(h.app.db.Declaraties.find(d=>d.Id==='C1').Status,'vervallen');
});
test('ook voltooide projecten blijven te bekijken en de koppeling met declaraties blijft bewaard',()=>{
 const {h,node}=setup();
 h.app.db.Projecten[0].Actueel='N';
 h.app.db.Registraties[0].FacturatieStatus='open';
 h.app.db.Declaraties.push({Id:'B1',Projectnummer:'P1',Status:'verzonden',Datum:'2026-11-21',BedragExBtw:200});
 h.app.db.Declaratieregels.push({Id:'BL1',DeclaratieId:'B1',RegistratieId:'R1',Uren:2});
 h.initializeBilling('P1');h.renderBilling();
 assert.equal(h.billProjectOptions().length,1);
 assert.equal(h.availableEntries('P1').length,0);
 assert.match(node('app').innerHTML,/Gedeclareerd/);
 assert.match(node('app').innerHTML,/Inzien/);
 h.billingClaimDetail('B1');
 assert.match(node('dialogRoot').innerHTML,/Schets/);
 assert.match(node('dialogRoot').innerHTML,/2/);
 h.billingEntryDetail('R1');
 assert.match(node('dialogRoot').innerHTML,/Gekoppelde declaraties/);
});

test('hele jaar wist visuele maandselectie, ook na een tweede klik',()=>{
 const {h,node}=setup();
 h.app.dashboardMonth=12;
 h.renderOverview();
 let markup=node('app').innerHTML;
 assert.match(markup,/data-month="12"[^>]*class="overview-chart-month selected" aria-pressed="true"/);
 assert.match(markup,/<option value="12" selected>/);
 h.app.dashboardMonth=0;
 h.renderOverview();
 markup=node('app').innerHTML;
 assert.match(markup,/<option value="0" selected>Hele jaar<\/option>/);
 assert.equal((markup.match(/class="overview-chart-month selected"/g)||[]).length,0);
 assert.equal((markup.match(/aria-pressed="true"/g)||[]).length,0);
 assert.match(markup,/data-month="12"[^>]*class="overview-chart-month " aria-pressed="false"/);
});

test('testregistratie wordt via Verwijderen uit de urenlijst gehaald maar blijft in mutatielog',()=>{
 const {h,node}=setup();const r=h.app.db.Registraties[0];
 r.VroegerGedeclareerdeUren=0;
 assert.equal(h.canDeleteEntry(r),true);
 assert.equal(h.deleteEntry('R1'),true);
 assert.equal(h.app.db.Registraties.length,0);
 const log=h.app.db.Mutaties.find(m=>m.Type==='Registratie'&&m.Actie==='Verwijderd');
 assert.ok(log);
 assert.match(log.Details,/"Omschrijving":"Schets"/);
 assert.match(node('notice').textContent,/verwijderd/);
});
test('een registratie met historisch declaratiegebruik blijft beschermd, ook na intrekken',()=>{
 const {h,node}=setup();const r=h.app.db.Registraties[0];
 assert.equal(h.canDeleteEntry(r),false);
 assert.equal(h.deleteEntry('R1'),false);
 r.VroegerGedeclareerdeUren=0;
 h.app.db.Declaratieregels.push({Id:'L1',DeclaratieId:'D1',RegistratieId:'R1',Uren:1});
 h.app.db.Declaraties[0].Status='vervallen';
 assert.equal(h.canDeleteEntry(r),false);
 assert.equal(h.deleteEntry('R1'),false);
 assert.equal(h.app.db.Registraties.length,1);
 assert.equal(h.app.db.Mutaties.some(m=>m.Actie==='Verwijderd'),false);
 assert.match(node('notice').textContent,/declaratiehistorie/);
});
test('Kopieer opent een nieuwe registratie en neemt geen rit of tijd over',()=>{
 const {h,node}=setup();
 h.setSetting('ModuleHerhalen','1');h.repeatEntry('R1');
 assert.equal(h.draft.Projectnummer,'P1');assert.equal(h.draft.Activiteit,'1 ontwerp');assert.equal(h.draft.Omschrijving,'Schets');
 assert.equal(h.draft.Uren,3);assert.equal(h.draft.Begintijd,undefined);assert.equal(h.draft.Km,undefined);
 assert.equal(h.app.db.Registraties.length,1,'Kopieer slaat niet zelfstandig op');
 h.renderRegistration();
 assert.match(node('app').innerHTML,/data-action="repeat-entry"/);
 assert.match(node('app').innerHTML,/>Kopieer<\/button>/);
});
