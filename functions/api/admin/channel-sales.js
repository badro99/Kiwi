/* POST /api/admin/channel-sales · reprendre l'historique des ventes d'une boutique en ligne.
 *
 * Owner, 24 nov. 2026 (CHICTRATEC SL, la boutique Shopify Startoner) : après le
 * catalogue, « sales as well ». Le stock a été importé tel qu'il est AUJOURD'HUI,
 * donc les commandes passées en sont déjà sorties : elles entrent dans les livres
 * comme ventes, à leur date, et ne touchent jamais au stock. C'est pour ça que ce
 * n'est pas le rejeu des commandes (_replay-orders.js), qui écrit des mouvements.
 *
 * Un opérateur NOMMÉ seulement (le geste écrit dans les livres d'un commerçant).
 * Chaque commande devient une vente dont l'id dérive du commerce et du numéro de
 * commande : renvoyer le même lot n'ajoute rien. Une commande illisible est
 * refusée avec sa raison, les autres passent. Une ligne d'audit par import. */
import { isOperator, isSeniorOperator, json, operatorActor } from '../../auth/_lib.js';

const CHANNELS = new Set(['shopify']);
const METHODS = new Set(['cash', 'card', 'transfer', 'cheque', 'tap', 'qr', 'wallet']);
const MAX_ORDERS = 500;
const MAX_CENTS = 100000000;
const FLOOR_TS = Date.UTC(2020, 0, 1);

function cleanLines(lines) {
  if (!Array.isArray(lines)) return [];
  return lines.slice(0, 40).map((l) => ({
    n: String((l && l.n) || '').slice(0, 80),
    q: Number.isFinite(Number(l && l.q)) ? Number(l.q) : 1,
    t: Number.isFinite(Number(l && l.t)) ? Math.round(Number(l.t) * 100) / 100 : 0,
  })).filter((l) => l.n);
}

function checkOrder(o, now) {
  const ref = String((o && o.ref) || '').trim().slice(0, 64);
  if (!ref) return { reason: 'ref' };
  const ts = Number(o.ts);
  if (!Number.isFinite(ts) || ts < FLOOR_TS || ts > now + 86400e3) return { ref, reason: 'date' };
  const cents = Number(o.totalCents);
  if (!Number.isInteger(cents) || cents < 0 || cents > MAX_CENTS) return { ref, reason: 'amount' };
  const method = String(o.method || '');
  if (!METHODS.has(method)) return { ref, reason: 'method' };
  return { ok: { ref, ts, cents, method, lines: cleanLines(o.lines) } };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!(await isOperator(request, env))) return json({ error: 'forbidden' }, 403);
  if (!env.DB) return json({ error: 'no-db' }, 503);
  if (!(await isSeniorOperator(request, env))) return json({ error: 'operator-code-required' }, 403);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = String((body && body.merchant) || '').trim().slice(0, 80);
  const channel = String((body && body.channel) || '').trim();
  const orders = body && body.orders;
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  if (!CHANNELS.has(channel)) return json({ error: 'channel-unsupported', choices: [...CHANNELS] }, 400);
  if (!Array.isArray(orders)) return json({ error: 'orders-required' }, 400);
  if (orders.length > MAX_ORDERS) return json({ error: 'too-many-orders', max: MAX_ORDERS }, 413);
  let row;
  try { row = await env.DB.prepare('SELECT merchant FROM merchant_config WHERE merchant = ?').bind(merchant).first(); }
  catch (_) { return json({ error: 'sales-unavailable' }, 503); }
  if (!row) return json({ error: 'not-found' }, 404);

  const now = Date.now(), refused = [], good = [], seen = new Set();
  for (const o of orders) {
    const r = checkOrder(o, now);
    if (!r.ok) { refused.push({ ref: r.ref || '', reason: r.reason }); continue; }
    if (seen.has(r.ok.ref)) continue;
    seen.add(r.ok.ref);
    good.push(r.ok);
  }
  const prefix = channel === 'shopify' ? 'shp' : channel;
  const name = channel === 'shopify' ? 'Shopify' : channel;
  const idOf = (o) => prefix + ':' + merchant + ':' + o.ref.replace(/[^A-Za-z0-9_-]/g, '');
  /* Count from the books, not from meta.changes: D1 adds the rows the sales
   * triggers write (sales_change_insert), so one sale reads as two changes. */
  const author = 'import:' + channel;
  const known = async (ids) => {
    const out = new Map();
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      const res = await env.DB.prepare(`SELECT id, lines, written_by FROM sales WHERE merchant = ? AND id IN (${part.map(() => '?').join(',')})`).bind(merchant, ...part).all();
      for (const row of (res && res.results) || []) out.set(row.id, row);
    }
    return out;
  };
  const ids = good.map(idOf);
  let existing = 0, inserted = 0, refreshed = 0;
  try {
    const before = await known(ids);
    const stmts = [];
    good.forEach((o, i) => {
      const lines = JSON.stringify(o.lines), row = before.get(ids[i]);
      /* Already in the books: a new import may refresh the detail of a sale it
       * wrote itself (a shipping line taken out, a refunded item), never its
       * amount, and never a sale someone else wrote. */
      if (row) {
        if (row.written_by === author && row.lines !== lines) {
          stmts.push(env.DB.prepare('UPDATE sales SET lines = ? WHERE merchant = ? AND id = ? AND written_by = ?').bind(lines, merchant, ids[i], author));
          refreshed++;
        }
        return;
      }
      stmts.push(env.DB.prepare(`INSERT INTO sales (id, merchant, amount, amount_cents, method, label, ref, ts, lines, channel, received_ts, written_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`)
        .bind(ids[i], merchant, Math.round(o.cents / 100), o.cents, o.method,
          (name + ' ' + o.ref).slice(0, 80), o.ref, o.ts, lines, channel, now, author));
    });
    existing = before.size;
    if (stmts.length) await env.DB.batch(stmts);
    inserted = (await known(ids)).size - existing;
  } catch (_) { return json({ error: 'sales-unavailable' }, 503); }
  const actor = await operatorActor(request, env);
  try {
    await env.DB.prepare(`INSERT INTO account_audit (account_id, merchant, action, prev, next, reason, actor, actor_id, detail, ts)
      VALUES ('', ?, 'channel-sales-import', '', ?, '', ?, ?, ?, ?)`)
      .bind(merchant, channel, actor.label, actor.id, JSON.stringify({ channel, inserted, existing, refreshed, refused: refused.length }), now).run();
  } catch (_) { /* the sales are written; a missing trace line must not hide that */ }
  return json({ ok: true, merchant, channel, inserted, existing, refreshed, refused });
}
