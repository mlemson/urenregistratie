import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const origin='https://mlemson.github.io';
const workbook={
 Projecten:[{Projectnummer:'P1',Omschrijving:'Nieuwbouw woonhuis',Actueel:'J',Uurtarief:100,BudgetUren:2,BudgetEuro:250,KlantId:'C1'}],
 Klanten:[{Id:'C1',Naam:'Voorbeeldklant',Actueel:'J'}],
 Activiteiten:[{Naam:'1 ontwerp',SoortUren:'DIRECT'}],
 Registraties:[{Id:'R1',Datum:'2026-11-20',Projectnummer:'P1',Activiteit:'1 ontwerp',Omschrijving:'Schets',SoortUren:'DIRECT',Uren:3,Km:30,VanPostcode:'7462 MR',NaarPostcode:'7534 JK',Retour:'Ja',VroegerGedeclareerdeUren:1,FacturatieStatus:'open',Begintijd:'09:00',Eindtijd:'12:00'}],
 Declaraties:[{Id:'D1',Projectnummer:'P1',Datum:'2026-11-20',Status:'verzonden',BedragExBtw:200}],
 Declaratieregels:[],HistorischeDeclaraties:[],
 Instellingen:[{Sleutel:'Bedrijfsnaam',Waarde:'Lemson Architecten'},{Sleutel:'StandaardUurtarief',Waarde:'100'},{Sleutel:'ModuleKlanten',Waarde:'1'},{Sleutel:'ModuleBudgetten',Waarde:'1'},{Sleutel:'ModuleWaarschuwingen',Waarde:'1'},{Sleutel:'ModuleDonker',Waarde:'1'},{Sleutel:'ModuleHerhalen',Waarde:'1'},{Sleutel:'ModuleStopwatch',Waarde:'1'}],
 Mutaties:[]
};
const sheetStub='window.XLSX={read:()=>({SheetNames:Object.keys(window.__demoDb),Sheets:Object.fromEntries(Object.entries(window.__demoDb).map(([k,v])=>[k,{rows:v}]))}),utils:{sheet_to_json:x=>x.rows,json_to_sheet:(r)=>({rows:r}),book_new:()=>({list:[]}),book_append_sheet:(wb,sheet,name)=>wb.list.push({name,sheet}),aoa_to_sheet:r=>({rows:r})},write:()=>new Uint8Array([80,75,3,4])}';
test('existing STACK homepage: login, dashboard, project, agenda, optional modules and responsive dark mode',async()=>{
 const browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1280,height:880}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(db=>{window.__demoDb=db},workbook);
 try{
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname==='cdn.sheetjs.com'){await route.fulfill({status:200,contentType:'application/javascript',body:sheetStub});return;}
  if(url.hostname==='example.workers.dev'){
   const base={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET,PUT,OPTIONS','Access-Control-Allow-Headers':'Authorization,Content-Type,If-Match','Access-Control-Expose-Headers':'ETag'};
   if(route.request().method()==='OPTIONS'){await route.fulfill({status:204,headers:base});return;}
   if(route.request().method()==='PUT'){await route.fulfill({status:200,headers:{...base,ETag:'"v2"'},body:'ok'});return;}
   await route.fulfill({status:200,headers:{...base,ETag:'"v1"'},body:Buffer.from([80,75,3,4])});return;
  }
  if(url.hostname===new URL(origin).hostname){
   const sub=url.pathname.replace(/^\/urenregistratie\/?/,'')||'index.html';
   const file=path.resolve(folder,sub);
   if(!file.startsWith(folder+path.sep)){await route.abort();return;}
   try{const buf=readFileSync(file);await route.fulfill({status:200,contentType:sub.endsWith('.css')?'text/css':sub.endsWith('.js')?'application/javascript':'text/html',body:buf});}catch{await route.fulfill({status:404,body:'Not found'});}return;
  }
  await route.abort();
 });
 await page.goto(origin+'/urenregistratie/');
 await page.getByRole('heading',{name:'Inloggen'}).waitFor();
 assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('stack-authed')),false);
 await page.locator('#cloudUrl').fill('https://example.workers.dev');
 await page.locator('#cloudPassword').fill('example-password');
 await page.locator('#stackLoginForm button[type=submit]').click();
 await page.locator('.overview-project').waitFor({state:'visible'});
 assert.match(await page.locator('#app').innerText(),/Nieuwbouw woonhuis/);
 assert.match(await page.locator('#app').innerText(),/30 km/);
 assert.match(await page.locator('#app').innerText(),/Budgetwaarschuwingen/);
 assert.equal(await page.locator('body').evaluate(n=>n.classList.contains('stack-dark')),true);
 assert.equal(await page.locator('.stack-sidebar').evaluate(n=>getComputedStyle(n).display),'flex');
 await page.locator('[data-page="declaraties"]').click();
 await page.locator('[data-bill-hours="R1"]').waitFor();
 assert.equal(await page.locator('[data-bill-hours="R1"]').inputValue(),'2');
 assert.equal(await page.locator('[data-bill-check="R1"]').isChecked(),true);
 assert.match(await page.locator('.bill-summary').innerText(),/Geselecteerde uren\s*2\s*uur/);
 assert.match(await page.locator('.bill-summary').innerText(),/200,00/);
 await page.locator('[data-bill-hours="R1"]').fill('1');
 await page.locator('[data-bill-hours="R1"]').press('Tab');
 assert.match(await page.locator('.bill-summary').innerText(),/100,00/);
 await page.locator('#billReference').fill('2026-041');
 await page.locator('#billNote').fill('Deels uitgevoerd');
 await page.locator('[data-bill-check="R1"]').uncheck();
 assert.equal(await page.locator('#billReference').inputValue(),'2026-041');
 assert.equal(await page.locator('#billNote').inputValue(),'Deels uitgevoerd');
 assert.equal(await page.locator('[data-bill-hours="R1"]').inputValue(),'0');
 await page.locator('[data-bill-check="R1"]').check();
 assert.match(await page.locator('.bill-summary').innerText(),/200,00/);
 await page.locator('.billing-ledger > summary').click();
 assert.equal(await page.locator('.billing-ledger tbody tr').count(),1);
 await page.locator('.billing-ledger [data-action="billing-entry-detail"]').first().click();
 await page.getByRole('heading',{name:'Gekoppelde declaraties',exact:true}).waitFor();
 await page.locator('#dialogRoot [data-action="close-modal"]').click();
 await page.locator('[data-action="create-bill"]').click();
 await page.locator('.billing-history-actions [data-action="billing-claim-detail"]').first().click();
 await page.locator('#dialogRoot .billing-detail').getByText('Schets').waitFor();
 assert.match(await page.locator('#dialogRoot').innerText(),/2026-041/);
 await page.locator('#dialogRoot [data-action="close-modal"]').click();
 await page.locator('[data-page="overzicht"]').click();
 await page.locator('#dashboardMonth').selectOption('0');
 // Browser regression: clicking a selected month again must leave no highlight,
 // even while the pointer is still hovering over the last clicked month.
 const december=page.locator('[data-action="dashboard-month"][data-month="12"]');
 await december.click();
 assert.equal(await december.getAttribute('aria-pressed'),'true');
 await december.click();
 assert.equal(await page.locator('#dashboardMonth').inputValue(),'0');
 assert.equal(await page.locator('.overview-chart-month.selected').count(),0);
 assert.equal(await december.getAttribute('aria-pressed'),'false');
 await december.hover();
 assert.equal(await december.evaluate(el=>getComputedStyle(el).backgroundColor),'rgba(0, 0, 0, 0)');
await page.locator('.overview-project').first().click();
 await page.getByRole('heading',{name:'P1 · Nieuwbouw woonhuis'}).waitFor();
 await page.locator('[data-action="dashboard-project-new"]').click();
 await page.locator('#editProject').waitFor();
 assert.equal(await page.locator('#editProject').inputValue(),'P1');
 await page.locator('[data-action="close-modal"]').last().click();
 await page.locator('[data-page="agenda"]').click();
 await page.locator('#agendaProjectFilter').waitFor();
 const bg=await page.locator('#agendaProjectFilter').evaluate(n=>getComputedStyle(n).backgroundColor);
 assert.notEqual(bg,'rgb(255, 255, 255)','dark agenda filters must not stay white');
 await page.locator('[data-page="registreren"]').click();
 await page.locator('[data-action="edit-entry"]').first().click();
 await page.locator('#dialogRoot [data-action="delete-entry"]').waitFor();
 await page.locator('#dialogRoot [data-action="delete-entry"]').click();
 assert.match(await page.locator('#notice').innerText(),/declaratiehistorie/);
 await page.locator('#dialogRoot [data-action="repeat-entry"]').click();
 await page.getByRole('heading',{name:'Registratie toevoegen'}).waitFor();
 assert.equal(await page.locator('#editStartTime').inputValue(),'');
 assert.equal(await page.locator('#editHours').inputValue(),'3');
 await page.locator('#dialogRoot [data-action="save-entry-edit"]').click();
 assert.match(await page.locator('#notice').innerText(),/Registratie toegevoegd/);
 await page.locator('[data-page="registreren"]').click();
 assert.equal(await page.locator('.entry').count(),2);
 await page.locator('.entry [data-action="edit-entry"]').first().click();
 page.once('dialog',d=>d.accept());
 await page.locator('#dialogRoot [data-action="delete-entry"]').click();
 assert.match(await page.locator('#notice').innerText(),/Registratie verwijderd/);
 assert.equal(await page.locator('.entry').count(),1);
 await page.locator('[data-page="instellingen"]').click();
 assert.equal(await page.locator('#moduleClients').isChecked(),true);
 assert.equal(await page.locator('#moduleDark').isChecked(),true);
 await page.locator('#moduleDark').uncheck();await page.locator('[data-action="save-modules"]').click();
 await page.waitForFunction(()=>!document.body.classList.contains('stack-dark'));
 await page.locator('[data-page="klanten"]').click();await page.getByText('Voorbeeldklant').waitFor();
 await page.setViewportSize({width:390,height:844});
 assert.equal(await page.locator('body').evaluate(n=>n.scrollWidth>window.innerWidth+2),false,'No horizontal page overflow on iPad-size/mobile viewport');
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
});

test('openbare handleiding en startpagina bevatten alle noodzakelijke stappen, zonder inloggegevens',()=>{
 const guide=readFileSync(path.join(folder,'handleiding.html'),'utf8');
 const start=readFileSync(path.join(folder,'starten.html'),'utf8');
 const css=readFileSync(path.join(folder,'boekuur-hulp.css'),'utf8');
 for(const name of ['Kopieer','Verwijderen','Declaraties','Inloggen','Bewaren','kilometers']){
  assert.match(guide,new RegExp(name,'i'));
 }
 assert.match(start,/e-mailverificatie/i);
 assert.match(start,/testdatabase/i);
 assert.match(start,/eigen bedrijfsaccount/i);
 assert.match(css,/@media/);
 assert.doesNotMatch(guide+start,/STACK_TOKEN|APP_PASSWORD|mauricelemson@hotmail\.com/);
});

test('Boekuur zelfstandige aanmelding toont verificatie en gebruikt juiste API zonder gedeelde STACK-login',async()=>{
 const browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1080,height:800}});
 const errors=[];page.on('pageerror',err=>errors.push(err.message));
 const bookuur='https://boekuur.nl',api='https://urenregistratie-team-test.mauricelemson.workers.dev';
 try{
  await page.route('**/*',async route=>{
   const u=new URL(route.request().url());
   if(u.hostname==='cdn.sheetjs.com'){
    await route.fulfill({status:200,contentType:'application/javascript',body:'window.XLSX={};'});return;
   }
   if(u.origin===api){
    await route.fulfill({status:200,contentType:'application/json',headers:{'Access-Control-Allow-Origin':bookuur},body:JSON.stringify({enabled:false})});return;
   }
   if(u.origin===bookuur){
    const rel=u.pathname.endsWith('/')?u.pathname.slice(1)+'index.html':u.pathname.slice(1),file=path.resolve(folder,rel);
    if(!file.startsWith(folder+path.sep)){await route.abort();return;}
    try{
     const bytes=readFileSync(file);
     await route.fulfill({status:200,contentType:rel.endsWith('.js')?'application/javascript':rel.endsWith('.css')?'text/css':'text/html',body:bytes});
    }catch{await route.fulfill({status:404,body:'Not found'});}
    return;
   }
   await route.abort();
  });
  await page.goto(bookuur+'/bedrijfsomgeving/?start=bedrijf');
  await page.getByRole('heading',{name:'Nieuw bedrijf aanmelden'}).waitFor();
  assert.equal(await page.locator('#base').inputValue(),api,'Boekuur uses the correct team backend without manual entry');
  assert.equal(await page.locator('#setupKey').count(),0,'Open registration must not ask for the private setup key');
  assert.equal(await page.locator('#cloudUrl').count(),0,'STACK credentials are never used for company registration');
  await page.waitForFunction(()=>document.querySelector('button.login-submit')?.disabled===true);
  assert.match(await page.locator('#app').innerText(),/aparte|productieopslag|productiedatabase/i);
  await page.locator('[data-team="login-mode"]').click();
  await page.getByRole('heading',{name:'Inloggen'}).waitFor();
  await page.locator('[data-team="register-mode"]').click();
  await page.getByRole('heading',{name:'Nieuw bedrijf aanmelden'}).waitFor();
  assert.equal(errors.length,0,errors.join('\n'));
 }finally{await browser.close();}
});
