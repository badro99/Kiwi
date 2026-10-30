/* La caisse maison · « Mouvements de stock » — LA MÊME FENÊTRE QUE LA
 * BOUTIQUE (propriétaire, 2026-10-30 : « je veux celle de la boutique dans la
 * maison, elle est mieux »). Ce fichier est pos-boutique/inv-moves.js traduit
 * (bq- → mz-, #pos-boutique → #pos-maison, module 'maison') ; une correction
 * faite là-bas se reporte ici. Deux écarts voulus, propres à la maison :
 *  · le bouton « Nouveau mouvement » (entrée ou sortie manuelle, code d'un
 *    responsable) que la page de la maison avait déjà — d.onNew ;
 *  · la lecture garde celle de la page maison : pas de `shared`, une ligne
 *    refusée par le serveur reste visible sur cette tablette.
 * Elle s'ouvre depuis l'Inventaire, dans la fenêtre de l'inventaire, comme
 * dans la boutique, au lieu de remplacer la page. Rien ici n'écrit. */
const MODULE = 'maison';
const MAX_ROWS = 300;
const tr = (s) => (window.KiwiCaisseLang && typeof window.KiwiCaisseLang.tr === 'function' ? window.KiwiCaisseLang.tr(s) : s);
const f = { q: '', days: 0, type: '', cat: '' };
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
    return '<div class="mzmv-empty"><i data-icon="history"></i><b>' + esc(tr('Aucun mouvement trouvé')) + '</b><span>'
      + esc(tr('Changez la période ou les filtres.')) + '</span></div>';
  }
  const shown = rows.slice(0, MAX_ROWS);
  const when = (at) => new Date(at).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  const head = ['Date', 'Produit', 'Type', 'Qté', 'Avant → après', 'Employé', 'Source', 'Référence']
    .map((h) => '<th>' + esc(tr(h)) + '</th>').join('');
  const body = shown.map((m) => {
    const io = m.dir > 0 ? 'in' : 'out';
    return '<tr>'
      + '<td class="mzmv-mut">' + esc(when(m.at)) + (m.pending ? '<small>' + esc(tr('En attente de synchro')) + '</small>' : '') + '</td>'
      + '<td><b>' + esc(m.product || '·') + '</b>' + (m.variant ? '<small>' + esc(m.variant) + '</small>' : '') + '</td>'
      + '<td><span class="mzmv-chip ' + io + '">' + esc(tr(m.typeLabel || 'Mouvement')) + '</span></td>'
      + '<td class="mzmv-qty ' + io + '">' + (m.dir > 0 ? '+' : '−') + Math.abs(m.qty) + '</td>'
      + '<td class="mzmv-mut">' + (m.before == null ? '·' : esc(m.before + ' → ' + m.after)) + '</td>'
      + '<td>' + esc(m.actor || '·') + '</td>'
      + '<td class="mzmv-mut">' + esc(source(m.source)) + '</td>'
      + '<td class="mzmv-mut">' + esc(m.ref || '·') + (m.note ? '<small>' + esc(m.note) + '</small>' : '') + '</td>'
      + '</tr>';
  }).join('');
  const more = rows.length > shown.length
    ? '<div class="mzmv-more">' + esc(tr('Les {n} plus récents sont affichés. Réduisez la période pour voir les autres.').replace('{n}', String(MAX_ROWS))) + '</div>' : '';
  return '<div class="mzmv-wrap"><table class="mzmv-table"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' + more;
}
function paint(el, MZ, d) {
  const rows = rowsFor(MZ);
  const t = MZ.totals(rows);
  const bal = t.entries - t.exits;
  const tile = (l, v, cls, s) => '<div class="mzmv-kpi"><span>' + d.esc(l) + '</span><b class="' + cls + '">' + v + '</b><small>' + d.esc(s) + '</small></div>';
  const kp = el.querySelector('#mzmv-kpis');
  if (kp) kp.innerHTML = tile(tr('Mouvements'), t.count, IO.flat, f.days ? tr('{n} derniers jours').replace('{n}', String(f.days)) : tr('Tout l’historique'))
    + tile(tr('Entrées'), '+' + t.entries, IO.in, tr('Pièces ajoutées'))
    + tile(tr('Sorties'), '−' + t.exits, IO.out, tr('Pièces sorties'))
    + tile(tr('Solde'), (bal >= 0 ? '+' : '−') + Math.abs(bal), IO.flat, tr('Variation nette'));
  const res = el.querySelector('#mzmv-res');
  if (res) res.innerHTML = table(rows, d.esc);
  d.icons();
}

function css() {
  if (document.getElementById('mzmv-css')) return;
  const s = document.createElement('style');
  s.id = 'mzmv-css';
  s.textContent = [
    '#pos-maison .mzmv-view{padding:22px 24px 20px;display:flex;flex-direction:column;gap:14px;min-width:0;}',
    '#pos-maison .mzmv-head{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding-inline-end:56px;}',
    '#pos-maison .mzmv-head h3{margin:0;font-size:22px;font-weight:700;letter-spacing:-.01em;}',
    '#pos-maison .mzmv-head span{display:block;margin-top:4px;font-size:13px;color:var(--ink-3,#6F6C65);}',
    '#pos-maison .mzmv-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;}',
    '#pos-maison .mzmv-kpi{display:flex;flex-direction:column;gap:3px;padding:12px 14px;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);min-width:0;}',
    '#pos-maison .mzmv-kpi span{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3,#6F6C65);}',
    '#pos-maison .mzmv-kpi b{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;}',
    '#pos-maison .mzmv-kpi small{font-size:12px;color:var(--ink-3,#6F6C65);}',
    '#pos-maison :is(.mzmv-kpi b,.mzmv-qty).in{color:var(--forest,#0B6E4F);}',
    '#pos-maison :is(.mzmv-kpi b,.mzmv-qty).out{color:var(--danger-mute,#B4412F);}',
    '#pos-maison .mzmv-tools{display:flex;flex-wrap:wrap;gap:8px;align-items:center;}',
    '#pos-maison .mzmv-tools input{flex:1 1 220px;min-width:0;min-height:44px;padding:0 14px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;}',
    /* Les listes déroulantes deviennent des .kiwi-select (le sélecteur maison) : on dimensionne l'enveloppe. */
    '#pos-maison .mzmv-tools .kiwi-select{flex:0 1 200px;width:auto;min-width:150px;}',
    '#pos-maison .mzmv-tools select{min-height:44px;padding:0 10px;border:1px solid var(--line,#E2DDD2);border-radius:10px;background:var(--paper-elev,#FFFDFA);font:inherit;font-size:14px;color:inherit;}',
    '#pos-maison .mzmv-wrap{overflow:auto;max-height:52vh;border:1px solid var(--line,#E2DDD2);border-radius:12px;background:var(--paper-elev,#FFFDFA);}',
    '#pos-maison .mzmv-table{width:100%;border-collapse:collapse;font-size:13px;}',
    '#pos-maison .mzmv-table th{position:sticky;top:0;z-index:1;background:var(--paper-soft,#F1EEE7);text-align:start;font-size:11px;font-weight:600;letter-spacing:.05em;text-transform:uppercase;color:var(--ink-3,#6F6C65);padding:9px 10px;white-space:nowrap;}',
    '#pos-maison .mzmv-table td{padding:9px 10px;border-top:1px solid var(--line,#E2DDD2);vertical-align:top;}',
    '#pos-maison .mzmv-table td small{display:block;margin-top:2px;font-size:11.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-maison .mzmv-mut{color:var(--ink-2,#3D4441);white-space:nowrap;}',
    '#pos-maison .mzmv-qty{font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap;}',
    '#pos-maison .mzmv-chip{display:inline-block;padding:2px 8px;border-radius:999px;font-size:12px;font-weight:600;white-space:nowrap;}',
    '#pos-maison .mzmv-chip.in{background:var(--mint-tint,#E6F6EE);color:var(--forest,#0B6E4F);}',
    '#pos-maison .mzmv-chip.out{background:var(--paper-soft,#F1EEE7);color:var(--ink-2,#3D4441);}',
    '#pos-maison .mzmv-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:40px 16px;text-align:center;color:var(--ink-2,#3D4441);}',
    '#pos-maison .mzmv-empty i,#pos-maison .mzmv-empty svg{width:28px;height:28px;color:var(--ink-3,#6F6C65);}',
    '#pos-maison .mzmv-more,#pos-maison .mzmv-foot{font-size:12.5px;color:var(--ink-3,#6F6C65);}',
    '#pos-maison .mzmv-foot{display:flex;gap:8px;align-items:flex-start;}',
    '@media (max-width:760px){#pos-maison .mzmv-kpis{grid-template-columns:repeat(2,minmax(0,1fr));}}',
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
  f.days = 0;   // comme le tableau de bord : chaque ouverture repart de « Tout »
  if (typeof MZ.enable === 'function') MZ.enable();
  const fac = MZ.facets(MODULE);
  const opt = (v, l, cur) => '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? ' selected' : '') + '>' + esc(l) + '</option>';
  const types = MZ.types().filter((t) => !fac.types.length || fac.types.indexOf(t.id) >= 0);
  const html = '<button class="mz-modal-x" data-inv-x aria-label="' + esc(tr('Fermer')) + '"><i data-icon="close"></i></button>'
    + '<div class="mzmv-view">'
    + '<div class="mzmv-head"><div><h3>' + esc(tr('Mouvements de stock')) + '</h3><span>' + esc(tr('Chaque entrée et chaque sortie, avec le stock avant et après')) + '</span></div>'
    + (d.onNew ? '<button class="mz-btn primary" id="mzmv-new"><i data-icon="add"></i>' + esc(tr('Nouveau mouvement')) + '</button>' : '') + '</div>'
    + '<div class="mzmv-kpis" id="mzmv-kpis"></div>'
    + '<div class="mzmv-tools">'
    + '<input id="mzmv-q" type="search" autocomplete="off" value="' + esc(f.q) + '" placeholder="' + esc(tr('Produit, type, référence…')) + '" />'
    + '<select id="mzmv-days" aria-label="' + esc(tr('Période')) + '">' + [[0, 'Tout'], [7, '7 jours'], [30, '30 jours'], [90, '90 jours'], [365, '12 mois']].map(([v, l]) => opt(v, tr(l), f.days)).join('') + '</select>'
    + '<select id="mzmv-type" aria-label="' + esc(tr('Type de mouvement')) + '">' + opt('', tr('Tous les types'), f.type) + types.map((t) => opt(t.id, (t.dir > 0 ? '↑ ' : '↓ ') + tr(t.label), f.type)).join('') + '</select>'
    + '<select id="mzmv-cat" aria-label="' + esc(tr('Catégorie')) + '">' + opt('', tr('Toutes catégories'), f.cat) + cats.map((c) => opt(c.id, c.name, f.cat)).join('') + '</select>'
    + '</div>'
    + '<div id="mzmv-res"></div>'
    + '<div class="mzmv-foot"><i data-icon="info"></i><span>' + esc(tr('Les ventes et retours s’écrivent ici automatiquement. Un mouvement manuel demande le code d’un responsable.')) + '</span></div>'
    + '</div>';
  d.setModal(html, (el) => {
    el.style.width = 'min(1120px, 96vw)';
    paint(el, MZ, d);
    const nb = el.querySelector('#mzmv-new');
    if (nb) nb.addEventListener('click', () => d.onNew());
    const q = el.querySelector('#mzmv-q');
    q.addEventListener('input', () => { f.q = q.value.trim(); paint(el, MZ, d); });
    el.querySelector('#mzmv-days').addEventListener('change', (e) => { f.days = parseInt(e.target.value, 10) || 0; paint(el, MZ, d); });
    el.querySelector('#mzmv-type').addEventListener('change', (e) => { f.type = e.target.value; paint(el, MZ, d); });
    el.querySelector('#mzmv-cat').addEventListener('change', (e) => { f.cat = e.target.value; paint(el, MZ, d); });
    /* Relire le serveur : les lignes des autres caisses et du tableau de bord. */
    const L = window.KiwiInventory;
    if (L && typeof L.sync === 'function') {
      Promise.resolve(L.sync()).then(() => { if (el.isConnected && el.querySelector('#mzmv-res')) paint(el, MZ, d); }).catch(() => {});
    }
  });
}
