/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · TICKETS EN ATTENTE (boutique et maison, peau 2027)
 * ---------------------------------------------------------------------------
 * Une cliente essaie encore, une autre attend à la caisse : la vendeuse met le
 * ticket de la première de côté, encaisse la seconde, puis reprend le premier.
 * Ni le stock ni le numéro ne bougent pour rien :
 *
 *  · le ticket courant est vidé SUR PLACE. Il garde son numéro, sa période et
 *    son identifiant de vente (`keep`), donc la vente suivante les reprend et
 *    aucun numéro n'est brûlé ; la reprise recopie les champs gardés de côté
 *    dans le ticket courant, vide, et garde à nouveau son numéro à lui ;
 *  · la réserve d'articles de la caisse est une projection en mémoire (« base
 *    moins le ticket ouvert », pos-boutique.js › stockAdd). Un ticket en attente
 *    ne retient donc rien : on rend sa réserve à la mise de côté (`release`),
 *    on la reprend à la reprise (`hold`). Un ticket supprimé ne touche à rien ;
 *  · la liste est un document du magasin (store_docs « opentickets ») : chaque
 *    tablette de la boutique voit les mêmes tickets. Les suppressions et les
 *    reprises laissent une pierre tombale datée, sinon la fusion par
 *    identifiant ferait revenir un ticket déjà repris ailleurs. Avant une
 *    reprise on relit le serveur : un ticket déjà repris sur une autre caisse
 *    est refusé au lieu d'être encaissé deux fois.
 *
 * Démo (cfg.demo() vrai) : liste en mémoire seulement, rien ne part.
 * Les mutations du ticket passent par `keep`, jamais par un nom de champ connu
 * ici : ce fichier ne sait rien d'un ticket boutique ou maison.
 * ═══════════════════════════════════════════════════════════════════════════ */
const GONE_DAYS = 3;
const tr0 = (s) => (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s);
const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clone = (v) => JSON.parse(JSON.stringify(v));
const newId = () => 'otk-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);

/* Union par identifiant : la version la plus récente gagne, la pierre tombale
   gagne à égalité. Les tombes de plus de GONE_DAYS jours partent. */
function mergeLists(a, b) {
  const by = new Map();
  [...(a || []), ...(b || [])].forEach((e) => {
    if (!e || !e.id) return;
    const had = by.get(e.id);
    if (!had || (+e.upd || 0) > (+had.upd || 0) || ((+e.upd || 0) === (+had.upd || 0) && e.gone && !had.gone)) by.set(e.id, e);
  });
  const old = Date.now() - GONE_DAYS * 864e5;
  return [...by.values()].filter((e) => !(e.gone && (+e.upd || 0) < old)).sort((x, y) => (+y.at || 0) - (+x.at || 0));
}

const CSS = `
.kotk{display:flex;flex-direction:column;gap:12px}
.kotk-list{display:flex;flex-direction:column;gap:10px}
.kotk-card{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px 16px;padding:14px 16px;border-radius:var(--k-r-3,14px);background:var(--k-surface-2);border:1px solid var(--k-line);text-align:start}
.kotk-info{display:flex;flex-direction:column;gap:4px;min-width:0}
.kotk-top{display:flex;align-items:baseline;gap:10px;min-width:0}
.kotk-total{font-weight:600;font-size:var(--k-fs-heading);font-variant-numeric:tabular-nums;unicode-bidi:isolate;white-space:nowrap}
.kotk-when{color:var(--k-ink-2);white-space:nowrap;unicode-bidi:isolate;font-variant-numeric:tabular-nums}
.kotk-name,.kotk-items,.kotk-by{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kotk-items,.kotk-by{color:var(--k-ink-2)}
.kotk-acts{display:flex;gap:8px}
.kotk-empty{padding:28px 8px;text-align:center;color:var(--k-ink-2)}
@media (max-width:600px){.kotk-card{grid-template-columns:minmax(0,1fr)}.kotk-acts k-button{flex:1}}
`;
function injectCss() {
  if (typeof document === 'undefined' || document.getElementById('kiwi-otk-css')) return;
  const st = document.createElement('style');
  st.id = 'kiwi-otk-css';
  st.textContent = CSS;
  document.head.appendChild(st);
}

/* cfg : scope, demo(), slug(), money(n), who(), current(), busy(), keep[],
   blank(), describe(ticket) → { name, total, count, items[] }, release(lines),
   hold(lines), after(), toast(title, body), onChange() */
function openTickets(cfg) {
  const tr = cfg.tr || tr0;
  const slug = () => { try { return String(cfg.slug() || ''); } catch (_) { return ''; } };
  const demo = () => { try { return !!cfg.demo(); } catch (_) { return true; } };
  const key = () => 'kiwi:openTickets:v1:' + slug();
  let LIST = [], loadedFor = null, cloud = null, sheet = null, armed = null;

  function load() {
    if (loadedFor === slug()) return;
    loadedFor = slug();
    LIST = [];
    if (demo() || !slug()) return;
    try { const d = JSON.parse(localStorage.getItem(key()) || 'null'); if (d && Array.isArray(d.list)) LIST = mergeLists(d.list, []); } catch (_) {}
    ensureCloud();
  }
  function save() {
    if (demo() || !slug()) return;
    try { localStorage.setItem(key(), JSON.stringify({ list: LIST })); } catch (_) {}
    if (cloud) cloud.push(0);
  }
  function ensureCloud() {
    if (cloud || demo() || !window.KiwiCloudDoc) return cloud;
    cloud = window.KiwiCloudDoc.attach({
      feature: 'opentickets', slug,
      read: () => ({ list: LIST }),
      write: (doc) => {
        LIST = mergeLists(doc && doc.list, []);
        try { localStorage.setItem(key(), JSON.stringify({ list: LIST })); } catch (_) {}
        changed();
      },
      merge: (mine, theirs) => ({ list: mergeLists(mine && mine.list, theirs && theirs.list) }),
      isEmpty: (doc) => !doc || !Array.isArray(doc.list) || !doc.list.length,
    });
    cloud.bind();
    return cloud;
  }
  /* Relire le serveur sans faire attendre la caisse plus d'une seconde et demie. */
  function fresh() {
    if (!cloud) return Promise.resolve(false);
    return Promise.race([Promise.resolve(cloud.pull(false)).catch(() => false), new Promise((r) => setTimeout(() => r(false), 1500))]);
  }
  function changed() {
    if (sheet && sheet.isConnected) paint();
    try { if (cfg.onChange) cfg.onChange(); } catch (_) {}
  }
  const live = () => { load(); return LIST.filter((e) => !e.gone && e.scope === cfg.scope); };
  const tomb = (e) => Object.assign(e, { gone: 1, upd: Math.max(Date.now(), (+e.upd || 0) + 1), ticket: null, items: [] });

  function park(opts) {
    load();
    const cur = cfg.current();
    if (!cur || !Array.isArray(cur.lines) || !cur.lines.length) return false;
    if (cfg.busy && cfg.busy()) { cfg.toast(tr('Terminez l’opération en cours avant de mettre en attente')); return false; }
    const d = cfg.describe(cur) || {};
    const keep = new Set(cfg.keep || []);
    const snap = {};
    Object.keys(cur).forEach((k) => { if (!keep.has(k)) { snap[k] = cur[k]; delete cur[k]; } });
    Object.assign(cur, cfg.blank());
    const stored = clone(snap);
    if (stored.reward) delete stored.reward.reservation;   /* une réservation de récompense se refait à l'encaissement */
    const now = Date.now();
    LIST = mergeLists([{ id: newId(), scope: cfg.scope, at: now, upd: now, by: cfg.who() || '', name: d.name || '', total: +d.total || 0, count: +d.count || 0, items: [...new Set((d.items || []).filter(Boolean))].slice(0, 4), ticket: stored }], LIST);
    save();
    try { cfg.release(snap.lines || []); } catch (_) {}
    cfg.after();
    if (!(opts && opts.quiet)) cfg.toast(tr('Ticket mis en attente'), d.name || '');
    changed();
    return true;
  }

  function resume(id) {
    load();
    if (cfg.busy && cfg.busy()) { cfg.toast(tr('Terminez l’opération en cours avant de mettre en attente')); return Promise.resolve(false); }
    return fresh().then(() => {
      const e = LIST.find((x) => x.id === id);
      if (!e || e.gone || !e.ticket) { cfg.toast(tr('Ce ticket a déjà été repris sur une autre caisse')); paint(); return false; }
      const before = cfg.current();
      const parkedNow = before && before.lines && before.lines.length ? park({ quiet: true }) : false;
      const now = cfg.current();
      if (!now || (now.lines && now.lines.length)) return false;
      const snap = clone(e.ticket);
      tomb(e);
      save();
      const keep = new Set(cfg.keep || []);
      keep.forEach((k) => { delete snap[k]; });
      Object.assign(now, cfg.blank(), snap);
      try { cfg.hold(now.lines || []); } catch (_) {}
      cfg.after();
      close();
      cfg.toast(tr('Ticket repris'), parkedNow ? tr('Le ticket en cours a été mis en attente') : (e.name || ''));
      changed();
      return true;
    });
  }

  function remove(id) {
    const e = LIST.find((x) => x.id === id);
    if (!e || e.gone) return;
    tomb(e);
    save();
    cfg.toast(tr('Ticket en attente supprimé'));
    changed();
  }

  function when(at) {
    const d = new Date(+at || 0), now = new Date();
    const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return d.toDateString() === now.toDateString() ? hm : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) + ' · ' + hm;
  }
  function cardHtml(e) {
    const items = (e.count === 1 ? '1 ' + tr('article') : e.count + ' ' + tr('articles')) + (e.items && e.items.length ? ' · ' + e.items.join(', ') : '');
    const del = armed === e.id;
    return '<article class="kotk-card" data-otk-id="' + escHtml(e.id) + '"><div class="kotk-info">'
      + '<div class="kotk-top"><span class="kotk-total">' + escHtml(cfg.money(e.total)) + '</span><span class="kotk-when k-foot">' + escHtml(when(e.at)) + '</span></div>'
      + '<div class="kotk-name k-body-s">' + escHtml(e.name || tr('Sans cliente')) + '</div>'
      + '<div class="kotk-items k-foot">' + escHtml(items) + '</div>'
      + (e.by ? '<div class="kotk-by k-foot">' + escHtml(tr('Mis en attente par {n}').replace('{n}', e.by)) + '</div>' : '')
      + '</div><div class="kotk-acts"><k-button variant="primary" data-otk="open" label="' + escHtml(tr('Reprendre')) + '"></k-button>'
      + '<k-button variant="tonal-danger" data-otk="del" label="' + escHtml(del ? tr('Confirmer') : tr('Supprimer')) + '"></k-button></div>'
      + '</article>';
  }
  function paint() {
    if (!sheet) return;
    const list = live();
    sheet.setAttribute('heading', tr('Tickets en attente') + (list.length ? ' · ' + list.length : ''));
    const body = sheet.querySelector('.kotk');
    if (body) body.innerHTML = list.length ? '<div class="kotk-list">' + list.map(cardHtml).join('') + '</div>' : '<p class="kotk-empty k-body">' + escHtml(tr('Aucun ticket en attente')) + '</p>';
  }
  function close() {
    if (!sheet) return;
    const s = sheet;
    sheet = null; armed = null;
    s.removeAttribute('open');
    setTimeout(() => s.remove(), 400);
  }
  function openSheet() {
    load();
    if (!customElements.get('k-sheet')) return false;
    injectCss();
    if (sheet) close();
    const s = document.createElement('k-sheet');
    s.className = 'kotk-sheet';
    s.innerHTML = '<div class="kotk"></div>';
    document.body.appendChild(s);
    sheet = s;
    paint();
    s.addEventListener('kiwi:action', (ev) => {
      const d = ev.detail || {};
      if (d.action === 'k.sheet.close') { close(); return; }
      if (d.action !== 'k.button.press') return;
      const btn = ev.target && ev.target.closest ? ev.target.closest('[data-otk]') : null;
      const card = btn && btn.closest('[data-otk-id]');
      if (!card) return;
      const id = card.getAttribute('data-otk-id');
      if (btn.getAttribute('data-otk') === 'open') { resume(id); return; }
      if (armed === id) { armed = null; remove(id); return; }
      armed = id; paint();
      setTimeout(() => { if (armed === id) { armed = null; paint(); } }, 4000);
    });
    s.setAttribute('open', '');
    fresh().then(() => { if (sheet === s) paint(); });
    return true;
  }

  /* Le bouton du pied : « Mettre en attente » sur un ticket plein, la liste sur
     un ticket vide (comme les caisses de mode : un seul bouton, son état dit
     ce qu'il fait). */
  function button(cur) {
    const full = !!(cur && cur.lines && cur.lines.length);
    const n = live().length;
    if (full) return { label: tr('Mettre en attente'), disabled: false, run: () => park() };
    return { label: n ? tr('Tickets en attente') + ' · ' + n : tr('Aucun ticket en attente'), disabled: !n, run: openSheet };
  }

  return { park, resume, remove, list: live, open: openSheet, close, button };
}

export { openTickets, mergeLists };
