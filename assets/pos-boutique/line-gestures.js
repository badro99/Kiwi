/* Caisse boutique · les gestes sur une ligne du ticket (owner, 28 nov. 2026,
   tablette, ligne « Hoodie black ») :
     · glisser la ligne vers la gauche (depuis la droite ; vers la droite en
       arabe) la DUPLIQUE : une pièce de plus, sur sa propre ligne, juste en
       dessous, pour en changer la taille ou la couleur ;
     · toucher la ligne rouvre la fiche de l'article, réglée comme la ligne
       (taille, couleur, quantité, remise) ; « Mettre à jour » la remplace.
   Le ticket ne change que par ticketOwner (tools/boutique-ticket-owner-test) ;
   le stock se vérifie comme à l'ajout (oversell.js : un second appui vend).
   Rien ici ne touche une ligne « sans étiquette » (odd-box.js), une ligne
   d'échange ou un ticket en cours d'encaissement. */
import { isOddPid } from './odd-box.js?v=5';

const ARM = 72;     // px : au-delà, lâcher duplique
const MAX = 132;    // px : la ligne ne glisse pas plus loin

let cssDone = false;
function css() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style');
  s.id = 'bq-line-gestures-css';
  s.textContent = `
#bq-tk-lines { overflow-x: hidden; }
#bq-tk-lines .bq-line[data-bq-line] { position: relative; touch-action: pan-y; cursor: pointer; user-select: none; -webkit-user-select: none; -webkit-touch-callout: none; }
#bq-tk-lines .bq-line.is-swiping { transition: none; z-index: 1; }
#bq-tk-lines .bq-line.is-settling { transition: transform 220ms cubic-bezier(0.34, 1.45, 0.5, 1); }
#bq-tk-lines .bq-line.is-swiping::after { content: attr(data-bq-dup); position: absolute; top: 0; bottom: 0; inset-inline-start: 100%;
  margin-inline-start: 8px; width: ${MAX - 12}px; display: grid; place-items: center; border-radius: 12px; font: 600 13px var(--sans, system-ui);
  background: color-mix(in srgb, var(--atlas, #0B6E4F) 12%, transparent); color: var(--atlas, #0B6E4F); transition: background 120ms, color 120ms; }
#bq-tk-lines .bq-line.is-armed::after { background: var(--atlas, #0B6E4F); color: var(--paper, #F7F5F0); }`;
  document.head.appendChild(s);
}

/* d : { state, product(pid), ticketOwner, stockAdd, availableStock, firstFreeFor,
         oversellOk, colorLabel, openSheet, render, toast, tr } */
export function lineGestures(d) {
  const lines = () => (d.state.ticket && d.state.ticket.lines) || [];
  const busy = () => !!(d.state.exchange || d.state.ret || d.state.checkoutBusy);
  const usable = (ln) => !!(ln && !isOddPid(ln.pid) && d.product(ln.pid));
  /* Le ticket sans la ligne i : ce qu'il reste en stock pour la remplacer. */
  const without = (i) => ({ lines: lines().filter((_, j) => j !== i) });
  const label = (p, color, size) => `${p.name} · ${d.colorLabel(color)} · ${size}`;

  function duplicate(i) {
    const t = d.state.ticket, ln = lines()[i];
    if (busy() || !usable(ln)) return false;
    const p = d.product(ln.pid);
    /* Même taille si elle reste ; sinon la première taille libre de la même
       couleur ; sinon la même taille, derrière le second appui habituel. */
    let size = ln.size;
    if (d.availableStock(ln.pid, size, ln.color, t) < 1) size = d.firstFreeFor(p, ln.color, t) || ln.size;
    if (d.availableStock(ln.pid, size, ln.color, t) < 1
      && !d.oversellOk(`${ln.pid}|${ln.color}|${size}`, label(p, ln.color, size), 0, d.toast)) return false;
    const copy = JSON.parse(JSON.stringify(ln));
    copy.qty = 1; copy.size = size;
    if (copy.agreedFrom === 'ticket') { delete copy.agreed; delete copy.agreedFrom; copy.remise = 0; }   // le prix réparti valait pour CES pièces
    d.stockAdd(ln.pid, size, -1);
    d.ticketOwner.insertLine(t, i + 1, copy);
    d.render();
    d.toast(`${p.name} · ${size}, ${d.tr('ligne dupliquée')}`);
    return true;
  }

  /* Ce que la fiche reprend de la ligne touchée. */
  function sheetFrom(i) {
    const ln = lines()[i];
    if (!ln) return {};
    const agreed = ln.agreed > 0 ? +ln.agreed : 0;
    return { qty: Math.max(1, +ln.qty || 1), remise: agreed ? 0 : (+ln.remise || 0), agreed,
      bmode: agreed ? 'price' : 'pct', btext: agreed ? String(agreed) : '', bok: true, under: false, edit: i,
      tk: without(i) };   // les tailles se comptent sans les pièces de CETTE ligne
  }

  /* « Mettre à jour » : la ligne i devient cfg ; le stock de l'ancienne revient,
     celui de la nouvelle sort. Faux quand le stock refuse (premier appui). */
  function replace(i, cfg) {
    const t = d.state.ticket, ln = lines()[i];
    if (!usable(ln)) return false;
    const p = d.product(ln.pid);
    const have = d.availableStock(ln.pid, cfg.size, cfg.color, without(i));
    if (have < cfg.qty && !d.oversellOk(`${ln.pid}|${cfg.color}|${cfg.size}`, label(p, cfg.color, cfg.size), have, d.toast)) return false;
    const next = JSON.parse(JSON.stringify(ln));
    Object.assign(next, { size: cfg.size, color: cfg.color, qty: cfg.qty, remise: cfg.agreed > 0 ? 0 : (cfg.remise || 0) });
    /* Un prix réparti sur le ticket (« Kolchi b 500 », agreedFrom 'ticket')
       valait pour CES pièces, accordées une fois : il reste sur au plus autant
       de pièces, la pièce en plus part à son prix sur sa propre ligne, comme
       le « + » de la ligne (ticketOwner.changeQuantity). Revue de sécurité,
       28 nov. 2026 : sans ce partage, monter la quantité dans la fiche
       étendait le prix accordé sans nouvel accord. */
    const spread = ln.agreedFrom === 'ticket' && cfg.agreed > 0 && Math.abs(cfg.agreed - (+ln.agreed || 0)) < 0.005;
    const extra = spread ? Math.max(0, cfg.qty - (+ln.qty || 0)) : 0;
    if (spread) { next.qty = cfg.qty - extra; next.agreed = ln.agreed; next.agreedFrom = 'ticket'; }
    else { delete next.agreedFrom; if (cfg.agreed > 0) next.agreed = cfg.agreed; else delete next.agreed; }
    d.stockAdd(ln.pid, ln.size, +ln.qty || 0);
    d.stockAdd(ln.pid, cfg.size, -cfg.qty);
    d.ticketOwner.replaceLine(t, i, next);
    if (extra) {
      const more = JSON.parse(JSON.stringify(next));
      delete more.agreed; delete more.agreedFrom;
      more.qty = extra; more.remise = 0;
      d.ticketOwner.insertLine(t, i + 1, more);
    }
    d.render();
    d.toast(`${p.name} · ${cfg.size}, ${d.tr('ligne mise à jour')}`);
    return true;
  }

  /* Un toucher sur la ligne, hors de ses boutons (± et Remise ont leur
     gestionnaire avant celui-ci) : la fiche, réglée comme la ligne. */
  function tap(e) {
    const row = e.target.closest && e.target.closest('[data-bq-line]');
    if (!row || busy() || e.target.closest('button')) return false;
    const i = +row.dataset.bqLine, ln = lines()[i];
    if (!usable(ln)) return false;
    d.openSheet(ln.pid, { size: ln.size, color: ln.color, edit: i });
    return true;
  }

  /* Le glissé : la ligne suit le doigt vers le bord de tête, « Dupliquer »
     apparaît derrière elle et se remplit au-delà du seuil. Le clic qui suit un
     glissé est avalé : il rouvrirait la fiche. */
  function bind(root) {
    if (!root || root.__bqLineGestures) return;
    root.__bqLineGestures = true;
    css();
    let s = null, swallow = 0;
    const settle = (row) => {
      row.classList.remove('is-swiping', 'is-armed');
      row.classList.add('is-settling');
      row.style.transform = '';
      setTimeout(() => row.classList.remove('is-settling'), 260);
    };
    root.addEventListener('pointerdown', (e) => {
      const row = e.target.closest && e.target.closest('#bq-tk-lines [data-bq-line]');
      if (!row || (e.button || 0) > 0 || busy()) return;
      s = { row, id: e.pointerId, x: e.clientX, y: e.clientY, pull: 0, on: false,
        rtl: getComputedStyle(row).direction === 'rtl' };
    });
    root.addEventListener('pointermove', (e) => {
      if (!s || e.pointerId !== s.id) return;
      const dx = e.clientX - s.x, dy = e.clientY - s.y;
      if (!s.on) {
        if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { s = null; return; }   // on fait défiler la liste
        if (Math.abs(dx) < 10) return;
        s.on = true;
        s.row.setAttribute('data-bq-dup', d.tr('Dupliquer'));
        s.row.style.animation = 'none';   // bq-card-in (fill-mode both) tiendrait le transform ; la ligne est redessinée au rendu suivant
        s.row.classList.add('is-swiping');
        try { s.row.setPointerCapture(e.pointerId); } catch (_) { /* déjà relâché */ }
      }
      s.pull = Math.max(0, Math.min(s.rtl ? dx : -dx, MAX));
      s.row.style.transform = `translateX(${s.rtl ? s.pull : -s.pull}px)`;
      s.row.classList.toggle('is-armed', s.pull >= ARM);
    });
    const end = (e) => {
      if (!s || e.pointerId !== s.id) return;
      const st = s; s = null;
      if (!st.on) return;
      swallow = Date.now();
      settle(st.row);
      if (e.type === 'pointerup' && st.pull >= ARM) duplicate(+st.row.dataset.bqLine);
    };
    root.addEventListener('pointerup', end);
    root.addEventListener('pointercancel', end);
    root.addEventListener('click', (e) => {
      if (Date.now() - swallow < 400 && e.target.closest && e.target.closest('#bq-tk-lines')) { e.stopPropagation(); e.preventDefault(); }
    }, true);
  }

  return { bind, tap, duplicate, replace, sheetFrom };
}
