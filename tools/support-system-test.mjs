import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { STARTER_ARTICLES, SUPPORT_WHATSAPP_PHONE, classify, ensureSupport, featureHash, seedArticles } from '../functions/api/_support.js';
import { onRequestGet as getArticles, onRequestPost as articleEvent } from '../functions/api/support/articles.js';
import { hasSignature } from '../functions/api/support/attachments.js';

let controls = 0;
function ok(value, message) { assert.ok(value, message); controls += 1; }

class D1Statement {
  constructor(db, sql) { this.db = db; this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async run() {
    const result = this.db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: Number(result.changes || 0) } };
  }
  async first() { return this.db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: this.db.prepare(this.sql).all(...this.args) }; }
}
class D1Database {
  constructor() { this.db = new DatabaseSync(':memory:'); }
  prepare(sql) { return new D1Statement(this.db, sql); }
}

const env = { DB: new D1Database() };
await ensureSupport(env);
await seedArticles(env);
await seedArticles(env);

const rows = await env.DB.prepare('SELECT * FROM support_articles ORDER BY slug').all();
ok(rows.results.length === STARTER_ARTICLES.length, 'starter guides seed idempotently');
ok(STARTER_ARTICLES.length >= 35, 'help library covers substantially more daily workflows');
ok(rows.results.every((a) => a.title_fr && a.title_en && a.title_ar), 'every starter guide has three titles');
ok(rows.results.every((a) => a.body_fr && a.body_en && a.body_ar), 'every starter guide has three complete bodies');
ok(rows.results.every((a) => a.status === 'published'), 'starter guides are immediately readable');
ok(rows.results.every((a) => a.feature_hash === featureHash(a.feature_key)), 'starter guides match current feature truth');

let response = await getArticles({ request: new Request('https://kiwi.test/api/support/articles?lang=en&type=restaurant'), env });
let payload = await response.json();
ok(response.status === 200 && payload.lang === 'en', 'public library serves the requested language');
ok(payload.articles.some((a) => a.slug === 'plan-de-salle'), 'restaurant library includes floor-plan help');
ok(!payload.articles.some((a) => a.slug === 'pressing-tarifs'), 'restaurant library excludes pressing-only help');
ok(payload.articles.some((a) => a.slug === 'impression-cuisine-automatique'), 'restaurant library covers automatic kitchen printing');

for (const type of ['boutique','pressing','pharmacie','hotel','gym','boulangerie','pizzeria','traiteur']) {
  response = await getArticles({ request: new Request(`https://kiwi.test/api/support/articles?lang=fr&type=${type}`), env });
  payload = await response.json();
  ok(payload.articles.length >= 5, `${type} receives shared and specialist guides`);
}

await env.DB.prepare("UPDATE support_articles SET feature_hash='old:0' WHERE slug='plan-de-salle'").run();
response = await getArticles({ request: new Request('https://kiwi.test/api/support/articles?type=restaurant'), env });
payload = await response.json();
ok(!payload.articles.some((a) => a.slug === 'plan-de-salle'), 'stale instructions never remain public');

const searchRequest = () => new Request('https://kiwi.test/api/support/articles', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'search', phrase: 'client@mail.test 0612345678 introuvable', lang: 'fr', store_type: 'restaurant' }),
});
response = await articleEvent({ request: searchRequest(), env });
ok(response.status === 200, 'failed searches can be recorded');
response = await articleEvent({ request: searchRequest(), env });
payload = await response.json();
ok(payload.deduplicated === true, 'identical failed searches are rate-deduplicated');
const search = await env.DB.prepare('SELECT phrase FROM support_searches LIMIT 1').first();
ok(!search.phrase.includes('@') && !search.phrase.includes('0612345678'), 'search analytics redact contact details');

response = await articleEvent({ request: new Request('https://kiwi.test/api/support/articles', {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ kind: 'feedback', article_id: rows.results[0].id, helpful: true, store_type: 'restaurant' }),
}), env });
ok(response.status === 200, 'helpfulness feedback is accepted for published guides');

ok(classify('Le paiement a été débité deux fois').priority === 'urgent', 'payment/double-charge reports auto-escalate');
ok(classify("L'imprimante Bluetooth ne répond plus").category === 'materiel', 'printer reports auto-route to hardware');
ok(classify('Comment publier le planning équipe ?').category === 'equipe', 'planning reports auto-route to team');

const png = Uint8Array.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]).buffer;
const fakePng = new TextEncoder().encode('not an image').buffer;
const pdf = new TextEncoder().encode('%PDF-1.7').buffer;
ok(hasSignature('image/png', png), 'valid PNG signature is accepted');
ok(!hasSignature('image/png', fakePng), 'MIME-spoofed PNG is rejected');
ok(hasSignature('application/pdf', pdf), 'valid PDF signature is accepted');
ok(SUPPORT_WHATSAPP_PHONE === '491722451278', 'WhatsApp support routes to the approved Kiwi number');

const help = fs.readFileSync(new URL('../assets/help-centre.js', import.meta.url), 'utf8');
const account = fs.readFileSync(new URL('../assets/account.js', import.meta.url), 'utf8');
const dashboard = fs.readFileSync(new URL('../dashboard.html', import.meta.url), 'utf8');
const admin = fs.readFileSync(new URL('../kiwi-admin.html', import.meta.url), 'utf8');
const tickets = fs.readFileSync(new URL('../functions/api/support/tickets.js', import.meta.url), 'utf8');
ok(help.includes('sent.handoff&&sent.handoff.phone'), 'WhatsApp handoff opens only a configured support destination');
ok(!help.includes("String(payload.contact).replace"), 'the client is never sent to a chat with their own number');
ok(tickets.includes('phone: SUPPORT_WHATSAPP_PHONE'), 'ticket creation always returns the approved WhatsApp destination');
ok(!account.includes('Support WhatsApp 7j/7'), 'billing no longer promises an unverified response schedule');
ok(dashboard.includes('assets/help-centre.js?v=3'), 'dashboard loads the active help client');
ok(admin.includes('assets/admin-support.js?v=2'), 'God Mode loads the support console');

console.log(`support-system-test: ${controls} controls passed`);
