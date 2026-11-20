import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker,{registration,stackURL} from '../server/worker.mjs';
const origin='https://mlemson.github.io',setupKey='setup-key-'.repeat(5);
function adapter(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));const db={prepare(query){return {bind(...args){const st=sql.prepare(query);return {first:async()=>st.get(...args)||null,all:async()=>({results:st.all(...args)}),run:async()=>({meta:{changes:Number(st.run(...args).changes)}}),query,args};}};},async batch(items){sql.exec('BEGIN');try{const results=[];for(const x of items){if(/^\s*SELECT/i.test(x.query))results.push(await x.all());else results.push(await x.run());}sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {db,sql};}
function fixture(){const {db,sql}=adapter();const env={DB:db,APP_ORIGIN:origin,SETUP_KEY:setupKey,STORAGE_KEY:btoa('01234567890123456789012345678901')};let sequence=1;async function request(path,token='',data,site=origin){const headers={'Origin':site,'CF-Connecting-IP':'192.0.2.'+sequence++};if(token)headers.Authorization='Bearer '+token;if(data!==undefined)headers['Content-Type']='application/json';const response=await worker.fetch(new Request('https://example.workers.dev'+path,{headers,method:data===undefined?'GET':'POST',body:data===undefined?undefined:data instanceof ArrayBuffer?data:JSON.stringify(data)}),env);return {status:response.status,data:await response.json()};}async function ok(path,token,data){const r=await request(path,token,data);assert.equal(r.status,200,JSON.stringify(r));return r.data;}async function company(slug){return (await ok('/setup','',{slug,company:slug,mode:'team',name:'Owner',email:'owner@example.org',password:'abcdefghijklmnop',key:setupKey})).token;}async function member(owner,email,role='member'){const inv=await ok('/invites',owner,{email,role});return {token:(await ok('/join','',{invite:inv.invite,name:email,password:'abcdefghijklmnop'})).token,invite:inv.invite};}return {request,ok,company,member,sql,env};}
const entry=(extra={})=>({project:'P1',date:'2026-11-20',activity:'1 ontwerp',start:'09:00',end:'11:00',minutes:999,km:20,...extra});
test('multi-tenant permissions, invitations, individual hours and admin totals',async()=>{const f=fixture();const a=await f.company('bureau-a'),b=await f.company('bureau-b');const m=await f.member(a,'medewerker@example.org');const other=await f.member(a,'collega@example.org');assert.equal((await f.request('/join','',{invite:m.invite,name:'test',password:'abcdefghijklmnop'})).status,400);await f.ok('/projects',a,{code:'P1',name:'A project',rate:10000});await f.ok('/projects',b,{code:'P1',name:'B project',rate:20000});const ar=await f.ok('/entries',a,entry()),mr=await f.ok('/entries',m.token,entry({note:'Persoonlijk'}));await f.ok('/entries',other.token,entry({start:'',end:'',minutes:60}));const aa=await f.ok('/data?year=2026',a),bb=await f.ok('/data?year=2026',b),mm=await f.ok('/data?year=2026',m.token);assert.equal(aa.entries.length,3);assert.equal(aa.entries.reduce((n,r)=>n+r.minutes,0),300);assert.equal(bb.entries.length,0);assert.equal(bb.projects[0].name,'B project');assert.equal(mm.entries.length,1);assert.equal(mm.entries[0].id,mr.id);assert.equal(mm.projects[0].rate,undefined);assert.equal((await f.request('/entries',m.token,entry({id:ar.id,rev:1}))).status,403);assert.equal((await f.request('/entries',b,entry({id:ar.id,rev:1}))).status,409);assert.equal((await f.request('/projects',m.token,{code:'P2',name:'No'})).status,403);assert.equal((await f.request('/export',m.token)).status,403);assert.equal((await f.request('/data?year=2026','')).status,401);assert.equal((await f.request('/data?year=2026',a,undefined,'https://bad.example')).status,403);});
test('partial billing atomically reserves hours and blocks double allocation and stale edits',async()=>{const f=fixture(),a=await f.company('bureau-a');await f.ok('/projects',a,{code:'P1',name:'Project'});const r=await f.ok('/entries',a,entry({start:'',end:'',minutes:300}));const bill={project:'P1',date:'2026-11-20',method:'hours',amount:30000,allocations:[{id:r.id,minutes:180}]};const c=await f.ok('/claims',a,bill);assert.equal((await f.request('/claims',a,bill)).status,409);assert.equal((await f.ok('/data?year=2026',a)).claims.length,1);assert.equal((await f.request('/entries',a,entry({id:r.id,rev:1,start:'',end:'',minutes:120}))).status,409);await f.ok('/entries',a,entry({id:r.id,rev:1,start:'',end:'',minutes:360}));assert.equal((await f.request('/entries',a,entry({id:r.id,rev:1}))).status,409);await f.ok('/claims/status',a,{id:c.id,status:'void'});assert.equal((await f.ok('/data?year=2026',a)).entries[0].billed,0);});
test('password checks, sessions, administrator and disabled employee',async()=>{const f=fixture(),a=await f.company('bureau-a');const m=await f.member(a,'admin@example.org','admin');assert.equal((await f.request('/login','',{slug:'bureau-a',email:'owner@example.org',password:'wrong-password'})).status,401);assert.equal((await f.request('/login','',{slug:'bureau-a',email:'owner@example.org',password:'abcdefghijklmnop'})).status,200);assert.equal((await f.request('/invites',m.token,{email:'x@example.org'})).status,403);const id=(await f.ok('/me',m.token)).id;await f.ok('/members/disable',a,{id});assert.equal((await f.request('/me',m.token)).status,401);await f.ok('/logout',a,{});assert.equal((await f.request('/me',a)).status,401);});
test('company STACK configuration encrypted and backup isolated',async()=>{const f=fixture(),a=await f.company('bureau-a'),b=await f.company('bureau-b');const original=globalThis.fetch,calls=[];globalThis.fetch=async(url,opts)=>{calls.push({url,opts});return new Response(null,{status:opts.method==='PROPFIND'?207:201});};try{await f.ok('/storage',a,{url:'https://example.stack.storage/remote.php/webdav/uren',user:'test-user',token:'private-token'});const row=f.sql.prepare('SELECT storage FROM companies WHERE slug=?').get('bureau-a');assert.ok(!row.storage.includes('private-token'));assert.ok(!row.storage.includes('test-user'));assert.equal((await f.ok('/storage',b)).configured,false);const payload=new Uint8Array([80,75,3,4]).buffer;assert.equal((await f.request('/backup',b,payload)).status,400);const result=await f.ok('/backup',a,payload);assert.match(result.name,/^Uren-backup-.*\.xlsx$/);assert.equal(calls[1].opts.headers['If-None-Match'],'*');assert.match(calls[1].url,/example\.stack\.storage/);assert.ok(!JSON.stringify(await f.ok('/export',a)).includes('private-token'));}finally{globalThis.fetch=original;}});
test('input validation and strict STACK host allowlist',()=>{assert.equal(registration(entry()).minutes,120);assert.throws(()=>registration(entry({date:'2026-02-30'})));assert.throws(()=>registration(entry({end:'08:00'})));assert.throws(()=>stackURL('https://example.stack.storage.evil.test/remote.php/webdav/uren'));assert.throws(()=>stackURL('http://example.stack.storage/remote.php/webdav/uren'));});
test('route resolves exact postcode centers and uses direct OSRM car endpoint',async()=>{
 const f=fixture(),a=await f.company('route-test'),original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,opts)=>{calls.push(String(url));assert.ok(opts.headers['User-Agent']);
  if(String(url).startsWith('https://api.pdok.nl/')){const p=new URL(url).searchParams.get('q');return Response.json({response:{docs:[{postcode:p,centroide_ll:p==='1234AB'?'POINT (5.1 52.1)':'POINT (5.5 52.5)'}]}});}
  assert.match(String(url),/^https:\/\/routing\.openstreetmap\.de\/routed-car\/route\/v1\/driving\//);
  return Response.json({code:'Ok',routes:[{distance:12345}]});
 };
 try{const r=await f.ok('/route',a,{from:'1234 AB',to:'5678 cd'});assert.equal(r.km,12.35);assert.match(r.source,/OSRM/);assert.equal(calls.length,3);assert.equal((await f.request('/route',a,{from:'123',to:'5678CD'})).status,400);assert.equal((await f.request('/route','',{from:'1234AB',to:'5678CD'})).status,401);}
 finally{globalThis.fetch=original;}
});
test('route fails with a specific network or provider error, never artificial kilometers',async()=>{
 const f=fixture(),a=await f.company('route-test'),original=globalThis.fetch;
 const goodGeo=url=>{const p=new URL(url).searchParams.get('q');return Response.json({response:{docs:[{postcode:p,centroide_ll:p==='1234AB'?'POINT (5.1 52.1)':'POINT (5.5 52.5)'}]}});};
 try{
 globalThis.fetch=async()=>{throw Error('internal network details');};
 let r=await f.request('/route',a,{from:'1234AB',to:'5678CD'});assert.equal(r.status,502);assert.match(r.data.error,/Postcodeservices/);assert.doesNotMatch(r.data.error,/internal network/);
 globalThis.fetch=async url=>String(url).includes('api.pdok.nl')?goodGeo(url):Promise.reject(Error('network'));
 r=await f.request('/route',a,{from:'1234AB',to:'5678CD'});assert.equal(r.status,502);assert.match(r.data.error,/Routeplanner/);
 globalThis.fetch=async url=>String(url).includes('api.pdok.nl')?goodGeo(url):new Response('',{status:429});
 r=await f.request('/route',a,{from:'1234AB',to:'5678CD'});assert.equal(r.status,429);assert.match(r.data.error,/overbelast/);
 globalThis.fetch=async url=>String(url).includes('api.pdok.nl')?Response.json({response:{docs:[{postcode:'9999ZZ',centroide_ll:'POINT (5.1 52.1)'}]}}):Response.json([]);
 r=await f.request('/route',a,{from:'1234AB',to:'5678CD'});assert.equal(r.status,422);assert.match(r.data.error,/niet gevonden/);
 }finally{globalThis.fetch=original;}
});
test('optional ORS route provider uses server-side API key only for ORS',async()=>{
 const f=fixture(),a=await f.company('route-test'),original=globalThis.fetch;f.env.ORS_API_KEY='test-secret';
 globalThis.fetch=async(url,opts)=>{
  if(String(url).includes('api.pdok.nl')){assert.equal(opts.headers.Authorization,undefined);const p=new URL(url).searchParams.get('q');return Response.json({response:{docs:[{postcode:p,centroide_ll:p==='1234AB'?'POINT (5.1 52.1)':'POINT (5.5 52.5)'}]}});}
  assert.equal(new URL(url).hostname,'api.openrouteservice.org');assert.equal(opts.headers.Authorization,'test-secret');
  return Response.json({features:[{properties:{summary:{distance:30000}}}]});
 };
 try{const r=await f.ok('/route',a,{from:'1234AB',to:'5678CD'});assert.equal(r.km,30);assert.match(r.source,/OpenRouteService/);}
 finally{globalThis.fetch=original;}
});

test('independent postcode fallback survives complete PDOK outage and never uses an inexact postcode',async()=>{
 const f=fixture(),a=await f.company('fallback-test'),original=globalThis.fetch,calls=[];
 globalThis.fetch=async url=>{
  calls.push(String(url));const u=new URL(url);
  if(u.hostname==='api.pdok.nl')throw Error('PDOK unavailable');
  if(u.hostname==='gratis-postcodedata.nl'){const p=u.pathname.split('/').at(-1);return Response.json([{country:'nl',postcode:p,lat:52.1,lon:p==='1234AB'?5.1:5.5}]);}
  assert.equal(u.hostname,'routing.openstreetmap.de');return Response.json({code:'Ok',routes:[{distance:15000}]});
 };
 try{const r=await f.ok('/route',a,{from:'1234 AB',to:'5678 CD'});assert.equal(r.km,15);assert.match(r.geocoders,/Gratis Postcodedata/);assert.equal(calls.filter(u=>u.includes('gratis-postcodedata.nl')).length,2);
 globalThis.fetch=async url=>{if(String(url).includes('api.pdok.nl'))throw Error('offline');return Response.json([{country:'nl',postcode:'9999ZZ',lat:52.1,lon:5.1}]);};
 assert.equal((await f.request('/route',a,{from:'1234AB',to:'5678CD'})).status,422);
 }finally{globalThis.fetch=original;}
});

test('optional modules are off initially, owner-managed, tenant-isolated, and retain disabled data',async()=>{
 const f=fixture(),a=await f.company('modules-a'),b=await f.company('modules-b'),m=await f.member(a,'person@example.org');
 const initial=await f.ok('/data?year=2026',a);assert.equal(initial.modules.clients,0);assert.equal(initial.preferences.dark,0);
 assert.equal((await f.request('/clients',a,{name:'Disabled'})).status,403);
 assert.equal((await f.request('/modules',m.token,{clients:true,budgets:true,warnings:true})).status,403);
 assert.equal((await f.request('/modules',a,{clients:false,budgets:false,warnings:true})).status,400);
 await f.ok('/modules',a,{clients:true,budgets:true,warnings:true});
 const cl=await f.ok('/clients',a,{name:'Klant A',email:'test@example.org'});
 await f.ok('/modules',b,{clients:true,budgets:true,warnings:true});
 assert.equal((await f.request('/projects',b,{code:'P1',name:'Cross tenant',client_id:cl.id})).status,400);
 await f.ok('/projects',a,{code:'P1',name:'Project A',rate:10000,client_id:cl.id,budget_minutes:120,budget_cents:25000});
 await f.ok('/entries',a,entry());await f.ok('/entries',m.token,entry({date:'2027-01-01',start:'',end:'',minutes:60}));
 const data=await f.ok('/data?year=2026',a);assert.equal(data.clients[0].name,'Klant A');assert.equal(data.projects[0].used_minutes,180);assert.equal(data.projects[0].used_cents,30000);
 const employee=await f.ok('/data?year=2026',m.token);assert.equal(employee.clients.length,0);assert.equal(employee.projects[0].budget_cents,undefined);assert.equal(employee.projects[0].used_minutes,undefined);
 await f.ok('/preferences',m.token,{stopwatch:true,repeat_entry:true,dark:true});assert.equal((await f.ok('/data?year=2026',m.token)).preferences.dark,1);assert.equal((await f.ok('/data?year=2026',a)).preferences.dark,0);
 await f.ok('/modules',a,{clients:false,budgets:false,warnings:false});await f.ok('/projects',a,{code:'P1',name:'Renamed',rate:10000});assert.equal((await f.ok('/data?year=2026',a)).projects[0].budget_minutes,undefined);
 await f.ok('/modules',a,{clients:true,budgets:true,warnings:true});const restored=await f.ok('/data?year=2026',a);assert.equal(restored.projects[0].client_id,cl.id);assert.equal(restored.projects[0].budget_minutes,120);assert.equal((await f.ok('/data?year=2026',b)).clients.length,0);
 const exported=await f.ok('/export',a);assert.equal(exported.clients[0].id,cl.id);assert.equal(exported.project_extras[0].budget_cents,25000);
});
test('optional schema can initialize an existing pilot without deleting rows',async()=>{
 const f=fixture(),a=await f.company('old-pilot');await f.ok('/projects',a,{code:'P1',name:'Existing'});
 f.sql.exec('DROP TABLE optional_schema_v1; DROP TABLE project_extras; DROP TABLE clients; DROP TABLE member_preferences; DROP TABLE company_modules;');
 const data=await f.ok('/data?year=2026',a);assert.equal(data.projects[0].name,'Existing');assert.equal(data.modules.clients,0);assert.equal((await f.ok('/data?year=2026',a)).preferences.dark,0);
});
