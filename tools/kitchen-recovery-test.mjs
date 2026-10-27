#!/usr/bin/env node
/* Kiwi · Liste de récupération des bons évincés (kitchen #0)
 * Un bon tombé de la file (30 min, ou 120 en attente) garde son payload dans
 * une liste à part, avec sa propre borne. Un tap « Réimprimer » le renvoie
 * dans la file durable : mêmes octets, une seule fois, jamais deux par
 * accident. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(ROOT, 'assets/kitchen-print-queue.js'), 'utf8');
const langSource = fs.readFileSync(path.join(ROOT, 'assets/caisse-lang.js'), 'utf8');
let pass = 0; const fail = [];
function ok(label, condition, detail = '') {
  if (condition) pass += 1;
  else fail.push(label + (detail ? ' — ' + detail : ''));
}
const wait = (ms = 20) => new Promise((resolve) => setTimeout(resolve, ms));

function makeElement() {
  const e = { className: '', type: '', textContent: '', style: {}, listeners: {}, children: [], parent: null };
  e.setAttribute = (k, v) => { e['attr:' + k] = v; };
  e.addEventListener = (type, fn) => { (e.listeners[type] ||= []).push(fn); };
  e.appendChild = (child) => { child.parent = e; e.children.push(child); };
  e.click = () => { (e.listeners.click || []).forEach((fn) => fn({})); };
  e.findButton = function findB(n) {
    if (n === e || !n) return n === e ? e.findButtonIn() : null;
    return null;
  };
  e.findButtonIn = function () {
    if (this.className === 'toast-action') return this;
    for (const c of this.children) { const hit = c.findButtonIn ? c.findButtonIn() : null; if (hit) return hit; }
    return null;
  };
  return e;
}

function boot(options = {}) {
  const memory = new Map();
  const localStorage = {
    getItem: (key) => memory.has(key) ? memory.get(key) : null,
    setItem: (key, value) => memory.set(key, String(value)),
    removeItem: (key) => memory.delete(key),
  };
  const toasts = [];
  let stackEl = null;
  const doc = {
    readyState: 'complete',
    getElementById(id) { return options.dom && id === 'toast-stack' ? stackEl : null; },
    addEventListener() {},
  };
  if (options.dom) {
    doc.createElement = () => makeElement();
    stackEl = makeElement();
    stackEl.querySelector = () => null;
  }
  const printed = [];
  const context = {
    console, Promise, Date, JSON, Math, Object, Array, String, Number, Boolean,
    localStorage,
    document: doc,
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    setInterval: () => 1, clearInterval() {}, setTimeout, clearTimeout,
    addEventListener() {}, dispatchEvent() {},
    KiwiCaisseToast: (title, ms, kind, desc) => { toasts.push({ title, kind, desc }); },
    KiwiKitchenRelay: { merchant: () => 'amira-cafe' },
    KiwiPrinter: {
      isConnected: () => true,
      printKitchen(payload, opts) {
        printed.push({ payload, opts });
        return Promise.resolve({ ok: true, via: 'bridge' });
      },
    },
  };
  context.window = context;
  vm.runInNewContext(source, context, { filename: 'assets/kitchen-print-queue.js' });
  return {
    api: context.KiwiKitchenPrint,
    memory: {
      getItem: (k) => memory.has(k) ? String(memory.get(k)) : null,
      setItem: (k, v) => memory.set(k, String(v)),
      removeItem: (k) => memory.delete(k),
      has: (k) => memory.has(k),
      get: (k) => memory.has(k) ? String(memory.get(k)) : null,
    },
    printed, toasts, stackEl,
  };
}

const PAYLOAD = { title: 'CUISSON', station: 'Cuisine', items: [{ name: 'Tajine poulet', qty: 2 }] };

/* 1 · un bon périmé tombe, son payload entier arrive dans un storage à part */
{
  const { api, memory, printed } = boot();
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([
    { id: 'order:vieux:cuisine', type: 'kitchen', payload: PAYLOAD, station: 'Cuisine', createdAt: Date.now() - 31 * 60 * 1000 },
    { id: 'order:frais:cuisine', payload: { title: 'CUISSON', items: [{ name: 'Salade' }] }, createdAt: Date.now() },
  ]));
  const q = api._readQueue();
  ok('la purge du trente-minute reste acquise', q.length === 1 && q[0].id === 'order:frais:cuisine');
  const recovered = api._readRecover();
  ok('le bon évincé arrive dans la liste de récupération', recovered.length === 1 && recovered[0].id === 'order:vieux:cuisine');
  ok('la liste a sa clé, à part de la file',
    memory.has('kiwiKitchenPrintRecoverV1:amira-cafe')
    && !memory.get('kiwiKitchenPrintQueueV1:amira-cafe').includes('Tajine'));
  ok('rien ne sort tant que personne ne demande rien', printed.length === 0);
  ok('l\'état expose ce qui est reprisable', api.status().recoverable === 1);
}

/* 2 · le tap « Réimprimer », une fois, à l'octet près, jamais deux */
{
  const { api, memory, printed } = boot();
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([
    { id: 'order:vieux:cuisine', type: 'kitchen', payload: PAYLOAD, station: 'Cuisine', createdAt: Date.now() - 31 * 60 * 1000 },
  ]));
  api._readQueue();
  const reply = api.reprintDropped();
  await wait(80);
  ok('un tap remet le bon en file durable', reply && reply.accepted === 1 && api.status().pending === 0);
  ok('le bon repris sort exactement une fois', printed.length === 1);
  ok('le payload repris est identique à l\'octet près',
    JSON.stringify(printed[0].payload) === JSON.stringify(PAYLOAD));
  ok('le bon repris garde son poste', printed[0].opts.station === 'Cuisine');
  ok('la clé d\'idempotence suit le format serveur', /^[A-Za-z0-9_:.-]{8,80}$/.test(printed[0].opts.clientRef));
  ok('l\'identité du repris part du bon d\'origine', printed[0].opts.clientRef.indexOf('order:vieux:cuisine') > 0);
  ok('l\'entrée récupérée est retirée une fois la file d\'accord', api._readRecover().length === 0);
  api.reprintDropped();
  api.reprintDropped('order:vieux:cuisine');
  await wait();
  ok('un second tap, volontaire ou pas, ne fabrique pas une copie', printed.length === 1);
  ok('la rétention automatique ne rejoue pas le repris',
    JSON.parse(memory.getItem('kiwiKitchenPrintDoneV1:amira-cafe')).some((x) => x.id === printed[0].opts.clientRef.slice(3)));
}

/* 3 · file pleine : le repris est refusé, il reste reprisable */
{
  const { api, memory, printed, toasts } = boot();
  const rows = [];
  for (let i = 0; i < 130; i++) rows.push({ id: 'order:' + i, payload: { station: 'Cuisine' }, createdAt: Date.now() });
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify(rows));
  const q = api._readQueue();
  ok('les plus anciens partent, comme avant', q.length === 120 && q[0].id === 'order:10');
  ok('les dix évincés sont tous récupérables', api._readRecover().length === 10
    && api._readRecover().every((x) => Number(x.createdAt) === rows[0].createdAt));
  const reply = api.reprintDropped('order:5'); /* la file re-déborde aussitôt */
  await wait();
  ok('un repris que la file refuse ne part pas : il reste au chaud',
    reply && reply.accepted === 0 && reply.skipped === 'queue-full' && api._readRecover().length === 10);
  ok('le refusé n\'apparaît jamais sur le papier, même si la file repart du reste',
    printed.every((p) => p.opts.clientRef.indexOf('kq.order:5') !== 0));
  ok('le diagnostic de purge porte toujours le motif', api._readRecover().every((x) => x.reason === 'dropped-overflow'));
  ok('le comptoir est prévenu quand la pile manque', toasts.length > 0 && /file/.test(toasts[0].title));
}

/* 4 · la borne propre de la liste : 185 purges d'un coup n'en gardent que 60 */
{
  const { api, memory } = boot();
  const rows = [];
  for (let i = 0; i < 185; i++) rows.push({ id: 'order:' + i, payload: { station: 'Cuisine' }, createdAt: Date.now() });
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify(rows));
  api._readQueue();
  const got = api._readRecover();
  ok('la liste garde les plus récentes, avec sa propre borne',
    got.length === 60 && got[0].id === 'order:5' && got[59].id === 'order:64');
}

/* 5 · un bon déjà inscrit ne se duplique pas · péremption et débordement ne se confondent pas */
{
  const { api, memory } = boot();
  const old = { id: 'order:x:cuisine', payload: PAYLOAD, createdAt: Date.now() - 31 * 60 * 1000 };
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([old]));
  api._readQueue();
  const first = api._readRecover().length;
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([old]));
  api._readQueue();
  ok('le même évincé ne s\'inscrit qu\'une fois', first === 1 && api._readRecover().length === 1);
  ok('le motif garde son sens : périmé, pas débordé', api._readRecover()[0].reason === 'dropped-expired');
}

/* 6 · l'avertissement porte le geste : un tap « Réimprimer », libellé traduisible */
{
  const { api, memory, printed, stackEl, toasts } = boot({ dom: true });
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([
    { id: 'order:dom:1', payload: PAYLOAD, station: 'Cuisine', createdAt: Date.now() - 31 * 60 * 1000 },
  ]));
  api.status();
  const card = stackEl.children[0];
  ok('l\'avertissement du bon évincé existe', !!card && card.className.includes('toast') && card.className.includes('warn'));
  const btn = card ? card.findButtonIn() : null;
  ok('il porte un bouton « Réimprimer », un geste, pas un diagnostic',
    !!btn && btn.textContent === 'Réimprimer' && btn.type === 'button');
  btn.click();
  await wait(80);
  ok('le tap du bouton imprime le bon évincé', printed.length === 1
    && JSON.stringify(printed[0].payload) === JSON.stringify(PAYLOAD));
  btn.click();
  await wait(80);
  ok('un second tap sur le même bouton n\'imprime rien de plus', printed.length === 1 && btn.disabled === true);
}

/* 6b · une purge qui évince trois bons d'un coup : un tap les reprend tous, une fois */
{
  const { api, memory, printed, stackEl } = boot({ dom: true });
  const old = Date.now() - 31 * 60 * 1000;
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify(['a', 'b', 'c'].map((k) =>
    ({ id: 'order:lot:' + k, payload: { ...PAYLOAD, title: 'BON ' + k }, station: 'Cuisine', createdAt: old }))));
  api.status();
  const btn = stackEl.children[0] ? stackEl.children[0].findButtonIn() : null;
  btn.click();
  await wait(120);
  await api.flush(); /* le minuteur de la caisse est figé ici : on vide la file à la main */
  await wait(120);
  ok('un tap reprend les trois bons de la purge', printed.length === 3
    && ['a', 'b', 'c'].every((k) => printed.some((p) => p.payload.title === 'BON ' + k)));
  btn.click();
  await wait(120);
  ok('un second tap ne double aucun des trois', printed.length === 3);
  ok('la liste de récupération est vidée de ce qui est reparti', api._readRecover().length === 0);
}

/* 7 · sans pile de toast, le registre reprend la voix · libellés trois langues */
{
  const { api, memory, toasts } = boot();
  memory.setItem('kiwiKitchenPrintQueueV1:amira-cafe', JSON.stringify([
    { id: 'order:no-dom:1', payload: PAYLOAD, createdAt: Date.now() - 31 * 60 * 1000 },
  ]));
  api._readQueue();
  ok('sans pile, l\'avertissement passe quand même par le toast de la caisse',
    toasts.length > 0 && /file/.test(toasts[0].title) && /Réimprim/.test(toasts[0].desc || ''));
  ok('le libellé du titre existe en EN', /'Ticket cuisine tombé de la file':\s*'Kitchen ticket fell out of the print queue'/.test(langSource));
  ok('le libellé du titre existe en AR', /'Ticket cuisine tombé de la file':\s*'بون المطبخ خرج من قائمة الانتظار'/.test(langSource));
  ok('le libellé du détail existe en EN', /'Le bon n’a pas pu être imprimé\. Réimprimez-le d’un geste\.':\s*'The ticket never printed\./.test(langSource));
  ok('le libellé du détail existe en AR', /'Le bon n’a pas pu être imprimé\. Réimprimez-le d’un geste\.':\s*'لم يُطبع البون/.test(langSource));
  ok('le bouton « Réimprimer » est déjà traduit des deux côtés', langSource.includes("'Réimprimer': 'Reprint'") && langSource.includes("'Réimprimer': 'إعادة الطباعة'"));
}

if (fail.length) {
  fail.forEach((line) => console.error('  ✗ ' + line));
  console.error(`\n✗ récupération des bons évincés : ${pass} ok, ${fail.length} échec(s)`);
  process.exit(1);
}
console.log(`  ✓ récupération des bons évincés (${pass} contrôles : payload complet, clé à part, borne propre, une fois, jamais deux, tap « Réimprimer »)`);
