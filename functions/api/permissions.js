// /api/permissions · les droits de l'équipe d'une boutique.
//
// GET  ?merchant=…            le tableau de bord : l'équipe, ses droits, ce
//                             qu'elle pouvait faire avant (`today`), les rôles
//                             par défaut, le journal (propriétaire seul). Une
//                             caisse appairée reçoit la même équipe réduite à
//                             { key, name, preset, perms } ; jamais un code.
// POST { merchant, action }   le compte du propriétaire (palier propriétaire)
//                             ou un opérateur nommé, jamais un gérant :
//   activate       { choices: { key: 'today'|'preset'|'keep' }, freeDiscountPct }
//                  allume les droits ; écrit pour CHAQUE personne soit ses
//                  droits d'aujourd'hui, soit le rôle par défaut proposé —
//                  l'écran a montré la différence personne par personne
//   deactivate     revient aux règles d'avant (les lignes restent)
//   save-staff     { key, preset, perms }      rôle + liste voulue
//   copy-from      { key, from }               mêmes droits qu'une autre personne
//   save-preset    { preset, perms }           modifie un rôle par défaut
//   reset-preset   { preset }                  rend le rôle par défaut d'origine
//   settings       { freeDiscountPct }         seuil de remise libre
//   legacy-preview { legacy }                  ce que les anciens réglages du
//                  navigateur donneraient, personne par personne ; n'écrit rien
//   import-legacy  { legacy, accept: [key] }   reprend ces personnes-là, seules
//   legacy-dismiss                             ne rien reprendre, ne plus demander
//   undo           { id }                      défait une ligne du journal
// Les changements de droits exigent l'activation : enregistrer un réglage ne
// l'allume jamais en passant. Chaque écriture ajoute sa ligne au journal, dans
// le même lot D1, avec l'état d'avant (c'est ce qu'`undo` remet).
import { json, entitledMerchant } from '../auth/_lib.js';
import {
  Catalog, rosterFor, loadState, permsIn, permissionEditor, sessionPerson, legacyPerms,
} from './_permissions.js';

const MAX_LEGACY = 20000;
const clip = (v, n) => String(v == null ? '' : v).slice(0, n);

async function publicState(env, merchant, full) {
  const [roster, state] = await Promise.all([rosterFor(env, merchant), loadState(env, merchant)]);
  if (state.unavailable) return null;
  const staff = roster.map((m) => {
    const eff = permsIn(state, m);
    const row = state.rows.get(m.key);
    if (!full) return { key: m.key, name: m.name, preset: eff.preset, perms: eff.perms };
    /* `today` : ce que la personne fait aujourd'hui, règle d'avant. */
    const before = legacyPerms(m.role);
    return { key: m.key, name: m.name, role: m.role, defaultPreset: m.defaultPreset, ownerTitle: m.ownerTitle, ownerAccess: !!eff.ownerAccess,
      held: !!eff.held, heldBy: eff.held && row ? row.heldBy : '', preset: eff.preset,
      grants: eff.grants, denies: eff.denies, perms: eff.perms, custom: !!row, updatedTs: row ? row.updatedTs : 0,
      today: before.perms, todayPartial: before.partial, proposed: Catalog.presetPerms(m.defaultPreset, state.presets) };
  });
  const presets = {};
  Catalog.PRESET_IDS.forEach((id) => { presets[id] = Catalog.presetPerms(id, state.presets); });
  return { roster, state, body: { ok: true, merchant, configured: state.configured, activatedTs: state.activatedTs,
    missingTables: !!state.missing, freeDiscountPct: state.freeDiscountPct, presets, staff,
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
  if (!out.state.missing) {
    try {
      audit = ((await env.DB.prepare(
        `SELECT id, ts, actor_label, subject, subject_label, change FROM staff_permission_audit
          WHERE merchant = ? ORDER BY ts DESC, id DESC LIMIT 200`
      ).bind(merchant).all()).results || []).map((r) => {
        let change = {};
        try { change = JSON.parse(r.change) || {}; } catch (_) {}
        const { before, ...shown } = change;   // l'état d'avant sert à `undo`, l'écran n'en a pas besoin
        return { id: Number(r.id) || 0, ts: Number(r.ts) || 0, actor: String(r.actor_label || ''), subject: String(r.subject || ''),
          subjectLabel: String(r.subject_label || ''), change: shown, undoable: !!before };
      });
    } catch (_) { audit = []; }
    /* Le journal ne se réécrit jamais : une ligne défaite l'est par une ligne
       `undo` qui la nomme. */
    const undone = new Set(audit.filter((a) => a.change.kind === 'undo').map((a) => Number(a.change.of)));
    audit.forEach((a) => { if (undone.has(a.id)) { a.undoable = false; a.undone = true; } });
  }
  const week = Date.now() - 7 * 86400000;
  const unauthorizedWeek = audit.filter((a) => a.change && a.change.kind === 'unauthorized' && a.ts >= week).length;
  return json({ ...out.body, readOnly: false, audit, unauthorizedWeek });
}

function auditStmt(env, merchant, actor, subject, subjectLabel, change, ts) {
  return env.DB.prepare(
    `INSERT INTO staff_permission_audit (merchant, ts, actor, actor_label, subject, subject_label, change)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(merchant, ts, clip(actor.id, 120), clip(actor.label, 80), clip(subject, 120), clip(subjectLabel, 80), JSON.stringify(change).slice(0, 8000));
}
function touchSettings(env, merchant, actor, ts) {
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
       denies = excluded.denies, name = excluded.name, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by,
       held_ts = 0, held_by = ''`
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
/* L'état d'une ligne, tel qu'`undo` le remettra. */
const rowBefore = (state, key) => {
  const row = state.rows.get(key);
  return row ? { preset: row.preset, grants: row.grants, denies: row.denies } : { none: true };
};

export async function onRequestPost(context) {
  try { return await writePermissions(context); }
  catch (_) {
    /* D1 muette : rien n'est écrit, le lot est entier. */
    return json({ error: 'write-unavailable' }, 503);
  }
}

/* Les anciens réglages du navigateur → personne par personne : ce qui change. */
function legacyPlan(body, roster, state) {
  const legacy = body.legacy && typeof body.legacy === 'object' ? body.legacy : {};
  const raw = JSON.stringify({ grants: Array.isArray(legacy.grants) ? legacy.grants.slice(0, 500) : [],
    denies: Array.isArray(legacy.denies) ? legacy.denies.slice(0, 500) : [] });
  if (raw.length > MAX_LEGACY) return { tooLarge: true };
  const mapped = Catalog.fromLegacy(JSON.parse(raw), roster);
  const people = [];
  for (const m of roster) {
    const rule = mapped.people[m.key];
    if (!rule || m.ownerTitle) continue;
    const cur = permsIn(state, m);
    const row = state.rows.get(m.key);
    const grants = Catalog.cleanList([...((row && row.grants) || []), ...rule.grants]);
    const denies = Catalog.cleanList([...((row && row.denies) || []).filter((id) => !rule.grants.includes(id)), ...rule.denies]);
    const after = Catalog.effective(cur.preset, grants, denies, state.presets);
    const d = diff(cur.perms, after);
    if (d.added.length || d.removed.length) people.push({ key: m.key, name: m.name, preset: cur.preset, grants, denies, perms: after, ...d });
  }
  return { raw, people, ignored: mapped.ignored };
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
  /* 0028 pas encore appliquée : rien à écrire, l'écran le dit au propriétaire. */
  if (state.missing) return json({ error: 'permissions-not-migrated', migration: '0028_staff_permissions.sql' }, 503);
  const byKey = new Map(roster.map((m) => [m.key, m]));
  const action = clip(body.action, 24);
  const ts = Date.now();

  if (action === 'legacy-preview') {
    const plan = legacyPlan(body, roster, state);
    if (plan.tooLarge) return json({ error: 'legacy-too-large' }, 413);
    return json({ ok: true, people: plan.people.map(({ key, name, added, removed }) => ({ key, name, added, removed })), ignored: plan.ignored,
      already: !!state.legacyImportedTs });
  }

  if (action === 'activate') {
    if (state.configured) return json({ error: 'already-active' }, 409);
    const choices = body.choices && typeof body.choices === 'object' ? body.choices : {};
    const pct = body.freeDiscountPct == null ? state.freeDiscountPct : Number(body.freeDiscountPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return json({ error: 'bad-discount-limit' }, 400);
    const stmts = [env.DB.prepare(
      `INSERT INTO staff_permission_settings (merchant, free_discount_pct, activated_ts, activated_by, updated_ts, updated_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(merchant) DO UPDATE SET free_discount_pct = excluded.free_discount_pct, activated_ts = excluded.activated_ts,
         activated_by = excluded.activated_by, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
    ).bind(merchant, pct, ts, clip(actor.id, 120), ts, clip(actor.id, 120))];
    const summary = [];
    for (const m of roster) {
      if (m.ownerTitle) { summary.push({ key: m.key, choice: 'owner', perms: Catalog.ALL.slice() }); continue; }
      /* Par défaut, chacun garde ses droits d'aujourd'hui : activer n'en donne
         jamais un seul de plus sans que le propriétaire l'ait choisi. Une
         personne déjà réglée (activation précédente) garde son réglage. */
      const had = state.rows.has(m.key);
      const choice = choices[m.key] === 'preset' ? 'preset' : choices[m.key] === 'today' || !had ? 'today' : 'keep';
      const cur = permsIn(state, m);
      if (choice === 'keep') { summary.push({ key: m.key, choice, perms: cur.perms }); continue; }
      const preset = m.defaultPreset;
      const wanted = choice === 'preset' ? Catalog.presetPerms(preset, state.presets) : legacyPerms(m.role).perms;
      const over = Catalog.overridesFor(preset, wanted, state.presets);
      const after = Catalog.effective(preset, over.grants, over.denies, state.presets);
      stmts.push(staffStmt(env, merchant, m.key, m.name, preset, over.grants, over.denies, actor, ts));
      stmts.push(auditStmt(env, merchant, actor, 'staff:' + m.key, m.name,
        { kind: 'activate', choice, preset, ...diff(legacyPerms(m.role).perms, after), before: rowBefore(state, m.key), presetBefore: cur.preset }, ts));
      summary.push({ key: m.key, choice, perms: after });
    }
    stmts.push(auditStmt(env, merchant, actor, 'settings', '', { kind: 'activated', freeDiscountPct: pct, people: roster.length }, ts));
    await commit(env, stmts);
    return json({ ok: true, activatedTs: ts, staff: summary });
  }

  if (action === 'deactivate') {
    if (!state.configured) return json({ ok: true, already: true });
    await commit(env, [
      env.DB.prepare('UPDATE staff_permission_settings SET activated_ts = 0, updated_ts = ?, updated_by = ? WHERE merchant = ?')
        .bind(ts, clip(actor.id, 120), merchant),
      auditStmt(env, merchant, actor, 'settings', '', { kind: 'deactivated' }, ts),
    ]);
    return json({ ok: true });
  }

  /* Tout le reste change des droits : il faut les avoir activés d'abord. */
  if (!state.configured) return json({ error: 'not-activated' }, 409);
  const stmts = [touchSettings(env, merchant, actor, ts)];

  if (action === 'save-staff' || action === 'copy-from') {
    const person = byKey.get(clip(body.key, 120));
    if (!person) return json({ error: 'unknown-staff' }, 404);
    /* Un code à intitulé de propriétaire ouvre le compte comme le propriétaire :
       ses droits ne se règlent pas ici, on change son intitulé dans Équipe. */
    if (person.ownerTitle) return json({ error: 'owner-access' }, 409);
    const before = permsIn(state, person);
    let preset, wanted;
    if (action === 'copy-from') {
      const source = byKey.get(clip(body.from, 120));
      if (!source || source.key === person.key) return json({ error: 'unknown-staff' }, 404);
      const eff = permsIn(state, source);
      preset = eff.ownerAccess ? 'manager' : eff.preset;
      wanted = eff.perms;
    } else {
      preset = clip(body.preset, 16);
      if (!Catalog.PRESET_IDS.includes(preset)) return json({ error: 'bad-preset' }, 400);
      if (Array.isArray(body.perms) && body.perms.length > Catalog.ALL.length * 2) return json({ error: 'bad-perms' }, 400);
      wanted = Array.isArray(body.perms) ? Catalog.cleanList(body.perms) : Catalog.presetPerms(preset, state.presets);
    }
    const over = Catalog.overridesFor(preset, wanted, state.presets);
    const after = Catalog.effective(preset, over.grants, over.denies, state.presets);
    stmts.push(staffStmt(env, merchant, person.key, person.name, preset, over.grants, over.denies, actor, ts));
    stmts.push(auditStmt(env, merchant, actor, 'staff:' + person.key, person.name, {
      kind: action === 'copy-from' ? 'copy' : 'staff', from: action === 'copy-from' ? byKey.get(clip(body.from, 120)).name : undefined,
      presetBefore: before.preset, preset, ...diff(before.perms, after), before: rowBefore(state, person.key),
    }, ts));
    await commit(env, stmts);
    return json({ ok: true, key: person.key, preset, perms: after, grants: over.grants, denies: over.denies });
  }

  if (action === 'save-preset' || action === 'reset-preset') {
    const preset = clip(body.preset, 16);
    if (!Catalog.PRESET_IDS.includes(preset)) return json({ error: 'bad-preset' }, 400);
    const before = Catalog.presetPerms(preset, state.presets);
    const after = action === 'reset-preset' ? Catalog.presetPerms(preset, {}) : Catalog.cleanList(body.perms);
    stmts.push(action === 'reset-preset'
      ? env.DB.prepare('DELETE FROM staff_permission_presets WHERE merchant = ? AND preset = ?').bind(merchant, preset)
      : env.DB.prepare(
        `INSERT INTO staff_permission_presets (merchant, preset, perms, updated_ts, updated_by) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(merchant, preset) DO UPDATE SET perms = excluded.perms, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
      ).bind(merchant, preset, JSON.stringify(after), ts, clip(actor.id, 120)));
    stmts.push(auditStmt(env, merchant, actor, 'preset:' + preset, Catalog.PRESET_LABEL[preset].fr,
      { kind: action === 'reset-preset' ? 'preset-reset' : 'preset', ...diff(before, after),
        before: state.presets[preset] ? { perms: state.presets[preset] } : { none: true } }, ts));
    await commit(env, stmts);
    return json({ ok: true, preset, perms: after });
  }

  if (action === 'settings') {
    const pct = Number(body.freeDiscountPct);
    if (!Number.isInteger(pct) || pct < 0 || pct > 100) return json({ error: 'bad-discount-limit' }, 400);
    stmts[0] = env.DB.prepare(
      `UPDATE staff_permission_settings SET free_discount_pct = ?, updated_ts = ?, updated_by = ? WHERE merchant = ?`
    ).bind(pct, ts, clip(actor.id, 120), merchant);
    stmts.push(auditStmt(env, merchant, actor, 'settings', '', { kind: 'settings', freeDiscountPctBefore: state.freeDiscountPct, freeDiscountPct: pct,
      before: { freeDiscountPct: state.freeDiscountPct } }, ts));
    await commit(env, stmts);
    return json({ ok: true, freeDiscountPct: pct });
  }

  if (action === 'import-legacy' || action === 'legacy-dismiss') {
    /* Une seule fois par boutique : une seconde reprise ne rejoue pas d'anciens
       réglages par-dessus ce que le propriétaire a décidé depuis. */
    if (state.legacyImportedTs) return json({ ok: true, imported: 0, already: true });
    const plan = action === 'import-legacy' ? legacyPlan(body, roster, state) : { raw: '{}', people: [], ignored: [] };
    if (plan.tooLarge) return json({ error: 'legacy-too-large' }, 413);
    const accept = new Set(Array.isArray(body.accept) ? body.accept.slice(0, 500).map((k) => clip(k, 120)) : []);
    let imported = 0;
    for (const p of plan.people) {
      if (!accept.has(p.key)) continue;
      stmts.push(staffStmt(env, merchant, p.key, p.name, p.preset, p.grants, p.denies, actor, ts));
      stmts.push(auditStmt(env, merchant, actor, 'staff:' + p.key, p.name,
        { kind: 'legacy-import', added: p.added, removed: p.removed, before: rowBefore(state, p.key) }, ts));
      imported += 1;
    }
    stmts.push(env.DB.prepare(
      'UPDATE staff_permission_settings SET legacy_doc = ?, legacy_imported_ts = ? WHERE merchant = ?'
    ).bind(plan.raw, ts, merchant));
    if (action === 'legacy-dismiss' || !imported) stmts.push(auditStmt(env, merchant, actor, 'settings', '', { kind: 'legacy-dismissed' }, ts));
    await commit(env, stmts);
    return json({ ok: true, imported });
  }

  if (action === 'undo') {
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return json({ error: 'bad-id' }, 400);
    const row = await env.DB.prepare(
      'SELECT id, subject, subject_label, change FROM staff_permission_audit WHERE merchant = ? AND id = ?'
    ).bind(merchant, id).first();
    if (!row) return json({ error: 'unknown-entry' }, 404);
    let change = {};
    try { change = JSON.parse(row.change) || {}; } catch (_) {}
    const before = change.before;
    if (!before) return json({ error: 'not-undoable' }, 409);
    const done = await env.DB.prepare(
      'SELECT 1 AS hit FROM staff_permission_audit WHERE merchant = ? AND change LIKE ? LIMIT 1'
    ).bind(merchant, '{"kind":"undo","of":' + id + ',%').first();
    if (done) return json({ error: 'already-undone' }, 409);
    const subject = String(row.subject || '');
    let restored;
    if (subject.startsWith('staff:')) {
      const key = subject.slice(6);
      const cur = permsIn(state, byKey.get(key) || { key, role: '' });
      stmts.push(before.none
        ? env.DB.prepare('DELETE FROM staff_permissions WHERE merchant = ? AND staff_key = ?').bind(merchant, key)
        : staffStmt(env, merchant, key, row.subject_label, Catalog.PRESET_IDS.includes(before.preset) ? before.preset : 'server',
          Catalog.cleanList(before.grants), Catalog.cleanList(before.denies), actor, ts));
      const person = byKey.get(key) || { key, role: '' };
      const next = before.none ? Catalog.effective(Catalog.presetForRole(person.role), [], [], state.presets)
        : Catalog.effective(before.preset, before.grants, before.denies, state.presets);
      restored = { kind: 'undo', of: id, ...diff(cur.perms, next), before: rowBefore(state, key) };
    } else if (subject.startsWith('preset:')) {
      const preset = subject.slice(7);
      if (!Catalog.PRESET_IDS.includes(preset)) return json({ error: 'not-undoable' }, 409);
      const cur = Catalog.presetPerms(preset, state.presets);
      stmts.push(before.none
        ? env.DB.prepare('DELETE FROM staff_permission_presets WHERE merchant = ? AND preset = ?').bind(merchant, preset)
        : env.DB.prepare(
          `INSERT INTO staff_permission_presets (merchant, preset, perms, updated_ts, updated_by) VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(merchant, preset) DO UPDATE SET perms = excluded.perms, updated_ts = excluded.updated_ts, updated_by = excluded.updated_by`
        ).bind(merchant, preset, JSON.stringify(Catalog.cleanList(before.perms)), ts, clip(actor.id, 120)));
      const next = before.none ? Catalog.presetPerms(preset, {}) : Catalog.cleanList(before.perms);
      restored = { kind: 'undo', of: id, ...diff(cur, next), before: state.presets[preset] ? { perms: state.presets[preset] } : { none: true } };
    } else if (subject === 'settings' && Number.isInteger(before.freeDiscountPct)) {
      stmts[0] = env.DB.prepare('UPDATE staff_permission_settings SET free_discount_pct = ?, updated_ts = ?, updated_by = ? WHERE merchant = ?')
        .bind(before.freeDiscountPct, ts, clip(actor.id, 120), merchant);
      restored = { kind: 'undo', of: id, freeDiscountPct: before.freeDiscountPct, before: { freeDiscountPct: state.freeDiscountPct } };
    } else return json({ error: 'not-undoable' }, 409);
    stmts.push(auditStmt(env, merchant, actor, subject, row.subject_label, restored, ts));
    await commit(env, stmts);
    return json({ ok: true, undone: id });
  }

  return json({ error: 'bad-action' }, 400);
}
