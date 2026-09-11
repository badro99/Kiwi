import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let controls = 0;
function ok(value, message) { controls++; if (!value) throw new Error(message); }
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

const listeners = {};
const document = {
  documentElement: { lang: 'fr' }, body: { classList: { add() {}, remove() {} } },
  addEventListener(name, fn) { listeners[name] = fn; },
  querySelector() { return null; }, getElementById() { return null; },
};
const window = { addEventListener(name, fn) { listeners[`window:${name}`] = fn; } };
vm.runInNewContext(source('assets/employee-trade-shell.js'), { window, document, Date, Intl, String, Object, Array, Number, setTimeout });
const api = window.KiwiEmployeeTradeShell;
ok(api && typeof api.canonical === 'function', 'trade shell exports a deterministic mapper');
ok(api.isDining('restaurant') && api.isDining('café'), 'restaurant and café remain on the dining app');
ok(!api.isDining('pressing'), 'specialist venues use the trade workspace');
for (const type of ['fastfood','pizzeria','bakery','traiteur','foodtruck','boutique','epicerie','pharmacie','librairie','fleuriste','pressing','spa','coiffure','hotel','gym','autre']) {
  ok(api.trades.includes(type), `${type} has a dedicated or safe generic workspace`);
}
ok(api.canonical('boulangerie') === 'bakery', 'French bakery type maps correctly');
ok(api.canonical('food-truck') === 'foodtruck', 'hyphenated food truck type maps correctly');
ok(api.canonical('blanchisserie') === 'pressing', 'laundry alias maps correctly');
ok(api.canonical('unknown-new-trade') === 'autre', 'unknown trades receive the safe generic workspace');
ok(api.isRestaurantService({ employee:{ role:'Serveur' }, floor:{ tables:[] } }), 'an explicit waiter is recognised without venue metadata');
ok(api.isRestaurantService({ employee:{ role:'Serveuse' }, floor:{ tables:[] } }), 'a waitress label is recognised without venue metadata');
ok(api.isRestaurantService({ employee:{ role:"Maître d'hôtel" }, floor:{ tables:[] } }), 'a dining room lead is recognised without venue metadata');
ok(!api.isRestaurantService({ employee:{ role:'Vendeur' }, floor:{ tables:[] } }), 'a retail seller is not mistaken for a waiter');
ok(!api.usesTradeWorkspace({ store:{ type:'' }, employee:{ role:'Serveur' }, floor:{ tables:[] } }), 'a waiter with a blank legacy venue type keeps tables and menu');
ok(!api.usesTradeWorkspace({ store:{ type:'restaurant' }, employee:{ role:'Serveur' }, floor:{ tables:[] } }), 'restaurant employees keep the dining workspace');
ok(api.usesTradeWorkspace({ store:{ type:'' }, employee:{ role:'Vendeur' }, floor:{ tables:[] } }), 'a non-floor employee with blank venue metadata keeps the safe trade hub');
ok(api.usesTradeWorkspace({ store:{ type:'pressing' }, employee:{ role:'Accueil' }, floor:{ tables:[] } }), 'an explicit specialist venue keeps its trade workspace');
ok(!api.usesTradeWorkspace({ store:{ type:'' }, employee:{ role:'Manager' }, floor:{ tables:[{ id:'T1' }] } }), 'a manager with a real floor and legacy metadata keeps the dining workspace');

const server = source('kiwi-serveur.html');
ok(server.includes("tabs: ['tables', 'notifications', 'profil']"), 'non-dining staff receive self-service tabs without menu');
ok(server.includes('tradeWorkspace: true'), 'role explicitly identifies trade workspace');
ok(server.includes('assets/employee-trade-shell.js?v=2'), 'employee app loads the role-safe workspace');
/* L'estampille est VOLATILE : toute modification du fichier la déplace, et la
   figer ici faisait échouer la suite sur un correctif parfaitement valide. On
   n'assouplit pas pour autant jusqu'à ne plus rien prouver — on vérifie que la
   coquille et le service worker citent la MÊME, ce qui est l'invariant réel :
   deux estampilles divergentes servent l'ancien fichier hors ligne. */
const cssStamp = (file) => (source(file).match(/assets\/employee-trade-shell\.css\?v=(\d+)/) || [])[1];
ok(cssStamp('kiwi-serveur.html'), 'employee app loads its responsive design, stamped');
ok(cssStamp('kiwi-serveur.html') === cssStamp('kiwi-sw.js'),
  'the shell and the offline precache agree on the design stamp');
const shell = source('assets/employee-trade-shell.js');
for (const field of ['attendance', 'schedule', 'planning', 'colleagues', 'messages']) ok(shell.includes(field), `workspace reads live ${field} data`);
ok(!/Math\.random|setInterval\s*\(/.test(shell), 'workspace does not invent operational activity');
ok(source('assets/employee-trade-shell.css').includes('employee-trade-mode #tables-zones'), 'restaurant floor is hidden only in trade mode');
ok(source('kiwi-sw.js').includes("'/assets/employee-trade-shell.js?v=2'"), 'role-safe workspace works from the employee offline shell');
console.log(`✓ Employee trade workspace — ${controls} controls`);
