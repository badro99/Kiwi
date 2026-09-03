#!/usr/bin/env node
import fs from 'node:fs';import assert from 'node:assert/strict';import vm from 'node:vm';
const ops=fs.readFileSync(new URL('../assets/platform-ops.js',import.meta.url),'utf8');
const scan=fs.readFileSync(new URL('../assets/retail-scan.js',import.meta.url),'utf8');
const publish=fs.readFileSync(new URL('../assets/orderpro-publish.js',import.meta.url),'utf8');
const sw=fs.readFileSync(new URL('../kiwi-sw.js',import.meta.url),'utf8');
const pages=['dashboard.html','kiwi-caisse.html','kiwi-serveur.html'].map(x=>fs.readFileSync(new URL('../'+x,import.meta.url),'utf8'));
const bootstraps=['assets/dashboard-pwa.js','assets/caisse-pwa.js','assets/employee-live.js'].map(x=>fs.readFileSync(new URL('../'+x,import.meta.url),'utf8'));
let n=0;const ok=(c,m)=>{assert.ok(c,m);n++;console.log('  ✓ '+m);};
['products','uploads','routes','collaboration','analytics'].forEach(name=>ok(ops.includes(`K.register('${name}'`),`${name} adapter is registered`));
ok(/world\.openfoodfacts\.org\/api\/v2\/product/.test(ops),'product enrichment uses the official v2 product endpoint');
ok(/router\.project-osrm\.org/.test(ops)&&/\/route\/v1\/driving\//.test(ops),'routing uses OSRM and never invents a route');
ok(/navigator\.onLine===false\)\{fail\('offline'\)/.test(ops),'uploads refuse false offline success');
const mediaSource=fs.readFileSync(new URL('../functions/api/media/index.js',import.meta.url),'utf8');
ok(/opts\.merchant.*merchant=/.test(ops)&&/ownerMerchant\(request, env, asked, \{ strict: true \}\)/.test(mediaSource),'multi-store uploads are filed under the authenticated selected store, never by a paired till alone');
/* Execute the shipped publisher, not a copy. The regression captured on iPad
 * was precisely that the resilient adapter supported opts.merchant while its
 * caller never supplied it, so a valid owner session received 401 forever. */
{
  let uploadCall=null;
  const window={
    KiwiVenue:{isCustom:()=>true,getCurrentVenueData:()=>({name:'Maison 121',slug:'maison-121-pinned',id:'v1',type:'boutique'})},
    KiwiEnv:{isReal:()=>true},KiwiConfig:{type:'boutique'},
    KiwiPlatformOps:{uploads:{upload:async(file,opts)=>{uploadCall={file,opts};return{ok:true,url:'/api/media/test.jpg'};}}},
  };
  const context=Object.assign(window,{window,localStorage:{getItem:()=>null},document:{readyState:'loading',addEventListener:()=>{}},fetch:()=>{throw new Error('fallback should not run');},setTimeout:()=>0,clearTimeout:()=>{},console,Promise,encodeURIComponent});
  vm.runInNewContext(publish,context,{filename:'assets/orderpro-publish.js'});
  const file={name:'look.jpg',type:'image/jpeg',size:1024};
  const result=await window.KiwiOrderPro.uploadMedia(file);
  ok(result.ok===true&&uploadCall&&uploadCall.file===file&&uploadCall.opts&&uploadCall.opts.merchant==='maison-121-pinned','catalog upload sends the pinned selected merchant to the owner-only media route');
  let fallbackUrl='';
  window.KiwiPlatformOps=null;
  context.fetch=async(url)=>{fallbackUrl=String(url);return{ok:true,json:async()=>({ok:true,url:'/api/media/test-fallback.jpg'})};};
  const fallback=await window.KiwiOrderPro.uploadMedia(file);
  ok(fallback.ok===true&&fallbackUrl.includes('merchant=maison-121-pinned'),'fallback upload sends the same pinned merchant when the resilient adapter is unavailable');
}
/* Le refus doit arriver à l'écran avec SA raison. Les codes du téléverseur
 * local et ceux du serveur (functions/api/media/index.js) doivent être le MÊME
 * vocabulaire, et chacun doit avoir sa phrase dans KiwiOrderPro.uploadError :
 * un `unsupported-type` local face à un `bad-type` distant, et le commerçant
 * reçoit « envoi impossible, réessayez » pour une vidéo trop lourde. On teste
 * l'ACCORD entre les trois, pas la présence d'une chaîne. */
const refusals=[...ops.matchAll(/fail\('([a-z-]+)'/g)].map(m=>m[1]);
['empty','bad-type','too-large','offline'].forEach(c=>ok(refusals.includes(c),`upload refusal '${c}' uses the server vocabulary`));
[...new Set(refusals)].forEach(c=>ok(new RegExp("code === '"+c+"'").test(publish),`refusal '${c}' has its own sentence in uploadError`));
ok(/uploadError:\s*uploadError/.test(publish),'uploadError is exported for every media surface');
[['too-large',/Le maximum est/],['bad-type',/Formats accept/]].forEach(([c,re])=>ok(re.test(publish),`'${c}' message states the limit, not just the failure`));
ok(/KIWI_OSRM_ENDPOINT/.test(ops),'routing endpoint is configurable for production hosting');
ok(/enrichUnknown\(code\)/.test(scan)&&/KiwiPlatformOps/.test(scan),'unknown scans request product truth');
ok(/KiwiPlatformOps\s*&&\s*window\.KiwiPlatformOps\.uploads/.test(publish),'catalog media uses the resilient upload adapter');
/* Les plafonds vivent en trois copies (serveur, pré-contrôle local, message
 * affiché) : on teste leur ACCORD, pas un chiffre. Et la photo est rétrécie
 * dans le navigateur AVANT l'envoi — c'est ce qui rend le plafond invisible. */
const mediaApi=mediaSource;
const capS=(re,src)=>{const m=src.match(re);return m?Number(m[1])*1024*1024:NaN;};
const srvImg=capS(/const MAX_IMAGE = (\d+) \* 1024 \* 1024/,mediaApi), srvVid=capS(/const MAX_VIDEO = (\d+) \* 1024 \* 1024/,mediaApi);
const pubImg=capS(/var MAX_PHOTO = (\d+) \* 1024 \* 1024/,publish), pubVid=capS(/var MAX_VIDEO = (\d+) \* 1024 \* 1024/,publish);
const opsM=ops.match(/limit=isVideo\?(\d+)\*1024\*1024:(\d+)\*1024\*1024/);
ok(srvImg>0&&srvImg===pubImg&&opsM&&Number(opsM[2])*1024*1024===srvImg,'photo cap agrees across server, local pre-check and displayed message');
ok(srvVid>0&&srvVid===pubVid&&opsM&&Number(opsM[1])*1024*1024===srvVid,'video cap agrees across server, local pre-check and displayed message');
ok(srvImg>=16*1024*1024,'photo cap covers a raw 50 Mpx phone JPEG when shrinking is impossible');
ok(/function shrinkPhoto\(file\)/.test(publish)&&/return shrinkPhoto\(file\)\.then\(function \(ready\) \{ return sendMedia\(ready \|\| file\); \}\);/.test(publish),'every photo is shrunk in the browser before any upload path');
ok(/imageOrientation: 'from-image'/.test(publish),'shrinking honours EXIF orientation (a portrait photo stays portrait)');
ok(/\.catch\(function \(\) \{ return file; \}\);/.test(publish),'an undecodable file is sent as-is so the server names the real reason');
/* Un plancher, pas une épingle. Épingler le numéro exact fait échouer le
 * prochain correctif légitime pour la seule raison qu'il a fait son travail —
 * bumper le cache. On garde la garantie qui compte : le cache existe et ne
 * redescend jamais sous la version livrée quand ce contrôle a été écrit. */
const swCache=+(sw.match(/kiwi-app-v(\d+)/)||[])[1];
ok(Number.isFinite(swCache)&&swCache>=373,`service worker cache was advanced (kiwi-app-v${swCache} ≥ v373)`);
ok(/dashboard-pwa\.js\?v=\d+/.test(pages[0])&&/caisse-pwa\.js\?v=\d+/.test(pages[1])&&/employee-live\.js\?v=\d+/.test(pages[2]),'all shells request a versioned service-worker bootstrap');
bootstraps.forEach((bootstrap,i)=>ok(bootstrap.includes(`/kiwi-sw.js?v=${swCache}`),`service-worker bootstrap ${i+1} requests the active cache generation`));
/* Même doctrine que le cache ci-dessus : on vérifie que l'asset est câblé, pas
 * sur quelle génération il se trouve — un `?v=` figé casse au premier correctif. */
const wired=(source,file)=>new RegExp(`${file.replace('.','\\.')}\\?v=\\d+`).test(source);
['platform-kernel.js','platform-ops.js','platform-ops.css','operations.js'].forEach(asset=>ok(wired(sw,asset),`${asset} is available offline`));
pages.forEach((page,i)=>ok(['platform-kernel.js','platform-ops.js','operations.js'].every(a=>wired(page,a)),`operational shell ${i+1} loads the platform adapters`));
console.log(`\n✓ Platform adapters — ${n} controls`);
