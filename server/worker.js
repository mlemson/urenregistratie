/**
 * LA STACK-adapter voor Cloudflare Workers.
 * Geheime STACK-gegevens worden uitsluitend als Worker secrets bewaard.
 * De statische GitHub Pages-website bevat NOOIT klanten of Excel-data.
 */
const MAX_SIZE = 12 * 1024 * 1024;
const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
function access(origin, env) {
  const allowed = (env.APP_ORIGIN || '').replace(/\/$/, '');
  return allowed && origin === allowed ? origin : '';
}
function cors(request, env) {
  const matched = access(request.headers.get('Origin') || '', env);
  return matched ? {
    'Access-Control-Allow-Origin': matched,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, If-Match, If-None-Match',
    'Access-Control-Expose-Headers': 'ETag',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin'
  } : {'Vary':'Origin'};
}
function response(status,text,headers={}) {return new Response(text,{status,headers:{'Content-Type':'text/plain; charset=utf-8',...headers}});}
async function sameSecret(a,b) {
  const encoder=new TextEncoder();const [x,y]=await Promise.all([crypto.subtle.digest('SHA-256',encoder.encode(a)),crypto.subtle.digest('SHA-256',encoder.encode(b))]);
  const va=new Uint8Array(x),vb=new Uint8Array(y);let diff=0;for(let i=0;i<va.length;i++)diff|=va[i]^vb[i];return diff===0;
}
function fileURL(env,year){let u=String(env.STACK_FOLDER_URL||'').replace(/\/$/,'');if(!u.startsWith('https://'))throw Error('STACK_FOLDER_URL moet HTTPS zijn');return `${u}/LA-Uren-Km-${year}.xlsx`;}
function webdavAuth(env){return 'Basic '+btoa(`${env.STACK_USER||''}:${env.STACK_TOKEN||''}`);}
async function webdav(env,url,method,options={}){let headers={Authorization:webdavAuth(env),...(options.headers||{})};return fetch(url,{method,headers,body:options.body,redirect:'manual'});}
async function geocode(postcode){
  const q=postcode.trim();if(q.length<4||q.length>100)throw new Error('Postcode/adres ongeldig');
  let u=new URL('https://api.pdok.nl/bzk/locatieserver/search/v3_1/free');
  u.searchParams.set('q',q);u.searchParams.set('rows','1');
  const r=await fetch(u,{headers:{Accept:'application/json'}});if(!r.ok)throw new Error('Locatieserver niet beschikbaar');
  const json=await r.json();const d=json?.response?.docs?.[0];
  const wkt=d?.centroide_ll;const m=String(wkt||'').match(/^POINT\s*\(([-\d.]+)\s+([-\d.]+)\)$/i);
  if(!m)throw new Error('Geen locatie gevonden');return [Number(m[1]),Number(m[2])];
}
async function routedKm(a,b,env){
  const start=a.join(','),end=b.join(',');
  if(env.ORS_API_KEY){
    const u=`https://api.openrouteservice.org/v2/directions/driving-car?start=${start}&end=${end}`;
    let r=await fetch(u,{headers:{Authorization:env.ORS_API_KEY}});
    if(r.ok){const json=await r.json();const meters=json?.features?.[0]?.properties?.summary?.distance;if(meters>0)return {km:Math.round(meters/10)/100,source:'OpenRouteService (postcodecentra)'};}
  }
  const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${start};${end}?overview=false`,{headers:{Accept:'application/json'}});
  if(!r.ok)throw new Error('Routeplanner niet beschikbaar');const json=await r.json();const m=json?.routes?.[0]?.distance;
  if(!(m>0))throw new Error('Autoroute niet gevonden');return {km:Math.round(m/10)/100,source:'OSRM (postcodecentra, indicatief)'};
}
export default {
 async fetch(request,env) {
  const corsHeaders=cors(request,env);const origin=request.headers.get('Origin');
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:corsHeaders});
  if(origin&&!access(origin,env))return response(403,'Origin niet toegestaan',corsHeaders);
  if(!env.APP_PASSWORD||!env.STACK_USER||!env.STACK_TOKEN||!env.STACK_FOLDER_URL)return response(503,'Serverconfiguratie ontbreekt',corsHeaders);
  const auth=request.headers.get('Authorization')||'';
  if(!auth.startsWith('Bearer ')||!(await sameSecret(auth.slice(7),env.APP_PASSWORD)))return response(401,'Toegang geweigerd',{'WWW-Authenticate':'Bearer',...corsHeaders});
  const {pathname,searchParams}=new URL(request.url);
  if(pathname==='/api/route'&&request.method==='GET'){
    try{
      const from=searchParams.get('from')||'',to=searchParams.get('to')||'';
      if(from.length>100||to.length>100)return response(400,'Adres te lang',corsHeaders);
      let [a,b]=await Promise.all([geocode(from),geocode(to)]);let out=await routedKm(a,b,env);
      return new Response(JSON.stringify(out),{status:200,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...corsHeaders}});
    }catch(e){return response(422,'Automatisch berekenen niet mogelijk: '+e.message,corsHeaders);}
  }
  const match=pathname.match(/^\/api\/year\/(20\d\d)$/);
  if(!match||!['GET','PUT'].includes(request.method))return response(404,'Niet gevonden',corsHeaders);
  const url=fileURL(env,match[1]);
  try{
    if(request.method==='GET'){
      const r=await webdav(env,url,'GET');
      if(r.status===404)return response(404,'Jaarbestand niet gevonden',corsHeaders);
      if(!r.ok)return response(502,'STACK kon bestand niet lezen ('+r.status+')',corsHeaders);
      const len=Number(r.headers.get('Content-Length'))||0;
      if(len>MAX_SIZE)return response(413,'Bestand te groot',corsHeaders);
      const body=await r.arrayBuffer();if(body.byteLength>MAX_SIZE)return response(413,'Bestand te groot',corsHeaders);
      let etag=r.headers.get('ETag')||'';
      if(!etag){const head=await webdav(env,url,'HEAD');etag=head.headers.get('ETag')||'';}
      if(!etag)return response(502,'STACK geeft geen ETag terug; veilig bewerken is niet mogelijk',corsHeaders);
      return new Response(body,{status:200,headers:{'Content-Type':XLSX,'ETag':etag,'Cache-Control':'no-store',...corsHeaders}});
    }
    const matcher=request.headers.get('If-Match');const none=request.headers.get('If-None-Match');
    if(!matcher&&none!=='*')return response(428,'Bestandsversie verplicht',corsHeaders);
    if(matcher&&none)return response(400,'Kies één versievoorwaarde',corsHeaders);
    const len=Number(request.headers.get('Content-Length'))||0;
    if(len>MAX_SIZE)return response(413,'Bestand te groot',corsHeaders);
    const body=await request.arrayBuffer();if(body.byteLength>MAX_SIZE)return response(413,'Bestand te groot',corsHeaders);
    const magic=new Uint8Array(body.slice(0,4));if(!(magic[0]===80&&magic[1]===75))return response(400,'Alleen XLSX toegestaan',corsHeaders);
    const pre=await webdav(env,url,'HEAD');
    if(none==='*'&&pre.ok)return response(412,'Bestand bestaat inmiddels',corsHeaders);
    if(matcher){
      if(!pre.ok)return response(409,'Bestand gewijzigd of verdwenen',corsHeaders);
      const before=pre.headers.get('ETag');if(!before||before!==matcher)return response(412,'Er staat een nieuwere versie op STACK',corsHeaders);
    }
    const conditions=matcher?{'If-Match':matcher}:{'If-None-Match':'*'};
    const written=await webdav(env,url,'PUT',{body,headers:{'Content-Type':XLSX,...conditions}});
    if(written.status===412||written.status===409)return response(412,'Bewerkingconflict: bestand is gewijzigd',corsHeaders);
    if(!written.ok)return response(502,'STACK kon niet opslaan ('+written.status+'). Controleer of de doelmap bestaat.',corsHeaders);
    const after=await webdav(env,url,'HEAD');const etag=after.headers.get('ETag');
    if(!after.ok||!etag)return response(502,'Opgeslagen, maar bestandsversie niet gecontroleerd. Maak eerst opnieuw verbinding.',corsHeaders);
    return new Response('Opgeslagen',{status:200,headers:{'ETag':etag,'Cache-Control':'no-store',...corsHeaders}});
  }catch(e){return response(502,'Opslagfout: '+e.message,corsHeaders);}
 }
};