import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const src=fs.readFileSync(new URL('../agenda-drag.js',import.meta.url),'utf8');
function harness(){
 const window={};const timers=[],handlers={};
 const doc={createElement(tag){return {tagName:tag,style:{},children:[],appendChild(child){this.children.push(child);this.firstChild=child;child.parentNode=this;},remove(){this.parentNode=null;}};}};
 const body={ownerDocument:doc,__laCalendarDragInstalled:false,
  contains(){return true;},
  addEventListener(name,fn){(handlers[name] ||= []).push(fn);}};
 vm.runInNewContext(src,{window,Date,Math,String,Number,RegExp,setTimeout:fn=>{timers.push(fn);return timers.length;}},{filename:'agenda-drag.js'});
 const track={dataset:{agendaDate:'2026-11-11',startMinute:'480',hourHeight:'76'},offsetHeight:836,
  classList:{contains:()=>false},
  getBoundingClientRect(){return {top:100,height:836};},
  appendChild(child){child.parentNode=this;this.preview=child;}};
 const slot={dataset:{time:'09:00'},closest(selector){
  if(selector==='.agenda-slot')return slot;if(selector==='.agenda-day-track')return track;return null;
 }};
 const selected=[];window.LAAgendaDrag.install({element:body,onSelect:value=>selected.push(value)});
 const fire=(name,properties={})=>{
  const event={button:0,pointerType:'mouse',pointerId:1,clientY:195,target:slot,preventDefault(){this.prevented=true;},
   stopImmediatePropagation(){this.stopped=true;},stopPropagation(){this.stopped=true;},...properties};
  for(const fn of handlers[name]||[])fn(event);
  return event;
 };
 return {window,fire,selected,timers,track};
}
test('dragging from 09:00 to 11:00 selects two hours',()=>{
 const x=harness();x.fire('pointerdown',{clientY:176});
 x.fire('pointermove',{clientY:328});
 x.fire('pointerup',{clientY:328});
 assert.equal(x.selected.length,1);
 assert.equal(x.selected[0].date,'2026-11-11');
 assert.equal(x.selected[0].start,'09:00');
 assert.equal(x.selected[0].end,'11:00');
 assert.equal(x.track.preview.firstChild.textContent,'09:00–11:00 · 2 u');
 const click=x.fire('click');assert.equal(click.prevented,true);
});
test('a single click is left to the existing one-hour registration handler',()=>{
 const x=harness();x.fire('pointerdown',{clientY:195});
 x.fire('pointerup',{clientY:195});
 assert.equal(x.selected.length,0);
 const click=x.fire('click');assert.equal(click.prevented,undefined);
});
test('dragging upwards selects correct time range',()=>{
 const cal=harness().window.LAAgendaDrag;
 const r=cal.rangeAt(660,76,480,76,836);
 assert.equal(r.start,540);assert.equal(r.end,660);assert.equal(r.hours,2);
});
test('drag selection cannot go outside the visible calendar',()=>{
 const cal=harness().window.LAAgendaDrag;
 assert.equal(cal.rangeAt(540,-500,480,76,836).start,480);
 assert.equal(cal.rangeAt(540,10000,480,76,836).end,1140);
 assert.equal(cal.rangeAt(NaN,150,480,76,836),null);
});
