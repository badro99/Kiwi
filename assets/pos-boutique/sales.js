import { CLIENTES, CL, RAYONS, state, root, stockOf, promoFor, findSale, P, toast, ticketTotals, ticketCount, STAFF, bqKitSkin, assignTicketNumber, prepareTicketNumber, releaseTicketNumber, stockAdd, freshTicket, renderBadges, checkout, availableStock, lineUnit, linePromo, firstFreeFor, ticketClient, sizesOf, openVeil, sizeWord, _bqKey, closeVeil, pvReal, initials, activeAvoirs, queueIfOffline, whenLabel, SALES, switchView, firstName, firstFree, variantStock, BY_EAN } from '../pos-boutique.js?v=221';
import { bqReal, openExchSummary, openVoucher, openScannerTest, normScan } from './checkout.js?v=122';
import { offerRegister } from './inventory.js?v=122';
import { ticketOwner } from './ticket-owner.js?v=3';
import { ticketRemise } from './ticket-remise.js?v=3';
import { bqKitTicketFoot } from './kit-2027.js?v=20';
import { sellSearch } from './search.js?v=14';
import '../money-cents.js?v=4';
import { photoImg } from '../retail-photos.js?v=4';


  /* ───────────────────────── helpers ───────────────────────── */
  const tr = (s) => (globalThis.window?.KiwiCaisseLang || { tr: (x) => x }).tr(s);
  const $  = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmtMAD = (n) => globalThis.KiwiMoney.format(n) + ' MAD';
  /* Décision propriétaire, 2026-10-26 : préserver le prix catalogue au centime.
     Les remises descendent au centime, jamais au-dessus du prix configuré.
     Le petit epsilon absorbe les erreurs binaires, jamais un vrai centime. */
  const shelf = (n) => Math.max(0, Math.floor((+n || 0) * 100 + 1e-6) / 100);
  const icons  = () => { if (window.lucide) try { window.lucide.createIcons(); } catch (e) {} };
  const lens   = () => { if (window.KiwiLens) try { window.KiwiLens.rescan(); } catch (e) {} };
  const DAYS   = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
  const MONTHS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
  const pad2   = (n) => String(n).padStart(2, '0');
  const fmtDT  = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} · ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const fmtDay = (d) => `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
  /* Un avoir vit six mois : son échéance tombe presque toujours l'année suivante.
     Sans millésime, « sam. 14 févr. » sur un bon papier ne dit pas si c'est celui
     de cette année ou du suivant — et c'est le seul chiffre qui décide si la
     cliente est remboursée ou renvoyée. Les dates d'avoir portent l'année. */
  const fmtDayY = (d) => `${fmtDay(d)} ${d.getFullYear()}`;
  /* Dernière journée commerciale où un avoir reste utilisable. Le serveur le fait
     expirer à la bascule (05:00 par défaut) qui CLÔT cette journée : la date civile
     de cet instant serait le lendemain. On lit donc la journée commerciale de
     l'instant qui le précède, avec la bascule et le fuseau du magasin
     (KiwiDayReport), comme le tableau de bord. */
  const creditLastDay = (until) => {
    const t = +new Date(until);
    let day = '';
    try { if (window.KiwiDayReport && window.KiwiDayReport.businessDay) day = String(window.KiwiDayReport.businessDay(t - 1)); } catch (_) {}
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
    return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : new Date(t - 5 * 3600000 - 1);
  };
  const fmtValidUntil = (until) => fmtDayY(creditLastDay(until));
  const fmtHM  = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const MIN = 60 * 1000;

  /* Deterministic pseudo-barcode (Code-39 lookalike) from any id. */
  function barcode(seed, h) {
    h = h || 30;
    let bars = '', x = 0, s = 7;
    const len = Math.max(seed.length * 4, 26);
    for (let i = 0; i < len; i++) {
      s = (s * 31 + seed.charCodeAt(i % seed.length) + i * 11) % 97;
      const w = 1 + (s % 3);
      bars += `<rect x="${x}" y="0" width="${w}" height="${h}"></rect>`;
      x += w + 1 + ((s >> 3) % 2);
    }
    return `<svg viewBox="0 0 ${x} ${h}" preserveAspectRatio="none" style="height:${h}px" fill="currentColor" aria-hidden="true">${bars}</svg>`;
  }

  /* Product-icon "database" for the create/edit picker — ordered + labelled.
     artOf() takes a product (its name can pick the photo) or an icon key and
     always renders a photo, the hanger when nothing matches (retail-photos.js). */
  const artOf = (p, colour) => (p && typeof p === 'object' && p.photo
    ? `<img class="bq-product-photo" src="${esc(p.photo)}" alt="" loading="lazy" decoding="async">`
    : photoImg(p, 'bq-art-photo', 'cintre', colour));
  const ICON_LABELS = {
    tshirt: 'T-shirt / Haut', chemise: 'Chemise', debardeur: 'Débardeur', pull: 'Pull', sweat: 'Sweat / Hoodie',
    pantalon: 'Pantalon', jean: 'Jean', polo: 'Polo', manteau: 'Manteau',
    trench: 'Trench', cape: 'Cape', doudoune: 'Doudoune', gilet_doudoune: 'Gilet doudoune', costume: 'Costume / Tailleur',
    ensemble: 'Ensemble', ensemble_jean: 'Ensemble jean', survetement: 'Survêtement', short: 'Short', jupe: 'Jupe', robe: 'Robe', combinaison: 'Combinaison',
    veste: 'Veste', chaussures: 'Chaussures', basket: 'Basket', botte: 'Bottes', sandale: 'Sandales',
    chapeau: 'Chapeau', casquette: 'Casquette', bonnet: 'Bonnet', ceinture: 'Ceinture', cravate: 'Cravate',
    echarpe: 'Écharpe', gants: 'Gants', chaussettes: 'Chaussettes', lunettes: 'Lunettes', montre: 'Montre',
    bracelet: 'Bracelet', bague: 'Bague', collier: 'Collier', boucles: 'Boucles d’oreille', broche: 'Broche / Bijou',
    parfum: 'Parfum', sac_main: 'Sac à main', sac: 'Sac', sac_dos: 'Sac à dos', cabas: 'Cabas',
    pochette: 'Pochette', portefeuille: 'Portefeuille', valise: 'Valise', parapluie: 'Parapluie', tag: 'Étiquette',
    cintre: 'Cintre', caftan: 'Caftan', takchita: 'Takchita', djellaba: 'Djellaba', gandoura: 'Gandoura',
    jabador: 'Jabador', selham: 'Selham', tarbouche: 'Tarbouche', foulard: 'Foulard', chale: 'Châle',
    mdamma: 'Mdamma', babouche: 'Babouche',
  };
  const ICON_KEYS = [
    // Hauts
    'tshirt', 'polo', 'chemise', 'debardeur', 'pull', 'sweat',
    // Bas
    'pantalon', 'jean', 'short', 'jupe',
    // Pièces entières
    'robe', 'combinaison', 'ensemble', 'ensemble_jean', 'survetement', 'costume',
    // Vestes & manteaux
    'veste', 'manteau', 'trench', 'cape', 'doudoune', 'gilet_doudoune',
    // Traditionnel marocain
    'caftan', 'takchita', 'djellaba', 'gandoura', 'jabador', 'selham',
    // Chaussures
    'chaussures', 'basket', 'botte', 'sandale', 'babouche',
    // Couvre-chef
    'chapeau', 'casquette', 'bonnet', 'tarbouche',
    // Accessoires & bijoux
    'ceinture', 'cravate', 'echarpe', 'foulard', 'chale', 'gants', 'chaussettes',
    'lunettes', 'montre', 'bracelet', 'bague', 'collier', 'boucles', 'broche', 'mdamma', 'parfum',
    // Sacs & maroquinerie
    'sac_main', 'sac', 'sac_dos', 'cabas', 'pochette', 'portefeuille', 'valise',
    // Divers
    'parapluie', 'tag', 'cintre',
  ];
  function iconPickerHtml(sel) {
    return `<div class="bqi-iconpick">${ICON_KEYS.map((k) => `<button type="button" class="bqi-icon${k === sel ? ' on' : ''}" data-icon-key="${k}" title="${esc(ICON_LABELS[k] || k)}">${artOf(k)}</button>`).join('')}</div>`;
  }
  function wireIconPicker(el, onPick) {
    el.querySelectorAll('.bqi-icon').forEach((b) => b.addEventListener('click', () => {
      el.querySelectorAll('.bqi-icon').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      if (onPick) onPick(b.getAttribute('data-icon-key'));
    }));
  }

  /* ───────────────────────── couleurs ─────────────────────────
     Aucune palette n'est définie ici. Ce module lisait autrefois sa propre liste
     de treize nuances, copiée à l'identique dans boutique-catalog.js : deux
     copies d'une même vérité finissent toujours par diverger. Le vocabulaire
     vit dans assets/color-palette.js (window.KiwiColors) — des FAMILLES
     générales, choisies à la pastille, jamais à la nuance. `colorOf()` accepte
     n'importe quelle valeur historique ou importée et rend toujours une famille
     affichable : une variante ne peut pas devenir grise faute de correspondance. */
  const KC = () => window.KiwiColors || null;
  const KC_MISS = { id: 'gris', label: 'Gris', hex: '#9AA0A6' };
  function colorOf(id) { const k = KC(); return (k && (k.display ? k.display(id) : k.normalize(id))) || KC_MISS; }
  // Une couleur personnalisée sans nom se lit par sa famille (« Bleu
  // personnalisé »), jamais par son code hexadécimal.
  /* La couleur neutre des produits créés taille par taille (boutique-sizes.js) :
     un produit = une couleur, déjà dans son nom. Elle ne s'écrit ni ne se
     dessine nulle part, sinon le ticket dirait « M Gris » d'un hoodie blanc. */
  const NO_COLOR = 'unique';
  function colorLabel(id) { if (String(id) === NO_COLOR) return ''; const c = colorOf(id); const k = KC(); return (c.custom && k && k.nameOf) ? k.nameOf(c) : c.label; }
  function colorHex(id) { return colorOf(id).hex; }
  // Une pastille non cliquable (ligne de ticket, retour, tableau) — même dessin
  // que dans le tableau de bord, nom porté par title/aria plutôt qu'écrit.
  function colorDot(id, size) {
    if (String(id) === NO_COLOR) return '';
    const k = KC();
    if (k) return k.swatch(id, { size: size || 'sm' });
    return `<i class="kc-sw kc-sm" style="background-color:${KC_MISS.hex}" title="${KC_MISS.label}"></i>`;
  }
  function variantColor(v) {
    const k = KC();
    return (k && k.display ? k.display(v.colorId, v.colorLabel, v.colorHex) : colorOf(v.colorFamily || v.colorId));
  }
  function variantSource(v) {
    if (!v || !v.colorSource) return '';
    const shown = variantColor(v);
    return String(v.colorSource).trim().toLowerCase() === String(shown.label || '').trim().toLowerCase()
      ? '' : v.colorSource;
  }

  function productVisual(p) {
    if (p && p.photo) return `<img class="bq-product-photo" src="${esc(p.photo)}" alt="${esc(p.name || 'Produit')}" loading="lazy" />`;
    return artOf(p);
  }

  /* ── clients: real store = the shared KiwiClients book (assets/clients-store.js) ──
     A REAL/paired boutique reads its picker, ticket and « Nouvelle cliente » from
     KiwiClients — so it shows its OWN clients (empty until captured on the till) and
     any client added in the dashboard « Clients » appears here too. The pitch demo
     (unpaired PIN 0002) keeps the rich hard-coded CLIENTES above. */
  function isDemoStore() { try { return !bqReal(); } catch (_) { return true; } }   // pitch demo = local, unpaired, not signed-in
  function useKiwiCl() { return !isDemoStore() && !!window.KiwiClients; }
  function fromKiwi(c) {
    if (!c) return null;
    return { id: c.id, name: c.name || 'Sans nom', phone: c.phone || '', points: c.points || 0,
      taille: '', achats: c.visits || 0, spent: c.spend || 0,
      vip: !!(window.KiwiClients && KiwiClients.segment(c) === 'vip'), prefs: c.notes ? [c.notes] : [],
      history: Array.isArray(c.history) ? c.history.slice(0, 50) : [] };
  }
  // A REAL store shows ONLY its own KiwiClients book (empty until captured) — NEVER
  // the demo CLIENTES. The pitch demo keeps the rich hard-coded set.
  function clientList() {
    if (isDemoStore()) return CLIENTES;
    return window.KiwiClients ? window.KiwiClients.list().map(fromKiwi) : [];
  }
  function clById(id) {
    if (!id || id === 'passage') return null;
    if (isDemoStore()) return CL[id] || null;
    const c = window.KiwiClients && window.KiwiClients.get(id);
    return c ? fromKiwi(c) : null;
  }
  /* Fidélité — la récompense de CE client, lue sur le programme réel du magasin
     (KiwiClients.config). « Prête » = la carte est pleine / le seuil de points est
     atteint. Le type se déduit du modèle : amount → une remise en % sur le ticket
     (boutique « −10 % ») ; visit/product → un article offert (carte à tampons).
     Renvoie null pour la démo (pas de KiwiClients) et pour la cliente de passage. */
  function clReward(id) {
    if (isDemoStore() || !window.KiwiClients || !id || id === 'passage') return null;
    const raw = window.KiwiClients.get(id);
    if (!raw) return null;
    const cfg = (window.KiwiClients.config && window.KiwiClients.config()) || {};
    const ready = window.KiwiClients.progress ? window.KiwiClients.progress(raw, cfg) >= 1 : false;
    let kind = 'percent', value = 10, label = '−10 %';
    if (cfg.model === 'amount') {
      const txt = (cfg.amount && cfg.amount.reward) || '−10 %';
      const m = String(txt).match(/(\d+)\s*%/);
      kind = 'percent'; value = m ? +m[1] : 10; label = txt;
    } else {
      const txt = (cfg.model === 'product' ? (cfg.product && cfg.product.reward) : (cfg.visit && cfg.visit.reward)) || '1 offert';
      kind = 'free'; label = txt;
    }
    return { ready: ready, kind: kind, value: value, label: label };
  }

  /* ═══════════════════════ VENTE — grille par rayon ═══════════════════════ */
  function renderCats() {
    const all = RAYONS.reduce((s, r) => s + r.items.length, 0);
    /* « C'est en promo ? » est LA question du comptoir un jour de soldes, et
       jusqu'ici la caissière n'avait aucun moyen d'y répondre autrement qu'en
       parcourant la grille à l'œil. Le filtre n'apparaît que s'il a quelque
       chose à montrer : un onglet vide en permanence est du bruit. */
    const promoN = promoedIds().size;
    /* La dernière promotion vient de s'arrêter pendant qu'on regardait ce
       filtre : sans ce repli, l'onglet disparaît et la grille reste vide sans
       qu'aucun bouton ne soit sélectionné — la caisse a l'air cassée. */
    if (state.rayon === '_promo' && !promoN) state.rayon = 'tous';
    $('#bq-cats', root).innerHTML =
      `<button class="bq-cat ${state.rayon === 'tous' ? 'on' : ''}" data-bq-cat="tous">Tous <span class="bq-cat-ct">${all}</span></button>` +
      (promoN ? `<button class="bq-cat is-promo ${state.rayon === '_promo' ? 'on' : ''}" data-bq-cat="_promo">En promo <span class="bq-cat-ct">${promoN}</span></button>` : '') +
      RAYONS.map((r) =>
        `<button class="bq-cat ${state.rayon === r.id ? 'on' : ''}" data-bq-cat="${r.id}">${esc(r.label)} <span class="bq-cat-ct">${r.items.length}</span></button>`
      ).join('');
    $('#bq-cats', root).onclick = (e) => {
      const b = e.target.closest('[data-bq-cat]');
      if (!b) return;
      state.rayon = b.dataset.bqCat;
      renderCats(); renderGrid(); icons();
    };
  }

  function cardFlag(p) {
    const st = stockOf(p);
    if (st === 0) return '<span class="bq-card-flag out">épuisé</span>';
    if (st <= 2) return '<span class="bq-card-flag low">stock bas</span>';
    if (p.flag) return `<span class="bq-card-flag">${esc(p.flag)}</span>`;
    return '';
  }

  /* Les articles qui portent une étiquette promo en ce moment. Un Set : deux
     promotions sur le même caftan ne le comptent pas deux fois. */
  function promoedIds() {
    const out = new Set();
    if (!window.KiwiPromos) return out;
    RAYONS.forEach((r) => r.items.forEach((it) => { if (promoFor(it.id)) out.add(it.id); }));
    return out;
  }

  function renderGrid() {
    let rayons;
    if (state.rayon === '_promo') {
      const ids = promoedIds();
      rayons = RAYONS.map((r) => ({ ...r, items: r.items.filter((it) => ids.has(it.id)) })).filter((r) => r.items.length);
    } else {
      rayons = state.rayon === 'tous' ? RAYONS : RAYONS.filter((r) => r.id === state.rayon);
    }
    let i = 0;
    $('#bq-gridwrap', root).innerHTML = rayons.map((r) => `
      <div class="bq-cat-head">${esc(r.label)}</div>
      <div class="bq-grid">${r.items.map((p) => {
        /* Le prix promo se lit SUR LA CARTE, pas seulement au ticket. Une
           caissière qui doit ouvrir la fiche pour savoir si l'article est en
           promotion ne répondra pas à « c'est combien ? » sans regarder son
           écran — et l'affiche en vitrine, elle, est déjà lue par la cliente. */
        const pr = promoFor(p.id);
        return `
        <button class="bq-card ${stockOf(p) === 0 ? 'is-out' : ''}${pr ? ' is-promo' : ''}" data-bq-item="${p.id}" style="--i:${i++}">
          <span class="bq-card-art">${productVisual(p)}</span>
          <span class="bq-card-name">${esc(p.name)}</span>
          <span class="bq-card-price">${pr ? `<s>${fmtMAD(pr.was)}</s> ` : ''}${fmtMAD(pr ? pr.price : shelf(p.price))}</span>
          ${cardFlag(p)}
          ${pr ? `<span class="bq-card-promo" title="${esc(pr.promo.name)}">${esc(pr.badge)}</span>` : ''}
        </button>`; }).join('')}
      </div>`).join('');
    $('#bq-gridwrap', root).onclick = (e) => {
      const b = e.target.closest('[data-bq-item]');
      if (b) openSheet(b.dataset.bqItem, state.exchange ? { exchange: true } : null);
    };
  }

  function renderExchNote() {
    const slot = $('#bq-exch-slot', root);
    if (!state.exchange) { slot.innerHTML = ''; return; }
    const sale = findSale(state.exchange.saleId);
    const ln = sale.lines[state.exchange.idx];
    slot.innerHTML = `
      <div class="bq-exch-note">
        <i data-lucide="arrow-left-right"></i>
        <span class="l">Échange <b>${sale.id}</b>, retour <b>${esc((P[ln.pid] && P[ln.pid].name) || ln.name || 'Article')} · ${esc(ln.size)}</b> (${fmtMAD(ln.unit)}).
        Touchez l'article de remplacement dans la grille.</span>
        <button class="bq-exch-cancel" id="bq-exch-cancel">Annuler l'échange</button>
      </div>`;
    $('#bq-exch-cancel', slot).onclick = () => {
      state.exchange = null;
      renderExchNote();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Échange annulé, rien n\'a bougé'));
      icons();
    };
    icons();
  }

  /* ═══════════════════════ TICKET ═══════════════════════ */
  function clientRow(t) {
    if (!t.client) {
      return `<button class="bq-tk-row" id="bq-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une cliente</b><span>Téléphone d'abord, points et taille suivent</span></span>
        <span class="edit">Chercher</span></button>`;
    }
    if (t.client === 'passage') {
      return `<button class="bq-tk-row is-set" id="bq-tk-client"><i data-lucide="user"></i>
        <span class="l"><b>Cliente de passage</b><span>Sans fiche, retrouvable par n° de ticket</span></span>
        <span class="edit">Changer</span></button>`;
    }
    const c = clById(t.client);
    if (!c) return `<button class="bq-tk-row" id="bq-tk-client"><i data-lucide="user-plus"></i>
        <span class="l"><b>Attacher une cliente</b><span>Téléphone d'abord, points et taille suivent</span></span>
        <span class="edit">Chercher</span></button>`;
    const sub = [esc(c.phone) || '·', c.points + ' pts', c.taille ? 'taille ' + esc(c.taille) : ''].filter(Boolean).join(' · ');
    /* #105 · l'avoir de la cliente reste sous les yeux tant qu'elle est sur le
       ticket, pas seulement dans un toast qui s'efface au bout de deux secondes. */
    const av = clAvoirTotal(c);
    return `<button class="bq-tk-row is-set" id="bq-tk-client"><i data-lucide="user-check"></i>
      <span class="l"><b>${esc(c.name)}</b><span>${sub}</span>${av ? `<span class="bq-tk-av" data-bq-tk-av>Avoir ${fmtMAD(av.balance)}</span>` : ''}</span>
      ${c.vip ? '<span class="bq-vip-chip">VIP</span>' : ''}
      <span class="edit">Changer</span></button>`;
  }

  /* La récompense fidélité au moment d'encaisser : quand la cliente attachée a
     assez de points / une carte pleine, une pastille « Utiliser » apparaît sous
     sa fiche. Un geste : la remise s'applique au ticket, les points ne sont
     débités qu'au paiement (redeem dans onPaid) — annulable tant qu'on n'a pas
     encaissé. Rien en démo ni pour la cliente de passage. */
  function rewardRow(t) {
    if (!t.client || t.client === 'passage') return '';
    if (t.reward && t.reward.clientId === t.client) {
      return `<button class="bq-reward-row is-on" id="bq-reward-toggle"><i data-lucide="gift"></i>
        <span class="l"><b>Récompense appliquée · ${esc(t.reward.label)}</b><span>Points débités à l'encaissement</span></span>
        <span class="edit">Annuler</span></button>`;
    }
    const rw = clReward(t.client);
    if (rw && rw.ready) {
      return `<button class="bq-reward-row" id="bq-reward-toggle"><i data-lucide="gift"></i>
        <span class="l"><b>Récompense prête · ${esc(rw.label)}</b><span>${rw.kind === 'percent' ? 'Remise fidélité sur ce ticket' : 'Un article offert sur ce ticket'}</span></span>
        <span class="edit">Utiliser</span></button>`;
    }
    return '';
  }

  function renderTicket() {
    const t = state.ticket;
    const { promo, remise, reward, total } = ticketTotals(t);
    const count = ticketCount(t);
    /* Le numéro se tire à l'encaissement : « prêt » veut dire qu'une série
       attend sur la tablette, pas qu'un numéro est déjà pris. */
    const numReady = !!t.num || (!t.numbering && !t.numError);
    const el = $('#bq-ticket', root);
    el.innerHTML = `
      <div class="bq-tk-head">
        <div><span class="bq-tk-title">Ticket</span> <span class="bq-tk-num${t.num ? '' : t.numError ? ' err' : ''}">· ${t.num || (t.numError ? 'numéro indisponible' : t.numbering ? 'attribution…' : 'nouveau')} · par ${esc(STAFF.caissiere.name)}</span></div>
        ${!t.num && t.numError ? '<button class="bq-tk-retry" id="bq-tk-retry">Réessayer</button>' : ''}
        ${t.lines.length ? '<button class="bq-tk-reset" id="bq-tk-reset">Vider</button>' : ''}
      </div>
      <div class="bq-tk-meta">${clientRow(t)}${rewardRow(t)}</div>
      <div class="bq-tk-lines" id="bq-tk-lines">
        ${t.lines.length ? t.lines.map((ln, i) => lineRow(ln, i)).join('') + pairRow(t) : `
          <div class="bq-tk-empty" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:32px 14px; gap:8px;">
            <div class="bq-tk-empty-ic" style="width:40px; height:40px; border-radius:12px; background:rgba(11,110,79,0.10); color:var(--atlas); display:grid; place-items:center; margin-bottom:4px;">
              <svg width="20" height="20" viewBox="0 -960 960 960" fill="currentColor"><path d="M200-80q-33 0-56.5-23.5T120-160v-451q-18-11-29-28.5T80-680v-120q0-33 23.5-56.5T160-880h640q33 0 56.5 23.5T880-800v120q0 23-11 40.5T840-611v451q0 33-23.5 56.5T760-80H200Zm0-520v440h560v-440H200Zm-40-80h640v-120H160v120Zm200 280h240v-80H360v80Zm120 20Z"/></svg>
            </div>
            <div style="font-weight:600; font-size:14px; color:var(--ink);">Le ticket est vide.</div>
            <div style="font-size:12.5px; color:var(--n-500); line-height:1.45;">Touchez un article dans la grille, ou scannez son code-barres.</div>
          </div>`}
      </div>
      <div class="bq-tk-foot">
        <div class="bq-tk-tot">
          <span class="pcs"><i data-lucide="tag"></i> ${count} article${count > 1 ? 's' : ''}</span>
          ${promo ? `<span class="rem promo">Promotions · −${fmtMAD(promo)}</span>` : ''}
          ${remise >= 0.5 ? `<span class="rem">Remise · −${fmtMAD(remise)}</span>` : ''}
          ${reward ? `<span class="rem rew">Récompense · −${fmtMAD(reward)}</span>` : ''}
        </div>
        <div class="bq-tk-total"><span class="lbl">Total</span><span class="val">${fmtMAD(total)}</span></div>
        <button class="bq-validate" id="bq-validate" ${t.lines.length && numReady ? '' : 'disabled'}>
          <i data-lucide="banknote"></i> ${numReady ? `Encaisser · ${fmtMAD(total)}` : t.numError ? 'Numéro de ticket indisponible' : 'Attribution du numéro…'}
        </button>
      </div>`;
    const retry = $('#bq-tk-retry', el);
    if (retry) retry.onclick = () => {
      retry.disabled = true;
      prepareTicketNumber(t).then(
        () => toast('Série de tickets prête'),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Numéro de ticket toujours indisponible'), state.ticketStorageError
          ? 'Le stockage sécurisé de cette tablette est indisponible. Contactez le support.'
          : 'Reconnectez cette caisse pour réserver sa prochaine série.')
      );
    };
    const reset = $('#bq-tk-reset', el);
    if (reset) reset.onclick = () => {
      t.lines.forEach((ln) => stockAdd(ln.pid, ln.size, ln.qty));
      /* Un numéro déjà tiré (paiement ouvert puis abandonné) revient à la série. */
      if (t.num) releaseTicketNumber(t.num);
      freshTicket();                      /* ticket ET cliente remis à zéro — pas d'attache auto */
      renderTicket(); renderGrid(); renderBadges(); icons();
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ticket vidé, articles remis en stock'));
    };
    $('#bq-tk-client', el).onclick = openClientModal;
    const rwBtn = $('#bq-reward-toggle', el);
    if (rwBtn) rwBtn.onclick = () => {
      if (t.reward && t.reward.clientId === t.client) {
        ticketOwner.applyReward(t, null);
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Récompense retirée du ticket'));
      } else {
        const rw = clReward(t.client);
        if (!rw || !rw.ready) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Pas encore de récompense pour cette cliente')); return; }
        ticketOwner.applyReward(t, { clientId: t.client, kind: rw.kind, value: rw.value, label: rw.label });
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Récompense appliquée'), rw.label);
      }
      renderTicket(); icons();
    };
    $('#bq-validate', el).onclick = checkout;
    if (!t.lines.length) { try { window.KiwiPairs && KiwiPairs.reset('ticket'); } catch (_) {} }
    $('#bq-tk-lines', el).onclick = (e) => {
      /* « Souvent avec… » : « + » ouvre la fiche de l'article, comme un toucher
         dans la grille (taille, couleur, stock) ; « × » l'écarte de ce ticket. */
      const pairAdd = e.target.closest('[data-bq-pair-add]');
      if (pairAdd) { openSheet(pairAdd.dataset.bqPairAdd); return; }
      const pairNo = e.target.closest('[data-bq-pair-dismiss]');
      if (pairNo) { try { KiwiPairs.dismiss('ticket', pairNo.dataset.bqPairDismiss); } catch (_) {} renderTicket(); return; }
      const minus = e.target.closest('[data-bq-minus]');
      const plus = e.target.closest('[data-bq-plus]');
      const idx = minus ? +minus.dataset.bqMinus : plus ? +plus.dataset.bqPlus : -1;
      if (idx < 0) return;
      const ln = t.lines[idx];
      if (plus) {
        if (availableStock(ln.pid, ln.size, ln.color, t) <= 0) {
          toast(`${P[ln.pid].name} · ${ln.size}, plus de stock, dernière pièce déjà sur le ticket`, undefined, 'warn');
          return;
        }
        stockAdd(ln.pid, ln.size, -1);
        ticketOwner.changeQuantity(t, idx, 1);
      } else {
        stockAdd(ln.pid, ln.size, 1);
        ticketOwner.changeQuantity(t, idx, -1);
      }
      renderTicket(); renderGrid(); renderBadges(); icons();
    };
    /* Le pied du kit se remonte à CHAQUE rendu : renderTicket réécrit tout
       #bq-ticket, donc les <k-button> partent avec. Le libellé du bouton des
       clientes porte la cliente attachée, puisque la peau éteint la rangée du
       haut : le bouton EST l'état. */
    bqKitTicketFoot(el, $, icons, bqKitSkin(), {
      clientLabel: ticketClientLabel(t) + /* #105 : l'avoir reste visible au ticket */ (() => { const c = t.client && t.client !== 'passage' ? clById(t.client) : null, av = c && clAvoirTotal(c); return av ? ' · ' + tr('Avoir') + ' ' + fmtMAD(av.balance) : ''; })(),
      canRemise: !!t.lines.length,
      onRemise: openTicketRemise,
    });
    icons();
  }


  function lineRow(ln, i) {
    const p = P[ln.pid];
    const u = lineUnit(ln);
    const pr = linePromo(ln);
    /* Les deux baisses sont NOMMÉES séparément sur la ligne. Une pastille
       « −40 % » unique laisserait croire à une promotion là où la gérante a
       ajouté son propre geste par-dessus — et personne, au moment du retour,
       ne saurait plus démêler ce qui venait du magasin de ce qui venait d'elle. */
    return `<div class="bq-line">
      <span class="bq-line-art">${artOf(p, ln.color)}</span>
      <span class="bq-line-mid">
        <span class="bq-line-name" title="${esc(p.name)}">${esc(p.name)}</span>
        <span class="bq-line-sub">
          ${colorDot(ln.color)}
          <span class="sz">${esc(ln.size)}</span> ${esc(colorLabel(ln.color))}
          ${pr ? `<span class="bq-line-promo" title="${esc(pr.name || 'Promotion')}"><i data-lucide="tag"></i>${esc(pr.badge)}</span>` : ''}
          ${ln.remise ? `<span class="bq-line-rem">−${ln.remise} %</span>` : ''}
        </span>
      </span>
      <span class="bq-line-right">
        <span class="bq-line-price">${(ln.remise || pr) ? `<span class="was">${fmtMAD(shelf(p.price) * ln.qty)}</span>` : ''}${fmtMAD(u * ln.qty)}</span>
        <span class="bq-line-qty">
          <button data-bq-minus="${i}" aria-label="Retirer">−</button><b>${ln.qty}</b><button data-bq-plus="${i}" aria-label="Ajouter">+</button>
        </span>
      </span>
    </div>`;
  }

  /* « Souvent avec… » (assets/caisse-pairs.js) : l'article que les tickets de
     CETTE boutique associent le plus souvent au dernier entré. Jamais en démo,
     jamais en échange, jamais un article absent de la grille ou sans une
     seule pièce disponible. Les noms sont ceux du commerçant, non traduits. */
  function pairSellable(id) {
    const p = P[id];
    if (!p || !RAYONS.some((r) => r.items.some((it) => it.id === p.id))) return false;
    return (p.colors || []).some((c) => !!firstFreeFor(p, c));
  }
  function pairRow(t) {
    if (isDemoStore() || state.exchange || !window.KiwiPairs || !KiwiPairs.suggest || !KiwiPairs.say) return '';
    const ids = [];
    /* Les tickets envoient ln.pid tel quel (itemId) : c'est la clé des paires. */
    t.lines.forEach((ln) => { const id = String(ln.pid); if (ids[ids.length - 1] !== id) ids.push(id); });
    let s = null;
    try { s = KiwiPairs.suggest(ids, pairSellable, 'ticket'); } catch (_) { s = null; }
    const m = s && P[s.id], lead = s && P[s.lead];
    if (!m || !lead) return '';
    const w = KiwiPairs.say(window.KiwiCaisseLang ? KiwiCaisseLang.get() : 'fr');
    const pct = Math.round((Number(s.share) || 0) * 100);
    const pr = promoFor(m.id);
    const ln = esc(lead.name), mn = esc(m.name);
    return `<div class="rp-pair bq-pair">
      <span class="rp-pair-txt">${w.lead(ln, mn)}</span>
      <span class="rp-pair-why">${w.why(pct, ln)}</span>
      <button type="button" class="rp-pair-add" data-bq-pair-add="${esc(m.id)}" aria-label="${w.add(mn)}">+ ${fmtMAD(pr ? pr.price : m.price)}</button>
      <button type="button" class="rp-pair-x" data-bq-pair-dismiss="${esc(m.id)}" aria-label="${w.dismiss(mn, 'ticket')}">×</button>
    </div>`;
  }

  /* central add — stock-aware, merges identical lines */
  function addToTicket(pid, cfg, opts) {
    const p = P[pid];
    const available = availableStock(pid, cfg.size, cfg.color, state.ticket);
    if (available < cfg.qty) {
      toast(`${p.name} · ${colorLabel(cfg.color)} · ${cfg.size}, stock insuffisant`, undefined, 'warn',
        `${available} disponible${available > 1 ? 's' : ''}`);
      return false;
    }
    stockAdd(pid, cfg.size, -cfg.qty);
    /* Le prix promo du moment est recopié sur la ligne. Il ne fige rien à lui
       seul : lineDeal() le compare ensuite à la règle en vigueur et garde le
       plus bas. Deux lignes identiques peuvent donc fusionner sans risque —
       elles se résoudront au même prix, le meilleur pour la cliente. */
    const pr = promoFor(pid);
    const stamp = pr ? { price: pr.price, badge: pr.badge, name: pr.promo.name, id: pr.promo.id } : null;
    ticketOwner.addLine(state.ticket, { pid, size: cfg.size, color: cfg.color, qty: cfg.qty, remise: cfg.remise, promo: stamp });
    renderTicket(); renderGrid(); renderBadges(); icons();
    if (!opts || !opts.quiet) toast(`${p.name} · ${cfg.size}, sur le ticket`);
    return true;
  }

  /* ═══════════════════════ VARIANT SHEET ═══════════════════════ */
  const sheet = { pid: null, size: null, color: null, qty: 1, remise: 0, exchange: false };

  function defaultSize(p) {
    const c = ticketClient();
    if (!sheet.exchange && c && p.kind === 'taille' && availableStock(p.id, c.taille, sheet.color) > 0) return c.taille;
    return firstFreeFor(p, sheet.color) || sizesOf(p)[0];
  }

  function openSheet(pid, opts) {
    window.KiwiDiscountPolicy?.refresh?.(); // the owner may have changed the allowed percentages
    const p = P[pid];
    Object.assign(sheet, {
      pid,
      size: null, color: p.colors[0], qty: 1, remise: 0,
      exchange: !!(opts && opts.exchange),
    });
    sheet.size = defaultSize(p);
    renderSheet();
    openVeil('#bq-sheet-veil');
    icons();
    lens();
  }

  function renderSheet() {
    const p = P[sheet.pid];
    const c = ticketClient();
    /* La fiche variante affiche le prix QU'ON VA ENCAISSER. Elle calculait le
       sien à partir du prix catalogue : en promotion elle annonçait donc un
       prix, et le ticket en affichait un autre deux secondes plus tard. */
    const shPromo = promoFor(sheet.pid);
    const shBase = shPromo ? shPromo.price : shelf(p.price);
    const unit = shelf(shBase * (100 - sheet.remise) / 100);
    const available = availableStock(p.id, sheet.size, sheet.color);
    const canAdd = available >= sheet.qty;
    const el = $('#bq-sheetm', root);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bq-sheet-head">
        <span class="bq-sheet-art">${productVisual(p)}</span>
        <span class="bq-sheet-title"><h3>${esc(p.name)}</h3><span class="sub">${esc((RAYONS.find((r) => r.id === p.rayon) || { label: 'Divers' }).label)}${p.flag ? ` · ${esc(p.flag)}` : ''}${p.ean ? ` · ${esc(p.ean)}` : ''}</span></span>
        <span class="bq-sheet-price">
          <span class="val" id="bq-sheet-total">${fmtMAD(unit * sheet.qty)}</span>
          <span class="per ${sheet.remise ? 'rem' : ''}" id="bq-sheet-per">${sheet.remise ? `−${sheet.remise} % · accord gérante` : `${fmtMAD(unit)} × ${sheet.qty}`}</span>
        </span>
      </div>
      ${shPromo ? `
      <div class="bq-sheet-promo">
        <i data-lucide="tag"></i>
        <span class="l"><b>${esc(shPromo.promo.name)}</b><span>${esc(shPromo.badge)} · ${fmtMAD(shPromo.price)} au lieu de ${fmtMAD(shPromo.was)}</span></span>
      </div>` : ''}

      <div class="bq-f">
        <div class="bq-f-lbl">${sizeWord(p)} <span class="opt">· stock par taille en direct</span></div>
        <div class="bq-seg" data-lens-demo id="bq-size-seg">
          ${sizesOf(p).map((s) => {
            const st = availableStock(p.id, s, sheet.color);
            const usual = !sheet.exchange && c && p.kind === 'taille' && s === c.taille;
            return `<button class="bq-seg-it ${s === sheet.size ? 'on' : ''}" data-lens-item data-bq-size="${esc(s)}" ${st === 0 ? 'disabled' : ''}>
              ${usual ? '<span class="bq-seg-usual">habituelle</span>' : ''}${esc(s)}<small>${st === 0 ? 'épuisé' : `${st} en stock`}</small></button>`;
          }).join('')}
        </div>
      </div>

      <div class="bq-f"${(p.colors || []).every((cid) => String(cid) === NO_COLOR) ? ' style="display:none"' : ''}>
        <div class="bq-f-lbl">Couleur</div>
        <div id="bq-colors">
          ${KC() ? KC().picker('bq-color', sheet.color, { ids: p.colors, size: 'lg' }) : ''}
        </div>
      </div>

      ${sheet.exchange ? '' : `
      <div class="bq-row-2">
        <div class="bq-f">
          <div class="bq-f-lbl">Quantité</div>
          <div class="bq-stepper">
            <button id="bq-qty-minus" aria-label="Moins">−</button>
            <b id="bq-qty-val">${sheet.qty}</b>
            <button id="bq-qty-plus" aria-label="Plus">+</button>
          </div>
        </div>
        <div class="bq-f">
          <div class="bq-f-lbl">Remise <span class="opt">· accord gérante</span></div>
          <div class="bq-chips" id="bq-remise">
            ${[0, ...(window.KiwiDiscountPolicy?.percentages(_bqKey) || [5, 10, 15, 20])].map((r) => `<button class="bq-chip ${sheet.remise === r ? 'on' : ''}" data-bq-rem="${r}">${r === 0 ? 'Sans' : `−${r} %`}${r > 0 && !state.ticket.remiseAuth ? ' <i data-lucide="lock"></i>' : ''}</button>`).join('')}
          </div>
        </div>
      </div>`}

      <div class="bq-sheet-foot">
        <button class="bq-btn secondary" data-bq-close>Annuler</button>
        ${sheet.exchange
          ? `<button class="bq-btn primary" id="bq-sheet-add" ${canAdd ? '' : 'disabled'}><i data-lucide="arrow-left-right"></i><span class="bq-sheet-add-l">Choisir cet article · <span class="nb">${fmtMAD(shBase)}</span></span></button>`
          : `<button class="bq-btn primary" id="bq-sheet-add" ${canAdd ? '' : 'disabled'}><i data-lucide="plus"></i><span class="bq-sheet-add-l">Ajouter au ticket · <span class="nb" id="bq-sheet-cta">${fmtMAD(unit * sheet.qty)}</span></span></button>`}
      </div>`;

    const refreshPrice = () => {
      const u = shelf(shBase * (100 - sheet.remise) / 100);
      $('#bq-sheet-total', el).textContent = fmtMAD(u * sheet.qty);
      $('#bq-sheet-per', el).textContent = sheet.remise ? `−${sheet.remise} % · accord gérante` : `${fmtMAD(u)} × ${sheet.qty}`;
      $('#bq-sheet-per', el).classList.toggle('rem', !!sheet.remise);
      const cta = $('#bq-sheet-cta', el);
      if (cta) cta.textContent = fmtMAD(u * sheet.qty);
      const qv = $('#bq-qty-val', el);
      if (qv) qv.textContent = sheet.qty;
    };

    $('#bq-size-seg', el).onclick = (e) => {
      const b = e.target.closest('[data-bq-size]');
      if (!b || b.disabled) return;
      sheet.size = b.dataset.bqSize;
      const available = availableStock(p.id, sheet.size, sheet.color);
      if (sheet.qty > available) sheet.qty = Math.max(1, available);
      $$('[data-bq-size]', el).forEach((x) => x.classList.toggle('on', x === b));
      refreshPrice();
    };
    // Le picker gère lui-même sélection, clavier et libellé au survol : on écoute
    // seulement le choix retenu.
    $('#bq-colors', el).addEventListener('kc:change', (e) => {
      sheet.color = e.detail.value;
      if (availableStock(p.id, sheet.size, sheet.color) <= 0) {
        sheet.size = firstFreeFor(p, sheet.color) || sizesOf(p)[0];
      }
      sheet.qty = Math.max(1, Math.min(sheet.qty, availableStock(p.id, sheet.size, sheet.color)));
      renderSheet(); icons(); lens();
    });
    const qMinus = $('#bq-qty-minus', el);
    if (qMinus) qMinus.onclick = () => { if (sheet.qty > 1) { sheet.qty--; refreshPrice(); } };
    const qPlus = $('#bq-qty-plus', el);
    if (qPlus) qPlus.onclick = () => {
      const available = availableStock(p.id, sheet.size, sheet.color);
      if (sheet.qty >= available) { toast(`${p.name} · ${colorLabel(sheet.color)} · ${sheet.size}, ${available} en stock, pas plus`, undefined, 'warn'); return; }
      sheet.qty++; refreshPrice();
    };
    const remRow = $('#bq-remise', el);
    if (remRow) remRow.onclick = (e) => {
      const b = e.target.closest('[data-bq-rem]');
      if (!b) return;
      const r = +b.dataset.bqRem;
      if (r > 0 && window.KiwiDiscountPolicy && !window.KiwiDiscountPolicy.allowed(r, _bqKey)) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Pourcentage non autorisé')); return; }
      if (r > 0 && !state.ticket.remiseAuth) { openApprove(r, () => { sheet.remise = r; renderSheet(); icons(); lens(); }); return; }
      sheet.remise = r;
      $$('[data-bq-rem]', el).forEach((x) => x.classList.toggle('on', +x.dataset.bqRem === r));
      refreshPrice();
    };
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-sheet-veil'); });
    const add = $('#bq-sheet-add', el);
    if (add) add.onclick = () => {
      if (sheet.exchange) {
        closeVeil('#bq-sheet-veil');
        openExchSummary(sheet.pid, sheet.size, sheet.color);
        return;
      }
      if (addToTicket(sheet.pid, { size: sheet.size, color: sheet.color, qty: sheet.qty, remise: sheet.remise })) {
        closeVeil('#bq-sheet-veil');
      }
    };
    icons();
  }

  /* ---------- approbation gérante (remise) ---------- */
  /* Ce que l'accord laisse derrière lui. Le pied du modal promet « tracé dans le
     journal » — et seul un booléen partait dans la vente : impossible, trois jours
     plus tard, de dire qui avait accordé les 20 % ni combien avaient été lâchés.
     On garde le nom (jamais le code), l'heure et le pourcentage demandé. */
  function markRemiseAuth(pct, by, role) {
    ticketOwner.applyDiscount(state.ticket, { pct, by: by || '', role: role || '', at: new Date().toISOString() });
  }

  /* Sur une boutique RÉELLE, la remise passe par le vrai code responsable — le
     même portier que le remboursement et la fermeture de caisse, validé contre la
     liste du serveur. La liste d'équipe est neutralisée sur un vrai magasin
     (« Vendeur 1 »), donc la rangée « Aicha approuve » n'y était plus qu'un
     décor : un appui suffisait, sans code, sans nom. La démo locale garde sa
     distribution nommée — elle n'a pas de portier à interroger. */
  function openApprove(pct, onOk) {
    if (pvReal() && typeof window.requireManager === 'function') {
      if (window.KiwiAuthAct) window.KiwiAuthAct({ kind: 'discount', key: 'act.discount.pct', args: { pct: `${pct}\u202f%` } });
      window.requireManager(`Remise −${pct} % sur le ticket ${state.ticket.num || 'en cours'}`, () => {
        let mgr = null;
        try { mgr = window.KiwiCaissePairing?.lastManager?.() || null; } catch (_) {}
        markRemiseAuth(pct, mgr && mgr.name, mgr && mgr.role);
        toast(mgr && mgr.name ? `Remise −${pct} %, accord ${mgr.name}` : `Remise −${pct} % autorisée`);
        onOk();
      });
      return;
    }
    const el = $('#bq-approvem', root);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Remise −${pct} %</h3>
      <p class="modal-subtle">Une remise s'applique avec l'accord de la gérante, qui valide ?</p>
      <button class="bq-staff-row" id="bq-app-ok">
        <span class="bq-staff-ava">${initials(STAFF.gerante.name)}</span>
        <span class="l"><b>${esc(STAFF.gerante.name)}</b><span>${esc(STAFF.gerante.role)}, peut approuver</span></span>
        <span class="ok">Approuver</span>
      </button>
      <button class="bq-staff-row is-no" id="bq-app-no">
        <span class="bq-staff-ava">${initials(STAFF.conseil.name)}</span>
        <span class="l"><b>${esc(STAFF.conseil.name)}</b><span>${esc(STAFF.conseil.role)}</span></span>
        <span class="ok">Non habilitée</span>
      </button>
      <div class="bq-foot-note">L'accord vaut pour tout le ticket ${state.ticket.num || 'en cours'}, tracé dans le journal.</div>`;
    openVeil('#bq-approve-veil');
    icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-approve-veil'); });
    $('#bq-app-ok', el).onclick = () => {
      markRemiseAuth(pct, STAFF.gerante.name, STAFF.gerante.role);
      closeVeil('#bq-approve-veil');
      toast(`Remise −${pct} %, accord ${STAFF.gerante.name}`);
      onOk();
    };
    $('#bq-app-no', el).onclick = () => toast(`${STAFF.conseil.name} n'est pas habilitée, seule la gérante approuve une remise`);
  }

  /* La remise de ticket et le nom du bouton « Clientes » du pied 2027 :
     assets/pos-boutique/ticket-remise.js. sales.js lui passe ses propres
     fonctions (openApprove, le rendu), donc c'est son code qui tourne. */
  /* Construit à l'appel, pas au chargement : sales.js s'évalue avant que
     pos-boutique.js ait posé state et root (import circulaire). */
  const remiseKit = () => ticketRemise({
    state, root, $, $$, tr, icons, toast, clById, firstName, ticketOwner, renderBadges,
    openVeil, closeVeil, bqKey: () => _bqKey, renderTicket, renderGrid, openApprove,
  });
  const ticketClientLabel = (t) => remiseKit().ticketClientLabel(t);
  const openTicketRemise = () => remiseKit().openTicketRemise();

  /* Peau 2027 : la barre de vente répond dès le premier chiffre tapé
     (search.js). sales.js ne fait que passer SES fonctions : la douchette
     garde son chemin, commitEan, et la tuile le sien, openSheet. */
  const wireSellSearch = (bar, input) => sellSearch(bar, input, bqKitSkin(), {
    commit: commitEan, money: fmtMAD, esc, icons, artOf,
    open: (pid) => openSheet(pid, state.exchange ? { exchange: true } : null),
    catalog: () => ({ P, BY_EAN, promoFor, shelf, stockOf, availableStock, colorLabel }),
  });

  /* ═══════════════════════ CLIENTE — phone & name search (modal du ticket) ═══════ */
  function foldClientText(s) {
    return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  }
  function clienteHits(q) {
    const raw = String(q || '').trim();
    const src = clientList();
    if (!raw) return src;
    const qFold = foldClientText(raw);
    const digits = raw.replace(/\D/g, '');
    return src.filter((c) => {
      if (foldClientText(c.name).includes(qFold)) return true;
      if (c.email && foldClientText(c.email).includes(qFold)) return true;
      if (digits.length >= 2) {
        const cDigits = (c.phone || '').replace(/\D/g, '');
        if (cDigits.includes(digits)) return true;
        const cLocal = cDigits.replace(/^212/, '0');
        const qLocal = digits.replace(/^212/, '0');
        if (cLocal && qLocal && (cLocal.includes(qLocal) || qLocal.includes(cLocal))) return true;
      }
      return false;
    });
  }
  function clAvoirOf(c) {
    return activeAvoirs().find((a) => a.holderId === c.id) || null;
  }
  /* Ce que la cliente peut dépenser en avoirs : la somme de ses bons actifs.
     Le ticket n'affichait que le premier bon trouvé (25 MAD) alors qu'elle en
     portait deux (125 MAD). La fiche, elle, garde un bon nommé par son code. */
  function clAvoirTotal(c) {
    const mine = activeAvoirs().filter((a) => a.holderId === c.id);
    return mine.length ? { balance: mine.reduce((t, a) => t + (Number(a.balance) || 0), 0), count: mine.length } : null;
  }

  function openClientModal() {
    const el = $('#bq-clientm', root);
    let mode = 'search';
    if (window.KiwiClients && KiwiClients.pull) {
      KiwiClients.pull((changed) => {
        if (!changed || !root) return;
        const i = $('#bq-cl-q', el);
        if (i && $('#bq-client-veil.is-open', root)) {
          const val = i.value;
          render(val);
          icons();
          const next = $('#bq-cl-q', el);
          if (next) { next.focus(); moveCaretEnd(next); }
        }
      });
    }
    const render = (q) => {
      const hits = clienteHits(q);
      const isDigits = (q || '').replace(/\D/g, '').length > (q || '').replace(/\d/g, '').trim().length;
      const namePrefill = isDigits ? '' : (q || '').trim();
      const phonePrefill = isDigits ? (q || '').trim() : '';
      el.innerHTML = `
        <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
        <h3 class="modal-title">Cliente</h3>
        <p class="modal-subtle">Rechercher par nom ou par numéro de téléphone.</p>
        <div class="bq-phone-in"><i data-lucide="search"></i>
          <input id="bq-cl-q" type="text" enterkeyhint="search" autocorrect="off" autocapitalize="words" placeholder="Nom ou 06…" value="${esc(q || '')}" autocomplete="off" />
        </div>
        ${mode === 'search' ? `
          <div class="bq-cl-results">
            ${hits.map((c) => {
              const av = clAvoirTotal(c);
              return `<button class="bq-cl-row" data-bq-cl="${c.id}">
                <span class="bq-cl-ava">${esc(initials(c.name))}</span>
                <span class="bq-cl-mid">
                  <span class="bq-cl-name">${esc(c.name)} ${c.vip ? '<span class="bq-vip-chip">VIP</span>' : ''}</span>
                  <span class="bq-cl-sub">${esc(c.phone) || '·'}${c.taille ? ' · taille ' + esc(c.taille) : ''}</span>
                </span>
                <span class="bq-cl-right"><b>${c.points} pts</b>${c.achats} achat${c.achats > 1 ? 's' : ''}${av ? `<span class="av"><i data-lucide="ticket"></i>Avoir ${fmtMAD(av.balance)}</span>` : ''}</span>
              </button>`;
            }).join('') || `<div class="bq-empty">${q.trim() ? `Aucune fiche pour « ${esc(q)} »` : 'Tapez un nom ou un numéro de téléphone'}</div>`}
          </div>
          <button class="bq-cl-new" id="bq-cl-new"><i data-lucide="user-plus"></i>Nouvelle cliente${q && !hits.length ? ` · « ${esc(q)} »` : ''}</button>
          <div class="bq-sheet-foot" style="margin-top:10px;">
            <button class="bq-btn ghost" id="bq-cl-guest">Cliente de passage, sans fiche</button>
          </div>` : `
          <div class="bq-cl-form">
            <input class="bq-in" id="bq-cl-name" placeholder="Nom et prénom" value="${esc(namePrefill)}" />
            <input class="bq-in" id="bq-cl-tel" type="tel" inputmode="tel" autocomplete="tel" placeholder="06… / +212… (optionnel)" value="${esc(phonePrefill)}" />
            <div class="bq-sheet-foot" style="margin-top:4px;">
              <button class="bq-btn secondary" id="bq-cl-back">Retour</button>
              <button class="bq-btn primary" id="bq-cl-create"><i data-lucide="check"></i>Créer la fiche</button>
            </div>
          </div>`}`;
      $('#bq-cl-q', el).oninput = (e) => { render(e.target.value); icons(); const i = $('#bq-cl-q', el); i.focus(); moveCaretEnd(i); };
      $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-client-veil'); });
      $$('[data-bq-cl]', el).forEach((b) => {
        b.onclick = () => {
          const c = clById(b.dataset.bqCl);
          if (!c) return;
          ticketOwner.setCustomer(state.ticket, c.id);
          closeVeil('#bq-client-veil');
          const tt = [c.taille ? 'taille ' + c.taille : '', c.points + ' pts'].filter(Boolean).join(', ');
          toast(`${c.name}${tt ? ' · ' + tt : ''}${clAvoirOf(c) ? ', un avoir actif' : ''}`);
          renderTicket(); icons();
        };
      });
      const newBtn = $('#bq-cl-new', el);
      if (newBtn) newBtn.onclick = () => { mode = 'create'; render(q); icons(); };
      const guest = $('#bq-cl-guest', el);
      if (guest) guest.onclick = () => {
        ticketOwner.setCustomer(state.ticket, 'passage');
        closeVeil('#bq-client-veil');
        renderTicket(); icons();
      };
      const back = $('#bq-cl-back', el);
      if (back) back.onclick = () => { mode = 'search'; render(q); icons(); };
      const create = $('#bq-cl-create', el);
      if (create) create.onclick = () => {
        const name = $('#bq-cl-name', el).value.trim();
        const tel = $('#bq-cl-tel', el).value.trim();
        if (!name) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Le nom est requis pour la fiche')); return; }
        let cid;
        if (useKiwiCl()) {
          const rec = window.KiwiClients.upsert({ name, phone: tel, consent: true, source: 'caisse' });
          cid = rec.id;                                   // unified — appears in the dashboard « Clients » too
        } else {
          cid = 'cx' + Date.now().toString(36);
          const c = { id: cid, name, phone: tel, points: 0, taille: '', achats: 0, spent: 0, prefs: [], history: [] };
          CLIENTES.unshift(c); CL[cid] = c;
        }
        ticketOwner.setCustomer(state.ticket, cid);
        closeVeil('#bq-client-veil');
        queueIfOffline('Fiche cliente');
        toast(`Fiche créée, ${name}`);
        renderTicket(); renderBadges(); icons();
      };
    };
    render('');
    openVeil('#bq-client-veil');
    icons();
    setTimeout(() => { const i = $('#bq-cl-q', el); if (i) i.focus(); }, 60);
  }
  function moveCaretEnd(input) { const v = input.value; input.value = ''; input.value = v; }

  /* ═══════════════════════ VUE CLIENTES ═══════════════════════ */
  function renderClientes() {
    const panel = $('[data-bq-panel="clientes"]', root);
    const q = state.clQuery;
    const hits = clienteHits(q);
    panel.innerHTML = `
      <div class="bq-clients">
        <header class="bq-head">
          <div><h1>Clients</h1><div class="bq-head-sub">Rechercher par nom ou téléphone, la fiche suit le client</div></div>
          <div class="bq-search"><i data-lucide="search"></i>
            <input id="bq-clv-q" type="text" enterkeyhint="search" placeholder="Nom ou 06…" value="${esc(q)}" /></div>
        </header>
        <div class="bq-cl-scroll">
          <div class="bq-cl-grid">
            ${hits.map((c) => {
              const av = clAvoirTotal(c);
              return `<button class="bq-clcard" data-bq-fiche="${c.id}">
                <span class="bq-clcard-top">
                  <span class="bq-cl-ava">${esc(initials(c.name))}</span>
                  <span class="l">
                    <span class="bq-cl-name">${esc(c.name)} ${c.vip ? '<span class="bq-vip-chip">VIP</span>' : ''}</span>
                    <span class="bq-cl-sub">${esc(c.phone)}</span>
                  </span>
                </span>
                <span class="bq-clcard-stats">
                  <span class="bq-mini ok"><i data-lucide="star"></i>${c.points} pts</span>
                  <span class="bq-mini"><i data-lucide="ruler"></i>taille ${esc(c.taille)}</span>
                  <span class="bq-mini"><i data-lucide="receipt"></i>${c.achats} achat${c.achats > 1 ? 's' : ''}</span>
                  ${av ? `<span class="bq-mini warn"><i data-lucide="ticket"></i>avoir ${fmtMAD(av.balance)}</span>` : ''}
                </span>
              </button>`;
            }).join('') || `<div class="bq-empty" style="grid-column:1/-1;">${q.trim() ? `Aucune fiche pour « ${esc(q)} »` : 'Aucune fiche pour l’instant'}</div>`}
          </div>
        </div>
      </div>`;
    $('#bq-clv-q', panel).oncompositionend = (e) => e.target.dispatchEvent(new Event('input'));
    $('#bq-clv-q', panel).oninput = (e) => {
      /* The panel re-renders, but the field the cashier is typing in survives:
         swapping a fresh <input> in on every key dropped the iOS keyboard and
         broke accent long-press and Arabic composition mid-word. */
      if (e.isComposing) return;
      const typed = e.target;
      state.clQuery = typed.value;
      renderClientes(); icons();
      const fresh = $('#bq-clv-q', panel);
      if (fresh && fresh !== typed) fresh.replaceWith(typed);
      if (document.activeElement !== typed) { typed.focus(); moveCaretEnd(typed); }
    };
    panel.onclick = (e) => {
      const b = e.target.closest('[data-bq-fiche]');
      if (b) openFiche(b.dataset.bqFiche);
    };
    icons();
  }

  function openFiche(cid) {
    const c = clById(cid);   // clById, pas CL[…] : sur une vraie boutique le carnet vit dans KiwiClients (CL est vide)
    if (!c) return;
    const el = $('#bq-fichem', root);
    const av = clAvoirOf(c);
    const cloudHistory = (c.history || []).map((h) => ({
      when: h.when || whenLabel(h.ts || h.createdAt || 0),
      what: h.what || (Array.isArray(h.items) && h.items.length ? h.items.map((it) => `${it.qty || 1}× ${it.name || 'Article'}`).join(' + ') : (h.ref || 'Achat')),
      amt: h.amt != null ? h.amt : h.amount,
      method: h.method || '', ref: h.ref || '', ts: +(h.ts || h.createdAt || 0),
    }));
    const syncedRefs = new Set(cloudHistory.map((h) => String(h.ref || '')).filter(Boolean));
    const localOnly = SALES.filter((s) => s.clientId === cid && !s.voided
      && !syncedRefs.has(String(s.id || ''))).map((s) => ({
      when: whenLabel(s.at),
      // idem : une vente de la semaine peut porter un article supprimé depuis.
      what: s.lines.map((l) => `${(P[l.pid] && P[l.pid].name) || l.name || 'Article'}${l.size ? ' · ' + l.size : ''}`).join(' + '),
      amt: s.total, method: s.methods || '', ref: s.id || '', ts: +s.at || 0,
    }));
    const hist = localOnly.concat(cloudHistory).sort((a, b) => Number(b.ts || 0) - Number(a.ts || 0));
    /* The shared client total already includes local purchases immediately.
       Adding today's sales here counted the same ticket twice. */
    const spent = c.spent || 0;
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bq-fiche-head">
        <span class="bq-fiche-ava">${esc(initials(c.name))}</span>
        <div>
          <h3>${esc(c.name)} ${c.vip ? '<span class="bq-vip-chip">VIP</span>' : ''}</h3>
          <div class="tel">${esc(c.phone || 'sans téléphone')}</div>
        </div>
      </div>
      <div class="bq-fstats">
        <div class="bq-fstat"><b>${c.points}</b><span>points fidélité</span></div>
        <div class="bq-fstat"><b>${esc(c.taille)}</b><span>taille habituelle</span></div>
        <div class="bq-fstat"><b>${fmtMAD(spent)}</b><span>dépensé</span></div>
      </div>
      ${(c.prefs || []).length ? `<div class="bq-fnotes">${c.prefs.map((p) => `<div class="bq-fnote"><i data-lucide="heart"></i>${esc(p)}</div>`).join('')}</div>` : ''}
      ${av ? `<button class="bq-favoir" id="bq-fiche-av"><i data-lucide="ticket"></i>Avoir actif <b>${av.code}</b> · ${fmtMAD(av.balance)}, utilisable en caisse<span class="see">Voir</span></button>` : ''}
      <div class="bq-f-lbl" style="margin-bottom:6px;">Historique</div>
      <div class="bq-fhist">
        ${hist.length ? hist.map((h) => `<div class="bq-fhist-row"><span class="when">${esc(h.when)}${h.method ? `<small style="display:block;">${esc(h.method)}</small>` : ''}</span><span class="what">${esc(h.what)}${h.ref ? `<small style="display:block;">Ticket ${esc(h.ref)}</small>` : ''}</span><span class="amt">${fmtMAD(h.amt)}</span></div>`).join('') : '<div class="bq-empty">Aucun achat enregistré.</div>'}
      </div>
      <div class="bq-sheet-foot">
        <button class="bq-btn secondary" data-bq-close>Fermer</button>
        <button class="bq-btn primary" id="bq-fiche-sell"><i data-lucide="shopping-bag"></i>Nouvelle vente pour elle</button>
      </div>`;
    openVeil('#bq-fiche-veil');
    icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-fiche-veil'); });
    const avB = $('#bq-fiche-av', el);
    if (avB) avB.onclick = () => { closeVeil('#bq-fiche-veil'); openVoucher(av, { mode: 'view' }); };
    $('#bq-fiche-sell', el).onclick = () => {
      ticketOwner.setCustomer(state.ticket, c.id);
      closeVeil('#bq-fiche-veil');
      switchView('vente');
      toast(`${firstName(c.name)} au comptoir, taille ${c.taille} pré-sélectionnée`);
    };
  }

  /* ═══════════════════════ SCAN ═══════════════════════ */
  /* Demo « douchette » cycle — a handful of real, in-stock articles from the
     live catalogue (each carries a scannable primary barcode). */
  function scanCycle() {
    const out = [];
    for (const r of RAYONS) for (const it of r.items) if (firstFree(it) && it.ean) out.push(it.id);
    return out.length ? out : Object.keys(P);
  }

  /* Rayon (catégorie) auquel appartient un article, pour la fiche de vérif. */
  function rayonOf(pid) {
    const r = RAYONS.find((ry) => ry.items.some((it) => it.id === pid));
    return r ? r.label : '';
  }

  /* La fiche « disponibilité » d'un article vérifié : prix, tailles, stock,
     couleurs — lecture seule, aucun impact sur le ticket. */
  function lookupCardHtml() {
    const lk = state.lookup;
    if (!lk || !P[lk.pid]) return '';
    const p = P[lk.pid];
    const tot = stockOf(p);
    const status = tot === 0 ? { cls: 'out', label: 'Épuisé' }
                 : tot <= 3 ? { cls: 'low', label: 'Stock bas' }
                 : { cls: 'ok', label: 'Disponible' };
    const sizes = sizesOf(p).map((s) => {
      const q = variantStock(p.id, s, lk.color);
      const cls = q === 0 ? 'out' : q <= 2 ? 'low' : '';
      const on = s === lk.size ? ' is-on' : '';
      return `<span class="bq-look-size ${cls}${on}"><b>${esc(s)}</b><i>${q}</i></span>`;
    }).join('');
    const colors = (p.colors || []).filter((cid) => String(cid) !== NO_COLOR).map((cid) => {
      const on = cid === lk.color ? ' is-on' : '';
      return `<span class="bq-look-color${on}">${colorDot(cid)}${esc(colorLabel(cid))}</span>`;
    }).join('');
    const ray = rayonOf(lk.pid);
    return `
      <div class="bq-look">
        <div class="bq-look-top">
          <span class="bq-look-art">${artOf(p)}</span>
          <div class="bq-look-id">
            <b>${esc(p.name)}</b>
            <span>${ray ? esc(ray) + ' · ' : ''}EAN ${esc(lk.ean)} · ${fmtHM(lk.at)}</span>
          </div>
          <span class="bq-look-price">${(function () {
            /* La fiche « disponibilité » est ce qu'on montre à une cliente qui
               demande « il coûte combien ? » : citer le prix catalogue pendant
               une promotion, c'est annoncer un prix qu'on n'encaissera pas. */
            const pr = promoFor(lk.pid);
            return pr ? `<s>${fmtMAD(pr.was)}</s> ${fmtMAD(pr.price)}` : fmtMAD(shelf(p.price));
          })()}</span>
        </div>
        <div class="bq-look-avail">
          <div class="bq-look-avail-head">
            <span class="bq-look-status ${status.cls}">${status.label}</span>
            <span class="bq-look-tot">${tot} pièce${tot > 1 ? 's' : ''} en stock</span>
          </div>
          <div class="bq-look-sizes">${sizes || '<span class="bq-look-empty">Taille unique</span>'}</div>
          ${colors ? `<div class="bq-look-colors">${colors}</div>` : ''}
        </div>
        <button class="bq-btn secondary bq-look-sell" id="bq-look-sell" ${tot === 0 ? 'disabled' : ''}>
          <i data-lucide="shopping-bag"></i>Envoyer vers la vente
        </button>
      </div>`;
  }

  /* ── « et dans l'autre boutique ? » ────────────────────────────────────────
     Le panneau qui répond sans décrocher le téléphone. Il ne s'affiche que pour
     un compte à plusieurs établissements — le serveur ne renvoie rien d'autre
     quand il n'y en a qu'un, et le module de catalogue arrête alors de demander.

     Trois états, et le troisième compte autant que les deux autres :
       · en cours   — le scan local a déjà répondu, ceci arrive derrière
       · trouvé     — combien, dans quelle taille, dans quel magasin
       · INCONNU    — ce magasin n'a pas encore d'inventaire en ligne. On l'écrit
                      ainsi, jamais « 0 en stock » : ne pas savoir n'est pas la
                      même chose que ne pas en avoir, et un vendeur qui renvoie
                      une cliente à Marrakech sur un faux zéro ne recommence pas. */
  function crossCardHtml() {
    const cx = state.cross;
    if (!cx) return '';
    // L'attente porte le MÊME cadre et le même titre que le résultat : quand la
    // réponse arrive, seules les lignes changent. Un encadré séparé qui
    // disparaît ferait sauter la fiche article que le vendeur est en train de
    // lire — et, isolé, se lisait comme un champ de recherche vide.
    if (cx.loading) {
      return `<div class="bq-cross">
        <div class="bq-cross-h"><i data-lucide="store"></i>Vos autres établissements</div>
        <div class="bq-cross-wait"><i data-lucide="loader"></i>Recherche en cours…</div>
      </div>`;
    }
    if (!cx.stores || !cx.stores.length) return '';

    const rows = cx.stores.map((s) => {
      const name = esc(s.name || s.merchant);
      if (!s.known) {
        return `<div class="bq-cross-row is-unknown">
            <span class="bq-cross-store">${name}</span>
            <span class="bq-cross-note">inventaire pas encore synchronisé</span>
          </div>`;
      }
      if (!s.hits || !s.hits.length) {
        return `<div class="bq-cross-row is-none">
            <span class="bq-cross-store">${name}</span>
            <span class="bq-cross-note">aucun exemplaire</span>
          </div>`;
      }
      const detail = s.hits.map((h) => {
        const dim = [h.color, h.size].filter(Boolean).map(esc).join(' · ');
        // Une recherche par nom rapporte le produit et le détail par taille ;
        // un scan rapporte la variante exacte. Les deux se lisent pareil ici.
        const sizes = Array.isArray(h.sizes) && h.sizes.length
          ? h.sizes.map((z) => `<span class="bq-cross-sz"><b>${esc(z.size)}</b><i>${z.stock | 0}</i></span>`).join('')
          : '';
        const n = h.stock | 0;
        return `<div class="bq-cross-hit">
            <span class="bq-cross-prod">${esc(h.product)}${dim ? ' <em>' + dim + '</em>' : ''}</span>
            <span class="bq-cross-qty ${n === 0 ? 'out' : n <= 2 ? 'low' : ''}">${n}</span>
          </div>${sizes ? `<div class="bq-cross-sizes">${sizes}</div>` : ''}`;
      }).join('');
      return `<div class="bq-cross-row">
          <span class="bq-cross-store">${name}</span>
          <div class="bq-cross-hits">${detail}</div>
        </div>`;
    }).join('');

    return `<div class="bq-cross">
        <div class="bq-cross-h"><i data-lucide="store"></i>Vos autres établissements</div>
        ${rows}
        <div class="bq-cross-foot">Stock lu à l'instant sur le serveur. Appelez avant de faire déplacer une cliente.</div>
      </div>`;
  }

  /* Lance la recherche inter-magasins pour le code qui vient d'être scanné et
     redessine quand elle revient. Volontairement APRÈS l'affichage local : le
     scan doit rester instantané, ceci n'est qu'un complément. */
  function askCross(code, pid) {
    const cat = window.KiwiBoutiqueCatalog;
    if (!cat || !cat.crossStock || !code) { state.cross = null; return; }
    /* La référence commune de CE produit part avec le code. C'est elle qui fait
       le rapprochement quand le commerçant a étiqueté lui-même sa marchandise :
       l'étiquette de Casa ne veut rien dire à Rabat, la référence si. */
    let sku = '';
    try {
      const p = pid ? (P[pid] || null) : null;
      sku = (p && p.sku) || '';
    } catch (_) { sku = ''; }
    state.cross = { code, loading: true, stores: null };
    cat.crossStock({ code, sku }).then((res) => {
      // Un autre code a été scanné entre-temps : cette réponse ne le concerne
      // plus, l'afficher sous le nouveau serait un mensonge.
      if (!state.cross || state.cross.code !== code) return;
      state.cross = res && res.stores && res.stores.length
        ? { code, loading: false, stores: res.stores }
        : null;
      if (state.view === 'scan') renderScan();
    });
  }

  /* ── Caméra : lecture RÉELLE d'un code-barres ──────────────────────────────
     La douchette USB n'a jamais eu besoin de code : c'est un clavier, elle tape
     dans le champ et valide par Entrée. Ce qui manquait, c'est de pouvoir
     scanner SANS douchette, avec le téléphone ou la tablette qui sert de caisse.
     Zéro dépendance et zéro build : l'API navigateur BarcodeDetector décode
     directement le flux getUserMedia. Elle n'existe pas partout (Chrome
     Android / macOS / ChromeOS oui, Safari iOS non) : quand elle manque on le
     dit franchement plutôt que d'ouvrir une caméra qui ne déchiffrerait rien. */
  const CAM_WANT = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf', 'codabar', 'qr_code'];
  function camSupported() {
    try { return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector); }
    catch (_) { return false; }
  }
  /* Bip court : la caissière doit ENTENDRE que ça a mordu sans quitter le client
     des yeux — c'est ce que fait une vraie douchette. */
  function camBlip() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) {
        const ac = new AC();
        const o = ac.createOscillator(), g = ac.createGain();
        o.type = 'square';
        o.frequency.value = 2100;
        g.gain.setValueAtTime(0.05, ac.currentTime);
        g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + 0.12);
        o.connect(g); g.connect(ac.destination);
        o.start(); o.stop(ac.currentTime + 0.13);
        setTimeout(() => { try { ac.close(); } catch (_) {} }, 320);
      }
    } catch (_) {}
  }

  let camBusy = false;
  function openCamScan(onCode) {
    if (camBusy) return;
    if (!camSupported()) {
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Lecture caméra indisponible sur ce navigateur, utilisez la douchette ou tapez le code'));
      return;
    }
    camBusy = true;
    const veil = document.createElement('div');
    veil.className = 'bq-cam';
    veil.innerHTML = `
      <div class="bq-cam-box">
        <video class="bq-cam-video" playsinline muted></video>
        <div class="bq-cam-frame"><i></i><i></i><i></i><i></i><div class="bq-cam-laser"></div></div>
        <div class="bq-cam-bar">
          <div class="bq-cam-hint" id="bq-cam-hint">Placez le code-barres dans le cadre</div>
          <div class="bq-cam-acts">
            <button class="bq-cam-btn" id="bq-cam-torch" hidden>Lampe</button>
            <button class="bq-cam-btn is-close" id="bq-cam-close">Fermer</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(veil);
    const video = $('.bq-cam-video', veil);
    const hint = $('#bq-cam-hint', veil);
    video.muted = true;
    let stream = null, raf = 0, stopped = false;

    const stop = () => {
      if (stopped) return;
      stopped = true;
      camBusy = false;
      if (raf) cancelAnimationFrame(raf);
      try { if (stream) stream.getTracks().forEach((t) => t.stop()); } catch (_) {}
      try { video.srcObject = null; } catch (_) {}
      veil.remove();
      document.removeEventListener('keydown', onKey);
    };
    function onKey(e) { if (e.key === 'Escape') stop(); }
    document.addEventListener('keydown', onKey);
    $('#bq-cam-close', veil).onclick = stop;
    veil.addEventListener('click', (e) => { if (e.target === veil) stop(); });

    (async () => {
      let detector;
      try {
        let fmts = CAM_WANT;
        try {
          const sup = await window.BarcodeDetector.getSupportedFormats();
          const inter = CAM_WANT.filter((f) => sup.indexOf(f) >= 0);
          if (inter.length) fmts = inter;
        } catch (_) {}
        detector = new window.BarcodeDetector({ formats: fmts });
      } catch (_) {
        hint.textContent = (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Lecture caméra indisponible sur cet appareil');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (err) {
        const n = err && err.name;
        hint.textContent = n === 'NotAllowedError' || n === 'SecurityError'
          ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Accès caméra refusé, autorisez-le dans le navigateur puis réessayez')
          : n === 'NotFoundError' || n === 'OverconstrainedError' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune caméra utilisable sur cet appareil')
          : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Caméra indisponible');
        return;
      }
      if (stopped) { try { stream.getTracks().forEach((t) => t.stop()); } catch (_) {} return; }
      video.srcObject = stream;
      try { await video.play(); } catch (_) {}

      /* Lampe — une réserve ou une cabine d'essayage est rarement bien éclairée.
         Seuls certains téléphones l'exposent ; sinon le bouton reste caché. */
      try {
        const track = stream.getVideoTracks()[0];
        const caps = track && track.getCapabilities ? track.getCapabilities() : null;
        if (caps && caps.torch) {
          const tb = $('#bq-cam-torch', veil);
          let on = false;
          tb.hidden = false;
          tb.onclick = () => {
            on = !on;
            try { track.applyConstraints({ advanced: [{ torch: on }] }); } catch (_) {}
            tb.classList.toggle('is-on', on);
          };
        }
      } catch (_) {}

      let last = 0;
      const tick = async (ts) => {
        if (stopped) return;
        /* ~8 lectures/seconde : assez vif pour mordre tout de suite, assez lâche
           pour ne pas saturer le CPU d'une tablette d'entrée de gamme. */
        if (ts - last > 120 && video.readyState >= 2) {
          last = ts;
          try {
            const hits = await detector.detect(video);
            if (hits && hits.length) {
              const code = String(hits[0].rawValue || '').trim();
              if (code) { camBlip(); stop(); onCode(code); return; }
            }
          } catch (_) { /* une frame illisible n'interrompt pas la boucle */ }
        }
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    })();
  }

  function renderScan() {
    const panel = $('[data-bq-panel="scan"]', root);
    /* #0157 · dans l'application native il n'y a ni getUserMedia ni
       BarcodeDetector : le message « ce navigateur… » y est faux. */
    const inNativeApp = () => { try { return document.documentElement.classList.contains('kiwi-native'); } catch (_) { return false; } };
    panel.innerHTML = `
      <div class="bq-scan">
        <header class="bq-head">
          <div><h1>Scan produit</h1><div class="bq-head-sub">Scannez un article pour voir son prix, ses tailles et son stock. Rien n'est ajouté au ticket.</div></div>
        </header>
        <div class="bq-scan-inner">
          <div class="bq-ean-in"><i data-lucide="scan-line"></i>
            <input id="bq-ean" placeholder="Scannez ou tapez un code-barres…" autocomplete="off" autocorrect="off" autocapitalize="off" enterkeyhint="go" />
          </div>
          <div class="bq-scan-or">ou</div>
          ${pvReal()
            ? (camSupported()
                ? `<button class="bq-scan-mock" id="bq-scan-cam"><i data-lucide="camera"></i>Scanner avec la caméra</button>`
                : (inNativeApp()
                  ? `<div class="bq-scan-nocam">Caméra indisponible dans l’application : utilisez la douchette USB ou tapez le code ci-dessus.</div>`
                  : `<div class="bq-scan-nocam">Ce navigateur ne sait pas lire un code-barres par la caméra. La douchette USB fonctionne, elle tape directement dans le champ ci-dessus.</div>`))
            : `<button class="bq-scan-mock" id="bq-scan-mock"><i data-lucide="scan-line"></i>Scanner un article (douchette démo)</button>`}
          <button class="bq-scan-diag" id="bq-scan-diag"><i data-lucide="activity"></i>Tester la douchette</button>
          <div class="bq-scan-stage" id="bq-scan-stage"><span id="bq-scan-stage-ean"></span><div class="bq-scan-laser"></div></div>
          ${lookupCardHtml()}
          ${crossCardHtml()}
          ${state.scanLog.length ? `
          <div class="bq-scan-log-h">Derniers articles vérifiés</div>
          <div class="bq-scan-log">
            ${state.scanLog.slice(0, 6).map((l) => `
              <div class="bq-scan-log-row ${l.ok ? '' : 'is-err'}">
                <i data-lucide="${l.ok ? 'check-circle-2' : 'x'}"></i>
                <span class="when">${fmtHM(l.at)}</span>
                <span>${esc(l.label)}</span>
                <span class="ean">${esc(l.ean)}</span>
              </div>`).join('')}
          </div>` : (state.lookup ? '' : `<div class="bq-empty">Aucun article vérifié pour l'instant, la douchette USB tape ici toute seule.</div>`)}
        </div>
      </div>`;
    const diag = $('#bq-scan-diag', panel);
    if (diag) diag.onclick = () => openScannerTest();
    const input = $('#bq-ean', panel);
    input.onkeydown = (e) => { if (e.key === 'Enter') { const v = input.value; input.value = ''; lookupScan(v); } };
    input.oninput = () => { if (input.value.replace(/\D/g, '').length >= 13) { const v = input.value; input.value = ''; lookupScan(v); } };
    const refocusScan = () => {
      setTimeout(() => {
        if (state.view !== 'scan') return;
        if ($$('.modal-veil.is-open', root).length) return;
        // Le menu ouvert ne rappelle pas le clavier ; la douchette retrouve le champ dès qu'il se referme.
        if (document.body.classList.contains('nav-open')) { refocusScan(); return; }
        const i = $('#bq-ean', root);
        if (i) i.focus();
      }, 120);
    };
    input.onblur = refocusScan;
    /* Un seul des deux existe selon le contexte (vraie boutique vs démo). */
    const mk = $('#bq-scan-mock', panel);
    if (mk) mk.onclick = mockScan;
    const cam = $('#bq-scan-cam', panel);
    if (cam) cam.onclick = () => openCamScan(lookupScan);
    const sell = $('#bq-look-sell', panel);
    if (sell) sell.onclick = () => {
      const lk = state.lookup;
      if (!lk || !P[lk.pid]) return;
      const p = P[lk.pid];
      const color = lk.color || p.colors[0];
      const size = availableStock(lk.pid, lk.size, color) > 0 ? lk.size : firstFreeFor(p, color);
      if (!size) { toast(`${p.name} · ${colorLabel(color)}, épuisé dans toutes les tailles`, undefined, 'warn'); return; }
      switchView('vente');
      addToTicket(lk.pid, { size, color, qty: 1, remise: 0 });
    };
    icons();
    setTimeout(() => { const i = $('#bq-ean', panel); if (i) i.focus(); }, 60);
  }

  /* SELL path — a code scanned/typed in Vente (the scan bar or the USB douchette)
     drops the EXACT variant (colour + size) straight onto the ticket, like a
     supermarket lane. Resolves EAN-13 or any old/alphanumeric code registered on
     an article. Unknown → offer to register it on a product (no reprint). */
  function commitEan(raw) {
    if (state.checkoutBusy || (root && $$('.modal-veil.is-open', root).length)) {
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Terminez la fenêtre ouverte avant de scanner'));
      return;
    }
    const code = normScan(raw);
    if (!code) return;
    const hit = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.resolveScan(code) : null;
    const pid = hit ? hit.pid : BY_EAN[code];
    if (!pid || !P[pid]) {
      toast(`Code ${code} inconnu, enregistrez-le sur un article`);
      offerRegister(code);
      return;
    }
    const p = P[pid];
    const c = ticketClient();
    const color = (hit && hit.colorId && p.colors.includes(hit.colorId)) ? hit.colorId
      : ((hit && hit.colorFamily && p.colors.includes(hit.colorFamily)) ? hit.colorFamily : p.colors[0]);
    /* Un code-barres identifie une déclinaison exacte. S'il est épuisé, on ne
       remplace jamais silencieusement un S noir scanné par la taille habituelle
       de la cliente ou par une autre couleur. Le repli ne concerne que les
       anciens codes produit qui ne portent aucune déclinaison. */
    let size = hit ? hit.size
      : (c && p.kind === 'taille' && availableStock(pid, c.taille, color) > 0) ? c.taille
      : firstFreeFor(p, color);
    if (!size || availableStock(pid, size, color) <= 0) {
      toast(`${p.name} · ${colorLabel(color)}${size ? ' · ' + size : ''}, épuisé`, undefined, 'warn');
      return;
    }
    addToTicket(pid, { size, color, qty: 1, remise: 0 }, { quiet: true });
    /* A scanned item added to the bill is an Adjust, on the frame the line is added (design 2027, §20.3). */
    try { if (window.KiwiHaptics) window.KiwiHaptics.play('Adjust', window.KiwiHaptics.gid('scan-add')); } catch (_) {}
    /* « Bip, nom · taille, sur le ticket · prix » : la phrase garde ses morceaux
       séparés, pour que la caisse en arabe et en anglais la reconnaisse. */
    toast(`Bip, ${p.name} · ${size}, sur le ticket · ${fmtMAD(shelf(p.price))}`);
    if (state.view === 'vente') renderTicket();
    renderBadges();
  }

  /* LOOKUP path — the Scan tab: an employee scans/types a code to SEE the article
     (price, sizes, live stock, colours). Read-only — nothing touches the ticket. */
  function lookupScan(raw) {
    const code = normScan(raw);
    if (!code) return;
    const hit = window.KiwiBoutiqueCatalog ? window.KiwiBoutiqueCatalog.resolveScan(code) : null;
    const pid = hit ? hit.pid : BY_EAN[code];
    if (!pid || !P[pid]) {
      state.lookup = null;
      state.scanLog.unshift({ at: new Date(), ok: false, label: 'Code inconnu, non référencé', ean: code, pid: null, size: '' });
      toast(`Code ${code} inconnu, aucun article ne le porte`);
      /* Le cas où la question vaut le plus cher : l'article n'est pas d'ICI.
         Il est peut-être de l'autre boutique — et c'est la réponse que le
         vendeur cherchait avant même de savoir qu'il pouvait la demander. */
      askCross(code);
      if (state.view === 'scan') renderScan();
      renderBadges();
      offerRegister(code);
      return;
    }
    const p = P[pid];
    const color = (hit && hit.colorId && p.colors.includes(hit.colorId)) ? hit.colorId
      : ((hit && hit.colorFamily && p.colors.includes(hit.colorFamily)) ? hit.colorFamily : p.colors[0]);
    /* on affiche la variante scannée même si elle est à zéro — c'est justement le
       stock qu'on vient vérifier. À défaut de taille scannée, la 1re taille. */
    const size = (hit && hit.size && p.sizes[hit.size] != null) ? hit.size : (firstFreeFor(p, color) || sizesOf(p)[0] || '');
    state.lookup = { pid, size, color, ean: code, at: new Date() };
    state.scanLog.unshift({ at: new Date(), ok: true, label: `${p.name}${size ? ' · ' + size : ''}, vérifié`, ean: code, pid, size });
    const tot = stockOf(p);
    toast(tot > 0 ? `${p.name} · ${tot} en stock` : `${p.name}, épuisé`, undefined, tot > 0 ? '' : 'warn');
    askCross(code, pid);
    if (state.view === 'scan') renderScan();
    renderBadges();
  }

  function mockScan() {
    if (state.scanBusy) return;
    const cycle = scanCycle();
    if (!cycle.length) return;
    state.scanBusy = true;
    const pid = cycle[state.scanIdx % cycle.length];
    state.scanIdx++;
    const code = P[pid] ? P[pid].ean : '';
    const stage = $('#bq-scan-stage', root);
    const lbl = $('#bq-scan-stage-ean', root);
    if (stage) { stage.classList.add('is-on'); if (lbl) lbl.textContent = code; }
    setTimeout(() => {
      state.scanBusy = false;
      lookupScan(code);
    }, 620);
  }
export { $, $$, DAYS, KC, MIN, artOf, barcode, camSupported, clById, clientList, colorDot, colorLabel, commitEan, esc, fmtDT, fmtDay, fmtDayY, fmtHM, fmtValidUntil, fmtMAD, iconPickerHtml, icons, isDemoStore, lens, lookupScan, moveCaretEnd, openCamScan, pad2, wireSellSearch, rayonOf, renderCats, renderClientes, renderExchNote, renderGrid, renderScan, renderTicket, shelf, useKiwiCl, variantColor, variantSource, wireIconPicker };
