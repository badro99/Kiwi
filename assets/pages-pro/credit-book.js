/* Carnet de crédit · le tableau de bord du patron (sidebar « Carnet de crédit »,
 * nav-credit).
 *
 * Ce que doivent les clients, lu au serveur dans les carnets existants
 * (l'ardoise de l'épicerie, les notes « compte client » de la boutique) par
 * GET /api/credit/book : total dû, débiteurs, balance âgée (pas encore dû,
 * 1-30, 31-60, 61-90, 90 j et plus), la liste triable par montant ou par
 * retard, et la fiche de chaque client (son historique, son échéancier, son
 * plafond).
 *
 * « À relancer aujourd'hui », pensé pour le téléphone du patron : qui est dû
 * ou en retard, un rappel WhatsApp (wa.me) prêt à envoyer dans la langue du
 * client (français, arabe, darija), poli et court, avec le montant et le nom
 * du commerce. Kiwi n'envoie rien : le patron appuie sur Envoyer. Le rappel
 * est noté (« relancé à 10:42 ») pour ne pas relancer deux fois le même jour.
 *
 * Les échéances se règlent toutes seules : un règlement noté à la caisse est
 * versé sur les lignes par ordre de date (functions/api/_credit-accounts.js).
 * La démo montre un carnet d'exemple et n'écrit rien. */
(() => {
  'use strict';
  if (!window.Kiwi) return;
  const { handlers } = window.Kiwi;
  const L = (fr, en, ar) => { const l = window.KiwiI18n?.getLang?.(); return l === 'en' ? en : l === 'ar' ? ar : fr; };
  const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (title, desc, type) => { try { window.Kiwi.toast(title, { desc: desc || '', type: type || 'info' }); } catch (_) {} };
  const num = (n, d) => window.KiwiNumber?.format(n, { minimumFractionDigits: d || 0, maximumFractionDigits: d == null ? 2 : d }) ?? String(n);
  const mad = (cents) => num(Math.round(Number(cents) || 0) / 100) + ' MAD';
  const slug = () => { try { return window.KiwiCloudDoc?.currentSlug?.() || ''; } catch (_) { return ''; } };
  const real = () => { try { return !!window.KiwiEnv?.isReal?.(); } catch (_) { return false; } };
  const shopName = () => { try { return String(window.KiwiVenue?.getCurrentVenueData?.()?.name || '').trim(); } catch (_) { return ''; } };
  const DAY = 86400000;
  const localDay = (ts) => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const plusDays = (day, n) => new Date(Date.parse(day + 'T00:00:00Z') + n * DAY).toISOString().slice(0, 10);
  const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / DAY);
  const uiLocale = () => L('fr-FR', 'en-GB', 'ar-MA-u-nu-latn');
  const fmtDay = (day, locale) => { try { return new Intl.DateTimeFormat(locale || uiLocale(), { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z')); } catch (_) { return day; } };
  const fmtShort = (day) => { try { return new Intl.DateTimeFormat(uiLocale(), { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(day + 'T00:00:00Z')); } catch (_) { return day; } };
  const fmtTime = (ts) => { try { return new Intl.DateTimeFormat(uiLocale(), { hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ''; } };
  const fmtWhen = (ts) => { try { return new Intl.DateTimeFormat(uiLocale(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(ts)); } catch (_) { return ''; } };
  const idOf = (c) => c.source + ':' + c.key;
  const BUCKETS = [
    ['notDue', () => L('Pas encore dû', 'Not due yet', 'لم يحن أجله')],
    ['d1_30', () => L('1 à 30 j', '1 to 30 d', '1 إلى 30 يومًا')],
    ['d31_60', () => L('31 à 60 j', '31 to 60 d', '31 إلى 60 يومًا')],
    ['d61_90', () => L('61 à 90 j', '61 to 90 d', '61 إلى 90 يومًا')],
    ['d90p', () => L('90 j et plus', '90 d and more', '90 يومًا فأكثر')],
  ];
  /* Material Symbols, Outlined 400 (assets/icons/material/). */
  const P = {
    chat: 'M240-400h320v-80H240v80Zm0-120h480v-80H240v80Zm0-120h480v-80H240v80ZM80-80v-720q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v480q0 33-23.5 56.5T800-240H240L80-80Zm126-240h594v-480H160v525l46-45Zm-46 0v-480 480Z',
    check: 'M382-240 154-468l57-57 171 171 367-367 57 57-424 424Z',
    add: 'M440-440H200v-80h240v-240h80v240h240v80H520v240h-80v-240Z',
    del: 'M280-120q-33 0-56.5-23.5T200-200v-520h-40v-80h200v-40h240v40h200v80h-40v520q0 33-23.5 56.5T680-120H280Zm400-600H280v520h400v-520ZM360-280h80v-360h-80v360Zm160 0h80v-360h-80v360ZM280-720v520-520Z',
  };
  const ic = (k) => `<svg class="cb-i" viewBox="0 -960 960 960" aria-hidden="true" fill="currentColor"><path d="${P[k]}"/></svg>`;

  const state = { tab: 'due', sort: 'late', query: '', loaded: false, error: '', book: null, demo: false, open: null, detail: null, draft: null, saving: false, drawer: null };

  function css() {
    if (document.getElementById('cb-css')) return;
    const style = document.createElement('style');
    style.id = 'cb-css';
    style.textContent = `
.cb-page{display:grid;gap:16px}
.cb-i{width:18px;height:18px;flex:none}
.cb-kpis{display:grid;gap:10px;grid-template-columns:repeat(2,minmax(0,1fr))}
@media(min-width:900px){.cb-kpis{grid-template-columns:repeat(4,minmax(0,1fr))}}
.cb-kpi{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:16px;background:var(--paper,#F7F5F0);padding:14px 16px;min-width:0}
.cb-kpi small{display:block;font-size:12.5px;color:var(--ink-3,#667)}
.cb-kpi b{display:block;margin-top:4px;font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;color:var(--ink,#0A0F0D)}
.cb-kpi.alert b{color:var(--danger,#C94A3A)}
.cb-card{border:1px solid var(--line,rgba(10,15,13,.12));border-radius:18px;background:var(--paper,#F7F5F0);padding:16px;min-width:0}
.cb-card h3{margin:0 0 10px;font-size:15px;font-weight:600}
.cb-age{display:flex;height:14px;border-radius:7px;overflow:hidden;background:var(--surface-2,rgba(10,15,13,.06))}
.cb-age span{display:block;height:100%}
.cb-b-notDue{background:var(--atlas,#0B6E4F)}.cb-b-d1_30{background:var(--warning,#D99A2B);opacity:.6}.cb-b-d31_60{background:var(--warning,#D99A2B)}.cb-b-d61_90{background:var(--danger,#C94A3A);opacity:.7}.cb-b-d90p{background:var(--danger,#C94A3A)}
.cb-legend{display:grid;gap:6px 16px;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));margin-top:12px;font-size:13px}
.cb-legend div{display:flex;align-items:center;gap:8px;min-width:0}
.cb-legend i{width:10px;height:10px;border-radius:3px;flex:none}
.cb-legend b{margin-inline-start:auto;font-weight:600;font-variant-numeric:tabular-nums}
.cb-bar{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between}
.cb-seg{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--surface-2,rgba(10,15,13,.06))}
.cb-seg button{min-height:40px;padding:0 14px;border:0;border-radius:9px;background:transparent;font:inherit;font-size:14px;color:var(--ink-2,#3a4440);cursor:pointer}
.cb-seg button.on{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);box-shadow:0 1px 2px rgba(10,15,13,.08)}
.cb-seg.sm button{min-height:32px;padding:0 10px;font-size:12.5px}
.cb-search{min-height:40px;padding:0 12px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));font:inherit;background:var(--paper,#F7F5F0);color:inherit;min-width:0;flex:1 1 200px;max-width:320px}
.cb-list{display:grid;gap:10px}
.cb-row{display:grid;gap:10px;border:1px solid var(--line,rgba(10,15,13,.12));border-radius:16px;background:var(--paper,#F7F5F0);padding:14px 16px}
.cb-row-top{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}
.cb-who{min-width:0}
.cb-who button{all:unset;cursor:pointer;font-weight:600;font-size:15px;color:var(--ink,#0A0F0D)}
.cb-who button:focus-visible{outline:2px solid var(--atlas,#0B6E4F);outline-offset:3px;border-radius:4px}
.cb-meta{font-size:12.5px;color:var(--ink-3,#667);margin-top:2px;display:flex;flex-wrap:wrap;gap:4px 10px}
.cb-amt{text-align:end;font-variant-numeric:tabular-nums}
.cb-amt b{display:block;font-size:17px;font-weight:600}
.cb-amt small{font-size:12px;color:var(--ink-3,#667)}
.cb-late{color:var(--danger,#C94A3A)}
.cb-pill{display:inline-flex;align-items:center;gap:4px;min-height:22px;padding:0 8px;border-radius:999px;font-size:12px;background:var(--surface-2,rgba(10,15,13,.06));color:var(--ink-2,#3a4440)}
.cb-pill.warn{background:var(--warn-soft,#FFF4DD);color:var(--warn-ink,#8A6210)}
.cb-pill.ok{background:rgba(11,110,79,.1);color:var(--atlas,#0B6E4F)}
.cb-acts{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between}
.cb-wa{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid var(--atlas,#0B6E4F);background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0);font:inherit;font-size:14px;font-weight:600;cursor:pointer}
.cb-wa.again{background:transparent;color:var(--atlas,#0B6E4F)}
.cb-wa[disabled]{opacity:.45;cursor:not-allowed}
@media(max-width:560px){.cb-acts .cb-wa{flex:1 1 100%}}
.cb-empty{padding:28px 16px;text-align:center;color:var(--ink-3,#667);font-size:14px}
.cb-note{margin:0;font-size:13px;color:var(--ink-3,#667);line-height:1.5}
.cb-sum{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:14px}
.cb-sum div{padding:10px 12px;border-radius:12px;background:var(--surface-2,rgba(10,15,13,.05))}
.cb-sum small{display:block;font-size:12px;color:var(--ink-3,#667)}.cb-sum b{font-size:16px;font-weight:600;font-variant-numeric:tabular-nums}
.cb-sec{margin:18px 0 8px;font-size:14px;font-weight:600}
.cb-ed{display:grid;gap:8px}
.cb-ed-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.2fr) 40px;gap:6px;align-items:center}
.cb-ed-row .cb-ed-note{grid-column:1/3}
.cb-ed input{min-height:40px;padding:0 10px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));font:inherit;font-size:14px;background:var(--paper,#F7F5F0);color:inherit;min-width:0}
.cb-ed-del{width:40px;height:40px;display:grid;place-items:center;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.12));background:transparent;color:var(--ink-3,#667);cursor:pointer}
.cb-ed-foot{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:space-between;font-size:13px}
.cb-err{color:var(--danger,#C94A3A)}
.cb-hist{list-style:none;margin:0;padding:0;display:grid}
.cb-hist li{display:flex;gap:10px;justify-content:space-between;padding:9px 0;border-top:1px solid var(--line,rgba(10,15,13,.08));font-size:13px}
.cb-hist li span:last-child{font-variant-numeric:tabular-nums;white-space:nowrap}
.cb-hist .pay{color:var(--atlas,#0B6E4F)}
.cb-btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));background:transparent;font:inherit;font-size:14px;color:inherit;cursor:pointer}
.cb-btn.go{background:var(--atlas,#0B6E4F);border-color:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)}
.cb-limit{display:flex;gap:8px;align-items:center}
.cb-limit input{min-height:40px;padding:0 10px;border-radius:10px;border:1px solid var(--line,rgba(10,15,13,.16));font:inherit;width:140px;background:var(--paper,#F7F5F0);color:inherit}
`;
    document.head.appendChild(style);
  }

  /* ── le carnet d'exemple (démo seulement) ── */
  function demoBook() {
    const today = localDay(Date.now());
    const c = (key, name, phone, owed, daysLate, dueCents, buckets, extra) => ({ source: 'carnet', key, name, phone, owedCents: owed, scheduledCents: dueCents, unscheduledCents: owed - dueCents,
      limitCents: null, lang: '', remindedTs: 0, rev: 1, hasSchedule: dueCents > 0, lastPayTs: Date.now() - 6 * DAY, daysLate, buckets: Object.assign({ notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }, buckets),
      nextDue: '', dueCents: daysLate >= 0 && dueCents ? dueCents : 0, dueDate: daysLate >= 0 && dueCents ? plusDays(today, -Math.max(0, daysLate)) : '', pending: dueCents ? [{ id: key + '-r1', amountCents: dueCents, originalCents: dueCents, dueDate: plusDays(today, -Math.max(0, daysLate)), note: '', origin: 'till' }] : [], ...extra });
    const customers = [
      c('d-rkia', 'Mme Rkia', '0661442187', 17400, 4, 12000, { d1_30: 17400 }, { lang: 'darija', limitCents: 30000 }),
      c('d-driss', 'Hajj Driss', '0670331209', 9800, 0, 9800, { notDue: 9800 }, { lang: 'ar' }),
      c('d-cafe', 'Café Rif', '0539940321', 208000, 38, 100000, { d31_60: 100000, d1_30: 108000 }, { limitCents: 150000 }),
      c('d-mustapha', 'Mustapha (menuisier)', '0662784533', 10300, 8, 0, { d1_30: 10300 }, {}),
      c('d-fatiha', 'Fatiha', '', 2700, -3, 0, { notDue: 2700 }, {}),
    ];
    const summary = { owedCents: 0, debtors: customers.length, buckets: { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 }, dueToday: 0, dueTodayCents: 0, overLimit: 0 };
    for (const x of customers) {
      summary.owedCents += x.owedCents;
      for (const b of Object.keys(summary.buckets)) summary.buckets[b] += x.buckets[b];
      if (x.dueCents) { summary.dueToday++; summary.dueTodayCents += x.dueCents; }
      if (x.limitCents != null && x.owedCents > x.limitCents) summary.overLimit++;
    }
    return { today, summary, customers };
  }

  async function api(method, query, body) {
    const url = '/api/credit/book?merchant=' + encodeURIComponent(slug()) + (query || '');
    const res = await fetch(url, method === 'GET' ? { credentials: 'same-origin', headers: { Accept: 'application/json' } }
      : { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ merchant: slug(), ...body }) });
    const j = await res.json().catch(() => ({}));
    return { status: res.status, body: j || {} };
  }

  async function load() {
    if (!real()) { state.demo = true; state.book = state.book && state.demo ? state.book : demoBook(); state.loaded = true; return; }
    state.demo = false;
    try {
      const r = await api('GET');
      if (r.status !== 200) throw new Error(r.body.error || String(r.status));
      state.book = r.body; state.error = '';
    } catch (e) {
      state.error = String(e && e.message || e);
    }
    state.loaded = true;
  }

  /* ── le rappel WhatsApp : un brouillon, jamais un envoi ── */
  const firstName = (name) => String(name || '').trim().split(/\s+/).slice(0, 2).join(' ');
  function waText(c, lang) {
    const shop = shopName() || L('votre commerce', 'your shop', 'المحل');
    const amount = mad(c.dueCents || c.owedCents);
    const name = firstName(c.name);
    const date = c.dueDate || '';
    if (lang === 'ar') {
      return `السلام عليكم ${name}، نرجو أن تكونوا بخير. تذكير لطيف من ${shop}: يتبقى مبلغ ${amount}${date ? `، وكان الموعد المتفق عليه ${fmtDay(date, 'ar-MA-u-nu-latn')}` : ''}. شكرًا جزيلًا ونهاركم سعيد.`;
    }
    if (lang === 'darija') {
      return `السلام ${name}، لاباس عليك؟ غير تذكير صغير من ${shop}: باقي ${amount} فالكريدي${date ? `، كنا متافقين على ${fmtDay(date, 'ar-MA-u-nu-latn')}` : ''}. ملي تقدر الله يخليك، وشكرا بزاف.`;
    }
    return `Bonjour ${name}, j’espère que vous allez bien. Petit rappel de ${shop} : ${amount} reste${date ? ` à régler, prévu le ${fmtDay(date, 'fr-FR')}` : ' à régler'}. Merci beaucoup et bonne journée.`;
  }
  /* 06… / 07… / 05… marocains → 2126…, +33… → 33… */
  function waNumber(phone) {
    let d = String(phone || '').replace(/\D/g, '');
    if (d.startsWith('00')) d = d.slice(2);
    if (d.length === 10 && d.startsWith('0')) d = '212' + d.slice(1);
    return d.length >= 8 ? d : '';
  }
  const langOf = (c) => c.lang || (window.KiwiI18n?.getLang?.() === 'ar' ? 'darija' : 'fr');
  const remindedToday = (c) => c.remindedTs > 0 && localDay(c.remindedTs) === localDay(Date.now());
  const findCustomer = (id) => (state.book?.customers || []).find((c) => idOf(c) === id) || null;

  /* ── l'affichage ── */
  function lateLabel(c) {
    if (c.dueDate && c.dueDate === state.book.today) return `<span class="cb-pill warn">${esc(L('Dû aujourd’hui', 'Due today', 'مستحق اليوم'))}</span>`;
    if (c.daysLate > 0) return `<span class="cb-pill warn cb-late">${esc(L(`${c.daysLate} j de retard`, `${c.daysLate} d late`, `متأخر ${c.daysLate} يومًا`))}</span>`;
    if (c.nextDue) return `<span class="cb-pill">${esc(L('Prochaine échéance', 'Next due', 'الموعد القادم'))} · ${esc(fmtShort(c.nextDue))}</span>`;
    return '';
  }
  function langSeg(c) {
    const l = langOf(c);
    const b = (k, t) => `<button type="button" data-lens-item class="${l === k ? 'on' : ''}" aria-pressed="${l === k}" data-action="credit-lang" data-arg="${esc(idOf(c) + '|' + k)}">${esc(t)}</button>`;
    return `<div class="cb-seg sm" data-lens-demo role="group" aria-label="${esc(L('Langue du rappel', 'Reminder language', 'لغة التذكير'))}">${b('fr', 'FR')}${b('ar', 'عربي')}${b('darija', 'Darija')}</div>`;
  }
  function dueCard(c) {
    const again = remindedToday(c);
    const phone = waNumber(c.phone);
    return `<article class="cb-row">
      <div class="cb-row-top">
        <div class="cb-who"><button type="button" data-action="credit-open" data-arg="${esc(idOf(c))}">${esc(c.name || L('Client', 'Customer', 'زبون'))}</button>
          <div class="cb-meta">${lateLabel(c)}${again ? `<span class="cb-pill ok">${ic('check')}${esc(L('Relancé à', 'Reminded at', 'تم التذكير على'))} ${esc(fmtTime(c.remindedTs))}</span>` : ''}</div></div>
        <div class="cb-amt"><b>${esc(mad(c.dueCents))}</b><small>${esc(L('sur', 'of', 'من أصل'))} ${esc(mad(c.owedCents))}</small></div>
      </div>
      <div class="cb-acts">${langSeg(c)}
        <button type="button" class="cb-wa${again ? ' again' : ''}" data-action="credit-wa" data-arg="${esc(idOf(c))}"${phone ? '' : ' disabled'} title="${esc(phone ? '' : L('Aucun numéro sur la fiche', 'No number on file', 'لا يوجد رقم'))}">${ic('chat')}${esc(again ? L('Relancer encore', 'Remind again', 'تذكير مرة أخرى') : L('Rappel WhatsApp', 'WhatsApp reminder', 'تذكير واتساب'))}</button></div>
    </article>`;
  }
  function listRow(c) {
    const over = c.limitCents != null && c.owedCents > c.limitCents;
    return `<article class="cb-row"><div class="cb-row-top">
      <div class="cb-who"><button type="button" data-action="credit-open" data-arg="${esc(idOf(c))}">${esc(c.name || L('Client', 'Customer', 'زبون'))}</button>
        <div class="cb-meta">${lateLabel(c)}${c.unscheduledCents > 0 && c.hasSchedule ? `<span class="cb-pill">${esc(mad(c.unscheduledCents))} ${esc(L('sans date', 'without a date', 'بدون تاريخ'))}</span>` : ''}${over ? `<span class="cb-pill warn">${esc(L('Au-dessus du plafond', 'Over the limit', 'فوق السقف'))}</span>` : ''}${c.source === 'client' ? `<span class="cb-pill">${esc(L('Compte client', 'Customer account', 'حساب الزبون'))}</span>` : ''}</div></div>
      <div class="cb-amt"><b>${esc(mad(c.owedCents))}</b>${c.limitCents != null ? `<small>${esc(L('plafond', 'limit', 'السقف'))} ${esc(mad(c.limitCents))}</small>` : ''}</div>
    </div></article>`;
  }
  function ageingCard(s) {
    const total = Object.values(s.buckets).reduce((n, v) => n + v, 0) || 1;
    return `<section class="cb-card"><h3>${esc(L('Ancienneté des créances', 'Ageing', 'أعمار الديون'))}</h3>
      <div class="cb-age" role="img" aria-label="${esc(BUCKETS.map(([k, t]) => t() + ' ' + mad(s.buckets[k])).join(', '))}">${BUCKETS.map(([k]) => s.buckets[k] > 0 ? `<span class="cb-b-${k}" style="width:${(s.buckets[k] / total * 100).toFixed(2)}%"></span>` : '').join('')}</div>
      <div class="cb-legend">${BUCKETS.map(([k, t]) => `<div><i class="cb-b-${k}"></i>${esc(t())}<b>${esc(mad(s.buckets[k]))}</b></div>`).join('')}</div></section>`;
  }
  function render() {
    css();
    const b = state.book;
    let body;
    if (!state.loaded) body = `<p class="cb-note">${esc(L('Chargement du carnet…', 'Loading the credit book…', 'جارٍ تحميل دفتر الديون…'))}</p>`;
    else if (!b) body = `<div class="cb-card cb-empty">${esc(state.error === 'forbidden' ? L('Le carnet de crédit s’ouvre avec le code du patron ou d’un gérant.', 'The credit book opens with the owner or a manager code.', 'يُفتح دفتر الديون برمز صاحب المحل أو المسيّر.') : L('Carnet indisponible pour le moment. Réessayez dans un instant.', 'Credit book unavailable right now. Try again in a moment.', 'دفتر الديون غير متاح حاليًا. حاول بعد قليل.'))}</div>`;
    else {
      const s = b.summary;
      const late = s.buckets.d1_30 + s.buckets.d31_60 + s.buckets.d61_90 + s.buckets.d90p;
      const tab = (k, t) => `<button type="button" data-lens-item class="${state.tab === k ? 'on' : ''}" aria-pressed="${state.tab === k}" data-action="credit-tab" data-arg="${k}">${esc(t)}</button>`;
      const sortB = (k, t) => `<button type="button" data-lens-item class="${state.sort === k ? 'on' : ''}" aria-pressed="${state.sort === k}" data-action="credit-sort" data-arg="${k}">${esc(t)}</button>`;
      let main;
      if (state.tab === 'due') {
        const due = b.customers.filter((c) => c.dueCents > 0).sort((x, y) => (Number(remindedToday(x)) - Number(remindedToday(y))) || y.daysLate - x.daysLate || y.dueCents - x.dueCents);
        main = due.length ? `<div class="cb-list">${due.map(dueCard).join('')}</div>`
          : `<div class="cb-card cb-empty">${esc(L('Personne à relancer aujourd’hui.', 'Nobody to remind today.', 'لا أحد للتذكير اليوم.'))}</div>`;
        main += `<p class="cb-note">${esc(L('Le message s’ouvre dans WhatsApp, prêt à envoyer : rien ne part sans vous.', 'The message opens in WhatsApp, ready to send: nothing goes out without you.', 'تُفتح الرسالة في واتساب جاهزة للإرسال: لا شيء يُرسل بدونك.'))}</p>`;
      } else {
        const q = state.query.trim().toLowerCase();
        const rows = b.customers.filter((c) => c.owedCents > 0 || c.limitCents != null).filter((c) => !q || c.name.toLowerCase().includes(q) || String(c.phone).includes(q))
          .sort(state.sort === 'amount' ? (x, y) => y.owedCents - x.owedCents : (x, y) => y.daysLate - x.daysLate || y.owedCents - x.owedCents);
        main = `<div class="cb-bar"><input class="cb-search" type="search" data-cb-search value="${esc(state.query)}" placeholder="${esc(L('Chercher un client', 'Search a customer', 'ابحث عن زبون'))}" aria-label="${esc(L('Chercher un client', 'Search a customer', 'ابحث عن زبون'))}">
          <div class="cb-seg" data-lens-demo role="group" aria-label="${esc(L('Trier', 'Sort', 'ترتيب'))}">${sortB('late', L('Par retard', 'By lateness', 'حسب التأخر'))}${sortB('amount', L('Par montant', 'By amount', 'حسب المبلغ'))}</div></div>
          ${rows.length ? `<div class="cb-list">${rows.map(listRow).join('')}</div>` : `<div class="cb-card cb-empty">${esc(L('Aucun client ne vous doit d’argent.', 'No customer owes you money.', 'لا يوجد زبون مدين لك.'))}</div>`}`;
      }
      body = `${state.demo ? `<p class="cb-note">${esc(L('Exemple : votre vrai carnet apparaît ici dès la première vente à crédit.', 'Example: your real book shows here from the first credit sale.', 'مثال: يظهر دفترك الحقيقي هنا منذ أول بيع بالكريدي.'))}</p>` : ''}
        <div class="cb-kpis">
          <div class="cb-kpi"><small>${esc(L('Total dû', 'Total owed', 'مجموع الديون'))}</small><b>${esc(mad(s.owedCents))}</b></div>
          <div class="cb-kpi"><small>${esc(L('Débiteurs', 'Debtors', 'المدينون'))}</small><b>${esc(num(s.debtors, 0))}</b></div>
          <div class="cb-kpi${late ? ' alert' : ''}"><small>${esc(L('En retard', 'Overdue', 'متأخر'))}</small><b>${esc(mad(late))}</b></div>
          <div class="cb-kpi"><small>${esc(L('À relancer aujourd’hui', 'To remind today', 'للتذكير اليوم'))}</small><b>${esc(num(s.dueToday, 0))}</b></div>
        </div>
        <div class="cb-bar"><div class="cb-seg" data-lens-demo role="group" aria-label="${esc(L('Sections du carnet', 'Credit book sections', 'أقسام الدفتر'))}">${tab('due', L('À relancer', 'To remind', 'للتذكير') + (s.dueToday ? ' (' + s.dueToday + ')' : ''))}${tab('all', L('Tous les débiteurs', 'All debtors', 'كل المدينين'))}</div>
          <button type="button" class="cb-btn" data-action="credit-refresh">${esc(L('Actualiser', 'Refresh', 'تحديث'))}</button></div>
        ${main}
        ${ageingCard(s)}`;
    }
    window.Kiwi.appPage('credit', {
      title: L('Carnet de crédit', 'Credit book', 'دفتر الديون'),
      subtitle: L('Qui vous doit, pour quand, et le rappel en un geste', 'Who owes you, by when, and the reminder in one tap', 'من يدين لك، ومتى، والتذكير بلمسة واحدة'),
      body: `<div class="cb-page" data-cb-page>${body}</div>`,
    });
    const search = document.querySelector('[data-cb-search]');
    if (search) search.addEventListener('input', () => {
      state.query = search.value;
      const at = search.selectionStart;
      render();
      const again = document.querySelector('[data-cb-search]');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    });
  }

  handlers['nav-credit'] = async () => {
    state.loaded = false;
    render();
    try { await load(); } catch (_) { state.loaded = true; }
    try { render(); } catch (_) {}
  };
  handlers['credit-refresh'] = async () => { await load(); render(); };
  handlers['credit-tab'] = (el, arg) => { const k = typeof el === 'string' ? el : arg; state.tab = k === 'all' ? 'all' : 'due'; render(); };
  handlers['credit-sort'] = (el, arg) => { const k = typeof el === 'string' ? el : arg; state.sort = k === 'amount' ? 'amount' : 'late'; render(); };

  async function savePrefs(c, patch) {
    if (state.demo) return { ok: true, remindedTs: patch.reminded ? Date.now() : c.remindedTs };
    const r = await api('POST', '', { action: 'prefs', source: c.source, customer: c.key, ...patch });
    return r.status === 200 ? r.body : null;
  }
  handlers['credit-lang'] = async (el, arg) => {
    const raw = typeof el === 'string' ? el : arg;
    const [id, lang] = String(raw || '').split('|');
    const c = findCustomer(id);
    if (!c || !['fr', 'ar', 'darija'].includes(lang)) return;
    c.lang = lang;
    render();
    if (!await savePrefs(c, { lang })) toast(L('Langue non enregistrée', 'Language not saved', 'لم تُحفظ اللغة'), '', 'error');
  };
  handlers['credit-wa'] = async (el, arg) => {
    const c = findCustomer(typeof el === 'string' ? el : arg);
    if (!c) return;
    const num = waNumber(c.phone);
    if (!num) { toast(L('Aucun numéro sur la fiche', 'No number on file', 'لا يوجد رقم في البطاقة'), ''); return; }
    const lang = langOf(c);
    /* Ouvert tout de suite, dans le geste : un navigateur bloque une fenêtre
       ouverte après une attente. */
    try { window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(waText(c, lang)), '_blank', 'noopener'); } catch (_) {}
    const out = await savePrefs(c, { reminded: true, lang });
    if (out) { c.remindedTs = out.remindedTs || Date.now(); c.lang = lang; render(); }
    else toast(L('Rappel ouvert, mais non noté', 'Reminder opened, but not recorded', 'فُتح التذكير لكن لم يُسجَّل'), '', 'error');
  };

  /* ── la fiche d'un client : échéancier, plafond, historique ── */
  const toCents = (v) => { const n = Number(String(v == null ? '' : v).replace(/\s/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) : NaN; };
  const draftTotal = () => (state.draft || []).reduce((n, r) => n + (toCents(r.amount) || 0), 0);
  function drawerBody() {
    const d = state.detail, c = d.customer;
    const rows = state.draft;
    const over = draftTotal() - c.owedCents;
    const editor = rows ? `<div class="cb-ed" data-cb-editor>
        ${rows.map((r, i) => `<div class="cb-ed-row">
          <input inputmode="decimal" data-cb-f="amount" data-i="${i}" value="${esc(r.amount)}" aria-label="${esc(L('Montant (MAD)', 'Amount (MAD)', 'المبلغ (درهم)'))}">
          <input type="date" data-cb-f="dueDate" data-i="${i}" value="${esc(r.dueDate)}" aria-label="${esc(L('Date', 'Date', 'التاريخ'))}">
          <button type="button" class="cb-ed-del" data-action="credit-row-del" data-arg="${i}" aria-label="${esc(L('Retirer la ligne', 'Remove the row', 'حذف السطر'))}">${ic('del')}</button>
          <input class="cb-ed-note" data-cb-f="note" data-i="${i}" value="${esc(r.note)}" maxlength="120" placeholder="${esc(L('Note (facultatif)', 'Note (optional)', 'ملاحظة (اختياري)'))}">
        </div>`).join('')}
        <div class="cb-ed-foot"><button type="button" class="cb-btn" data-action="credit-row-add">${ic('add')}${esc(L('Ajouter une échéance', 'Add a payment date', 'إضافة موعد'))}</button>
          <span data-cb-rest class="${over > 0 ? 'cb-err' : ''}">${over > 0 ? esc(L('Montant supérieur au solde du client', 'Amount above the customer balance', 'المبلغ أكبر من رصيد الزبون')) : esc(mad(-over) + ' ' + L('sans date', 'without a date', 'بدون تاريخ'))}</span></div>
        <div><button type="button" class="cb-btn go" data-action="credit-save"${state.saving ? ' disabled' : ''}>${esc(L('Enregistrer l’échéancier', 'Save the schedule', 'حفظ الجدول'))}</button></div>
      </div>`
      : c.owedCents > 0 ? `<p class="cb-note">${esc(L('Aucune échéance. Fixez des dates avec le client : chaque règlement noté à la caisse les solde dans l’ordre.', 'No payment dates yet. Agree dates with the customer: every payment taken at the till settles them in order.', 'لا مواعيد بعد. اتفق مع الزبون على مواعيد: كل دفعة تُسجَّل في الصندوق تُسدّدها بالترتيب.'))}</p>
        <button type="button" class="cb-btn go" data-action="credit-seed">${esc(L('Créer un échéancier', 'Create a schedule', 'إنشاء جدول دفع'))}</button>` : '';
    const hist = (d.history || []).map((h) => ({ ts: h.ts, label: h.kind === 'debt' ? (h.label || L('Achat à crédit', 'Credit purchase', 'شراء بالكريدي')) : L('Règlement', 'Payment', 'دفعة'), cents: h.kind === 'debt' ? h.cents : -h.cents }))
      .concat((d.events || []).filter((e) => e.kind !== 'collected' && e.kind !== 'schedule').map((e) => ({ ts: e.ts, label: { 'limit-override': L('Plafond dépassé, accord de ', 'Limit passed, approved by ', 'تجاوز السقف بموافقة ') + (e.actor || ''), reminded: L('Rappel WhatsApp', 'WhatsApp reminder', 'تذكير واتساب'), promise: L('Promesse prise à la caisse', 'Promise taken at the till', 'وعد سُجّل في الصندوق'), limit: L('Plafond modifié', 'Limit changed', 'تغيير السقف') }[e.kind] || e.kind, cents: null })))
      .sort((a, b) => b.ts - a.ts).slice(0, 30);
    return `<div class="cb-sum">
        <div><small>${esc(L('Doit', 'Owes', 'عليه'))}</small><b>${esc(mad(c.owedCents))}</b></div>
        <div><small>${esc(L('En retard', 'Overdue', 'متأخر'))}</small><b class="${c.daysLate > 0 ? 'cb-late' : ''}">${esc(c.daysLate > 0 ? L(c.daysLate + ' j', c.daysLate + ' d', c.daysLate + ' يوم') : L('Non', 'No', 'لا'))}</b></div>
        <div><small>${esc(L('Dernier règlement', 'Last payment', 'آخر دفعة'))}</small><b>${esc(c.lastPayTs ? fmtShort(localDay(c.lastPayTs)) : '·')}</b></div>
        <div><small>${esc(L('Sans date', 'Without a date', 'بدون تاريخ'))}</small><b>${esc(mad(c.unscheduledCents))}</b></div>
      </div>
      <h4 class="cb-sec">${esc(L('Échéancier', 'Payment schedule', 'جدول الدفع'))}</h4>${editor}
      ${(d.collected || []).length ? `<p class="cb-note">${esc(L('Déjà encaissé', 'Already collected', 'تم تحصيله'))} : ${d.collected.slice(0, 4).map((r) => esc(mad(r.originalCents) + ' · ' + fmtShort(r.dueDate))).join(', ')}</p>` : ''}
      <h4 class="cb-sec">${esc(L('Plafond de crédit', 'Credit limit', 'سقف الكريدي'))}</h4>
      <div class="cb-limit"><input inputmode="decimal" data-cb-limit value="${c.limitCents == null ? '' : esc(c.limitCents / 100)}" placeholder="${esc(L('Aucun', 'None', 'بدون'))}" aria-label="${esc(L('Plafond en MAD', 'Limit in MAD', 'السقف بالدرهم'))}">
        <button type="button" class="cb-btn" data-action="credit-limit-save">${esc(L('Enregistrer', 'Save', 'حفظ'))}</button></div>
      <p class="cb-note">${esc(L('Au-delà, la caisse demande le code d’un responsable.', 'Beyond it, the till asks for a manager code.', 'بعده، يطلب الصندوق رمز المسؤول.'))}</p>
      <h4 class="cb-sec">${esc(L('Historique', 'History', 'السجل'))}</h4>
      <ul class="cb-hist">${hist.map((h) => `<li><span>${esc(fmtWhen(h.ts))} · ${esc(h.label)}</span><span class="${h.cents != null && h.cents < 0 ? 'pay' : ''}">${h.cents == null ? '' : esc((h.cents < 0 ? '− ' : '+ ') + mad(Math.abs(h.cents)))}</span></li>`).join('') || `<li><span>${esc(L('Rien pour l’instant', 'Nothing yet', 'لا شيء بعد'))}</span><span></span></li>`}</ul>`;
  }
  function paintDrawer() {
    const host = state.drawer?.el?.querySelector('.kiwi-drawer-body');
    if (host) host.innerHTML = drawerBody();
  }
  function draftFrom(customer) {
    return customer.pending.length ? customer.pending.map((r) => ({ id: r.id, amount: String(r.amountCents / 100), dueDate: r.dueDate, note: r.note || '' })) : null;
  }
  handlers['credit-open'] = async (el, arg) => {
    const c = findCustomer(typeof el === 'string' ? el : arg);
    if (!c) return;
    state.open = idOf(c);
    if (state.demo) state.detail = { customer: c, seed: [{ amountCents: c.owedCents, dueDate: plusDays(state.book.today, 7) }], collected: [], history: [{ kind: 'debt', cents: c.owedCents, ts: Date.now() - 9 * DAY, label: L('Courses', 'Groceries', 'مشتريات') }], events: [] };
    else {
      const r = await api('GET', '&source=' + encodeURIComponent(c.source) + '&customer=' + encodeURIComponent(c.key));
      if (r.status !== 200) { toast(L('Fiche indisponible', 'Record unavailable', 'البطاقة غير متاحة'), '', 'error'); return; }
      state.detail = r.body;
    }
    state.draft = draftFrom(state.detail.customer);
    state.drawer = window.Kiwi.drawer({ title: c.name || L('Client', 'Customer', 'زبون'), subtitle: c.phone || '', body: drawerBody(), width: 460 });
    state.drawer.el.addEventListener('input', (e) => {
      const f = e.target?.dataset?.cbF;
      if (!f || !state.draft) return;
      const row = state.draft[Number(e.target.dataset.i)];
      if (row) row[f] = e.target.value;
      const rest = state.drawer.el.querySelector('[data-cb-rest]');
      const over = draftTotal() - state.detail.customer.owedCents;
      if (rest) { rest.className = over > 0 ? 'cb-err' : ''; rest.textContent = over > 0 ? L('Montant supérieur au solde du client', 'Amount above the customer balance', 'المبلغ أكبر من رصيد الزبون') : mad(-over) + ' ' + L('sans date', 'without a date', 'بدون تاريخ'); }
    });
  };
  handlers['credit-seed'] = () => {
    const d = state.detail;
    if (!d) return;
    const seed = (d.seed && d.seed[0]) || { amountCents: d.customer.owedCents, dueDate: plusDays(state.book.today, 7) };
    state.draft = [{ id: '', amount: String(seed.amountCents / 100), dueDate: seed.dueDate, note: '' }];
    paintDrawer();
  };
  handlers['credit-row-add'] = () => {
    if (!state.draft) return;
    const rest = Math.max(0, state.detail.customer.owedCents - draftTotal());
    const last = state.draft.reduce((m, r) => (r.dueDate > m ? r.dueDate : m), state.book.today);
    state.draft.push({ id: '', amount: rest ? String(rest / 100) : '', dueDate: plusDays(last, last === state.book.today ? 7 : 30), note: '' });
    paintDrawer();
  };
  handlers['credit-row-del'] = (el, arg) => {
    const i = Number(typeof el === 'string' ? el : arg);
    if (!state.draft || !(i >= 0)) return;
    state.draft.splice(i, 1);
    paintDrawer();
  };
  async function reloadOpen() {
    await load();
    render();
    const c = state.open && findCustomer(state.open);
    if (c && !state.demo) {
      const r = await api('GET', '&source=' + encodeURIComponent(c.source) + '&customer=' + encodeURIComponent(c.key));
      if (r.status === 200) { state.detail = r.body; state.draft = draftFrom(r.body.customer); paintDrawer(); }
    }
  }
  handlers['credit-save'] = async () => {
    const d = state.detail;
    if (!d || !state.draft || state.saving) return;
    const rows = state.draft.map((r) => ({ ...(r.id ? { id: r.id } : {}), amountCents: toCents(r.amount), dueDate: r.dueDate, note: r.note }));
    if (rows.some((r) => !(r.amountCents > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(r.dueDate || ''))) { toast(L('Chaque ligne demande un montant et une date', 'Each row needs an amount and a date', 'كل سطر يحتاج مبلغًا وتاريخًا'), '', 'error'); return; }
    if (draftTotal() > d.customer.owedCents) { toast(L('Montant supérieur au solde du client', 'Amount above the customer balance', 'المبلغ أكبر من رصيد الزبون'), '', 'error'); return; }
    if (state.demo) { toast(L('Démo : rien n’est enregistré', 'Demo: nothing is saved', 'عرض تجريبي: لا شيء يُحفظ'), ''); return; }
    state.saving = true;
    const r = await api('POST', '', { action: 'schedule', source: d.customer.source, customer: d.customer.key, rows, baseRev: d.customer.rev });
    state.saving = false;
    if (r.status === 200) { toast(L('Échéancier enregistré', 'Schedule saved', 'تم حفظ الجدول'), ''); await reloadOpen(); return; }
    toast(r.body.error === 'credit-schedule-changed' ? L('La fiche a changé entre-temps, relue', 'The record changed meanwhile, reloaded', 'تغيّرت البطاقة، أُعيد تحميلها')
      : r.body.error === 'schedule-exceeds-balance' ? L('Montant supérieur au solde du client', 'Amount above the customer balance', 'المبلغ أكبر من رصيد الزبون')
      : L('Échéancier non enregistré', 'Schedule not saved', 'لم يُحفظ الجدول'), '', 'error');
    if (r.body.error === 'credit-schedule-changed') await reloadOpen();
  };
  handlers['credit-limit-save'] = async () => {
    const d = state.detail;
    const input = state.drawer?.el?.querySelector('[data-cb-limit]');
    if (!d || !input) return;
    const raw = String(input.value || '').trim();
    const limitCents = raw === '' ? null : toCents(raw);
    if (limitCents !== null && !(limitCents >= 0)) { toast(L('Plafond invalide', 'Invalid limit', 'سقف غير صالح'), '', 'error'); return; }
    if (state.demo) { d.customer.limitCents = limitCents; toast(L('Démo : rien n’est enregistré', 'Demo: nothing is saved', 'عرض تجريبي: لا شيء يُحفظ'), ''); return; }
    const r = await api('POST', '', { action: 'limit', source: d.customer.source, customer: d.customer.key, limitCents });
    if (r.status === 200) { toast(L('Plafond enregistré', 'Limit saved', 'تم حفظ السقف'), ''); await reloadOpen(); return; }
    toast(r.status === 403 ? L('Seul le patron fixe un plafond', 'Only the owner sets a limit', 'وحده صاحب المحل يحدد السقف') : L('Plafond non enregistré', 'Limit not saved', 'لم يُحفظ السقف'), '', 'error');
  };
})();
