import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const window={};
vm.runInNewContext(fs.readFileSync(new URL('../agenda.js',import.meta.url),'utf8'),{window,Date,Intl,Number,String,Math,Array,RegExp});
const cal=window.LAAgenda;
const context={
  year:2026,mode:'week',anchor:'2026-11-12',today:'2026-11-12',project:'',kind:'',selectedId:'',
  projects:[{Projectnummer:'P-1',Omschrijving:'Woning'}],getProjectName:()=> 'Woning',
  entries:[
    {Id:'old',Datum:'2026-11-10',Projectnummer:'P-1',Activiteit:'Schets',Uren:3.5,Km:0},
    {Id:'timed',Datum:'2026-11-12',Projectnummer:'P-1',Activiteit:'Bespreking',Begintijd:'09:00',Eindtijd:'11:15',Uren:2.25,Km:4}
  ]
};
test('historical hours without times appear in a separate lane',()=>{
  const html=cal.render(context);
  assert.match(html,/Zonder tijd/);
  assert.match(html,/3,5 u/);
  assert.match(html,/09:00–11:15/);
  assert.match(html,/agenda-event/);
});
test('week starts on Monday with correct week number and Sunday',()=>{
  assert.deepEqual(Array.from(cal.weekDates('2026-11-12')),['2026-11-09','2026-11-10','2026-11-11','2026-11-12','2026-11-13','2026-11-14','2026-11-15']);
  assert.equal(cal.isoWeek('2026-01-01'),1);
  assert.equal(cal.weekStart('2027-01-01'),'2026-12-28');
});
test('time duration accepts minutes and rejects negative or incomplete',()=>{
  assert.equal(cal.duration('08:30','11:00'),2.5);
  assert.equal(cal.duration('08:00','08:15'),0.25);
  assert.equal(cal.duration('09:00','08:00'),null);
  assert.equal(cal.duration('', '10:00'),null);
  assert.equal(cal.duration('25:30','26:30'),null);
});
test('overlapping appointments split into columns',()=>{
  const list=cal.layout([
    {Id:'1',Begintijd:'09:00',Eindtijd:'11:00'},
    {Id:'2',Begintijd:'09:30',Eindtijd:'10:00'},
    {Id:'3',Begintijd:'12:00',Eindtijd:'13:00'}
  ]);
  assert.equal(list[0].columns,2);
  assert.equal(list[1].columns,2);
  assert.notEqual(list[0].column,list[1].column);
  assert.equal(list[2].columns,1);
});
test('old rows in different years never surface and HTML is escaped',()=>{
  const html=cal.render({...context,entries:[...context.entries,{Id:'bad',Datum:'2027-11-12',Projectnummer:'P-1',Activiteit:'<img src=x onerror=alert(1)>',Uren:3}]});
  assert.doesNotMatch(html,/onerror=/);
  const escaped=cal.render({...context,entries:[{Id:'unsafe',Datum:'2026-11-12',Projectnummer:'P-1',Activiteit:'<img src=x>',Uren:1}]});
  assert.match(escaped,/&lt;img src=x&gt;/);
  assert.doesNotMatch(escaped,/<img src=x>/);
});
test('month view and day view provide navigation',()=>{
  const month=cal.render({...context,mode:'maand'});
  const day=cal.render({...context,mode:'dag'});
  assert.match(month,/agenda-select-day/);
  assert.match(day,/data-action="agenda-new"/);
  assert.ok(month.length>2000);
});

test('workweek follows Monday through Friday without weekend columns',()=>{
 const html=cal.render({...context,mode:'werkweek'});
 assert.match(html,/Werkweek 46/);
 assert.equal((html.match(/class="agenda-day-header /g)||[]).length,5);
 assert.match(html,/--agenda-days:5/);
});