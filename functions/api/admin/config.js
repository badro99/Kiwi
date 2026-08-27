// /api/admin/config — per-merchant feature flags (operator-only; maps to pricing).
//
//   GET ?merchant=slug                          → { features:{…}, plan, type }
//   PUT {merchant, features:{…}, plan?, type?}   → upsert (type omitted ⇒ kept)
//
// `features` is a JSON object of module→bool. A missing key means ON (the current
// full interface), so an absent row = everything on. Turning a module OFF here
// hides it in that merchant's real app on next load (via /api/config).

import { isOperator, isSeniorOperator, json, operatorActor } from '../../auth/_lib.js';

/* Qui vient de couper ce module ? operatorActor() (auth/_lib.js) répond, et il
 * répond la même chose aux trois journaux — modules, ventes, comptes. La version
 * locale qui vivait ici a été remontée telle quelle quand les ventes de test ont
 * eu besoin d'inscrire le même nom : deux copies de « qui agit » sont deux
 * occasions de diverger sur la seule colonne dont l'exactitude compte. */
const actorOf = (context) => operatorActor(context.request, context.env);

/* God Mode is the only surface that owns these commercial fields. Production
 * used to require a separate, easy-to-forget D1 command before the form could
 * save anything; when that command was missed, every control was disabled even
 * though the deployed code was current. Keep this migration additive and
 * idempotent: inspect the registry, add only absent nullable columns, and never
 * rewrite an existing value. Concurrent first loads are harmless because a
 * duplicate-column race is ignored and the authoritative SELECT is retried. */
const COMMERCIAL_COLUMNS = {
  city: 'TEXT',
  mrr: 'INTEGER',
  subscription_kind: 'TEXT',
  billing_cycle: 'TEXT',
  subscription_start: 'TEXT',
  subscription_end: 'TEXT',
  trial_start: 'TEXT',
  trial_end: 'TEXT',
  trial_days: 'INTEGER',
};

async function ensureCommercialColumns(env) {
  let rows;
  try { rows = await env.DB.prepare("SELECT name FROM pragma_table_info('merchant_config')").all(); }
  catch (_) { return false; }
  const present = new Set((rows.results || []).map((row) => row.name));
  for (const [name, type] of Object.entries(COMMERCIAL_COLUMNS)) {
    if (present.has(name)) continue;
    try { await env.DB.prepare(`ALTER TABLE merchant_config ADD COLUMN ${name} ${type}`).run(); }
    catch (_) {
      // Another request may have added it after the PRAGMA. The final SELECT is
      // the source of truth and will still fail closed if this was a real error.
    }
  }
  return true;
}

/* Une ligne par module RÉELLEMENT changé. Un enregistrement qui ne touche que le
 * plan, ou qui renvoie les mêmes valeurs, n'écrit rien — un journal qui grossit
 * à chaque ouverture de panneau ne se lit plus.
 *
 * `prev` absent et `next` présent compte comme un changement : c'est le passage
 * d'un défaut implicite à une décision explicite, et c'est précisément le geste
 * qu'on veut pouvoir retrouver. Jamais bloquant : si la table n'existe pas
 * encore sur cette base, la configuration est quand même enregistrée. */
async function logChanges(context, merchant, prev, next) {
  const actor = await actorOf(context);
  const ts = Date.now();
  const stmts = [];
  for (const k of Object.keys(next)) {
    if (prev[k] === next[k]) continue;
    stmts.push(context.env.DB.prepare(
      'INSERT INTO config_audit (merchant, feature, enabled, actor, actor_id, ts) VALUES (?,?,?,?,?,?)'
    ).bind(merchant, k, next[k] ? 1 : 0, actor.label, actor.id, ts));
  }
  if (!stmts.length) return;
  try { await context.env.DB.batch(stmts); } catch (_) { /* table absente → on n'échoue pas l'enregistrement */ }
}

async function guard(context, senior) {
  const ok = await isOperator(context.request, context.env);
  if (!ok) return json({ error: 'forbidden' }, 403);
  if (!context.env.DB) return json({ error: 'no-db' }, 503);
  if (senior && !(await isSeniorOperator(context.request, context.env))) {
    return json({ error: 'operator-code-required' }, 403);
  }
  return null;
}

export async function onRequestGet(context) {
  const bad = await guard(context, false); if (bad) return bad;
  const url = new URL(context.request.url);
  const merchant = (url.searchParams.get('merchant') || '').trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  await ensureCommercialColumns(context.env);
  /* city / mrr sont posées par l'opérateur et peuvent manquer sur une base qui
     n'a pas encore reçu l'ALTER (voir schema.sql). On retombe alors sur la
     requête d'origine et on annonce `columns:false` : le panneau affiche « pas
     encore appliquée en base » au lieu d'un champ vide qu'on remplirait pour
     rien. */
  let row = null, hasCols = true;
  try {
    row = await context.env.DB.prepare(
      `SELECT features, plan, type, city, mrr, subscription_kind, billing_cycle,
              subscription_start, subscription_end, trial_start, trial_end, trial_days
         FROM merchant_config WHERE merchant = ?`
    ).bind(merchant).first();
  } catch (_) {
    hasCols = false;
    row = await context.env.DB.prepare(
      `SELECT features, plan, type FROM merchant_config WHERE merchant = ?`
    ).bind(merchant).first();
  }
  let features = {};
  if (row && row.features) { try { features = JSON.parse(row.features) || {}; } catch (_) { features = {}; } }
  return json({
    features,
    plan: (row && row.plan) || '',
    type: (row && row.type) || '',
    city: (row && row.city) || '',
    mrr: (row && row.mrr != null) ? Number(row.mrr) : null,
    subscriptionKind: (row && row.subscription_kind) || 'paid',
    billingCycle: (row && row.billing_cycle) || 'monthly',
    subscriptionStart: (row && row.subscription_start) || '',
    subscriptionEnd: (row && row.subscription_end) || '',
    trialStart: (row && row.trial_start) || '',
    trialEnd: (row && row.trial_end) || '',
    trialDays: (row && row.trial_days != null) ? Number(row.trial_days) : null,
    columns: { city: hasCols, mrr: hasCols, lifecycle: hasCols },
  });
}

export async function onRequestPut(context) {
  const bad = await guard(context, true); if (bad) return bad;
  await ensureCommercialColumns(context.env);
  let body;
  try { body = await context.request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = (body.merchant || '').toString().trim();
  if (!merchant) return json({ error: 'merchant-required' }, 400);
  const features = (body.features && typeof body.features === 'object') ? body.features : {};
  const plan = (body.plan || '').toString().trim().slice(0, 24);
  // Keep only boolean flags — defensive against junk payloads.
  const clean = {};
  for (const k of Object.keys(features)) clean[String(k).slice(0, 40)] = !!features[k];

  // type is optional: bind NULL when the caller didn't send it, and COALESCE on
  // conflict so a features/plan-only save never clears a merchant's set type.
  const hasType = Object.prototype.hasOwnProperty.call(body, 'type');
  const type = hasType ? (body.type || '').toString().trim().slice(0, 24) : null;

  /* Rattachement explicite d'une boutique à son propriétaire.
     Une fiche préparée par l'opérateur naît sans account_id, et /api/config
     refuse désormais qu'un compte tiers l'adopte (error: merchant-reserved) —
     sinon le premier à deviner le slug emportait la boutique. Quand le nom
     commercial du client ne donne pas exactement ce slug (multi-boutiques,
     enseigne différente de la raison sociale), c'est ici que l'opérateur relie
     la fiche au bon compte. Envoyer accountId: null la libère à nouveau. */
  const hasOwner = Object.prototype.hasOwnProperty.call(body, 'accountId');
  const accountId = hasOwner ? ((body.accountId || '').toString().trim().slice(0, 64) || null) : null;

  /* ── La ville, et ce que cet établissement nous rapporte ──────────────────
     Deux renseignements d'opérateur, absents de toute la base jusqu'ici : rien
     ne portait de ville, rien ne disait ce qu'un abonnement vaut. Ils suivent
     la règle de `type` — omis ⇒ inchangé, envoyé ⇒ écrit — pour qu'un
     enregistrement de modules ne les efface jamais au passage.
     `mrr` accepte explicitement null : c'est ainsi qu'on retire un montant
     convenu et qu'on rend l'établissement au tarif public de son palier. */
  const hasCity = Object.prototype.hasOwnProperty.call(body, 'city');
  const city = hasCity ? (body.city || '').toString().trim().slice(0, 60) : null;
  const hasMrr = Object.prototype.hasOwnProperty.call(body, 'mrr');
  const mrrNum = hasMrr ? Number(body.mrr) : NaN;
  const mrr = (hasMrr && Number.isFinite(mrrNum) && mrrNum > 0)
    ? Math.min(Math.round(mrrNum), 10000000) : null;

  const hasLifecycle = ['subscriptionKind', 'billingCycle', 'subscriptionStart',
    'subscriptionEnd', 'trialStart', 'trialEnd', 'trialDays']
    .some((key) => Object.prototype.hasOwnProperty.call(body, key));
  const subscriptionKind = body.subscriptionKind === 'trial' ? 'trial' : 'paid';
  const billingCycle = body.billingCycle === 'annual' ? 'annual' : 'monthly';
  const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : null;
  const subscriptionStart = isoDate(body.subscriptionStart);
  const subscriptionEnd = isoDate(body.subscriptionEnd);
  const trialStart = isoDate(body.trialStart);
  const trialEnd = isoDate(body.trialEnd);
  const trialNum = Number(body.trialDays);
  const trialDays = Number.isFinite(trialNum) && trialNum > 0 ? Math.min(Math.round(trialNum), 365) : null;

  if (hasLifecycle) {
    if (subscriptionKind === 'paid' && (!subscriptionStart || !subscriptionEnd || subscriptionEnd < subscriptionStart)) {
      return json({ error: 'invalid-subscription-dates' }, 400);
    }
    if (subscriptionKind === 'trial' && (!trialStart || !trialEnd || trialEnd < trialStart || !trialDays)) {
      return json({ error: 'invalid-trial-dates' }, 400);
    }
  }

  // L'état d'AVANT, lu avant d'écrire : c'est la seule façon de savoir ce qui a
  // changé, et donc quoi inscrire au journal. Couper un module n'efface aucune
  // donnée — le catalogue, les réservations, les notes restent dans leurs tables
  // et reviennent intactes à la réactivation ; ce journal garde la trace du
  // geste, que `merchant_config` ne conserve pas (il ne montre que le dernier état).
  let prev = {};
  try {
    const before = await context.env.DB.prepare('SELECT features FROM merchant_config WHERE merchant = ?')
      .bind(merchant).first();
    if (before && before.features) { try { prev = JSON.parse(before.features) || {}; } catch (_) { prev = {}; } }
  } catch (_) { /* pas de fiche → tout est nouveau */ }

  /* Une base qui n'a pas encore reçu l'ALTER city/mrr fait échouer la requête
     entière — modules compris. On réessaie donc sans les deux colonnes : les
     modules, eux, doivent s'enregistrer. La réponse dit alors `columns.city:
     false`, et la console affiche que la ville n'a PAS été retenue au lieu de
     laisser croire à un enregistrement complet. */
  let columns = { city: true, mrr: true, lifecycle: true };
  try {
    await context.env.DB.prepare(
      `INSERT INTO merchant_config (merchant, features, plan, type, account_id, city, mrr,
         subscription_kind, billing_cycle, subscription_start, subscription_end,
         trial_start, trial_end, trial_days, updated_ts)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
       ON CONFLICT(merchant) DO UPDATE SET
         features = excluded.features,
         plan = excluded.plan,
         type = COALESCE(excluded.type, merchant_config.type),
         account_id = ${hasOwner ? 'excluded.account_id' : 'merchant_config.account_id'},
         city = ${hasCity ? 'excluded.city' : 'merchant_config.city'},
         mrr = ${hasMrr ? 'excluded.mrr' : 'merchant_config.mrr'},
         subscription_kind = ${hasLifecycle ? 'excluded.subscription_kind' : 'merchant_config.subscription_kind'},
         billing_cycle = ${hasLifecycle ? 'excluded.billing_cycle' : 'merchant_config.billing_cycle'},
         subscription_start = ${hasLifecycle ? 'excluded.subscription_start' : 'merchant_config.subscription_start'},
         subscription_end = ${hasLifecycle ? 'excluded.subscription_end' : 'merchant_config.subscription_end'},
         trial_start = ${hasLifecycle ? 'excluded.trial_start' : 'merchant_config.trial_start'},
         trial_end = ${hasLifecycle ? 'excluded.trial_end' : 'merchant_config.trial_end'},
         trial_days = ${hasLifecycle ? 'excluded.trial_days' : 'merchant_config.trial_days'},
         updated_ts = excluded.updated_ts`
    ).bind(merchant, JSON.stringify(clean), plan, type, accountId, city, mrr,
      subscriptionKind, billingCycle, subscriptionStart, subscriptionEnd,
      trialStart, trialEnd, trialDays, Date.now()).run();
  } catch (_) {
    columns = { city: false, mrr: false, lifecycle: false };
    await context.env.DB.prepare(
      `INSERT INTO merchant_config (merchant, features, plan, type, account_id, updated_ts) VALUES (?,?,?,?,?,?)
       ON CONFLICT(merchant) DO UPDATE SET
         features = excluded.features,
         plan = excluded.plan,
         type = COALESCE(excluded.type, merchant_config.type),
         account_id = ${hasOwner ? 'excluded.account_id' : 'merchant_config.account_id'},
         updated_ts = excluded.updated_ts`
    ).bind(merchant, JSON.stringify(clean), plan, type, accountId, Date.now()).run();
  }
  await logChanges(context, merchant, prev, clean);
  return json({
    ok: true, features: clean, plan, type: type,
    accountId: hasOwner ? accountId : undefined,
    city: hasCity ? city : undefined,
    mrr: hasMrr ? mrr : undefined,
    subscriptionKind: hasLifecycle ? subscriptionKind : undefined,
    billingCycle: hasLifecycle ? billingCycle : undefined,
    subscriptionStart: hasLifecycle ? subscriptionStart : undefined,
    subscriptionEnd: hasLifecycle ? subscriptionEnd : undefined,
    trialStart: hasLifecycle ? trialStart : undefined,
    trialEnd: hasLifecycle ? trialEnd : undefined,
    trialDays: hasLifecycle ? trialDays : undefined,
    columns,
  });
}
