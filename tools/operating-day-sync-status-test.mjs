import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source = fs.readFileSync(new URL('../assets/caisse-pwa.js', import.meta.url), 'utf8');
/* La tranche part de l'état d'appairage, pas de `refreshingStatus` : la ligne
 * de statut l'interroge désormais pour savoir si un 403 est une panne ou une
 * identité perdue. Découper en-dessous donnait un ReferenceError dans le bac à
 * sable — la variable existe bien en production, elle est simplement déclarée
 * un cran plus haut. */
const block = source.slice(source.indexOf('  var pairingRepairing = null;'), source.indexOf("  window.addEventListener('online', status);"));
let sales = { pending: 0, blocked: 0, storageError: false };
const probes = [];
let repaired = 0;
let probeReply = () => ({ ok: true, json: async () => ({ paired: false, reason: 'no-cookie' }) });
let journal = { pendingCount: 0, pendingPairing: false, storageError: false };
const dot = { style: {} }, label = {}, detail = {}, messages = [];
const button = { style: {}, dataset: {}, querySelector: s => ({ '.kn-dot': dot, '.kn-txt': label, '.kn-detail': detail }[s]) };
const context = vm.createContext({
  window: { KiwiLive: { queueStatus: () => sales, flush: async () => { sales = { pending: 0 }; } }, KiwiCashSessions: { status: () => journal } },
  document: { getElementById: () => button }, navigator: { onLine: true }, Promise,
  toast: (...args) => messages.push(args),
  fetch: (...args) => { probes.push(args[0]); return Promise.resolve(probeReply()); },
  localStorage: { getItem: () => JSON.stringify({ merchant: 'shop-a' }) },
  Date, encodeURIComponent, setTimeout,
});
vm.runInContext(block, context);
context.status();
assert.equal(label.textContent, 'Synchronisé');
journal = { pendingCount: 3, pendingPairing: true };
context.status();
assert.match(label.textContent, /appairage requis/);
assert.match(detail.textContent, /3 événement/);
button.onclick();
assert.match(messages.at(-1)[0], /Appairez/);
sales = { pending: 2 };
context.status();
assert.match(detail.textContent, /2 vente/);
button.onclick();
await new Promise(resolve => setImmediate(resolve));
assert.match(messages.at(-1)[0], /journal caisse en attente/);
assert.doesNotMatch(messages.at(-1)[0], /Synchronisation réussie/);
journal = { pendingCount: 2, pendingPairing: false };
context.status();
assert.match(label.textContent, /synchronisation en attente/);
assert.equal(dot.style.background, '#A56A16');
journal = { pendingCount: 0, storageError: true };
context.status();
assert.match(label.textContent, /Protection locale/);
button.onclick();
assert.match(messages.at(-1)[0], /non enregistré/);
delete context.window.KiwiCashSessions;
context.status();
assert.equal(label.textContent, 'Synchronisé');

/* ── Le 403 qui n'était qu'un mur ─────────────────────────────────────────
 * Trente et une ventes retenues et « toucher pour réessayer » : un geste qui
 * ne pouvait pas aboutir, parce que la tablette avait perdu le cookie que le
 * serveur exige, pas la connexion. La ligne interroge donc /api/pair/state et
 * ne propose le réappairage QUE sur une réponse explicite. */
/* La réparation silencieuse échoue ici, comme sur un vrai comptoir : ce
   navigateur ne porte pas la session propriétaire du tableau de bord. C'est
   exactement le terminal qu'on laissait sans recours. */
context.window.KiwiCaissePairing = {
  /* Fidèle à la production : repair() tente d'abord la voie silencieuse, qui
     échoue faute de session propriétaire, puis n'ouvre le pavé que si le geste
     a été demandé. */
  repair: (opts) => Promise.reject(Object.assign(new Error('pair-create-failed'), { status: 403 }))
    .catch((err) => {
      if (!opts || !opts.interactive) throw err;
      context.window.KiwiCaissePairing.repairWithCode();
      return { ok: true, pad: true };
    }),
  repairWithCode: () => { repaired += 1; },
  pairedVenue: () => ({ merchant: 'shop-a' }),
};
journal = { pendingCount: 0, pendingPairing: false, storageError: false };
sales = { pending: 31, blocked: 0, storageError: false, lastStatus: 403 };
context.status();
assert.match(label.textContent, /Appairage à vérifier · 31 en attente/);
assert.ok(probes.some(u => String(u).startsWith('/api/pair/state?merchant=shop-a')),
  'the counter asks the server before deciding a 403 means "unpaired"');
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.match(label.textContent, /Caisse à réappairer · 31 en attente/);
button.onclick();
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
await new Promise(resolve => setImmediate(resolve));
assert.equal(repaired, 1, 'a terminal with no dashboard session is handed the keypad, not sent to find a computer');
/* Quoi qu'il arrive pendant la réparation, la ligne continue de NOMMER les
   trente et une ventes. C'est la seule chose qu'un commerçant regarde. */
for (let i = 0; i < 8; i++) await new Promise(resolve => setImmediate(resolve));
/* Et le geste va jusqu'au bout : une fois la preuve reposée, la file repart
   et les trente et une ventes quittent la tablette. C'est la seule fin qui
   compte — le libellé n'était qu'un moyen d'y arriver. */
assert.match(messages.at(-1)[0], /Synchronisation réussie/,
  'the repaired till replays its queue instead of holding it');
assert.equal(label.textContent, 'Synchronisé');

console.log('operating-day-sync-status: 18 checks passed');
