// /api/permissions · les droits de l'équipe d'une boutique.
//
// GET  ?merchant=…            le tableau de bord : l'équipe, ses droits, les
//                             rôles par défaut, le journal (propriétaire seul).
//                             Une caisse appairée reçoit la même équipe réduite
//                             à { key, name, preset, perms } pour masquer ce qui
//                             est refusé ; jamais un code, jamais une surcharge.
// POST { merchant, action }   le propriétaire (palier propriétaire) ou un
//                             opérateur nommé, jamais un gérant :
//   save-staff    { key, preset, perms }      rôle + liste voulue
//   copy-from     { key, from }               même droits qu'une autre personne
//   save-preset   { preset, perms }           modifie un rôle par défaut
//   reset-preset  { preset }                  rend le rôle par défaut d'origine
//   settings      { freeDiscountPct }         seuil de remise libre
//   import-legacy { legacy: { grants, denies } }  reprise, une seule fois, des
//                 réglages que l'ancien noyau gardait dans le navigateur
// Chaque écriture ajoute une ligne au journal, dans le même lot D1.
import { json, entitledMerchant } from '../auth/_lib.js';
import {
  Catalog, rosterFor, loadState, permsIn, permissionEditor, sessionPerson,
} from './_permissions.js';

const MAX_LEGACY = 20000;
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

async function publicState(env, merchant, full) {
  const [roster, state] = await Promise.all([rosterFor(env, merchant), loadState(env, merchant)]);
  if (state.unavailable) return null;
  const staff = roster.map((m) => {
    const eff = permsIn(state, m);
    const row = state.rows.get(m.key);
    return full
      ? { key: m.key, name: m.name, role: m.role, defaultPreset: m.defaultPreset, preset: eff.preset,
        grants: eff.grants, denies: eff.denies, perms: eff.perms, custom: !!row, updatedTs: row ? row.updatedTs : 0 }
      : { key: m.key, name: m.name, preset: eff.preset, perms: eff.perms };
  });
  const presets = {};
  Catalog.PRESET_IDS.forEach((id) => { presets[id] = Catalog.presetPerms(id, state.presets); });
  return { roster, state, body: { ok: true, merchant, configured: state.configured, migrated: state.migrated,
    freeDiscountPct: state.freeDiscountPct, presets, staff,
    ...(full ? { customPresets: Object.keys(state.presets), legacyImported: !!state.legacyImportedTs } : {}) } };
}

export async function onRequestGet({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const asked = clip(new URL(request.url).searchParams.get('merchant'), 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  const owned = await entitledMerchant(request, env, asked);
  const merchant = owned || await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  /* Le détail (surcharges, rôles modifiés, journal) est au patron. */
  const editor = owned === asked ? await permissionEditor(request, env) : { ok: false };
  if (editor.unavailable) return json({ error: 'permissions-unavailable' }, 503);
  const out = await publicState(env, merchant, editor.ok);
  if (!out) return json({ error: 'permissions-unavailable' }, 503);
  if (!editor.ok) {
    const who = owned === asked ? await sessionPerson(request, env) : null;
    return json({ ...out.body, readOnly: true, ...(who && who.tier ? { tier: who.tier } : {}) });
  }
  let audit = [];
  try {
    audit = ((await env.DB.prepare(
      `SELECT ts, actor_label, subject, subject_label, change FROM staff_permission_audit
        WHERE merchant = ? ORDER BY ts DESC, id DESC LIMIT 150`
    ).bind(merchant).all()).results || []).map((r) => {
      let change = {};
      try { change = JSON.parse(r.change) || {}; } catch (_) {}
      return { ts: Number(r.ts) || 0, actor: String(r.actor_label || ''), subject: String(r.subject || ''),
        subjectLabel: String(r.subject_label || ''), change };
    });
  } catch (_) { audit = []; }
  return json({ ...out.body, readOnly: false, audit });
}

function auditStmt(env, merchant, actor, subject, subjectLabel, change, ts) {
  return env.DB.prepare(
    `INSERT INTO staff_permission_audit (merchant, ts, actor, actor_label, subject, subject_label, change)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(merchant, ts, clip(actor.id, 120), clip(actor.label, 80), clip(subject, 120), clip(subjectLabel, 80), JSON.stringify(change).slice(0, 4000));
}
function settingsStmt(env, merchant, actor, ts) {
  return env.DB.prepare(
    `INSERT INTO staff_permission_settings (merchant, free_discount_pct, updated_ts, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(merchant) DO UPDATE SET updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
  ).bind(merchant, Catalog.DEFAULT_FREE_DISCOUNT_PCT, ts, clip(actor.id, 120));
}
function staffStmt(env, merchant, key, name, preset, grants, denies, actor, ts) {
  return env.DB.prepare(
    `INSERT INTO staff_permissions (merchant, staff_key, preset, grants, denies, name, updated_ts, updated_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(merchant, staff_key) DO UPDATE SET preset = excluded.preset, grants = excluded.grants,
       denies = excluded.denies, name = excluded.name, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
  ).bind(merchant, key, preset, JSON.stringify(grants), JSON.stringify(denies), clip(name, 80), ts, clip(actor.id, 120));
}
async function commit(env, statements) {
  if (typeof env.DB.batch === 'function') return env.DB.batch(statements);
  for (const s of statements) await s.run();
  return null;
}
const diff = (before, after) => ({
  added: after.filter((id) => !before.includes(id)),
  removed: before.filter((id) => !after.includes(id)),
});

export async function onRequestPost(context) {
  try { return await writePermissions(context); }
  catch (e) {
    /* Base pas migrée (0028) ou D1 muette : rien n'est écrit, le lot est entier. */
    return json({ error: /no such table/i.test(String(e && e.message)) ? 'unmigrated' : 'write-unavailable' }, 503);
  }
}

async function writePermissions({ request, env }) {
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  let body;
  try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = clip(body && body.merchant, 64);
  if (!asked) return json({ error: 'merchant-required' }, 400);
  /* Jamais une caisse appairée : entitledMerchant sans allowTill. */
  const merchant = await entitledMerchant(request, env, asked);
  if (!merchant || merchant !== asked) return json({ error: 'forbidden-merchant' }, 403);
  const actor = await permissionEditor(request, env);
  if (actor.unavailable) return json({ error: 'permissions-unavailable' }, 503);
  if (!actor.ok) return json({ error: 'owner-required' }, 403);

  const out = await publicState(env, merchant, true);
  if (!out) return json({ error: 'permissions-unavailable' }, 503);
  const { roster, state } = out;
  const byKey = new Map(roster.map((m) => [m.key, m]));
  const action = clip(body.action, 24);
  const ts = Date.now();
  const stmts = [settingsStmt(env, merchant, actor, ts)];

  if (action === 'save-staff' || action === 'copy-from') {
    const person = byKey.get(clip(body.key, 120));
    if (!person) return json({ error: 'unknown-staff' }, 404);
    if (Catalog.presetForRole(person.role) === 'owner') return json({ error: 'owner-locked' }, 409);
    const before = permsIn(state, person);
    let preset, wanted;
    if (action === 'copy-from') {
      const source = byKey.get(clip(body.from, 120));
      if (!source || source.key === person.key) return json({ error: 'unknown-staff' }, 404);
      const eff = permsIn(state, source);
      preset = eff.preset === 'owner' ? 'manager' : eff.preset;
      wanted = eff.perms;
    } else {
      preset = clip(body.preset, 16);
      if (!Catalog.PRESET_IDS.includes(preset) || preset === 'owner') return json({ error: 'bad-preset' }, 400);
      wanted = Array.isArray(body.perms) ? Catalog.cleanList(body.perms) : Catalog.presetPerms(preset, state.presets);
      if (Array.isArray(body.perms) && body.perms.length > Catalog.ALL.length * 2) return json({ error: 'bad-perms' }, 400);
    }
    const over = Catalog.overridesFor(preset, wanted, state.presets);
    const after = Catalog.effective(preset, over.grants, over.denies, state.presets);
    stmts.push(staffStmt(env, merchant, person.key, person.name, preset, over.grants, over.denies, actor, ts));
    stmts.push(auditStmt(env, merchant, actor, 'staff:' + person.key, person.name, {
      kind: action === 'copy-from' ? 'copy' : 'staff', from: action === 'copy-from' ? byKey.get(clip(body.from, 120)).name : undefined,
      presetBefore: before.preset, preset, ...diff(before.perms, after),
    }, ts));
    await commit(env, stmts);
    return json({ ok: true, key: person.key, preset, perms: after, grants: over.grants, denies: over.denies });
  }

  if (action === 'save-preset' || action === 'reset-preset') {
    const preset = clip(body.preset, 16);
    if (!Catalog.PRESET_IDS.includes(preset) || preset === 'owner') return json({ error: 'bad-preset' }, 400);
    const before = Catalog.presetPerms(preset, state.presets);
    const after = action === 'reset-preset' ? Catalog.presetPerms(preset, {}) : Catalog.cleanList(body.perms);
    stmts.push(action === 'reset-preset'
      ? env.DB.prepare('DELETE FROM staff_permission_presets WHERE merchant = ? AND preset = ?').bind(merchant, preset)
      : env.DB.prepare(
        `INSERT INTO staff_permission_presets (merchant, preset, perms, updated_ts, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(merchant, preset) DO UPDATE SET perms = excluded.perms, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
      ).bind(merchant, preset, JSON.stringify(after), ts, clip(actor.id, 120)));
    stmts.push(auditStmt(env, merchant, actor, 'preset:' + preset, Catalog.PRESET_LABEL[preset].fr,
      { kind: action === 'reset-preset' ? 'preset-reset' : 'preset', ...diff(before, after) }, ts));
    await commit(env, stmts);
    return json({ ok: true, preset, perms: after });
  }

  if (action === 'settings') {
    const pct = Number(body.freeDiscountPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return json({ error: 'bad-discount-limit' }, 400);
    stmts[0] = env.DB.prepare(
      `INSERT INTO staff_permission_settings (merchant, free_discount_pct, updated_ts, updated_by) VALUES (?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET free_discount_pct = excluded.free_discount_pct, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
    ).bind(merchant, pct, ts, clip(actor.id, 120));
    stmts.push(auditStmt(env, merchant, actor, 'settings', '', { kind: 'settings', freeDiscountPctBefore: state.freeDiscountPct, freeDiscountPct: pct }, ts));
    await commit(env, stmts);
    return json({ ok: true, freeDiscountPct: pct });
  }

  if (action === 'import-legacy') {
    /* Une seule fois par boutique : une seconde reprise ne rejoue pas d'anciens
       réglages par-dessus ce que le propriétaire a décidé depuis. */
    if (state.legacyImportedTs) return json({ ok: true, imported: 0, already: true });
    const legacy = body.legacy && typeof body.legacy === 'object' ? body.legacy : {};
    const raw = JSON.stringify({ grants: Array.isArray(legacy.grants) ? legacy.grants.slice(0, 500) : [],
      denies: Array.isArray(legacy.denies) ? legacy.denies.slice(0, 500) : [] });
    if (raw.length > MAX_LEGACY) return json({ error: 'legacy-too-large' }, 413);
    const mapped = Catalog.fromLegacy(JSON.parse(raw), roster.filter((m) => Catalog.presetForRole(m.role) !== 'owner'));
    let imported = 0;
    for (const [key, rule] of Object.entries(mapped)) {
      const person = byKey.get(key);
      if (!person) continue;
      const cur = permsIn(state, person);
      const row = state.rows.get(key);
      const grants = Catalog.cleanList([...((row && row.grants) || []), ...rule.grants]);
      const denies = Catalog.cleanList([...((row && row.denies) || []).filter((id) => !rule.grants.includes(id)), ...rule.denies]);
      const after = Catalog.effective(cur.preset, grants, denies, state.presets);
      stmts.push(staffStmt(env, merchant, key, person.name, cur.preset, grants, denies, actor, ts));
      stmts.push(auditStmt(env, merchant, actor, 'staff:' + key, person.name, { kind: 'legacy-import', ...diff(cur.perms, after) }, ts));
      imported += 1;
    }
    stmts.push(env.DB.prepare(
      'UPDATE staff_permission_settings SET legacy_doc = ?, legacy_imported_ts = ? WHERE merchant = ?'
    ).bind(raw, ts, merchant));
    await commit(env, stmts);
    return json({ ok: true, imported });
  }

  return json({ error: 'bad-action' }, 400);
}
