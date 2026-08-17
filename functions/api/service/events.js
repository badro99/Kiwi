// Store-scoped, assigned-server event stream for front-of-house facts that are
// not orders (today: a party seated from the cashier waitlist).
//
// ── CE DOCUMENT PORTE L'OCCUPATION, JAMAIS L'ADDITION ───────────────────────
// Il a transporté les LIGNES d'une addition, en parallèle de la table `orders`.
// Deux représentations vivantes de la même addition, et rien qui dise laquelle
// gagne : la réconciliation était donc un empilement d'arbitrages écrits chacun
// contre un symptôme observé — « garder les lignes de l'employé tant que la
// caisse ne les a pas répétées », « une addition libre attend l'accusé de
// réception », un garde de version pour les factures empoisonnées. Chacun juste,
// aucun ne fondant une règle. C'est ce qui a fait revenir la même panne sous
// sept noms différents en cinq jours : additions dupliquées, tables fantômes,
// lignes qui reviennent après paiement.
//
// L'addition a désormais UNE source, la file des commandes (`orders`), à qui la
// session de table donne ses frontières. Ce document ne garde que ce qu'il est
// seul à savoir : quelle table est occupée, par combien de couverts, et depuis
// quand. Un client qui envoie encore `lines` ne casse rien — c'est ignoré.

import { json, entitledMerchant, activeServiceEmployee } from '../../auth/_lib.js';
import { poke } from '../_live.js';
import { pollCursor } from '../order/_lib.js';

const FEATURE = 'service-events';
const MAX_EVENTS = 200;
const TABLE_STATUSES = new Set(['khawya', 'a-commander', 'ka-yaklo', 'bgha-ykhlass', 'ka-tkhdam', 'khlass']);

function parse(raw) {
  try { const d = JSON.parse(raw || '{}'); return d && typeof d === 'object' ? d : {}; }
  catch (_) { return {}; }
}
function norm(value) {
  let s = String(value || '').trim().toLowerCase();
  try { s = s.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return s.replace(/\s+/g, ' ');
}
function memberName(member) {
  return [member && member.firstName, member && member.lastName].filter(Boolean).join(' ').trim();
}
async function readDoc(env, merchant) {
  try {
    const row = await env.DB.prepare('SELECT data, rev FROM store_docs WHERE merchant = ? AND feature = ?')
      .bind(merchant, FEATURE).first();
    return { data: parse(row && row.data), rev: Number(row && row.rev) || 0 };
  } catch (_) { return { data: {}, rev: 0 }; }
}
async function append(env, merchant, event, statePatch) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant);
    const events = Array.isArray(row.data.events) ? row.data.events.slice(-MAX_EVENTS + 1) : [];
    events.push(event);
    const states = { ...(row.data.states && typeof row.data.states === 'object' ? row.data.states : {}) };
    if (statePatch && statePatch.table) states[statePatch.table] = statePatch;
    const text = JSON.stringify({ ...row.data, events, states });
    try {
      if (row.rev) {
        const res = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, event.ts, merchant, FEATURE, row.rev).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return true;
      } else {
        const res = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, FEATURE, text, event.ts).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return true;
      }
    } catch (_) { return false; }
  }
  return false;
}

function tableKey(value) {
  return String(value || '').trim().replace(/^table\s*/i, '').replace(/^t(?=\d+$)/i, '').slice(0, 32);
}
async function floorTargets(env, merchant) {
  const out = Object.create(null);
  try {
    const [row, teamRow] = await Promise.all([
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'floorplan'").bind(merchant).first(),
      env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'team'").bind(merchant).first(),
    ]);
    const plan = parse(row && row.data);
    const team = parse(teamRow && teamRow.data);
    const staff = Object.create(null);
    (Array.isArray(plan.staff) ? plan.staff : []).forEach((s) => { if (s && s.id) staff[String(s.id)] = String(s.name || ''); });
    const members = Array.isArray(team.members) ? team.members : [];
    const memberIds = new Set(members.map((m) => String(m && m.id || '')).filter(Boolean));
    const memberByName = new Map(members.map((m) => [norm(memberName(m)), String(m && m.id || '')]));
    const memberId = (value) => {
      const raw = String(value || '');
      if (memberIds.has(raw)) return raw;
      const legacy = raw.startsWith('tm-') ? raw.slice(3) : '';
      if (legacy && memberIds.has(legacy)) return legacy;
      return memberByName.get(norm(staff[raw])) || raw;
    };
    (Array.isArray(plan.tables) ? plan.tables : []).forEach((t) => {
      const table = tableKey(t && (t.num || t.id));
      if (!table) return;
      const rawIds = Array.isArray(t.servers) && t.servers.length ? t.servers : (t.server ? [t.server] : []);
      const serverIds = Array.from(new Set(rawIds.map(memberId).filter(Boolean))).slice(0, 3);
      const servers = Array.from(new Set(rawIds.map((id) => String(staff[String(id)] || '')).filter(Boolean))).slice(0, 3);
      out[table] = { serverId: serverIds[0] || '', server: servers[0] || '', serverIds, servers };
    });
  } catch (_) {}
  return out;
}
async function syncTableSnapshot(env, merchant, rawTables, source) {
  const targets = await floorTargets(env, merchant);
  const incoming = Object.create(null);
  (Array.isArray(rawTables) ? rawTables : []).slice(0, 250).forEach((src) => {
    const table = tableKey(src && src.table);
    const status = String(src && src.status || '');
    if (!table || !TABLE_STATUSES.has(status)) return;
    incoming[table] = {
      table, status,
      covers: Math.max(0, Math.min(99, Number(src.covers) || 0)),
      syncVersion: Math.max(0, Math.min(99, Number(src && src.syncVersion) || 0)),
    };
  });
  if (!Object.keys(incoming).length) return { ok: false, events: [] };
  for (let attempt = 0; attempt < 4; attempt++) {
    const row = await readDoc(env, merchant);
    const previous = row.data.states && typeof row.data.states === 'object' ? row.data.states : {};
    const states = { ...previous };
    const events = Array.isArray(row.data.events) ? row.data.events.slice(-MAX_EVENTS) : [];
    const emitted = [];
    Object.keys(incoming).forEach((table) => {
      const next = incoming[table], before = previous[table];
      const stateChanged = !before || before.status !== next.status || Number(before.covers || 0) !== next.covers;
      const versionChanged = !before || Number(before.syncVersion || 0) !== Number(next.syncVersion || 0);
      /* Every employee tap is an operational transition, including the case
         where the shared document already happens to show the same status.
         Preserve its employee source/timestamp until the caisse echoes that
         exact state. Without this source hand-off, two failures were possible:

           - the caisse's next four-second "still occupied" snapshot erased an
             Addition request before its one-second reader had seen it;
           - closing a table whose cloud snapshot was already `khawya` made no
             write at all, so a locally occupied caisse ignored the close.

         A caisse snapshot that DIFFERS while an employee transition awaits
         acknowledgement is stale and is ignored. The first matching snapshot
         is the acknowledgement: it flips the source back to `caisse`, after
         which the next legitimate visit may change the table normally. */
      const operationalAwaitingAck = source === 'caisse' && before
        && (before.source === 'employee' || before.source === 'guest');
      if (operationalAwaitingAck && stateChanged) return;
      const sourceChanged = !!before && before.source !== (source || 'caisse');
      const changed = stateChanged || versionChanged || sourceChanged;
      if (!changed) return;
      const changedAt = Date.now();
      states[table] = { ...next, ts: changedAt, source: source || 'caisse' };
      if (!stateChanged || (!before && next.status === 'khawya')) return;
      const target = targets[table] || {};
      const event = {
        id: 'evt-' + crypto.randomUUID(), type: 'table-state', ts: changedAt,
        table, status: next.status, previousStatus: String(before && before.status || ''), covers: next.covers,
        serverId: target.serverId || '', server: target.server || '',
        serverIds: target.serverIds || [], servers: target.servers || [],
      };
      events.push(event); emitted.push(event);
    });
    const text = JSON.stringify({ ...row.data, states, events: events.slice(-MAX_EVENTS) });
    try {
      if (row.rev) {
        const res = await env.DB.prepare(
          'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
        ).bind(text, row.rev + 1, Date.now(), merchant, FEATURE, row.rev).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return { ok: true, events: emitted };
      } else {
        const res = await env.DB.prepare(
          'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
        ).bind(merchant, FEATURE, text, Date.now()).run();
        if (Number(res && res.meta && res.meta.changes) > 0) return { ok: true, events: emitted };
      }
    } catch (_) { return { ok: false, events: [] }; }
  }
  return { ok: false, events: [] };
}

/* A guest may only ask for service through an already-open table session (the
 * session handler verifies that boundary before calling here). This keeps the
 * public route from becoming a merchant-wide notification writer. */
export async function publishGuestServiceRequest(env, merchant, rawTable, action) {
  const table = tableKey(rawTable);
  const targets = await floorTargets(env, merchant);
  const target = targets[table];
  if (!table || !target) return { ok: false, error: 'floor-table-required' };
  if (action === 'ask-bill') {
    const current = await readDoc(env, merchant);
    const currentState = current.data.states && current.data.states[table];
    const result = await syncTableSnapshot(env, merchant, [{
      table, status: 'bgha-ykhlass',
      covers: Math.max(0, Number(currentState && currentState.covers) || 0),
      syncVersion: 4,
    }], 'guest');
    if (!result.ok) return { ok: false, error: 'state-write-failed' };
    await poke(env, merchant, FEATURE);
    return { ok: true, table, events: result.events };
  }
  if (action !== 'call-server') return { ok: false, error: 'bad-service-action' };
  const ts = Date.now();
  const event = {
    id: 'evt-' + crypto.randomUUID(), type: 'guest-call', ts, table,
    serverId: target.serverId || '', server: target.server || '',
    serverIds: target.serverIds || [], servers: target.servers || [],
  };
  if (!await append(env, merchant, event, null)) return { ok: false, error: 'event-write-failed' };
  await poke(env, merchant, FEATURE);
  return { ok: true, table, event };
}

/* Payment is a core operation, not a loose UI notification. `/api/sale` calls
 * this after the employee sale is durable so the shared floor reaches the
 * terminal FREE state before the payment request can report success. Retrying
 * is safe: both the sale id and this state replacement are idempotent. */
export async function settleServiceTable(env, merchant, rawTable) {
  const table = tableKey(rawTable);
  const targets = await floorTargets(env, merchant);
  if (!table || !targets[table]) return { ok: false, error: 'floor-table-required' };
  const result = await syncTableSnapshot(env, merchant, [{
    table, status: 'khawya', covers: 0, syncVersion: 4,
  }], 'employee');
  if (!result.ok) return { ok: false, error: 'state-write-failed' };
  await poke(env, merchant, FEATURE);
  return { ok: true, table, events: result.events };
}

export async function onRequestGet({ request, env }) {
  if (!env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  const url = new URL(request.url);
  const asked = String(url.searchParams.get('merchant') || '').trim().toLowerCase().slice(0, 64);
  const role = String(url.searchParams.get('role') || '').toLowerCase();
  if (role === 'caisse') {
    const merchant = await entitledMerchant(request, env, asked, { allowTill: true });
    if (!merchant) return json({ error: 'forbidden-merchant' }, 403);
    const row = await readDoc(env, merchant);
    const since = Math.max(0, Number(url.searchParams.get('since')) || 0);
    const now = Date.now();
    const rawLocks = (row && row.data && row.data.locks && typeof row.data.locks === 'object') ? row.data.locks : {};
    const activeLocks = {};
    Object.keys(rawLocks).forEach(t => {
      if (rawLocks[t] && rawLocks[t].ts && (now - Number(rawLocks[t].ts)) <= 60000) activeLocks[t] = rawLocks[t];
    });
    return json({
      ok: true,
      events: (Array.isArray(row.data.events) ? row.data.events : []).filter((event) => event && Number(event.ts) > since).slice(-MAX_EVENTS),
      states: row.data.states || {}, locks: activeLocks, now: pollCursor(Date.now()),
    });
  }
  const employee = await activeServiceEmployee(request, env, asked);
  if (!employee) return json({ error: 'on-shift-service-required' }, 403);
  const since = Math.max(
    0,
    Number(url.searchParams.get('since')) || 0,
    Number(employee.attendance && employee.attendance.inTs) || 0,
  );
  const myId = String(employee.member.id || employee.session.staffId || '');
  const myName = norm(memberName(employee.member));
  const row = await readDoc(env, employee.merchant);
  let pausedIds = new Set(), pausedNames = new Set();
  try {
    const attendanceRow = await env.DB.prepare("SELECT data FROM store_docs WHERE merchant = ? AND feature = 'attendance'")
      .bind(employee.merchant).first();
    const attendance = JSON.parse((attendanceRow && attendanceRow.data) || '{}');
    (Array.isArray(attendance.entries) ? attendance.entries : []).forEach((entry) => {
      if (!entry || entry.outTs || !entry.pauseTs) return;
      const id = String(entry.memberId || entry.staffId || '');
      const name = norm(entry.name);
      if (id) pausedIds.add(id);
      if (name) pausedNames.add(name);
    });
  } catch (_) { pausedIds = new Set(); pausedNames = new Set(); }
  const events = (Array.isArray(row.data.events) ? row.data.events : [])
    .filter((event) => event && Number(event.ts) > since)
    .filter((event) => {
      if (employee.attendance && employee.attendance.pauseTs) return false;
      const eventIds = Array.isArray(event.serverIds) && event.serverIds.length
        ? event.serverIds.map(String) : (event.serverId ? [String(event.serverId)] : []);
      const eventNames = Array.isArray(event.servers) && event.servers.length
        ? event.servers.map(norm) : (event.server ? [norm(event.server)] : []);
      const direct = eventIds.includes(myId) || eventNames.includes(myName);
      const coverage = eventIds.some((id) => pausedIds.has(id))
        || eventNames.some((name) => pausedNames.has(name));
      const unassigned = !eventIds.length && !eventNames.length;
      return direct || coverage || unassigned;
    })
    .slice(-MAX_EVENTS);
  const now = Date.now();
  const rawLocks = (row && row.data && row.data.locks && typeof row.data.locks === 'object') ? row.data.locks : {};
  const activeLocks = {};
  Object.keys(rawLocks).forEach(t => {
    if (rawLocks[t] && rawLocks[t].ts && (now - Number(rawLocks[t].ts)) <= 60000) activeLocks[t] = rawLocks[t];
  });
  return json({ ok: true, events, states: row.data.states || {}, locks: activeLocks, now: pollCursor(Date.now()) });
}

export async function onRequestPost({ request, env }) {
  if (!env.DB) return json({ error: 'not-configured' }, 503);
  let body = {};
  try { body = await request.json() || {}; } catch (_) { return json({ error: 'bad-json' }, 400); }
  const asked = String(body.merchant || '').trim().toLowerCase().slice(0, 64);
  const employee = await activeServiceEmployee(request, env, asked);
  const merchant = employee ? employee.merchant : await entitledMerchant(request, env, asked, { allowTill: true });
  if (!merchant) return json({ error: 'forbidden-merchant' }, 403);

  /* ── Soft-lock d'une table pendant la prise de commande (anti-collision) ── */
  if (body.lock && typeof body.lock === 'object') {
    const table = tableKey(body.lock.table);
    const action = body.lock.action === 'release' ? 'release' : 'acquire';
    const actor = String(body.lock.actor || (employee && memberName(employee.member)) || 'Serveur').trim().slice(0, 40);
    const actorId = String(body.lock.actorId || (employee && (employee.member.id || employee.session.staffId)) || '').trim().slice(0, 64);
    if (!table) return json({ error: 'table-required' }, 400);

    const targets = await floorTargets(env, merchant);
    if (!targets[table]) return json({ error: 'floor-table-required' }, 403);
    if (employee && employee.attendance && employee.attendance.pauseTs) {
      return json({ error: 'employee-on-pause' }, 403);
    }

    const now = Date.now();
    for (let attempt = 0; attempt < 4; attempt++) {
      const row = await readDoc(env, merchant);
      const locks = { ...(row.data.locks && typeof row.data.locks === 'object' ? row.data.locks : {}) };

      // Purge expired locks (> 60s)
      Object.keys(locks).forEach(t => {
        if (!locks[t] || !locks[t].ts || (now - Number(locks[t].ts)) > 60000) delete locks[t];
      });

      if (action === 'acquire') {
        locks[table] = { table, actor, actorId, ts: now };
      } else {
        // An employee can only release their own lock unless called by a till
        if (!employee || !locks[table] || !locks[table].actorId || locks[table].actorId === actorId) {
          delete locks[table];
        }
      }

      const text = JSON.stringify({ ...row.data, locks });
      try {
        if (row.rev) {
          const res = await env.DB.prepare(
            'UPDATE store_docs SET data = ?, rev = ?, updated_ts = ? WHERE merchant = ? AND feature = ? AND rev = ?'
          ).bind(text, row.rev + 1, now, merchant, FEATURE, row.rev).run();
          if (Number(res && res.meta && res.meta.changes) > 0) break;
        } else {
          const res = await env.DB.prepare(
            'INSERT OR IGNORE INTO store_docs (merchant, feature, data, rev, updated_ts) VALUES (?, ?, ?, 1, ?)'
          ).bind(merchant, FEATURE, text, now).run();
          if (Number(res && res.meta && res.meta.changes) > 0) break;
        }
      } catch (err) {
        console.error('[service] Failed to persist service locks for merchant', merchant);
      }
    }

    await poke(env, merchant, FEATURE);
    return json({ ok: true, table, action, lock: action === 'acquire' ? { table, actor, actorId, ts: now } : null });
  }
  if (body.state && employee) {
    const table = tableKey(body.state.table);
    const status = String(body.state.status || '');
    const targets = await floorTargets(env, merchant);
    if (!table || !targets[table] || !TABLE_STATUSES.has(status)) return json({ error: 'floor-table-required' }, 403);
    if (employee.attendance && employee.attendance.pauseTs) return json({ error: 'employee-on-pause' }, 403);
    const result = await syncTableSnapshot(env, merchant, [{
      /* `lines` n'est plus lu. Ce document porte l'OCCUPATION — qui est assis,
         combien de couverts — et rien d'autre. L'addition a une seule source,
         la file des commandes ; un client peut continuer à envoyer `lines`,
         c'est simplement ignoré. */
      table, status, covers: body.state.covers,
      syncVersion: body.state.syncVersion,
    }], 'employee');
    if (!result.ok) return json({ error: 'state-write-failed' }, 503);
    /* C'est LE poke qui compte : un serveur vient de marquer une table payée ou
     * libérée, et la caisse le lisait jusqu'ici en sondant chaque seconde. */
    await poke(env, merchant, FEATURE);
    return json({ ok: true, events: result.events });
  }
  if (employee) return json({ error: 'employee-state-only' }, 403);
  if (body.snapshot && Array.isArray(body.snapshot.tables)) {
    const result = await syncTableSnapshot(env, merchant, body.snapshot.tables, 'caisse');
    if (!result.ok) return json({ error: 'snapshot-write-failed' }, 503);
    await poke(env, merchant, FEATURE);
    return json({ ok: true, events: result.events });
  }
  const src = body.event && typeof body.event === 'object' ? body.event : {};
  if (String(src.type || '') !== 'table-seated') return json({ error: 'bad-event-type' }, 400);
  const event = {
    id: 'evt-' + crypto.randomUUID(), type: 'table-seated', ts: Date.now(),
    table: String(src.table || '').slice(0, 32),
    serverId: String(src.serverId || '').slice(0, 96),
    server: String(src.server || '').slice(0, 80),
    serverIds: (Array.isArray(src.serverIds) ? src.serverIds : []).slice(0, 3).map((id) => String(id || '').slice(0, 96)).filter(Boolean),
    servers: (Array.isArray(src.servers) ? src.servers : []).slice(0, 3).map((name) => String(name || '').slice(0, 80)).filter(Boolean),
    customer: String(src.customer || '').slice(0, 80),
    covers: Math.max(0, Math.min(99, Number(src.covers) || 0)),
  };
  if (!event.table) return json({ error: 'event-table-required' }, 400);
  const targets = await floorTargets(env, merchant);
  const assigned = targets[tableKey(event.table)] || {};
  if (assigned.serverId || assigned.server) {
    event.serverId = assigned.serverId || '';
    event.server = assigned.server || '';
    event.serverIds = assigned.serverIds || [];
    event.servers = assigned.servers || [];
  }
  const state = { table: event.table, status: 'a-commander', covers: event.covers, ts: event.ts };
  if (!await append(env, merchant, event, state)) return json({ error: 'event-write-failed' }, 503);
  /* Une table vient d'être installée depuis la caisse : le serveur concerné doit
   * la voir apparaître, pas l'attendre six secondes. */
  await poke(env, merchant, FEATURE);
  return json({ ok: true, event });
}
