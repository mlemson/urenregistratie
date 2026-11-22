import {mkdir,copyFile,writeFile,readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(here,'public');
const version=Date.now().toString(36);

await mkdir(path.join(out,'team'),{recursive:true});
for(const file of ['style.css','agenda.css','agenda.js','agenda-drag.js']){
 await copyFile(path.join(here,'../..',file),path.join(out,file));
}
for(const file of ['index.html','team.css','team.js']){
 await copyFile(path.join(here,'..',file),path.join(out,'team',file));
}

// Give each published bundle unique asset URLs so Safari on iPad
// does not reuse CSS/JS from a prior deployment.
const page=path.join(out,'team','index.html');
let html=await readFile(page,'utf8');
for(const url of ['../style.css','../agenda.css','team.css','../agenda.js','../agenda-drag.js','team.js']){
 const match=url.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 html=html.replace(new RegExp('(["\\\'])'+match+'\\1','g'),(all,quote)=>quote+url+'?v='+version+quote);
}
html=html.replace('<head>','<head><meta name="application-build" content="'+version+'">');
await writeFile(page,html);
await writeFile(path.join(out,'index.html'),'<!doctype html><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=/team/"><a href="/team/">Open de testomgeving</a>');
console.log('Pilot frontend built; version '+version);
