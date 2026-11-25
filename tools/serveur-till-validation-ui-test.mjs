// Commandes des serveurs validées à la caisse · ce que la caisse et le
// téléphone en disent (Browse, 25 nov. 2026). Le serveur est couvert par
// tools/serveur-till-validation-test.mjs ; ici, les mots et les gestes :
// la caisse sonne en nommant le serveur, le rappel à vingt minutes ne parle
// pas d'expiration (une commande de serveur n'expire pas), le téléphone dit
// « envoyée à la caisse » et n'offre pas de valider sa propre commande, et
// l'option s'allume dans kiwi-admin, éteinte par défaut.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; console.log(`  ✓ ${message}`); };

/* ── La caisse classique : la sonnerie et le bandeau nomment le serveur ── */
const inbox = read('assets/orderpro-inbox.js');
const slice = (name, next) => inbox.slice(inbox.indexOf('  function ' + name + '('), inbox.indexOf('  function ' + next + '('));
const toasts = [];
const mkEl = () => ({ className: '', classList: { add() {}, remove() {} }, set innerHTML(v) { toasts.push(v); }, set textContent(v) { toasts.push(v); }, remove() {} });
const ctx = vm.createContext({
  window: {}, setTimeout() {}, requestAnimationFrame() {},
  document: { getElementById: (id) => (id === 'toast-stack' ? { appendChild() {} } : null), createElement: mkEl },
  kitOnline: () => false, state: { orders: {}, expiryWarned: {} }, EXPIRY_WARN_MS: 20 * 60 * 1000,
});
vm.runInContext(slice('announce', 'warnExpiring') + slice('warnExpiring', 'warnDegraded') + '\nthis.announce = announce; this.warnExpiring = warnExpiring;', ctx);
ctx.announce(1, true, 'Sara');
ok(/Sara/.test(toasts.at(-1)) && /valider/.test(toasts.at(-1)) && !/client/.test(toasts.at(-1)), 'a waiter order rings with the waiter named and « à valider »');
ctx.announce(1, true, null);
ok(/client/.test(toasts.at(-1)), 'a customer QR order keeps its own banner');
const old = Date.now() - 21 * 60000;
ctx.state.orders = {
  w: { id: 'w', status: 'pending', channel: 'serveur', server: 'Sara', number: 12, mode: 'table', table: '7', created_ts: old },
  g: { id: 'g', status: 'pending', channel: 'kiwi', number: 13, mode: 'table', table: '8', created_ts: old },
};
toasts.length = 0;
ctx.warnExpiring();
const w = toasts.find((x) => /N°12/.test(x)), g = toasts.find((x) => /N°13/.test(x));
ok(w && /attend/.test(w) && !/expire/.test(w), 'after 20 min a waiter order is recalled without any expiry');
ok(g && /expire/.test(g), 'a customer order still warns of its expiry');

/* ── La caisse 2027 : le même bandeau, dans le kit ── */
const online = read('assets/kit/till-online.js');
ok(/function arrived\(n, floor, waiter\)/.test(online) && /online\.waiter_sub/.test(online), 'the 2027 till names the waiter too');
['fr', 'en', 'ar'].forEach((l) => {
  const s = read(`assets/kit/strings/till.${l}.js`);
  ok(/"online\.waiter_sub": "[^"]*\{who\}/.test(s) && /"online\.waiter_sub_anon": "/.test(s) && /"online\.waiter_wait": "/.test(s), `kit strings (${l}) carry the waiter arrival and recall`);
});
ok(/KiwiTillOnline\.arrived\(n, floorOnly, waiter\)/.test(inbox), 'the inbox passes the waiter to the 2027 till');

/* ── Le téléphone du serveur ── */
const app = read('assets/serveur-app.js');
ok(/awaitingTill: j\.status === 'pending'/.test(app), 'the phone learns its order waits for the till');
ok(/res\.awaitingTill \?/.test(app) && /Envoyée à la caisse · en attente de validation/.test(app), 'the phone says « Envoyée à la caisse », not « en cuisine »');
const runtime = read('assets/serveur/service-runtime.js');
ok(/pendingOrder\.channel === 'serveur'/.test(runtime) && /En attente de la caisse/.test(runtime), 'the phone shows its own order as waiting for the till, without an accept button');
ok(read('assets/serveur/service.js').includes(runtime), 'the loaded phone bundle carries the same code');

/* ── L'option, éteinte par défaut ── */
const admin = read('kiwi-admin.html');
ok(/\{ key:'serveurValidation', label:'Commandes des serveurs validées à la caisse', off:true,/.test(admin), 'kiwi-admin offers the option, off by default');

console.log(`\n✓ ${checks} serveur till validation UI controls passed`);
