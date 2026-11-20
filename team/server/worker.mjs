const enc=new TextEncoder(),dec=new TextDecoder();
const ACTIVITIES=['1 ontwerp','2 def ontwerp','3 bouwaanvraag','4 esth begeleiding','Bespreking','Offertes','Acquisitie','Administratie /boekh','Scholing / meeting','Overig'];
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
const fail=(s,m)=>{throw new HttpError(s,m)};
const uuid=()=>crypto.randomUUID();
const random=(n=32)=>Array.from(crypto.getRandomValues(new Uint8Array(n)),v=>v.toString(16).padStart(2,'0')).join('');
const hex=b=>Array.from(new Uint8Array(b),v=>v.toString(16).padStart(2,'0')).join('');
const digest=async s=>hex(await crypto.subtle.digest('SHA-256',enc.encode(s)));
const same=(a,b)=>{if(a.length!==b.length)return false;let v=0;for(let i=0;i<a.length;i++)v|=a.charCodeAt(i)^b.charCodeAt(i);return v===0;};
async function hashPassword(password,salt=random(16)){const key=await crypto.subtle.importKey('raw',enc.encode(password),'PBKDF2',false,['deriveBits']);return salt+':'+hex(await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:enc.encode(salt),iterations:100000},key,256));}
function text(v,max=200,required=true){if(typeof v!=='string'||v.length>max||(required&&!v.trim()))fail(400,'Ongeldige invoer');return v.trim();}
function integer(v,min,max){if(!Number.isInteger(v)||v<min||v>max)fail(400,'Ongeldig getal');return v;}
function email(v){v=text(v,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v))fail(400,'Ongeldig e-mailadres');return v;}
function slug(v){v=text(v,48).toLowerCase();if(!/^[a-z0-9][a-z0-9-]{1,47}$/.test(v))fail(400,'Ongeldige bedrijfscode');return v;}
function password(v){if(typeof v!=='string'||v.length<12||v.length>128)fail(400,'Wachtwoord: 12–128 tekens');return v;}
function date(v){if(typeof v!=='string'||!/^20\d\d-\d\d-\d\d$/.test(v)||!Number.isFinite(Date.parse(v))||new Date(v).toISOString().slice(0,10)!==v)fail(400,'Ongeldige datum');return v;}
function minute(v){if(!/^\d\d:\d\d$/.test(v))return null;const [h,m]=v.split(':').map(Number);return h<24&&m<60?h*60+m:null;}
function registration(b){const start=text(b.start??'',5,false),end=text(b.end??'',5,false);let minutes;if(start||end){const a=minute(start),z=minute(end);if(a===null||z===null||z<=a)fail(400,'Ongeldige tijden');minutes=z-a;}else minutes=integer(b.minutes,1,1440);const km=b.km??0;if(typeof km!=='number'||!Number.isFinite(km)||km<0||km>100000)fail(400,'Ongeldige kilometers');return {project:text(b.project,40),date:date(b.date),activity:text(b.activity,100),note:text(b.note??'',2000,false),start,end,minutes,km,from_pc:text(b.from_pc??'',100,false),to_pc:text(b.to_pc??'',100,false),return_trip:b.return_trip===false?0:1};}
const stmt=(db,sql,...args)=>db.prepare(sql).bind(...args);
const one=(db,sql,...args)=>stmt(db,sql,...args).first();
const all=async(db,sql,...args)=>(await stmt(db,sql,...args).all()).results;
const run=(db,sql,...args)=>stmt(db,sql,...args).run();
const audit=(db,u,action,id)=>stmt(db,'INSERT INTO audit(id,company_id,member_id,action,object_id) VALUES(?,?,?,?,?)',uuid(),u.company_id,u.id,action,id);
const manager=u=>u.role==='owner'||u.role==='admin';
function requireManager(u){if(!manager(u))fail(403,'Geen toegang');}
function requireOwner(u){if(u.role!=='owner')fail(403,'Alleen de eigenaar');}
async function body(req){if(Number(req.headers.get('content-length'))>65536)fail(413,'Te groot');const raw=await req.text();if(raw.length>65536)fail(413,'Te groot');try{const b=JSON.parse(raw);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{fail(400,'Ongeldige JSON');}}
async function limit(db,key){const now=Math.floor(Date.now()/900000);const r=await one(db,`INSERT INTO login_limits(key,window,count) VALUES(?,?,1) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN window=excluded.window THEN count+1 ELSE 1 END,window=excluded.window RETURNING count`,key,now);if(r.count>12)fail(429,'Te veel pogingen. Probeer later opnieuw.');}
async function session(db,req){const token=req.headers.get('authorization')?.match(/^Bearer ([0-9a-f]{64})$/)?.[1];if(!token)fail(401,'Log in');const u=await one(db,`SELECT m.id,m.company_id,m.email,m.name,m.role,c.slug,c.name AS company,c.mode,c.rate,c.logo FROM sessions s JOIN members m ON m.id=s.member_id JOIN companies c ON c.id=m.company_id WHERE s.token=? AND s.expires>? AND m.active=1`,await digest(token),Date.now());if(!u)fail(401,'Sessie verlopen');return u;}
async function issue(db,id){const token=random();await run(db,'INSERT INTO sessions(token,member_id,expires) VALUES(?,?,?)',await digest(token),id,Date.now()+12*3600000);return {token};}
async function aes(env){if(!env.STORAGE_KEY)fail(503,'Opslagsleutel ontbreekt');let bytes;try{bytes=Uint8Array.from(atob(env.STORAGE_KEY),c=>c.charCodeAt(0));}catch{fail(503,'Ongeldige opslagsleutel');}if(bytes.length!==32)fail(503,'Ongeldige opslagsleutel');return crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']);}
function stackURL(v){let u;try{u=new URL(v);}catch{fail(400,'Ongeldig STACK-adres');}if(u.protocol!=='https:'||u.port||u.username||u.password||u.search||u.hash||!/^[-a-z0-9]+\.(stack\.storage|stackstorage\.com)$/.test(u.hostname)||!u.pathname.startsWith('/remote.php/webdav/')||u.pathname.replace(/\/+$/,'')==='/remote.php/webdav')fail(400,'Gebruik een aparte STACK WebDAV-map');return u.href.replace(/\/+$/,'');}
async function seal(env,id,v){const iv=crypto.getRandomValues(new Uint8Array(12));const out=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:enc.encode(id)},await aes(env),enc.encode(JSON.stringify(v)));return JSON.stringify({iv:Array.from(iv),data:Array.from(new Uint8Array(out))});}
async function unseal(env,id,v){const p=JSON.parse(v);return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(p.iv),additionalData:enc.encode(id)},await aes(env),new Uint8Array(p.data))));}
const davAuth=s=>'Basic '+btoa(String.fromCharCode(...enc.encode(s.user+':'+s.token)));

function postcode(v){const p=text(v,20).toUpperCase().replace(/\s+/g,'');if(!/^[1-9][0-9]{3}[A-Z]{2}$/.test(p))fail(400,'Gebruik twee volledige Nederlandse postcodes.');return p;}
async function routeJSON(url,name,headers={}){
 const controller=new AbortController();const timeout=setTimeout(()=>controller.abort(),8000);
 let response;
 try{response=await fetch(String(url),{headers:{Accept:'application/json','User-Agent':'Urenregistratie-team-pilot/1.0 (mlemson.github.io/urenregistratie)',...headers},redirect:'error',signal:controller.signal});}
 catch(error){console.warn('Route upstream connection failed',name,error?.name||'Error');fail(502,name+' is niet bereikbaar. Probeer later opnieuw of vul kilometers handmatig in.');}
 finally{clearTimeout(timeout);}
 if(response.status===429)fail(429,name+' is tijdelijk overbelast. Probeer later opnieuw of vul kilometers handmatig in.');
 if(!response.ok)fail(502,name+' niet beschikbaar (HTTP '+response.status+'). Vul eventueel kilometers handmatig in.');
 try{return await response.json();}catch{fail(502,name+' geeft een ongeldig antwoord. Vul eventueel kilometers handmatig in.');}
}
async function geoPDOK(p){
 const url=new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
 url.searchParams.set('q',p);url.searchParams.set('fq','type:postcode');url.searchParams.set('rows','10');
 const j=await routeJSON(url,'Postcodeservice (PDOK)');
 const row=j?.response?.docs?.find(d=>String(d.postcode||d.weergavenaam||'').toUpperCase().replace(/\s+/g,'')===p);
 const m=String(row?.centroide_ll||'').match(/^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i);
 if(!m)fail(422,'Postcode '+p+' niet gevonden.');
 const [lng,lat]=m.slice(1).map(Number);
 if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90)fail(502,'Postcodeservice geeft ongeldige coördinaten.');
 return lng+','+lat;
}
async function geo(p){
 try{return {coord:await geoPDOK(p),source:'PDOK'};}
 catch(primary){
  // A definitive invalid format never triggers a fallback. The independent source
  // can resolve outages and postcode lookup misses, but must match all six characters.
  if(![422,429,502].includes(primary.status))throw primary;
  let rows;
  try{rows=await routeJSON('https://gratis-postcodedata.nl/api/postcode/'+p,'Reservepostcodeservice');}
  catch(secondary){if(primary.status===422&&secondary.status===502)throw primary;fail(502,'Postcodeservices tijdelijk niet bereikbaar. Vul de kilometers handmatig in.');}
  if(!Array.isArray(rows))fail(502,'Reservepostcodeservice geeft een ongeldig antwoord.');
  const exact=rows.filter(r=>r?.country==='nl'&&String(r.postcode||'').toUpperCase().replace(/\s+/g,'')===p&&typeof r.lat==='number'&&typeof r.lon==='number'&&Number.isFinite(r.lat)&&Number.isFinite(r.lon)&&r.lat>=50&&r.lat<=54&&r.lon>=3&&r.lon<=8);
  if(!exact.length){if(primary.status===422)throw primary;fail(422,'Postcode '+p+' niet gevonden bij de reservebron. Controleer de invoer.');}
  const lat=exact.reduce((s,r)=>s+r.lat,0)/exact.length,lon=exact.reduce((s,r)=>s+r.lon,0)/exact.length;
  return {coord:lon+','+lat,source:'Gratis Postcodedata'};
 }
}
async function routeDistance(b,env){
 const from=postcode(b.from),to=postcode(b.to);
 // Resolve both postcodes even if identical, so unknown postcodes never pass validation.
 const [first,last]=await Promise.all([geo(from),geo(to)]);const a=first.coord,z=last.coord,geocoders=[...new Set([first.source,last.source])].join(' + ');
 if(a===z)return {km:0,source:geocoders+' (postcodecentra)'};
 let meters,source;
 if(env.ORS_API_KEY){
  const url=new URL('https://api.openrouteservice.org/v2/directions/driving-car');
  url.searchParams.set('start',a);url.searchParams.set('end',z);
  const data=await routeJSON(url,'Routeplanner (OpenRouteService)',{Authorization:env.ORS_API_KEY});
  meters=data?.features?.[0]?.properties?.summary?.distance;source='OpenRouteService / OpenStreetMap (postcodecentra)';
 }else{
  // Use the direct car-routing endpoint rather than a demo hostname that can redirect.
  const data=await routeJSON('https://routing.openstreetmap.de/routed-car/route/v1/driving/'+a+';'+z+'?overview=false','Routeplanner (OSRM)');
  if(data?.code==='NoRoute'||data?.code==='NoSegment')fail(422,'Geen autoroute tussen deze postcodes gevonden.');
  meters=data?.routes?.[0]?.distance;source='OSRM / OpenStreetMap (postcodecentra)';
 }
 if(!Number.isFinite(meters)||meters<0)fail(422,'Geen geldige autoroute gevonden. Vul de kilometers handmatig in.');
 return {km:Math.round(meters/10)/100,source,geocoders};
}


// Additive, idempotent initialization for pilot databases created via the SQL console.
// No existing tables or records are replaced.
const optionalDDL=["CREATE TABLE IF NOT EXISTS company_modules(company_id TEXT PRIMARY KEY REFERENCES companies(id), clients INTEGER NOT NULL DEFAULT 0 CHECK(clients IN (0,1)), budgets INTEGER NOT NULL DEFAULT 0 CHECK(budgets IN (0,1)), warnings INTEGER NOT NULL DEFAULT 0 CHECK(warnings IN (0,1)))","CREATE TABLE IF NOT EXISTS member_preferences(member_id TEXT PRIMARY KEY REFERENCES members(id), stopwatch INTEGER NOT NULL DEFAULT 0 CHECK(stopwatch IN (0,1)), repeat_entry INTEGER NOT NULL DEFAULT 0 CHECK(repeat_entry IN (0,1)), dark INTEGER NOT NULL DEFAULT 0 CHECK(dark IN (0,1)))","CREATE TABLE IF NOT EXISTS clients(company_id TEXT NOT NULL REFERENCES companies(id), id TEXT NOT NULL, name TEXT NOT NULL, contact TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), PRIMARY KEY(company_id,id))","CREATE TABLE IF NOT EXISTS project_extras(company_id TEXT NOT NULL, project TEXT NOT NULL, client_id TEXT, budget_minutes INTEGER NOT NULL DEFAULT 0 CHECK(budget_minutes>=0), budget_cents INTEGER NOT NULL DEFAULT 0 CHECK(budget_cents>=0), PRIMARY KEY(company_id,project), FOREIGN KEY(company_id,project) REFERENCES projects(company_id,code), FOREIGN KEY(company_id,client_id) REFERENCES clients(company_id,id))","CREATE TABLE IF NOT EXISTS optional_schema_v1(id INTEGER PRIMARY KEY CHECK(id=1))"];
async function ensureModules(db){
 const ready=await one(db,"SELECT name FROM sqlite_master WHERE type='table' AND name='optional_schema_v1'");
 if(!ready||!await one(db,'SELECT id FROM optional_schema_v1 WHERE id=1'))await db.batch([...optionalDDL.map(q=>stmt(db,q)),stmt(db,'INSERT OR IGNORE INTO optional_schema_v1(id) VALUES(1)')]);
}
async function modulesFor(db,c){return await one(db,'SELECT clients,budgets,warnings FROM company_modules WHERE company_id=?',c)||{clients:0,budgets:0,warnings:0};}
async function prefsFor(db,u){return await one(db,'SELECT stopwatch,repeat_entry,dark FROM member_preferences WHERE member_id=?',u.id)||{stopwatch:0,repeat_entry:0,dark:0};}
function flag(b,k){if(typeof b[k]!=='boolean')fail(400,'Ongeldige instelling');return b[k]?1:0;}

async function handler(req,env){const db=env.DB,p=new URL(req.url).pathname,m=req.method;const ip=req.headers.get('CF-Connecting-IP')||'unknown';
 if(p==='/setup'&&m==='POST'){
  await limit(db,'setup:'+ip);const b=await body(req);if(!env.SETUP_KEY||env.SETUP_KEY.length<32||typeof b.key!=='string'||!same(await digest(b.key),await digest(env.SETUP_KEY)))fail(403,'Setup niet toegestaan');
  const id=uuid(),member=uuid(),code=slug(b.slug),name=text(b.company),mail=email(b.email),display=text(b.name),mode=b.mode==='team'?'team':'solo';const pw=await hashPassword(password(b.password));
  await db.batch([stmt(db,'INSERT INTO companies(id,slug,name,mode) VALUES(?,?,?,?)',id,code,name,mode),stmt(db,"INSERT INTO members(id,company_id,email,name,role,password) VALUES(?,?,?,?, 'owner',?)",member,id,mail,display,pw),...ACTIVITIES.map(a=>stmt(db,'INSERT INTO activities(company_id,name,kind) VALUES(?,?,?)',id,a,/Administratie|Scholing|Acquisitie/.test(a)?'INDIRECT':'DIRECT'))]);return issue(db,member);
 }
 if(p==='/login'&&m==='POST'){const b=await body(req),code=slug(b.slug),mail=email(b.email),pw=password(b.password);await limit(db,'login:'+ip);await limit(db,'account:'+await digest(code+':'+mail));const u=await one(db,'SELECT m.id,m.password FROM members m JOIN companies c ON c.id=m.company_id WHERE c.slug=? AND m.email=? AND m.active=1',code,mail);const hash=await hashPassword(pw,u?.password.split(':')[0]||'00000000000000000000000000000000');if(!u||!same(hash,u.password))fail(401,'Onjuiste inloggegevens');return issue(db,u.id);}
 if(p==='/join'&&m==='POST'){await limit(db,'join:'+ip);const b=await body(req),token=text(b.invite,64),key=await digest(token);const inv=await one(db,'SELECT * FROM invites WHERE token=? AND expires>?',key,Date.now());if(!inv)fail(400,'Uitnodiging ongeldig of verlopen');const id=uuid(),pw=await hashPassword(password(b.password));await db.batch([stmt(db,'INSERT INTO members(id,company_id,email,name,role,password) SELECT ?,company_id,email,?,role,? FROM invites WHERE token=? AND expires>?',id,text(b.name),pw,key,Date.now()),stmt(db,'DELETE FROM invites WHERE token=?',key)]);if(!await one(db,'SELECT id FROM members WHERE id=?',id))fail(400,'Uitnodiging al gebruikt');return issue(db,id);}
 const u=await session(db,req),c=u.company_id;
 if(['/data','/modules','/preferences','/clients','/projects','/export'].includes(p))await ensureModules(db);
 if(p==='/modules'&&m==='POST'){requireOwner(u);const b=await body(req),clients=flag(b,'clients'),budgets=flag(b,'budgets'),warnings=flag(b,'warnings');if(warnings&&!budgets)fail(400,'Schakel projectbudgetten eerst in.');await db.batch([stmt(db,'INSERT INTO company_modules(company_id,clients,budgets,warnings) VALUES(?,?,?,?) ON CONFLICT(company_id) DO UPDATE SET clients=excluded.clients,budgets=excluded.budgets,warnings=excluded.warnings',c,clients,budgets,warnings),audit(db,u,'modules.update',c)]);return {ok:true};}
 if(p==='/preferences'&&m==='POST'){const b=await body(req);await run(db,'INSERT INTO member_preferences(member_id,stopwatch,repeat_entry,dark) VALUES(?,?,?,?) ON CONFLICT(member_id) DO UPDATE SET stopwatch=excluded.stopwatch,repeat_entry=excluded.repeat_entry,dark=excluded.dark',u.id,flag(b,'stopwatch'),flag(b,'repeat_entry'),flag(b,'dark'));return {ok:true};}
 if(p==='/clients'&&m==='POST'){requireManager(u);if(!(await modulesFor(db,c)).clients)fail(403,'Klantenbeheer staat uit');const b=await body(req),id=b.id?text(b.id,80):uuid();if(b.id&&!await one(db,'SELECT id FROM clients WHERE company_id=? AND id=?',c,id))fail(404,'Klant niet gevonden');const mail=text(b.email??'',254,false);await db.batch([stmt(db,'INSERT INTO clients(company_id,id,name,contact,email,phone,active) VALUES(?,?,?,?,?,?,?) ON CONFLICT(company_id,id) DO UPDATE SET name=excluded.name,contact=excluded.contact,email=excluded.email,phone=excluded.phone,active=excluded.active',c,id,text(b.name),text(b.contact??'',200,false),mail?email(mail):'',text(b.phone??'',60,false),b.active===false?0:1),audit(db,u,'client.save',id)]);return {id};}

 if(p==='/logout'&&m==='POST'){await run(db,'DELETE FROM sessions WHERE token=?',await digest(req.headers.get('authorization').slice(7)));return {ok:true};}
 if(p==='/me'&&m==='GET'){const {company_id,...me}=u;if(!manager(u))delete me.rate;return me;}
 if(p==='/data'&&m==='GET'){const year=new URL(req.url).searchParams.get('year');if(!/^20\d\d$/.test(year||''))fail(400,'Ongeldig jaar');const entries=await all(db,`SELECT e.*,m.name AS member_name,ac.kind,COALESCE((SELECT SUM(a.minutes) FROM allocations a JOIN claims d ON d.id=a.claim_id WHERE a.entry_id=e.id AND d.status!='void'),0)+e.legacy_billed AS billed FROM entries e JOIN members m ON m.id=e.member_id JOIN activities ac ON ac.company_id=e.company_id AND ac.name=e.activity WHERE e.company_id=? AND e.date>=? AND e.date<? ${manager(u)?'':'AND e.member_id=?'} ORDER BY e.date,e.start,e.id`,c,year+'-01-01',(Number(year)+1)+'-01-01',...(manager(u)?[]:[u.id]));const projects=await all(db,`SELECT code,name,active${manager(u)?',rate':''} FROM projects WHERE company_id=? ORDER BY code`,c);const modules=await modulesFor(db,c),preferences=await prefsFor(db,u);
 const clients=manager(u)&&modules.clients?await all(db,'SELECT id,name,contact,email,phone,active FROM clients WHERE company_id=? ORDER BY name',c):[];
 if(manager(u)&&(modules.clients||modules.budgets)){
 const extras=await all(db,'SELECT x.*,COALESCE((SELECT SUM(e.minutes) FROM entries e WHERE e.company_id=x.company_id AND e.project=x.project),0) AS used_minutes FROM project_extras x WHERE x.company_id=?',c);
 for(const project of projects){const x=extras.find(v=>v.project===project.code);if(modules.clients)project.client_id=x?.client_id||'';if(modules.budgets){project.budget_minutes=x?.budget_minutes||0;project.budget_cents=x?.budget_cents||0;project.used_minutes=x?.used_minutes||0;project.used_cents=Math.round(project.used_minutes*(project.rate||u.rate||0)/60);project.estimate_available=(project.rate||u.rate||0)>0;}}
 }
 return {entries,projects,modules,preferences,clients,activities:await all(db,'SELECT name,kind FROM activities WHERE company_id=? ORDER BY rowid',c),members:manager(u)?await all(db,'SELECT id,name,email,role,active FROM members WHERE company_id=? ORDER BY name',c):[],claims:manager(u)?await all(db,'SELECT * FROM claims WHERE company_id=? AND date>=? AND date<? ORDER BY date DESC',c,year+'-01-01',(Number(year)+1)+'-01-01'):[]};}
 if(p==='/projects'&&m==='POST'){requireManager(u);const b=await body(req),code=text(b.code,40).toUpperCase(),modules=await modulesFor(db,c),old=await one(db,'SELECT * FROM project_extras WHERE company_id=? AND project=?',c,code);
 let client=old?.client_id||null,budgetMinutes=old?.budget_minutes||0,budgetCents=old?.budget_cents||0;
 if(b.client_id!==undefined){if(!modules.clients)fail(403,'Klantenbeheer staat uit');client=text(b.client_id,80,false)||null;if(client){const linked=await one(db,'SELECT active FROM clients WHERE company_id=? AND id=?',c,client);if(!linked||(!linked.active&&client!==old?.client_id))fail(400,'Klant niet beschikbaar');}}
 if(b.budget_minutes!==undefined||b.budget_cents!==undefined){if(!modules.budgets)fail(403,'Projectbudgetten staan uit');if(b.budget_minutes!==undefined)budgetMinutes=integer(b.budget_minutes,0,6000000);if(b.budget_cents!==undefined)budgetCents=integer(b.budget_cents,0,1000000000);}
 await db.batch([stmt(db,'INSERT INTO projects(company_id,code,name,active,rate) VALUES(?,?,?,?,?) ON CONFLICT(company_id,code) DO UPDATE SET name=excluded.name,active=excluded.active,rate=excluded.rate',c,code,text(b.name),b.active===false?0:1,integer(b.rate??0,0,10000000)),stmt(db,'INSERT INTO project_extras(company_id,project,client_id,budget_minutes,budget_cents) VALUES(?,?,?,?,?) ON CONFLICT(company_id,project) DO UPDATE SET client_id=excluded.client_id,budget_minutes=excluded.budget_minutes,budget_cents=excluded.budget_cents',c,code,client,budgetMinutes,budgetCents),audit(db,u,'project.save',code)]);return {ok:true};}
 if(p==='/activities'&&m==='POST'){requireOwner(u);const b=await body(req),name=text(b.name,100),kind=b.kind;if(!['DIRECT','INDIRECT'].includes(kind))fail(400,'Ongeldig type');await db.batch([stmt(db,'INSERT INTO activities(company_id,name,kind) VALUES(?,?,?) ON CONFLICT(company_id,name) DO UPDATE SET kind=excluded.kind',c,name,kind),audit(db,u,'activity.save',name)]);return {ok:true};}
 if(p==='/entries'&&m==='POST'){const b=await body(req),r=registration(b),id=text(b.id??uuid(),80),existing=await one(db,'SELECT * FROM entries WHERE company_id=? AND id=?',c,id);if(existing){if(existing.member_id!==u.id&&!manager(u))fail(403,'Geen toegang');if(existing.rev!==b.rev)fail(409,'Registratie is gewijzigd. Vernieuw.');const result=await db.batch([stmt(db,'UPDATE entries SET project=?,date=?,activity=?,note=?,start=?,end=?,minutes=?,km=?,from_pc=?,to_pc=?,return_trip=?,rev=rev+1 WHERE company_id=? AND id=? AND rev=?',...Object.values(r),c,id,b.rev),audit(db,u,'entry.update',id)]);if(!result[0].meta.changes)fail(409,'Registratie is gewijzigd');}else{if(b.rev!==undefined)fail(409,'Registratie bestaat niet meer');const target=b.member_id??u.id;if(target!==u.id&&!manager(u))fail(403,'Geen toegang');if(!await one(db,'SELECT id FROM members WHERE company_id=? AND id=? AND active=1',c,target))fail(400,'Medewerker niet actief');if(!await one(db,'SELECT code FROM projects WHERE company_id=? AND code=? AND active=1',c,r.project))fail(400,'Project niet actief');await db.batch([stmt(db,'INSERT INTO entries(id,company_id,member_id,project,date,activity,note,start,end,minutes,km,from_pc,to_pc,return_trip) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,c,target,...Object.values(r)),audit(db,u,'entry.create',id)]);}return {id};}
 if(p==='/entries/delete'&&m==='POST'){const b=await body(req),id=text(b.id,80),rev=integer(b.rev,1,2147483647);const result=await db.batch([stmt(db,`DELETE FROM entries WHERE company_id=? AND id=? AND rev=? ${manager(u)?'':'AND member_id=?'}`,c,id,rev,...(manager(u)?[]:[u.id])),audit(db,u,'entry.delete',id)]);if(!result[0].meta.changes)fail(409,'Niet gevonden of gewijzigd');return {ok:true};}
 if(p==='/invites'&&m==='POST'){requireOwner(u);const b=await body(req);const token=random(),role=b.role==='admin'?'admin':'member';await db.batch([stmt(db,'UPDATE companies SET mode=\'team\' WHERE id=?',c),stmt(db,'INSERT INTO invites(token,company_id,email,role,expires) VALUES(?,?,?,?,?)',await digest(token),c,email(b.email),role,Date.now()+48*3600000),audit(db,u,'member.invite',String(b.email))]);return {invite:token};}
 if(p==='/members/disable'&&m==='POST'){requireOwner(u);const b=await body(req),id=text(b.id,80);if(id===u.id)fail(400,'Eigenaar blijft actief');await db.batch([stmt(db,"UPDATE members SET active=0 WHERE company_id=? AND id=? AND role!='owner'",c,id),stmt(db,'DELETE FROM sessions WHERE member_id IN (SELECT id FROM members WHERE company_id=? AND id=? AND active=0)',c,id),audit(db,u,'member.disable',id)]);return {ok:true};}
 if(p==='/company'&&m==='POST'){requireOwner(u);const b=await body(req);const logo=text(b.logo??'',24000,false);if(logo&&!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(logo))fail(400,'Ongeldig logo');await db.batch([stmt(db,'UPDATE companies SET name=?,rate=?,logo=? WHERE id=?',text(b.name),integer(b.rate??0,0,10000000),logo,c),audit(db,u,'company.update',c)]);return {ok:true};}
 if(p==='/claims'&&m==='POST'){requireManager(u);const b=await body(req),id=uuid(),project=text(b.project,40),method=b.method; if(!['hours','fixed','percentage'].includes(method))fail(400,'Ongeldige methode');if(!Array.isArray(b.allocations)||b.allocations.length>80)fail(400,'Maximaal 80 regels per declaratie');const items=b.allocations.map(a=>({id:text(a.id,80),minutes:integer(a.minutes,1,1440)}));if(new Set(items.map(x=>x.id)).size!==items.length)fail(400,'Dubbele regels');if(method==='hours'&&!items.length)fail(400,'Selecteer uren');const amount=integer(b.amount,0,1000000000),base=integer(b.base??0,0,1000000000),percentage=b.percentage??0;if(typeof percentage!=='number'||!Number.isFinite(percentage)||percentage<0||percentage>100)fail(400,'Ongeldig percentage');if(amount===0)fail(400,'Vul een bedrag in');await db.batch([stmt(db,'INSERT INTO claims(id,company_id,project,date,method,amount,base,percentage,reference) VALUES(?,?,?,?,?,?,?,?,?)',id,c,project,date(b.date),method,amount,base,percentage,text(b.reference??'',200,false)),...items.map(a=>stmt(db,'INSERT INTO allocations(company_id,claim_id,entry_id,minutes) VALUES(?,?,?,?)',c,id,a.id,a.minutes)),audit(db,u,'claim.create',id)]);return {id};}
 if(p==='/claims/status'&&m==='POST'){requireManager(u);const b=await body(req);if(!['sent','void'].includes(b.status))fail(400,'Ongeldige status');const id=text(b.id,80);const result=await db.batch([stmt(db,"UPDATE claims SET status=? WHERE company_id=? AND id=? AND status='draft'",b.status,c,id),audit(db,u,'claim.'+b.status,id)]);if(!result[0].meta.changes)fail(409,'Declaratie niet meer wijzigbaar');return {ok:true};}
 if(p==='/route'&&m==='POST'){
 const b=await body(req);await limit(db,'route:'+u.id);
 return routeDistance(b,env);
 }
 if(p==='/storage'&&m==='POST'){requireOwner(u);const b=await body(req),storage={url:stackURL(text(b.url,500)),user:text(b.user,200),token:text(b.token,500)};const check=await fetch(storage.url,{method:'PROPFIND',headers:{Authorization:davAuth(storage),Depth:'0'},redirect:'error'});if(![200,207].includes(check.status))fail(502,'STACK-map niet bereikbaar');await run(db,'UPDATE companies SET storage=? WHERE id=?',await seal(env,c,storage),c);return {ok:true};}
 if(p==='/storage'&&m==='GET'){requireOwner(u);return {configured:!!(await one(db,'SELECT storage FROM companies WHERE id=?',c))?.storage};}
 if(p==='/backup'&&m==='POST'){requireOwner(u);const row=await one(db,'SELECT storage FROM companies WHERE id=?',c);if(!row?.storage)fail(400,'Stel eerst STACK in');if(Number(req.headers.get('content-length'))>12*1024*1024)fail(413,'Bestand te groot');const data=await req.arrayBuffer();const bytes=new Uint8Array(data);if(bytes.length>12*1024*1024||bytes[0]!==80||bytes[1]!==75||bytes[2]!==3||bytes[3]!==4)fail(400,'Ongeldig Excel-bestand');const s=await unseal(env,c,row.storage),name='Uren-backup-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+random(6)+'.xlsx';const result=await fetch(s.url+'/'+name,{method:'PUT',headers:{Authorization:davAuth(s),'If-None-Match':'*','Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'},body:data,redirect:'error'});if(!result.ok)fail(502,'STACK-back-up mislukt');return {name};}
 if(p==='/export'&&m==='GET'){requireManager(u);const queries={modules:'SELECT clients,budgets,warnings FROM company_modules WHERE company_id=?',clients:'SELECT id,name,contact,email,phone,active FROM clients WHERE company_id=?',project_extras:'SELECT project,client_id,budget_minutes,budget_cents FROM project_extras WHERE company_id=?',projects:'SELECT code,name,active,rate FROM projects WHERE company_id=?',activities:'SELECT name,kind FROM activities WHERE company_id=?',members:'SELECT id,name,email,role,active FROM members WHERE company_id=?',entries:'SELECT * FROM entries WHERE company_id=?',claims:'SELECT * FROM claims WHERE company_id=?',allocations:'SELECT * FROM allocations WHERE company_id=?',audit:'SELECT * FROM audit WHERE company_id=?'};const results=await db.batch(Object.values(queries).map(q=>stmt(db,q,c)));return {company:{name:u.company,slug:u.slug,mode:u.mode,rate:u.rate,logo:u.logo},...Object.fromEntries(Object.keys(queries).map((k,i)=>[k,results[i].results]))};}
 fail(404,'Niet gevonden');
}
export default {async fetch(req,env){const origin=req.headers.get('origin'),allowed=String(env.APP_ORIGIN||'').split(',').map(x=>x.trim());const h={'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Vary':'Origin','X-Content-Type-Options':'nosniff'};if(origin&&!allowed.includes(origin))return new Response(JSON.stringify({error:'Origin niet toegestaan'}),{status:403,headers:h});if(origin)Object.assign(h,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'});if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});try{if(!env.DB)fail(503,'D1 ontbreekt');return new Response(JSON.stringify(await handler(req,env)),{headers:h});}catch(e){const msg=String(e.message||'');const status=e.status||( /allocation exceeds|entry already billed|entry has billing history|UNIQUE constraint|FOREIGN KEY constraint/.test(msg)?409:500);return new Response(JSON.stringify({error:e.status?msg:status===409?'Gegevensconflict of reeds gedeclareerd.':'Serverfout'}),{status,headers:h});}}};
export {registration,stackURL,hashPassword,routeDistance};