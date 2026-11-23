/* Kiwi · DÉPENSES · le registre du patron (Pasta Corner, 17 nov. 2026).
 * ---------------------------------------------------------------------------
 * Le patron voit ce qui est entré, ce qui est sorti et ce qui reste, mois par
 * mois ; il ajoute une dépense à la main ou en photographiant le ticket, et
 * ce que l'équipe a sorti du tiroir arrive ici tout seul, classé d'après son
 * motif, prêt à être complété.
 *
 *   · le document `expenses` (KiwiStore, copie serveur via cloud-doc.js) tient
 *     les dépenses saisies ; fusion par ligne, la plus récente gagne, une
 *     suppression est une pierre tombale (engine.js › mergeDocs) ;
 *   · /api/expenses/summary rend les ventes par journée commerciale et les
 *     retraits du tiroir du mois ; sans réseau la page montre ce qu'elle a ;
 *   · /api/expenses/receipt garde la photo du ticket, privée ;
 *   · /api/ai/expense-ocr lit le ticket (modèles gratuits, quota du jour).
 *
 * Interrupteur par commerçant, éteint par défaut (merchant-config.js ›
 * optInOff) ; menu réservé au patron (dashboard.html). Ouvert par
 * Kiwi.handlers['nav-expenses'], rendu par Kiwi.appPage comme les autres
 * pages pleines. Logique pure dans engine.js, rendu dans view.js, fiche dans
 * sheet.js, mots dans strings.js, style dans style.js. */
import * as E from './engine.js?v=6';
import { tr } from './strings.js?v=4';
import { pageHtml, emptyHtml, loadingHtml, listHtml } from './view.js?v=4';
import { openSheet, shrinkPhoto } from './sheet.js?v=7';
import { ensureStyle } from './style.js?v=2';

const ZONE = 'Africa/Casablanca';
const CUTOFF_H = 5;
/* Les charges de charges.js, ramenées aux catégories de dépenses. */
const CHARGE_CAT = {
  rent: 'rent', utilities: 'energy', telecom: 'other', insurance: 'other', accounting: 'other',
  financing: 'other', software: 'other', maintenance: 'repairs', marketing: 'marketing', taxes: 'taxes', other: 'other',
};

const S = {
  month: '',
  filter: { cat: '', day: '', q: '' },
  summaries: new Map(),     // mois → { status: 'loading' | 'ok' | 'error' | 'none', data }
  zone: ZONE,
  cutoff: CUTOFF_H,
  view: null,
};
let store = null;

function getStore() {
  if (!store && window.KiwiStore && window.KiwiStore.define) {
    store = window.KiwiStore.define('expenses', {
      cloud: 'expenses',
      blank: () => ({ list: [] }),
      merge: E.mergeDocs,
      isEmpty: (d) => !(d && Array.isArray(d.list) && d.list.length),
    });
    try { store.subscribe(() => schedule()); } catch (_) { /* pas d'abonnement : rendu explicite */ }
  }
  return store;
}
const doc = () => { const s = getStore(); return E.normalize((s && s.get()) || { list: [] }); };
const merchant = () => { try { return (window.KiwiStore && window.KiwiStore.slugFor && window.KiwiStore.slugFor()) || ''; } catch (_) { return ''; } };
const onPage = () => !!document.querySelector('.dash-genpage .xp');

/* La journée commerciale : l'heure du commerce moins la coupure (05:00). */
function businessToday() {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: S.zone, year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(new Date(Date.now() - S.cutoff * 3600 * 1000));
  } catch (_) { return new Date(Date.now() - S.cutoff * 3600 * 1000).toISOString().slice(0, 10); }
}

function fixedInputs() {
  try {
    const K = window.KiwiCharges;
    if (!K || !K.configured || !K.configured()) return {};
    const m = K.monthly() || {};
    const charges = Object.entries(m.byCat || {}).map(([c, mad]) => ({ category: CHARGE_CAT[c] || 'other', monthlyCents: Math.round(Number(mad) * 100) }))
      .filter((c) => c.monthlyCents > 0);
    const staff = m.staff && Number(m.staff.total) > 0 ? { monthlyCents: Math.round(Number(m.staff.total) * 100) } : null;
    return { charges, salaries: staff };
  } catch (_) { return {}; }
}

async function loadSummary(month) {
  const slug = merchant();
  if (!slug) { S.summaries.set(month, { status: 'none', data: null }); return; }
  const prev = S.summaries.get(month);
  S.summaries.set(month, { status: prev && prev.data ? 'ok' : 'loading', data: prev ? prev.data : null });
  try {
    const r = await fetch(`/api/expenses/summary?merchant=${encodeURIComponent(slug)}&month=${encodeURIComponent(month)}`,
      { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    const j = r.ok ? await r.json() : null;
    if (!j || !j.ok) throw new Error('summary ' + r.status);
    if (j.zone) S.zone = j.zone;
    if (Number.isFinite(Number(j.cutoff))) S.cutoff = Number(j.cutoff);
    S.summaries.set(month, { status: 'ok', data: { salesDays: j.salesDays || [], cashOuts: j.cashOuts || [], staff: j.staff || [] } });
  } catch (_) {
    const had = S.summaries.get(month);
    S.summaries.set(month, { status: 'error', data: had ? had.data : null });
  }
  if (S.month === month && onPage()) render();
}

let queued = false;
function schedule() {
  if (queued) return;
  queued = true;
  queueMicrotask(() => { queued = false; if (onPage()) render(); });
}

function render(opts) {
  const K = window.Kiwi;
  if (!K || !K.appPage) return;
  ensureStyle();
  const today = businessToday();
  if (!S.month) S.month = today.slice(0, 7);
  const sum = S.summaries.get(S.month) || { status: merchant() ? 'loading' : 'none', data: null };
  const data = sum.data || { salesDays: [], cashOuts: [] };
  const list = doc().list;
  const view = E.monthView({
    month: S.month, today, expenses: list, cashOuts: data.cashOuts, salesDays: data.salesDays, staff: data.staff,
    ...(S.month === today.slice(0, 7) ? fixedInputs() : {}),
  });
  S.view = view;
  const uncounted = E.uncountedCashOuts(data.cashOuts).filter((e) => e.date.slice(0, 7) === S.month);
  const firstUse = sum.status !== 'loading' && !view.rows.length && !list.some((r) => !r.deleted)
    && !uncounted.length && view.inCents <= 0;
  const m = {
    month: S.month, today, view, uncounted, status: sum.status, filter: S.filter,
    enter: !!(opts && opts.enter), canNext: S.month < today.slice(0, 7),
  };
  /* Un rafraîchissement (copie d'un autre appareil, caisse relue) ne doit
     pas arracher la recherche des doigts de celui qui tape. */
  const typing = document.activeElement && document.activeElement.matches && document.activeElement.matches('.xp [data-xp-search]')
    ? { start: document.activeElement.selectionStart, end: document.activeElement.selectionEnd } : null;
  const r = K.appPage('expenses', { title: tr('title'), subtitle: tr('subtitle'), body: sum.status === 'loading' ? loadingHtml(m) : firstUse ? emptyHtml(m) : pageHtml(m) });
  if (r && r.el) {
    bind(r.el);
    const search = typing && r.el.querySelector('[data-xp-search]');
    if (search) { search.focus({ preventScroll: true }); try { search.setSelectionRange(typing.start, typing.end); } catch (_) {} }
  }
}

function shiftMonth(month, by) {
  const [y, mo] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + by, 1));
  return d.toISOString().slice(0, 7);
}

/* Les fiches fournisseurs du grand livre (/api/suppliers) se proposent aussi :
   une dépense qui en nomme une s'inscrit à son relevé (linkSupplier). */
let ledgerNames = null;
function loadLedgerNames() {
  const slug = merchant();
  if (ledgerNames || !slug) return;
  ledgerNames = [];
  fetch('/api/suppliers?merchant=' + encodeURIComponent(slug), { credentials: 'same-origin' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => { ledgerNames = ((j && j.suppliers) || []).map((x) => String(x.name || '')).filter(Boolean); })
    .catch(() => {});
}
function linkSupplier(row, deleted) {
  const slug = merchant();
  if (!slug || !row || !row.id) return;
  fetch('/api/suppliers/expense', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merchant: slug, expenseId: row.id, supplier: row.supplier || '', amountCents: row.amountCents, date: row.date,
      method: row.method, note: row.note || '', version: row.updatedAt || 0, deleted: !!(deleted || row.deleted) }) }).catch(() => {});
}

function suppliers() {
  loadLedgerNames();
  const seen = new Map();
  (ledgerNames || []).forEach((n) => { const k = n.toLowerCase(); if (!seen.has(k)) seen.set(k, n); });
  doc().list.filter((r) => !r.deleted && r.supplier).sort((a, b) => b.updatedAt - a.updatedAt)
    .forEach((r) => { const k = r.supplier.toLowerCase(); if (!seen.has(k)) seen.set(k, r.supplier); });
  return [...seen.values()];
}

function receiptUrl(id) {
  const slug = merchant();
  return slug ? `/api/expenses/receipt?merchant=${encodeURIComponent(slug)}&id=${encodeURIComponent(id)}` : '';
}

function upsert(row) {
  const d = doc();
  const i = d.list.findIndex((r) => r.id === row.id);
  if (i >= 0) d.list[i] = row; else d.list.push(row);
  getStore().set(d);
  schedule();
}

async function uploadReceipt(row, photo) {
  const url = receiptUrl(row.id);
  if (!url || !photo) return;
  try {
    /* Décodée ici plutôt que par fetch(data:) : la politique de contenu du
       tableau de bord peut refuser une connexion vers data:. */
    const bin = atob(String(photo).split(',')[1] || '');
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const blob = new Blob([bytes], { type: 'image/jpeg' });
    const r = await fetch(url, { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'image/jpeg' }, body: blob });
    const j = r.ok ? await r.json() : null;
    if (!j || !j.ok) throw new Error('receipt ' + r.status);
    const cur = doc().list.find((x) => x.id === row.id && !x.deleted);
    if (cur) upsert({ ...cur, receiptKey: j.key, updatedAt: E.nextStamp(cur.updatedAt) });
  } catch (_) {
    try { window.Kiwi.toast(tr('photoFailed'), { type: 'warn' }); } catch (_e) { /* pas de toast */ }
  }
}

const callbacks = {
  onSave(row, extra) {
    upsert(row);
    linkSupplier(row, false);
    try { window.Kiwi.toast(tr('saved'), { type: 'success' }); } catch (_) {}
    if (extra && extra.photo) uploadReceipt(row, extra.photo);
  },
  onDelete(row) {
    upsert(row);
    linkSupplier(row, true);
    /* La photo part avec la dépense ; un échec la laisse, sans gêner la suppression. */
    const url = row.receiptKey ? receiptUrl(row.id) : '';
    if (url) fetch(url, { method: 'DELETE', credentials: 'same-origin' }).catch(() => {});
    try { window.Kiwi.toast(tr('deleted'), { type: 'success' }); } catch (_) {}
  },
};

function openRow(id) {
  const shown = (S.view && S.view.rows) || [];
  const r = shown.find((x) => x.id === id);
  if (!r) return;
  if (r.source === 'till' && r.guessed) {
    openSheet({ mode: 'complete', row: r, today: businessToday(), suppliers: suppliers() }, callbacks);
    return;
  }
  const stored = doc().list.find((x) => x.id === id) || r;
  openSheet({ mode: 'edit', row: stored, today: businessToday(), suppliers: suppliers(), receiptUrl: stored.receiptKey ? receiptUrl(id) : '' }, callbacks);
}

/* « Garder les catégories devinées » : chaque retrait que le motif a classé
   devient la même ligne que la fiche « Compléter » écrirait (identifiant tiré
   du mouvement, engine.js › completionId), en une seule écriture du document.
   « Divers » n'est pas une réponse : il reste à compléter. */
function acceptGuesses() {
  const raw = ((S.view && S.view.rows) || []).filter((r) => r.source === 'till' && r.guessed && r.category !== 'other');
  if (!raw.length) return;
  const d = doc();
  const now = Date.now();
  raw.forEach((r) => {
    const id = E.completionId(r.cashEventId);
    const prev = d.list.find((x) => x.id === id);
    const row = {
      id, date: r.date, amountCents: r.amountCents, category: r.category, method: 'cash', supplier: '',
      note: r.note || '', vatCents: 0, source: 'till', cashEventId: r.cashEventId,
      createdAt: prev && prev.createdAt ? prev.createdAt : now, updatedAt: E.nextStamp(prev && prev.updatedAt, now),
    };
    const i = d.list.findIndex((x) => x.id === id);
    if (i >= 0) d.list[i] = row; else d.list.push(row);
  });
  getStore().set(d);
  schedule();
  try { window.Kiwi.toast(raw.length === 1 ? tr('accepted1') : tr('acceptedN', { n: raw.length }), { type: 'success' }); } catch (_) {}
}

function exportCsv() {
  const rows = (S.view && S.view.rows) || [];
  const blob = new Blob(['﻿' + E.toCsv(rows)], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `depenses-${merchant() || 'kiwi'}-${S.month}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

async function scanFile(file) {
  let photo = '';
  try { photo = await shrinkPhoto(file); } catch (_) { photo = ''; }
  const sheet = openSheet({ mode: 'add', today: businessToday(), suppliers: suppliers(), photo, reading: true }, callbacks);
  if (!photo) { sheet.scanFailed('read'); return; }
  try {
    const r = await fetch('/api/ai/expense-ocr', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: merchant(), image: photo }),
    });
    const j = await r.json().catch(() => null);
    if (r.ok && j && j.ok && j.data) sheet.applyScan(j.data);
    else sheet.scanFailed(r.status === 429 ? 'quota' : 'read');
  } catch (_) {
    sheet.scanFailed('read');
  }
}

function bind(host) {
  host.addEventListener('click', (e) => {
    const a = e.target.closest('[data-xp-act]');
    if (a) {
      const act = a.dataset.xpAct;
      if (act === 'prev' || act === 'next') {
        S.month = shiftMonth(S.month, act === 'prev' ? -1 : 1);
        S.filter.day = '';
        loadSummary(S.month);
        render({ enter: true });
      } else if (act === 'add') {
        openSheet({ mode: 'add', today: businessToday(), suppliers: suppliers() }, callbacks);
      } else if (act === 'scan') {
        const f = host.querySelector('[data-xp-file]');
        if (f) f.click();
      } else if (act === 'csv') {
        exportCsv();
      } else if (act === 'accept-guesses') {
        acceptGuesses();
      } else if (act === 'complete-first') {
        const first = ((S.view && S.view.rows) || []).find((r) => r.source === 'till' && r.guessed);
        if (first) openRow(first.id);
      } else if (act === 'open') {
        openRow(a.dataset.id);
      }
      return;
    }
    const f = e.target.closest('[data-xp-filter]');
    if (f) { S.filter.cat = S.filter.cat === f.dataset.xpFilter ? '' : f.dataset.xpFilter; render(); return; }
    const d = e.target.closest('[data-xp-day]');
    if (d && !d.disabled) { S.filter.day = S.filter.day === d.dataset.xpDay ? '' : d.dataset.xpDay; render(); }
  });
  const search = host.querySelector('[data-xp-search]');
  if (search) {
    search.addEventListener('input', () => {
      S.filter.q = search.value;
      const body = host.querySelector('.xp-list-body');
      if (body && S.view) body.innerHTML = listHtml(S.view.rows, S.filter);
    });
  }
  const file = host.querySelector('[data-xp-file]');
  if (file) {
    file.addEventListener('change', () => {
      const f = file.files && file.files[0];
      file.value = '';
      if (f) scanFile(f);
    });
  }
}

function show() {
  /* La règle du patron (dashboard.html › wrap) entourait le chargeur ; ce
     gestionnaire le remplace, il la porte donc lui-même : un appareil
     déverrouillé par un gérant ne rouvre pas la copie locale. */
  if ((window.__kiwiRole || 'owner') !== 'owner') {
    try { window.Kiwi.toast(tr('ownerOnly'), { type: 'info' }); } catch (_) {}
    return;
  }
  getStore();
  if (!S.month) S.month = businessToday().slice(0, 7);
  S.filter = { cat: '', day: '', q: '' };
  render({ enter: true });
  loadSummary(S.month);
}

/* « Ajouter aux dépenses » sur une facture lue par l'assistant (agent-voice.js) :
   la fiche s'ouvre préremplie, les champs lus marqués « à vérifier », la photo
   jointe. Rien ne s'écrit sans « Enregistrer ». Rend { doneLabel } une fois
   enregistrée, 'cancelled' si la fiche se ferme sans, { error } si la page
   n'est pas permise. La même pièce déjà enregistrée s'ouvre au lieu d'un doublon. */
function fromDocument(ent, extra) {
  if ((window.__kiwiRole || 'owner') !== 'owner') return { error: tr('ownerOnly') };
  try { if (window.KiwiConfig && window.KiwiConfig.off && window.KiwiConfig.off('expenses')) return { error: tr('docOff') }; } catch (_) {}
  getStore();
  const today = businessToday();
  const p = E.docPrefill(ent, today);
  const dup = E.docDuplicate(doc().list, ent);
  if (dup) {
    try { window.Kiwi.toast(tr('docAlready'), { type: 'info' }); } catch (_) {}
    openSheet({ mode: 'edit', row: dup, today, suppliers: suppliers(), receiptUrl: dup.receiptKey ? receiptUrl(dup.id) : '' }, callbacks);
    return { doneLabel: tr('docAdded') };
  }
  const photo = extra && /^data:image\/jpeg;base64,/.test(String(extra.photo || '')) ? extra.photo : '';
  return new Promise((resolve) => {
    let saved = false;
    const sheet = openSheet({
      mode: 'add', today, suppliers: suppliers(), photo,
      row: { vatCents: p.vatCents, method: p.method, note: p.ref ? tr('docNote', { n: p.ref }) : '' },
    }, { ...callbacks, onSave(row, x) { saved = true; callbacks.onSave(row, x); resolve({ doneLabel: tr('docAdded') }); } });
    sheet.applyScan({ amount: p.amountCents / 100, supplier: p.supplier, date: p.date, category: p.category });
    const el = sheet.el;
    if (!el || !el.parentNode) return;
    const mo = new MutationObserver(() => {
      if (el.isConnected) return;
      mo.disconnect();
      if (!saved) resolve('cancelled');
    });
    mo.observe(el.parentNode, { childList: true });
  });
}

function register() {
  const K = window.Kiwi;
  if (!K || !K.handlers) return false;
  K.handlers['nav-expenses'] = show;
  K.handlers['expense-from-doc'] = fromDocument;
  return true;
}
if (!register()) document.addEventListener('DOMContentLoaded', register, { once: true });
window.addEventListener('kiwi:langchange', () => { if (onPage()) render(); });
