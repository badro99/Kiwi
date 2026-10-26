import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { suite } from './browser-trace.mjs';
import { LOCALES as testLocales } from './test-locales.mjs';
const locale=testLocales[0];

const root = process.env.KIWI_ROOT || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(path.join(root, 'app/package.json'));
let puppeteer;
try { puppeteer = req('puppeteer-core'); }
catch { console.log('○ skip: puppeteer-core unavailable'); process.exit(process.env.CI ? 1 : 0); }
const bin = process.env.KIWI_CHROMIUM_BIN || ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/chromium', '/usr/bin/google-chrome'].find(fs.existsSync);
if (!bin) { console.log('○ skip: Chromium unavailable'); process.exit(process.env.CI ? 1 : 0); }

/* Les feuilles que dashboard.html charge pour cette page, dans son ordre. */
const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
const sheets = [...html.matchAll(/<link rel="stylesheet" href="(assets\/[^"]+\.css)(?:\?v=\d+)?"/g)].map((m) => m[1])
  .filter((h) => /tokens|trade-workspaces|dashboard-shell|design-vexel\.css/.test(h));
if (!sheets.some((s) => s.includes('trade-workspaces'))) throw new Error('dashboard.html ne charge plus trade-workspaces.css');

const DAY = 864e5;
const NOW = Date.now();
const iso = (daysAgo) => new Date(NOW - daysAgo * DAY).toISOString();
/* L'ardoise telle que pos-epicerie.js l'écrit (CARNET : hist de dettes et de règlements). */
const CARNET = [
  { id:'advance',name:'TEST KIWI Avance',hist:[{id:'advance-pay',type:'pay',amt:20,at:iso(1)}]},
  { id: 'c-1', name: 'Fatima-Zahra Benkirane', phone: '0612345678', hist: [
    { id: 'h1', type: 'debt', amt: 12.5, at: iso(3) },
  ] },
  { id: 'c-2', name: 'Si Mohammed El Alaoui', phone: '0661000000', hist: [
    { id: 'h2', type: 'debt', amt: 200, at: iso(45) },   // réglée par le premier règlement
    { id: 'h3', type: 'debt', amt: 150, at: iso(40) },   // la plus ancienne encore ouverte
    { id: 'h4', type: 'pay', amt: 250, at: iso(10) },
    { id: 'h5', type: 'debt', amt: 80.75, at: iso(2) },
  ] },
  { id: 'c-3', name: 'Rachid Tazi', hist: [
    { id: 'h6', type: 'debt', amt: 60, at: iso(5) },
    { id: 'h7', type: 'pay', amt: 60, at: iso(1) },
  ] },
];

const page0 = (isReal) => `<!doctype html><html lang="${locale}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${sheets.map((s) => `<link rel="stylesheet" href="/${s}">`).join('\n')}
<style>html,body{margin:0}main{padding:24px;max-width:100%;box-sizing:border-box}</style>
<script>
  window.__lang = new URLSearchParams(location.search).get('lang') || '${locale}';
  window.KiwiI18n = { getLang: () => window.__lang };
  window.KiwiEnv = { isReal: () => ${isReal ? 'true' : 'false'} };
  window.KiwiVenue = { getCurrentVenueData: () => ({ id: 'epi-atlas', name: 'Épicerie Atlas', type: 'epicerie' }), getVenue: () => 'epi-atlas', subscribe: () => {} };
  const subs = [];
  window.__doc = { verticals: { epicerie: { data: { carnet: ${JSON.stringify(CARNET)} } } } };
  window.KiwiVerticalState = { store: { get: (id) => id === 'epi-atlas' ? window.__doc : null, subscribe: (fn) => subs.push(fn) } };
  window.__tillWrites = (doc) => { window.__doc = doc; subs.forEach((fn) => fn()); };
  window.Kiwi = { handlers: {}, appPage: (nav, o) => {
    const el = document.querySelector('main'); el.innerHTML = '<h1>' + o.title + '</h1><p class="sub">' + o.subtitle + '</p>' + o.body;
    return { el }; } };
  
</script>
<script>
window.KiwiIdentity={state:{authenticated:true,stores:[{merchant:'epi-atlas'}]}};
window.KiwiCloudDoc={currentSlug:()=> 'epi-atlas',pullAll:async()=>{
  const response=await fetch('/api/store');window.__tillWrites(await response.json());
}};
window.Kiwi.modal=(options)=>{
 const el=document.createElement('section');el.setAttribute('role','dialog');el.innerHTML=options.body;document.body.append(el);
 return {el,close:()=>el.remove()};
};
document.addEventListener('click',e=>{
 if(e.target.closest('[data-tw-refund]'))return;
});
</script><script src="/assets/trade-workspaces.js"></script></head><body><main></main></body></html>`;

const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png' };
let book=JSON.parse(JSON.stringify(CARNET));let writes=0, failSave=false, serverCap=false;
const server = http.createServer((rq, res) => {
  if(rq.url==='/api/store'){
    res.setHeader('Content-Type','application/json');
    if(rq.method==='GET'){res.end(JSON.stringify({verticals:{epicerie:{data:{carnet:book}}}}));return;}
    let body='';rq.on('data',chunk=>body+=chunk);rq.on('end',()=>{
      const request=JSON.parse(body),c=book.find(c=>c.id===request.clientId);
      if(failSave){failSave=false;res.statusCode=503;res.end(JSON.stringify({error:'storage-unavailable'}));return;}
      if(serverCap){serverCap=false;res.statusCode=409;res.end(JSON.stringify({error:'refund-exceeds-advance',availableCents:500}));return;}
      const available=-(c.hist||[]).reduce((n,h)=>n+(h.type==='debt'?1:-1)*Math.round(h.amt*100),0);
      if(request.amountCents>available){res.statusCode=409;res.end(JSON.stringify({error:'refund-exceeds-advance',availableCents:available}));return;}
      writes++;c.hist.push({id:request.id,kind:'advance-refund',type:'debt',amt:request.amountCents/100,at:new Date().toISOString(),method:'transfer'});
      res.end(JSON.stringify({ok:true}));
    });return;
  }
  if(rq.url==='/assets/trade-workspaces.js'&&process.env.KIWI_REFUND_SOURCE){res.end(fs.readFileSync(process.env.KIWI_REFUND_SOURCE));return;}
  const pathname = decodeURIComponent(new URL(rq.url, 'http://local').pathname);
  if (pathname === '/real' || pathname === '/demo') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(page0(pathname === '/real')); return; }
  const p = path.resolve(root, '.' + pathname);
  if (!p.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
  fs.readFile(p, (err, data) => { res.writeHead(err ? 404 : 200, { 'Content-Type': mime[path.extname(p)] || 'application/octet-stream' }); res.end(err ? '' : data); });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await puppeteer.launch({ executablePath: bin, headless: true, args: ['--no-sandbox', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] });
const S = suite('credit-book-refund', { browser });
const check = (ok, msg) => { if (!ok) throw new Error(msg); console.log('  ✓ ' + msg); };
const norm = (s) => String(s || '').replace(/[  ]/g, ' ').replace(/\s+/g, ' ').trim();

async function open(t, { kind = 'real', lang = locale, width = 1280 } = {}) {
  const ctx = await browser.createBrowserContext();
  t.defer(() => ctx.close());
  const page = t.watch(await ctx.newPage());
  await page.setViewport({ width, height: 900 });
  await page.goto(`${base}/${kind}?lang=${lang}`, { waitUntil: 'load' });
  await page.waitForFunction(() => !!window.KiwiTradeWorkspaces);
  const ok = await page.evaluate(() => window.KiwiTradeWorkspaces.render('credit'));
  check(ok === true, 'la page Carnet de crédit se rend pour une épicerie');
  return page;
}

await S.run('avance plafonnée, remboursement distinct et actualisation',async(t)=>{
 const page=await open(t);
 await page.waitForSelector('[data-tw-refund="advance"]',{timeout:3000});
 await page.click('[data-tw-refund="advance"]');
 check(await page.$eval('[data-refund-available]',el=>el.textContent.includes('20 MAD')),'avance remboursable visible');
 await page.$eval('#tw-refund-amount',el=>el.value='20.01');
 await page.click('[role=dialog] [type=submit]');
 await page.waitForFunction(()=>document.querySelector('[data-refund-error]').textContent.includes('dépasse'));
 check(writes===0,'au-dessus du solde : refus sans paiement');
 await page.$eval('#tw-refund-amount',el=>el.value='7.5');
 await page.click('[role=dialog] [type=submit]');
 await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
 check(writes===1,'une seule opération serveur');
 await page.click('[data-tw-refund="advance"]');
 check(await page.$eval('[data-refund-available]',el=>/12[,.]50/.test(el.textContent)),'le reste remboursable vient du journal actualisé');
 check(await page.$eval('.tw-till',el=>el.textContent.includes('Remboursements enregistrés')&&/7[,.]50/.test(el.textContent)),'le remboursement a sa propre entrée affichée');
});
// coverage: surface=credit-book locale=fr viewport=phone
// coverage: surface=credit-book locale=fr viewport=tablet
for (const width of [390, 820]) await S.run(`FR · ${width} px · avance, refus serveur et reprise`, async t => {
 book=JSON.parse(JSON.stringify(CARNET));writes=0;
 const page=await open(t,{width,lang:'fr'});
 const click=async selector=>{await page.waitForSelector(selector,{visible:true});await page.click(selector);};
 const amount=async value=>{await page.click('#tw-refund-amount',{clickCount:3});await page.keyboard.type(value);};
 check(await page.$eval('.tw-till',el=>el.textContent.includes('Avance')),'avance distincte de la dette');
 check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'carnet sans débordement de la page');
 await click('[data-tw-refund="advance"]');
 await amount('7.5');serverCap=true;
 await click('[role=dialog] [type=submit]');
 await page.waitForFunction(()=>document.querySelector('[data-refund-error]').textContent.includes('dépasse'));
 check(writes===0,'sur-remboursement refusé par le serveur, aucun débit');
 check(await page.$eval('#tw-refund-amount',el=>el.value==='7.5'&&!el.disabled),'montant conservé et modifiable après conflit');
 await amount('5');failSave=true;
 await click('[role=dialog] [type=submit]');
 await page.waitForFunction(()=>document.querySelector('[data-refund-error]').textContent.length>0&&!document.querySelector('[role=dialog] [type=submit]').disabled);
 check(await page.$eval('#tw-refund-amount',el=>el.value==='5'),'échec réseau : saisie conservée');
 check(writes===0,'échec sans modification du journal');
 check(await page.$eval('[data-tw-refund-form]',el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+1&&el.scrollWidth<=el.clientWidth+1;}),'formulaire contenu dans la largeur disponible');
 await click('[role=dialog] [type=submit]');
 await page.waitForFunction(()=>!document.querySelector('[role=dialog]'));
 check(writes===1,'réessai : une seule écriture confirmée');
 await click('[data-tw-refund="advance"]');
 check(await page.$eval('[data-refund-available]',el=>el.textContent.includes('15 MAD')),'solde serveur relu après remboursement');
});
await browser.close();server.close();S.finish();
