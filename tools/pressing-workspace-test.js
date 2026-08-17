#!/usr/bin/env node
'use strict';

const fs = require('fs');
const vm = require('vm');
const path = require('path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let n = 0;
function ok(value, label) {
  if (!value) throw new Error('FAIL · ' + label);
  n++; console.log('  ✓ ' + label);
}

const venues = read('assets/venues.js');
const dashboard = read('dashboard.html');
const caisse = read('kiwi-caisse.html');
const sw = read('kiwi-sw.js');
const css = read('assets/pressing-dashboard.css');
const caisseCss = read('assets/pressing-caisse.css');
const pressingJs = read('assets/pressing-dashboard.js');
const caisseJs = read('assets/pressing-caisse.js');
const pairingJs = read('assets/caisse-pairing.js');
const dispatchJs = read('assets/pos-dispatch.js');
const storeApi = read('functions/api/store.js');
const catalogJs = read('assets/pressing-catalog.js');
const catalogCss = read('assets/pressing-catalog.css');
const garmentIcons = read('assets/pressing-garment-icons.js');

ok(/pressing:\s*\{\s*base:\s*'boutique'/.test(venues), 'pressing has an exact subtype profile');
['pressing-orders','pressing-workshop','pressing-pickup','pressing-services','pressing-quality','pressing-delivery']
  .forEach((id) => ok(venues.includes("nav: '" + id + "'"), id + ' is in the pressing navigation'));
ok(venues.includes("v.subtype !== 'pressing'"), 'generic boutique Sold is not appended to pressing');
ok(venues.includes('active.subtype = exactSubtype'), 'server type keeps the exact pressing subtype');
ok(pairingJs.includes("if (t && ids[t]) return { kind: 'vertical', id: t }"), 'operator hand-off routes an exact pressing type into the pressing till');
const pairingMatch = caisse.match(/assets\/caisse-pairing\.js\?v=(\d+)/);
ok(pairingMatch && sw.includes(`'/assets/caisse-pairing.js?v=${pairingMatch[1]}'`), 'pressing route fix bypasses the old cached pairing router');
const dispatchMatch = caisse.match(/assets\/pos-dispatch\.js\?v=(\d+)/);
const pressingRevMatch = dispatchJs.match(/file:\s*'pressing-caisse',\s*rev:\s*'([^']+)'/);
ok(dispatchMatch && sw.includes(`'/assets/pos-dispatch.js?v=${dispatchMatch[1]}'`) &&
   pressingRevMatch && sw.includes(`'/assets/pressing-caisse.js?v=${pressingRevMatch[1]}'`) &&
   sw.includes(`'/assets/pressing-caisse.css?v=${pressingRevMatch[1]}'`),
   'pressing loader and lazy assets use deploy-stable cache revisions');
/* Read the stamp rather than pinning it: this assertion is about the dashboard
   and the service worker agreeing, not about any particular version number.
   A hardcoded literal here goes red on every legitimate bump-stamp run. */
const pdMatch = dashboard.match(/assets\/pressing-dashboard\.js\?v=(\d+)/);
ok(pdMatch, 'dashboard loads the pressing subpages');
ok(pdMatch && sw.includes(`'/assets/pressing-dashboard.js?v=${pdMatch[1]}'`), 'pressing dashboard shell and service worker agree on one stamp');
/* The claim is that both surfaces load the SAME bridge — pinning a number
   asserts something weaker and breaks on every bump. Extract, then compare. */
const opsMatch = dashboard.match(/assets\/pressing-ops\.js\?v=(\d+)/);
ok(opsMatch && caisse.includes(`assets/pressing-ops.js?v=${opsMatch[1]}`), 'dashboard and till share the same operations bridge');
/* Offline means the service worker precaches whatever the shell actually asks
   for. Compare the two, don't freeze the numbers. */
const pdCssMatch = dashboard.match(/assets\/pressing-dashboard\.css\?v=(\d+)/);
ok(pdCssMatch && sw.includes(`'/assets/pressing-dashboard.css?v=${pdCssMatch[1]}'`)
  && pdMatch && sw.includes(`'/assets/pressing-dashboard.js?v=${pdMatch[1]}'`), 'pressing workspace is available offline');
ok(dashboard.includes('assets/pressing-catalog.js?v=4') && caisse.includes('assets/pressing-catalog.js?v=4') && sw.includes("'/assets/pressing-catalog.js?v=4'"), 'dashboard and till load the same offline pressing catalogue');
ok(dashboard.includes('assets/pressing-garment-icons.js?v=2') && caisse.includes('assets/pressing-garment-icons.js?v=2') && sw.includes("'/assets/pressing-garment-icons.js?v=2'"), 'dashboard and till load the same product artwork');
ok(!css.includes('body.is-pressing .page-head') && css.includes('.pressing-home { display: none !important; }'), 'pressing keeps the shared dashboard visible');
ok(pressingJs.includes("window.addEventListener('click'") && pressingJs.includes('open.dataset.pxdOpen') && pressingJs.includes('page.dataset.pxdPage'), 'pressing subpage actions claim sidebar routing before the generic dashboard');
ok(css.includes('@media (max-width: 390px)') && css.includes('@media (max-width: 760px)'), 'phone breakpoints cover narrow screens');
ok(!/font-style\s*:\s*italic/.test(css + catalogCss), 'pressing workspace uses roman type only');
ok(caisseJs.includes("catalogQuery: ''") && caisseJs.includes('px-catalog-search') && caisseJs.includes('cats.flatMap'), 'pressing counter exposes fast search and packs every visible garment into one continuous grid');
ok(caisseCss.includes('@media (max-width: 1366px)') && caisseCss.includes('minmax(96px, 1fr)') && caisseCss.includes('.px-grid-all') && caisseCss.includes('min-height: 142px'), 'common terminals show an extra garment column without shrinking touch cards below a safe height');
ok(caisseCss.includes('body.is-pos-pressing .px-view { padding: 0; }') && caisseCss.includes('html:not([data-caisse-theme="dark"]) body.is-pos-pressing .px-ticket') && caisseCss.includes('background: #fff;'), 'pressing resets landing-page section spacing and uses a pure-white light workspace');
ok(caisseJs.includes("PRESSING_STORE_PREFIX = 'kiwi:pressing-store:v1:'") && caisseJs.includes("feature: 'pressing-orders'"), 'full garment tickets persist locally and through the tenant cloud document');
ok(caisseJs.indexOf('ticketSeq++;\n        syncOwnerOps();') > 0, 'the next ticket number is persisted before a pay-at-pickup reload');
ok(storeApi.includes("'pressing-orders': { keys: ['customers', 'orders', 'seq']"), 'the store API accepts the bounded pressing ticket document');
ok(storeApi.includes("'pressing-catalog': { keys: ['categories', 'services', 'items']"), 'the store API accepts the bounded pressing catalogue document');
ok(pressingJs.includes('data-pce-host') && !caisseJs.includes('data-px-view="tarifs"'), 'names and prices are managed from the dashboard, caisse catalog is locked');
ok(catalogJs.includes('data-pce-search') && catalogJs.includes('data-pce-filter') && catalogJs.includes('var pageSize = 8') && catalogJs.includes('class="pce-summary"'), 'the catalogue is searchable, filterable, paged and collapsed by default');
ok(catalogCss.includes('grid-template-columns: repeat(2,minmax(0,1fr))') && catalogCss.includes('.pce-item.is-open { grid-column: 1/-1;'), 'compact rows use the available width and expand only on demand');
ok(venues.includes('MATERIAL_PRESSING') && dashboard.includes('viewBox="0 -960 960 960"') && caisseJs.includes('const garmentIcon ='), 'pressing navigation uses official Material Symbols');
ok(garmentIcons.includes('KiwiPressingGarmentIcons') && garmentIcons.includes("['caftan', /caftan|takchita/") && garmentIcons.includes("['jupe', /jupe|skirt/"), 'the shared artwork resolves product-specific photography');
ok(caisseJs.includes('shared.render(item, cls)') && catalogJs.includes("shared.render(item, 'pce-garment-art')") && pressingJs.includes('garmentPreview(o.pieces)'), 'caisse, dashboard catalogue and order lists reuse the shared photography');
const garmentContext = { window: {} };
vm.runInNewContext(garmentIcons, garmentContext, { filename: 'pressing-garment-icons.js' });
ok(garmentContext.window.KiwiPressingGarmentIcons.resolve({ id:'article-jupe', label:'Jupe plissée', art:'chemise', cat:'bas' }) === 'jupe' && garmentContext.window.KiwiPressingGarmentIcons.resolve({ id:'article-ca', label:'Takchita brodée', cat:'robes' }) === 'caftan', 'renamed and newly created products get representative photography');
ok(garmentContext.window.KiwiPressingGarmentIcons.render({ id:'costume', variantId:'3p' }).includes('pressing-products/costume-3p.png') && garmentContext.window.KiwiPressingGarmentIcons.render({ id:'tapis', variantId:'m' }).includes('pressing-products/tapis-m.png'), 'product photography follows suit and carpet variants');
ok(!garmentContext.window.KiwiPressingGarmentIcons.render({ id:'chemise' }).includes('<svg') && garmentContext.window.KiwiPressingGarmentIcons.render({ id:'chemise' }).includes('<img'), 'pressing items render product photos instead of garment icons');
['chemise','tshirt','pull','veste','costume-2p','costume-3p','manteau','pantalon','jean','jupe','short','robe','robe-soiree','caftan','drap','housse','couverture','nappe','rideaux','tapis-s','tapis-m','tapis-l','veste-cuir','daim','doudoune','chaussures','baskets','babouches']
  .forEach((id) => ok(fs.existsSync(path.join(root, 'assets/pressing-products/' + id + '.png')), id + ' product photo exists'));
ok(caisseJs.includes('unitPrice: lineUnit(l)') && caisseJs.includes('label: ITEMS[l.itemId].label') && caisseJs.includes('Number.isFinite(+ln.unitPrice)'), 'confirmed tickets freeze their agreed name and unit price');
ok(caisseJs.includes("notes: (ln.notes || []).slice(), freeNote: ln.freeNote || ''") && caisseJs.includes('px-dt-care-summary') && caisseJs.includes('px-piece-care') && caisseJs.includes('px-tag-care'), 'care instructions survive into the visible workshop summary, detail and physical labels');
ok(caisseJs.includes("receiptHTML(order, 'DUPLICATA · ATELIER')") && caisseJs.includes("copy: 'DUPLICATA · ATELIER'") && caisseJs.includes('KP.printReceipt(duplicate)'), 'every pressing print job includes a clearly marked workshop duplicate');
ok(caisseJs.includes('Imprimer 2 tickets +') && caisseJs.includes('nom du client, commande, pièce, article et service') && caisseJs.includes('<div class="px-tag-client">${esc(customer.name)}</div>') && caisseJs.includes('hideBarcode: true'), 'garment labels prioritize order number while retaining operational references');
ok(caisseCss.includes('--kiwi-dna-rail-w: 272px') && caisseJs.includes('id="px-theme"') && caisseJs.includes('KiwiCaisseTheme.toggle()') && caisseJs.includes('id="px-fullscreen"'), 'pressing uses a full-width rail with theme and fullscreen terminal controls');
const whatsappDraftOpen = caisseJs.indexOf("window.open('', '_blank')");
const whatsappConfirmedAfterOpen = caisseJs.indexOf('o.notified = true', whatsappDraftOpen);
ok(caisseJs.includes('J’ai envoyé le message') && whatsappDraftOpen >= 0 && whatsappConfirmedAfterOpen > whatsappDraftOpen, 'WhatsApp notification is confirmed only after opening the draft');
ok(!caisseJs.includes("jusqu'à 20h00") && !caisseJs.includes('merci envoyé sur WhatsApp'), 'customer messages and handover confirmations make no false claims');
ok(!caisseJs.includes('Date promise') && !caisseJs.includes('date promise'), 'withdrawal copy is idiomatic French');
ok(caisseJs.includes('openClient({ onSelected: chooseReady })') && caisseJs.includes('openDate({ onSelected: finalizeTicket })') && caisseJs.includes('function finalizeTicket()'), 'validation guides the cashier through customer and pickup date before printing');
ok(caisseJs.includes("boardFilter: 'todo'") && caisseJs.includes("['todo', 'À faire']") && caisseJs.includes("['ready', 'Prêtes']") && caisseJs.includes("['history', 'Historique']"), 'the pressing board separates actionable work, ready pickups and completed history');
ok(caisseJs.includes('Reçu automatiquement') && caisseJs.includes('« En cours » facultatif') && caisseJs.includes('une touche quand c’est prêt'), 'daily workflow records receipt automatically and makes treatment tracking optional');
ok(caisseJs.includes('data-px-ready=') && caisseJs.includes("setWholeOrderStatus(findOrder(ready.dataset.pxReady), 'pret'") && caisseJs.includes('data-px-batch-ready'), 'one order or a selected batch can be marked ready in one action');
ok(caisseJs.includes("openScan('workflow')") && caisseJs.includes("state.scanMode === 'workflow'") && caisseJs.includes('Rien ne change sans votre validation'), 'workshop scans open the correct order and next action without silently changing state');
ok(caisseJs.includes('px-piece-exceptions') && caisseJs.includes('suivi détaillé facultatif'), 'piece-by-piece status tracking is reserved for care exceptions instead of mandatory administration');
ok(caisseJs.includes('« Prévenir » reste disponible') && !caisseJs.includes('setTimeout(() => openWa(o)'), 'marking an order ready never forces the multitasking worker into WhatsApp');
ok(caisseJs.includes("livre: { label: 'Remis'") && caisseJs.includes("? `remis ${fmtDay"), 'completed counter handovers are labelled as handed over, not falsely home-delivered');
ok(caisseJs.includes("active.filter((o) => orderStatus(o) === 'pret')") && caisseJs.includes('Aucune commande prête à remettre pour le moment.'), 'Retrait automatically presents the ready-order queue without requiring a search');
ok(caisseJs.includes('id="px-dt-handover"') && caisseJs.includes('state.rtQuery = o.id;') && caisseJs.includes("switchView('retrait')"), 'a ready order opens its exact handover workflow directly from the orders board');
ok(caisseJs.includes('Remettre au client') && caisseJs.includes("p.status = 'livre'") && caisseJs.includes('o.collectedAt = new Date()') && caisseJs.includes('releaseSlot(o)'), 'confirmed handover closes every piece, timestamps the order and releases its rack');
ok(caisseJs.includes('aria-pressed="${c.id === sheet.color}"') && caisseJs.includes('aria-pressed="${sheet.notes.includes(n)}"'), 'care selections expose their state to assistive technology');
ok(/id: '(?:P-)?1031'[\s\S]{0,180}paid: 102/.test(caisseJs), 'delivered demo orders cannot retain an impossible balance');

const store = new Map();
const context = {
  console,
  Date,
  Set,
  JSON,
  Math,
  Number,
  String,
  Array,
  Object,
  CustomEvent: function (name, init) { this.type = name; this.detail = init && init.detail; },
  localStorage: {
    getItem: (k) => store.has(k) ? store.get(k) : null,
    setItem: (k, v) => store.set(k, String(v)),
  },
  addEventListener() {},
  dispatchEvent() {},
  KiwiVenue: { getCurrentVenueData: () => ({ id: 'v1', slug: 'pressing-amira', subtype: 'pressing' }) },
};
context.window = context;
vm.runInNewContext(read('assets/pressing-ops.js'), context, { filename: 'pressing-ops.js' });
vm.runInNewContext(catalogJs, context, { filename: 'pressing-catalog.js' });

const now = Date.now();
const orders = [
  { id:'P-1', droppedAt:new Date(now - 1000), readyAt:new Date(now - 500), pay:{mode:'pickup',paid:20}, notified:true, pieces:[{pid:'1',label:'Veste',status:'trait',photos:0,notes:['Tache col'],svcs:['sec']}] },
  { id:'P-2', droppedAt:new Date(now - 1000), readyAt:new Date(now + 5000), pay:{mode:'pickup',paid:0}, rack:'B-07', notified:false, pieces:[{pid:'1',label:'Robe',status:'pret',photos:0}] },
  { id:'P-3', droppedAt:new Date(now - 1000), readyAt:new Date(now + 10000), pay:{mode:'pickup',paid:10}, pieces:[{pid:'1',label:'Pantalon',status:'trait',photos:0,svcs:['lavage']}] },
];
context.KiwiPressingOps.replace(orders, {
  customer: (o) => ({ name: o.id === 'P-1' ? 'Amal' : o.id === 'P-2' ? 'Youssef' : 'Karim', phone: '0600000000' }),
  total: (o) => o.id === 'P-1' ? 100 : o.id === 'P-2' ? 80 : 50,
});
const s = context.KiwiPressingOps.summary();
ok(s.pieces === 3 && s.treating === 1 && s.ready === 2, 'summary derives auto-ready and preserves future treating');
ok(s.late === 1, 'late uncollected count is derived from promised date');
ok(s.due === 200, 'outstanding balance is derived from totals and payments');
ok(s.racks === 1 && s.unnotified === 1, 'rack and notification queues stay in sync');
ok(s.attention === 1 && s.services.sec === 1, 'dashboard derives care and treatment load from real pieces');
const snapshotText = [...store.values()].join('');
ok(!snapshotText.includes('"pin"') && !snapshotText.includes('"code"'), 'operations snapshot contains no credential fields');
ok(!snapshotText.includes('Tache col'), 'dashboard snapshot records a vigilance without leaking the customer instruction');

const initialCatalog = context.KiwiPressingCatalog.read();
const chemise = initialCatalog.items.find((x) => x.id === 'chemise');
ok(chemise && chemise.label === 'Chemise' && chemise.prices.repassage === 10, 'pressing catalogue starts with the operational default grid');
ok(context.KiwiPressingCatalog.updateItem('chemise', { label:'Chemise premium', prices:{sec:27,repassage:12}, active:true }), 'an owner can save a garment name and prices');
const editedChemise = context.KiwiPressingCatalog.read().items.find((x) => x.id === 'chemise');
ok(editedChemise.label === 'Chemise premium' && editedChemise.prices.sec === 27 && !editedChemise.prices.lavage, 'saved prices replace the offered treatment matrix instead of leaving stale values');
const added = context.KiwiPressingCatalog.addItem({ label:'Gilet', cat:'hauts', prices:{sec:30,repassage:14} });
ok(added && context.KiwiPressingCatalog.read().items.some((x) => x.id === added.id && x.label === 'Gilet'), 'a new garment becomes part of the shared catalogue');
ok(context.KiwiPressingCatalog.updateItem(added.id, { active:false }), 'a garment can be hidden without deletion');
ok(context.KiwiPressingCatalog.read().items.find((x) => x.id === added.id).active === false, 'hidden garments remain available to historical tickets');

const older = context.KiwiPressingCatalog._defaults();
const newer = context.KiwiPressingCatalog._defaults();
older.items.find((x) => x.id === 'chemise').label = 'Ancien nom';
older.items.find((x) => x.id === 'chemise').updatedAt = 10;
newer.items.find((x) => x.id === 'chemise').label = 'Nom récent';
newer.items.find((x) => x.id === 'chemise').updatedAt = 20;
ok(context.KiwiPressingCatalog._merge(older,newer).items.find((x) => x.id === 'chemise').label === 'Nom récent', 'cross-device catalogue merge keeps the latest row');

console.log('\n✓ pressing workspace gate green (' + n + ' checks)');
