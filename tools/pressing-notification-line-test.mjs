#!/usr/bin/env node
/* pressing-notification-line-test · « client prévenu » se lit partout pareil.
 *
 * Décision de la vague Q (26 oct. 2026) : « prévenu » veut dire qu'un membre de
 * l'équipe a marqué le client comme informé, avec qui, quand et par quel canal ;
 * Kiwi n'affirme ni envoi ni lecture. Le tableau de bord (liste du rack) et la
 * caisse (rack, retrait) affichaient pourtant un instant ISO brut ou un « notifié »
 * sans auteur ni canal. Ici le vrai pressing-ops.js et le vrai tableau de bord
 * tournent dans un `vm` ; les écrans de la caisse sont des modules ES liés à toute
 * la page, on les épingle sur la source et on exécute la phrase partagée. */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
let pass = 0; const fails = [];
const ok = (cond, label) => { if (cond) pass++; else fails.push(label); };

function world(lang) {
  const ls = new Map();
  const pages = [];
  const nowMs = Date.parse('2026-10-11T15:00:00Z');
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length) super(...a); else super(nowMs); }
    static now() { return nowMs; }
  }
  const sb = {
    console, Intl, JSON, Math, Set, Map, Promise, Object, Array, Number, String, Date: FakeDate, setTimeout, clearTimeout,
    setInterval() { return 1; }, clearInterval() {}, requestAnimationFrame: (fn) => fn(),
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    localStorage: { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: (k) => { ls.delete(k); } },
    sessionStorage: { setItem() {}, getItem() { return null; } },
    document: { readyState: 'complete', visibilityState: 'visible', documentElement: { lang }, body: { classList: { remove() {} } }, querySelector() { return null; }, addEventListener() {} },
    confirm: () => true, fetch: async () => ({ ok: true, json: async () => ({}) }),
    KiwiVenue: { getCurrentVenueData: () => ({ slug: 'press-test', subtype: 'pressing', name: 'Press Test' }), getVenue: () => 'press-test', subscribe() {} },
    KiwiI18n: { getLang: () => lang },
    KiwiDayReport: { timezone: () => 'Africa/Casablanca' },
    KiwiSales: { totals: () => ({ revenue: 0 }) },
    KiwiDateRange: { bounds: () => [0, Infinity] },
    Kiwi: { appPage: (nav, page) => { pages.push({ nav, ...page }); }, toast() {} },
  };
  sb.window = sb;
  sb.addEventListener = () => {};
  vm.createContext(sb);
  vm.runInContext(read('assets/pressing-ops.js'), sb);
  vm.runInContext(read('assets/pressing-dashboard.js'), sb);
  return { sb, pages };
}
const raw = (id, over = {}) => ({
  id, droppedAt: '2026-10-10T09:30:00Z', readyAt: '2026-10-10T16:00:00Z', total: 100,
  pay: { mode: 'pickup', method: null, paid: 0 },
  pieces: [{ pid: id + '-1', label: 'Chemise', itemId: 'chemise', status: 'pret', svcs: ['lavage'] }],
  customer: { name: 'Amal', phone: '0600000000' }, ...over,
});
const pickupBody = (lang, orders) => {
  const w = world(lang);
  w.sb.KiwiPressingOps.replace(orders, { customer: (o) => o.customer, total: (o) => o.total }, 'press-test');
  w.sb.KiwiPressingDashboard.showPage('pressing-pickup');
  const page = w.pages.find((p) => p.nav === 'pressing-pickup');
  return page ? page.body : '';
};
const notified = raw('3001', { notified: true, notification: { by: { id: 's1', name: 'Salma' }, channel: 'whatsapp', at: '2026-10-11T13:05:00.000Z' } });
const legacy = raw('3002', { notified: true });

/* 1 · le tableau de bord : qui, quand (heure du magasin), canal, jamais l'ISO brut */
for (const [lang, marked, channel] of [['fr', 'Marqué prévenu', 'Par WhatsApp'], ['en', 'Marked notified', 'By WhatsApp'], ['ar', 'تم وضع علامة تم الإبلاغ', 'عبر واتساب']]) {
  const body = pickupBody(lang, [notified, legacy]);
  const row = (body.match(/<div class="pxd-rack-row">.*?3001.*?<\/span><\/div>/) || [''])[0];
  ok(body.length > 0 && row.includes(marked) && row.includes('Salma') && row.includes(channel), `${lang}: le rack du tableau de bord nomme l'auteur et le canal`);
  ok(/14:05/.test(row), `${lang}: l'heure est celle du magasin (14:05, pas 13:05Z)`);
  ok(!/2026-10-11T13:05/.test(body) && !/T13:05:00/.test(body), `${lang}: aucun instant ISO brut dans la page`);
}
{
  const body = pickupBody('fr', [legacy]);
  const row = (body.match(/<div class="pxd-rack-row">.*?3002.*?<\/span><\/div>/) || [''])[0];
  ok(/Marqué prévenu/.test(row) && !/undefined|null/.test(row), 'un ancien drapeau sans auteur dit seulement « marqué prévenu »');
}

/* 2 · la phrase partagée de la caisse (rack, retrait, atelier) */
{
  const w = world('fr');
  const ops = w.sb.KiwiPressingOps;
  const tillFmt = (iso) => `fmt(${iso})`;
  const line = ops.notificationLine(notified, { tr: (s) => `[${s}]`, fmt: tillFmt });
  ok(line === '[Marqué prévenu] · Salma · fmt(2026-10-11T13:05:00.000Z) · [Par WhatsApp]', 'la phrase suit l\'ordre qui, quand, canal et passe chaque libellé par tr');
  ok(ops.notificationLine(legacy) === 'Marqué prévenu', 'sans auteur ni heure, la phrase ne les invente pas');
  ok(ops.notificationLine(raw('3003')) === '', 'une commande non prévenue n\'a pas de phrase');
  for (const [channel, label] of [['call', 'Appel'], ['sms', 'Par SMS'], ['in-person', 'En personne']]) {
    ok(ops.notificationLine(raw('3004', { notified: true, notification: { by: { name: 'Karim' }, channel, at: '2026-10-11T08:00:00Z' } })).endsWith(label), `canal ${channel} : ${label}`);
  }
}

/* 3 · les écrans de la caisse passent par cette phrase */
{
  const rack = read('assets/pressing/rack.js'), pickup = read('assets/pressing/pickup.js'), custody = read('assets/pressing/custody.js');
  ok(/notifyLine\(o\)/.test(rack) && !/client notifié/.test(rack), 'le rack de la caisse affiche la phrase partagée, plus « client notifié »');
  ok(/notifyLine\(o\)/.test(pickup) && !/' · notifié'/.test(pickup), 'le retrait de la caisse affiche la phrase partagée, plus « notifié » nu');
  ok(/notifyLine = \(o\) => window\.KiwiPressingOps\.notificationLine\(o, \{[^}]*fmt: fmtDT/.test(custody) && /rackContext\(\)[^\n]*notifyLine/.test(custody) && /pickupContext\(\)[^\n]*notifyLine/.test(custody), 'custody.js donne notifyLine, à l\'heure du magasin, aux deux écrans');
}

if (fails.length) { console.error(fails.map((f) => '✗ ' + f).join('\n')); process.exit(1); }
console.log(`pressing-notification-line-test: ${pass} assertions OK`);
