/* La remise de TICKET de la caisse maison, comme la boutique
 * (pos-boutique/ticket-remise.js), sortie de sales.js (plafond de taille,
 * tools/file-size-ratchet-test.mjs). sales.js passe ses propres fonctions,
 * donc c'est SON code qui tourne (openApprove, le rendu).
 *
 * Aucun chemin d'argent neuf : le pourcentage se repose sur chaque ligne, là
 * où il vivait déjà, derrière le même accord (openApprove) et la même liste de
 * taux (KiwiDiscountPolicy).
 *
 * Remise à la marocaine, comme la boutique (propriétaire, 2026-11-23) :
 * « % | Prix convenu | −MAD », à l'article et au ticket. Le calcul et le
 * sélecteur sont CEUX de la boutique (pos-boutique/bargain.js, bargain-ui.js),
 * importés tels quels ; seul l'habillage vit ici, la feuille de style maison
 * étant à son plafond. */
import { spreadTicket, agreedUnit, maxPct } from '../pos-boutique/bargain.js?v=3';
import { mountBargain } from '../pos-boutique/bargain-ui.js?v=4';
/* Les mots de ces écrans Maison en anglais et en arabe, comme ozon.js : la
 * caisse dit sa langue (KiwiCaisseLang.get), une phrase inconnue reste en
 * français. Sert aussi à « Déclarer casse » (sales.js). */
const PHRASES = {
  'Remise sur le ticket': ['Receipt discount', 'خصم على التذكرة'],
  'Remise supprimée': ['Discount removed', 'تم حذف الخصم'],
  'Remise −{n} % sur le ticket': ['−{n} % off the receipt', 'خصم −{n} % على التذكرة'],
  'S\'applique à tous les articles du ticket {n}.': ['Applies to every item on receipt {n}.', 'يُطبَّق على كل أصناف التذكرة {n}.'],
  'Sans': ['None', 'بدون'],
  'Remise': ['Discount', 'خصم'],
  'S\'applique à cet article seulement.': ['Applies to this item only.', 'يُطبَّق على هذا الصنف فقط.'],
  'Remise −{n} % sur l’article': ['−{n} % off the item', 'خصم −{n} % على الصنف'],
  'Fermer': ['Close', 'إغلاق'],
  'Pourcentage non autorisé': ['Percentage not allowed', 'نسبة غير مسموح بها'],
  'en stock': ['in stock', 'في المخزون'],
  'Changer d\'article': ['Change item', 'تغيير الصنف'],
  'Touchez l’article cassé dans la liste ci-dessus.': ['Tap the broken item in the list above.', 'المس الصنف المكسور في القائمة أعلاه.'],
  'Aucun article ne correspond.': ['No item matches.', 'لا يوجد صنف مطابق.'],
  'Choisissez d’abord l’article cassé': ['Pick the broken item first', 'اختر الصنف المكسور أولاً'],
};
export const mzTr = (s) => {
  let lang = 'fr';
  try { lang = (window.KiwiCaisseLang && window.KiwiCaisseLang.get && window.KiwiCaisseLang.get()) || 'fr'; } catch (_) { lang = 'fr'; }
  const own = PHRASES[s];
  if (own && (lang === 'en' || lang === 'ar')) return own[lang === 'en' ? 0 : 1];
  /* Les mots du sélecteur boutique (« Prix convenu »…) vivent dans caisse-lang.js. */
  try { return lang !== 'fr' && window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(s) : s; } catch (_) { return s; }
};
const tr = mzTr;

/* Le sélecteur boutique porte ses classes bq-* ; pos-boutique.css n'est pas
   chargée sur la caisse maison, donc ses quelques règles sont posées ici, une
   fois, sous .mz-bargain (même dessin que .mz-seg et .mz-input). */
const CSS = '.mz-bargain{display:grid;gap:8px}'
  + '.mz-bargain .bq-seg{display:flex;gap:3px;background:var(--paper-mute);border-radius:13px;padding:4px;position:relative;max-width:340px}'
  + '.mz-bargain .bq-seg-it{flex:1;min-width:0;display:flex;align-items:center;justify-content:center;padding:8px 4px;border-radius:10px;font-size:12px;font-weight:600;color:var(--ink-2);transition:color 200ms ease;position:relative}'
  + '.mz-bargain .bq-seg:not([data-kw-lens]) .bq-seg-it.on{background:var(--forest)}'
  + '.mz-bargain .bq-seg-it.on{color:#fff}'
  + '.mz-bargain .bq-seg .kw-lens{border-radius:10px}'
  + '.mz-bargain .bq-bargain-mad{display:grid;gap:6px}'
  + '.mz-bargain .bq-bargain-mad[hidden],.mz-bargain .bq-bargain-pct[hidden]{display:none}'
  + '.mz-bargain .bq-input{width:100%;box-sizing:border-box;padding:11px 13px;background:var(--paper);border:1px solid var(--line);border-radius:11px;font:inherit;font-size:14px;color:var(--ink);outline:none}'
  + '.mz-bargain .bq-input:focus{border-color:var(--atlas)}'
  + '.mz-bargain .bq-bargain-pv{font-family:var(--mono);font-size:12px;color:var(--ink-2);min-height:16px}'
  + '.mz-bargain .bq-bargain-pv.is-err{color:var(--danger)}'
  + '#mz-tkrem-foot[hidden]{display:none}'
  /* « Remise » d'UNE ligne du ticket (l'article scanné n'a pas de fiche). */
  + '.mz-line-remb{display:inline-flex;align-items:center;gap:4px;margin-top:5px;padding:3px 9px 3px 7px;border-radius:999px;border:1px solid var(--line);background:var(--paper);color:var(--ink-2);font:inherit;font-size:11px;font-weight:600;cursor:pointer}'
  + '.mz-line-remb svg{width:14px;height:14px}'
  + '.mz-line-remb.on{color:var(--atlas);background:rgba(11,110,79,.12);border-color:transparent}'
  + '@media (pointer:coarse){.mz-line-remb{min-height:30px;padding-inline:11px}}';
export function ensureCss() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('mz-bargain-css')) return;
  const styleEl = document.createElement('style'); styleEl.id = 'mz-bargain-css'; styleEl.textContent = CSS; document.head.appendChild(styleEl);
}

/* Le sélecteur de la fiche article (sales.js) : le prix d'UNE pièce, convenu
   ou diminué de quelques dirhams. Sous le prix minimum (le taux le plus haut
   permis), le prix reste possible, « Appliquer quand même » comme la boutique :
   la caisse maison n'arrête plus une remise (propriétaire, 2026-11-23), le
   serveur la signale au tableau de bord (agreedMaxPercent). */
export function mzItemBargain(host, { base, pcts, fmt, chipsHTML, onChange, mode, text }) {
  ensureCss();
  host.classList.add('mz-bargain');
  return mountBargain(host, {
    tr, fmt, base, chipsHTML, mode, text,
    evaluate: (m, value) => {
      const r = agreedUnit(base, m, value, maxPct(pcts));
      if (r.error === 'floor') { const f = agreedUnit(base, m, value, 100); return f.error ? r : { ...r, forced: { after: f.unit, cut: f.cut } }; }
      return r.error ? r : { after: r.unit, cut: r.cut };
    },
    onChange,
  });
}

/* « Kolchi b 500 » posé sur le ticket : chaque entrée de la répartition nomme
   sa ligne d'origine (key = index) et peut la couper en deux. Les unités de
   stock tenues restent entières sur la première moitié : leur somme ne bouge
   pas, le règlement sort exactement ce qui a été tenu. */
export function mzAgreeTicket(t, assign) {
  t.lines = t.lines.flatMap((ln, i) => {
    const mine = assign.filter((a) => a.key === i);
    if (!mine.length) return [ln];
    return mine.map((a, k) => Object.assign({}, ln, { qty: a.qty, remise: 0, agreed: a.agreed, agreedFrom: 'ticket', units: k === 0 ? ln.units : 0 }));
  });
}

export function mzTicketRemise(d) {
  const { state, root, $, $$, esc, icons, toast, openVeil, closeVeil, openApprove,
    renderTicket, renderGrid, renderBadges, policyKey, fmt, pieceBase } = d;
  const t = state.ticket;
  if (!t.lines.length) return;
  /* d.only : l'index d'UNE ligne (bouton « Remise » de la ligne, l'article
     scanné), propriétaire 2026-11-24 ; sinon tout le ticket. */
  const one = Number.isInteger(d.only) && t.lines[d.only] ? d.only : null;
  const mine = one === null ? t.lines : [t.lines[one]];
  window.KiwiDiscountPolicy?.refresh?.(); // the owner may have lowered the allowed percentages
  const pcts = (window.KiwiDiscountPolicy?.percentages(policyKey) || [5, 10, 15, 20]).filter((p) => p > 0);
  const cur = mine.every((l) => l.remise === mine[0].remise && !(+l.agreed > 0)) ? (mine[0].remise || 0) : null;
  const apply = (pct, quiet) => {
    mine.forEach((ln) => { ln.remise = pct; ln.agreed = 0; ln.agreedFrom = ''; });
    renderTicket(); renderGrid(); renderBadges(); icons();
    if (!quiet) toast(pct ? tr(one === null ? 'Remise −{n} % sur le ticket' : 'Remise −{n} % sur l’article').replace('{n}', String(pct)) : tr('Remise supprimée'));
  };
  const el = $('#mz-approvem', root);
  /* Le squelette d'abord, les mots ensuite, chacun par tr(), comme la boutique. */
  el.innerHTML = '<button class="mz-modal-x" data-mz-close><i data-icon="close"></i></button>'
    + '<h3 class="modal-title"></h3><p class="modal-subtle"></p><div id="mz-tkrem-bargain"></div>'
    + '<div class="mz-sheet-foot" id="mz-tkrem-foot" hidden><button class="mz-btn primary" id="mz-tkrem-apply" disabled></button></div>';
  $('.mz-modal-x', el).setAttribute('aria-label', tr('Fermer'));
  $('.modal-title', el).textContent = one === null ? tr('Remise sur le ticket') : tr('Remise') + ' · ' + (d.nameOf ? d.nameOf(t.lines[one]) : '');
  $('.modal-subtle', el).textContent = one === null ? tr('S\'applique à tous les articles du ticket {n}.').replace('{n}', String(t.num || '')) : tr('S\'applique à cet article seulement.');
  /* Le total convenu ou les dirhams retirés du ticket, répartis sur les pièces
     par spreadTicket (bargain.js de la boutique). */
  const rows = t.lines.map((ln, i) => ({ key: i, base: pieceBase(ln), qty: ln.qty })).filter((r) => one === null || r.key === one);
  const T0 = Math.round(rows.reduce((s, r) => s + Math.round(r.base * 100) * r.qty, 0)) / 100;
  const off = (target) => Math.round((T0 - target) * 100) / 100;
  let last = null;
  ensureCss();
  const host = $('#mz-tkrem-bargain', el);
  host.classList.add('mz-bargain');
  mountBargain(host, {
    tr, fmt, base: T0,
    chipsHTML: '<div class="mz-chips" id="mz-tkrem-chips">'
      + [0, ...pcts].map((r) => '<button class="mz-chip ' + (cur === r ? 'on' : '') + '" data-mz-tkrem="' + r + '">' + (r === 0 ? esc(tr('Sans')) : '−' + r + ' %') + '</button>').join('')
      + '</div>',
    evaluate: (mode, value) => {
      const target = mode === 'price' ? value : off(value);
      if (!(target > 0)) return { error: 'floor', floor: spreadTicket(rows, 0.01, maxPct(pcts)).floor || 0 };
      const r = spreadTicket(rows, target, maxPct(pcts));
      if (r.error === 'floor') {
        const f = spreadTicket(rows, target, 99.99);
        return f.error ? r : { ...r, forced: { after: target, cut: off(target), assign: f.assign } };
      }
      return r.error ? r : { after: target, cut: off(target), assign: r.assign };
    },
    onChange: (r) => {
      last = r;
      $('#mz-tkrem-foot', el).hidden = r.mode === 'pct';
      const btn = $('#mz-tkrem-apply', el);
      const forced = r.error === 'floor' && r.res && r.res.forced;
      btn.disabled = !r.ok && !forced;
      btn.textContent = r.ok ? tr('Appliquer') + ' · ' + fmt(r.res.after)
        : forced ? tr('Appliquer quand même') + ' · ' + fmt(forced.after) : tr('Appliquer');
    },
  });
  $('#mz-tkrem-apply', el).textContent = tr('Appliquer');
  $('#mz-tkrem-apply', el).onclick = () => {
    const r0 = last;
    const forced = r0 && r0.error === 'floor' && r0.res && r0.res.forced;
    if (!r0 || (!r0.ok && !forced)) return;
    const res = forced || r0.res;
    closeVeil('#mz-approve-veil');
    openApprove(0, () => {
      mzAgreeTicket(t, res.assign);
      renderTicket(); renderGrid(); renderBadges(); icons();
    }, { mode: r0.mode, value: r0.value, label: tr('Prix convenu') + ' ' + fmt(res.after) });
  };
  openVeil('#mz-approve-veil');
  icons();
  $$('[data-mz-close]', el).forEach((b) => { b.onclick = () => closeVeil('#mz-approve-veil'); });
  $('#mz-tkrem-chips', el).onclick = (e) => {
    const b = e.target.closest('[data-mz-tkrem]');
    if (!b) return;
    const pct = parseInt(b.dataset.mzTkrem, 10) || 0;
    if (pct > 0 && window.KiwiDiscountPolicy && !window.KiwiDiscountPolicy.allowed(pct, policyKey)) { toast(tr('Pourcentage non autorisé')); return; }
    /* Retirer la remise n'a jamais demandé d'accord ; l'accorder, si. */
    closeVeil('#mz-approve-veil');
    if (!pct || t.remiseAuth) { apply(pct); return; }
    openApprove(pct, () => { closeVeil('#mz-approve-veil'); apply(pct, true); });   // openApprove dit déjà « Remise −n % »
  };
}
