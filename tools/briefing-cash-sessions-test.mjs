import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;
function ok(value, label) { checks++; if (!value) throw new Error('cash briefing: ' + label); }
function source(file) { return fs.readFileSync(path.join(ROOT, file), 'utf8'); }

const listeners = {};
const context = {
  console, Date, Math, JSON, Number, String, Array, Object, Promise,
  localStorage: { getItem() { return null; }, setItem() {} },
  document: { readyState: 'loading', documentElement: { lang: 'fr' }, addEventListener(name, fn) { listeners[name] = fn; }, querySelector() { return null; } },
  window: {
    KiwiEnv: { isReal: () => true }, KiwiAgentTier: () => 'owner',
    KiwiCloudDoc: { currentSlug: () => 'venue-a' }, addEventListener() {},
  }
};
context.window.window = context.window;
context.window.document = context.document;
vm.runInNewContext(source('assets/briefing.js'), context, { filename: 'assets/briefing.js' });
const B = context.window.KiwiBriefing._test;
const day = '2026-08-20';
const at = Date.UTC(2026, 7, 20, 10, 0, 0);
const row = (gap, merchant = 'venue-a', type = 'close') => ({ merchant, event_type: type, opened_ts: at, gap_cents: gap });
const dayOf = () => day;

let line = B.cashGapRule({ ready: true, merchant: 'venue-a', day, businessDay: dayOf, events: [row(10000)] });
ok(line && line.kind === 'cash-gap', 'emits at exact 100 MAD threshold');
ok(line.copy.fr.includes('100.00 MAD'), 'line exposes measured gap');
ok(line.copy.fr.includes('seuil visible 100.00 MAD'), 'line exposes threshold');
ok(line.evidence.count === 1, 'evidence count');
ok(line.evidence.window === day, 'evidence window');
ok(line.evidence.source.includes('cash_session_events'), 'evidence source');
ok(line.roles.length === 1 && line.roles[0] === 'owner', 'owner only');
ok(B.visibleLines([line], 'owner').length === 1, 'owner sees line');
ok(B.visibleLines([line], 'manager').length === 0, 'manager filtered');
ok(B.visibleLines([line], 'staff').length === 0, 'staff filtered');
ok(B.cashGapRule({ ready: true, merchant: 'venue-a', day, businessDay: dayOf, events: [row(9999)] }) === null, 'below threshold suppressed');
ok(B.cashGapRule({ ready: false, merchant: 'venue-a', day, businessDay: dayOf, events: [row(50000)] }) === null, 'unfinished read suppressed');
ok(B.cashGapRule({ ready: true, merchant: 'venue-a', day, businessDay: dayOf, events: [] }) === null, 'empty evidence suppressed');
ok(B.cashGapRule({ ready: true, merchant: 'venue-a', day, businessDay: dayOf, events: [row(50000, 'venue-b')] }) === null, 'venue isolation');
ok(B.cashGapRule({ ready: true, merchant: 'venue-a', day, businessDay: () => '2026-08-19', events: [row(50000)] }) === null, 'other business day suppressed');
ok(B.normalizeLine({ id: 'bad', roles: ['owner'], copy: { fr: 'x' } }) === null, 'no line without evidence');
const beforeFive = new Date(2026, 7, 21, 4, 59).getTime();
const atFive = new Date(2026, 7, 21, 5, 0).getTime();
ok(B.businessDay(beforeFive) === '2026-08-20', '5 h boundary before cutoff');
ok(B.businessDay(atFive) === '2026-08-21', '5 h boundary at cutoff');

const api = source('functions/api/cash-sessions.js');
ok(api.includes('merchant = ? AND terminal_id = ? AND session_id = ?'), 'till read asserts tenant terminal session');
ok(api.includes('isTillFor(request, env, merchant)'), 'merchant proof required');
ok(api.includes('isTerminalFor(request, env, merchant, terminalId)'), 'terminal proof required');
ok(api.includes('!readCookie(request, TERMINAL_COOKIE)'), 'legacy till bootstraps only without existing terminal proof');
ok(api.includes('bootstrapTerminal = true'), 'legacy paired till gains terminal proof');
ok(api.includes("error: 'write-refused'"), 'non-editor write refused');
ok(api.includes('redacted: true, events: []'), 'unauthorized read redacted');
ok(api.includes('INSERT OR IGNORE INTO cash_session_events'), 'retry is idempotent append');
ok(!api.includes('UPDATE cash_session_events') && !api.includes('DELETE FROM cash_session_events'), 'no mutation route');
ok(api.includes("/^\\d{4}$/.test(id)"), 'four digit credential cannot be actor');
ok(api.includes("eventType !== 'open'"), 'events require durable open');
ok(api.includes("event_type = 'open'"), 'open checked in same session');

const auth = source('functions/auth/_lib.js');
ok(auth.includes("'kiwi-terminal-v1:'"), 'terminal token domain-separated');
ok(auth.includes('HttpOnly; Secure; SameSite=Lax'), 'terminal cookie protected');
const redeem = source('functions/api/pair/redeem.js');
ok(redeem.includes('terminalCookie(await terminalToken'), 'pairing issues terminal proof');
const pairClient = source('assets/caisse-pairing.js');
ok(pairClient.includes('terminalId: terminalId()'), 'caisse supplies stable terminal id');

const transport = source('assets/cash-sessions.js');
ok(transport.includes('writeOutbox(rows); flush(); return true'), 'emit queues before transport');
ok(transport.includes(".catch(function () {})"), 'transport fails soft');
ok(transport.includes('slice(-200)'), 'outbox bounded');
ok(transport.includes("credentials: 'same-origin'"), 'signed cookies sent');
const caisse = source('kiwi-caisse.html');
for (const type of ['open', 'movement', 'handover', 'close']) ok(caisse.includes("eventType: '" + type + "'"), type + ' emitted');
ok(caisse.includes("movementReason: 'Ouverture sans vente'"), 'no-sale drawer opening motivated');
ok(caisse.includes('counterpartyActorId:'), 'handover actors recorded');
ok(caisse.includes('counterpartyActorId: cashActorRef(inc.id)'), 'incoming handover actor stays distinct');

const schema = source('schema.sql');
ok(schema.includes('CREATE TABLE IF NOT EXISTS cash_session_events'), 'additive schema mirrored');
ok(schema.includes('idx_cash_session_events_terminal_session'), 'terminal session index');
const audit = source('docs/audits/AUDIT_AI.md');
ok(audit.includes('Phase 1d-c · registre append-only'), 'audit contract recorded');
ok(audit.includes('Une caisse appairée ne peut lire et'), 'terminal assertion documented');

console.log('briefing cash sessions: ' + checks + ' controls');
