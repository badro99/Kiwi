#!/usr/bin/env node
/* Isolated rendered fixtures for retail ticket evidence. They load the real
 * Maison caisse and dashboard client-directory assets against synthetic Amira
 * data. No production endpoint, credential, customer or stock record is used. */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2',
};

function maisonPage() {
  return `<!doctype html><html lang="fr"><head>
    <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
    <title>Kiwi Caisse · Amira (preuve synthétique)</title>
    <link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/caisse-skin.css"><link rel="stylesheet" href="/assets/caisse-dna.css"><link rel="stylesheet" href="/assets/pos-maison.css"><link rel="stylesheet" href="/assets/retail-scan.css">
    <style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--paper,#f7f5f0);font-family:Arial,sans-serif}button,input{font:inherit}button{border:0}.vx-screen{display:flex}
      .modal-veil{position:fixed;inset:0;background:rgba(4,14,10,.62);backdrop-filter:blur(16px) saturate(1.2);display:none;align-items:center;justify-content:center;z-index:100;padding:12px}.modal-veil.is-open{display:flex}
      .modal{width:480px;max-width:calc(100vw - 48px);max-height:calc(100vh - 24px);overflow-y:auto;box-sizing:border-box;background:var(--surface,#fff);border:1px solid rgba(0,0,0,.08);border-radius:24px;box-shadow:0 24px 64px -12px rgba(0,0,0,.28);padding:28px 28px 24px}
    </style>
    <script>window.KiwiEnv={isReal:()=>false,demosAllowed:true};window.KiwiConfig={features:{caisseInventoryAdmin:true,depotvente:true,caisseInventoryValue:false}};window.KiwiPosDispatch={register:s=>window.__maisonSpec=s,lock:()=>{}};</script>
    <script src="/assets/caisse-dna.js"></script><script src="/assets/barcode.js"></script><script src="/assets/color-palette.js"></script>
    <script src="/assets/inventory-ledger.js"></script><script src="/assets/maison-stock-movements.js"></script><script src="/assets/procurement.js"></script>
    <script src="/assets/venue-store.js"></script><script src="/assets/clients-store.js"></script><script src="/assets/clients-book.js"></script>
    <script src="/assets/boutique-catalog.js"></script><script src="/assets/sold-insights.js"></script><script src="/assets/pos-maison.js"></script>
  </head><body class="is-pos-maison"><div id="toast-stack"></div><div class="vx-screen is-on" id="pos-maison"></div>
    <script>window.__maisonSpec.mount(document.getElementById('pos-maison'));window.KiwiCaisseDna.enhance(document.getElementById('pos-maison'),'maison');</script>
  </body></html>`;
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

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (pathname === '/maison.html' || pathname === '/clients.html') {
    res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
    res.end(pathname === '/maison.html' ? maisonPage() : clientsPage()); return;
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
