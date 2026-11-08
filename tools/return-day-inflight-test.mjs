/* r21 returns#A2 : changer la journée de retour pendant qu'une lecture serveur est en vol ne déplace ni la sélection
   ni les tickets (vrai syncReturnSales de la caisse boutique, transport en attente piloté par le test).
   Ce que ça prouve : la réponse tardive de la journée A range ses ventes sous A, relance le rendu de la journée
   COURANTE B et laisse state.ret intact. Ce que ça ne prouve pas : le DOM réel (couvert par les suites navigateur). */
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { world } = require('./retail-money-harness.cjs');
const w = world('boutique'), c = w.c;
vm.runInContext(fs.readFileSync('assets/pos-boutique/old-sales.js', 'utf8').replace(/^export /gm, '') + '\nObject.assign(globalThis,{readDayRows});', c);
const DAY_A = '2026-09-10', DAY_B = '2026-09-11', TS_A = Date.parse('2026-09-10T10:00:00Z');
c.IS_DEMO = false; c.fetch = () => {}; c.retainDays = () => 7;
c.retDayKey = (ts) => new Date(+ts).toISOString().slice(0, 10); c.retShiftDay = (k) => k;
c.window.KiwiDayReport = { dayBounds: () => ({ from: TS_A - 3600000, to: TS_A + 3600000 }) };
let release;
c.window.KiwiPosSale = { feedDay: () => new Promise((resolve) => { release = () => resolve({ merchant: 'test-shop', complete: true, next: null, sales: [
  { id: 'sa', ref: 'TICKET-A', ts: TS_A, method: 'cash', amountCents: 5000, lines: [{ itemId: 'p', name: 'Robe', qty: 1, unitCents: 5000 }] }] }); }) };
c.P.p = { id: 'p', name: 'Robe', price: 50 };
c.SALES.length = 0;
const renders = [];
c.renderEchanges = () => renders.push({ day: c.state.retDate, ret: c.state.ret && c.state.ret.saleId });
c.renderBadges = () => {}; c.icons = () => {};
c.state = { view: 'echanges', retDate: DAY_A, ret: null };

const pending = c.syncReturnSales(DAY_A);                   // lecture de la journée A en vol
// La caissière passe à la journée B et choisit une vente de B pendant que A est encore en route.
c.state.retDate = DAY_B;
c.SALES.push({ id: 'B-SALE', at: new Date('2026-09-11T10:00:00Z'), lines: [{ pid: 'p', qty: 1, unit: 50 }], total: 50 });
c.state.ret = { saleId: 'B-SALE', picks: new Set([0]), quantities: new Map(), motif: null };
release();
assert.equal(await pending, 1, 'la journée A est bien lue');
assert.equal(c.state.retDate, DAY_B, 'la journée choisie ne bouge pas');
assert.equal(c.state.ret && c.state.ret.saleId, 'B-SALE', 'la vente choisie reste sélectionnée');
assert.ok(c.state.ret.picks.has(0), 'ses lignes cochées aussi');
const shown = c.SALES.filter((s) => c.retDayKey(s.at) === c.state.retDate).map((s) => s.id);
assert.deepEqual(shown, ['B-SALE'], 'le ticket de A n’apparaît pas dans la liste de B');
assert.ok(c.SALES.some((s) => s.id === 'TICKET-A'), 'mais il est rangé pour la journée A');
assert.deepEqual(renders.at(-1), { day: DAY_B, ret: 'B-SALE' }, 'le rendu tardif repeint la journée courante, sélection comprise');
console.log('PASS return day in flight: selection and tickets stay with the current day');
