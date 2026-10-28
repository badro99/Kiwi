/* L'Inventaire de la caisse boutique, deux aides (propriétaire, 2026-10-28).
 *
 * 1. La pastille « Inventaire » compte les alertes de stock NON VUES. Elle
 *    comptait toutes les alertes, tout le temps : un 2 rouge qui ne part
 *    jamais n'avertit plus de rien. Une alerte, c'est un article ET son
 *    niveau (bas, épuisé) : passer de bas à épuisé avertit de nouveau, et un
 *    article réassorti sort de la liste vue, il avertira s'il redescend.
 *    Mémoire par appareil et par boutique, dans le navigateur : c'est un
 *    confort de lecture, pas une donnée.
 *
 * 2. La barre de recherche de l'Inventaire répond au premier caractère,
 *    comme celle de la Vente (search.js). Elle ne savait lire qu'un code
 *    complet : un nom tapé partait en « code inconnu » vers la reprise de
 *    stock. La douchette garde son chemin livré (Entrée sur un code). */
import { bqKitScanBar } from './kit-2027.js?v=14';
import { searchArticles } from './search.js?v=5';

const LOW = 5;   // le seuil de stats() (boutique-catalog.js) et des lignes de l'Inventaire
const seenKey = (k) => 'kiwiBqInvSeen:' + (k || 'local');

function alerts(list) {
  const out = [];
  for (const [pid, n] of list) {
    if (n === 0) out.push(pid + ':out');
    else if (n > 0 && n <= LOW) out.push(pid + ':low');
  }
  return out;
}
function readSeen(k) {
  try { const a = JSON.parse(localStorage.getItem(seenKey(k)) || '[]'); return Array.isArray(a) ? a : []; } catch (_) { return []; }
}
function writeSeen(k, ids) { try { localStorage.setItem(seenKey(k), JSON.stringify(ids)); } catch (_) {} }

/* list : [[pid, stock]], relu par l'appelant à chaque peinture. */
export function invUnseenCount(k, list) {
  const now = alerts(list);
  const seen = readSeen(k);
  const kept = seen.filter((id) => now.indexOf(id) >= 0);
  if (kept.length !== seen.length) writeSeen(k, kept);   // réassorti : il pourra avertir de nouveau
  return now.filter((id) => kept.indexOf(id) < 0).length;
}
export function invMarkSeen(k, list) { writeSeen(k, alerts(list)); }

/* La barre de l'Inventaire porte la liste (les deux livrées), et la liste
   est plus large que la barre : un nom, une taille, une couleur, un code et
   un prix ne tiennent pas dans 270 px. La livrée d'avant n'a pas la feuille
   de la peau 2027 : sa liste porte .is-plain et reçoit ses règles ici, en
   variables livrées. Posé une fois ; la peau garde ses propres règles. */
function invCss() {
  if (document.getElementById('bq-sgst-plain')) return;
  const s = document.createElement('style');
  s.id = 'bq-sgst-plain';
  const P = '#pos-boutique .bq-sgst.is-plain';
  s.textContent = [
    '#pos-boutique .bqi-scan{position:relative;z-index:5;}',
    /* « Inventaire physique » prenait flex:2 (la règle des boutons primaires du
       ticket) et s'étirait sur la moitié de la barre : il garde sa largeur, la
       recherche prend le reste (propriétaire, 2026-10-28). */
    '#pos-boutique .bqi-tools > .bq-btn{flex:0 0 auto;}',
    '#pos-boutique .bqi-tools{flex-wrap:wrap;row-gap:10px;}',
    '#pos-boutique .bqi-tools > .bqi-scan{flex:1 1 240px;min-width:200px;}',
    '#pos-boutique .bqi-tools > .bqi-scan input{min-width:0;width:100%;}',   // le champ ne déborde plus sur « Inventaire physique »
    '#pos-boutique #bqi-sgst{inset-inline-end:auto;width:max(100%,520px);max-width:calc(100vw - 140px);}',
    P + '{position:absolute;left:0;right:0;top:calc(100% + 6px);max-height:min(60vh,480px);overflow-y:auto;overscroll-behavior:contain;padding:6px;border-radius:12px;background:var(--paper-elev,#FFFDFA);border:1px solid var(--line,#E2DDD2);box-shadow:0 12px 32px rgba(10,15,13,.14);}',
    P + '[hidden]{display:none;}',
    P + ' .bq-sgst-it{display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:12px;width:100%;min-height:56px;padding:6px 10px;border:0;border-radius:9px;background:none;text-align:start;color:var(--ink,#0A0F0D);cursor:pointer;font:inherit;}',
    P + ' :is(.bq-sgst-it:hover,.bq-sgst-it.on){background:var(--paper-soft,#F1EEE7);}',
    P + ' .bq-sgst-art{width:40px;height:40px;display:grid;place-items:center;border-radius:8px;background:var(--paper,#F7F5F0);overflow:hidden;}',
    P + ' .bq-sgst-art svg{width:26px;height:26px;}',
    P + ' .bq-sgst-art img{width:40px;height:40px;object-fit:contain;}',
    P + ' .bq-sgst-txt{display:flex;flex-direction:column;gap:2px;min-width:0;}',
    P + ' .bq-sgst-nm{font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    P + ' .bq-sgst-sub{display:flex;gap:8px;font-size:12px;color:var(--ink-2,#3D4441);}',
    P + ' .bq-sgst-cd{font-family:var(--mono,monospace);color:var(--ink-3,#6F6C65);}',
    P + ' :is(.bq-sgst-cd,.bq-sgst-nm) b{color:var(--ink,#0A0F0D);font-weight:700;}',
    P + ' .bq-sgst-end{display:flex;flex-direction:column;align-items:flex-end;gap:2px;}',
    P + ' .bq-sgst-pz{font-size:13px;font-weight:600;white-space:nowrap;}',
    P + ' .bq-sgst-pz s{color:var(--ink-3,#6F6C65);font-weight:400;}',
    P + ' .bq-sgst-st{font-size:11.5px;color:var(--ink-3,#6F6C65);white-space:nowrap;}',
    P + ' .bq-sgst-st.out{color:var(--danger-mute,#B4412F);}',
    P + ' .bq-sgst-none{padding:16px 10px;text-align:center;font-size:13px;color:var(--ink-2,#3D4441);}',
  ].join('\n');
  document.head.appendChild(s);
}

/* Monte la liste sur la barre de l'Inventaire, dans les DEUX livrées : le
   panneau est réécrit à chaque rendu, la barre aussi, donc on remonte à
   chaque fois (bqKitScanBar refuse une barre déjà montée). Toucher une ligne
   ouvre la fiche stock de l'article, comme un scan. */
export function invSearch(bar, input, skin, d) {
  if (!bar || !input) return false;
  invCss();
  const ok = bqKitScanBar(bar, {
    input, id: 'bqi-sgst', plain: !skin, enterFirst: true,
    commit: d.code, open: d.open, money: d.money, esc: d.esc, icons: d.icons,
    search: (q) => searchArticles(q, d.catalog()),
    visual: (r) => (r.photo ? '<img class="bq-product-photo" src="' + d.esc(r.photo) + '" alt="" loading="lazy" />' : d.artOf(r.art)),
  });
  const list = bar.querySelector('.bq-sgst');
  if (list && !skin) list.classList.add('is-plain');
  return ok;
}

/* 3. Un inventaire renvoyé par le propriétaire (« Demander des précisions »
 *    au tableau de bord, statut correction_requested) s'affiche en tête de
 *    l'Inventaire avec sa question, et « Recompter » rouvre le comptage en
 *    REMPLAÇANT l'ancien document (supersedes). Boutiques réelles seulement :
 *    la démo n'a pas de serveur. Lu au plus une fois par minute — l'Inventaire
 *    se repeint souvent. */
const trI = (s) => (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.tr === 'function' ? window.KiwiCaisseLang.tr(s) : s);
const asks = { key: '', at: 0, rows: [], busy: false };
function paintAsks(panel, d) {
  const tools = panel.querySelector('.bqi-tools');
  let box = panel.querySelector('#bqi-asks');
  if (!asks.rows.length) { if (box) box.remove(); return; }
  if (!box && tools) {
    box = document.createElement('div');
    box.id = 'bqi-asks';
    box.className = 'bqi-asks';
    tools.after(box);
  }
  if (!box) return;
  box.innerHTML = asks.rows.map((c) => '<div class="bqi-ask"><div class="bqi-ask-t"><b>' + d.esc(trI('Le propriétaire demande des précisions'))
    + '</b><span>' + d.esc(trI('Inventaire de') + ' ' + (c.employeeName || '·') + ' · ' + new Date(c.submittedAt || Date.now()).toLocaleDateString('fr-FR'))
    + '</span>' + (c.reviewNote ? '<q>' + d.esc(c.reviewNote) + '</q>' : '') + '</div>'
    + '<button type="button" class="bq-btn" data-ask-recount="' + d.esc(c.id) + '">' + d.esc(trI('Recompter')) + '</button></div>').join('');
  box.querySelectorAll('[data-ask-recount]').forEach((b) => b.addEventListener('click', () => {
    const c = asks.rows.find((x) => x.id === b.dataset.askRecount);
    if (c) d.recount({ supersedes: c.id, correctionNote: c.reviewNote || '' });
  }));
}
export function invCountAsks(panel, d) {
  if (!panel || !d || !d.real || !d.merchant) return;
  if (!document.getElementById('bqi-asks-css')) {
    const style = document.createElement('style');
    style.id = 'bqi-asks-css';
    style.textContent = '#pos-boutique .bqi-asks{display:flex;flex-direction:column;gap:8px;padding:6px 22px 0;}'
      + '#pos-boutique .bqi-ask{display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid #fde68a;background:#fffbeb;border-radius:12px;color:#92400e;}'
      + '#pos-boutique .bqi-ask-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;font-size:13px;}'
      + '#pos-boutique .bqi-ask-t q{color:#78350f;}'
      + '#pos-boutique .bqi-ask .bq-btn{flex:0 0 auto;}';
    document.head.appendChild(style);
  }
  paintAsks(panel, d);
  if (asks.busy || (asks.key === d.merchant && Date.now() - asks.at < 60000)) return;
  asks.busy = true;
  fetch('/api/inventory/counts?status=correction_requested&merchant=' + encodeURIComponent(d.merchant))
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => {
      asks.key = d.merchant; asks.at = Date.now();
      asks.rows = (j && Array.isArray(j.counts) ? j.counts : []).filter((c) => c && c.status === 'correction_requested' && (!c.engine || c.engine === 'boutique'));
      if (panel.isConnected) paintAsks(panel, d);
    })
    .catch(() => {})
    .finally(() => { asks.busy = false; });
}

/* 4. L'Inventaire se redessine en entier quand le catalogue ou les
 *    promotions changent (une synchronisation, une vente sur une autre caisse,
 *    le retour sur l'onglet). La barre de recherche était refaite avec : ce
 *    qu'on venait de taper disparaissait, et un champ VIDE perdait son curseur
 *    — on cliquait, on attendait une seconde, plus rien ne s'écrivait
 *    (propriétaire, 2026-10-28). Désormais la barre d'outils déjà montée n'est
 *    JAMAIS retirée du document : on remplace tout ce qui l'entoure. Le champ
 *    garde son texte, son curseur et le clavier de la tablette ; la liste garde
 *    sa position de défilement. Premier rendu : écriture normale. */
export function invPaint(panel, html) {
  const box = panel.querySelector(':scope > .bqi');
  const tools = box && box.querySelector(':scope > .bqi-tools');
  if (!tools || !tools.querySelector('.bq-sgst')) { panel.innerHTML = html; return false; }
  const tmp = document.createElement('div');
  tmp.innerHTML = html;
  const fresh = tmp.querySelector(':scope > .bqi');
  const kids = fresh ? [...fresh.children] : [];
  const at = kids.findIndex((k) => k.classList.contains('bqi-tools'));
  if (at < 0) { panel.innerHTML = html; return false; }
  [...box.children].forEach((k) => { if (k !== tools) k.remove(); });
  kids.slice(0, at).forEach((k) => box.insertBefore(k, tools));
  kids.slice(at + 1).forEach((k) => box.appendChild(k));
  return true;
}
