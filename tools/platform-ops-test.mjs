#!/usr/bin/env node
import fs from 'node:fs';import assert from 'node:assert/strict';
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
