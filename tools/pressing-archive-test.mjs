#!/usr/bin/env node
/* pressing-archive-test · les bons remis depuis plus de 90 jours quittent le document vivant.
 *
 * pressing-orders est un seul document (1,5 Mo) et le serveur refuse de laisser
 * partir un bon non annulé : les bons remis s'empilaient jusqu'au 413 qui arrête
 * la synchronisation. Par la vraie route /api/store sur D1 en mémoire : un bon
 * entièrement remis depuis plus de 90 jours passe dans une ligne d'archive
 * hebdomadaire (jamais effacé), un bon ouvert, annulé ou récent ne bouge jamais,
 * une panne d'archive laisse le bon dans le document vivant. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { onRequestPost as storePost } from '../functions/api/store.js';
import { isArchivable, archiveFeature, ARCHIVE_PREFIX, ARCHIVE_AFTER_MS } from '../functions/api/_pressing-archive.js';
import { tillToken } from '../functions/auth/_lib.js';

let controls = 0;
const ok = (c, m) => { assert.ok(c, m); controls += 1; };
const DAY = 86400000;
const now = Date.now();
const iso = (ageDays) => new Date(now - ageDays * DAY).toISOString();

const secret = 'press-archive-secret-32-chars-long!';
function fresh(merchant) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(new URL('../schema.sql', import.meta.url), 'utf8'));
  db.prepare('INSERT INTO merchant_config (merchant,features,plan,type,status,name,updated_ts) VALUES (?,?,?,?,?,?,?)')
    .run(merchant, '{}', 'pro', 'pressing', 'active', 'Press Archive', now);
  const d1 = { prepare(sql) { let a = []; const q = { bind(...v) { a = v; return q; },
    first() { return db.prepare(sql).get(...a) || null; }, all() { return { results: db.prepare(sql).all(...a) }; },
    run() { const r = db.prepare(sql).run(...a); return { meta: { changes: r.changes } }; } }; return q; },
    async batch(list) { return Promise.all(list.map((s) => s.run())); } };
  return { db, env: { DB: d1, AUTH_SECRET: secret } };
}
const delivered = (id, ageDays, extra = {}) => ({ id, lines: [{ itemId: 'chemise', qty: 1 }], pieces: [{ pid: id + '-1', status: 'livre' }],
  droppedAt: iso(ageDays + 3), readyAt: iso(ageDays + 1), collectedAt: iso(ageDays), updatedAt: now - ageDays * DAY, rack: null,
  pay: { mode: 'now', method: 'carte', paid: 40 }, total: 40, ...extra });
const open = (id, ageDays, extra = {}) => ({ id, lines: [{ itemId: 'robe', qty: 1 }], pieces: [{ pid: id + '-1', status: 'pret' }],
  droppedAt: iso(ageDays), readyAt: iso(ageDays - 1), rack: 'A-' + id.replace(/\D/g, '').padStart(2, '0'), updatedAt: now - ageDays * DAY,
  pay: { mode: 'pickup', paid: 0 }, total: 60, ...extra });

async function setup(merchant, orders, cancellations = []) {
  const { db, env } = fresh(merchant);
  db.prepare('INSERT INTO store_docs (merchant,feature,data,rev,updated_ts) VALUES (?,?,?,?,?)')
    .run(merchant, 'pressing-orders', JSON.stringify({ customers: [], orders, cancellations, seq: 100 }), 5, now);
  const cookie = `kiwi_till=${await tillToken(secret, merchant)}`;
  const live = () => JSON.parse(db.prepare("SELECT data FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).data);
  const rev = () => db.prepare("SELECT rev FROM store_docs WHERE merchant=? AND feature='pressing-orders'").get(merchant).rev;
  const archived = () => db.prepare('SELECT feature, data FROM store_docs WHERE merchant=? AND feature LIKE ?').all(merchant, ARCHIVE_PREFIX + '%')
    .flatMap((r) => JSON.parse(r.data).orders);
  const push = async (list, extra = {}) => {
    const res = await storePost({ env, request: new Request('https://kiwi.test/api/store', { method: 'POST',
      headers: { Cookie: cookie, 'Content-Type': 'application/json' },
      body: JSON.stringify({ feature: 'pressing-orders', merchant, baseRev: rev(), data: { customers: [], orders: list, seq: 100, ...extra } }) }) });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  };
  return { db, env, live, archived, push, rev };
}

/* 1. La règle. */
{
  ok(ARCHIVE_AFTER_MS === 90 * DAY, 'âge : 90 jours');
  ok(isArchivable(delivered('D', 100), now), 'remis depuis 100 jours : archivable');
  ok(!isArchivable(delivered('D', 89), now), 'remis depuis 89 jours : non');
  ok(!isArchivable(open('O', 200), now), 'une pièce non remise : jamais, même ancien');
  ok(!isArchivable(delivered('C', 100, { cancelledAt: iso(100) }), now), 'annulé : preuve de garde, jamais archivé');
  ok(!isArchivable(delivered('R', 100, { refundDue: 20 }), now), 'remboursement dû : non');
  ok(!isArchivable(delivered('N', 100, { collectedAt: null }), now), 'sans date de remise : non');
  ok(!isArchivable({ id: 'X', pieces: [], collectedAt: iso(100), updatedAt: now - 100 * DAY }, now), 'sans pièce : non');
  ok(!isArchivable(delivered('F', 100, { updatedAt: now + DAY }), now), 'daté du futur : non');
  ok(archiveFeature(delivered('D', 100)).startsWith(ARCHIVE_PREFIX + 'w'), 'une ligne d\'archive par semaine');
}

/* 2. La route : archivage, conservation, rejeu. */
{
  const t = await setup('press-arch-1', [delivered('D1', 100), delivered('D2', 400), delivered('R1', 10), open('O1', 200)]);
  const r = await t.push([...t.live().orders, open('N1', 0, { rack: 'B-01' })]);
  ok(r.status === 200, 'la sauvegarde passe');
  const ids = t.live().orders.map((o) => o.id).sort();
  ok(JSON.stringify(ids) === JSON.stringify(['N1', 'O1', 'R1']), 'le document vivant garde le récent, l\'ouvert et le nouveau');
  const arch = t.archived();
  ok(arch.length === 2 && arch.map((o) => o.id).sort().join() === 'D1,D2', 'les deux bons anciens sont dans l\'archive, entiers');
  ok(arch.find((o) => o.id === 'D1').pay.paid === 40 && arch.find((o) => o.id === 'D1').collectedAt, 'avec leurs montants et leur date de remise');
  const rows = t.db.prepare('SELECT COUNT(*) AS n FROM store_docs WHERE merchant=? AND feature LIKE ?').get('press-arch-1', ARCHIVE_PREFIX + '%').n;
  ok(rows === 2, 'D1 (100 j) et D2 (400 j) tombent dans deux semaines distinctes');

  // Une caisse qui garde D1 en local le renvoie : sans effet sur l'archive, retiré du vivant.
  const again = await t.push([...t.live().orders, delivered('D1', 100)]);
  ok(again.status === 200 && !t.live().orders.some((o) => o.id === 'D1'), 'rejoué par une caisse en retard : retiré du vivant');
  ok(t.archived().filter((o) => o.id === 'D1').length === 1, 'et jamais dupliqué dans l\'archive');
  // Un appareil à jour qui ne l'envoie plus n'est pas refusé.
  const clean = await t.push(t.live().orders);
  ok(clean.status === 200, 'un appareil à jour sans D1 n\'est pas refusé (aucun conflit de rétention)');
}

/* 3. Un bon annulé reste dans le document (preuve de garde), un ouvert aussi. */
{
  const cancelled = delivered('C1', 120, { cancelledAt: iso(120), cancelledBy: { id: 'm1', name: 'Gérant', role: 'owner' } });
  const t = await setup('press-arch-2', [cancelled, open('O2', 150)], [{ id: 'C1', cancelledAt: cancelled.cancelledAt, cancelledBy: cancelled.cancelledBy }]);
  const r = await t.push(t.live().orders);
  ok(r.status === 200 && t.live().orders.length === 2 && t.archived().length === 0, 'annulé et ouvert restent, rien n\'est archivé');
}

/* 4. Une archive qui ne s'écrit pas laisse le bon dans le document vivant. */
{
  const t = await setup('press-arch-3', [delivered('D3', 100)]);
  t.db.exec(`CREATE TRIGGER refuse_archive BEFORE INSERT ON store_docs WHEN NEW.feature LIKE '${ARCHIVE_PREFIX}%' BEGIN SELECT RAISE(ABORT, 'disk full'); END`);
  const r = await t.push(t.live().orders);
  ok(r.status === 200 && t.live().orders.some((o) => o.id === 'D3') && t.archived().length === 0, 'archive impossible : le bon reste dans le document vivant, rien n\'est perdu');
  t.db.exec('DROP TRIGGER refuse_archive');
  const second = await t.push(t.live().orders);
  ok(second.status === 200, 'tout archiver ne se prend pas pour un envoi vide');
  ok(!t.live().orders.some((o) => o.id === 'D3') && t.archived().some((o) => o.id === 'D3'), 'à la sauvegarde suivante il est archivé puis retiré');
}

/* 5. Le blocage d'origine : un document plein de bons remis refusait tout (413). */
{
  const pad = 'x'.repeat(700);
  const many = Array.from({ length: 1700 }, (_, i) => delivered('H' + i, 95 + (i % 60), { customerNote: pad }));
  const t = await setup('press-arch-4', many);
  const size = JSON.stringify(t.live()).length;
  ok(size > 1500000, 'le document seed dépasse déjà le plafond de 1,5 Mo (' + size + ' octets)');
  const r = await t.push([...t.live().orders, open('N9', 0, { rack: 'C-01' })]);
  ok(r.status === 200, 'la sauvegarde qui aurait fini en 413 passe');
  ok(t.live().orders.length === 1 && t.live().orders[0].id === 'N9', 'le vivant ne garde que le bon ouvert');
  ok(t.archived().length === 1700, 'les 1700 bons sont tous dans l\'archive');
  const max = Math.max(...t.db.prepare('SELECT length(data) AS n FROM store_docs WHERE merchant=? AND feature LIKE ?').all('press-arch-4', ARCHIVE_PREFIX + '%').map((x) => x.n));
  ok(max < 1900000, 'chaque ligne d\'archive reste sous la limite D1 de 2 Mo (' + max + ')');
}

console.log(`pressing-archive-test: ${controls} controls passed`);
