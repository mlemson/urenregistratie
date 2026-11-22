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
 await page.getByText('Gekoppelde declaraties').waitFor();
 await page.locator('#dialogRoot [data-action="close-modal"]').click();
 await page.locator('[data-action="create-bill"]').click();
 await page.locator('.billing-history-actions [data-action="billing-claim-detail"]').first().click();
 await page.locator('#dialogRoot .billing-detail').getByText('Schets').waitFor();
 assert.match(await page.locator('#dialogRoot').innerText(),/2026-041/);
 await page.locator('#dialogRoot [data-action="close-modal"]').click();
 await page.locator('[data-page="overzicht"]').click();
 await page.locator('#dashboardMonth').selectOption('0');await page.locator('.overview-project').first().click();
 await page.getByRole('heading',{name:'P1 · Nieuwbouw woonhuis'}).waitFor();
 await page.locator('[data-action="dashboard-project-new"]').click();
 await page.locator('#editProject').waitFor();
 assert.equal(await page.locator('#editProject').inputValue(),'P1');
 await page.locator('[data-action="close-modal"]').last().click();
 await page.locator('[data-page="agenda"]').click();
 await page.locator('#agendaProjectFilter').waitFor();
 const bg=await page.locator('#agendaProjectFilter').evaluate(n=>getComputedStyle(n).backgroundColor);
 assert.notEqual(bg,'rgb(255, 255, 255)','dark agenda filters must not stay white');
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
