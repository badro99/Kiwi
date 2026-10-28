/* La caisse boutique · « Mouvements de stock », en LECTURE (propriétaire,
 * validé 2026-10-27, lancé 2026-10-28).
 *
 * Aujourd'hui la caisse ne montrait les mouvements que produit par produit,
 * dans la fiche article. Ici, la vue d'ensemble : tuiles, recherche, période,
 * type, catégorie, et la table (date, produit, type, quantité, avant → après,
 * employé, source, référence). La même lecture que la page du tableau de bord
 * (pages-pro-boutique.js) : KiwiMaisonStock.list({ module: 'boutique' }).
 *
 * Rien ici n'écrit. Pas d'enable(), pas d'attach(), pas de record(), aucune
 * écriture au catalogue : ouvrir cet écran ne peut pas faire bouger un stock.
 * Le registre est relu au serveur à l'ouverture (KiwiInventory.sync), pour
 * voir aussi ce que les autres appareils de la boutique ont écrit. */
const MODULE = 'boutique';
const MAX_ROWS = 300;
const tr = (s) => (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.tr === 'function' ? window.KiwiCaisseLang.tr(s) : s);
const f = { q: '', days: 30, type: '', cat: '' };
const IO = { in: 'in', out: 'out', flat: '' };   // classes de couleur des tuiles   // le dernier filtre, le temps de la session

function source(s) {
  if (s === 'caisse') return tr('Caisse');
  if (s === 'dashboard') return tr('Tableau de bord');
  if (s === 'import') return tr('Import');
  return s || '·';
}
function rowsFor(MZ) {
  const q = { module: MODULE, q: f.q, type: f.type, categoryId: f.cat };
  if (f.days) q.from = Date.now() - f.days * 86400000;
  return MZ.list(q);
}
function table(rows, esc) {
  if (!rows.length) {
    return '<div class="bqm-empty"><i data-icon="history"></i><b>' + esc(tr('Aucun mouvement trouvé')) + '</b><span>'
      + esc(tr('Changez la période ou les filtres.')) + '</span></div>';
  }
  const shown = rows.slice(0, MAX_ROWS);
  const when = (at) => new Date(at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const head = ['Date', 'Produit', 'Type', 'Qté', 'Avant → après', 'Employé', 'Source', 'Référence']
    .map((h) => '<th>' + esc(tr(h)) + '</th>').join('');
  const body = shown.map((m) => {
    const io = m.dir > 0 ? 'in' : 'out';
    return '<tr>'
      + '<td class="bqm-mut">' + esc(when(m.at)) + (m.pending ? '<small>' + esc(tr('En attente de synchro')) + '</small>' : '') + '</td>'
      + '<td><b>' + esc(m.product || '·') + '</b>' + (m.variant ? '<small>' + esc(m.variant) + '</small>' : '') + '</td>'
      + '<td><span class="bqm-chip ' + io + '">' + esc(tr(m.typeLabel || 'Mouvement')) + '</span></td>'
      + '<td class="bqm-qty ' + io + '">' + (m.dir > 0 ? '+' : '−') + Math.abs(m.qty) + '</td>'
      + '<td class="bqm-mut">' + (m.before == null ? '·' : esc(m.before + ' → ' + m.after)) + '</td>'
      + '<td>' + esc(m.actor || '·') + '</td>'
      + '<td class="bqm-mut">' + esc(source(m.source)) + '</td>'
      + '<td class="bqm-mut">' + esc(m.ref || '·') + (m.note ? '<small>' + esc(m.note) + '</small>' : '') + '</td>'
      + '</tr>';
  }).join('');
  const more = rows.length > shown.length
    ? '<div class="bqm-more">' + esc(tr('Les {n} plus récents sont affichés. Réduisez la période pour voir les autres.').replace('{n}', String(MAX_ROWS))) + '</div>' : '';
  return '<div class="bqm-wrap"><table class="bqm-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' + more;
}
function paint(el, MZ, d) {
  const rows = rowsFor(MZ);
  const t = MZ.totals(rows);
  const bal = t.entries - t.exits;
  const tile = (l, v, cls, s) => '<div class="bqm-kpi"><span>' + d.esc(l) + '</span><b class="' + cls + '">' + v + '</b><small>' + d.esc(s) + '</small></div>';
  const kp = el.querySelector('#bqm-kpis');
  if (kp) kp.innerHTML = tile(tr('Mouvements'), t.count, IO.flat, f.days ? tr('{n} derniers jours').replace('{n}', String(f.days)) : tr('Tout l’historique'))
    + tile(tr('Entrées'), '+' + t.entries, IO.in, tr('Pièces ajoutées'))
    + tile(tr('Sorties'), '−' + t.exits, IO.out, tr('Pièces sorties'))
    + tile(tr('Solde'), (bal >= 0 ? '+' : '−') + Math.abs(bal), IO.flat, tr('Variation nette'));
  const res = el.querySelector('#bqm-res');
  if (res) res.innerHTML = table(rows, d.esc);
  d.icons();
}

function css() {
  if (document.getElementById('bqm-css')) return;
  const s = document.createElement('style');
  s.id = 'bqm-css';
  s.textContent = [
    '#pos-boutique .bqm-view{padding:22px 24px 20px;display:flex;flex-direction:column;gap:14px;min-width:0;}',
    '#pos-boutique .bqm-head h3{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em;}',
    '#pos-boutique .bqm-head span{display:block;margin-top:4px;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqm-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}',
    '#pos-boutique .bqm-kpi{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);min-width:0;}',
    '#pos-boutique .bqm-kpi span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqm-kpi b{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;}',
    '#pos-boutique .bqm-kpi small{font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique :is(.bqm-kpi b,.bqm-qty).in{color:var(--forest,#0B6E4F);}',
    '#pos-boutique :is(.bqm-kpi b,.bqm-qty).out{color:var(--danger-mute,#B4412F);}',
    '#pos-boutique .bqm-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
    '#pos-boutique .bqm-tools input{flex:1 1 220px;min-width:0;min-height:44px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;}',
    /* Les listes déroulantes deviennent des .kiwi-select (le sélecteur maison) : on dimensionne l'enveloppe. */
    '#pos-boutique .bqm-tools .kiwi-select{flex:0 1 200px;width:auto;min-width:150px;}',
    '#pos-boutique .bqm-tools select{min-height:44px;padding:0 10px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;}',
    '#pos-boutique .bqm-wrap{overflow:auto;max-height:52vh;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);}',
    '#pos-boutique .bqm-table{width:100%;border-collapse:collapse;font-size:13px;}',
    '#pos-boutique .bqm-table th{position:sticky;top:0;z-index:1;background:var(--paper-soft,#F1EEE7);text-align:start;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3,#6F6C65);padding:9px 10px;white-space:nowrap;}',
    '#pos-boutique .bqm-table td{padding:9px 10px;border-top:1px solid var(--line,#E2DDD2);vertical-align:top;}',
    '#pos-boutique .bqm-table td small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqm-mut{color:var(--ink-2,#3D4441);white-space:nowrap;}',
    '#pos-boutique .bqm-qty{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '#pos-boutique .bqm-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;}',
    '#pos-boutique .bqm-chip.in{background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);}',
    '#pos-boutique .bqm-chip.out{background:var(--paper-soft,#F1EEE7);color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqm-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center;color:var(--ink-2,#3D4441);}',
    '#pos-boutique .bqm-empty i,#pos-boutique .bqm-empty svg{width:28px;height:28px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqm-more,#pos-boutique .bqm-foot{font-size:12.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-boutique .bqm-foot{display:flex;gap:8px;align-items:flex-start;}',
    '@media (max-width:760px){#pos-boutique .bqm-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}}',
  ].join('\n');
  document.head.appendChild(s);
}

/* d : { setModal, esc, icons, catDB } — les outils de inventory.js, rien de copié. */
export function openMoves(d) {
  const MZ = window.KiwiMaisonStock;
  if (!MZ || typeof MZ.list !== 'function') { if (d.toast) d.toast(tr('Registre des mouvements indisponible. Rechargez la caisse.')); return; }
  css();
  const esc = d.esc;
  const cat = d.catDB && d.catDB();
  const cats = (cat && cat.listCategories && cat.listCategories()) || [];
  const fac = MZ.facets(MODULE);
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const types = MZ.types().filter((t) => !fac.types.length || fac.types.indexOf(t.id) >= 0);
  const html = '<button class="bq-modal-x" data-inv-x aria-label="' + esc(tr('Fermer')) + '"><i data-icon="close"></i></button>'
    + '<div class="bqm-view">'
    + '<div class="bqm-head"><h3>' + esc(tr('Mouvements de stock')) + '</h3><span>' + esc(tr('Chaque entrée et chaque sortie, avec le stock avant et après')) + '</span></div>'
    + '<div class="bqm-kpis" id="bqm-kpis"></div>'
    + '<div class="bqm-tools">'
    + '<input id="bqm-q" type="search" autocomplete="off" value="' + esc(f.q) + '" placeholder="' + esc(tr('Produit, type, référence…')) + '" />'
    + '<select id="bqm-days" aria-label="' + esc(tr('Période')) + '">' + [[0, 'Tout'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours'], [365, '12 mois']].map(([v, l]) => opt(v, tr(l), f.days)).join('') + '</select>'
    + '<select id="bqm-type" aria-label="' + esc(tr('Type de mouvement')) + '">' + opt('', tr('Tous les types'), f.type) + types.map((t) => opt(t.id, (t.dir > 0 ? '↑ ' : '↓ ') + tr(t.label), f.type)).join('') + '</select>'
    + '<select id="bqm-cat" aria-label="' + esc(tr('Catégorie')) + '">' + opt('', tr('Toutes catégories'), f.cat) + cats.map((c) => opt(c.id, c.name, f.cat)).join('') + '</select>'
    + '</div>'
    + '<div id="bqm-res"></div>'
    + '<div class="bqm-foot"><i data-icon="info"></i><span>' + esc(tr('Les ventes, retours et échanges de la caisse s’écrivent ici automatiquement. Les modifications de stock faites au tableau de bord n’y figurent pas.')) + '</span></div>'
    + '</div>';
  d.setModal(html, (el) => {
    el.style.width = 'min(1120px, 96vw)';
    paint(el, MZ, d);
    const q = el.querySelector('#bqm-q');
    q.addEventListener('input', () => { f.q = q.value.trim(); paint(el, MZ, d); });
    el.querySelector('#bqm-days').addEventListener('change', (e) => { f.days = parseInt(e.target.value, 10) || 0; paint(el, MZ, d); });
    el.querySelector('#bqm-type').addEventListener('change', (e) => { f.type = e.target.value; paint(el, MZ, d); });
    el.querySelector('#bqm-cat').addEventListener('change', (e) => { f.cat = e.target.value; paint(el, MZ, d); });
    /* Relire le serveur : les lignes des autres caisses et du tableau de bord. */
    const L = window.KiwiInventory;
    if (L && typeof L.sync === 'function') {
      Promise.resolve(L.sync()).then(() => { if (el.isConnected && el.querySelector('#bqm-res')) paint(el, MZ, d); }).catch(() => {});
    }
  });
}
