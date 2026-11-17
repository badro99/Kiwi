/* Dépenses · le rendu. Des fonctions pures qui rendent du HTML à partir de la
 * vue du mois (engine.js › monthView) et de l'état de la page ; aucun
 * stockage, aucun réseau. Tout texte du commerçant (fournisseur, note, motif de
 * caisse) passe par esc(). Les chiffres portent data-cents : la vérité du
 * montant, lisible par les tests et par un lecteur d'écran via aria-label. */
import { tr, lang } from './strings.js?v=2';

export const CAT_ICON = {
  meat: 'kebab_dining', produce: 'eco', grocery: 'local_grocery_store', drinks: 'local_drink',
  hygiene: 'cleaning_services', packaging: 'inventory', supplier: 'local_shipping', energy: 'bolt',
  rent: 'storefront', repairs: 'handyman', transport: 'two_wheeler', staff: 'group',
  marketing: 'campaign', equipment: 'skillet', taxes: 'gavel', other: 'more_horiz',
};

export const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => `<i data-icon="${name}" aria-hidden="true"></i>`;
export const catLabel = (c) => tr('cat.' + c) || tr('cat.other');

export function locale() {
  const l = lang();
  return l === 'en' ? 'en-GB' : l === 'ar' ? 'ar-MA-u-nu-latn' : 'fr-FR';
}

/* 41250 → « 412,50 » ; 30000 → « 300 ». Les centimes n'apparaissent que
   quand il y en a. */
export function money(cents) {
  const v = Math.round(Number(cents) || 0) / 100;
  const frac = Math.round(Number(cents) || 0) % 100 !== 0;
  try {
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: frac ? 2 : 0, maximumFractionDigits: 2 }).format(v);
  } catch (_) { return frac ? v.toFixed(2) : String(Math.round(v)); }
}
const withCur = (cents) => `${money(cents)}<small>${esc(tr('cur'))}</small>`;
const plain = (cents) => `${money(cents)} ${tr('cur')}`;

const utc = (day) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d || 1); };
export function dayLabel(day, opts) {
  try { return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', ...(opts || { weekday: 'long', day: 'numeric', month: 'long' }) }).format(utc(day)); }
  catch (_) { return day; }
}
export function monthLabel(month) {
  try { return new Intl.DateTimeFormat(locale(), { timeZone: 'UTC', month: 'long', year: 'numeric' }).format(utc(month + '-01')); }
  catch (_) { return month; }
}

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ٕͯٔ]/g, '').toLowerCase();

export function filterRows(rows, filter) {
  const f = filter || {};
  const q = fold(f.q).trim();
  return rows.filter((r) => (!f.cat || r.category === f.cat) && (!f.day || r.date === f.day)
    && (!q || fold([r.supplier, r.note, catLabel(r.category)].join(' ')).includes(q)));
}

function rowHtml(r) {
  const raw = r.source === 'till' && r.guessed;
  const title = raw ? (r.note || tr('tillWithdrawal')) : (r.supplier || r.note || catLabel(r.category));
  const bits = [esc(catLabel(r.category))];
  if (!raw) bits.push(esc(tr('m.' + r.method)));
  if (!raw && r.supplier && r.note) bits.push(esc(r.note));
  const badges = [];
  if (r.source === 'till') badges.push(`<span class="xp-badge till">${esc(tr('till'))}</span>`);
  if (raw) badges.push(`<span class="xp-badge guess">${esc(tr('guessed'))}</span>`);
  if (r.source === 'scan') badges.push(`<span class="xp-badge scan">${esc(tr('scanned'))}</span>`);
  if (r.receiptKey) badges.push(`<span class="xp-badge" title="${esc(tr('withPhoto'))}">${icon('receipt')}</span>`);
  return `<button type="button" class="xp-row" data-xp-act="open" data-id="${esc(r.id)}" data-cents="${r.amountCents}" data-source="${esc(r.source)}">
    <span class="xp-row-ico">${icon(CAT_ICON[r.category] || 'more_horiz')}</span>
    <span class="xp-row-main"><span class="xp-row-t">${esc(title)}</span>
      <span class="xp-row-s">${bits.map((b) => `<span>${b}</span>`).join('')}${badges.join('')}</span></span>
    <span class="xp-row-amt">${esc(plain(r.amountCents))}</span>
  </button>`;
}

export function listHtml(rows, filter) {
  const shown = filterRows(rows, filter);
  if (!shown.length) return `<p class="xp-none">${esc(tr('noMatch'))}</p>`;
  const days = new Map();
  shown.forEach((r) => { if (!days.has(r.date)) days.set(r.date, []); days.get(r.date).push(r); });
  return [...days.entries()].map(([day, list]) => `<div class="xp-group">
    <div class="xp-group-h"><span>${esc(dayLabel(day))}</span><span>${esc(plain(list.reduce((s, r) => s + r.amountCents, 0)))}</span></div>
    ${list.map(rowHtml).join('')}
  </div>`).join('');
}

function barHtml(m) {
  return `<div class="xp-bar">
    <div class="xp-month">
      <button type="button" class="xp-iconbtn" data-xp-act="prev" aria-label="${esc(tr('prevMonth'))}">${icon('chevron_left')}</button>
      <b>${esc(monthLabel(m.month))}</b>
      <button type="button" class="xp-iconbtn" data-xp-act="next" aria-label="${esc(tr('nextMonth'))}"${m.canNext ? '' : ' disabled'}>${icon('chevron_right')}</button>
    </div>
    <div class="xp-actions">
      <button type="button" class="xp-btn ghost" data-xp-act="csv" title="${esc(tr('csvHint'))}">${icon('download')}<span>${esc(tr('csv'))}</span></button>
      <button type="button" class="xp-btn" data-xp-act="add">${icon('add')}<span>${esc(tr('add'))}</span></button>
      <button type="button" class="xp-btn primary" data-xp-act="scan">${icon('document_scanner')}<span>${esc(tr('scan'))}</span></button>
    </div>
  </div>`;
}

function heroHtml(v) {
  const over = v.outCents > v.inCents;
  const w = v.inCents > 0 ? Math.min(100, (v.outCents / v.inCents) * 100) : (v.outCents > 0 ? 100 : 0);
  const top = v.byCategory[0];
  const lines = [];
  if (v.inCents <= 0) lines.push(esc(tr('insightNoIn')));
  else lines.push(esc(tr('insightShare', { pct: Math.round((v.outCents / v.inCents) * 100) })));
  if (top && v.outCents > 0) {
    lines.push(tr('insightTop', { cat: `<b>${esc(catLabel(top.category))}</b>`, pct: Math.round((top.cents / v.outCents) * 100) }));
  }
  return `<section class="xp-card xp-hero">
    <div>
      <span class="xp-k">${esc(over ? tr('overspent') : tr('left'))}</span>
      <b class="xp-big${v.leftCents < 0 ? ' neg' : ''}" data-xp="left" data-cents="${v.leftCents}">${withCur(v.leftCents)}</b>
      <p class="xp-insight">${lines.join(' ')}</p>
    </div>
    <div class="xp-pair">
      <div class="in"><span class="xp-k">${esc(tr('in'))}</span><b data-xp="in" data-cents="${v.inCents}">${withCur(v.inCents)}</b></div>
      <div class="out"><span class="xp-k">${esc(tr('out'))}</span><b data-xp="out" data-cents="${v.outCents}">${withCur(v.outCents)}</b></div>
    </div>
    <div class="xp-split${over ? ' over' : ''}" role="img" aria-label="${esc(tr('splitLabel', { out: plain(v.outCents), in: plain(v.inCents) }))}"><i style="--w:${w.toFixed(2)}%"></i></div>
  </section>`;
}

function calloutHtml(rows) {
  const raw = rows.filter((r) => r.source === 'till' && r.guessed);
  if (!raw.length) return '';
  const head = raw.length === 1 ? tr('toComplete1') : tr('toCompleteN', { n: raw.length });
  return `<div class="xp-callout" role="status">${icon('point_of_sale')}
    <p><b>${esc(head)}</b>${esc(tr('toCompleteSub'))}</p>
    <button type="button" class="xp-btn" data-xp-act="complete-first">${esc(tr('completeFirst'))}</button>
  </div>`;
}

function uncountedHtml(list) {
  if (!list.length) return '';
  const bank = list.filter((e) => e.kind === 'bank');
  const other = list.filter((e) => e.kind !== 'bank');
  const sum = (l) => l.reduce((s, e) => s + e.amountCents, 0);
  const out = [];
  if (bank.length) out.push(bank.length === 1 ? tr('deposits1', { amount: plain(sum(bank)) }) : tr('depositsN', { n: bank.length, amount: plain(sum(bank)) }));
  if (other.length) out.push(tr('movedN', { n: other.length, amount: plain(sum(other)) }));
  return `<p class="xp-aside">${icon('account_balance')}<span>${esc(out.join(' '))}</span></p>`;
}

function catsHtml(v, filter) {
  if (!v.byCategory.length) return '';
  const max = v.byCategory[0].cents || 1;
  return `<section class="xp-card">
    <div class="xp-h"><h2>${esc(tr('whereH'))}</h2><span>${esc(v.rows.length === 1 ? tr('count1') : tr('countN', { n: v.rows.length }))}</span></div>
    <div class="xp-cats">${v.byCategory.map((c) => `<button type="button" class="xp-cat" data-xp-filter="${esc(c.category)}" aria-pressed="${filter.cat === c.category}">
      <span class="xp-cat-ico">${icon(CAT_ICON[c.category] || 'more_horiz')}</span>
      <span class="xp-cat-name">${esc(catLabel(c.category))}</span>
      <span class="xp-cat-amt">${esc(plain(c.cents))}</span>
      <span class="xp-cat-track"><i style="--w:${((c.cents / max) * 100).toFixed(1)}%"></i></span>
      <span class="xp-cat-pct">${v.outCents > 0 ? Math.round((c.cents / v.outCents) * 100) : 0} %</span>
    </button>`).join('')}</div>
  </section>`;
}

function daysHtml(v, m) {
  const max = Math.max(1, ...v.byDay.map((d) => d.outCents));
  const last = v.byDay.length;
  return `<section class="xp-card">
    <div class="xp-h"><h2>${esc(tr('daysH'))}</h2><span>${m.filter.day ? esc(tr('dayFilter', { day: dayLabel(m.filter.day, { day: 'numeric', month: 'long' }) })) : ''}</span></div>
    <div class="xp-days">${v.byDay.map((d, i) => {
      const cls = ['xp-day', d.outCents > 0 ? 'has' : '', d.day === m.today ? 'today' : '', d.day > m.today ? 'future' : ''].filter(Boolean).join(' ');
      const h = d.outCents > 0 ? Math.max(4, (d.outCents / max) * 100) : 0;
      return `<button type="button" class="${cls}" data-xp-day="${d.day}" aria-pressed="${m.filter.day === d.day}" aria-label="${esc(dayLabel(d.day, { day: 'numeric', month: 'long' }) + ' · ' + plain(d.outCents))}" style="--h:${h.toFixed(1)}%;--i:${i}"${d.day > m.today ? ' disabled' : ''}><i></i></button>`;
    }).join('')}</div>
    <div class="xp-days-axis"><span>1</span><span>${Math.ceil(last / 2)}</span><span>${last}</span></div>
  </section>`;
}

function fixedHtml(f) {
  if (!f) return '';
  const after = f.afterFixedCents;
  return `<section class="xp-card">
    <div class="xp-h"><h2>${esc(tr('fixedH'))}</h2></div>
    <p class="xp-soft-note">${esc(tr('fixedSub'))}</p>
    <div class="xp-fixed">
      <div><b>${esc(tr('fixedCharges'))}</b><span>${esc(plain(f.chargesCents))}</span></div>
      <div><b>${esc(tr('fixedSalaries'))}</b><span>${esc(plain(Math.max(0, f.salariesCents - f.advancesCents)))}</span></div>
      <div class="total${after < 0 ? ' neg' : ''}"><b>${esc(tr('fixedAfter'))}</b><span data-xp="after-fixed" data-cents="${after}">${esc(plain(after))}</span></div>
    </div>
  </section>`;
}

const fileInput = () => `<input class="xp-file" type="file" accept="image/*" capture="environment" data-xp-file tabindex="-1" aria-hidden="true">`;

/* Avant que la caisse réponde : ni héros ni zéros, seulement la barre du mois. */
export function loadingHtml(m) {
  return `<div class="xp">${barHtml(m)}
    <section class="xp-card xp-loading" aria-busy="true"><p class="xp-soft-note">${esc(tr('loading'))}</p></section>${fileInput()}</div>`;
}

export function emptyHtml(m) {
  return `<div class="xp">${barHtml(m)}
    <section class="xp-card xp-empty">
      <span class="xp-empty-ico">${icon('receipt_long')}</span>
      <h2>${esc(tr('emptyH'))}</h2>
      <p>${esc(tr('emptyP'))}</p>
      <div class="xp-actions">
        <button type="button" class="xp-btn primary" data-xp-act="scan">${icon('document_scanner')}<span>${esc(tr('scan'))}</span></button>
        <button type="button" class="xp-btn" data-xp-act="add">${icon('add')}<span>${esc(tr('add'))}</span></button>
      </div>
      ${m.status === 'error' ? `<p class="xp-soft-note">${esc(tr('historyOff'))}</p>` : ''}
    </section>${fileInput()}</div>`;
}

export function pageHtml(m) {
  const v = m.view;
  const chips = [];
  if (m.filter.cat) chips.push(`<button type="button" class="xp-chip" data-xp-filter="${esc(m.filter.cat)}">${esc(catLabel(m.filter.cat))} ${icon('close')}</button>`);
  if (m.filter.day) chips.push(`<button type="button" class="xp-chip" data-xp-day="${esc(m.filter.day)}">${esc(dayLabel(m.filter.day, { day: 'numeric', month: 'long' }))} ${icon('close')}</button>`);
  return `<div class="xp${m.enter ? ' xp-enter' : ''}">
    ${barHtml(m)}
    ${m.status === 'error' ? `<p class="xp-aside">${icon('info')}<span>${esc(tr('historyOff'))}</span></p>` : ''}
    ${heroHtml(v)}
    ${calloutHtml(v.rows)}
    ${uncountedHtml(m.uncounted)}
    <div class="xp-grid2">
      <div style="display:grid;gap:18px;">${catsHtml(v, m.filter)}${daysHtml(v, m)}${fixedHtml(v.fixed)}</div>
      <section class="xp-card">
        <div class="xp-h"><h2>${esc(tr('listH'))}</h2></div>
        <div class="xp-tools">
          <label class="xp-search">${icon('search')}<input type="search" data-xp-search value="${esc(m.filter.q || '')}" placeholder="${esc(tr('search'))}" aria-label="${esc(tr('search'))}"></label>
          ${chips.join('')}
        </div>
        <div class="xp-list-body">${listHtml(v.rows, m.filter)}</div>
      </section>
    </div>
    ${fileInput()}
  </div>`;
}
