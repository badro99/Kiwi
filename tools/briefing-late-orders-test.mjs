import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
function ok(value, label) { checks++; if (!value) throw new Error('late orders: ' + label); }
function src(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }
const document = { readyState: 'loading', documentElement: { lang: 'fr' }, addEventListener() {}, querySelector() { return null; } };
const window = { KiwiEnv: { isReal: () => true }, KiwiAgentTier: () => 'owner', KiwiCloudDoc: { currentSlug: () => 'venue-a' }, addEventListener() {} };
const context = { console, Date, Math, JSON, Number, String, Array, Object, Promise, document, window, localStorage: { getItem() { return null; }, setItem() {} } };
window.window = window; window.document = document;
vm.runInNewContext(src('assets/briefing.js'), context, { filename: 'assets/briefing.js' });
const B = window.KiwiBriefing._test;
const DAY = '2026-08-20';
const currentAt = Date.UTC(2026, 7, 20, 12);
const baseAt = Date.UTC(2026, 7, 10, 12);
function order(sent, kitchenMin, serviceMin, merchant = 'venue-a') {
  const ready = sent + kitchenMin * 60000;
  return { merchant, sent_ts: sent, ready_ts: ready, served_ts: ready + serviceMin * 60000 };
}
const current = [order(currentAt, 20, 16), order(currentAt + 1000, 22, 18), order(currentAt + 2000, 24, 20)];
const baseline = Array.from({ length: 5 }, (_, i) => order(baseAt + i * 86400000, 8, 6));
const dayOf = (ts) => ts >= currentAt ? DAY : 'baseline';
let lines = B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: current.concat(baseline) });
ok(Array.isArray(lines) && lines.length === 2, 'both delayed stages emit');
ok(lines[0].copy.fr.includes('1,5× et +5 min'), 'threshold visible');
ok(lines[0].evidence.count === 3, 'current evidence count');
ok(lines[0].evidence.window.includes('baseline 28 jours (5)'), 'baseline count and window');
ok(lines[0].evidence.source === 'order_course.kitchen', 'kitchen source');
ok(lines[1].evidence.source === 'order_course.service', 'service source');
ok(lines.every((line) => line.roles.join(',') === 'owner,manager'), 'owner and manager only');
ok(B.visibleLines(lines, 'owner').length === 2, 'owner sees');
ok(B.visibleLines(lines, 'manager').length === 2, 'manager sees');
ok(B.visibleLines(lines, 'staff').length === 0, 'staff filtered');
ok(B.lateOrdersRule({ ready: false, merchant: 'venue-a', day: DAY, businessDay: dayOf, orders: current.concat(baseline) }) === null, 'unfinished source suppressed');
ok(B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: current.slice(0, 2).concat(baseline) }).length === 0, 'fewer than 3 current suppressed');
ok(B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: current.concat(baseline.slice(0, 4)) }).length === 0, 'fewer than 5 baseline suppressed');
ok(B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: current.map((x) => ({ ...x, merchant: 'venue-b' })).concat(baseline) }).length === 0, 'venue isolation');
const modest = current.map((x, i) => order(currentAt + i, 11, 9));
ok(B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: modest.concat(baseline) }).length === 0, 'threshold suppression');
const missingReady = current.map((x) => ({ merchant: x.merchant, sent_ts: x.sent_ts, ready_ts: null, served_ts: null }));
ok(B.lateOrdersRule({ ready: true, merchant: 'venue-a', day: DAY, endAt: currentAt + 86400000, businessDay: dayOf, orders: missingReady.concat(baseline) }).length === 0, 'partial milestone coverage suppressed');
ok(B.normalizeLine({ id: 'x', copy: { fr: 'x' }, roles: ['owner'] }) === null, 'no line without evidence');
ok(B.businessDay(new Date(2026, 7, 21, 4, 59).getTime()) === '2026-08-20', '5 h boundary before');
ok(B.businessDay(new Date(2026, 7, 21, 5, 0).getTime()) === '2026-08-21', '5 h boundary at');

const helper = src('functions/api/order/_course.js');
ok(helper.includes('ON CONFLICT (merchant, order_id) DO UPDATE'), 'idempotent tenant key');
for (const col of ['accepted_ts', 'sent_ts', 'ready_ts', 'served_ts', 'closed_ts']) ok(helper.includes(col + ' = COALESCE'), col + ' write once');
ok(!helper.includes('elapsed'), 'elapsed never reused');
ok(!helper.includes('customer'), 'no customer data');
const queue = src('functions/api/order/queue.js');
ok(queue.includes('context.waitUntil(safe)'), 'milestone mirror does not delay response');
ok(queue.includes('acceptedAt: now, sentAt: now'), 'accepted dispatch records both facts');
ok(queue.includes('readyAt: nextTs'), 'station-ready durable');
ok(queue.includes("status === 'served' ? { servedAt: now }"), 'served durable');
ok(queue.includes('closeOrderCourses(env'), 'closed durable');
const server = src('kiwi-serveur.html');
ok(server.includes("fetch('/api/order/queue'"), 'serveur remains emitting surface');
ok(server.includes("merchant: slug, create: true, mode: 'table'"), 'documented create payload');
const api = src('functions/api/order-course.js');
ok(api.includes('WHERE merchant = ? AND sent_ts >= ?'), 'dashboard read tenant scoped');
ok(api.includes('redacted: true'), 'unauthorized read redacted');
ok(!api.includes('onRequestPost'), 'dashboard endpoint read only');
const transport = src('assets/order-course.js');
ok(transport.includes('ready: function () { return isReady; }'), 'reader distinguishes ready from empty');
ok(transport.includes(".catch(function () { isReady = false; return []; })"), 'reader fails soft');
const schema = src('schema.sql');
ok(schema.includes('CREATE TABLE IF NOT EXISTS order_course'), 'additive schema mirrored');
ok(schema.includes('PRIMARY KEY (merchant, order_id)'), 'tenant composite key');
const audit = src('AUDIT_AI.md');
ok(audit.includes('Phase 1d-d · jalons durables'), 'audit contract recorded first');
ok(audit.includes('Aucun appel de télémétrie'), 'fail-soft contract documented');

console.log('briefing late orders: ' + checks + ' controls');
