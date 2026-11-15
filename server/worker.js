/**
 * Privé STACK WebDAV-koppeling voor LA urenregistratie.
 * De website op GitHub Pages bevat geen klantdata of STACK-credentials.
 * Alle opslagverzoeken vereisen een sterke, aparte APP_PASSWORD.
 */
const MAX_SIZE = 12 * 1024 * 1024;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function allowedOrigin(request, env) {
  const origin = request.headers.get('Origin') || '';
  const configured = String(env.APP_ORIGIN || '').replace(/\/$/, '');
  return origin && origin === configured ? origin : '';
}
function cors(request, env) {
  const origin = allowedOrigin(request, env);
  return origin ? {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  } : { 'Vary': 'Origin' };
}
function respond(status, text, headers={}) {
  return new Response(text, {status, headers: {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...headers
  }});
}
async function sameSecret(a,b) {
  const e=new TextEncoder();
  const [ha,hb]=await Promise.all([crypto.subtle.digest('SHA-256',e.encode(a)),crypto.subtle.digest('SHA-256',e.encode(b))]);
  const va=new Uint8Array(ha),vb=new Uint8Array(hb);
  let diff=0;for(let i=0;i<va.length;i++)diff|=va[i]^vb[i];
  return diff===0;
}
function folderURL(env) {
  const url = new URL(String(env.STACK_FOLDER_URL || ''));
  if(url.protocol!=='https:' || url.search || url.hash || url.username || url.password || !/^[a-z0-9-]+\.(?:stack\.storage|stackstorage\.com)$/.test(url.hostname)) {
    throw Error('STACK_FOLDER_URL is niet geldig');
  }
  const folderPath=url.pathname.replace(/\/+$/,'');
  if(!folderPath.startsWith('/remote.php/webdav/') || folderPath==='/remote.php/webdav') {
    throw Error('Gebruik een aparte map onder /remote.php/webdav/');
  }
  return url.origin+folderPath;
}

/**
 * STACK/WebDAV may return a bare ETag although If-Match requires a quoted
 * entity-tag under HTTP. Keep the unmodified value for comparisons with HEAD,
 * but forward a standards-compliant tag to the WebDAV PUT request.
 * Never accept wildcard, weak, multi-tag or control-character conditions.
 */
function uploadConditionEtag(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 512 ||
      /[\x00-\x20\x7f,]/.test(value) || value === '*' || value.startsWith('W/')) return null;
  if (/^"[\x21\x23-\x7e\x80-\xff]*"$/.test(value)) return value;
  if (/^[A-Za-z0-9._:-]+$/.test(value)) return '"'+value+'"';
  return null;
}

function fileURL(env, year) { return `${folderURL(env)}/LA-Uren-Km-${year}.xlsx`; }
function auth(env) { return 'Basic '+btoa(`${env.STACK_USER}:${env.STACK_TOKEN}`); }
async function dav(env,url,method,opts={}) {
  return fetch(url,{method,headers:{Authorization:auth(env),...(opts.headers||{})},body:opts.body,redirect:'manual'});
}
async function ensureFolder(env) {
  // MKCOL geeft 201 bij aanmaken en doorgaans 405 als de map al bestaat.
  const result=await dav(env,folderURL(env),'MKCOL');
  if(![201,405].includes(result.status))throw Error(`STACK-map niet beschikbaar (${result.status}). Maak de map LA-Uren aan op STACK.`);
}
async function geocode(postcode) {
  const q=String(postcode).trim();if(q.length<4||q.length>100)throw Error('Postcode/adres ongeldig');
  const code=q.toUpperCase().replace(/\s+/g,'');const exact=/^[1-9][0-9]{3}[A-Z]{2}$/.test(code);
  const url=new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
  url.searchParams.set('q',exact?code:q);url.searchParams.set('rows','10');
  if(exact)url.searchParams.set('fq','type:postcode');
  const r=await fetch(url,{headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Locatieserver niet beschikbaar');
  const j=await r.json(),docs=j?.response?.docs||[];
  const doc=exact?docs.find(d=>String(d.postcode||d.weergavenaam||'').toUpperCase().replace(/\s+/g,'').includes(code)):docs[0];
  const m=String(doc?.centroide_ll||'').match(/^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i);
  if(!m)throw Error('Geen passende postcode gevonden');
  return [Number(m[1]),Number(m[2])];
}
async function routedKm(a,b,env) {
  const start=a.join(','),end=b.join(',');
  if(env.ORS_API_KEY) {
    const u=`https://api.openrouteservice.org/v2/directions/driving-car?start=${start}&end=${end}`;
    const r=await fetch(u,{headers:{Authorization:env.ORS_API_KEY}});
    if(r.ok){const j=await r.json(),meters=j?.features?.[0]?.properties?.summary?.distance;
      if(meters>0)return {km:Math.round(meters/10)/100,source:'OpenRouteService (postcodecentra)'};
    }
  }
  const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=false`,{headers:{Accept:'application/json'}});
  if(!r.ok)throw Error('Routeplanner niet beschikbaar');
  const j=await r.json(),meters=j?.routes?.[0]?.distance;
  if(!(meters>0))throw Error('Autoroute niet gevonden');
  return {km:Math.round(meters/10)/100,source:'OSRM (postcodecentra, indicatief)'};
}

export default {
  async fetch(request,env) {
    const ch=cors(request,env), origin=request.headers.get('Origin')||'';
    if(request.method==='OPTIONS')return new Response(null,{status:204,headers:ch});
    if(origin&&!allowedOrigin(request,env))return respond(403,'Origin niet toegestaan',ch);
    if(!env.APP_PASSWORD||!env.STACK_USER||!env.STACK_TOKEN||!env.STACK_FOLDER_URL)return respond(503,'Serverconfiguratie ontbreekt',ch);
    const token=request.headers.get('Authorization')||'';
    if(!token.startsWith('Bearer ')||!(await sameSecret(token.slice(7),env.APP_PASSWORD)))return respond(401,'Toegang geweigerd',{'WWW-Authenticate':'Bearer',...ch});
    const {pathname,searchParams}=new URL(request.url);
    if(pathname==='/api/status'&&request.method==='GET') {
      try {
        const url=folderURL(env);
        const r=await dav(env,url,'PROPFIND',{headers:{Depth:'0'}});
        if(r.status===207||r.status===200)return new Response(JSON.stringify({ready:true,storage:'STACK',folder:'LA-Uren'}),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...ch}});
        if(r.status===404)return respond(404,'De map LA-Uren bestaat nog niet op STACK. Deze wordt bij de eerste opslag aangemaakt.',ch);
        return respond(502,`STACK-map niet bereikbaar (${r.status})`,ch);
      } catch(e) {return respond(502,'STACK-test mislukt: '+e.message,ch);}
    }
    if(pathname==='/api/route'&&request.method==='GET') {
      try {
        const from=searchParams.get('from')||'',to=searchParams.get('to')||'';
        if(from.length>100||to.length>100)return respond(400,'Adres te lang',ch);
        const [a,b]=await Promise.all([geocode(from),geocode(to)]);
        const out=await routedKm(a,b,env);
        return new Response(JSON.stringify(out),{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...ch}});
      }catch(e){return respond(422,'Automatisch berekenen niet mogelijk: '+e.message,ch);}
    }
    const match=pathname.match(/^\/api\/year\/(20\d\d)$/);
    if(!match||!['GET','PUT'].includes(request.method))return respond(404,'Niet gevonden',ch);
    let url;
    try{url=fileURL(env,match[1]);}catch(e){return respond(503,e.message,ch);}
    try {
      if(request.method==='GET') {
        const r=await dav(env,url,'GET');
        if(r.status===404)return respond(404,'Jaarbestand niet gevonden',ch);
        if(!r.ok)return respond(502,`STACK kon bestand niet lezen (${r.status})`,ch);
        const len=Number(r.headers.get('Content-Length'))||0;
        if(len>MAX_SIZE)return respond(413,'Bestand te groot',ch);
        const body=await r.arrayBuffer();
        if(body.byteLength>MAX_SIZE)return respond(413,'Bestand te groot',ch);
        let etag=r.headers.get('ETag')||'';
        if(!etag){const head=await dav(env,url,'HEAD');etag=head.headers.get('ETag')||'';}
        if(!etag||etag.startsWith('W/'))return respond(502,'STACK geeft geen bruikbare bestandsversie (ETag) terug',ch);
        return new Response(body,{headers:{'Content-Type':XLSX,'ETag':etag,'Cache-Control':'no-store',...ch}});
      }
      const ifMatch=request.headers.get('If-Match'), ifNone=request.headers.get('If-None-Match');
      if(!ifMatch&&ifNone!=='*')return respond(428,'Bestandsversie verplicht',ch);
      if(ifMatch&&ifNone)return respond(400,'Kies één versievoorwaarde',ch);
      const validIfMatch=ifMatch?uploadConditionEtag(ifMatch):null;
      if(ifMatch&&!validIfMatch)return respond(400,'Ongeldig ETag',ch);
      const len=Number(request.headers.get('Content-Length'))||0;
      if(len>MAX_SIZE)return respond(413,'Bestand te groot',ch);
      const body=await request.arrayBuffer();
      if(body.byteLength>MAX_SIZE)return respond(413,'Bestand te groot',ch);
      const magic=new Uint8Array(body.slice(0,4));
      if(!(magic[0]===80&&magic[1]===75&&magic[2]===3&&magic[3]===4))return respond(400,'Alleen XLSX toegestaan',ch);
      const before=await dav(env,url,'HEAD');
      if(ifNone==='*') {
        if(before.ok)return respond(412,'Bestand bestaat inmiddels',ch);
        if(before.status!==404)return respond(502,`STACK kon bestandsstatus niet bepalen (${before.status})`,ch);
        await ensureFolder(env);
      } else {
        if(before.status===404)return respond(409,'Bestand is verdwenen',ch);
        if(!before.ok)return respond(502,`STACK kon bestandsstatus niet bepalen (${before.status})`,ch);
        const current=before.headers.get('ETag');
        if(!current||current!==ifMatch)return respond(412,'Er staat een nieuwere versie op STACK',ch);
      }
      const conditions=ifMatch?{'If-Match':validIfMatch}:{'If-None-Match':'*'};
      const saved=await dav(env,url,'PUT',{body,headers:{'Content-Type':XLSX,...conditions}});
      if(saved.status===412||saved.status===409)return respond(412,'Bewerkingconflict: bestand is gewijzigd',ch);
      if(!saved.ok)return respond(502,`STACK kon niet opslaan (${saved.status})`,ch);
      const after=await dav(env,url,'HEAD');
      const etag=after.headers.get('ETag');
      if(!after.ok||!etag||etag.startsWith('W/'))return respond(502,'Opgeslagen, maar bestandsversie niet geverifieerd; verbind opnieuw',ch);
      return respond(200,'Opgeslagen',{'ETag':etag,...ch});
    } catch(e) {return respond(502,'Opslagfout: '+e.message,ch);}
  }
};