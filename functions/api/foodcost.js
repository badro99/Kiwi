/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · COÛT SIMPLE — fiches de coût (option « simple_food_cost »)
 * ---------------------------------------------------------------------------
 * Une calculatrice de coût de revient, pas un inventaire : une fiche dit ce
 * qu'un plat coûte à partir des prix d'achat saisis, et ne touche jamais au
 * stock (aucun mouvement, aucune quantité en réserve).
 *
 * Qui :
 *   · LIRE et ÉCRIRE : la session du compte propriétaire de CE magasin, ou un
 *     opérateur nommé. Une caisse appairée, un employé, un visiteur du site :
 *     403. Le document `costs` est lisible par la caisse (store.js › FEATURES,
 *     voir l'audit) ; ces fiches portent des prix d'achat et des marges, elles
 *     ont donc leur propre stockage, fermé au comptoir.
 *   · L'option est OPT-IN : seul `features.simple_food_cost === true` l'allume
 *     (une clé absente veut dire « allumé » pour les autres modules, pas ici).
 *     Éteinte, l'API reste lisible et refuse toute écriture ; rien n'est effacé.
 *
 * Quoi :
 *   · foodcost_sheets     — la fiche courante, une ligne par fiche, `version`
 *     monte à chaque enregistrement. Un enregistrement envoie la version qu'il
 *     a lue (`baseVersion`) ; si quelqu'un a enregistré entre-temps : 409 avec
 *     la version en ligne, jamais d'écrasement silencieux.
 *   · foodcost_snapshots  — chaque version, telle qu'enregistrée, qui et quand.
 *     Jamais modifiée ni supprimée : c'est l'historique des coûts figés.
 *
 * Tables créées à la première utilisation (même modèle que store-credits.js) :
 * la base de production n'a pas besoin d'une migration manuelle.
 *
 *   GET  ?merchant=slug                       → { enabled, canEdit, sheets }
 *   GET  ?merchant=slug&id=ID                 → { sheet, history }
 *   GET  ?merchant=slug&id=ID&version=N       → { snapshot }
 *   POST { merchant, action:'save', sheet, baseVersion }
 *   POST { merchant, action:'duplicate', id, name?, kind? }
 *   POST { merchant, action:'archive', id, archived }
 * ═══════════════════════════════════════════════════════════════════════════ */
import {
  json, entitledMerchant, activeAccountSession, isOperator, operatorActor, maskEmail,
} from '../auth/_lib.js';

const MAX_SHEETS = 300;
const MAX_LINES = 80;
const MAX_BYTES = 32 * 1024;
const HISTORY_LIMIT = 50;

async function ensureSchema(env) {
  // Schema owned by migrations 0001–0010.
}

const str = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, n);
/* Un champ vide est INCONNU, pas zéro : null passe tel quel. */
function num(v, min, max) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < min || n > max) return null;
  return Math.round(n * 1e6) / 1e6;
}
const day = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? String(v) : '');

/* Ce qui entre dans une fiche, et rien d'autre. Le navigateur calcule ; le
 * serveur garde les saisies, bornées, pour que chaque version reste relisible. */
export function cleanSheet(input) {
  const s = input && typeof input === 'object' ? input : {};
  const lines = (Array.isArray(s.lines) ? s.lines : []).slice(0, MAX_LINES).map((l, i) => {
    const line = l && typeof l === 'object' ? l : {};
    const yieldPct = num(line.yieldPct, 1, 100);
    return {
      id: str(line.id, 40) || `l${i + 1}`,
      name: str(line.name, 120),
      type: line.type === 'packaging' ? 'packaging' : 'food',
      packPrice: num(line.packPrice, 0, 1e7),
      packQty: (() => { const q = num(line.packQty, 0, 1e7); return q && q > 0 ? q : null; })(),
      packUnit: str(line.packUnit, 20),
      useQty: num(line.useQty, 0, 1e7),
      useUnit: str(line.useUnit, 20),
      yieldPct: yieldPct == null ? 100 : yieldPct,
      priceDate: day(line.priceDate),
      supplier: str(line.supplier, 80),
    };
  });
  const portions = num(s.portions, 1, 100000);
  return {
    name: str(s.name, 120),
    kind: s.kind === 'template' ? 'template' : 'sheet',
    menuItemId: str(s.menuItemId, 64),
    menuItemName: str(s.menuItemName, 120),
    sellingPrice: num(s.sellingPrice, 0, 1e7),
    vatIncluded: s.vatIncluded === true,
    vatRate: num(s.vatRate, 0, 100),
    portions: portions == null ? 1 : Math.max(1, Math.round(portions)),
    targetPct: num(s.targetPct, 1, 100),
    note: str(s.note, 1000),
    lines,
  };
}

/* Le magasin, son option, son statut. Aucune ligne = option éteinte. */
async function storeState(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT features, status FROM merchant_config WHERE merchant = ?').bind(merchant).first();
    let features = {};
    try { features = JSON.parse((row && row.features) || '{}') || {}; } catch (_) { features = {}; }
    return { enabled: features.simple_food_cost === true, suspended: String((row && row.status) || '').toLowerCase() === 'suspended' };
  } catch (_) {
    return { enabled: false, suspended: false };
  }
}

/* Le propriétaire de CE magasin, ou un opérateur nommé. Rien d'autre.
 * Sans AUTH_SECRET (serveur local sans secrets), la porte est inerte comme
 * partout ailleurs (entitledMerchant). */
export async function foodCostActor(request, env, merchant) {
  if (!merchant) return null;
  if (!env || !env.AUTH_SECRET) return { kind: 'local', label: 'local' };
  try {
    if (await isOperator(request, env)) {
      const a = await operatorActor(request, env);
      return { kind: 'operator', label: `Opérateur · ${a.label}` };
    }
  } catch (_) {}
  try {
    const sess = await activeAccountSession(request, env);
    if (!sess || !sess.aid) return null;
    if ((await entitledMerchant(request, env, merchant)) !== merchant) return null;
    const acc = await env.DB.prepare('SELECT email FROM accounts WHERE id = ?').bind(sess.aid).first();
    const mail = acc && acc.email ? maskEmail(acc.email) : '';
    return { kind: 'owner', label: mail ? `Propriétaire · ${mail}` : 'Propriétaire' };
  } catch (_) {
    return null;
  }
}

const parse = (s) => { try { return JSON.parse(s); } catch (_) { return null; } };
const rowOut = (r) => ({
  id: r.id, name: r.name, kind: r.kind, version: Number(r.version) || 0, archived: !!r.archived,
  createdTs: Number(r.created_ts) || 0, updatedTs: Number(r.updated_ts) || 0, updatedBy: r.updated_by || '',
  data: parse(r.data) || cleanSheet({}),
});

function newId() {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return 'fc-' + [...a].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const noStore = { 'Cache-Control': 'no-store' };

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const merchant = str(url.searchParams.get('merchant'), 64);
  if (!env || !env.DB) return json({ error: 'storage' }, 503, noStore);
  const actor = await foodCostActor(request, env, merchant);
  if (!actor) return json({ error: 'forbidden' }, 403, noStore);
  const state = await storeState(env, merchant);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'storage' }, 503, noStore); }
  const id = str(url.searchParams.get('id'), 40);
  try {
    if (id) {
      const row = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
      if (!row) return json({ error: 'not-found' }, 404, noStore);
      const version = url.searchParams.get('version');
      if (version != null && version !== '') {
        const snap = await env.DB.prepare('SELECT * FROM foodcost_snapshots WHERE merchant = ? AND sheet_id = ? AND version = ?')
          .bind(merchant, id, Math.round(Number(version)) || 0).first();
        if (!snap) return json({ error: 'not-found' }, 404, noStore);
        return json({ snapshot: { version: Number(snap.version), name: snap.name, actor: snap.actor, actorKind: snap.actor_kind, ts: Number(snap.ts), data: parse(snap.data) } }, 200, noStore);
      }
      const hist = await env.DB.prepare('SELECT version, name, actor, actor_kind, ts FROM foodcost_snapshots WHERE merchant = ? AND sheet_id = ? ORDER BY version DESC LIMIT ?')
        .bind(merchant, id, HISTORY_LIMIT).all();
      return json({ enabled: state.enabled, sheet: rowOut(row), history: (hist.results || []).map((h) => ({ version: Number(h.version), name: h.name, actor: h.actor, actorKind: h.actor_kind, ts: Number(h.ts) })) }, 200, noStore);
    }
    const rows = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? ORDER BY updated_ts DESC LIMIT ?').bind(merchant, MAX_SHEETS).all();
    return json({ enabled: state.enabled, canEdit: state.enabled && !state.suspended, sheets: (rows.results || []).map(rowOut) }, 200, noStore);
  } catch (_) {
    return json({ error: 'storage' }, 503, noStore);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env || !env.DB) return json({ error: 'storage' }, 503, noStore);
  let body;
  try {
    const text = await request.text();
    if (text.length > MAX_BYTES * 2) return json({ error: 'too-large' }, 413, noStore);
    body = JSON.parse(text || '{}');
  } catch (_) { return json({ error: 'bad-json' }, 400, noStore); }
  const merchant = str(body && body.merchant, 64);
  const actor = await foodCostActor(request, env, merchant);
  if (!actor) return json({ error: 'forbidden' }, 403, noStore);
  const state = await storeState(env, merchant);
  if (!state.enabled) return json({ error: 'disabled' }, 403, noStore);
  if (state.suspended) return json({ error: 'suspended' }, 403, noStore);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'storage' }, 503, noStore); }
  const now = Date.now();
  const action = str(body.action, 20);

  async function write(id, data, baseVersion, archived) {
    const name = data.name || 'Sans nom';
    const serial = JSON.stringify(data);
    if (serial.length > MAX_BYTES) return json({ error: 'too-large' }, 413, noStore);
    const row = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
    if (!row) {
      const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM foodcost_sheets WHERE merchant = ?').bind(merchant).first();
      if (count && Number(count.n) >= MAX_SHEETS) return json({ error: 'too-many' }, 409, noStore);
      await env.DB.batch([
        env.DB.prepare('INSERT INTO foodcost_sheets (merchant,id,name,kind,data,version,archived,created_ts,updated_ts,updated_by) VALUES (?,?,?,?,?,1,0,?,?,?)')
          .bind(merchant, id, name, data.kind, serial, now, now, actor.label),
        env.DB.prepare('INSERT INTO foodcost_snapshots (merchant,sheet_id,version,name,data,actor,actor_kind,ts) VALUES (?,?,1,?,?,?,?,?)')
          .bind(merchant, id, name, serial, actor.label, actor.kind, now),
      ]);
      const created = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
      return json({ sheet: rowOut(created) }, 201, noStore);
    }
    const current = Number(row.version) || 0;
    if (baseVersion !== current) return json({ error: 'conflict', sheet: rowOut(row) }, 409, noStore);
    const next = current + 1;
    const arch = archived == null ? Number(row.archived) || 0 : (archived ? 1 : 0);
    /* La condition `version = ?` refait le contrôle DANS l'écriture : deux
       enregistrements simultanés lisent tous deux la même version, un seul
       passe. Le second n'écrit pas de snapshot (même condition). */
    const res = await env.DB.batch([
      env.DB.prepare('UPDATE foodcost_sheets SET name=?, kind=?, data=?, version=?, archived=?, updated_ts=?, updated_by=? WHERE merchant=? AND id=? AND version=?')
        .bind(name, data.kind, serial, next, arch, now, actor.label, merchant, id, current),
      env.DB.prepare('INSERT INTO foodcost_snapshots (merchant,sheet_id,version,name,data,actor,actor_kind,ts) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM foodcost_sheets WHERE merchant=? AND id=? AND version=?)')
        .bind(merchant, id, next, name, serial, actor.label, actor.kind, now, merchant, id, next),
    ]);
    const changed = res && res[0] && res[0].meta ? Number(res[0].meta.changes) : 1;
    const after = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
    if (!changed) return json({ error: 'conflict', sheet: rowOut(after) }, 409, noStore);
    return json({ sheet: rowOut(after) }, 200, noStore);
  }

  try {
    if (action === 'save') {
      const data = cleanSheet(body.sheet);
      if (!data.name) return json({ error: 'name-required' }, 400, noStore);
      const id = str(body.sheet && body.sheet.id, 40);
      if (!id) return write(newId(), data, 0, null);
      if (!/^[a-zA-Z0-9_-]{1,40}$/.test(id)) return json({ error: 'bad-id' }, 400, noStore);
      const exists = await env.DB.prepare('SELECT 1 AS x FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
      if (!exists) return json({ error: 'not-found' }, 404, noStore);
      return write(id, data, Math.round(Number(body.baseVersion)) || 0, null);
    }
    if (action === 'duplicate') {
      const id = str(body.id, 40);
      const row = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
      if (!row) return json({ error: 'not-found' }, 404, noStore);
      const data = cleanSheet(parse(row.data) || {});
      data.name = str(body.name, 120) || `${data.name} (copie)`.slice(0, 120);
      if (body.kind === 'sheet' || body.kind === 'template') data.kind = body.kind;
      return write(newId(), data, 0, null);
    }
    if (action === 'archive') {
      const id = str(body.id, 40);
      const row = await env.DB.prepare('SELECT * FROM foodcost_sheets WHERE merchant = ? AND id = ?').bind(merchant, id).first();
      if (!row) return json({ error: 'not-found' }, 404, noStore);
      return write(id, cleanSheet(parse(row.data) || {}), Math.round(Number(body.baseVersion)) || 0, !!body.archived);
    }
    return json({ error: 'bad-action' }, 400, noStore);
  } catch (_) {
    return json({ error: 'storage' }, 503, noStore);
  }
}
