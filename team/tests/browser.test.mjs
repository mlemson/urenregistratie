import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import worker from '../server/worker.mjs';
function adapter(){const sql=new DatabaseSync(':memory:');sql.exec(readFileSync(new URL('../server/schema.sql',import.meta.url),'utf8'));const db={prepare(query){return {bind(...args){const st=sql.prepare(query);return {first:async()=>st.get(...args)||null,all:async()=>({results:st.all(...args)}),run:async()=>({meta:{changes:Number(st.run(...args).changes)}}),query,args};}};},async batch(items){sql.exec('BEGIN');try{const results=[];for(const x of items){if(/^\s*SELECT/i.test(x.query))results.push(await x.all());else results.push(await x.run());}sql.exec('COMMIT');return results;}catch(e){sql.exec('ROLLBACK');throw e;}}};return {db,sql};}

test('browser: company setup, project, postcode outage, return trip, persistence, claims and phone layout',async()=>{
 const browser=await chromium.launch({headless:true});const {db,sql}=adapter(),origin='https://pilot.example.workers.dev',key='test-only-setup-key-'.repeat(3);
 const env={DB:db,APP_ORIGIN:origin,SETUP_KEY:key,STORAGE_KEY:btoa('01234567890123456789012345678901')};
 const prior=globalThis.fetch;
 globalThis.fetch=async url=>{const u=new URL(url);if(u.hostname==='api.pdok.nl')throw Error('PDOK offline in test');
 if(u.hostname==='gratis-postcodedata.nl'){const p=u.pathname.split('/').at(-1);return Response.json([{country:'nl',postcode:p,lat:52.1,lon:p==='1234AB'?5.1:5.2}]);}
 if(u.hostname==='routing.openstreetmap.de')return Response.json({routes:[{distance:12000}]});
 throw Error('Unexpected external call');};
 const assets={'/team/':'../index.html','/team/team.js':'../team.js','/team/team.css':'../team.css','/agenda.js':'../../agenda.js','/agenda-drag.js':'../../agenda-drag.js','/style.css':'../../style.css','/agenda.css':'../../agenda.css'};
 const page=await browser.newPage({viewport:{width:1365,height:900}});const errors=[];page.on('pageerror',er=>errors.push(er.message));
 try{
 await page.route('**/*',async route=>{
 const req=route.request(),url=new URL(req.url());
 if(url.origin!==origin){await route.abort();return;}
 if(assets[url.pathname]){const file=assets[url.pathname],type=file.endsWith('.js')?'application/javascript':file.endsWith('.css')?'text/css':'text/html';await route.fulfill({status:200,contentType:type,body:readFileSync(new URL(file,import.meta.url))});return;}
 const headers={...req.headers(),'CF-Connecting-IP':'192.0.2.10'};
 const response=await worker.fetch(new Request(req.url(),{method:req.method(),headers,...(req.method()==='POST'?{body:req.postDataBuffer()}: {})}),env);
 await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
 });
 await page.goto(origin+'/team/');await page.getByRole('button',{name:'Bedrijf aanmaken'}).click();
 for(const [id,v] of Object.entries({slug:'browser-test',company:'Testbureau',name:'Test eigenaar',email:'owner@example.org',password:'test-password-very-long',setupKey:key}))await page.locator('#'+id).fill(v);
 await page.locator('#mode').selectOption('team');await page.getByRole('button',{name:'Aanmaken',exact:true}).click();await page.locator('#nav').waitFor({state:'visible'});await page.getByRole('heading',{name:'Overzicht',exact:true}).waitFor();assert.equal(await page.locator('.dash-metrics .dash-metric').count(),4);
 await page.locator('#nav [data-page="projecten"]').click();await page.getByRole('button',{name:'+ Project',exact:true}).click();await page.locator('#prCode').fill('P1');await page.locator('#prName').fill('Testproject');await page.locator('#prRate').fill('100');await page.getByRole('button',{name:'Bewaren',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await page.getByText('Testproject',{exact:true}).waitFor();
 await page.locator('#nav [data-page="registraties"]').click();await page.getByRole('button',{name:'+ Registratie',exact:true}).click();
 await page.locator('#edStart').fill('09:00');await page.locator('#edEnd').fill('11:00');assert.equal(await page.locator('#edHours').inputValue(),'2');
 await page.locator('.team-mileage summary').click();await page.locator('#edFrom').fill('1234 AB');await page.locator('#edTo').fill('5678 CD');await page.getByRole('button',{name:'Bereken afstand'}).click();await page.waitForFunction(()=>document.querySelector('#edKm').value==='24.00');
 await page.locator('#edReturn').uncheck();assert.equal(await page.locator('#edKm').inputValue(),'12.00');await page.locator('#edReturn').check();assert.equal(await page.locator('#edKm').inputValue(),'24.00');
 await page.locator('#edNote').fill('Browserregistratie');await page.getByRole('button',{name:'Bewaren',exact:true}).click();await page.locator('#modal').waitFor({state:'hidden'});await page.getByText('Browserregistratie').waitFor();assert.equal(sql.prepare('SELECT minutes FROM entries').get().minutes,120);assert.equal(sql.prepare('SELECT km FROM entries').get().km,24);
 await page.reload();await page.locator('#nav').waitFor({state:'visible'});await page.getByRole('heading',{name:'Overzicht',exact:true}).waitFor();await page.locator('.dash-project').filter({hasText:'Testproject'}).click();await page.locator('#modal').getByRole('heading',{name:'Testproject'}).waitFor();assert.match(await page.locator('#modal .dash-detail-metrics').innerText(),/2 u/);await page.getByRole('button',{name:'Alle registraties',exact:true}).click();assert.equal(await page.locator('#recordProject').inputValue(),'P1');await page.getByText('Browserregistratie').waitFor();await page.locator('#nav [data-page="overzicht"]').click();await page.locator('#dashMonth').selectOption('0');assert.match(await page.locator('.dash-metrics').innerText(),/24 km/);await page.locator('#memberFilter').selectOption('all');assert.match(await page.locator('.dash-metrics').innerText(),/Verzonden declaraties/);await page.getByRole('button',{name:'Uitgebreid overzicht'}).click();await page.locator('.dash-extra-body').waitFor();await page.getByRole('button',{name:'Meer',exact:false}).first().click();await page.locator('#nav [data-page="kilometers"]').click();await page.getByRole('heading',{name:'Kilometers',exact:true}).waitFor();assert.match(await page.locator('.team-table').innerText(),/1234 AB/);
 await page.locator('#nav [data-page="declaraties"]').click();await page.locator('[data-allocate]').fill('1');await page.getByRole('button',{name:'Concept vastleggen'}).click();await page.getByText('Declaratie vastgelegd').waitFor();assert.equal(sql.prepare('SELECT minutes FROM allocations').get().minutes,60);
 await page.setViewportSize({width:390,height:844});await page.locator('#nav [data-page="overzicht"]').click();assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth>window.innerWidth+2),false,'mobile dashboard fits width');await page.locator('#nav [data-page="registraties"]').click();await page.getByRole('button',{name:'Wijzig',exact:true}).click();await page.locator('#modal').waitFor();const overflow=await page.locator('#modal').evaluate(el=>el.scrollWidth>el.clientWidth+2);assert.equal(overflow,false,'mobile dialog fits width');assert.deepEqual(errors,[]);
 }finally{globalThis.fetch=prior;await browser.close();sql.close();}
});
