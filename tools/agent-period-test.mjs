#!/usr/bin/env node
// The assistant reads one named period (assets/agent-data.js, periodSpec /
// sPeriod) and leaves how-to questions and slips to the guide or the model
// (supportAsk). Both came from a thousand random questions written on 27 Nov
// 2026 by someone who had never seen the assistant: « ventes la semaine
// dernière », « ch7al dkhlt akher 7 iyam », « tickets had simana » got « I
// can't compare two periods » or today's total, and « Can I print an invoice
// again? » got a hiring simulation.
//
// The sales below are spread over several weeks, so each period has its own
// figure: a wrong window gives a wrong number, never a lucky right one.
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { load, flatten } = require(path.join(root, 'tools/agent-harness.cjs'));
process.chdir(root);

const DAY = 864e5, H = 3600e3;
const t0 = (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })();
const dow = (new Date(t0).getDay() + 6) % 7;            // Monday = 0
const mon = t0 - dow * DAY;
const now = new Date(t0), firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
const firstOfLast = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

const sale = (ts, amount, method, lines) => ({ ts, amount, method, lines: lines.map(([name, qty, total]) => ({ name, qty, total })) });
const FEED = [
  sale(t0 + 12 * H, 100, 'cash', [['Tacos XL', 2, 80], ['Coca 33cl', 1, 20]]),
  Object.assign(sale(t0 + 13 * H, 60, 'card', [['Thé à la menthe', 2, 30], ['Coca 33cl', 2, 30]]), { channel: 'glovo', tipCents: 1000, discountAmountCents: 500 }),
  sale(mon - 5 * DAY + 12 * H, 300, 'card', [['Tacos XL', 3, 120], ['Burger Classic', 3, 180]]),
  sale(mon - 4 * DAY + 13 * H, -50, 'cash', []),
  sale(mon - 3 * DAY + 12 * H, 70, 'cash', [['Frites', 7, 70]]),
  sale(firstOfLast + 14 * DAY + 12 * H, 500, 'cash', [['Burger Classic', 5, 300], ['Tiramisu', 4, 200]]),
].map((s, i) => Object.assign(s, { cursor: i + 1 }));
const ITEMS = ['Tacos XL', 'Burger Classic', 'Salade César', 'Frites', 'Coca 33cl', 'Thé à la menthe', 'Tiramisu'];

const world = (lang) => load({
  lang, role: 'owner', corpus: false,
  env: { isReal: () => true },
  venue: { isCustom: () => true, getVenue: () => 'v1', getCurrentVenueData: () => ({ name: 'Burger test', subtype: 'restaurant' }) },
  sales: { list: () => FEED, totals: () => ({ revenue: 100, count: 1, basket: 100 }) },
  globals: { KiwiMenuStore: { items: () => ITEMS.map((name, i) => ({ id: 'i' + i, name, price: 20 + i * 5 })) } },
});
const W = {};
const ask = (q, L) => { const w = W[L] || (W[L] = world(L)); return { route: w.KiwiAgentRoute(q), text: flatten(w.KiwiAgentAsk(q, L)).replace(/\s+/g, ' ') }; };
const sum = (from, to, pick = (s) => s.amount > 0 ? s.amount : 0) => FEED.filter((s) => s.ts >= from && s.ts < to).reduce((a, s) => a + pick(s), 0);
const units = (from, to, name) => FEED.filter((s) => s.ts >= from && s.ts < to).reduce((a, s) => a + s.lines.filter((l) => l.name === name).reduce((b, l) => b + l.qty, 0), 0);
const has = (text, n) => new RegExp('(?:^|[^\\d])' + n + '(?:[^\\d]|$)').test(text);
let n = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); n++; };

// 1. One period, read for what was asked.
const lastWeek = sum(mon - 7 * DAY, mon);                              // 370
const last7 = sum(t0 - 6 * DAY, t0 + DAY);
const thisWeek = sum(mon, t0 + DAY);
const lastMonth = sum(firstOfLast, firstOfMonth);
for (const [q, L, want, why] of [
  ['mes ventes la semaine dernière', 'fr', lastWeek, 'last week, Monday to Sunday'],
  ['I need a summary of revenue last week', 'en', lastWeek, '« summary of revenue » names the takings, not a topic'],
  ['ch7al dkhlt akher 7 iyam', 'fr', last7, 'the last seven days, today included'],
  ['وريني المبيعات الأسبوع الماضي عفاك', 'ar', lastWeek, 'Arabic, last week'],
  ['I need a summary of sales last month', 'en', lastMonth, 'last calendar month'],
]) {
  const r = ask(q, L);
  ok(/^lookup/.test(r.route) && has(r.text, want), `« ${q} » (${why}) should give ${want} MAD → {${r.route}} ${r.text.slice(0, 140)}`);
}
{
  const r = ask('combien de tickets cette semaine', 'fr');
  const count = FEED.filter((s) => s.ts >= mon && s.ts < t0 + DAY && s.amount > 0).length;
  ok(/^lookup/.test(r.route) && new RegExp(count + ' ticket').test(r.text) && has(r.text, thisWeek), `tickets this week → ${count} for ${thisWeek} MAD, got ${r.text.slice(0, 120)}`);
}
{
  const r = ask('combien de tacos vendus la semaine dernière', 'fr');
  const u = units(mon - 7 * DAY, mon, 'Tacos XL');
  ok(r.text.includes(u + ' × Tacos XL') && !r.text.includes((u + 2) + ' × Tacos XL'), `tacos last week → ${u}, not today's 2 added → ${r.text.slice(0, 120)}`);
}
{
  const r = ask('cash payments last month', 'en');
  ok(/In cash/.test(r.text) && has(r.text, lastMonth), `cash last month → ${lastMonth} → ${r.text.slice(0, 120)}`);
  const f = ask('remboursements la semaine dernière', 'fr');
  ok(/1 remboursement/.test(f.text) && has(f.text, 50), `refunds last week → 1 for 50 MAD → ${f.text.slice(0, 120)}`);
}

// Round two (27 Nov): the words people type for a dish, a family of the
// menu, what the menu does not hold, and what each ticket carries besides.
const units7 = (name) => units(mon, t0 + DAY, name);
for (const [q, L, must, why] of [
  ['ch7al b3na mn atay had simana', 'fr', units7('Thé à la menthe') + ' × Thé à la menthe', '« atay » is the mint tea of the menu'],
  ['بغيت نشوف شحال بعت من أتاي هاد السيمانة', 'ar', units7('Thé à la menthe') + ' × Thé à la menthe', 'أتاي with its hamza'],
  ['combien de boissons vendues cette semaine', 'fr', (units7('Coca 33cl') + units7('Thé à la menthe')) + ' unités', 'drinks cover Coca and tea though no category says so'],
  ['ch7al dyal 9ahwa simana li fatet', 'fr', '« 9ahwa »', 'coffee is not on this menu: say so, not the takings'],
  ['Donne-moi le détail des accessoires téléphone cette semaine', 'fr', '« accessoires telephone »', 'a topic of another trade'],
  ['combien de pourboires cette semaine', 'fr', '10 MAD', 'tips ride on the ticket'],
  ['discounts this week', 'en', '5 MAD', 'so do discounts'],
  ['livraison cette semaine', 'fr', '1 commande', 'a Glovo ticket is a delivery'],
]) {
  const r = ask(q, L);
  ok(r.text.includes(must), `« ${q} » (${why}) should say ${must} → {${r.route}} ${r.text.slice(0, 140)}`);
}
for (const [q, L] of [["Who's on shift today?", 'en'], ['Until what time is my cafe open today?', 'en'], ['C’est qui qui travaille au cafe ajd', 'fr'], ['le plat le plus vendu cette semaine', 'fr']]) {
  const r = ask(q, L);
  ok(!/Nothing called|Rien ne s’appelle/.test(r.text), `« ${q} » is not a dish the menu lacks → ${r.text.slice(0, 100)}`);
}
ok(/^revenue/.test(ask('bghit résumé dyal caisse had chhar', 'fr').route), 'Darija month till → the month card, not « not understood »');
ok(/^(?:llm|feature)\b/.test(ask('بغيت نطبع جوج نسخ ديال التيكي', 'ar').route), 'a Darija how-to goes to the guide or the model');
ok(/^price/.test(ask('بغيت نزيد فالثمن ب ١٠ فالمية', 'ar').route), 'a Darija price rise stays a simulation');

// Round three (27 Nov): a refusal only answers what it refuses. « mon snack »
// is the merchant's own shop; a supplier's price rise is not a sales trend;
// one period with no comparison is not « two periods ».
for (const [q, L, not] of [
  ['Est-ce que mon snack peut fermer une heure plus tôt sans perdre trop de ventes ?', 'fr', /^othershop/],
  ['Mon fournisseur a augmenté le prix de la farine de 12%, je change mes prix comment ?', 'fr', /^notrend/],
  ['Which shift had the highest average bill last week?', 'en', /^notrend/],
]) { const r = ask(q, L); ok(!not.test(r.route), `« ${q} » is not refused for the wrong reason → {${r.route}} ${r.text.slice(0, 80)}`); }
for (const [q, L, want] of [
  ['ch7al ventes dyal cafe simo', 'fr', /^othershop/],
  ['Combien a fait le Café Atlas hier ?', 'fr', /^othershop/],
  ['mes ventes ont baissé, pourquoi ?', 'fr', /^notrend/],
  ['Peux-tu comparer les vendredis de ce mois avec ceux du mois dernier ?', 'fr', /^notrend/],
]) { const r = ask(q, L); ok(want.test(r.route), `« ${q} » keeps its honest refusal → {${r.route}}`); }

{
  const r = ask('وريني الملابس الشهر لي فات عفاك', 'ar');
  ok(/^lookup/.test(r.route) && r.text.includes('الملابس'), `show me clothes last month → the menu has no clothes, said for that month → {${r.route}} ${r.text.slice(0, 100)}`);
  for (const [q2, L2] of [['wrini lmbi3at chhar li fat', 'fr'], ['وريني المبيعات الشهر لي فات', 'ar'], ['show me the takings last month', 'en'], ['Show me receipts last month please', 'en'], ['Montre-moi les factures du mois dernier', 'fr']]) {
    const r2 = ask(q2, L2);
    ok(!/Rien ne s’appelle|Nothing called|ما كاين حتى حاجة سميتها/.test(r2.text), `« ${q2} » asks for the till's own records, not a missing item → ${r2.text.slice(0, 100)}`);
  }
}
// Round three (27 Nov): takings net of refunds, the day's cash and card, and
// questions about how the till counts, which are not a figure to fetch.
{
  const lastWeekNet = sum(mon - 7 * DAY, mon, (x) => x.amount);          // 370 - 50
  const r = ask('combien j’ai encaissé la semaine dernière moins les remboursements', 'fr');
  ok(has(r.text, lastWeekNet) && has(r.text, 50) && has(r.text, lastWeek), `net of refunds last week → ${lastWeek} - 50 = ${lastWeekNet} → ${r.text.slice(0, 160)}`);
  const d = ask('Chhal dkhlt lyom ila 7yedt les retours ?', 'fr');
  ok(has(d.text, sum(t0, t0 + DAY)) && !/^Aucun remboursement/.test(d.text), `today net of returns gives today's takings → ${d.text.slice(0, 120)}`);
  ok(/^day/.test(ask("Can I see yesterday's card payments separately from cash?", 'en').route), 'yesterday cash and card → the day card');
  const t = ask('Aide moi à comprendre les pourboires cette semaine', 'fr');
  ok(/10 MAD/.test(t.text), `« comprendre » is not « comprend » (includes) → ${t.text.slice(0, 100)}`);
  const rc = ask('Show me receipts last week please', 'en');
  ok(/^lookup/.test(rc.route) && has(rc.text, lastWeek), `receipts are the tickets → ${rc.text.slice(0, 100)}`);
}
for (const [q, L] of [
  ['Le total du rapport inclut-il les pourboires des serveurs ?', 'fr'],
  ['عندي زبون بغا الفاتورة باسم الشركة ديالو', 'ar'],
  ["Kayna chi différence bin chiffre d'affaires w bénéfice ?", 'fr'],
  ['What is the difference between revenue and profit?', 'en'],
]) { const r = ask(q, L); ok(/^(?:llm|feature)\b/.test(r.route), `« ${q} » asks how things work → {${r.route}} ${r.text.slice(0, 80)}`); }

// The guide card has to be the one asked about (27 Nov): a login problem is
// not « pair the till », a definition of cash flow is not « split tender ».
for (const [q, L, not, want] of [
  ['How do I add a product with two sizes and different prices?', 'en', /Payments and split|Floor plan/, /Menu, options/],
  ["J'arrive pas à me connecter depuis mon nouveau téléphone", 'fr', /Caisse adaptée au métier/, null],
  ['What is the difference between revenue and cash flow?', 'en', /Payments and split/, null],
  ['Je n’arrive pas à me connecter à mon compte', 'fr', /Inventaire|Caisse adaptée/, null],
  ['How can I track sizes and colors for shirts?', 'en', /Pickup, rack/, null],
  ['Can I see which items sell best at breakfast?', 'en', /Menu, options/, null],
]) {
  const r = ask(q, L);
  ok(!not.test(r.text) && (!want || want.test(r.text)), `« ${q} » gets the right guide card or none → {${r.route}} ${r.text.slice(0, 90)}`);
}

// With no costs entered, the card says what it cannot answer, then why
// (27 Nov): the same paragraph used to come back for nine different questions.
for (const [q, L, lead] of [
  ['My café was packed but where did all the profit go?', 'en', /where your profit goes/],
  ['فين مشاو الفلوس ديال المصاريف الصغيرة؟', 'ar', /المصاريف ديالك/],
  ['je peux me permettre un four à 20000 dh ?', 'fr', /permettre/],
]) {
  const r = ask(q, L);
  ok(lead.test(r.text) && !/rather simulate nothing|plutôt que d'inventer|أفضّل ألّا أحاكي/.test(r.text), `« ${q} » names what it cannot answer yet → {${r.route}} ${r.text.slice(0, 110)}`);
}

// 2. Not a single period: the honest refusal, or the route that owns it.
for (const [q, L] of [
  ['compare les ventes de cette semaine avec la semaine dernière', 'fr'],
  ['pourquoi mes ventes ont baissé la semaine dernière', 'fr'],
  ['9aren lia lbi3 chhar li fat m3a had chhar', 'fr'],
]) { const r = ask(q, L); ok(/^notrend/.test(r.route), `« ${q} » compares two periods → {${r.route}}`); }
for (const [q, L, not] of [
  ['un serveur à 3000 dh par mois, je peux ?', 'fr', /^lookup/],
  ['ventes prévues à la fin du mois', 'fr', /^lookup/],
  ['What were takings on March 12?', 'en', /^lookup/],
]) { const r = ask(q, L); ok(!not.test(r.route), `« ${q} » is not a period read-back → {${r.route}}`); }
{
  const r = ask('Show me expenses last week please', 'en');
  ok(/not one I read by period/.test(r.text) && !/took/.test(r.text), `expenses last week is not the takings → ${r.text.slice(0, 120)}`);
}
// Today's and yesterday's takings stay with the day card.
ok(/^day/.test(ask("les ventes d'aujourd'hui", 'fr').route), 'today is the day card');

// 3. A question about using the till is not a figure.
for (const [q, L] of [
  ['Can I print an invoice again?', 'en'],
  ['I accidentally charged the same customer twice', 'en'],
  ['كيفاش نسجل مصروف ديال الطاكسي؟', 'ar'],
  ['J’ai noté un achat comme une vente par erreur', 'fr'],
  ['Can I set different prices for dine-in and takeaway?', 'en'],
]) {
  const r = ask(q, L);
  ok(/^(?:llm|feature)\b/.test(r.route), `« ${q} » is a how-to or a slip → {${r.route}} ${r.text.slice(0, 80)}`);
}
// Round three (27 Nov): 60 more random questions. The shape of the question
// decides, a money word only names its topic: « export my sales », « rent
// recorded twice, how do I fix it », « if I delete a product, are its old
// sales deleted » are about using the till, not a figure.
for (const [q, L] of [
  ['واش نقدر نبيع بالكريدي ونسجلو حتى يخلص؟', 'ar'],
  ["J'ai tapé 500 au lieu de 50, je corrige comment sans supprimer la vente ?", 'fr'],
  ['هل يمكن تصدير المبيعات إلى إكسل؟', 'ar'],
  ['بغيت نمسح منتوج دخلتو بالغلط واش غادي تتمسح مبيعاتو القديمة؟', 'ar'],
  ['t9ta3 internet, wach les ventes ghadi ydi3o?', 'fr'],
  ["Le client a rendu une veste sans ticket, je fais quoi dans l'appli ?", 'fr'],
  ['سجلت مصروف الكراء مرتين، كيفاش نصلحو؟', 'ar'],
  ["Mon hôtel a encaissé une avance aujourd'hui pour une chambre la semaine prochaine : je la note où ?", 'fr'],
  ['ila bghit nsdd la caisse daba wach n9dr n7ellha tani lyom', 'fr'],
  ['My barcode scanner beeps but no item appears on screen, help!', 'en'],
  ['واش نقدر نعرف شكون بدل الثمن البارح بالليل؟', 'ar'],
  ["Le livreur dit qu'il manque 40 dirhams, comment retrouver sa dernière commande ?", 'fr'],
  ['wach n9dr nkhdem b jouj dyal les caisses f nafs lma7al', 'fr'],
  ['If I delete a category, what happens to the products inside it?', 'en'],
  ['3lach ticket makaytprintach depuis ce matin', 'fr'],
  ['How do I add a product with two sizes and different prices?', 'en'],
  ['How do I change my opening hours for Ramadan?', 'en'],
  ['شنو خاصني ندير باش نفتح الكاسة الصباح؟', 'ar'],
  ['Je vends à crédit, comment noter un paiement partiel ?', 'fr'],
  ['فين نلقى الفواتير ديال الشهر لي فات؟', 'ar'],
]) {
  const r = ask(q, L);
  ok(/^(?:llm|feature)\b/.test(r.route), `« ${q} » is about using the till → {${r.route}} ${r.text.slice(0, 80)}`);
}
// ...while a question for a figure keeps its card, however it is phrased.
for (const [q, L, want] of [
  ["J'ai oublié combien j'ai vendu hier", 'fr', /^day/],
  ["combien j'ai vendu hier ?", 'fr', /^day/],
  ['what did I sell yesterday', 'en', /^day/],
  ['شحال خلصت للموظفين هاد السيمانة كاملين؟', 'ar', /^(?!llm|feature)/],
  ['Chhal dkhlt lyom ila 7yedt les retours ?', 'fr', /^(?:day|lookup|revenue)/],
  ['wach n9dr nkhdem chi serveur b 3000 dh', 'fr', /^(?:hire|afford)/],
  ['comment augmenter mes ventes ?', 'fr', /^advice/],
  ['Can I see yesterday’s sales?', 'en', /^(?:day|lookup)/],
  ['augmente mes prix de 10%', 'fr', /^price/],
  ['wach n9der nakhod credit mn lbanka', 'fr', /^(?!llm|feature)/],
  ['How do I check discounts last month in the till?', 'en', /^(?!notrend)/],
  ['ramadan arrive je fais quoi', 'fr', /^season/],
  ['شنو ندير باش نجيب الناس للمطعم؟', 'ar', /^advice/],
  ['How have sales changed over six months?', 'en', /^notrend/],
]) { const r = ask(q, L); ok(want.test(r.route), `« ${q} » keeps a figure route → {${r.route}} ${r.text.slice(0, 80)}`); }
for (const [q, L, want] of [
  ['can i afford another waiter at 3000 dh', 'en', /^(?:hire|afford)/],
  ['wach n9der nzid serveur?', 'fr', /^hire/],
  ['comment augmenter mes ventes', 'fr', /^advice/],
]) { const r = ask(q, L); ok(want.test(r.route), `« ${q} » keeps its route → {${r.route}}`); }

console.log(`✓ agent period: ${n} checks (one period read back, two periods refused, how-tos left to the guide)`);
