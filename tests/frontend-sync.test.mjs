import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const hook = String.raw`
globalThis.__laTest={app,connectCloud,saveCloud,persist,defaultDB,hasPending,clickAction,saveBrand,logoutCloud,confirmNextYear,renderLogin,requireLogin,
 setMocks(){parseWorkbook=()=>defaultDB(app.year);workbookBytes=()=>new Uint8Array([80,75,3,4]);eventRender=()=>{};notify=()=>{};syncStatus=()=>{};initWizard=()=>{};closeModal=()=>{};}
};
`;
const end = "window.addEventListener('DOMContentLoaded',init);\n})();";
assert.ok(source.includes(end), 'Testing hook location changed');

function memoryStore(){
 const store=new Map();
 return {
  getItem:key=>store.has(key)?store.get(key):null,
  setItem:(key,value)=>store.set(key,String(value)),
  removeItem:key=>store.delete(key),
  data:store
 };
}
function setup({onlineEtag='"v1"', localEtag='"v1"', pending=true, cleanRemote=false, remoteStatus=200}={}){
 const local=memoryStore(),session=memoryStore();
 local.setItem('la-stack-url','https://example.workers.dev');
 if(localEtag)local.setItem('la-last-synced-2026',localEtag);
 if(pending)local.setItem('la-pending-2026','1');
 const calls=[],messages=[],prompts=[];
 const nodes=new Map();
 const get=id=>{
  if(!nodes.has(id))nodes.set(id,{value:'',textContent:'',className:'',hidden:false});
  return nodes.get(id);
 };
 get('cloudUrl').value='https://example.workers.dev';
 get('cloudPassword').value='strong-password';
 const timers=[];
 const context={
  window:{localStorage:local,sessionStorage:session,LA_SEED:null,addEventListener(){}},
  document:{getElementById:get,querySelectorAll:()=>[],querySelector:()=>null,body:{addEventListener(){}}},
  URL,Response,TextEncoder,Intl,Date,console,Math,Number,String,Array,Object,JSON,RegExp,
  setTimeout:fn=>{timers.push(fn);return timers.length;},clearTimeout(){},
  confirm:msg=>{prompts.push(msg);return false;},
  fetch:async (url,options={})=>{
    calls.push({url,method:options.method||'GET',headers:options.headers});
    if(options.method==='PUT')return new Response('Opgeslagen',{status:200,headers:{ETag:'"v2"'}});
    return new Response(new Uint8Array([80,75,3,4]),{status:remoteStatus,headers:{ETag:onlineEtag}});
  }
 };
 vm.runInNewContext(source.replace(end,hook+end),vm.createContext(context),{filename:'app.js'});
 const h=context.__laTest;
 h.setMocks();
 h.app.year=2026;
 h.app.cloud.password='strong-password';
 h.app.db=h.defaultDB(2026);
 local.setItem('la-db-2026',JSON.stringify(h.app.db));
 if(cleanRemote)h.app.db.Instellingen[0].Waarde='95';
 return {h,local,session,calls,messages,prompts,timers,context};
}

test('login always loads STACK, even when local changes have the same ETag',async()=>{
 const {h,local,session,calls,prompts}=setup();
 h.app.db.Instellingen[0].Waarde='120';
 local.setItem('la-db-2026',JSON.stringify(h.app.db));
 await h.connectCloud();
 assert.equal(h.app.cloud.connected,true);
 assert.notEqual(h.app.db.Instellingen[0].Waarde,'120');
 assert.equal(JSON.parse(local.getItem('la-recovery-2026')).Instellingen[0].Waarde,'120');
 assert.equal(prompts.length,0);
 assert.equal(h.hasPending(2026),false);
 assert.equal(local.getItem('la-last-synced-2026'),'"v1"');
 await h.saveCloud();
 assert.deepEqual(Array.from(calls.map(x=>x.method)),['GET']);
 assert.equal(session.getItem('la-stack-session-password'),'strong-password');
 assert.equal(local.getItem('la-stack-session-password'),null);
});
test('a conflicting local version does not prevent automatic login or overwrite STACK',async()=>{
 const {h,local,calls,prompts}=setup({onlineEtag:'"v2"',localEtag:'"v1"'});
 h.app.db.Instellingen[0].Waarde='130';local.setItem('la-db-2026',JSON.stringify(h.app.db));
 await h.connectCloud({automatic:true});
 assert.equal(h.app.cloud.connected,true);
 assert.notEqual(h.app.db.Instellingen[0].Waarde,'130');
 assert.equal(JSON.parse(local.getItem('la-recovery-2026')).Instellingen[0].Waarde,'130');
 assert.equal(local.getItem('la-pending-2026'),null);
 assert.equal(calls.filter(x=>x.method==='PUT').length,0);
 assert.equal(prompts.length,0);
});
test('cache without synchronization history does not block login',async()=>{
 const {h,local,calls,prompts}=setup({localEtag:'',pending:false});
 await h.connectCloud();
 assert.equal(h.app.cloud.connected,true);
 assert.ok(local.getItem('la-recovery-2026'));
 assert.equal(calls.length,1);
 assert.equal(prompts.length,0);
});
test('clean local cache loads current STACK workbook without prompts',async()=>{
 const {h,local,prompts}=setup({onlineEtag:'"v2"',pending:false});
 await h.connectCloud({automatic:true});
 assert.equal(h.app.cloud.connected,true);
 assert.equal(local.getItem('la-last-synced-2026'),'"v2"');
 assert.equal(local.getItem('la-recovery-2026'),null);
 assert.equal(prompts.length,0);
});
test('authenticated changes save online with conditional ETag',async()=>{
 const {h,local,calls}=setup({pending:false});
 await h.connectCloud();
 h.app.db.Instellingen[0].Waarde='125';h.persist();
 assert.equal(h.hasPending(2026),true);
 await h.saveCloud();
 assert.equal(calls[1].method,'PUT');
 assert.equal(calls[1].headers['If-Match'],'"v1"');
 assert.equal(h.hasPending(2026),false);
 assert.equal(local.getItem('la-last-synced-2026'),'"v2"');
});
test('logged-out mutations cannot persist, change brand, or add projects',()=>{
 const {h,local,calls}=setup({pending:false});
 const before=JSON.stringify(h.app.db);
 h.saveBrand();
 h.clickAction('new-project',{dataset:{}});
 h.clickAction('agenda-new',{dataset:{date:'2026-11-11'}});
 h.persist();
 assert.equal(JSON.stringify(h.app.db),before);
 assert.equal(h.hasPending(2026),false);
 assert.equal(h.app.projectWizard,null);
 assert.equal(calls.length,0);
});
test('invalid credentials and missing online workbook do not enable editing or upload local data',async()=>{
 for(const remoteStatus of [401,404,503]){
  const {h,calls,local}=setup({remoteStatus});
  await h.connectCloud();
  assert.equal(h.app.cloud.connected,false);
  assert.equal(calls.length,1);
  assert.equal(calls[0].method,'GET');
  assert.equal(local.getItem('la-pending-2026'),'1');
 }
});
test('logout clears session and private data from active app',async()=>{
 const {h,session}=setup({pending:false});
 await h.connectCloud();h.app.db.Projecten.push({Projectnummer:'private'});
 await h.logoutCloud();
 assert.equal(h.app.cloud.connected,false);
 assert.equal(session.getItem('la-stack-session-password'),null);
 assert.equal(h.app.db.Projecten.length,0);
});
test('session-only password is restored when application is reloaded',()=>{
 const {session,local}=setup();
 session.setItem('la-stack-session-password','secret-from-session');
 const nodes=new Map();
 const context={window:{localStorage:local,sessionStorage:session,addEventListener(){}},document:{getElementById:id=>nodes.get(id),querySelectorAll:()=>[]},URL,Response,TextEncoder,Intl,Date,console,setTimeout,clearTimeout};
 vm.runInNewContext(source.replace(end,hook+end),vm.createContext(context),{filename:'app.js'});
 assert.equal(context.__laTest.app.cloud.password,'secret-from-session');
});
