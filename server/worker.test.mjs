import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import worker from './worker.js';

if(!globalThis.crypto)globalThis.crypto=webcrypto;
const origin='https://mlemson.github.io';
const base='https://testaccount.stack.storage/remote.php/webdav/LA-Uren';
const env={
 APP_ORIGIN:origin, STACK_FOLDER_URL:base,
 STACK_USER:'voorbeeldgebruiker', STACK_TOKEN:'geheim', APP_PASSWORD:'een-lange-testcode'
};
const xlsx=new Uint8Array([0x50,0x4b,0x03,0x04,1,2,3,4,5,6]);

function mockWebdav({folderInitially=false,bareEtag=false}={}) {
 let folder=folderInitially;const files=new Map();let counter=1;
 const calls=[];
 const fetchMock=async(input,options={})=>{
   const url=String(input),method=(options.method||'GET').toUpperCase();
   calls.push({url,method,headers:options.headers||{}});
   if(!url.startsWith(base))throw Error('Onbekende url');
   assert.match(options.headers.Authorization,/^Basic /);
   if(method==='MKCOL'){
     if(folder)return new Response('',{status:405});
     folder=true;return new Response('',{status:201});
   }
   if(method==='PROPFIND')return new Response('',{status:folder?207:404});
   const f=files.get(url);
   if(method==='HEAD')return new Response(null,{status:f?200:404,headers:f?{'ETag':f.etag}:{}});
   if(method==='GET')return f?new Response(f.bytes,{status:200,headers:{'ETag':f.etag}}):new Response('',{status:404});
   if(method==='PUT'){
     if(!folder)return new Response('no parent',{status:409});
     const headers=options.headers||{};
     if(headers['If-None-Match']==='*'&&f)return new Response('exists',{status:412});
     if(headers['If-Match']&&headers['If-Match']!==(bareEtag?`"${f?.etag}"`:f?.etag))return new Response('stale',{status:412});
     const bytes=new Uint8Array(options.body),tag=`v${counter++}`,etag=bareEtag?tag:`"${tag}"`;
     files.set(url,{bytes,etag});return new Response(f?null:'',{status:f?204:201});
   }
   throw Error('Unsupported '+method);
 };
 return {calls,files,fetchMock,makeFile:(year)=>{folder=true;files.set(`${base}/LA-Uren-Km-${year}.xlsx`,{bytes:xlsx,etag:bareEtag?`v${counter++}`:`"v${counter++}"`});}};
}
async function run(method,path,{authorization='Bearer een-lange-testcode',originValue=origin,headers={},body}={}) {
 const h=new Headers(headers);
 if(authorization)h.set('Authorization',authorization);
 if(originValue)h.set('Origin',originValue);
 const req=new Request(`https://example.workers.dev${path}`,{method,headers:h,body});
 return worker.fetch(req,env);
}

test('unauthenticated and disallowed-origin requests are blocked',async()=>{
 const mock=mockWebdav();globalThis.fetch=mock.fetchMock;
 assert.equal((await run('GET','/api/year/2026',{authorization:''})).status,401);
 assert.equal((await run('GET','/api/year/2026',{originValue:'https://evil.example'})).status,403);
 assert.equal(mock.calls.length,0);
});

test('new year creates STACK folder and saves xlsx without publishing it',async()=>{
 const mock=mockWebdav();globalThis.fetch=mock.fetchMock;
 let r=await run('GET','/api/year/2027');
 assert.equal(r.status,404);
 r=await run('PUT','/api/year/2027',{headers:{'If-None-Match':'*'},body:xlsx});
 assert.equal(r.status,200);
 assert.equal(r.headers.get('ETag'),'"v1"');
 assert.ok(mock.calls.some(c=>c.method==='MKCOL'));
 r=await run('GET','/api/year/2027');
 assert.equal(r.status,200);
 assert.deepEqual(new Uint8Array(await r.arrayBuffer()),xlsx);
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),origin);
 assert.equal(r.headers.get('Cache-Control'),'no-store');
});

test('conditional saves prevent overwriting a changed file',async()=>{
 const mock=mockWebdav({folderInitially:true});globalThis.fetch=mock.fetchMock;
 mock.makeFile(2026);
 assert.equal((await run('PUT','/api/year/2026',{headers:{'If-Match':'"v0"'},body:xlsx})).status,412);
 assert.equal((await run('PUT','/api/year/2026',{headers:{'If-None-Match':'*'},body:xlsx})).status,412);
 let r=await run('PUT','/api/year/2026',{headers:{'If-Match':'"v1"'},body:xlsx});
 assert.equal(r.status,200);assert.equal(r.headers.get('ETag'),'"v2"');
 assert.equal((await run('PUT','/api/year/2026',{headers:{'If-Match':'"v1"'},body:xlsx})).status,412);
});

test('rejects unversioned and invalid uploads',async()=>{
 const mock=mockWebdav({folderInitially:true});globalThis.fetch=mock.fetchMock;
 assert.equal((await run('PUT','/api/year/2026',{body:xlsx})).status,428);
 assert.equal((await run('PUT','/api/year/2026',{headers:{'If-None-Match':'*'},body:new Uint8Array([1,2,3,4])})).status,400);
 assert.equal(mock.calls.length,0);
});

test('connection check distinguishes absent and present folder',async()=>{
 const mock=mockWebdav();globalThis.fetch=mock.fetchMock;
 assert.equal((await run('GET','/api/status')).status,404);
 mock.makeFile(2026);
 const r=await run('GET','/api/status');
 assert.equal(r.status,200);
 assert.equal((await r.json()).ready,true);
});


test('postcode tot postcode geeft een autoroute (enkele reis)',async()=>{
 const calls=[];
 globalThis.fetch=async(input,options={})=>{
  const u=String(input);calls.push(u);
  if(u.startsWith('https://api.pdok.nl/')){
   const query=new URL(u).searchParams.get('q');
   const code=query.replace(/\s+/g,'').toUpperCase();
   const point=code==='7462MR'?'POINT (6.5 52.25)':'POINT (6.65 52.28)';
   return new Response(JSON.stringify({response:{docs:[{postcode:code,centroide_ll:point}]}}),{status:200,headers:{'Content-Type':'application/json'}});
  }
  if(u.startsWith('https://router.project-osrm.org/'))return new Response(JSON.stringify({routes:[{distance:12500}]}),{status:200});
  throw Error('Niet verwacht: '+u);
 };
 const r=await run('GET','/api/route?from=7462%20MR&to=7511%20AB');
 assert.equal(r.status,200);const d=await r.json();assert.equal(d.km,12.5);
 assert.ok(calls.filter(x=>x.startsWith('https://api.pdok.nl/')).length===2);
 assert.ok(calls.some(x=>x.startsWith('https://router.project-osrm.org/')));
});

test('route weigert onjuiste postcodes in plaats van een andere locatie te kiezen',async()=>{
 globalThis.fetch=async(input)=>{
  const u=String(input);
  if(u.startsWith('https://api.pdok.nl/'))return new Response(JSON.stringify({response:{docs:[{postcode:'1234AB',centroide_ll:'POINT (6 52)'}]}}),{status:200});
  throw Error('Er mocht geen routeberekening plaatsvinden');
 };
 const r=await run('GET','/api/route?from=7462%20MR&to=7511%20AB');
 assert.equal(r.status,422);
});

test('unquoted STACK ETags can save with quoted If-Match forwarded to WebDAV',async()=>{
 const mock=mockWebdav({folderInitially:true,bareEtag:true});globalThis.fetch=mock.fetchMock;
 mock.makeFile(2026);
 const loaded=await run('GET','/api/year/2026');
 assert.equal(loaded.status,200);
 assert.equal(loaded.headers.get('ETag'),'v1');
 let saved=await run('PUT','/api/year/2026',{headers:{'If-Match':loaded.headers.get('ETag')},body:xlsx});
 assert.equal(saved.status,200,await saved.text());
 assert.equal(saved.headers.get('ETag'),'v2');
 const upstream=mock.calls.filter(c=>c.method==='PUT').at(-1);
 assert.equal(upstream.headers['If-Match'],'"v1"');
 assert.equal((await run('PUT','/api/year/2026',{headers:{'If-Match':'v1'},body:xlsx})).status,412);
});

test('malformed, wildcard, and weak If-Match values do not write',async()=>{
 const mock=mockWebdav({folderInitially:true,bareEtag:true});globalThis.fetch=mock.fetchMock;
 mock.makeFile(2026);
 for(const tag of ['*','W/"v1"','"v1", "v2"','v1,v2','"v1"junk']){
  const r=await run('PUT','/api/year/2026',{headers:{'If-Match':tag},body:xlsx});
  assert.equal(r.status,400,tag);
 }
 assert.equal(mock.calls.filter(c=>c.method==='PUT').length,0);
});
