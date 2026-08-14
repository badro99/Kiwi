// /api/operations — durable, tenant-scoped operational commands.
//
// This is Kiwi's small orchestration boundary.  It deliberately does not copy
// Novu, Medusa, OpenFGA or ERPNext into a no-build application; it borrows the
// useful invariants: stable command IDs, explicit lifecycle states, provider
// capabilities, confirmation for risky work and an append-only audit trail.
// A missing provider is a BLOCKED command, never a green "sent" toast.

import {
  json, sendMail, readSession, readCookie, SESS_COOKIE, isOperator,
  activeEmployee, isTillFor,
} from '../auth/_lib.js';
import { tenantFor } from './_private.js';

const ACTIONS = {
  notification: new Set(['send-email', 'send-whatsapp', 'send-sms', 'send-receipt', 'send-reminder']),
  procurement: new Set(['create-po', 'submit-po', 'receive-po', 'supplier-return']),
  payroll: new Set(['export-payroll', 'prepare-payslips', 'submit-cnss']),
  accounting: new Set(['export-journal', 'create-invoice', 'credit-note', 'lock-period']),
  payment: new Set(['create-link', 'cancel-link', 'refund-link', 'settle-link']),
  device: new Set(['heartbeat', 'test-print', 'ack-alert']),
  ai: new Set(['reprint', 'update-order-status', 'message-customer', 'create-po']),
};
const CONFIRM = new Set([
  'procurement:submit-po', 'procurement:supplier-return', 'payroll:submit-cnss',
  'accounting:credit-note', 'accounting:lock-period', 'payment:cancel-link',
  'payment:refund-link', 'ai:reprint', 'ai:update-order-status',
  'ai:message-customer', 'ai:create-po',
]);
const TRANSITIONS = {
  draft: new Set(['pending-approval', 'cancelled']),
  prepared: new Set(['sent', 'cancelled']),
  'pending-approval': new Set(['approved', 'rejected', 'cancelled']),
  approved: new Set(['processing', 'cancelled']),
  processing: new Set(['completed', 'failed', 'blocked']),
  blocked: new Set(['processing', 'cancelled']),
  failed: new Set(['processing', 'cancelled']),
  active: new Set(['cancelled', 'completed']),
};

const clean = (value, max = 120) => String(value == null ? '' : value).trim().slice(0, max);
const idOk = (value) => /^[A-Za-z0-9._:-]{8,128}$/.test(clean(value, 128));
const now = () => Date.now();
const safeJson = (value, limit = 24000) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  try { const out = JSON.stringify(value); return out.length <= limit ? out : null; } catch (_) { return null; }
};
const parseJson = (value) => { try { return value ? JSON.parse(value) : null; } catch (_) { return null; } };

async function ensureSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS operational_commands (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, domain TEXT NOT NULL,
      action TEXT NOT NULL, status TEXT NOT NULL, provider TEXT NOT NULL DEFAULT '',
      idempotency_key TEXT NOT NULL, payload TEXT NOT NULL, result TEXT,
      requested_by TEXT NOT NULL DEFAULT '', attempt_count INTEGER NOT NULL DEFAULT 0,
      last_error TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_merchant_idempotency ON operational_commands (merchant, idempotency_key)'
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ops_merchant_domain_time ON operational_commands (merchant, domain, updated_ts DESC)'
  ).run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS operational_events (
      id TEXT PRIMARY KEY, command_id TEXT NOT NULL, merchant TEXT NOT NULL,
      event TEXT NOT NULL, status TEXT NOT NULL, detail TEXT,
      created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    'CREATE INDEX IF NOT EXISTS idx_ops_events_command ON operational_events (merchant, command_id, created_ts)'
  ).run();
}

function providers(env) {
  return {
    email: !!(env && env.MAIL_WEBHOOK),
    whatsapp: !!(env && env.WHATSAPP_WEBHOOK),
    sms: !!(env && env.SMS_WEBHOOK),
    payment: !!(env && env.PAYMENT_LINK_WEBHOOK),
  };
}

function publicRow(row) {
  if (!row) return null;
  return {
    id: row.id, merchant: row.merchant, domain: row.domain, action: row.action,
    status: row.status, provider: row.provider || '',
    payload: parseJson(row.payload) || {}, result: parseJson(row.result),
    requestedBy: row.requested_by || '', attempts: Number(row.attempt_count || 0),
    lastError: row.last_error || '', createdAt: Number(row.created_ts || 0),
    updatedAt: Number(row.updated_ts || 0),
  };
}

/* Server-side authorization.
 *
 * assets/platform-kernel.js carries the same relation table for the browser and
 * says of itself that a front-end check "never replaces server authorization".
 * This is that server authorization — the same table, minus the localStorage
 * grant/deny document, which the client writes and therefore may not widen what
 * a caller is allowed to do here.  Roles this file does not know fall through to
 * `employee`, which can create nothing. */
const ROLE = {
  owner: ['*'], proprietaire: ['*'], operator: ['*'],
  /* write:device permet d'acquitter une alarme de parc — un responsable de
     salle fait taire une caisse tombée sans réveiller le propriétaire.  La
     caisse elle-même ne l'a pas : un appareil ne se déclare pas sain. */
  manager: ['read:*', 'write:catalog', 'write:inventory', 'write:planning', 'write:customers',
    'write:orders', 'write:reservations', 'write:reports', 'write:device',
    'action:refund', 'action:reprint', 'action:message'],
  caisse: ['read:catalog', 'read:inventory', 'read:customers', 'read:orders', 'read:device',
    'write:orders', 'write:customers', 'action:checkout', 'action:reprint'],
  serveur: ['read:tables', 'read:orders', 'read:planning', 'write:orders', 'action:request-bill'],
  kitchen: ['read:orders', 'write:order-status'],
  stock: ['read:catalog', 'read:inventory', 'write:inventory'],
  employee: ['read:planning'],
  /* A pairing cookie is a device, not a person.  It proves which counter the
     request came from and nothing else, so it may report its own health and
     exercise its own printer — and nothing else.  action:reprint is here only
     because the test page is executed by the very device that asks for it and
     the verdict must come back from that same cookie; it grants no read of the
     merchant's books and no state change on anyone else's work. */
  till: ['read:device', 'action:reprint'],
};
ROLE.cashier = ROLE.caisse; ROLE.caissier = ROLE.caisse; ROLE.caissiere = ROLE.caisse;
ROLE.server = ROLE.serveur; ROLE.cuisinier = ROLE.kitchen; ROLE.magasinier = ROLE.stock;
ROLE.employe = ROLE.employee;

/* Same normalisation as normEmployeeRole in functions/auth/_lib.js: a job title
   typed as "Caissière" must land on the same row as "caisse". */
function normRole(value) {
  let text = String(value == null ? '' : value).trim().toLowerCase();
  try { text = text.normalize('NFD').replace(/[\u0300-\u036f]/g, ''); } catch (_) {}
  return text.replace(/[’`´]/g, "'").replace(/\s+/g, ' ').slice(0, 40);
}

/* The permission a (domain, action) pair costs.  Mirror of needed() in
   assets/operations.js — if one side changes the other must change with it, or
   the dashboard offers a button the Worker answers with 403. */
function needed(domain, action) {
  if (domain === 'device' && action === 'heartbeat') return ['read', 'device'];
  if (domain === 'notification') return ['action', 'message'];
  if (domain === 'procurement') return ['write', 'inventory'];
  if (domain === 'payroll') return ['write', 'payroll'];
  /* Rembourser, c'est rendre de l'argent : le droit qui compte est celui du
     remboursement, pas celui d'émettre un lien.  Relever l'état auprès du
     fournisseur ne change rien et reste une lecture. */
  if (domain === 'payment' && action === 'refund-link') return ['action', 'refund'];
  if (domain === 'payment' && action === 'settle-link') return ['read', 'payment'];
  if (domain === 'ai' && action === 'reprint') return ['action', 'reprint'];
  /* Imprimer un ticket d'essai, c'est réimprimer : une caissière teste sa
     propre imprimante.  Faire taire une alarme est un acte d'exploitation et
     coûte write:device, que la caisse n'a pas. */
  if (domain === 'device' && action === 'test-print') return ['action', 'reprint'];
  return ['write', domain];
}

function can(role, act, resource) {
  const rules = ROLE[normRole(role)] || ROLE.employee;
  const wanted = `${act}:${resource}`;
  return rules.some((rule) => rule === '*' || rule === wanted || rule === `${act}:*`);
}

/* tenantFor() has already proved the caller may act on this merchant.  actorFor
   answers the next question: as whom.  Cheapest identity first — the employee
   branch costs two D1 reads because the role lives on the live roster, not in
   the cookie. */
async function actorFor(request, env, merchant) {
  try {
    const session = await readSession(readCookie(request, SESS_COOKIE), env.AUTH_SECRET);
    if (session && session.aid) return { kind: 'owner', role: 'owner', name: 'Propriétaire' };
  } catch (_) {}
  try { if (await isOperator(request, env)) return { kind: 'operator', role: 'operator', name: 'Opérateur Kiwi' }; } catch (_) {}
  try {
    const staff = await activeEmployee(request, env, merchant);
    if (staff && staff.member) {
      return {
        kind: 'employee',
        role: normRole(staff.member.function || staff.member.department || 'employee'),
        name: clean(staff.member.name, 100) || 'Équipe',
      };
    }
  } catch (_) {}
  try { if (await isTillFor(request, env, merchant)) return { kind: 'till', role: 'till', name: 'Caisse' }; } catch (_) {}
  return null;
}

/* Rend l'acteur, pas un booléen : ce qui signe un acquittement ou un document
   doit venir de la session prouvée, jamais d'un nom que l'appelant se donne
   lui-même dans le corps de la requête. */
async function mayCommand(request, env, merchant, domain, action) {
  const actor = await actorFor(request, env, merchant);
  if (!actor) return null;
  const check = needed(domain, action);
  return can(actor.role, check[0], check[1]) ? actor : null;
}

async function event(env, command, name, status, detail) {
  const at = now();
  const id = `${command.id}:${at}:${Math.random().toString(36).slice(2, 8)}`;
  await env.DB.prepare(
    `INSERT INTO operational_events (id, command_id, merchant, event, status, detail, created_ts)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, command.id, command.merchant, clean(name, 48), clean(status, 32), safeJson(detail || {}, 4000), at).run();
}

async function update(env, command, status, provider, result, error, limit) {
  const at = now();
  /* `limit` existe pour une seule raison : un export de journal rend des lignes,
     pas un accusé de réception.  Les autres domaines gardent le plafond serré. */
  const stored = safeJson(result || {}, limit || 12000);
  await env.DB.prepare(
    `UPDATE operational_commands SET status = ?, provider = ?, result = ?,
       last_error = ?, attempt_count = attempt_count + 1, updated_ts = ?
     WHERE id = ? AND merchant = ?`
  ).bind(status, provider || '', stored, clean(error, 240), at, command.id, command.merchant).run();
  await event(env, command, 'state', status, { provider: provider || '', reason: error || '' });
  return Object.assign({}, command, { status, provider: provider || '', result: stored, last_error: clean(error, 240), updated_ts: at, attempt_count: Number(command.attempt_count || 0) + 1 });
}

async function postWebhook(url, body) {
  if (!url) return { ok: false, reason: 'provider-unconfigured' };
  try {
    const response = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    let data = {}; try { data = await response.json(); } catch (_) {}
    return response.ok ? { ok: true, data } : { ok: false, reason: `provider-http-${response.status}` };
  } catch (_) { return { ok: false, reason: 'provider-network' }; }
}

function notificationProvider(action, payload) {
  if (action === 'send-email') return 'email';
  if (action === 'send-sms') return 'sms';
  if (action === 'send-whatsapp') return 'whatsapp';
  const channel = clean(payload && payload.channel, 20).toLowerCase();
  return ['email', 'sms', 'whatsapp'].includes(channel) ? channel : '';
}

/* ————— Comptabilité ————————————————————————————————————————————————
 *
 * Ces quatre actions n'existaient que sous forme de chaînes dans une liste
 * blanche : elles retombaient sur la branche par défaut d'execute() et
 * écrivaient `{persisted:true}`.  Une facture sans numéro, un avoir qui ne
 * référence rien et une période « verrouillée » qui n'empêchait aucune écriture
 * ne sont pas de la comptabilité.  Ce qui suit tient les trois invariants qui
 * comptent vraiment : une numérotation continue attribuée par le serveur, des
 * écritures en partie double dont le débit égale le crédit, et un verrou de
 * période qui refuse réellement les écritures postérieures.
 *
 * Comptes du CGNC marocain : 3421 Clients · 7111 Ventes de marchandises ·
 * 4455 État — TVA facturée.  La TVA n'est jamais inventée : sans `taxRate`
 * explicite dans la charge utile, le taux est zéro et la pièce ne porte pas de
 * ligne 4455. */
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const ACC = { client: '3421', ventes: '7111', tva: '4455' };

function ymd(value) {
  const text = clean(value, 10);
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!parts) return '';
  const [year, month, day] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
  const probe = new Date(Date.UTC(year, month - 1, day));
  const round = probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
  return round ? text : '';
}

/* L'argent circule en centimes entiers.  Un total en flottant finit toujours
   par produire un journal qui ne s'équilibre pas à un centime près. */
function cents(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return NaN;
  const exact = Math.round(amount * 100);
  return Number.isSafeInteger(exact) ? exact : NaN;
}

async function ensureLedger(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS accounting_documents (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, kind TEXT NOT NULL,
      series TEXT NOT NULL, seq INTEGER NOT NULL, number TEXT NOT NULL,
      doc_date TEXT NOT NULL, currency TEXT NOT NULL DEFAULT 'MAD',
      total_cents INTEGER NOT NULL, tax_cents INTEGER NOT NULL DEFAULT 0,
      customer TEXT NOT NULL DEFAULT '', parent_number TEXT NOT NULL DEFAULT '',
      command_id TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_seq ON accounting_documents (merchant, series, seq)').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_acc_number ON accounting_documents (merchant, number)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_acc_parent ON accounting_documents (merchant, parent_number)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS accounting_entries (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, document_id TEXT NOT NULL,
      number TEXT NOT NULL, doc_date TEXT NOT NULL, account TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '', debit_cents INTEGER NOT NULL DEFAULT 0,
      credit_cents INTEGER NOT NULL DEFAULT 0, created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_acc_entries_period ON accounting_entries (merchant, doc_date)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS accounting_periods (
      merchant TEXT NOT NULL, period TEXT NOT NULL, locked_ts INTEGER NOT NULL,
      locked_by TEXT NOT NULL DEFAULT '', command_id TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (merchant, period)
    )`
  ).run();
}

async function lockedPeriod(env, merchant, date) {
  const hit = await env.DB.prepare(
    'SELECT period FROM accounting_periods WHERE merchant = ? AND period = ?'
  ).bind(merchant, date.slice(0, 7)).first();
  return hit ? hit.period : '';
}

/* La numérotation est continue parce que le numéro est attribué et consommé
   dans le même geste : il n'existe qu'une fois la pièce écrite.  L'index unique
   (merchant, series, seq) fait échouer bruyamment deux allocations simultanées
   — on réessaie sur le suivant, on ne saute jamais un rang.  Les lignes sont
   écrites après l'en-tête et non dans une transaction : D1 n'en offre pas ici,
   et un en-tête sans lignes se voit immédiatement dans l'export, alors qu'un
   numéro sauté serait invisible et irréparable. */
async function writeDocument(env, doc, lines) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const top = await env.DB.prepare(
      'SELECT COALESCE(MAX(seq), 0) AS taken FROM accounting_documents WHERE merchant = ? AND series = ?'
    ).bind(doc.merchant, doc.series).first();
    const seq = Number((top && top.taken) || 0) + 1;
    const number = `${doc.series}-${String(seq).padStart(6, '0')}`;
    try {
      await env.DB.prepare(
        `INSERT INTO accounting_documents
         (id, merchant, kind, series, seq, number, doc_date, currency, total_cents,
          tax_cents, customer, parent_number, command_id, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(doc.id, doc.merchant, doc.kind, doc.series, seq, number, doc.date, doc.currency,
        doc.totalCents, doc.taxCents, doc.customer, doc.parent || '', doc.id, now()).run();
      for (let i = 0; i < lines.length; i += 1) {
        await env.DB.prepare(
          `INSERT INTO accounting_entries
           (id, merchant, document_id, number, doc_date, account, label, debit_cents, credit_cents, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(`${doc.id}:${i}`, doc.merchant, doc.id, number, doc.date, lines[i].account,
          lines[i].label, lines[i].debit || 0, lines[i].credit || 0, now()).run();
      }
      return { seq, number };
    } catch (_) { /* rang pris entre-temps — on recommence sur le suivant */ }
  }
  return null;
}

const balanced = (lines) => lines.reduce((sum, line) => sum + (line.debit || 0), 0)
  === lines.reduce((sum, line) => sum + (line.credit || 0), 0);

async function accounting(env, row, payload) {
  await ensureLedger(env);
  const merchant = row.merchant;
  const fail = (reason) => update(env, row, 'failed', 'kiwi-ledger', {}, reason);

  if (row.action === 'lock-period') {
    const period = clean(payload && payload.period, 7);
    if (!PERIOD.test(period)) return fail('period-required');
    const held = await env.DB.prepare(
      'SELECT locked_ts FROM accounting_periods WHERE merchant = ? AND period = ?'
    ).bind(merchant, period).first();
    if (held) {
      return update(env, row, 'completed', 'kiwi-ledger',
        { period, lockedAt: Number(held.locked_ts || 0), alreadyLocked: true }, '');
    }
    const at = now();
    await env.DB.prepare(
      'INSERT INTO accounting_periods (merchant, period, locked_ts, locked_by, command_id) VALUES (?, ?, ?, ?, ?)'
    ).bind(merchant, period, at, clean(row.requested_by, 100), row.id).run();
    return update(env, row, 'completed', 'kiwi-ledger', { period, lockedAt: at, alreadyLocked: false }, '');
  }

  if (row.action === 'export-journal') {
    const from = ymd(payload && payload.from);
    const to = ymd(payload && payload.to);
    if (!from || !to || from > to) return fail('range-required');
    const found = await env.DB.prepare(
      `SELECT number, doc_date, account, label, debit_cents, credit_cents
       FROM accounting_entries WHERE merchant = ? AND doc_date >= ? AND doc_date <= ?
       ORDER BY doc_date, number, account`
    ).bind(merchant, from, to).all();
    const rows = found.results || [];
    const accounts = {};
    let debit = 0; let credit = 0;
    const lines = rows.map((entry) => {
      const d = Number(entry.debit_cents || 0); const c = Number(entry.credit_cents || 0);
      debit += d; credit += c;
      const bucket = accounts[entry.account] || (accounts[entry.account] = { debitCents: 0, creditCents: 0 });
      bucket.debitCents += d; bucket.creditCents += c;
      return { number: entry.number, date: entry.doc_date, account: entry.account, label: entry.label, debitCents: d, creditCents: c };
    });
    const summary = { from, to, count: rows.length, debitCents: debit, creditCents: credit, balanced: debit === credit, accounts };
    /* Un export tronqué qui ne le dit pas est pire qu'un export vide. */
    const full = Object.assign({ lines, truncated: false }, summary);
    const fits = !!safeJson(full, 55000);
    return update(env, row, 'completed', 'kiwi-ledger',
      fits ? full : Object.assign({ truncated: true }, summary), '', 60000);
  }

  const date = ymd(payload && payload.date);
  if (!date) return fail('date-required');
  const total = cents(payload && payload.amount);
  if (!(total > 0 && total <= 1000000000)) return fail('invalid-amount');
  const locked = await lockedPeriod(env, merchant, date);
  if (locked) return fail(`period-locked:${locked}`);
  const currency = clean((payload && payload.currency) || 'MAD', 3).toUpperCase();
  const customer = clean(payload && payload.customer, 160);

  if (row.action === 'create-invoice') {
    const rate = Number((payload && payload.taxRate) || 0);
    if (!(rate >= 0 && rate <= 100)) return fail('invalid-tax-rate');
    const tax = Math.round((total * rate) / (100 + rate));
    const net = total - tax;
    const lines = [
      { account: ACC.client, label: 'Clients', debit: total, credit: 0 },
      { account: ACC.ventes, label: 'Ventes', debit: 0, credit: net },
    ];
    if (tax > 0) lines.push({ account: ACC.tva, label: 'TVA facturée', debit: 0, credit: tax });
    if (!balanced(lines)) return fail('unbalanced-entry');
    const written = await writeDocument(env, {
      id: row.id, merchant, kind: 'invoice', series: `FA-${date.slice(0, 4)}`,
      date, currency, totalCents: total, taxCents: tax, customer, parent: '',
    }, lines);
    if (!written) return fail('numbering-conflict');
    return update(env, row, 'completed', 'kiwi-ledger', {
      number: written.number, series: `FA-${date.slice(0, 4)}`, seq: written.seq, date,
      currency, totalCents: total, taxCents: tax, netCents: net, customer,
      entries: lines.length, balanced: true,
    }, '');
  }

  /* credit-note — un avoir est toujours l'avoir de quelque chose. */
  const target = clean(payload && payload.invoice, 40);
  const invoice = await env.DB.prepare(
    "SELECT * FROM accounting_documents WHERE merchant = ? AND number = ? AND kind = 'invoice'"
  ).bind(merchant, target).first();
  if (!invoice) return fail('invoice-not-found');
  const already = await env.DB.prepare(
    "SELECT COALESCE(SUM(total_cents), 0) AS credited FROM accounting_documents WHERE merchant = ? AND parent_number = ? AND kind = 'credit-note'"
  ).bind(merchant, target).first();
  const remaining = Number(invoice.total_cents || 0) - Number((already && already.credited) || 0);
  if (!(total <= remaining)) return fail('exceeds-invoice');
  /* L'avoir porte la même proportion de TVA que la facture qu'il annule. */
  const tax = Number(invoice.total_cents) > 0
    ? Math.round((total * Number(invoice.tax_cents || 0)) / Number(invoice.total_cents))
    : 0;
  const net = total - tax;
  const lines = [
    { account: ACC.client, label: 'Clients', debit: 0, credit: total },
    { account: ACC.ventes, label: 'Ventes', debit: net, credit: 0 },
  ];
  if (tax > 0) lines.push({ account: ACC.tva, label: 'TVA facturée', debit: tax, credit: 0 });
  if (!balanced(lines)) return fail('unbalanced-entry');
  const written = await writeDocument(env, {
    id: row.id, merchant, kind: 'credit-note', series: `AV-${date.slice(0, 4)}`,
    date, currency, totalCents: total, taxCents: tax,
    customer: customer || clean(invoice.customer, 160), parent: target,
  }, lines);
  if (!written) return fail('numbering-conflict');
  return update(env, row, 'completed', 'kiwi-ledger', {
    number: written.number, series: `AV-${date.slice(0, 4)}`, seq: written.seq, date,
    invoice: target, currency, totalCents: total, taxCents: tax, netCents: net,
    remainingCents: remaining - total, entries: lines.length, balanced: true,
  }, '');
}

/* ---- Achats ------------------------------------------------------------
 * Un bon de commande n'est pas un message : c'est un engagement qui vit
 * plusieurs jours et que trois gestes différents viennent modifier.  Tant que
 * `create-po` se contentait de persister sa charge utile, « réceptionner »
 * ne voulait rien dire — rien ne retenait la quantité commandée, donc rien ne
 * pouvait constater qu'on en recevait plus que prévu.
 *
 * Les trois invariants tenus ici : une numérotation continue attribuée par le
 * serveur (BC-AAAA-000001), des quantités reçues cumulées ligne à ligne qui ne
 * dépassent jamais la quantité commandée, et un rapprochement à trois voies —
 * commandé / reçu / facturé — qui refuse une facture fournisseur qui ne
 * correspond pas à ce qui est effectivement entré en stock. */
const PO_MAX_LINES = 60;

async function ensurePurchase(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS purchase_orders (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, seq INTEGER NOT NULL,
      number TEXT NOT NULL, supplier TEXT NOT NULL, status TEXT NOT NULL,
      currency TEXT NOT NULL DEFAULT 'MAD', expected_date TEXT NOT NULL DEFAULT '',
      total_cents INTEGER NOT NULL DEFAULT 0, invoiced_cents INTEGER NOT NULL DEFAULT 0,
      command_id TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL,
      updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_po_number ON purchase_orders (merchant, number)').run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_po_seq ON purchase_orders (merchant, seq)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders (merchant, status, updated_ts DESC)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS purchase_order_lines (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, number TEXT NOT NULL,
      line_no INTEGER NOT NULL, sku TEXT NOT NULL, label TEXT NOT NULL DEFAULT '',
      unit TEXT NOT NULL DEFAULT '', qty INTEGER NOT NULL, unit_cents INTEGER NOT NULL,
      received_qty INTEGER NOT NULL DEFAULT 0, returned_qty INTEGER NOT NULL DEFAULT 0,
      created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_po_line_sku ON purchase_order_lines (merchant, number, sku)').run();
}

/* Les quantités sont des entiers : une demi-bouteille commandée n'existe pas,
   et un flottant finirait par rendre « tout reçu » indécidable. */
function poLines(payload) {
  const raw = payload && Array.isArray(payload.lines) ? payload.lines : null;
  if (!raw || !raw.length) return { error: 'no-lines' };
  if (raw.length > PO_MAX_LINES) return { error: 'too-many-lines' };
  const seen = new Set();
  const lines = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] || {};
    const sku = clean(item.sku || item.ref, 60);
    if (!sku) return { error: 'sku-required' };
    if (seen.has(sku)) return { error: 'duplicate-sku' };
    seen.add(sku);
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1000000) return { error: 'invalid-quantity' };
    const unitCents = cents(item.unitPrice != null ? item.unitPrice : item.unit_price);
    if (!Number.isFinite(unitCents) || unitCents < 0) return { error: 'invalid-price' };
    lines.push({
      sku, qty, unitCents, label: clean(item.label, 160),
      unit: clean(item.unit, 24),
    });
  }
  return { lines };
}

/* Même geste que la numérotation comptable : le rang est consommé au moment
   où l'en-tête s'écrit, l'index unique fait échouer une allocation simultanée,
   et l'on réessaie sur le suivant plutôt que de sauter un numéro. */
async function writePurchaseOrder(env, order, lines) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const top = await env.DB.prepare(
      'SELECT COALESCE(MAX(seq), 0) AS taken FROM purchase_orders WHERE merchant = ?'
    ).bind(order.merchant).first();
    const seq = Number((top && top.taken) || 0) + 1;
    const number = `BC-${order.year}-${String(seq).padStart(6, '0')}`;
    try {
      await env.DB.prepare(
        `INSERT INTO purchase_orders
         (id, merchant, seq, number, supplier, status, currency, expected_date,
          total_cents, invoiced_cents, command_id, created_ts, updated_ts)
         VALUES (?, ?, ?, ?, ?, 'draft', ?, ?, ?, 0, ?, ?, ?)`
      ).bind(order.id, order.merchant, seq, number, order.supplier, order.currency,
        order.expectedDate, order.totalCents, order.id, now(), now()).run();
      for (let i = 0; i < lines.length; i += 1) {
        await env.DB.prepare(
          `INSERT INTO purchase_order_lines
           (id, merchant, number, line_no, sku, label, unit, qty, unit_cents, received_qty, returned_qty, created_ts)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`
        ).bind(`${order.id}:${i}`, order.merchant, number, i + 1, lines[i].sku,
          lines[i].label, lines[i].unit, lines[i].qty, lines[i].unitCents, now()).run();
      }
      return { seq, number };
    } catch (_) { /* rang pris entre-temps — on recommence sur le suivant */ }
  }
  return null;
}

/* Les mouvements de réception et de retour partagent leur forme : une liste de
   couples (sku, quantité) rapprochée des lignes déjà en base. */
function movement(payload) {
  const raw = payload && Array.isArray(payload.lines) ? payload.lines : null;
  if (!raw || !raw.length) return { error: 'no-lines' };
  if (raw.length > PO_MAX_LINES) return { error: 'too-many-lines' };
  const moves = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] || {};
    const sku = clean(item.sku || item.ref, 60);
    if (!sku) return { error: 'sku-required' };
    const qty = Number(item.qty);
    if (!Number.isSafeInteger(qty) || qty <= 0 || qty > 1000000) return { error: 'invalid-quantity' };
    moves.push({ sku, qty });
  }
  return { moves };
}

async function procurement(env, row, payload) {
  await ensurePurchase(env);
  const merchant = row.merchant;
  const fail = (reason) => update(env, row, 'failed', 'kiwi-procurement', {}, reason);

  if (row.action === 'create-po') {
    const supplier = clean(payload && payload.supplier, 160);
    if (!supplier) return fail('supplier-required');
    const expected = payload && payload.expectedDate ? ymd(payload.expectedDate) : '';
    if (payload && payload.expectedDate && !expected) return fail('invalid-date');
    const read = poLines(payload);
    if (read.error) return fail(read.error);
    const total = read.lines.reduce((sum, line) => sum + line.qty * line.unitCents, 0);
    if (!Number.isSafeInteger(total)) return fail('invalid-price');
    const currency = clean((payload && payload.currency) || 'MAD', 3).toUpperCase();
    const written = await writePurchaseOrder(env, {
      id: row.id, merchant, supplier, currency, expectedDate: expected,
      totalCents: total, year: (expected || new Date(now()).toISOString().slice(0, 10)).slice(0, 4),
    }, read.lines);
    if (!written) return fail('numbering-conflict');
    /* La commande reste `draft` : c'est l'état du bon lui-même, et c'est ce
       point d'entrée du cycle de vie que le tableau de bord fait avancer. */
    return update(env, row, 'draft', 'kiwi-procurement', {
      number: written.number, seq: written.seq, status: 'draft', supplier, currency,
      expectedDate: expected, totalCents: total, lines: read.lines.length,
      units: read.lines.reduce((sum, line) => sum + line.qty, 0),
    }, '');
  }

  const number = clean(payload && (payload.po || payload.number), 40);
  const order = await env.DB.prepare(
    'SELECT * FROM purchase_orders WHERE merchant = ? AND number = ?'
  ).bind(merchant, number).first();
  if (!order) return fail('po-not-found');

  if (row.action === 'submit-po') {
    /* Un bon déjà parti chez le fournisseur ne se renvoie pas : le second envoi
       serait une seconde commande sans que personne ne l'ait décidé. */
    if (order.status !== 'draft') return fail(`bad-transition:${order.status}`);
    await env.DB.prepare(
      "UPDATE purchase_orders SET status = 'submitted', updated_ts = ? WHERE merchant = ? AND number = ?"
    ).bind(now(), merchant, number).run();
    return update(env, row, 'completed', 'kiwi-procurement', {
      number, status: 'submitted', supplier: clean(order.supplier, 160),
      totalCents: Number(order.total_cents || 0), expectedDate: clean(order.expected_date, 10),
    }, '');
  }

  const rows = await env.DB.prepare(
    'SELECT sku, label, qty, unit_cents, received_qty, returned_qty FROM purchase_order_lines WHERE merchant = ? AND number = ? ORDER BY line_no'
  ).bind(merchant, number).all();
  const book = new Map((rows && rows.results || []).map((line) => [String(line.sku), line]));

  if (row.action === 'receive-po') {
    if (order.status !== 'submitted' && order.status !== 'partial') return fail(`not-submitted:${order.status}`);
    const read = movement(payload);
    if (read.error) return fail(read.error);
    /* On valide tout le bordereau avant d'écrire quoi que ce soit : une
       réception à moitié appliquée serait un écart de stock invisible. */
    let receivedCents = 0;
    for (const move of read.moves) {
      const line = book.get(move.sku);
      if (!line) return fail('line-not-found');
      if (Number(line.received_qty || 0) + move.qty > Number(line.qty)) return fail('exceeds-ordered');
      receivedCents += move.qty * Number(line.unit_cents || 0);
    }
    /* Rapprochement à trois voies : si le fournisseur joint sa facture, elle
       doit valoir exactement ce qui entre en stock, sinon rien n'est reçu. */
    const invoiced = payload && payload.invoiceAmount != null ? cents(payload.invoiceAmount) : null;
    if (invoiced != null && !Number.isFinite(invoiced)) return fail('invalid-amount');
    if (invoiced != null && invoiced !== receivedCents) return fail('invoice-mismatch');
    for (const move of read.moves) {
      await env.DB.prepare(
        'UPDATE purchase_order_lines SET received_qty = received_qty + ? WHERE merchant = ? AND number = ? AND sku = ?'
      ).bind(move.qty, merchant, number, move.sku).run();
      const line = book.get(move.sku);
      line.received_qty = Number(line.received_qty || 0) + move.qty;
    }
    let outstanding = 0;
    let receivedUnits = 0;
    book.forEach((line) => {
      outstanding += Number(line.qty) - Number(line.received_qty || 0);
      receivedUnits += Number(line.received_qty || 0);
    });
    const status = outstanding > 0 ? 'partial' : 'received';
    await env.DB.prepare(
      'UPDATE purchase_orders SET status = ?, invoiced_cents = invoiced_cents + ?, updated_ts = ? WHERE merchant = ? AND number = ?'
    ).bind(status, invoiced != null ? invoiced : 0, now(), merchant, number).run();
    return update(env, row, 'completed', 'kiwi-procurement', {
      number, status, receivedCents, receivedUnits, outstandingUnits: outstanding,
      matched: invoiced != null, lines: read.moves.length,
    }, '');
  }

  /* supplier-return — on ne rend que ce qui est entré, et jamais deux fois. */
  const read = movement(payload);
  if (read.error) return fail(read.error);
  let creditCents = 0;
  for (const move of read.moves) {
    const line = book.get(move.sku);
    if (!line) return fail('line-not-found');
    const held = Number(line.received_qty || 0) - Number(line.returned_qty || 0);
    if (move.qty > held) return fail('exceeds-received');
    creditCents += move.qty * Number(line.unit_cents || 0);
  }
  for (const move of read.moves) {
    await env.DB.prepare(
      'UPDATE purchase_order_lines SET returned_qty = returned_qty + ? WHERE merchant = ? AND number = ? AND sku = ?'
    ).bind(move.qty, merchant, number, move.sku).run();
    const line = book.get(move.sku);
    line.returned_qty = Number(line.returned_qty || 0) + move.qty;
  }
  let heldUnits = 0;
  let returnedUnits = 0;
  book.forEach((line) => {
    heldUnits += Number(line.received_qty || 0) - Number(line.returned_qty || 0);
    returnedUnits += Number(line.returned_qty || 0);
  });
  await env.DB.prepare(
    'UPDATE purchase_orders SET updated_ts = ? WHERE merchant = ? AND number = ?'
  ).bind(now(), merchant, number).run();
  return update(env, row, 'completed', 'kiwi-procurement', {
    number, status: clean(order.status, 20), creditCents, returnedUnits,
    heldUnits, lines: read.moves.length,
  }, '');
}

/* ---- Paie --------------------------------------------------------------
 * Un export de paie n'est pas un fichier : c'est un calcul qui engage
 * l'employeur devant le salarié, la CNSS et le fisc.  Tant que le domaine
 * tombait dans le fourre-tout générique, « préparer les bulletins » ne
 * calculait rien et ne retenait rien — et trois écrans annonçaient pourtant
 * un PDF envoyé au comptable.
 *
 * Les taux sont exprimés en points de base : 4,48 % s'écrit 448, donc aucun
 * arrondi flottant ne se glisse dans un salaire.  Ce sont ceux publiés au
 * Maroc au moment de l'écriture, et le commerçant peut les remplacer
 * (`payload.rates`) parce qu'un taux légal change plus vite qu'un
 * déploiement.  Chaque bulletin porte le jeu de taux qui l'a produit : un
 * chiffre de paie sans son taux ne se vérifie pas.  Le barème de l'IGR, lui,
 * n'est pas paramétrable — il n'appartient pas au commerçant. */
const PAY = {
  cnss: 448, amo: 226, cnssEmployer: 898, amoEmployer: 411, family: 640, training: 160,
  ceilingCents: 600000,
  fraisHigh: 3500, fraisLow: 2500, fraisThresholdCents: 650000, fraisCapCents: 291667,
  dependentCents: 4167, dependentMax: 6,
};
const IGR = [[333300, 0], [500000, 1000], [666700, 2000], [833300, 3000], [1500000, 3400], [Infinity, 3700]];
const PAYACC = { salaires: '6171', charges: '6174', avances: '3431', dus: '4432', cnss: '4441', igr: '4452' };
const PAY_MAX_STAFF = 200;
const bp = (base, rate) => Math.round((base * rate) / 10000);
const monthEnd = (period) => new Date(Date.UTC(
  Number(period.slice(0, 4)), Number(period.slice(5, 7)), 0
)).toISOString().slice(0, 10);

/* Barème progressif parcouru tranche par tranche.  La « somme à déduire » des
   tables usuelles donnerait le même résultat, mais elle cache le calcul : ici
   chaque tranche est visible et se relit contre le texte. */
function igrCents(taxable) {
  let tax = 0; let floor = 0;
  for (const [ceiling, rate] of IGR) {
    if (taxable <= floor) break;
    tax += bp(Math.min(taxable, ceiling) - floor, rate);
    floor = ceiling;
  }
  return tax;
}

function payRates(payload) {
  const over = payload && payload.rates && typeof payload.rates === 'object' ? payload.rates : null;
  const rates = Object.assign({}, PAY);
  if (!over) return { rates, set: 'ma-2026' };
  for (const key of ['cnss', 'amo', 'cnssEmployer', 'amoEmployer', 'family', 'training']) {
    if (over[key] == null) continue;
    const value = Number(over[key]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 10000) return { error: `invalid-rate:${key}` };
    rates[key] = value;
  }
  if (over.ceilingCents != null) {
    const ceiling = Number(over.ceilingCents);
    if (!Number.isSafeInteger(ceiling) || ceiling < 0 || ceiling > 100000000) return { error: 'invalid-ceiling' };
    rates.ceilingCents = ceiling;
  }
  return { rates, set: 'custom' };
}

function payStaff(payload) {
  const raw = payload && Array.isArray(payload.employees) ? payload.employees : null;
  if (!raw || !raw.length) return { error: 'no-employees' };
  if (raw.length > PAY_MAX_STAFF) return { error: 'too-many-employees' };
  const seen = new Set();
  const staff = [];
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] || {};
    const id = clean(item.id || item.memberId, 80);
    if (!id) return { error: 'member-required' };
    if (seen.has(id)) return { error: 'duplicate-member' };
    seen.add(id);
    const base = cents(item.base != null ? item.base : item.baseSalary);
    const overtime = item.overtime != null ? cents(item.overtime) : 0;
    const bonus = item.bonus != null ? cents(item.bonus) : 0;
    const advance = item.advance != null ? cents(item.advance) : 0;
    for (const part of [base, overtime, bonus, advance]) {
      if (!Number.isFinite(part) || part < 0 || part > 100000000) return { error: 'invalid-amount' };
    }
    const dependents = item.dependents == null ? 0 : Number(item.dependents);
    if (!Number.isSafeInteger(dependents) || dependents < 0 || dependents > 20) return { error: 'invalid-dependents' };
    const gross = base + overtime + bonus;
    if (gross <= 0) return { error: 'invalid-amount' };
    if (advance > gross) return { error: 'advance-exceeds-gross' };
    staff.push({ id, name: clean(item.name, 120), role: clean(item.role, 60), base, overtime, bonus, advance, dependents, gross });
  }
  return { staff };
}

function payslipFor(person, rates) {
  const gross = person.gross;
  const capped = Math.min(gross, rates.ceilingCents);
  const cnss = bp(capped, rates.cnss);
  const amo = bp(gross, rates.amo);
  /* Frais professionnels : forfait plus généreux sous le seuil, plafonné dans
     les deux cas — sans lui l'assiette imposable serait fausse pour tout le
     monde, et surtout pour les petits salaires. */
  const frais = Math.min(bp(gross, gross <= PAY.fraisThresholdCents ? PAY.fraisHigh : PAY.fraisLow), PAY.fraisCapCents);
  const taxable = Math.max(0, gross - frais - cnss - amo);
  const relief = Math.min(person.dependents, PAY.dependentMax) * PAY.dependentCents;
  const igr = Math.max(0, igrCents(taxable) - relief);
  const employer = bp(capped, rates.cnssEmployer) + bp(gross, rates.amoEmployer)
    + bp(gross, rates.family) + bp(gross, rates.training);
  return {
    grossCents: gross, cappedCents: capped, cnssCents: cnss, amoCents: amo,
    taxableCents: taxable, igrCents: igr, employerCents: employer,
    advanceCents: person.advance, netCents: gross - cnss - amo - igr - person.advance,
  };
}

async function ensurePayroll(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payslips (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, period TEXT NOT NULL,
      member_id TEXT NOT NULL, member_name TEXT NOT NULL DEFAULT '',
      role TEXT NOT NULL DEFAULT '', rate_set TEXT NOT NULL DEFAULT '',
      base_cents INTEGER NOT NULL DEFAULT 0, overtime_cents INTEGER NOT NULL DEFAULT 0,
      bonus_cents INTEGER NOT NULL DEFAULT 0, advance_cents INTEGER NOT NULL DEFAULT 0,
      gross_cents INTEGER NOT NULL, capped_cents INTEGER NOT NULL DEFAULT 0,
      cnss_cents INTEGER NOT NULL DEFAULT 0, amo_cents INTEGER NOT NULL DEFAULT 0,
      igr_cents INTEGER NOT NULL DEFAULT 0, employer_cents INTEGER NOT NULL DEFAULT 0,
      net_cents INTEGER NOT NULL, dependents INTEGER NOT NULL DEFAULT 0,
      command_id TEXT NOT NULL DEFAULT '', created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_payslip_member ON payslips (merchant, period, member_id)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_payslip_period ON payslips (merchant, period)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payroll_periods (
      merchant TEXT NOT NULL, period TEXT NOT NULL, status TEXT NOT NULL,
      employees INTEGER NOT NULL DEFAULT 0, gross_cents INTEGER NOT NULL DEFAULT 0,
      net_cents INTEGER NOT NULL DEFAULT 0, employer_cents INTEGER NOT NULL DEFAULT 0,
      journal_number TEXT NOT NULL DEFAULT '', declaration TEXT NOT NULL DEFAULT '',
      updated_ts INTEGER NOT NULL, PRIMARY KEY (merchant, period)
    )`
  ).run();
}

const payTotals = (rows) => rows.reduce((sum, slip) => ({
  employees: sum.employees + 1,
  grossCents: sum.grossCents + Number(slip.gross_cents || 0),
  cappedCents: sum.cappedCents + Number(slip.capped_cents || 0),
  cnssCents: sum.cnssCents + Number(slip.cnss_cents || 0),
  amoCents: sum.amoCents + Number(slip.amo_cents || 0),
  igrCents: sum.igrCents + Number(slip.igr_cents || 0),
  employerCents: sum.employerCents + Number(slip.employer_cents || 0),
  advanceCents: sum.advanceCents + Number(slip.advance_cents || 0),
  netCents: sum.netCents + Number(slip.net_cents || 0),
}), { employees: 0, grossCents: 0, cappedCents: 0, cnssCents: 0, amoCents: 0, igrCents: 0, employerCents: 0, advanceCents: 0, netCents: 0 });

async function payroll(env, row, payload) {
  await ensurePayroll(env);
  const merchant = row.merchant;
  const fail = (reason) => update(env, row, 'failed', 'kiwi-payroll', {}, reason);
  const period = clean(payload && payload.period, 7);
  if (!PERIOD.test(period)) return fail('period-required');
  const held = await env.DB.prepare(
    'SELECT * FROM payroll_periods WHERE merchant = ? AND period = ?'
  ).bind(merchant, period).first();

  if (row.action === 'prepare-payslips') {
    /* Une période déjà déclarée est un chiffre parti à la CNSS, et une période
       déjà passée au journal est une écriture comptable : la recalculer en
       silence ferait diverger le livre de ce que le salarié a touché. */
    if (held && held.declaration) return fail('period-declared');
    if (held && held.journal_number) return fail('period-posted');
    const read = payStaff(payload);
    if (read.error) return fail(read.error);
    const rated = payRates(payload);
    if (rated.error) return fail(rated.error);
    const slips = [];
    for (const person of read.staff) {
      const slip = payslipFor(person, rated.rates);
      /* Un net négatif n'est pas un bulletin : c'est une avance qu'on réclame
         au salarié.  On refuse plutôt que d'écrire un salaire impossible. */
      if (slip.netCents < 0) return fail(`net-negative:${person.id}`);
      slips.push({ person, slip });
    }
    await env.DB.prepare('DELETE FROM payslips WHERE merchant = ? AND period = ?').bind(merchant, period).run();
    for (let i = 0; i < slips.length; i += 1) {
      const { person, slip } = slips[i];
      await env.DB.prepare(
        `INSERT INTO payslips
         (id, merchant, period, member_id, member_name, role, rate_set, base_cents,
          overtime_cents, bonus_cents, advance_cents, gross_cents, capped_cents,
          cnss_cents, amo_cents, igr_cents, employer_cents, net_cents, dependents,
          command_id, created_ts, updated_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(`${row.id}:${i}`, merchant, period, person.id, person.name, person.role,
        rated.set, person.base, person.overtime, person.bonus, person.advance,
        slip.grossCents, slip.cappedCents, slip.cnssCents, slip.amoCents, slip.igrCents,
        slip.employerCents, slip.netCents, person.dependents, row.id, now(), now()).run();
    }
    const totals = payTotals(slips.map(({ person, slip }) => ({
      gross_cents: slip.grossCents, capped_cents: slip.cappedCents, cnss_cents: slip.cnssCents,
      amo_cents: slip.amoCents, igr_cents: slip.igrCents, employer_cents: slip.employerCents,
      advance_cents: slip.advanceCents, net_cents: slip.netCents,
    })));
    await env.DB.prepare(
      `INSERT INTO payroll_periods (merchant, period, status, employees, gross_cents, net_cents, employer_cents, journal_number, declaration, updated_ts)
       VALUES (?, ?, 'prepared', ?, ?, ?, ?, '', '', ?)
       ON CONFLICT (merchant, period) DO UPDATE SET status = 'prepared', employees = excluded.employees,
         gross_cents = excluded.gross_cents, net_cents = excluded.net_cents,
         employer_cents = excluded.employer_cents, updated_ts = excluded.updated_ts`
    ).bind(merchant, period, totals.employees, totals.grossCents, totals.netCents, totals.employerCents, now()).run();
    return update(env, row, 'prepared', 'kiwi-payroll', Object.assign({
      period, rateSet: rated.set, status: 'prepared',
      payslips: slips.map(({ person, slip }) => ({
        memberId: person.id, name: person.name, grossCents: slip.grossCents,
        cnssCents: slip.cnssCents, amoCents: slip.amoCents, igrCents: slip.igrCents,
        netCents: slip.netCents,
      })),
    }, totals), '', 60000);
  }

  const stored = await env.DB.prepare(
    'SELECT * FROM payslips WHERE merchant = ? AND period = ? ORDER BY member_name, member_id'
  ).bind(merchant, period).all();
  const list = (stored && stored.results) || [];
  /* Exporter ou déclarer une paie qui n'a jamais été calculée produirait un
     fichier vide qui a l'air d'un fichier. */
  if (!list.length) return fail('no-payslips');
  const totals = payTotals(list);

  if (row.action === 'export-payroll') {
    if (held && held.journal_number) {
      return update(env, row, 'completed', 'kiwi-payroll', Object.assign({
        period, number: clean(held.journal_number, 40), alreadyPosted: true, status: 'exported',
      }, totals), '');
    }
    await ensureLedger(env);
    const date = monthEnd(period);
    const locked = await lockedPeriod(env, merchant, date);
    if (locked) return fail(`period-locked:${locked}`);
    /* Le brut n'est pas une charge à lui seul : ce que l'entreprise supporte,
       c'est le brut plus la part patronale, et ce qu'elle doit se répartit
       entre le salarié, la CNSS, l'État et les avances déjà versées. */
    const social = totals.cnssCents + totals.amoCents + totals.employerCents;
    const lines = [
      { account: PAYACC.salaires, label: 'Rémunérations du personnel', debit: totals.grossCents, credit: 0 },
      { account: PAYACC.charges, label: 'Charges sociales employeur', debit: totals.employerCents, credit: 0 },
      { account: PAYACC.dus, label: 'Rémunérations dues au personnel', debit: 0, credit: totals.netCents },
      { account: PAYACC.cnss, label: 'CNSS · AMO', debit: 0, credit: social },
      { account: PAYACC.igr, label: 'État · IGR', debit: 0, credit: totals.igrCents },
      { account: PAYACC.avances, label: 'Avances et acomptes au personnel', debit: 0, credit: totals.advanceCents },
    ].filter((line) => line.debit > 0 || line.credit > 0);
    if (!balanced(lines)) return fail('unbalanced-entry');
    const series = `PAIE-${period.slice(0, 4)}`;
    const written = await writeDocument(env, {
      id: row.id, merchant, kind: 'payroll', series, date, currency: 'MAD',
      totalCents: totals.grossCents + totals.employerCents, taxCents: totals.igrCents,
      customer: '', parent: '',
    }, lines);
    if (!written) return fail('numbering-conflict');
    await env.DB.prepare(
      "UPDATE payroll_periods SET status = 'exported', journal_number = ?, updated_ts = ? WHERE merchant = ? AND period = ?"
    ).bind(written.number, now(), merchant, period).run();
    /* Les lignes partent avec le résultat : l'écran de paie écrit un vrai CSV
       à partir de ce que le serveur a calculé, jamais d'un tableau reconstruit
       côté navigateur.  Un export tronqué le dit. */
    const rows = list.map((slip) => ({
      memberId: clean(slip.member_id, 80), name: clean(slip.member_name, 120), role: clean(slip.role, 60),
      grossCents: Number(slip.gross_cents || 0), cnssCents: Number(slip.cnss_cents || 0),
      amoCents: Number(slip.amo_cents || 0), igrCents: Number(slip.igr_cents || 0),
      advanceCents: Number(slip.advance_cents || 0), employerCents: Number(slip.employer_cents || 0),
      netCents: Number(slip.net_cents || 0),
    }));
    const summary = Object.assign({
      period, number: written.number, series, seq: written.seq, date, status: 'exported',
      entries: lines.length, balanced: true, alreadyPosted: false,
    }, totals);
    const full = Object.assign({ rows, truncated: false }, summary);
    return update(env, row, 'completed', 'kiwi-payroll',
      safeJson(full, 55000) ? full : Object.assign({ truncated: true }, summary), '', 60000);
  }

  /* submit-cnss — la déclaration fige la période : après elle, un recalcul
     silencieux ferait mentir un bordereau déjà déposé. */
  if (held && held.declaration) {
    return update(env, row, 'completed', 'kiwi-payroll', Object.assign({
      period, declaration: clean(held.declaration, 40), alreadyDeclared: true, status: 'declared',
    }, totals), '');
  }
  const declaration = `DS-${period}`;
  await env.DB.prepare(
    `INSERT INTO payroll_periods (merchant, period, status, employees, gross_cents, net_cents, employer_cents, journal_number, declaration, updated_ts)
     VALUES (?, ?, 'declared', ?, ?, ?, ?, '', ?, ?)
     ON CONFLICT (merchant, period) DO UPDATE SET status = 'declared', declaration = excluded.declaration, updated_ts = excluded.updated_ts`
  ).bind(merchant, period, totals.employees, totals.grossCents, totals.netCents,
    totals.employerCents, declaration, now()).run();
  return update(env, row, 'completed', 'kiwi-payroll', Object.assign({
    period, declaration, alreadyDeclared: false, status: 'declared',
    socialCents: totals.cnssCents + totals.amoCents + totals.employerCents,
  }, totals), '');
}

/* ————— Encaissement à distance —————————————————————————————————————————
 *
 * `create-link` appelait déjà un vrai fournisseur, mais `cancel-link` et
 * `refund-link` n'existaient que dans la liste blanche : elles retombaient sur
 * la branche par défaut d'execute() et répondaient `draft` + {persisted:true}
 * sans rien annuler ni rembourser.  Trois invariants tiennent ici :
 *
 *   · le lien est une pièce du commerçant.  Sa référence PAY-000001 est
 *     attribuée par le serveur ; celle du fournisseur n'est qu'un identifiant
 *     externe rangé à côté, jamais la clé sur laquelle on raisonne ;
 *   · un lien ne devient « payé » que parce que le fournisseur l'affirme
 *     (`settle-link`), jamais parce qu'un client l'a cliqué — et le montant
 *     annoncé est écrêté au montant demandé, sinon un fournisseur bavard
 *     gonflerait la recette ;
 *   · le remboursé est la SOMME des lignes de remboursement, pas un compteur.
 *     L'index unique sur le numéro fait échouer la seconde écriture simultanée,
 *     on relit alors le total et on re-vérifie le plafond avant de réessayer :
 *     deux remboursements lancés ensemble ne peuvent pas dépasser l'encaissé.
 */
async function ensurePayments(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payment_links (
      merchant TEXT NOT NULL, reference TEXT NOT NULL, seq INTEGER NOT NULL,
      command_id TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '',
      url TEXT NOT NULL DEFAULT '', amount_cents INTEGER NOT NULL,
      paid_cents INTEGER NOT NULL DEFAULT 0, currency TEXT NOT NULL DEFAULT 'MAD',
      description TEXT NOT NULL DEFAULT '', customer TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL, created_ts INTEGER NOT NULL, updated_ts INTEGER NOT NULL,
      PRIMARY KEY (merchant, reference)
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_seq ON payment_links (merchant, seq)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS payment_refunds (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, reference TEXT NOT NULL,
      number TEXT NOT NULL, amount_cents INTEGER NOT NULL, reason TEXT NOT NULL DEFAULT '',
      command_id TEXT NOT NULL DEFAULT '', provider_ref TEXT NOT NULL DEFAULT '',
      created_ts INTEGER NOT NULL
    )`
  ).run();
  await env.DB.prepare('CREATE UNIQUE INDEX IF NOT EXISTS idx_pay_refund_number ON payment_refunds (merchant, number)').run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_pay_refund_ref ON payment_refunds (merchant, reference, created_ts)').run();
}

async function refundedFor(env, merchant, reference) {
  const seen = await env.DB.prepare(
    'SELECT COUNT(*) AS lines, COALESCE(SUM(amount_cents), 0) AS total FROM payment_refunds WHERE merchant = ? AND reference = ?'
  ).bind(merchant, reference).first();
  return { lines: Number((seen && seen.lines) || 0), total: Number((seen && seen.total) || 0) };
}

/* L'état se déduit des montants, jamais de l'ordre d'arrivée des commandes :
   un `settle-link` qui traîne ne doit pas repeindre en « payé » un lien déjà
   remboursé. */
function linkState(base, paidCents, refundedCents) {
  if (refundedCents > 0) return refundedCents >= paidCents ? 'refunded' : 'partially-refunded';
  if (paidCents > 0) return 'paid';
  return base;
}

function linkView(link, paidCents, refundedCents) {
  return {
    reference: clean(link.reference, 40),
    status: linkState(clean(link.status, 24), paidCents, refundedCents),
    amountCents: Number(link.amount_cents || 0),
    paidCents, refundedCents,
    refundableCents: Math.max(0, paidCents - refundedCents),
    currency: clean(link.currency, 3), url: clean(link.url, 800),
    customer: clean(link.customer, 160), description: clean(link.description, 240),
    providerRef: clean(link.provider_ref, 160),
  };
}

async function writeLink(env, wish) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const top = await env.DB.prepare(
      'SELECT COALESCE(MAX(seq), 0) AS taken FROM payment_links WHERE merchant = ?'
    ).bind(wish.merchant).first();
    const seq = Number((top && top.taken) || 0) + 1;
    const reference = `PAY-${String(seq).padStart(6, '0')}`;
    const at = now();
    try {
      await env.DB.prepare(
        `INSERT INTO payment_links (merchant, reference, seq, command_id, provider_ref, url,
           amount_cents, paid_cents, currency, description, customer, status, created_ts, updated_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 'active', ?, ?)`
      ).bind(wish.merchant, reference, seq, wish.commandId, wish.providerRef, wish.url,
        wish.amountCents, wish.currency, wish.description, wish.customer, at, at).run();
      return { seq, reference };
    } catch (_) { /* rang pris entre-temps — on recommence sur le suivant */ }
  }
  return null;
}

async function writeRefund(env, wish) {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const seen = await refundedFor(env, wish.merchant, wish.reference);
    if (wish.amountCents > wish.paidCents - seen.total) return { ok: false, reason: 'refund-exceeds-paid' };
    const number = `${wish.reference}/R${seen.lines + 1}`;
    try {
      await env.DB.prepare(
        `INSERT INTO payment_refunds (id, merchant, reference, number, amount_cents, reason,
           command_id, provider_ref, created_ts)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).bind(`${wish.merchant}:${number}`, wish.merchant, wish.reference, number, wish.amountCents,
        wish.reason, wish.commandId, wish.providerRef, now()).run();
      return { ok: true, number, refundedCents: seen.total + wish.amountCents };
    } catch (_) { /* numéro pris — on relit le total et on re-vérifie le plafond */ }
  }
  return { ok: false, reason: 'refund-number-taken' };
}

const SETTLED = new Set(['pending', 'active', 'paid', 'expired', 'cancelled']);

async function payments(env, row, payload) {
  await ensurePayments(env);
  const merchant = row.merchant;
  const fail = (reason) => update(env, row, 'failed', 'payment-link', {}, reason);
  const held = (reason) => update(env, row, 'blocked', 'payment-link', {}, reason);

  if (row.action === 'create-link') {
    const amountCents = cents(payload.amount);
    if (!Number.isFinite(amountCents) || amountCents <= 0 || amountCents > 1000000000) return fail('invalid-amount');
    const currency = clean(payload.currency || 'MAD', 3).toUpperCase();
    const description = clean(payload.description, 240);
    const customer = clean(payload.customer, 160);
    const delivered = await postWebhook(env.PAYMENT_LINK_WEBHOOK, {
      kind: 'payment-link', merchant, commandId: row.id,
      amount: amountCents / 100, currency, description, customer,
      expiresAt: Number(payload.expiresAt || 0) || null,
    });
    if (!delivered.ok) return held(delivered.reason || 'provider-failed');
    const url = clean(delivered.data && delivered.data.url, 800);
    const providerRef = clean(delivered.data && delivered.data.reference, 160);
    if (!/^https:\/\//.test(url)) return fail('provider-returned-no-link');
    const written = await writeLink(env, {
      merchant, commandId: row.id, providerRef, url,
      amountCents, currency, description, customer,
    });
    if (!written) return fail('reference-allocation-failed');
    return update(env, row, 'active', 'payment-link', {
      url, reference: written.reference, providerRef,
      amountCents, currency, status: 'active',
    }, '');
  }

  const reference = clean(payload.reference, 40);
  if (!reference) return fail('reference-required');
  const link = await env.DB.prepare(
    'SELECT * FROM payment_links WHERE merchant = ? AND reference = ?'
  ).bind(merchant, reference).first();
  if (!link) return fail('link-not-found');
  const refunds = await refundedFor(env, merchant, reference);
  const refundedCents = refunds.total;
  let paidCents = Number(link.paid_cents || 0);
  const state = linkState(clean(link.status, 24), paidCents, refundedCents);

  if (row.action === 'cancel-link') {
    /* Rejouer une annulation ne doit pas rappeler le fournisseur ni échouer :
       la commande a déjà eu l'effet demandé. */
    if (state === 'cancelled') {
      return update(env, row, 'completed', 'payment-link',
        Object.assign(linkView(link, paidCents, refundedCents), { alreadyCancelled: true }), '');
    }
    if (paidCents > 0) return fail('link-already-paid');
    const answer = await postWebhook(env.PAYMENT_LINK_WEBHOOK, {
      kind: 'payment-cancel', merchant, commandId: row.id,
      reference, providerRef: clean(link.provider_ref, 160),
    });
    if (!answer.ok) return held(answer.reason || 'provider-failed');
    await env.DB.prepare(
      'UPDATE payment_links SET status = ?, updated_ts = ? WHERE merchant = ? AND reference = ?'
    ).bind('cancelled', now(), merchant, reference).run();
    return update(env, row, 'completed', 'payment-link', Object.assign(
      linkView(link, paidCents, refundedCents), { status: 'cancelled', alreadyCancelled: false }), '');
  }

  if (row.action === 'settle-link') {
    const answer = await postWebhook(env.PAYMENT_LINK_WEBHOOK, {
      kind: 'payment-status', merchant, commandId: row.id,
      reference, providerRef: clean(link.provider_ref, 160),
    });
    if (!answer.ok) return held(answer.reason || 'provider-failed');
    const observed = clean(answer.data && answer.data.status, 24).toLowerCase();
    if (!SETTLED.has(observed)) return fail('provider-returned-no-status');
    let base = clean(link.status, 24);
    if (observed === 'paid') {
      const seen = answer.data.paidAmount == null
        ? Number(link.amount_cents || 0) : cents(answer.data.paidAmount);
      if (!Number.isFinite(seen) || seen <= 0) return fail('provider-returned-no-amount');
      paidCents = Math.min(seen, Number(link.amount_cents || 0));
      base = 'paid';
    } else if (observed === 'expired' || observed === 'cancelled') { base = observed; }
    const status = linkState(base, paidCents, refundedCents);
    await env.DB.prepare(
      'UPDATE payment_links SET paid_cents = ?, status = ?, updated_ts = ? WHERE merchant = ? AND reference = ?'
    ).bind(paidCents, status, now(), merchant, reference).run();
    return update(env, row, 'completed', 'payment-link', Object.assign(
      linkView(link, paidCents, refundedCents), { status, observed }), '');
  }

  if (row.action === 'refund-link') {
    if (paidCents <= 0) return fail('link-not-paid');
    const askedCents = payload.amount == null ? paidCents - refundedCents : cents(payload.amount);
    if (!Number.isFinite(askedCents) || askedCents <= 0) return fail('invalid-amount');
    if (askedCents > paidCents - refundedCents) return fail('refund-exceeds-paid');
    const answer = await postWebhook(env.PAYMENT_LINK_WEBHOOK, {
      kind: 'payment-refund', merchant, commandId: row.id, reference,
      providerRef: clean(link.provider_ref, 160), amount: askedCents / 100,
      currency: clean(link.currency, 3), reason: clean(payload.reason, 240),
    });
    if (!answer.ok) return held(answer.reason || 'provider-failed');
    const written = await writeRefund(env, {
      merchant, reference, amountCents: askedCents, paidCents,
      reason: clean(payload.reason, 240), commandId: row.id,
      providerRef: clean(answer.data && answer.data.reference, 160),
    });
    if (!written.ok) return fail(written.reason);
    const status = linkState(clean(link.status, 24), paidCents, written.refundedCents);
    await env.DB.prepare(
      'UPDATE payment_links SET status = ?, updated_ts = ? WHERE merchant = ? AND reference = ?'
    ).bind(status, now(), merchant, reference).run();
    return update(env, row, 'completed', 'payment-link', Object.assign(
      linkView(link, paidCents, written.refundedCents),
      { status, number: written.number, refundCents: askedCents }), '');
  }

  return fail('unsupported-action');
}

/* Parc et santé des appareils.
 *
 * Le battement de cœur existait déjà côté navigateur ; le serveur répondait
 * « recorded: true » et n'écrivait rien.  Un parc dont on ne garde pas la
 * dernière nouvelle ne dit pas si une caisse est tombée à midi.
 *
 * Trois invariants tiennent ce module.  Un appareil est identifié par un
 * jeton stable qu'il porte lui-même — sans quoi le parc s'effondre à une
 * ligne par type d'application.  Une alarme est un état qui s'ouvre et se
 * ferme dans un journal, pas un booléen qu'on repeint.  Et « hors ligne » se
 * calcule à la lecture : un appareil éteint n'envoie évidemment pas le
 * battement qui le déclarerait absent, donc une machine à états qui ne
 * tournerait qu'à l'écriture ne lèverait jamais cette alarme-là. */
const BEAT_MS = 300000;                          /* période du battement client */
const DEVICE_OFFLINE_MS = 3 * BEAT_MS + 60000;   /* trois battements manqués */
const DEVICE_STALE_MS = 30 * 24 * 3600 * 1000;   /* un appareil oublié sort du parc */

async function ensureDevices(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS device_health (
      merchant TEXT NOT NULL, device_id TEXT NOT NULL,
      app TEXT NOT NULL DEFAULT '', label TEXT NOT NULL DEFAULT '',
      online INTEGER NOT NULL DEFAULT 1, standalone INTEGER NOT NULL DEFAULT 0,
      printer_configured INTEGER NOT NULL DEFAULT 0, printer_connected INTEGER NOT NULL DEFAULT 0,
      alert TEXT NOT NULL DEFAULT '', alert_since_ts INTEGER NOT NULL DEFAULT 0,
      acked_ts INTEGER NOT NULL DEFAULT 0, acked_by TEXT NOT NULL DEFAULT '',
      beats INTEGER NOT NULL DEFAULT 0,
      first_seen_ts INTEGER NOT NULL, last_seen_ts INTEGER NOT NULL,
      PRIMARY KEY (merchant, device_id)
    )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_device_seen ON device_health (merchant, last_seen_ts)').run();
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS device_alerts (
      id TEXT PRIMARY KEY, merchant TEXT NOT NULL, device_id TEXT NOT NULL,
      code TEXT NOT NULL, opened_ts INTEGER NOT NULL, closed_ts INTEGER NOT NULL DEFAULT 0,
      acked_ts INTEGER NOT NULL DEFAULT 0, acked_by TEXT NOT NULL DEFAULT ''
    )`
  ).run();
  await env.DB.prepare('CREATE INDEX IF NOT EXISTS idx_device_alert_open ON device_alerts (merchant, device_id, closed_ts)').run();
}

/* Fonction pure, appelée à l'écriture ET à la lecture.  Une seule alarme à la
   fois, par ordre de gravité : un appareil muet passe avant son imprimante. */
function deviceAlarm(row, at) {
  if (!row) return '';
  if (at - Number(row.last_seen_ts || 0) > DEVICE_OFFLINE_MS) return 'device-offline';
  if (Number(row.printer_configured) && !Number(row.printer_connected)) return 'printer-unreachable';
  if (clean(row.app, 24) === 'caisse' && !Number(row.printer_configured)) return 'printer-unconfigured';
  return '';
}

/* Un battement mis en file hors ligne arrive au serveur bien après avoir été
   émis.  L'horodatage porté par le client fait foi tant qu'il n'est ni futur
   ni vieux d'un jour ; sinon l'heure du serveur reprend la main. */
function beatTime(payload, at) {
  const claimed = Number(payload && payload.at) || 0;
  if (!claimed || claimed > at || at - claimed > 86400000) return at;
  return claimed;
}

async function reconcileAlert(env, merchant, deviceId, before, code, at) {
  if (before === code) return;
  if (before) {
    await env.DB.prepare(
      'UPDATE device_alerts SET closed_ts = ? WHERE merchant = ? AND device_id = ? AND code = ? AND closed_ts = 0'
    ).bind(at, merchant, deviceId, before).run();
  }
  if (code) {
    await env.DB.prepare(
      `INSERT OR IGNORE INTO device_alerts (id, merchant, device_id, code, opened_ts, closed_ts, acked_ts, acked_by)
       VALUES (?, ?, ?, ?, ?, 0, 0, '')`
    ).bind(merchant + ':' + deviceId + ':' + code + ':' + at, merchant, deviceId, code, at).run();
  }
  /* Une alarme neuve n'est pas acquittée : changer de code efface le silence. */
  await env.DB.prepare(
    "UPDATE device_health SET alert = ?, alert_since_ts = ?, acked_ts = 0, acked_by = '' WHERE merchant = ? AND device_id = ?"
  ).bind(code, code ? at : 0, merchant, deviceId).run();
}

function deviceView(row, code, at) {
  const held = code && code === clean(row.alert, 40);
  return {
    deviceId: clean(row.device_id, 80), app: clean(row.app, 24), label: clean(row.label, 80),
    online: !!Number(row.online), standalone: !!Number(row.standalone),
    printerConfigured: !!Number(row.printer_configured), printerConnected: !!Number(row.printer_connected),
    alert: code, alertSince: held ? Number(row.alert_since_ts) || at : at,
    acknowledged: !!(held && Number(row.acked_ts)), ackedBy: held ? clean(row.acked_by, 100) : '',
    beats: Number(row.beats) || 0, firstSeen: Number(row.first_seen_ts) || 0,
    lastSeen: Number(row.last_seen_ts) || 0, silentMs: Math.max(0, at - (Number(row.last_seen_ts) || 0)),
  };
}

async function devices(env, row, payload) {
  await ensureDevices(env);
  const merchant = row.merchant;
  const at = now();
  const deviceId = clean(payload.deviceId, 80);
  const fail = (reason) => update(env, row, 'failed', 'kiwi-device', {}, reason);
  if (!deviceId) return fail('device-id-required');
  const known = await env.DB.prepare(
    'SELECT * FROM device_health WHERE merchant = ? AND device_id = ?'
  ).bind(merchant, deviceId).first();

  if (row.action === 'heartbeat') {
    const seen = Math.max(beatTime(payload, at), Number(known && known.last_seen_ts) || 0);
    const next = {
      app: clean(payload.app, 24) || clean(known && known.app, 24) || 'dashboard',
      label: clean(payload.label, 80) || clean(known && known.label, 80),
      online: payload.online === false ? 0 : 1,
      standalone: payload.standalone ? 1 : 0,
      configured: payload.printerConfigured ? 1 : 0,
      connected: payload.printerConnected ? 1 : 0,
    };
    await env.DB.prepare(
      `INSERT INTO device_health (merchant, device_id, app, label, online, standalone,
         printer_configured, printer_connected, alert, alert_since_ts, acked_ts, acked_by,
         beats, first_seen_ts, last_seen_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', 0, 0, '', 1, ?, ?)
       ON CONFLICT (merchant, device_id) DO UPDATE SET
         app = excluded.app, label = excluded.label, online = excluded.online,
         standalone = excluded.standalone, printer_configured = excluded.printer_configured,
         printer_connected = excluded.printer_connected, beats = device_health.beats + 1,
         last_seen_ts = excluded.last_seen_ts`
    ).bind(merchant, deviceId, next.app, next.label, next.online, next.standalone,
      next.configured, next.connected, seen, seen).run();
    const merged = {
      app: next.app, last_seen_ts: seen,
      printer_configured: next.configured, printer_connected: next.connected,
    };
    const code = deviceAlarm(merged, at);
    await reconcileAlert(env, merchant, deviceId, clean(known && known.alert, 40), code, at);
    return update(env, row, 'completed', 'kiwi-device',
      { deviceId: deviceId, app: next.app, recorded: true, alert: code }, '');
  }

  if (row.action === 'ack-alert') {
    if (!known) return fail('device-unknown');
    const code = deviceAlarm(known, at);
    await reconcileAlert(env, merchant, deviceId, clean(known.alert, 40), code, at);
    /* Acquitter fait taire, pas guérir : un appareil toujours muet le reste. */
    if (!code) return fail('no-open-alert');
    const by = clean(row.requested_by, 100);
    await env.DB.prepare(
      'UPDATE device_health SET acked_ts = ?, acked_by = ? WHERE merchant = ? AND device_id = ?'
    ).bind(at, by, merchant, deviceId).run();
    await env.DB.prepare(
      'UPDATE device_alerts SET acked_ts = ?, acked_by = ? WHERE merchant = ? AND device_id = ? AND code = ? AND closed_ts = 0'
    ).bind(at, by, merchant, deviceId, code).run();
    return update(env, row, 'completed', 'kiwi-device',
      { deviceId: deviceId, code: code, acknowledged: true, ackedBy: by }, '');
  }

  if (row.action === 'test-print') {
    if (payload.printerConfigured === false) {
      return update(env, row, 'blocked', 'local-device', { deviceId: deviceId }, 'printer-unconfigured');
    }
    /* « processing » et non « pending-approval » : la table des transitions
       n'ouvre completed/failed que depuis processing, et c'est l'appareil qui
       rapportera ce que l'imprimante a réellement fait. */
    return update(env, row, 'processing', 'local-device',
      { deviceId: deviceId, instruction: 'execute-on-requesting-device' }, '');
  }
  return fail('unsupported-action');
}

async function execute(env, row, payload) {
  if (row.domain === 'device') return devices(env, row, payload);
  if (row.domain === 'notification') {
    const provider = notificationProvider(row.action, payload);
    if (!provider) return update(env, row, 'blocked', '', {}, 'channel-required');
    let delivered;
    if (provider === 'email') {
      delivered = await sendMail(env, { to: payload.to, subject: payload.subject || 'Kiwi', text: payload.text || '' });
    } else {
      const endpoint = provider === 'sms' ? env.SMS_WEBHOOK : env.WHATSAPP_WEBHOOK;
      delivered = await postWebhook(endpoint, {
        kind: provider, to: clean(payload.to, 120), text: clean(payload.text, 4000),
        reference: clean(payload.reference, 120), merchant: row.merchant, commandId: row.id,
      });
    }
    return delivered && delivered.ok
      ? update(env, row, 'sent', provider, { delivered: true }, '')
      : update(env, row, 'blocked', provider, {}, delivered && delivered.reason || 'delivery-failed');
  }
  if (row.domain === 'payment') return payments(env, row, payload);
  if (row.domain === 'ai') {
    return update(env, row, 'pending-approval', 'kiwi-confirmation', { readOnly: true }, '');
  }
  if (row.domain === 'accounting') return accounting(env, row, payload);
  if (row.domain === 'procurement') return procurement(env, row, payload);
  if (row.domain === 'payroll') return payroll(env, row, payload);
  const initial = row.action.startsWith('export-') || row.action.startsWith('prepare-') ? 'prepared' : 'draft';
  return update(env, row, initial, 'kiwi-workflow', { persisted: true }, '');
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!env || !env.DB) return json({ error: 'not-configured' }, 503);
  const merchant = await tenantFor(request, env, url.searchParams.get('merchant'));
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  /* Command payloads can contain customer contacts, payment references and
     payroll metadata.  A paired register may report health but must never be
     able to enumerate the merchant's operational ledger — and neither may a
     manager, who is kept out of salary figures everywhere else in the product.
     Deliberately narrower than the per-command permissions below. */
  const reader = await actorFor(request, env, merchant);
  if (!reader || (reader.kind !== 'owner' && reader.kind !== 'operator')) {
    return json({ error: 'owner-session-required' }, 403);
  }
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }
  /* Le livre des achats se lit à part : un bon de commande n'est pas une
     commande opérationnelle de plus, et l'écran de réception a besoin du reste
     dû ligne par ligne — sinon il demande au commerçant de taper un numéro et
     une référence de mémoire. */
  if (clean(url.searchParams.get('view'), 24) === 'purchase-orders') {
    try {
      await ensurePurchase(env);
      const open = clean(url.searchParams.get('state'), 16) === 'open';
      const orders = await env.DB.prepare(
        `SELECT number, supplier, currency, status, expected_date, total_cents, invoiced_cents, updated_ts
           FROM purchase_orders WHERE merchant = ?${open ? " AND status IN ('draft','submitted','partial')" : ''}
          ORDER BY seq DESC LIMIT ?`
      ).bind(merchant, Math.max(1, Math.min(60, Number(url.searchParams.get('limit')) || 25))).all();
      const list = orders && orders.results || [];
      if (!list.length) return json({ merchant, orders: [] });
      const lines = await env.DB.prepare(
        `SELECT number, sku, label, unit, qty, unit_cents, received_qty, returned_qty
           FROM purchase_order_lines WHERE merchant = ? AND number IN (${list.map(() => '?').join(',')})
          ORDER BY number, line_no`
      ).bind(merchant, ...list.map((order) => order.number)).all();
      const byNumber = new Map(list.map((order) => [order.number, []]));
      (lines && lines.results || []).forEach((line) => {
        const bucket = byNumber.get(line.number);
        if (bucket) bucket.push({
          sku: line.sku, label: clean(line.label, 160), unit: clean(line.unit, 24),
          qty: Number(line.qty), unitCents: Number(line.unit_cents || 0),
          receivedQty: Number(line.received_qty || 0), returnedQty: Number(line.returned_qty || 0),
        });
      });
      return json({ merchant, orders: list.map((order) => ({
        number: order.number, supplier: clean(order.supplier, 160), currency: clean(order.currency, 3),
        status: clean(order.status, 20), expectedDate: clean(order.expected_date, 10),
        totalCents: Number(order.total_cents || 0), invoicedCents: Number(order.invoiced_cents || 0),
        updatedAt: Number(order.updated_ts || 0), lines: byNumber.get(order.number) || [],
      })) });
    } catch (_) { return json({ error: 'db' }, 503); }
  }
  /* Le livre de paie se lit aussi à part.  Sans période, on renvoie l'état de
     chaque mois — préparé, journalisé, déclaré — parce que c'est la question
     que le commerçant pose en premier : « où j'en suis ? ». */
  /* Le parc.  La lecture réévalue chaque ligne et ouvre les alarmes que le
     temps a rendues vraies : un appareil éteint n'écrit rien, donc s'il fallait
     un battement pour le déclarer absent, il ne le serait jamais. */
  if (clean(url.searchParams.get('view'), 24) === 'devices') {
    try {
      await ensureDevices(env);
      const at = now();
      const seen = await env.DB.prepare(
        'SELECT * FROM device_health WHERE merchant = ? AND last_seen_ts > ? ORDER BY last_seen_ts DESC LIMIT 200'
      ).bind(merchant, at - DEVICE_STALE_MS).all();
      const fleet = [];
      for (const device of (seen && seen.results) || []) {
        const code = deviceAlarm(device, at);
        const view = deviceView(device, code, at);
        if (code !== clean(device.alert, 40)) {
          await reconcileAlert(env, merchant, clean(device.device_id, 80), clean(device.alert, 40), code, at);
          view.acknowledged = false; view.ackedBy = '';
        }
        fleet.push(view);
      }
      return json({
        merchant, devices: fleet,
        thresholds: { beatMs: BEAT_MS, offlineMs: DEVICE_OFFLINE_MS },
        alerts: fleet.filter((d) => d.alert && !d.acknowledged).length,
        offline: fleet.filter((d) => d.alert === 'device-offline').length,
      });
    } catch (_) { return json({ error: 'db' }, 503); }
  }
  if (clean(url.searchParams.get('view'), 24) === 'payments') {
    try {
      await ensurePayments(env);
      const links = await env.DB.prepare(
        `SELECT * FROM payment_links WHERE merchant = ? ORDER BY seq DESC LIMIT 200`
      ).bind(merchant).all();
      const rows = (links && links.results) || [];
      /* Le remboursé est relu ligne à ligne : c'est la seule valeur que le
         journal des remboursements peut contredire. */
      const paid = await env.DB.prepare(
        `SELECT reference, COUNT(*) AS lines, COALESCE(SUM(amount_cents), 0) AS total
           FROM payment_refunds WHERE merchant = ? GROUP BY reference`
      ).bind(merchant).all();
      const back = new Map(((paid && paid.results) || []).map((r) => [String(r.reference), r]));
      return json({ merchant, providers: providers(env), links: rows.map((link) => {
        const seen = back.get(String(link.reference));
        const refundedCents = Number((seen && seen.total) || 0);
        return Object.assign(linkView(link, Number(link.paid_cents || 0), refundedCents), {
          refunds: Number((seen && seen.lines) || 0),
          createdAt: Number(link.created_ts || 0), updatedAt: Number(link.updated_ts || 0),
        });
      }) });
    } catch (_) { return json({ error: 'db' }, 503); }
  }
  if (clean(url.searchParams.get('view'), 24) === 'payslips') {
    try {
      await ensurePayroll(env);
      const period = clean(url.searchParams.get('period'), 7);
      if (period && !PERIOD.test(period)) return json({ error: 'invalid-period' }, 400);
      if (!period) {
        const months = await env.DB.prepare(
          `SELECT period, status, employees, gross_cents, net_cents, employer_cents, journal_number, declaration, updated_ts
             FROM payroll_periods WHERE merchant = ? ORDER BY period DESC LIMIT 24`
        ).bind(merchant).all();
        return json({ merchant, periods: ((months && months.results) || []).map((month) => ({
          period: clean(month.period, 7), status: clean(month.status, 20),
          employees: Number(month.employees || 0), grossCents: Number(month.gross_cents || 0),
          netCents: Number(month.net_cents || 0), employerCents: Number(month.employer_cents || 0),
          number: clean(month.journal_number, 40), declaration: clean(month.declaration, 40),
          updatedAt: Number(month.updated_ts || 0),
        })) });
      }
      const header = await env.DB.prepare(
        'SELECT * FROM payroll_periods WHERE merchant = ? AND period = ?'
      ).bind(merchant, period).first();
      const slips = await env.DB.prepare(
        `SELECT member_id, member_name, role, rate_set, base_cents, overtime_cents, bonus_cents,
                advance_cents, gross_cents, cnss_cents, amo_cents, igr_cents, employer_cents,
                net_cents, dependents
           FROM payslips WHERE merchant = ? AND period = ? ORDER BY member_name, member_id`
      ).bind(merchant, period).all();
      const rows = (slips && slips.results) || [];
      return json({
        merchant, period,
        status: header ? clean(header.status, 20) : rows.length ? 'prepared' : 'none',
        number: header ? clean(header.journal_number, 40) : '',
        declaration: header ? clean(header.declaration, 40) : '',
        totals: payTotals(rows),
        payslips: rows.map((slip) => ({
          memberId: clean(slip.member_id, 80), name: clean(slip.member_name, 120),
          role: clean(slip.role, 60), rateSet: clean(slip.rate_set, 24),
          baseCents: Number(slip.base_cents || 0), overtimeCents: Number(slip.overtime_cents || 0),
          bonusCents: Number(slip.bonus_cents || 0), advanceCents: Number(slip.advance_cents || 0),
          grossCents: Number(slip.gross_cents || 0), cnssCents: Number(slip.cnss_cents || 0),
          amoCents: Number(slip.amo_cents || 0), igrCents: Number(slip.igr_cents || 0),
          employerCents: Number(slip.employer_cents || 0), netCents: Number(slip.net_cents || 0),
          dependents: Number(slip.dependents || 0),
        })),
      });
    } catch (_) { return json({ error: 'db' }, 503); }
  }
  const domain = clean(url.searchParams.get('domain'), 32);
  const status = clean(url.searchParams.get('status'), 32);
  const limit = Math.max(1, Math.min(200, Number(url.searchParams.get('limit')) || 50));
  const filters = ['merchant = ?']; const values = [merchant];
  if (domain) { filters.push('domain = ?'); values.push(domain); }
  if (status) { filters.push('status = ?'); values.push(status); }
  try {
    const rows = await env.DB.prepare(
      `SELECT * FROM operational_commands WHERE ${filters.join(' AND ')} ORDER BY updated_ts DESC LIMIT ?`
    ).bind(...values, limit).all();
    return json({ merchant, providers: providers(env), commands: (rows.results || []).map(publicRow) });
  } catch (_) { return json({ error: 'db' }, 503); }
}

export async function onRequestPost({ request, env }) {
  if (!env || !env.DB || !env.AUTH_SECRET) return json({ error: 'not-configured' }, 503);
  let body; try { body = await request.json(); } catch (_) { return json({ error: 'bad-json' }, 400); }
  const merchant = await tenantFor(request, env, body && body.merchant, { strict: true });
  if (!merchant) return json({ error: 'unauthorized' }, 401);
  try { await ensureSchema(env); } catch (_) { return json({ error: 'unmigrated' }, 503); }

  if (body && body.commandId && body.transition) {
    const id = clean(body.commandId, 128), wanted = clean(body.transition, 32);
    const row = await env.DB.prepare('SELECT * FROM operational_commands WHERE id = ? AND merchant = ?').bind(id, merchant).first();
    if (!row) return json({ error: 'not-found' }, 404);
    /* Moving a command through its lifecycle costs the same permission as
       creating it.  A paired till may write its own device heartbeat, but it may
       not approve, cancel or complete a purchase order: state transitions are
       management actions and must never be authorized by possession of a
       pairing cookie alone. */
    if (!(await mayCommand(request, env, merchant, row.domain, row.action))) {
      return json({ error: 'permission-denied', domain: row.domain, action: row.action }, 403);
    }
    if (!(TRANSITIONS[row.status] && TRANSITIONS[row.status].has(wanted))) return json({ error: 'invalid-transition', status: row.status }, 409);
    if (['approved', 'cancelled', 'completed'].includes(wanted) && body.confirmed !== true) return json({ error: 'confirmation-required' }, 409);
    /* Un échec sans motif n'apprend rien à personne : quand l'appareil ou
       l'opérateur ferme une commande sur un échec ou un blocage, sa raison est
       conservée telle quelle dans last_error. */
    const beaten = ['failed', 'blocked'].includes(wanted) ? clean(body.reason, 120) : '';
    const changed = await update(env, row, wanted, row.provider, parseJson(row.result) || {}, beaten);
    return json({ ok: true, command: publicRow(changed) });
  }

  const domain = clean(body && body.domain, 32).toLowerCase();
  const action = clean(body && body.action, 48).toLowerCase();
  const id = clean(body && body.id, 128);
  const idem = clean(body && body.idempotencyKey, 128);
  const payloadJson = safeJson(body && body.payload, 24000);
  if (!ACTIONS[domain] || !ACTIONS[domain].has(action)) return json({ error: 'unsupported-action' }, 400);
  /* Every command costs a named permission, resolved from the caller's real
     role on this merchant.  A till reports its own heartbeat and nothing else;
     purchasing, payroll, accounting, notifications, payment links and agent
     actions each need the matching grant.  Knowing a pairing cookie is never
     enough to create financial documents or contact arbitrary people. */
  const actor = await mayCommand(request, env, merchant, domain, action);
  if (!actor) {
    return json({ error: 'permission-denied', domain, action }, 403);
  }
  if (!idOk(id) || !idOk(idem) || !payloadJson) return json({ error: 'invalid-command' }, 400);
  if (CONFIRM.has(`${domain}:${action}`) && body.confirmed !== true) return json({ error: 'confirmation-required' }, 409);

  const duplicate = await env.DB.prepare(
    'SELECT * FROM operational_commands WHERE merchant = ? AND idempotency_key = ?'
  ).bind(merchant, idem).first();
  if (duplicate) return json({ ok: true, duplicate: true, command: publicRow(duplicate), providers: providers(env) });

  const at = now();
  const row = {
    id, merchant, domain, action, status: 'queued', provider: '', idempotency_key: idem,
    /* La signature vient de la session prouvée, pas du corps de la requête :
       un acquittement ou un bon d'achat signé d'un nom que l'appelant se donne
       lui-même n'est pas une piste d'audit.  Le libellé client ne sert que
       lorsque rien de mieux n'a pu être prouvé. */
    payload: payloadJson, result: null,
    requested_by: clean(actor.name, 100) || clean(body.requestedBy, 100),
    attempt_count: 0, last_error: '', created_ts: at, updated_ts: at,
  };
  try {
    await env.DB.prepare(
      `INSERT INTO operational_commands
       (id, merchant, domain, action, status, provider, idempotency_key, payload,
        result, requested_by, attempt_count, last_error, created_ts, updated_ts)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(row.id, merchant, domain, action, row.status, '', idem, payloadJson, null,
      row.requested_by, 0, '', at, at).run();
    await event(env, row, 'created', 'queued', { domain, action });
    const finished = await execute(env, row, body.payload || {});
    return json({ ok: true, duplicate: false, command: publicRow(finished), providers: providers(env) });
  } catch (_) {
    const race = await env.DB.prepare('SELECT * FROM operational_commands WHERE merchant = ? AND idempotency_key = ?').bind(merchant, idem).first();
    if (race) return json({ ok: true, duplicate: true, command: publicRow(race), providers: providers(env) });
    return json({ error: 'db' }, 503);
  }
}
