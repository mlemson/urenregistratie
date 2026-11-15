import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const appSource=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const agendaSource=fs.readFileSync(new URL('../agenda.js',import.meta.url),'utf8');
const end="window.addEventListener('DOMContentLoaded',init);\n})();";
assert.ok(appSource.includes(end),'App entrypoint changed');
function mockStore(){const m=new Map();return {getItem:k=>m.get(k)||null,setItem:(k,v)=>m.set(k,String(v)),removeItem:k=>m.delete(k)};}
function setup({confirmOverlap=true}={}){
 const elements=new Map(),errors=[];
 const field=(id,value='',extra={})=>elements.set(id,{value,checked:!!extra.checked,textContent:'',dataset:{},readOnly:false});
 field('editDate','2026-11-11');field('editProject','P1');field('editActivity','1 ontwerp');
 field('editStartTime','09:15');field('editEndTime','10:45');field('editHours','10');
 field('editHasRide','',{checked:false});field('editDescription','Concept woning');field('editError');
 const get=id=>elements.get(id)||null;
 const window={localStorage:mockStore(),sessionStorage:mockStore(),LA_SEED:null,addEventListener(){}};
 const context={window,document:{getElementById:get,querySelectorAll(){return []},body:{addEventListener(){}}},console,Date,Intl,URL,TextEncoder,Response,Math,Number,String,Array,Object,JSON,RegExp,
  confirm:()=>confirmOverlap,setTimeout(){return 1},clearTimeout(){},crypto:{randomUUID:()=>`test-${Math.random()}`}};
 vm.runInNewContext(agendaSource,vm.createContext(context),{filename:'agenda.js'});
 const hook=`globalThis.__test={app,defaultDB,saveEntryEdit,parseWorkbook,workbookBytes};
  render=()=>{};closeModal=()=>{};initWizard=()=>{};syncStatus=()=>{};notify=(m)=>{};`;
 vm.runInNewContext(appSource.replace(end,hook+'\n'+end),context,{filename:'app.js'});
 const h=context.__test;
 h.app.year=2026;h.app.db=h.defaultDB(2026);h.app.db.Projecten.push({Projectnummer:'P1',Omschrijving:'Woning',Actueel:'J'});
 return {h,get,field,errors,window};
}
test('timed entry from calendar saves explicit times and derives hours',()=>{
 const {h}=setup();h.saveEntryEdit('');
 assert.equal(h.app.db.Registraties.length,1);
 const r=h.app.db.Registraties[0];
 assert.equal(r.Begintijd,'09:15');assert.equal(r.Eindtijd,'10:45');assert.equal(r.Uren,1.5);
 assert.equal(r.Km,0);assert.equal(r.FacturatieStatus,'open');
 assert.ok(h.app.db.Mutaties.length>0);
});
test('untimed entry preserves manually entered hours, including historical input',()=>{
 const {h,get}=setup();get('editStartTime').value='';get('editEndTime').value='';get('editHours').value='2.75';
 h.saveEntryEdit('');const r=h.app.db.Registraties[0];
 assert.equal(r.Begintijd,'');assert.equal(r.Eindtijd,'');assert.equal(r.Uren,2.75);
});
test('missing end time is rejected',()=>{
 const {h,get}=setup();get('editEndTime').value='';h.saveEntryEdit('');
 assert.equal(h.app.db.Registraties.length,0);
 assert.match(get('editError').textContent,/beide tijden/);
});
test('timed edit does not reduce below already billed hours',()=>{
 const {h,get}=setup();
 const record={Id:'old',Datum:'2026-11-11',Projectnummer:'P1',Activiteit:'1 ontwerp',Uren:5,Begintijd:'',Eindtijd:'',VroegerGedeclareerdeUren:3,FacturatieStatus:'open'};
 h.app.db.Registraties.push(record);
 h.saveEntryEdit('old');
 assert.equal(h.app.db.Registraties[0].Uren,5);
 assert.match(get('editError').textContent,/gedeclareerd/);
});
test('overlapping timed entries need explicit confirmation',()=>{
 const {h}=setup({confirmOverlap:false});
 h.app.db.Registraties.push({Id:'other',Datum:'2026-11-11',Projectnummer:'P1',Begintijd:'09:00',Eindtijd:'10:00',Uren:1});
 h.saveEntryEdit('');
 assert.equal(h.app.db.Registraties.length,1);
});