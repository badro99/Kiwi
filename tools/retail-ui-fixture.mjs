#!/usr/bin/env node
/* Isolated rendered fixtures for retail ticket evidence. They load the real
 * Maison caisse and dashboard client-directory assets against synthetic Amira
 * data. No production endpoint, credential, customer or stock record is used. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const stamps = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/asset-stamps.json'), 'utf8'));
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

function maisonPage() {
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi Caisse · Amira (preuve synthétique)</title>
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/caisse-skin.css"><link rel="stylesheet" href="/assets/caisse-dna.css"><link rel="stylesheet" href="/assets/pos-maison.css?v=${stamps['assets/pos-maison.css'].v}"><link rel="stylesheet" href="/assets/retail-balances.css"><link rel="stylesheet" href="/assets/retail-scan.css">
    <style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0);font-family:Arial,sans-serif}button,input{font:inherit}button{border:0}.vx-screen{display:flex}
      .modal-veil{position:fixed;inset:0;background:rgba(4,14,10,.62);backdrop-filter:blur(16px) saturate(1.2);display:none;align-items:center;justify-content:center;z-index:100;padding:12px}.modal-veil.is-open{display:flex}
      .modal{width:480px;max-width:calc(100vw - 48px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;background:var(--surface,#fff);border:1px solid rgba(0,0,0,.08);border-radius:24px;box-shadow:0 24px 64px -12px rgba(0,0,0,.28);padding:28px 28px 24px}
    </style>
    <script>localStorage.setItem('kiwiLiveMerchant','synthetic-retail-acompte');window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiConfig={features:{caisseInventoryAdmin:true,depotvente:true,caisseInventoryValue:false}};window.KiwiPosDispatch={register:s=>window.__maisonSpec=s,lock:()=>{}};</script>
    <script src="/assets/caisse-dna.js"></script><script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
    <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
    <script src="/assets/venue-store.js"></script><script src="/assets/discount-policy.js"></script><script src="/assets/retail-balances.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
    <script src="/assets/boutique-catalog.js"></script><script src="/assets/sold-insights.js"></script><script src="/assets/pos-maison.js?v=${stamps['assets/pos-maison.js'].v}"></script>
  </head><body class="is-pos-maison"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-maison"></div>
    <script>window.__maisonSpec.mount(document.getElementById('pos-maison'));window.KiwiCaisseDna.enhance(document.getElementById('pos-maison'),'maison');</script>
  </body></html>`;
}

function boutiquePage() {
  return maisonPage()
    .replaceAll('pos-maison', 'pos-boutique')
    .replaceAll('__maisonSpec', '__boutiqueSpec')
    .replaceAll("'maison'", "'boutique'")
    .replaceAll('Maison caisse', 'Boutique caisse');
}

function stockProofPage(kind) {
  // Initialise the normal seeded till first, then make only its stock journal
  // behave like a paired register. This is loopback-only and creates no sale
  // on a merchant account, but exercises the production stock/movement path.
  const page = kind === 'maison' ? maisonPage() : boutiquePage();
  return page.replace('window.KiwiEnv={isReal:()=>false,demosAllowed:true}',
    `window.__fixtureLiveStock=false;window.KiwiEnv={isReal:()=>window.__fixtureLiveStock,demosAllowed:true};window.KiwiLive={merchant:()=>"fixture-${kind}-stock",isOn:()=>false}`)
    .replace(`window.KiwiCaisseDna.enhance(document.getElementById('pos-${kind}'),'${kind}');`,
      `window.KiwiCaisseDna.enhance(document.getElementById('pos-${kind}'),'${kind}');window.__fixtureLiveStock=true;`);
}

function clientsPage() {
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi Clients · Amira (preuve synthétique)</title><link rel="stylesheet" href="/assets/tokens.css">
    <style>*{box-sizing:border-box}html,body{margin:0;min-height:100%;background:var(--paper,#f7f5f0);color:var(--ink,#101512);font-family:Arial,sans-serif}button,input{font:inherit}.fixture-shell{min-height:100vh;padding:28px}.fixture-nav{display:flex;align-items:center;gap:14px;margin-bottom:24px}.fixture-nav strong{font-size:24px}.fixture-open{border:0;border-radius:12px;background:var(--atlas,#0b6e4f);color:#fff;padding:12px 18px;font-weight:700;cursor:pointer}.fixture-page h1{font-size:28px;margin:0}.fixture-sub{color:var(--n-500);margin:6px 0 24px}.fixture-modal{position:fixed;inset:0;background:rgba(5,12,9,.42);display:grid;place-items:center;padding:24px;z-index:30}.fixture-card{width:min(520px,100%);max-height:90vh;overflow:auto;background:var(--surface,#fff);border:1px solid var(--n-200,#ddd);border-radius:20px;padding:22px;box-shadow:0 22px 70px rgba(0,0,0,.2)}.fixture-card h2{margin:0 0 16px}.kb{padding:10px 14px;border-radius:10px;border:1px solid var(--n-200,#ddd);background:transparent;cursor:pointer}</style>
    <script>
      const venue={id:'v-art-de-table-by-amira',name:'art de table by amira',slug:'art-de-table-by-amira',type:'boutique',subtype:'maison',custom:true};
      const client={id:'client-amira-proof',name:'Cliente Preuve',phone:'0611111111',email:'preuve@example.com',city:'Tanger',visits:1,spend:730,points:73,consent:true,consentEmail:true,firstSeen:Date.now()-86400000,lastSeen:Date.now(),updated:Date.now(),history:[{ref:'2042',ts:Date.now()-3600000,amount:730,method:'carte',items:[{name:'Assiette Atlas',qty:2,total:730}]}]};
      localStorage.setItem('kiwiLiveMerchant',venue.slug);localStorage.setItem('kiwi:clients:v1:'+venue.slug,JSON.stringify({list:[client],seq:1}));
      window.KiwiEnv={isReal:()=>true};window.KiwiMe={merchant:venue.slug,business:venue.name};window.KiwiVenue={isCustom:()=>true,getVenue:()=>venue.id,getVenueType:()=>venue.type,getCurrentVenueData:()=>venue};window.KiwiI18n={getLang:()=> 'fr'};
      window.Kiwi={handlers:{},toast:()=>{},appPage:(_key,o)=>{const host=document.getElementById('fixture-content');host.innerHTML='<section class="fixture-page"><h1>'+o.title+'</h1><p class="fixture-sub">'+o.subtitle+'</p>'+o.body+'</section>';return{el:host,close:()=>{host.innerHTML=''}}},modal:o=>{const veil=document.createElement('div');veil.className='fixture-modal';veil.innerHTML='<section class="fixture-card" role="dialog"><h2>'+o.title+'</h2>'+o.body+'</section>';document.body.appendChild(veil);return{el:veil,close:()=>veil.remove()}}};
    </script>
    <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-directory.js"></script>
  </head><body><main class="fixture-shell"><nav class="fixture-nav"><strong>Kiwi</strong><button class="fixture-open" data-open-clients>Clients</button><span>art de table by amira · données synthétiques</span></nav><div id="fixture-content"><p>Ouvrez le carnet client pour vérifier les achats.</p></div></main>
    <script>document.querySelector('[data-open-clients]').onclick=()=>window.Kiwi.handlers['clients-directory']();</script>
  </body></html>`;
}

function restaurantPage() {
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi Restaurant · preuve synthétique</title>
    <link rel="stylesheet" href="/assets/tokens.css">
    <style>*{box-sizing:border-box}body{margin:0;background:#f7f5f0;color:#10251c;font-family:Arial,sans-serif}header{display:flex;align-items:center;gap:16px;padding:18px;background:#10251c;color:white}button{font:inherit;cursor:pointer;border:0;border-radius:10px;padding:10px 14px}main{padding:24px}.hero{background:white;border-radius:20px;padding:28px;max-width:760px}.hero-label{font-size:14px;font-weight:700;letter-spacing:.06em}.hero-amount{font-size:48px;font-weight:800}.drawer{margin:12px 24px;background:white;border-radius:16px;padding:16px;max-width:760px}.notif{padding:12px}.n-title{font-weight:700}.n-desc{margin-top:8px}.badge{margin-left:5px;background:#e44;color:white;border-radius:50%;padding:2px 6px}</style>
    <script>const venue={id:'restaurant-fixture',name:'Restaurant de test',slug:'restaurant-fixture',type:'restaurant',custom:true};
      window.KiwiEnv={isReal:()=>true};window.KiwiMe={merchant:venue.slug,business:venue.name};window.__kiwiRole='owner';
      window.Kiwi={handlers:{},toast:()=>{}};window.KiwiLive={merchant:()=>venue.slug};
      window.KiwiVenue={isCustom:()=>true,getVenue:()=>venue.id,getVenueType:()=>venue.type,getCurrentVenueData:()=>venue,subscribe:()=>{}};
      window.KiwiSales={list:()=>[],subscribe:()=>{}};
    </script>
  </head><body><header><strong>Kiwi · restaurant synthétique</strong><button id="fixture-home">Accueil</button><button aria-label="Notifications" id="fixture-notifications">Notifications</button></header>
    <main id="kw-main"><section class="hero"><div data-hero-label class="hero-label">ACCUEIL</div><div data-hero-amount class="hero-amount">0,00 MAD</div></section></main>
    <section id="fixture-drawer" class="drawer" hidden></section>
    <script src="/assets/dateRange.js?v=${stamps['assets/dateRange.js'].v}"></script>
    <script src="/assets/z-reconciliation.js?v=${stamps['assets/z-reconciliation.js'].v}"></script>
    <script>document.getElementById('fixture-home').onclick=()=>window.KiwiZReconciliation.showDashboard();
      document.getElementById('fixture-notifications').onclick=()=>{const d=document.getElementById('fixture-drawer');d.hidden=false;d.innerHTML=window.KiwiZReconciliation.notificationHtml();};
      window.addEventListener('load',()=>setTimeout(()=>window.dispatchEvent(new Event('kiwi:dashboard-unlocked')),100));</script>
  </body></html>`;
}

function employeeClockPage() {
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi Employé · horloge synthétique</title>
    <style>:root{--surface:white;--surface-2:#f5f6f4;--ink:#14231b;--ink-2:#3b5345;--ink-3:#666;--line:#dce5df;--r-xl:16px;--r-lg:12px;--r-md:8px;--rim:0 2px 12px #ddd;--shadow-2:0 20px 60px #0004;--tint:#e6f7ed;--forest-ink:#064329;--fill-strong:#064329;--on-strong:white}body{font:16px system-ui;margin:16px;background:#f5f6f4;color:var(--ink)}button{font:inherit;cursor:pointer}#kg-sched-card{padding:18px;background:white;border-radius:14px}#advance-store-day{margin-top:20px;padding:10px 14px}</style>
    <script>const RealDate=Date;window.__now=Date.parse('2026-09-26T12:30:00Z');window.Date=class extends RealDate{constructor(...args){super(...(args.length?args:[window.__now]));}static now(){return window.__now;}};
      window.KiwiEmployeeLive={refresh:async()=>({store:{timezone:'Pacific/Auckland'},schedule:{'2026-09-26':{start:'09:00',end:'17:00'},'2026-09-27':{start:'09:00',end:'17:00'}},planning:{requests:[],openShifts:[],swapRequests:[],notices:[]}})};
    </script>
  </head><body><div id="kg-sched-card">Mon planning</div><button id="advance-store-day">Avancer au lendemain (simulation)</button>
    <script src="/assets/employee-planning.js?v=${stamps['assets/employee-planning.js'].v}"></script>
    <script>document.getElementById('advance-store-day').onclick=()=>{window.__now=Date.parse('2026-09-27T12:30:00Z');window.dispatchEvent(new Event('focus'));};</script>
  </body></html>`;
}

function navigationPage() {
  /* Real dashboard and pages-pro code, with one visible synthetic sale control.
     The browser is isolated on loopback; no merchant account or API is used. */
  return fs.readFileSync(path.join(ROOT, 'dashboard.html'), 'utf8').replace('</body>', `
    <div id="fixture-nav-controls" style="position:fixed;right:16px;bottom:16px;z-index:9999;background:#fff;padding:12px;border:2px solid #064329;border-radius:12px">
      <button id="fixture-new-sale" type="button">Créer vente TEST KIWI (simulation)</button>
      <strong id="fixture-nav-state" role="status">En attente</strong>
    </div>
    <script>(function(){
      var id='fixture-test-kiwi-98';
      document.getElementById('fixture-new-sale').onclick=function(){
        window.KiwiSales.add('v-nav-stability',{amount:1,method:'cash',ts:Date.now(),label:'TEST KIWI',saleId:id});
      };
      setInterval(function(){
        var page=window.Kiwi && window.Kiwi.activePage;
        var found=!!(window.KiwiSales && window.KiwiSales.list('v-nav-stability').some(function(x){return x.saleId===id || x.label==='TEST KIWI';}));
        document.getElementById('fixture-nav-state').textContent=(page==='accueil'?'Accueil':String(page||'chargement'))+' · '+(found?'TEST KIWI présent':'aucune vente test');
      },200);
    })();</script>
  </body>`);
}

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/maison.html' || pathname === '/boutique.html' || pathname === '/maison-stock.html' || pathname === '/boutique-stock.html' || pathname === '/clients.html' || pathname === '/dashboard.html' || pathname === '/employee-clock.html' || pathname === '/nav-stability.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(pathname === '/maison.html' ? maisonPage() : pathname === '/boutique.html' ? boutiquePage() : pathname === '/maison-stock.html' ? stockProofPage('maison') : pathname === '/boutique-stock.html' ? stockProofPage('boutique') : pathname === '/clients.html' ? clientsPage()
      : pathname === '/dashboard.html' ? (new URL(req.url, 'http://localhost').searchParams.get('fixture') === 'nav-stability' ? navigationPage() : restaurantPage())
        : pathname === '/employee-clock.html' ? employeeClockPage() : navigationPage()); return;
  }
  if (pathname === '/kiwi-sw.js') { res.writeHead(404); res.end('fixture has no service worker'); return; }
  if (pathname === '/api/me') { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"authenticated":false}'); return; }
  if (pathname === '/api/z-reconciliation') {
    const day = new URL(req.url, 'http://localhost').searchParams.get('day');
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify({ ok: true, daySummary: { day, source: 'closed-z', referenceCents: 7500,
      reportedCents: 7500, recordedCents: 7000, recordedCount: 2, gapCents: 500,
      missingCount: 1, unqueuedCount: 0, unqueuedCents: 0, blocked: [],
      closedTerminals: 1, totalTerminals: 1, comparisonAvailable: true, syncObserved: true } })); return;
  }
  if (pathname.startsWith('/api/')) { res.writeHead(404, { 'Content-Type': 'application/json' }); res.end('{"error":"synthetic-fixture-only"}'); return; }
  const file = path.resolve(ROOT, pathname.replace(/^\/+/, ''));
  if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' }); fs.createReadStream(file).pipe(res);
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
console.log('KIWI_RETAIL_UI_QA_READY ' + JSON.stringify({ base: `http://127.0.0.1:${server.address().port}`, merchant: 'art-de-table-by-amira' }));
const stop = () => server.close(() => process.exit(0)); process.once('SIGINT', stop); process.once('SIGTERM', stop);
await new Promise(() => {});
