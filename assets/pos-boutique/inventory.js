import { RAYONS, P, stockOf, root, salesToday, toast, renderBadges, openVeil, closeVeil, _bqKey, BY_EAN, state, bqMoney, switchView, rebuildCatalog, pruneTicket, STAFF, promoFor, variantStock, bqKitSkin, pvReal } from '../pos-boutique.js?v=229';
import { fmtDay, fmtHM, $, icons, fmtMAD, esc, $$, renderGrid, lens, pad2, shelf, artOf, variantColor, colorDot, variantSource, iconPickerHtml, wireIconPicker, KC, camSupported, openCamScan, colorLabel } from './sales.js?v=129';
import { openMoves } from './inv-moves.js?v=5';
import * as SZ from '../boutique-sizes.js?v=17';
import { tillInventoryAllowed, tillInventoryRefusal } from '../till-inventory-access.js?v=1';
import { invSearch, invUnseenCount, invMarkSeen, invCountAsks, invPaint } from './inv-tools.js?v=18';
import { catDB, fmtNum, invScanHandle, disarmScanCapture, armScanCapture, normScan, openScannerTest } from './checkout.js?v=129';


  /* ═══════════════════════ PROMOTIONS ═══════════════════════
   * L'écran où le magasin décide de ses prix. La règle vit dans
   * assets/promos.js ; ici on ne fait que la composer et la montrer.
   *
   * Le pari de cet écran : un commerçant ne crée pas une promotion « en
   * pourcentage sur une catégorie » — il veut « écouler les caftans d'été » ou
   * « vider ce qui traîne depuis six mois ». Les cibles sont donc écrites dans
   * ces mots-là, et l'aperçu chiffre la décision AVANT de l'enregistrer :
   * combien d'articles, combien ça coûte, combien passeraient sous le prix
   * d'achat. Une promotion qu'on enregistre sans savoir ce qu'elle touche est
   * une promotion qu'on découvre au comptoir, article par article. */

  const PRM = () => window.KiwiPromos || null;
  const promoState = { filter: 'active' };

  const PROMO_DAY = 86400000;
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime(); };
  const endOfDay   = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x.getTime(); };

  /* La cible, écrite comme le commerçant la dirait à voix haute. Un « scope.type
     = avant » affiché tel quel n'apprend rien à personne. */
  function promoScopeText(p) {
    const sc = p.scope || {};
    if (sc.type === 'tout') return 'Tout le magasin';
    if (sc.type === 'rayon') {
      const names = (sc.ids || []).map((id) => (RAYONS.find((r) => r.id === id) || {}).label).filter(Boolean);
      if (!names.length) return 'Aucun rayon choisi';
      return names.length <= 2 ? names.join(' et ') : `${names[0]} et ${names.length - 1} autres rayons`;
    }
    if (sc.type === 'produits') {
      const n = (sc.ids || []).length;
      if (!n) return 'Aucun article choisi';
      if (n === 1) { const it = P[sc.ids[0]]; return it ? it.name : '1 article'; }
      return `${n} articles choisis`;
    }
    if (sc.type === 'avant') return sc.before ? `Entré en stock avant le ${fmtDay(new Date(sc.before))}` : 'Aucune date choisie';
    if (sc.type === 'stock') return `Il en reste ${sc.max || 0} ou moins`;
    return '·';
  }

  /* La période, en clair, avec ce qu'il reste à courir. « du 12 au 19 » ne dit
     pas si c'est fini ; « se termine dans 3 jours » se lit d'un coup d'œil. */
  /* Le créneau (« Mar, Jeu · 12:00–14:00 ») d'une promotion à jours ou à
     heures, et quand elle reprend si elle attend. Posé depuis le tableau de
     bord ; la caisse le dit, sans quoi « Hors créneau » ne s'expliquerait pas. */
  const PROMO_DAY_SHORT = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
  const PROMO_DAY_LONG = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  function promoSlotText(p, st, now) {
    const parts = [];
    if (p.days && p.days.length) parts.push([1, 2, 3, 4, 5, 6, 0].filter((d) => p.days.indexOf(d) >= 0).map((d) => PROMO_DAY_SHORT[d]).join(', '));
    if (p.start && p.end) parts.push(`${p.start}–${p.end}`);
    if (!parts.length || st === 'ended') return '';
    if (st === 'waiting') {
      const next = PRM().nextWindow ? PRM().nextWindow(p, now) : null;
      parts.push(next ? `Reprend ${next.day === 0 ? 'aujourd\'hui' : next.day === 1 ? 'demain' : PROMO_DAY_LONG[next.weekday]}${next.at ? ` à ${next.at}` : ''}` : 'Hors créneau');
    }
    return parts.join(' · ') + ' · ';
  }
  function promoWhenText(p, now) {
    now = now || Date.now();
    const st = PRM().status(p, now);
    return promoSlotText(p, st, now) + promoWhenBase(p, st, now);
  }
  function promoWhenBase(p, st, now) {
    if (st === 'paused') return 'En pause, aucun prix n\'est modifié';
    if (st === 'scheduled') {
      const j = Math.ceil((p.from - now) / PROMO_DAY);
      return `Démarre ${j <= 1 ? 'demain' : `dans ${j} jours`} · ${fmtDay(new Date(p.from))}`;
    }
    if (st === 'ended') return `Terminée le ${fmtDay(new Date(p.to))}`;
    if (!p.to) return 'Sans date de fin, jusqu\'à ce que vous l\'arrêtiez';
    const left = p.to - now;
    if (left < 2 * 3600000) return `Se termine à ${fmtHM(new Date(p.to))}`;
    const j = Math.ceil(left / PROMO_DAY);
    return j <= 1 ? `Se termine aujourd'hui à ${fmtHM(new Date(p.to))}` : `Se termine dans ${j} jours · ${fmtDay(new Date(p.to))}`;
  }

  /* Le catalogue vu comme une liste plate — ce que preview() attend. */
  const promoItems = () => Object.keys(P).filter((k) => P[k] && P[k].id === k).map((k) => P[k]);

  function promoCount(p) {
    const pr = PRM();
    if (!pr) return 0;
    return pr.preview(p, promoItems(), { stockOf: (it) => stockOf(it) }).count;
  }

  function renderPromos() {
    const pr = PRM();
    const el = $('[data-bq-panel="promotions"]', root);
    if (!pr) {
      el.innerHTML = `<div class="bq-pr-wrap"><div class="bq-pr-empty"><i data-lucide="tag"></i>
        <div><b>Promotions indisponibles</b><span>Le module de promotions n'a pas été chargé sur cette caisse.</span></div></div></div>`;
      icons(); return;
    }
    const now = Date.now();
    const all = pr.list();
    const st = pr.stats(now);
    /* En pause et programmée vivent dans le même onglet « à venir » : ce sont
       les deux façons d'avoir une promotion prête qui ne s'applique pas encore. */
    const groups = {
      active: all.filter((p) => ['active', 'waiting'].indexOf(pr.status(p, now)) >= 0),
      soon: all.filter((p) => ['scheduled', 'paused'].indexOf(pr.status(p, now)) >= 0),
      ended: all.filter((p) => pr.status(p, now) === 'ended'),
    };
    const shown = groups[promoState.filter] || groups.active;

    /* Ce que les promotions ont coûté aujourd'hui — la seule mesure qui dit si
       elles marchent. Lue sur les ventes du jour, pas estimée. */
    const offToday = salesToday().reduce((s, x) => s + (+x.promoOff || 0), 0);
    /* Seules celles qui s'appliquent À CET INSTANT remisent un article : une
       promotion « hors créneau » est sous l'onglet, pas sur l'étiquette. */
    const running = groups.active.filter((p) => pr.status(p, now) === 'active');
    const touched = running.length ? promoArticleCount(running) : 0;
    const sub = [
      `${st.active} promotion${st.active > 1 ? 's' : ''} en cours`,
      st.waiting ? `${st.waiting} hors créneau` : null,
      touched ? `${touched} article${touched > 1 ? 's' : ''} remisé${touched > 1 ? 's' : ''}` : null,
      offToday ? `${fmtMAD(offToday)} offerts aujourd'hui` : null,
    ].filter(Boolean).join(' · ');

    el.innerHTML = `
      <div class="bq-pr-wrap">
        <header class="bq-head">
          <div><h1>Promotions</h1><div class="bq-head-sub">${esc(sub)}</div></div>
          <button class="bq-btn primary bq-pr-new" id="bq-pr-new"><i data-lucide="plus"></i>Nouvelle promotion</button>
        </header>

        ${all.length ? `
        <div class="bq-seg bq-pr-seg" data-lens-demo id="bq-pr-filter">
          <button class="bq-seg-it ${promoState.filter === 'active' ? 'on' : ''}" data-lens-item data-prf="active">En cours<small>${groups.active.length}</small></button>
          <button class="bq-seg-it ${promoState.filter === 'soon' ? 'on' : ''}" data-lens-item data-prf="soon">À venir<small>${groups.soon.length}</small></button>
          <button class="bq-seg-it ${promoState.filter === 'ended' ? 'on' : ''}" data-lens-item data-prf="ended">Terminées<small>${groups.ended.length}</small></button>
        </div>` : ''}

        ${all.length ? (shown.length ? `
        <div class="bq-pr-list">
          ${shown.map((p) => promoCardHtml(p, now)).join('')}
        </div>` : `
        <div class="bq-pr-empty soft"><i data-lucide="tag"></i>
          <div><b>Rien ici</b><span>${promoState.filter === 'active' ? 'Aucune promotion ne tourne en ce moment.' : promoState.filter === 'soon' ? 'Aucune promotion en attente.' : 'Aucune promotion terminée.'}</span></div>
        </div>`) : promoEmptyHtml()}
      </div>`;

    $('#bq-pr-new', el).onclick = () => openPromoComposer(null);
    const seg = $('#bq-pr-filter', el);
    if (seg) seg.onclick = (e) => {
      const b = e.target.closest('[data-prf]');
      if (!b) return;
      promoState.filter = b.dataset.prf;
      renderPromos();
    };
    $$('[data-pr-starter]', el).forEach((b) => {
      b.onclick = () => openPromoComposer(promoStarter(b.dataset.prStarter));
    });
    $$('[data-pr-edit]', el).forEach((b) => { b.onclick = () => openPromoComposer(pr.get(b.dataset.prEdit)); });
    $$('[data-pr-toggle]', el).forEach((b) => {
      b.onclick = () => {
        const p = pr.get(b.dataset.prToggle); if (!p) return;
        pr.setPaused(p.id, !p.paused);
        toast(p.paused ? `${p.name} reprend` : `${p.name} en pause, les prix repassent au plein tarif`);
        renderPromos(); renderGrid(); renderBadges(); icons(); lens();
      };
    });
    $$('[data-pr-print]', el).forEach((b) => { b.onclick = () => openPromoLabels(b.dataset.prPrint); });
    $$('[data-pr-del]', el).forEach((b) => { b.onclick = () => confirmPromoDelete(b.dataset.prDel); });
    icons(); lens();
  }

  /* Combien d'articles portent une étiquette promo en ce moment, sans les
     compter deux fois quand deux promotions visent le même. */
  function promoArticleCount(running) {
    const seen = new Set();
    const items = promoItems();
    running.forEach((p) => {
      items.forEach((it) => { if (PRM().matches(p, it, stockOf(it))) seen.add(it.id); });
    });
    return seen.size;
  }

  function promoCardHtml(p, now) {
    const pr = PRM();
    const st = pr.status(p, now);
    const n = promoCount(p);
    const tone = st === 'active' ? 'on' : st === 'ended' ? 'off' : 'wait';
    return `
      <article class="bq-pr-card is-${tone}">
        <div class="bq-pr-ribbon"><b>${esc(pr.badgeOf(p))}</b><span>${p.kind === 'fixed' ? 'prix fixe' : 'de remise'}</span></div>
        <div class="bq-pr-body">
          <div class="bq-pr-top">
            <h3>${esc(p.name)}</h3>
            <span class="bq-pr-state ${tone}">${st === 'active' ? 'En cours' : st === 'waiting' ? 'Hors créneau' : st === 'scheduled' ? 'Programmée' : st === 'paused' ? 'En pause' : 'Terminée'}</span>
          </div>
          <div class="bq-pr-meta">
            <span><i data-lucide="target"></i>${esc(promoScopeText(p))}</span>
            <span><i data-lucide="clock"></i>${esc(promoWhenText(p, now))}</span>
          </div>
          <div class="bq-pr-foot">
            <span class="bq-pr-n">${n} article${n > 1 ? 's' : ''} concerné${n > 1 ? 's' : ''}</span>
            <span class="bq-pr-acts">
              ${n ? `<button class="bqi-mini" data-pr-print="${esc(p.id)}" title="Imprimer les étiquettes de cette promotion"><i data-lucide="printer"></i></button>` : ''}
              ${st !== 'ended' ? `<button class="bqi-mini" data-pr-toggle="${esc(p.id)}" title="${p.paused ? 'Reprendre' : 'Mettre en pause'}"><i data-lucide="${p.paused ? 'play' : 'pause'}"></i></button>` : ''}
              <button class="bqi-mini" data-pr-edit="${esc(p.id)}" title="Modifier"><i data-lucide="pencil"></i></button>
              <button class="bqi-mini danger" data-pr-del="${esc(p.id)}" title="Supprimer"><i data-lucide="trash-2"></i></button>
            </span>
          </div>
        </div>
      </article>`;
  }

  /* L'écran vide APPREND la fonctionnalité au lieu de la décrire. Trois
     promotions réelles, prêtes en un geste, qui couvrent les trois raisons pour
     lesquelles une boutique baisse ses prix : écouler l'ancien, finir les
     séries, faire venir du monde. Le commerçant touche, ajuste, enregistre. */
  const PROMO_STARTERS = {
    destock: { name: 'Déstockage', kind: 'percent', value: 30, scope: { type: 'avant' }, months: 6,
               title: 'Déstocker l\'ancienne saison', desc: 'Tout ce qui est en stock depuis plus de six mois, −30 %' },
    finserie: { name: 'Fins de série', kind: 'percent', value: 20, scope: { type: 'stock', max: 5 },
               title: 'Écouler les fins de série', desc: 'Les articles où il reste 5 pièces ou moins, −20 %' },
    weekend: { name: 'Week-end', kind: 'percent', value: 10, scope: { type: 'tout' }, days: 2,
               title: 'Animer le week-end', desc: 'Tout le magasin, −10 %, jusqu\'à dimanche soir' },
  };
  function promoStarter(key) {
    const s = PROMO_STARTERS[key];
    if (!s) return null;
    const now = Date.now();
    const p = { name: s.name, kind: s.kind, value: s.value, scope: JSON.parse(JSON.stringify(s.scope)) };
    if (s.months) p.scope.before = startOfDay(new Date(now - s.months * 30 * PROMO_DAY));
    if (s.days) p.to = endOfDay(new Date(now + s.days * PROMO_DAY));
    return p;
  }
  function promoEmptyHtml() {
    return `
      <div class="bq-pr-zero">
        <div class="bq-pr-zero-head">
          <i data-lucide="tag"></i>
          <h2>Baissez vos prix une fois, la caisse s'en souvient</h2>
          <p>Une promotion s'applique toute seule aux articles que vous visez, pendant la durée que vous fixez.
             Les étiquettes, la grille de vente et le reçu de la cliente suivent sans un geste de plus.</p>
        </div>
        <div class="bq-pr-starters">
          ${Object.keys(PROMO_STARTERS).map((k) => `
            <button class="bq-pr-starter" data-pr-starter="${k}">
              <b>${esc(PROMO_STARTERS[k].title)}</b>
              <span>${esc(PROMO_STARTERS[k].desc)}</span>
              <i data-lucide="arrow-right"></i>
            </button>`).join('')}
        </div>
      </div>`;
  }

  /* ─── réimprimer le rayon d'une promotion ────────────────────────────────
   * Le geste qui manquait entre « je lance ma promotion » et « mes étiquettes
   * disent le bon prix ». labelForVariant() pose déjà le prix promo et l'ancien
   * barré (voir plus bas) ; ce qui manquait, c'était de pouvoir sortir d'un coup
   * les étiquettes des articles que CETTE promotion touche, sans rouvrir
   * l'inventaire produit par produit pour les retrouver à la main.
   *
   * Deux filtres, tous deux volontaires :
   *  · pas de code-barres → pas d'étiquette. On ne peut pas imprimer une
   *    étiquette scannable pour une déclinaison qui n'a pas de code.
   *  · stock à zéro → pas d'étiquette. Une étiquette de promotion sur une
   *    étagère vide ne sert à rien, et sur un magasin entier ça peut faire des
   *    dizaines de vignettes jetées.
   * Le total est ANNONCÉ avant impression : une promotion « tout le magasin »
   * peut représenter plusieurs centaines de vignettes, et on ne découvre pas ça
   * au bruit de l'imprimante. */
  function promoLabelPlan(id) {
    const pr = PRM(); const p = pr && pr.get(id);
    const cat = catDB();
    const out = { promo: p, labels: [], products: 0, skippedNoCode: 0, skippedEmpty: 0 };
    if (!p || !cat) return out;
    promoItems().forEach((item) => {
      if (!pr.matches(p, item, stockOf(item))) return;
      const d = cat.getProduct(item.id);
      if (!d) return;
      let taken = 0;
      d.variants.forEach((v) => {
        if (!(v.stock > 0)) { out.skippedEmpty++; return; }
        const l = labelForVariant(item.id, v);
        if (!l) { out.skippedNoCode++; return; }
        out.labels.push(l); taken++;
      });
      if (taken) out.products++;
    });
    return out;
  }

  function openPromoLabels(id) {
    const plan = promoLabelPlan(id);
    if (!plan.promo) return;
    const el = $('#bq-promomm', root);
    const n = plan.labels.length;
    const notes = [];
    if (plan.skippedEmpty) notes.push(`${plan.skippedEmpty} déclinaison${plan.skippedEmpty > 1 ? 's' : ''} épuisée${plan.skippedEmpty > 1 ? 's' : ''}, sans étiquette`);
    if (plan.skippedNoCode) notes.push(`${plan.skippedNoCode} sans code-barres, générez-en un depuis l'inventaire`);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Étiquettes · ${esc(plan.promo.name)}</h3>
      ${n ? `
        <p class="modal-subtle">Chaque étiquette portera le prix promotionnel, l'ancien prix barré à côté.
           Quand la promotion s'arrêtera, réimprimez pour revenir au prix plein.</p>
        <div class="bq-prl">
          <div class="bq-prl-n"><b>${n}</b><span>étiquette${n > 1 ? 's' : ''}</span></div>
          <div class="bq-prl-d">
            <span>${plan.products} article${plan.products > 1 ? 's' : ''} concerné${plan.products > 1 ? 's' : ''}</span>
            ${notes.map((t) => `<span class="note">${esc(t)}</span>`).join('')}
          </div>
        </div>
        ${n > 60 ? `<div class="bq-prc-warn"><i data-lucide="alert-triangle"></i>
          <span>C'est un gros tirage. Vérifiez le rouleau avant de lancer.</span></div>` : ''}
      ` : `
        <p class="modal-subtle">Aucune étiquette à imprimer pour cette promotion : les articles visés n'ont pas de
           code-barres, ou il n'en reste aucun en stock.${plan.skippedNoCode ? ' Générez leurs codes depuis l\'inventaire.' : ''}</p>`}
      <div class="bqi-modfoot">
        <button class="bq-btn secondary" data-bq-close>${n ? 'Annuler' : 'Fermer'}</button>
        ${n ? `<button class="bq-btn primary" id="bq-prl-go"><i data-lucide="printer"></i>Imprimer ${n} étiquette${n > 1 ? 's' : ''}</button>` : ''}
      </div>`;
    openVeil('#bq-promo-veil'); icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-promo-veil'); });
    const go = $('#bq-prl-go', el);
    if (go) go.onclick = () => {
      closeVeil('#bq-promo-veil');
      labelToast(window.KiwiBarcode.printLabels(plan.labels, { copies: 1 }), `${n} étiquette${n > 1 ? 's' : ''}`);
    };
  }

  function confirmPromoDelete(id) {
    const pr = PRM(); const p = pr.get(id); if (!p) return;
    const el = $('#bq-promomm', root);
    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">Supprimer « ${esc(p.name)} » ?</h3>
      <p class="modal-subtle">Les articles concernés repassent immédiatement au prix plein.
         Les ventes déjà encaissées gardent le prix payé · rien ne change dans le journal.</p>
      <div class="bqi-modfoot">
        <button class="bq-btn secondary" data-bq-close>Garder</button>
        <button class="bq-btn danger" id="bq-pr-delok"><i data-lucide="trash-2"></i>Supprimer</button>
      </div>`;
    openVeil('#bq-promo-veil'); icons();
    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-promo-veil'); });
    $('#bq-pr-delok', el).onclick = () => {
      pr.remove(id);
      closeVeil('#bq-promo-veil');
      toast(`${p.name} supprimée, prix pleins rétablis`);
      renderPromos(); renderGrid(); renderBadges(); icons();
    };
  }

  /* ─── le compositeur ─────────────────────────────────────────────────────
     Un seul écran, pas d'assistant en trois étapes : les trois décisions
     (combien, sur quoi, jusqu'à quand) se répondent l'une l'autre, et un
     assistant qui les sépare oblige à revenir en arrière pour comprendre ce
     qu'on vient de faire. L'aperçu se recalcule à chaque frappe. */
  const composer = { draft: null, editing: null };

  /* Les pourcentages autorisés dans les réglages, ou null quand rien n'est
     restreint. Un brouillon ne s'ouvre jamais sur une remise que la boutique
     refuse : sinon « Lancer » est grisé avant le premier geste. On prend le
     pourcentage autorisé le plus proche. */
  function allowedPercents() {
    const pol = window.KiwiDiscountPolicy;
    return pol && pol.configured(_bqKey) ? pol.percentages(_bqKey).slice().sort((a, b) => a - b) : null;
  }
  function fitPolicy(d) {
    const ok = allowedPercents();
    if (!ok || !ok.length || d.kind !== 'percent' || ok.includes(d.value)) return d;
    d.value = ok.reduce((best, v) => (Math.abs(v - d.value) < Math.abs(best - d.value) ? v : best), ok[0]);
    return d;
  }

  function openPromoComposer(seed) {
    const pr = PRM(); if (!pr) return;
    composer.editing = (seed && seed.id) ? seed.id : null;
    composer.draft = pr.normalize(seed || { name: '', kind: 'percent', value: 20, scope: { type: 'tout' } });
    composer.valueText = null;
    if (!composer.editing) fitPolicy(composer.draft);
    if (!seed) composer.draft.name = '';
    renderPromoComposer();
    openVeil('#bq-promo-veil');
    icons(); lens();
  }

  const PROMO_SCOPES = [
    { id: 'tout', label: 'Tout le magasin', icon: 'store' },
    { id: 'rayon', label: 'Un rayon', icon: 'layout-grid' },
    { id: 'produits', label: 'Des articles', icon: 'shirt' },
    { id: 'avant', label: 'Ancien stock', icon: 'calendar-clock' },
    { id: 'stock', label: 'Fin de série', icon: 'package-minus' },
  ];

  function promoDraftValid(d) {
    if (!d.value) return 'Choisissez de combien vous baissez le prix';
    if (d.kind === 'percent' && window.KiwiDiscountPolicy?.configured(_bqKey)
        && !window.KiwiDiscountPolicy.allowed(d.value, _bqKey)) return 'Vos réglages autorisent seulement ' + (allowedPercents() || []).map((v) => '−' + v + ' %').join(', ');
    const sc = d.scope || {};
    if ((sc.type === 'rayon' || sc.type === 'produits') && !(sc.ids || []).length) return 'Choisissez au moins un élément à viser';
    if (sc.type === 'avant' && !sc.before) return 'Choisissez la date avant laquelle les articles sont visés';
    if (sc.type === 'stock' && !sc.max) return 'Indiquez à partir de combien de pièces l\'article est visé';
    if (d.to && d.from && d.to <= d.from) return 'La date de fin doit venir après le début';
    return '';
  }

  const toInput = (ms) => { if (!ms) return ''; const d = new Date(ms); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };

  function renderPromoComposer() {
    const pr = PRM();
    const d = composer.draft;
    const el = $('#bq-promomm', root);
    const prev = pr.preview(d, promoItems(), { stockOf: (it) => stockOf(it) });
    const problem = promoDraftValid(d);
    const sc = d.scope || {};

    el.innerHTML = `
      <button class="bq-modal-x" data-bq-close aria-label="Fermer"><i data-lucide="x"></i></button>
      <h3 class="modal-title">${composer.editing ? 'Modifier la promotion' : 'Nouvelle promotion'}</h3>

      <div class="bq-prc">
        <div class="bq-prc-form">

          <div class="bq-f">
            <label class="bq-f-lbl" for="bq-prc-name">Nom <span class="opt">· ce que la cliente lira sur son reçu</span></label>
            <input class="bq-input" id="bq-prc-name" maxlength="80" placeholder="Soldes d'été, Déstockage caftans…" value="${esc(d.name)}" />
          </div>

          <div class="bq-f">
            <label class="bq-f-lbl" for="bq-prc-value">De combien</label>
            <div class="bq-seg" data-lens-demo id="bq-prc-kind">
              <button class="bq-seg-it ${d.kind === 'percent' ? 'on' : ''}" data-lens-item data-prk="percent">En pourcentage<small>−20 %</small></button>
              <button class="bq-seg-it ${d.kind === 'amount' ? 'on' : ''}" data-lens-item data-prk="amount">En dirhams<small>−50 MAD</small></button>
              <button class="bq-seg-it ${d.kind === 'fixed' ? 'on' : ''}" data-lens-item data-prk="fixed">Prix fixe<small>tout à 99</small></button>
            </div>
            <div class="bq-prc-val">
              <input class="bq-input" id="bq-prc-value" type="text" inputmode="decimal" autocomplete="off" value="${esc(composer.valueText != null ? composer.valueText : String(d.value))}" />
              <span class="unit">${d.kind === 'percent' ? '%' : 'MAD'}</span>
              <div class="bq-chips" id="bq-prc-quick">
                ${(d.kind === 'percent' ? (window.KiwiDiscountPolicy?.percentages(_bqKey, [10, 20, 30, 50]) || [10, 20, 30, 50]) : d.kind === 'amount' ? [20, 50, 100, 200] : [49, 99, 149, 199]).map((v) =>
                  `<button class="bq-chip ${d.value === v ? 'on' : ''}" data-prv="${v}">${d.kind === 'percent' ? `−${v} %` : d.kind === 'amount' ? `−${v}` : v}</button>`).join('')}
              </div>
            </div>
          </div>

          <div class="bq-f">
            <div class="bq-f-lbl">Sur quoi</div>
            <div class="bq-prc-scopes" id="bq-prc-scope">
              ${PROMO_SCOPES.map((s) => `
                <button class="bq-prc-scope ${sc.type === s.id ? 'on' : ''}" data-prs="${s.id}">
                  <i data-lucide="${s.icon}"></i><span>${esc(s.label)}</span>
                </button>`).join('')}
            </div>
            <div class="bq-prc-scopebody" id="bq-prc-scopebody">${promoScopeControl(d)}</div>
          </div>

          <div class="bq-f">
            <div class="bq-f-lbl">Jusqu'à quand</div>
            <div class="bq-chips" id="bq-prc-when">
              ${[
                { k: 'today', l: 'Aujourd\'hui' }, { k: 'we', l: 'Ce week-end' },
                { k: '7', l: '7 jours' }, { k: '30', l: '30 jours' }, { k: 'none', l: 'Sans fin' },
              ].map((o) => `<button class="bq-chip" data-prw="${o.k}">${o.l}</button>`).join('')}
            </div>
            <div class="bq-row-2 bq-prc-dates">
              <div class="bq-f">
                <div class="bq-f-lbl">Début <span class="opt">· vide = tout de suite</span></div>
                <input class="bq-input" id="bq-prc-from" type="date" value="${toInput(d.from)}" />
              </div>
              <div class="bq-f">
                <div class="bq-f-lbl">Fin <span class="opt">· vide = sans fin</span></div>
                <input class="bq-input" id="bq-prc-to" type="date" value="${toInput(d.to)}" />
              </div>
            </div>
          </div>
        </div>

        <aside class="bq-prc-prev">
          <div class="bq-prc-prev-head">
            <span class="lbl">Ce que ça touche</span>
            <b class="n">${prev.count}</b>
            <span class="u">article${prev.count > 1 ? 's' : ''}</span>
          </div>
          ${prev.count ? `
            <div class="bq-prc-swap">
              <div><span>Valeur au prix plein</span><b>${fmtMAD(prev.from)}</b></div>
              <i data-lucide="arrow-right"></i>
              <div class="next"><span>Au prix promo</span><b>${fmtMAD(prev.to)}</b></div>
            </div>
            <div class="bq-prc-give">Vous offrez <b>${fmtMAD(prev.from - prev.to)}</b> si tout part.</div>
            ${prev.under ? `
              <div class="bq-prc-warn"><i data-lucide="alert-triangle"></i>
                <span><b>${prev.under} article${prev.under > 1 ? 's passeraient' : ' passerait'} sous son prix d'achat.</b>
                Déstocker à perte est parfois le bon choix · mais autant le décider en le sachant.</span>
              </div>` : ''}
            <div class="bq-prc-sample">
              ${prev.sample.map((x) => `
                <div class="bq-prc-srow ${x.under ? 'is-under' : ''}">
                  <span class="nm">${esc(x.name)}</span>
                  <span class="pz"><s>${fmtMAD(shelf(x.was))}</s><b>${fmtMAD(shelf(x.price))}</b></span>
                </div>`).join('')}
              ${prev.count > prev.sample.length ? `<div class="bq-prc-more">et ${prev.count - prev.sample.length} autre${prev.count - prev.sample.length > 1 ? 's' : ''}…</div>` : ''}
            </div>` : `
            <div class="bq-prc-none"><i data-lucide="search-x"></i>
              <span>${esc(problem || 'Aucun article ne correspond à cette cible.')}</span>
            </div>`}
        </aside>
      </div>

      <div class="bqi-modfoot bq-prc-foot">
        ${problem ? `<span class="bq-prc-block"><i data-lucide="info"></i>${esc(problem)}</span>` : '<span></span>'}
        <span class="acts">
          <button class="bq-btn secondary" data-bq-close>Annuler</button>
          <button class="bq-btn primary" id="bq-prc-save" ${problem || !prev.count ? 'disabled' : ''}>
            <i data-lucide="check"></i>${composer.editing ? 'Enregistrer' : 'Lancer la promotion'}
          </button>
        </span>
      </div>`;

    icons(); lens();
    wirePromoComposer(el);
  }

  function promoScopeControl(d) {
    const sc = d.scope || {};
    if (sc.type === 'tout') return '<div class="bq-prc-hint">Chaque article du magasin, sans exception.</div>';
    if (sc.type === 'rayon') {
      return `<div class="bq-chips wrap" id="bq-prc-rayons">
        ${RAYONS.map((r) => `<button class="bq-chip ${(sc.ids || []).indexOf(r.id) >= 0 ? 'on' : ''}" data-prr="${esc(r.id)}">${esc(r.label)}<small>${r.items.length}</small></button>`).join('')}
      </div>`;
    }
    if (sc.type === 'produits') {
      const ids = sc.ids || [];
      return `
        <div class="bqx-scanbox slim"><i data-lucide="search"></i>
          <input id="bq-prc-q" placeholder="Chercher un article, ou scanner son code-barres…" autocomplete="off" />
        </div>
        <div class="bq-prc-picked" id="bq-prc-picked">
          ${ids.length ? ids.map((id) => { const it = P[id]; return `<button class="bq-chip on" data-prp="${esc(id)}">${esc(it ? it.name : id)} <i data-lucide="x"></i></button>`; }).join('')
            : '<span class="bq-prc-hint">Aucun article choisi pour l\'instant.</span>'}
        </div>
        <div class="bq-prc-hits" id="bq-prc-hits"></div>`;
    }
    if (sc.type === 'avant') {
      /* Les raccourcis d'abord : « plus de six mois » est la phrase que le
         commerçant a en tête, pas une date de calendrier qu'il devra calculer. */
      return `
        <div class="bq-chips" id="bq-prc-age">
          ${[{ m: 3, l: 'Plus de 3 mois' }, { m: 6, l: 'Plus de 6 mois' }, { m: 12, l: 'Plus d\'un an' }].map((o) =>
            `<button class="bq-chip" data-pra="${o.m}">${o.l}</button>`).join('')}
        </div>
        <input class="bq-input" id="bq-prc-before" type="date" value="${toInput(sc.before)}" />
        <div class="bq-prc-hint">Vise les articles entrés dans l'inventaire avant cette date. Un arrivage postérieur n'est jamais remisé, même s'il porte le même nom.</div>`;
    }
    if (sc.type === 'stock') {
      return `
        <div class="bq-chips" id="bq-prc-max">
          ${[2, 3, 5, 10].map((n) => `<button class="bq-chip ${sc.max === n ? 'on' : ''}" data-prm="${n}">${n} ou moins</button>`).join('')}
        </div>
        <input class="bq-input" id="bq-prc-maxn" type="number" min="1" value="${sc.max || ''}" placeholder="ou un seuil à vous" />
        <div class="bq-prc-hint">La cible se recalcule toute seule : un article qui repasse au-dessus du seuil après un réassort sort de la promotion, un autre qui descend y entre.</div>`;
    }
    return '';
  }

  function promoValueOf(text) {
    const n = Number(String(text || '').replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (c) => String(c.charCodeAt(0) & 15))
      .replace(/[\s\u202f\u00a0]/g, '').replace(/[,\u066b]/, '.'));
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0;
  }

  function wirePromoComposer(el) {
    const pr = PRM();
    const d = composer.draft;
    const redraw = () => renderPromoComposer();
    /* Le nom se saisit SANS redessiner : un re-rendu à chaque touche vole le
       curseur au milieu du mot. Il ne change aucun prix, il n'a rien à repeindre. */
    const nameEl = $('#bq-prc-name', el);
    if (nameEl) nameEl.oninput = () => { d.name = nameEl.value; const b = $('#bq-prc-save', el); if (b) b.disabled = !!promoDraftValid(d) || !pr.preview(d, promoItems(), { stockOf: (it) => stockOf(it) }).count; };

    $$('[data-prk]', el).forEach((b) => b.onclick = () => { d.kind = b.dataset.prk; composer.valueText = null; fitPolicy(d); redraw(); });
    /* Kept to the centime like the engine (49,90 MAD stays 49,90), and the
       field keeps its cursor: the preview repaints, the typing goes on. */
    const val = $('#bq-prc-value', el);
    if (val) val.oninput = () => {
      composer.valueText = val.value;
      d.value = promoValueOf(val.value);
      const at = val.selectionStart;
      redraw();
      const again = document.getElementById('bq-prc-value');
      if (again) { again.focus(); try { again.setSelectionRange(at, at); } catch (_) {} }
    };
    $$('[data-prv]', el).forEach((b) => b.onclick = () => { d.value = +b.dataset.prv; composer.valueText = null; redraw(); });
    $$('[data-prs]', el).forEach((b) => b.onclick = () => { d.scope = pr.normalize({ scope: { type: b.dataset.prs } }).scope; redraw(); });

    $$('[data-prr]', el).forEach((b) => b.onclick = () => {
      const ids = d.scope.ids || (d.scope.ids = []);
      const i = ids.indexOf(b.dataset.prr);
      if (i >= 0) ids.splice(i, 1); else ids.push(b.dataset.prr);
      redraw();
    });
    $$('[data-prp]', el).forEach((b) => b.onclick = () => {
      const ids = d.scope.ids || [];
      const i = ids.indexOf(b.dataset.prp);
      if (i >= 0) ids.splice(i, 1);
      redraw();
    });
    const q = $('#bq-prc-q', el);
    if (q) {
      const hits = $('#bq-prc-hits', el);
      const paint = () => {
        const term = q.value.trim().toLowerCase();
        if (!term) { hits.innerHTML = ''; return; }
        /* Un code-barres scanné dans ce champ désigne un article précis : on
           passe par la base, pas par le nom, sinon la douchette ne sert à rien ici. */
        const byCode = BY_EAN[q.value.trim()];
        const found = byCode ? [P[byCode]].filter(Boolean)
          : promoItems().filter((it) => it.name.toLowerCase().indexOf(term) >= 0).slice(0, 8);
        hits.innerHTML = found.map((it) => `<button class="bq-prc-hit" data-prpick="${esc(it.id)}">
            <span>${esc(it.name)}</span><b>${fmtMAD(shelf(it.price))}</b></button>`).join('')
          || '<div class="bq-prc-hint">Aucun article ne porte ce nom.</div>';
        $$('[data-prpick]', hits).forEach((b) => b.onclick = () => {
          const ids = d.scope.ids || (d.scope.ids = []);
          if (ids.indexOf(b.dataset.prpick) < 0) ids.push(b.dataset.prpick);
          redraw();
        });
      };
      q.oninput = paint;
      q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); paint(); } };
    }
    $$('[data-pra]', el).forEach((b) => b.onclick = () => { d.scope.before = startOfDay(new Date(Date.now() - (+b.dataset.pra) * 30 * PROMO_DAY)); redraw(); });
    const before = $('#bq-prc-before', el);
    if (before) before.onchange = () => { d.scope.before = before.value ? startOfDay(new Date(before.value + 'T12:00:00')) : 0; redraw(); };
    $$('[data-prm]', el).forEach((b) => b.onclick = () => { d.scope.max = +b.dataset.prm; redraw(); });
    const maxn = $('#bq-prc-maxn', el);
    if (maxn) maxn.oninput = () => { d.scope.max = Math.max(0, Math.round(+maxn.value || 0)); redraw(); };

    $$('[data-prw]', el).forEach((b) => b.onclick = () => {
      const k = b.dataset.prw, now = new Date();
      if (k === 'none') { d.to = 0; }
      else if (k === 'today') { d.to = endOfDay(now); }
      else if (k === 'we') {
        /* « Ce week-end » = jusqu'à dimanche soir. Un dimanche, c'est ce soir —
           pas dans sept jours : le commerçant qui pose sa promotion le dimanche
           matin veut qu'elle finisse le soir même. */
        const toSunday = (7 - now.getDay()) % 7;
        d.to = endOfDay(new Date(now.getTime() + toSunday * PROMO_DAY));
      } else { d.to = endOfDay(new Date(now.getTime() + (+k) * PROMO_DAY)); }
      redraw();
    });
    const from = $('#bq-prc-from', el);
    if (from) from.onchange = () => { d.from = from.value ? startOfDay(new Date(from.value + 'T12:00:00')) : 0; redraw(); };
    const to = $('#bq-prc-to', el);
    if (to) to.onchange = () => { d.to = to.value ? endOfDay(new Date(to.value + 'T12:00:00')) : 0; redraw(); };

    $$('[data-bq-close]', el).forEach((b) => { b.onclick = () => closeVeil('#bq-promo-veil'); });
    const save = $('#bq-prc-save', el);
    if (save) save.onclick = () => {
      if (promoDraftValid(d)) return;
      if (!d.name.trim()) d.name = promoAutoName(d);
      if (composer.editing) d.id = composer.editing;
      pr.save(d);
      closeVeil('#bq-promo-veil');
      toast(composer.editing ? `${d.name} enregistrée` : `${d.name} lancée, les prix sont à jour`);
      renderPromos(); renderGrid(); renderBadges(); icons(); lens();
    };
  }

  /* Un nom laissé vide ne doit pas produire « Promotion » sur le reçu de la
     cliente : on écrit ce que la promotion FAIT, c'est plus utile qu'un blanc. */
  function promoAutoName(d) {
    const sc = d.scope || {};
    if (sc.type === 'avant') return 'Déstockage';
    if (sc.type === 'stock') return 'Fins de série';
    if (sc.type === 'rayon') return promoScopeText(d);
    if (sc.type === 'produits') return 'Sélection';
    return d.kind === 'percent' ? `Tout le magasin −${d.value} %` : 'Promotion';
  }

  /* ─── the inventory panel ─── */
  /* « Gestion complète de l’inventaire sur la caisse » (console opérateur,
   * caisseInventoryAdmin) : éteint, articles et prix se gèrent au tableau de bord
   * (le verrou d'août) ; allumé, l'équipe crée, modifie et supprime ici, comme à
   * la caisse Maison. Le serveur (/api/catalog) accepte déjà la caisse appairée. */
  function catalogDashboardOnly() {
    if (typeof toast === 'function') toast(tillInventoryRefusal());
  }
  /* [[pid, stock]] des articles du rayonnage, pour la pastille (inv-tools.js). */
  const invStockList = () => Object.keys(P).filter((k) => P[k] && P[k].id === k).map((k) => [k, stockOf(P[k])]);
  const invUnseen = () => invUnseenCount(_bqKey, invStockList());

  function renderInventaire() {
    const cat = catDB();
    const panel = $('[data-bq-panel="inventaire"]', root);
    if (!cat) { panel.innerHTML = '<div class="bq-empty" style="margin:40px;">Base d\'inventaire indisponible.</div>'; return; }
    const st = cat.stats();
    const cats = cat.listCategories();
    const filter = state.invFilter || 'all';
    const products = cat.listProducts({ categoryId: filter, q: state.invQuery || '' });
    invPaint(panel, `
      <div class="bqi">
        <header class="bq-head" style="padding:22px 22px 0;">
          <div><h1>Inventaire</h1><div class="bq-head-sub">Douchette + imprimante étiquettes · ${st.products} ${st.products > 1 ? 'produits' : 'produit'} · ${st.variants} ${st.variants > 1 ? 'variantes' : 'variante'}, base partagée avec le dashboard</div></div>
          <!-- Dans l'en-tête, pas dans .bqi-tools : invPaint garde cette rangée d'une peinture à l'autre (le champ de
               recherche ne perd pas le curseur), et les réglages de l'établissement arrivent parfois après la première. -->
          ${tillInventoryAllowed() ? '<button class="bq-btn" id="bqi-new"><i data-icon="add"></i>Nouvel article</button>' : '<span class="bqi-dashboard-only">Articles et prix se gèrent dans le tableau de bord</span>'}
        </header>
        <div class="bqi-tools">
          <div class="bqi-scan"><i data-lucide="scan-line"></i><input id="bqi-scan" placeholder="Scannez un article, ou tapez un code…" autocomplete="off" /></div>
          <button class="bq-btn primary" id="bqi-count" style="background:var(--atlas,#0B6E4F);border-color:var(--riad,#053B2C);"><i data-lucide="clipboard-check"></i>Inventaire physique</button>
          <button class="bq-btn" id="bqi-moves"><i data-icon="history"></i>Mouvements de stock</button>
          <button class="bq-btn" id="bqi-intake"><i data-lucide="scan-barcode"></i>Reprendre le stock</button>
        </div>
        <div class="bqi-pills" id="bqi-pills">
          <button class="bqi-pill ${filter === 'all' ? 'on' : ''}" data-f="all">Tous · ${st.products}</button>
          ${cats.map((c) => `<button class="bqi-pill ${filter === c.id ? 'on' : ''}" data-f="${c.id}">${esc(c.name)} · ${cat.categoryCount(c.id)}</button>`).join('')}
        </div>
        <div class="bqi-kpis">
          <!-- Pas de valeur de stock à la caisse (propriétaire, 2026-10-28) : elle est au
               tableau de bord, l'équipe n'en a pas l'usage. Trois cases, une chose chacune. -->
          <div class="bqi-kpi"><span class="l">Pièces en stock</span><span class="v">${st.totalStock}</span></div>
          <div class="bqi-kpi ${st.low ? 'warn' : ''}"><span class="l">Stock bas</span><span class="v">${st.low}</span></div>
          <div class="bqi-kpi ${st.ruptures ? 'warn' : ''}"><span class="l">Rupture de stock</span><span class="v">${st.ruptures}</span></div>
        </div>
        <div class="bqi-list">
          ${products.length ? products.map((p) => invRow(p)).join('') : `<div class="bq-empty bqi-first">
              <i data-lucide="scan-barcode"></i>
              <b>Votre stock porte déjà des codes-barres ?</b>
              <span>Touchez « Reprendre le stock » et scannez vos articles un par un : Kiwi garde le code du fournisseur tel quel. Aucune étiquette à réimprimer.</span>
              ${tillInventoryAllowed() ? '' : '<em>Pour créer un article ou modifier un prix, ouvrez le tableau de bord. Ici, vous pouvez reprendre le stock et les codes existants.</em>'}
            </div>`}
        </div>
      </div>`);
    const scan = $('#bqi-scan', panel);
    if (scan) scan.onkeydown = (e) => { if (e.key === 'Enter') { const v = scan.value.trim(); scan.value = ''; if (v) invScanHandle(v); } };
    invSearch($('.bqi-scan', panel), scan, bqKitSkin(), { code: (c) => invScanHandle(c), open: (pid) => openInvProduct(pid), money: fmtMAD, esc, icons, artOf,
      catalog: () => ({ P, BY_EAN, promoFor, shelf, stockOf, availableStock: variantStock, colorLabel }) });
    invCountAsks(panel, { real: pvReal(), merchant: _bqKey, esc, recount: (o) => window.KiwiPosInventoryCount?.open?.({ engine: 'boutique', ...o }) });   // inventaire renvoyé par le propriétaire
    /* L'Inventaire est à l'écran : ses alertes sont vues, la pastille s'éteint. */
    if (state.view === 'inventaire') { invMarkSeen(_bqKey, invStockList()); renderBadges(); }
    const cb = $('#bqi-count', panel); if (cb) cb.onclick = () => window.KiwiPosInventoryCount?.open?.({ engine: 'boutique' });
    const ib = $('#bqi-intake', panel); if (ib) ib.onclick = () => openIntake();
    const nb = $('#bqi-new', panel); if (nb) nb.onclick = () => openNewProduct();
    const mv = $('#bqi-moves', panel); if (mv) mv.onclick = () => openMoves({ setModal: invSetModal, esc, icons, catDB, toast });   // en lecture (inv-moves.js)
    const pills = $('#bqi-pills', panel);
    if (pills) pills.addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (b) { state.invFilter = b.dataset.f; renderInventaire(); } });
    panel.querySelectorAll('[data-inv-open]').forEach((el) => el.addEventListener('click', () => openInvProduct(el.getAttribute('data-inv-open'))));
    panel.querySelectorAll('[data-inv-print]').forEach((el) => el.addEventListener('click', (e) => { e.stopPropagation(); printProductLabels(el.getAttribute('data-inv-print')); }));
    icons();
  }

  function invRow(p) {
    const cat = catDB();
    const d = cat.getProduct(p.id);
    const nBc = d.variants.reduce((s, v) => s + ((v.barcodes && v.barcodes.length) ? 1 : 0), 0);
    const cls = d.stock === 0 ? 'rupture' : (d.stock <= 5 ? 'bas' : '');
    return `<div class="bqi-row" data-inv-open="${p.id}">
      <span class="bqi-art">${artOf(p)}</span>
      <span class="bqi-info"><b>${esc(p.name)}</b><span>${d.category ? esc(d.category.name) : 'Divers'} · ${d.colors.length ? `${d.colors.length} coul. · ` : ''}${d.sizes.length} taille${d.sizes.length > 1 ? 's' : ''} · ${nBc}/${d.variants.length} codes-barres</span></span>
      <span class="bqi-stock ${cls}">${d.stock}</span>
      <span class="bqi-price">${fmtMAD(p.priceMAD)}</span>
      <button class="bqi-mini" data-inv-print="${p.id}" title="Imprimer toutes les étiquettes"><i data-lucide="printer"></i></button>
    </div>`;
  }

  /* ─── single-veil modal host (content-swapping keeps it simple) ─── */
  function invSetModal(html, wire) {
    const el = $('#bq-invmm', root);
    if (!el) return;
    /* Chaque écran repart d'une douchette NON captée : c'est celui qui s'affiche
     * qui la réclame, dans son wire(). Sans ce reset, l'écran quitté garderait la
     * main et la douchette écrirait dans un formulaire qui n'existe plus — plus
     * aucun scan n'atteindrait jamais le ticket. */
    disarmScanCapture();
    el.style.width = '';   // seul l'écran des mouvements s'élargit ; les autres gardent la largeur livrée
    el.innerHTML = html;
    if (!$('#bq-inv-veil', root).classList.contains('is-open')) openVeil('#bq-inv-veil');
    el.querySelectorAll('[data-inv-x]').forEach((b) => b.addEventListener('click', () => {
      closeVeil('#bq-inv-veil');
      disarmScanCapture();
      intake.open = false;
    }));
    if (wire) wire(el);
    icons();
    lens();
  }

  /* La langue de la caisse, pour l'écran des tailles (boutique-sizes.js). */
  const szLang = () => { try { const l = globalThis.window?.KiwiCaisseLang?.get?.(); return l === 'en' || l === 'ar' ? l : 'fr'; } catch (_) { return 'fr'; } };
  const invSub = (d) => `${d.category ? esc(d.category.name) : 'Divers'} · ${fmtMAD(d.product.priceMAD)} · ${d.stock} en stock`;

  /* La fiche d'un produit : ses tailles, leur stock, leur code-barres, et une
     case par taille pour ajouter les pièces reçues. `target` = la quantité
     totale annoncée à la création ; les tailles doivent y arriver. */
  function openInvProduct(pid, target) {
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const p = d.product;
    const admin = tillInventoryAllowed();
    const movements = (window.KiwiMaisonStock?.list?.({ productId: pid, module: 'boutique', shared: true }) || []).slice(0, 8);   // les lignes BOUTIQUE que le tableau de bord voit aussi
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh">
        <span class="bqi-art">${artOf(p)}</span>
        <div><h3>${esc(p.name)}</h3><span data-bqi-sub>${invSub(d)}</span></div>
        ${admin ? `<button class="bq-btn secondary" data-inv-edit><i data-icon="edit"></i>Modifier</button>` : '<span class="bqi-dashboard-only">Modifier dans le tableau de bord</span>'}
      </div>
      <div class="bqi-sizes" data-bqi-sizes style="padding:4px 20px 16px;"></div>
      ${movements.length ? `<div class="bqi-movements" style="padding:12px 20px;">
        <b>Mouvements de stock</b>
        ${movements.map(m => `<div class="bqi-movement" style="display:flex;gap:10px;justify-content:space-between;padding:6px 0;border-bottom:1px solid var(--n-100);">
          <span>${esc(m.typeLabel)} · ${esc(m.variant)}</span><span>Ticket ${esc(m.ref || '·')}</span><strong>${m.qty > 0 ? '+' : ''}${m.qty}</strong>
        </div>`).join('')}
      </div>` : ''}
      <div class="bqi-modfoot">
        <button class="bq-btn secondary" data-inv-x>Fermer</button>
        ${admin ? '<button class="bq-btn danger" data-inv-delete><i data-icon="delete"></i>Supprimer</button>' : ''}
      </div>`;
    invSetModal(html, (el) => {
      const cat2 = catDB();
      const edit = $('[data-inv-edit]', el); if (edit) edit.addEventListener('click', () => openEditProduct(pid));
      const del = $('[data-inv-delete]', el); if (del) del.addEventListener('click', () => confirmDeleteProduct(pid));
      SZ.mount($('[data-bqi-sizes]', el), {
        cat: cat2, pid, lang: szLang(), target: admin ? target : 0, readOnly: !admin,
        barcodeSvg: (code) => window.KiwiBarcode.svg(code, { height: 20, module: 1, showText: false }),
        primary: (v) => cat2.primaryBarcode(v),
        label: (id, v) => labelForVariant(id, v),
        print: (labels) => labelToast(window.KiwiBarcode.printLabels(labels, { copies: 1 }), `${labels.length} étiquette(s)`),
        register: (vid) => openRegisterOnVariant(vid, pid),
        remove: admin ? (vid) => confirmDeleteVariant(vid, pid) : null,
        toast: (title, desc) => toast(title, 3200, 'success', desc),
        onSaved: () => {
          const now = catDB().getProduct(pid);
          const sub = $('[data-bqi-sub]', el); if (now && sub) sub.innerHTML = invSub(now);
        },
      });
    });
  }

  /* ─── new product ─── */
  function catSelectOptions(sel) {
    const cats = catDB().listCategories();
    return `<option value="">Sans catégorie</option>` + cats.map((c) => `<option value="${c.id}" ${c.id === sel ? 'selected' : ''}>${esc(c.name)}</option>`).join('');
  }
  function kindSelectOptions(sel) {
    return [['taille', 'Vêtement (S–XL)'], ['pointure', 'Chaussure (pointures)'], ['tu', 'Taille unique']]
      .map(([v, l]) => `<option value="${v}" ${v === sel ? 'selected' : ''}>${l}</option>`).join('');
  }
  /* Le formulaire de création : le même que celui du tableau de bord (Article,
     Prix, Stock et la photo de la caisse à droite). Après « Créer le produit »,
     la même fenêtre passe aux tailles. */
  function openNewProduct() {
    if (!tillInventoryAllowed()) { catalogDashboardOnly(); return; }
    const lang = szLang();
    const f = SZ.formWords(lang);
    const catSel = state.invFilter && state.invFilter !== 'all' ? state.invFilter : '';
    const kinds = ['taille', 'pointure', 'tu'].map((k) => `<label class="bqx-pf-choice"><input type="radio" name="bqx-pf-kind" value="${k}"${k === 'taille' ? ' checked' : ''} />
      <b>${esc(f.kinds[k][0])}</b><small>${esc(f.kinds[k][1])}</small></label>`).join('');
    const cats = catDB().listCategories();
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>${esc(f.title)}</h3><span>${esc(f.desc)}</span></div></div>
      <div class="kbs-form"><div class="bqx-pf" data-bqx-pf>
        <div class="bqx-pf-main">
          <section class="bqx-pf-sec">
            <h4>${esc(f.secItem)}</h4>
            <label class="bqx-pf-f">
              <span class="bqx-pf-l">${esc(f.name)}</span>
              <input class="bqx-pf-in" maxlength="120" autocomplete="off" placeholder="${esc(f.ph)}" data-bqx-name aria-describedby="bqi-n-e-name" />
              <span class="bqx-pf-err" id="bqi-n-e-name" data-bqi-err="name" hidden>${esc(f.nameErr)}</span>
            </label>
            <label class="bqx-pf-f">
              <span class="bqx-pf-l">${esc(f.cat)}</span>
              <select class="bqx-pf-in" data-bqx-cat><option value="">${esc(f.catNone)}</option>${cats.map((c) => `<option value="${esc(c.id)}"${c.id === catSel ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>
              <span class="bqx-pf-hint">${esc(f.catHint)}</span>
            </label>
            <div class="bqx-pf-f">
              <span class="bqx-pf-l" id="bqi-n-kind-l">${esc(f.kind)}</span>
              <div class="bqx-pf-choices" role="radiogroup" aria-labelledby="bqi-n-kind-l">${kinds}</div>
            </div>
          </section>
          <section class="bqx-pf-sec">
            <h4>${esc(f.secPrice)}</h4>
            <div class="bqx-pf-grid">
              <label class="bqx-pf-f">
                <span class="bqx-pf-l">${esc(f.price)}</span>
                <span class="bqx-pf-money"><input class="bqx-pf-in" inputmode="decimal" autocomplete="off" placeholder="1890" data-bqi-price aria-describedby="bqi-n-e-price" /><span class="bqx-pf-unit" aria-hidden="true">MAD</span></span>
                <span class="bqx-pf-err" id="bqi-n-e-price" data-bqi-err="price" hidden>${esc(f.priceErr)}</span>
              </label>
              <label class="bqx-pf-f">
                <span class="bqx-pf-l">${esc(f.cost)}<span class="bqx-pf-tag">${esc(f.optional)}</span></span>
                <span class="bqx-pf-money"><input class="bqx-pf-in" inputmode="decimal" autocomplete="off" data-bqi-cost /><span class="bqx-pf-unit" aria-hidden="true">MAD</span></span>
              </label>
            </div>
          </section>
          ${SZ.totalFieldHtml(lang, 'taille')}
        </div>
        <aside class="bqx-pf-side">
          <div class="bqx-pf-card"><div class="bqx-pf-pn is-empty" data-bqi-pn>${esc(f.name)}</div><div class="bqx-pf-pm" data-bqi-pm>${esc(f.catNone)}</div><div class="bqx-pf-pp" data-bqi-pp hidden></div></div>
        </aside>
      </div></div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-x>${esc(f.cancel)}</button><button class="bq-btn" id="bqi-n-save">${esc(f.create)}</button></div>`;
    invSetModal(html, (el) => {
      const cat = catDB();
      SZ.formCss();
      el.style.width = 'min(860px, 96vw)';
      const q = (sel) => el.querySelector(sel);
      const nameIn = q('[data-bqx-name]'), catIn = q('[data-bqx-cat]'), priceIn = q('[data-bqi-price]'), costIn = q('[data-bqi-cost]');
      const mark = (key, on) => {
        const err = q(`[data-bqi-err="${key}"]`); if (err) err.hidden = !on;
        const inp = key === 'name' ? nameIn : priceIn; inp.setAttribute('aria-invalid', on ? 'true' : 'false');
      };
      const paint = () => {
        const name = nameIn.value.trim();
        const pn = q('[data-bqi-pn]'); pn.textContent = name || f.name; pn.classList.toggle('is-empty', !name);
        const c = catIn.value ? cats.find((x) => x.id === catIn.value) : null;
        q('[data-bqi-pm]').textContent = c ? c.name : f.catNone;
        const pr = bqMoney(priceIn.value); const pp = q('[data-bqi-pp]');
        pp.hidden = !(pr > 0); pp.innerHTML = pr > 0 ? `${esc(fmtNum(pr))} <small>MAD</small>` : '';
      };
      nameIn.addEventListener('input', () => { mark('name', false); paint(); });
      priceIn.addEventListener('input', () => { mark('price', false); paint(); });
      catIn.addEventListener('change', paint);
      SZ.wireTotal(el, lang);
      /* La photo de la caisse, choisie comme au tableau de bord. */
      import('../retail-icon-picker.js?v=4').then((m) => m.mountTillPhoto(el, null, { lang, trade: 'boutique', media: () => false })).catch(() => {});

      const save = () => {
        const name = nameIn.value.trim();
        const price = bqMoney(priceIn.value);
        const total = SZ.readTotal(el);
        mark('name', !name);
        mark('price', !(price > 0));
        if (!name || !(price > 0) || total == null) {
          const bad = el.querySelector('.kbs-form [aria-invalid="true"]');
          if (bad) bad.focus();
          return;
        }
        const kind = (q('input[name="bqx-pf-kind"]:checked') || {}).value || 'taille';
        const ph = el.__kiwiTillPhoto || {};
        const made = SZ.createProduct(cat, {
          name, categoryId: catIn.value || null, kind, art: ph.art || '', artPicked: !!ph.artPicked,
          priceMAD: price, cost: bqMoney(costIn.value),
        }, total);
        if (!made.product) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Création impossible')); return; }
        disarmScanCapture();
        toast(`${name} ajouté à l'inventaire`, 3200, 'success', made.needsGrid ? 'Répartissez maintenant les pièces par taille.' : `${total} pièce${total > 1 ? 's' : ''} · code-barres créé`);
        openInvProduct(made.product.id, made.needsGrid ? total : 0);
      };
      $('#bqi-n-save', el).addEventListener('click', save);
      el.querySelector('.kbs-form').addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' || e.isComposing || !e.target.matches('input.bqx-pf-in')) return;
        e.preventDefault(); save();
      });
      paint();
      setTimeout(() => nameIn.focus(), 40);
    });
  }

  function openEditProduct(pid) {
    if (!tillInventoryAllowed()) { catalogDashboardOnly(); return; }
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return; const p = d.product;
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Modifier le produit</h3><span>${esc(p.name)}</span></div></div>
      <div class="bqi-form">
        <div class="bqi-fg"><label>Nom</label><input id="bqi-e-name" value="${esc(p.name)}" /></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Catégorie</label><select id="bqi-e-cat">${catSelectOptions(p.categoryId)}</select></div>
          <div class="bqi-fg"><label>Type</label><select id="bqi-e-kind">${kindSelectOptions(p.kind)}</select></div>
        </div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Prix de vente (MAD)</label><input id="bqi-e-price" type="number" min="0" value="${p.priceMAD}" /></div>
          <div class="bqi-fg"><label>Coût d'achat (MAD)</label><input id="bqi-e-cost" type="number" min="0" value="${p.cost || 0}" /></div>
        </div>
        <div class="bqi-fg"><label>Icône du produit</label>${iconPickerHtml(p.art || 'tshirt')}</div>
      </div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-back>Retour</button><button class="bq-btn" id="bqi-e-save">Enregistrer</button></div>`;
    invSetModal(html, (el) => {
      let icon = p.art || 'tshirt';
      wireIconPicker(el, (k) => { icon = k; });
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#bqi-e-save', el).addEventListener('click', () => {
        cat.updateProduct(pid, { name: $('#bqi-e-name', el).value.trim() || undefined, categoryId: $('#bqi-e-cat', el).value || null, kind: $('#bqi-e-kind', el).value, art: icon, priceMAD: bqMoney($('#bqi-e-price', el).value), cost: bqMoney($('#bqi-e-cost', el).value) });
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Produit mis à jour'));
        openInvProduct(pid);
      });
    });
  }

  function confirmDeleteProduct(pid) {
    if (!tillInventoryAllowed()) { catalogDashboardOnly(); return; }
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Supprimer « ${esc(d.product.name)} » ?</h3><span>${d.variants.length} ${d.variants.length > 1 ? 'variantes et leurs codes-barres seront supprimés' : 'variante et son code-barres sera supprimée'}.</span></div></div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-back>Annuler</button><button class="bq-btn danger" id="bqi-del-ok"><i data-lucide="trash-2"></i>Supprimer définitivement</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#bqi-del-ok', el).addEventListener('click', () => { cat.deleteProduct(pid); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Produit supprimé')); closeVeil('#bq-inv-veil'); renderInventaire(); });
    });
  }

  /* Supprimer une DÉCLINAISON demande la même confirmation que supprimer le
     produit. La corbeille de la ligne partait sur un seul appui, sans retour
     possible : le stock compté, le code-barres imprimé sur les étiquettes du
     rayon et l'historique de mouvements de cette déclinaison disparaissaient
     ensemble, et la ligne d'à côté est le bouton « −1 ». On nomme ce qui part. */
  function confirmDeleteVariant(vid, pid) {
    if (!tillInventoryAllowed()) { catalogDashboardOnly(); return; }
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const v = d.variants.find((x) => x.id === vid); if (!v) return;
    const codes = (v.barcodes || []).length;
    const perte = [
      v.stock > 0 ? `${v.stock} en stock` : 'aucun stock',
      codes ? `${codes} code${codes > 1 ? 's' : ''}-barres` : 'aucun code-barres',
    ].join(' · ');
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Supprimer ${esc(variantColor(v).label)} · ${esc(v.size)} ?</h3><span>${esc(d.product.name)} · ${perte}. La suppression est définitive.</span></div></div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-back>Annuler</button><button class="bq-btn danger" id="bqi-vdel-ok"><i data-lucide="trash-2"></i>Supprimer la variante</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#bqi-vdel-ok', el).addEventListener('click', () => { cat.deleteVariant(vid); toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Variante supprimée')); openInvProduct(pid); });
    });
  }

  /* ─── add variant (colour × size × stock + optional EAN-13) ───
     Le sélecteur est celui du tableau de bord, en taille tactile : mêmes
     pastilles, même état sélectionné, même comportement clavier. */
  function colorPicker(sel) {
    const k = KC();
    if (!k) return '';
    return k.picker('variant-color', sel || 'noir', {
      size: 'lg', optional: true, label: 'Couleur',
      hint: 'Touchez une pastille pour lire son nom',
    });
  }

  /* Changer la couleur d'une variante existante. La variante garde son stock,
     ses codes-barres et son identité : seule la famille affichée change. */
  function openVariantColor(vid, pid) {
    if (!tillInventoryAllowed()) { catalogDashboardOnly(); return; }
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const v = d.variants.find((x) => x.id === vid); if (!v) return;
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Couleur de la variante</h3><span>${esc(d.product.name)} · taille ${esc(v.size)}${v.colorSource ? ` · saisie à l'origine « ${esc(v.colorSource)} »` : ''}</span></div></div>
      <div class="bqi-form">
        <div class="bqi-fg"><label>Couleur</label>${colorPicker(variantColor(v))}</div>
        <div class="bqi-fg"><label>Précision (facultatif)</label><input id="bqi-vc-note" maxlength="60" value="${esc(v.note || '')}" placeholder="Ex. rayé, délavé, motif · pour distinguer deux variantes de même couleur" /></div>
      </div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-back>Retour</button><button class="bq-btn" id="bqi-vc-save">Enregistrer</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      $('#bqi-vc-save', el).addEventListener('click', () => {
        const k = KC();
        const colorId = k ? k.value(el) : '';
        cat.updateVariant(vid, {
          colorId: colorId || undefined,
          note: $('#bqi-vc-note', el).value.trim(),
        });
        toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Couleur mise à jour'));
        openInvProduct(pid);
      });
    });
  }
  /* ─── register an EXISTING barcode on a variant (old POS code, no reprint) ─── */
  function openRegisterOnVariant(vid, pid) {
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Enregistrer un code existant</h3><span>Scannez ou tapez le code déjà présent sur l'article, conservé tel quel.</span></div></div>
      <div class="bqi-form">
        <div class="bqi-fg"><label>Code-barres</label><input id="bqi-reg-code" placeholder="Scannez ou tapez le code…" autocomplete="off" /></div>
        <div class="bqi-help">EAN-13, UPC ou tout code de l'ancien système. Aucune réimpression, le code est rattaché à cette variante.</div>
      </div>
      <div class="bqi-modfoot"><button class="bq-btn secondary" data-inv-back>Retour</button><button class="bq-btn" id="bqi-reg-save">Enregistrer le code</button></div>`;
    invSetModal(html, (el) => {
      $('[data-inv-back]', el).addEventListener('click', () => openInvProduct(pid));
      const inp = $('#bqi-reg-code', el);
      const save = () => {
        const raw = inp.value.trim(); if (!raw) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code vide')); return; }
        const res = catDB().attachBarcode(vid, raw);
        if (res.ok) { toast(res.already ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code déjà rattaché') : `Code ${raw} enregistré`); openInvProduct(pid); }
        else if (res.reason === 'doublon') toast(`Déjà utilisé par ${res.owner.product.name} (${res.owner.variant.colorLabel} ${res.owner.variant.size})`);
        else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Enregistrement impossible'));
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') save(); };
      $('#bqi-reg-save', el).addEventListener('click', save);
      setTimeout(() => inp.focus(), 40);
    });
  }

  /* ─── register an unknown scanned code onto a product (pick / create) ─── */
  function offerRegister(code) {
    const cat = catDB(); if (!cat) return;
    if (state.view !== 'inventaire') switchView('inventaire');
    const products = cat.listProducts({});
    // Une liste déroulante ne peut pas montrer de pastille : c'est le seul
    // endroit où la couleur reste écrite. Quand deux variantes portent la même
    // famille, la nuance d'origine ou la précision les départage.
    const varOptions = (pid) => cat.listVariants(pid).map((v) => {
      const extra = v.note || variantSource(v) || '';
      return `<option value="${v.id}">${esc(v.colorLabel)}${extra ? ` (${esc(extra)})` : ''} · ${esc(v.size)}</option>`;
    }).join('');
    const html = `
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqi-modh"><div><h3>Code existant à enregistrer</h3><span>Code scanné : <b>${esc(code)}</b>, rattachez-le à un article (sans réimprimer).</span></div></div>
      <div class="bqi-form">
        <div class="bqi-fg"><label>Article</label><select id="bqi-or-prod">${products.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
        <div class="bqi-fg"><label>Variante (couleur · taille)</label><select id="bqi-or-var">${products.length ? varOptions(products[0].id) : ''}</select></div>
      </div>
      <div class="bqi-modfoot"><span class="bqi-dashboard-only">Créer l’article dans le tableau de bord</span><button class="bq-btn" id="bqi-or-save">Rattacher le code</button></div>`;
    invSetModal(html, (el) => {
      const prodSel = $('#bqi-or-prod', el), varSel = $('#bqi-or-var', el);
      if (prodSel) prodSel.addEventListener('change', () => { varSel.innerHTML = varOptions(prodSel.value); });
      $('#bqi-or-save', el).addEventListener('click', () => {
        const vid = varSel && varSel.value;
        if (!vid) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Choisissez une variante (ajoutez-en une d\'abord)')); return; }
        const res = cat.attachBarcode(vid, code);
        if (res.ok) { toast(`Code ${code} enregistré`); openInvProduct(prodSel.value); }
        else if (res.reason === 'doublon') toast(`Déjà utilisé par ${res.owner.product.name}`);
        else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Enregistrement impossible'));
      });
    });
  }

  /* ═══════════════════════════════════════════════════════════════════════════
   * REPRISE DE STOCK — onboarder une boutique déjà étiquetée
   * ---------------------------------------------------------------------------
   * Le cas que ceci résout : un commerçant a des milliers d'articles qui portent
   * DÉJÀ un code-barres fournisseur ou fabricant. Lui faire générer et imprimer
   * une étiquette Kiwi par pièce, c'est des jours de travail et des milliers
   * d'étiquettes pour rien. Le code du carton est un identifiant parfaitement
   * valable : on le lit, on le garde tel quel, on ne réimprime rien.
   *
   * Trois gestes vivent ici, et l'écran ne les confond JAMAIS (c'est la règle
   * la plus importante de cet écran, parce qu'à la douchette ils se ressemblent) :
   *   · CRÉER un article au catalogue           — le code est inconnu
   *   · AJOUTER une déclinaison à un article    — même modèle, autre taille/couleur
   *   · RECEVOIR du stock                       — l'article existe déjà, il en arrive
   *
   * Ce que scanner ici ne fait jamais : mettre au panier, encaisser, bouger le
   * stock avant confirmation, imprimer une étiquette, écraser un article existant.
   * Garanti par armScanCapture() (voir handleWedge) plus le mode `pending` : rien
   * n'est écrit avant que l'employé n'ait touché « Enregistrer ».
   * ─────────────────────────────────────────────────────────────────────────── */

  /* Session de reprise : vit le temps de l'écran, sert le compteur et le journal.
   * `log` est borné — une session d'import peut faire des milliers d'articles et
   * la caisse doit rester aussi vive au 2000e scan qu'au premier. */
  const intake = { open: false, count: 0, pieces: 0, log: [], mode: 'scan', draft: null, lastProduct: null, hint: null };
  const INTAKE_LOG_MAX = 8;

  function intakeReset() {
    intake.count = 0; intake.pieces = 0; intake.log = []; intake.mode = 'scan';
    intake.draft = null; intake.lastProduct = null; intake.hint = null;
  }
  function intakeNote(kind, text) {
    intake.log.unshift({ kind, text, at: new Date() });
    if (intake.log.length > INTAKE_LOG_MAX) intake.log.length = INTAKE_LOG_MAX;
  }

  /* ─── le juge : que faire de ce code ? ───────────────────────────────────────
   * Un seul endroit décide, pour que le scan répété, la saisie manuelle et la
   * caméra donnent exactement le même verdict. */
  function intakeJudge(raw) {
    const code = normScan(raw);
    const KB = window.KiwiBarcode;
    const val = KB && KB.validate ? KB.validate(code) : { ok: !!code, code, sym: '', check: 'na' };
    if (!val.ok) return { kind: 'invalide', code, reason: val.reason };
    const cat = catDB();
    const hit = cat ? cat.findByBarcode(val.code) : null;
    if (hit) return { kind: 'connu', code: val.code, sym: val.sym, check: val.check, hit };
    return { kind: 'nouveau', code: val.code, sym: val.sym, check: val.check };
  }

  const INVALID_MSG = {
    vide: 'Rien n\'a été lu. Rapprochez la douchette de l\'étiquette, ou tapez le code.',
    illisible: 'Lecture incomplète · la douchette a envoyé des caractères parasites. Rescannez, ou tapez le code à la main.',
    'trop-court': 'Lecture partielle : trop peu de caractères pour être un code-barres. Rescannez plus lentement, ou tapez-le.',
    'trop-long': 'Ce code est anormalement long. Vérifiez qu\'un seul article est passé devant la douchette.',
  };

  function symBadge(j) {
    if (!j || !j.sym) return '';
    const KB = window.KiwiBarcode;
    const label = KB && KB.symLabel ? KB.symLabel(j.sym) : j.sym;
    if (j.check === 'bad') return `<span class="bqx-sym warn" title="La clé de contrôle ne correspond pas. C'est fréquent sur un code interne · Kiwi l'accepte tel quel.">${esc(label)} · clé inhabituelle</span>`;
    return `<span class="bqx-sym">${esc(label)}${j.check === 'ok' ? ' ✓' : ''}</span>`;
  }

  /* ─── l'écran ─── */
  function openIntake() {
    if (!catDB()) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Base d\'inventaire indisponible')); return; }
    if (state.view !== 'inventaire') switchView('inventaire');
    intake.open = true;
    intakeReset();
    paintIntake();
  }

  function intakeClose() {
    intake.open = false;
    disarmScanCapture();
    closeVeil('#bq-inv-veil');
    /* La projection de vente a été mise en pause pendant la saisie : on la
       reconstruit maintenant, avant que quiconque scanne pour vendre. */
    rebuildCatalog();
    pruneTicket();
    renderInventaire();
    if (intake.count) toast(`Reprise terminée · ${intake.count} article${intake.count > 1 ? 's' : ''}, ${intake.pieces} pièce${intake.pieces > 1 ? 's' : ''}`);
  }

  function intakeHeader() {
    return `
      <div class="bqx-head">
        <div class="bqx-head-t">
          <h3>Reprise de stock</h3>
          <span>Scannez le code déjà présent sur l'article. Kiwi le garde tel quel · aucune étiquette à réimprimer.</span>
        </div>
        <div class="bqx-tally" aria-live="polite">
          <b>${intake.count}</b><span>article${intake.count > 1 ? 's' : ''}</span>
          <i></i>
          <b>${intake.pieces}</b><span>pièce${intake.pieces > 1 ? 's' : ''}</span>
        </div>
      </div>`;
  }

  function intakeLogHtml() {
    if (!intake.log.length) {
      return `<div class="bqx-log-empty">Rien encore. La douchette écrit directement dans le champ ci-dessus · pas besoin de cliquer.</div>`;
    }
    return `<div class="bqx-log">${intake.log.map((l) => `
      <div class="bqx-log-row is-${l.kind}">
        <i data-lucide="${l.kind === 'cree' ? 'plus-circle' : l.kind === 'variante' ? 'git-branch' : l.kind === 'recu' ? 'package-plus' : 'alert-circle'}"></i>
        <span>${esc(l.text)}</span>
        <em>${fmtHM(l.at)}</em>
      </div>`).join('')}</div>`;
  }

  /* ═══ état 1 · en attente d'un scan ═══ */
  function paintIntake() {
    if (!intake.open) return;
    intake.mode = 'scan';
    const canCam = camSupported();
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-body">
        <div class="bqx-scanbox" id="bqx-box">
          <i data-lucide="scan-line"></i>
          <input id="bqx-code" placeholder="Scannez un article…" autocomplete="off" autocapitalize="off" spellcheck="false" />
          <button class="bqx-mini" id="bqx-go" title="Valider le code saisi"><i data-lucide="arrow-right"></i></button>
        </div>
        <div class="bqx-hint${intake.hint ? ' is-' + intake.hint.tone : ''}" id="bqx-hint">${esc(intake.hint ? intake.hint.msg : 'Douchette prête. Pas de douchette ? Tapez le code puis Entrée.')}</div>
        <div class="bqx-alt">
          ${canCam ? `<button class="bq-btn secondary" id="bqx-cam"><i data-lucide="camera"></i>Scanner avec la caméra</button>` : ''}
          <button class="bq-btn secondary" id="bqx-diag"><i data-lucide="activity"></i>La douchette ne répond pas ?</button>
        </div>
        ${intakeLogHtml()}
      </div>
      <div class="bqi-modfoot">
        <button class="bq-btn secondary" id="bqx-done">Terminer la reprise</button>
      </div>`, (el) => {
      const inp = $('#bqx-code', el);
      const submit = () => {
        const v = inp.value; inp.value = '';
        if (!String(v).trim()) { intakeHint('Tapez ou scannez un code.', 'warn', el); return; }
        intakeTake(v, { manual: true });
      };
      inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } };
      $('#bqx-go', el).onclick = submit;
      $('#bqx-done', el).onclick = intakeClose;
      const cam = $('#bqx-cam', el);
      if (cam) cam.onclick = () => openCamScan((c) => intakeTake(c));
      $('#bqx-diag', el).onclick = () => { disarmScanCapture(); openScannerTest(); };
      /* Le scan appartient à cet écran, et à rien d'autre. */
      armScanCapture((code) => intakeTake(code));
      intakeFocus(el);
    });
  }

  /* La douchette tape dans le champ : il doit avoir le curseur, tout le temps, y
     compris après un enregistrement — c'est ce qui permet d'enchaîner sans souris. */
  function intakeFocus(el) {
    setTimeout(() => { const i = $('#bqx-code', el || root); if (i) { i.focus(); i.select(); } }, 30);
  }
  /* Le message est MÉMORISÉ avant d'être écrit : paintIntake() reconstruit tout
     l'écran, et un texte posé juste avant le repaint disparaissait aussitôt —
     l'employé voyait « Douchette prête » alors que son scan venait d'être refusé. */
  function intakeHint(msg, tone, el) {
    intake.hint = msg ? { msg, tone: tone || '' } : null;
    const h = $('#bqx-hint', el || root);
    if (!h) return;
    h.textContent = msg;
    h.className = 'bqx-hint' + (tone ? ' is-' + tone : '');
  }

  /* ═══ le geste central : un code arrive ═══ */
  function intakeTake(raw, opts) {
    opts = opts || {};
    const j = intakeJudge(raw);
    if (j.kind === 'invalide') {
      intakeNote('erreur', `Lecture refusée · ${INVALID_MSG[j.reason] ? j.reason : 'illisible'}`);
      intakeHint(INVALID_MSG[j.reason] || 'Code illisible, rescannez.', 'bad');
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Scan incomplet, rien n\'a été enregistré'));
      paintIntake();
      return;
    }
    intake.hint = null;   // un code lisible efface l'avertissement du scan précédent
    if (j.kind === 'connu') { intakeKnown(j); return; }
    intakeNew(j, opts);
  }

  /* ═══ état 2 · code INCONNU → créer l'article (ou l'ajouter au précédent) ═══ */
  function intakeNew(j, opts) {
    intake.mode = 'nouveau';
    const cat = catDB();
    const cats = cat.listCategories();
    const prev = intake.lastProduct ? cat.getProduct(intake.lastProduct) : null;
    const manual = !!(opts && opts.manual);
    // Combien de fiches attendent leur code-barres (typiquement : ce que le
    // fichier fournisseur a fait entrer au tableau de bord).
    const bare = cat.countCodeless ? cat.countCodeless() : 0;
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="badge-check"></i>
        <div>
          <b>Code lu${manual ? ' (saisi à la main)' : ''} · nouveau</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      ${prev ? `
      <div class="bqx-chain">
        <div>
          <b>Même modèle que « ${esc(prev.product.name)} » ?</b>
          <span>Une autre taille ou couleur du même article : le nom, la catégorie et les prix sont repris, vous ne changez que la déclinaison.</span>
        </div>
        <button class="bq-btn" id="bqx-chain">Ajouter une déclinaison</button>
      </div>` : ''}
      ${bare ? `
      <div class="bqx-chain is-link">
        <div>
          <b>Cet article est déjà au catalogue, sans code-barres ?</b>
          <span>${bare} déclinaison${bare > 1 ? 's' : ''} attend${bare > 1 ? 'ent' : ''} son code · celles qui viennent du fichier fournisseur. Rattachez ce code au lieu de tout ressaisir.</span>
        </div>
        <button class="bq-btn" id="bqx-link">Chercher l'article</button>
      </div>` : ''}
      <div class="bqi-form bqx-form">
        <div class="bqi-fg"><label>Nom du produit</label><input id="bqx-name" placeholder="Ex. Jean Noir" autocomplete="off" /></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Catégorie</label><select id="bqx-cat">${catSelectOptions(state.invFilter && state.invFilter !== 'all' ? state.invFilter : (prev ? prev.product.categoryId : ''))}</select></div>
          <div class="bqi-fg"><label>Type de taille</label><select id="bqx-kind">${kindSelectOptions(prev ? prev.product.kind : 'taille')}</select></div>
        </div>
        <div class="bqi-fg"><label>Ou nouvelle catégorie</label><input id="bqx-newcat" placeholder="Laisser vide pour garder celle ci-dessus" autocomplete="off" /></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Prix de vente (MAD)</label><input id="bqx-price" type="number" min="0" step="0.01" inputmode="decimal" placeholder="349" /></div>
          <div class="bqi-fg"><label>Coût d'achat (MAD)</label><input id="bqx-cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="optionnel" /></div>
        </div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        </div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes" placeholder="M" autocomplete="off" /><datalist id="bqx-sizes"></datalist></div>
          <div class="bqi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
        <div class="bqi-fg"><label>Autre précision (optionnel)</label><input id="bqx-flag" placeholder="Ex. coupe droite, lot été" autocomplete="off" /></div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-skip">Ignorer ce code</button>
        <button class="bq-btn" id="bqx-save"><i data-lucide="check"></i>Enregistrer et scanner le suivant</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      const kindSel = $('#bqx-kind', el), sizeList = $('#bqx-sizes', el);
      const fillSizes = () => { sizeList.innerHTML = cat.sizePresets(kindSel.value).map((s) => `<option value="${esc(s)}">`).join(''); };
      kindSel.onchange = fillSizes; fillSizes();

      if (prev) $('#bqx-chain', el).onclick = () => intakeVariant(j, intake.lastProduct);
      const linkBtn = $('#bqx-link', el);
      if (linkBtn) linkBtn.onclick = () => intakeLink(j);
      $('#bqx-skip', el).onclick = () => { intakeNote('erreur', `Code ${j.code} ignoré`); paintIntake(); };

      const save = () => {
        const name = $('#bqx-name', el).value.trim();
        if (!name) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Le nom du produit est requis')); $('#bqx-name', el).focus(); return; }
        const size = $('#bqx-size', el).value.trim() || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        let catId = $('#bqx-cat', el).value || null;
        const newCat = $('#bqx-newcat', el).value.trim();
        if (newCat) catId = cat.addCategory(newCat).id;
        /* Créer le produit, sa déclinaison et rattacher le code, c'est UN geste :
           une seule écriture du catalogue au lieu de trois (voir batch()). */
        let p = null, ev = null, res = null;
        cat.batch(() => {
          p = cat.addProduct({
            name, categoryId: catId, kind: kindSel.value,
            priceMAD: bqMoney($('#bqx-price', el).value), cost: bqMoney($('#bqx-cost', el).value),
            art: prev ? prev.product.art : 'tshirt', flag: $('#bqx-flag', el).value.trim(),
          });
          ev = cat.ensureVariant({ productId: p.id, colorId: pickedColor(), size, stock: qty });
          res = cat.attachBarcode(ev.variant.id, j.code);
          if (!res.ok) cat.deleteProduct(p.id);   // jamais d'article orphelin
        });
        if (!res.ok) {
          /* Course rarissime : le code a été pris entre le scan et l'enregistrement
             (l'autre caisse, ou l'autre appareil). L'article vient d'être défait
             dans le batch ci-dessus, rien d'orphelin ne reste. */
          toast(res.reason === 'doublon' ? `Ce code vient d'être attribué à ${res.owner.product.name}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code refusé, rien n\'a été créé'));
          paintIntake();
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = p.id;
        intakeNote('cree', `${name} · ${size} · ${qty} pièce${qty > 1 ? 's' : ''}, code conservé`);
        toast(`${name} enregistré · code ${j.code} conservé`);
        intakeHint(`${name} · ${size} enregistré. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      /* Entrée depuis n'importe quel champ enregistre : la reprise se fait au
         clavier, la souris ne devrait jamais être nécessaire. */
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => { const n = $('#bqx-name', el); if (n) n.focus(); }, 40);
    });
  }

  /* ═══ état 3 · enchaîner une déclinaison du MÊME produit ═══
     Le cas « Jean Noir » du cahier des charges : noir/S = code A, noir/M = code B,
     bleu/M = code C. On ne recrée pas le produit, on ne retape pas le prix. */
  function intakeVariant(j, pid) {
    intake.mode = 'variante';
    const cat = catDB();
    const d = cat.getProduct(pid);
    if (!d) { intakeNew(j, {}); return; }
    const presets = cat.sizePresets(d.product.kind);
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="git-branch"></i>
        <div>
          <b>Nouvelle déclinaison · ${esc(d.product.name)}</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-common">
        <span>Repris du produit</span>
        <b>${esc(d.category ? d.category.name : 'Divers')} · ${fmtMAD(d.product.priceMAD)}${d.product.cost ? ' · coût ' + fmtMAD(d.product.cost) : ''}</b>
      </div>
      <div class="bqi-form bqx-form">
        <div class="bqi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes2" value="" placeholder="${esc(presets[0] || 'TU')}" autocomplete="off" /><datalist id="bqx-sizes2">${presets.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="bqi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Déjà au catalogue</span>
        <div class="bqx-chips">${d.variants.map((v) => `<span class="bqx-chip"><i style="background:${v.colorHex}"></i>${esc(v.colorLabel)} · ${esc(v.size)} <b>${v.stock}</b></span>`).join('') || '<em>aucune déclinaison</em>'}</div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-back">Créer un autre produit</button>
        <button class="bq-btn" id="bqx-save"><i data-lucide="check"></i>Enregistrer et scanner le suivant</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      $('#bqx-back', el).onclick = () => intakeNew(j, {});
      const save = () => {
        const size = $('#bqx-size', el).value.trim() || presets[0] || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        let ev = null, res = null;
        cat.batch(() => {
          ev = cat.ensureVariant({ productId: pid, colorId: pickedColor(), size, stock: 0 });
          if (!ev.variant) return;
          res = cat.attachBarcode(ev.variant.id, j.code);
          if (!res.ok) { if (ev.created) cat.deleteVariant(ev.variant.id); return; }
          /* Une déclinaison qui existait déjà REÇOIT du stock — elle n'est pas
             remise à la quantité du carton. */
          if (qty > 0) cat.receiveStock(ev.variant.id, qty);
        });
        if (!ev || !ev.variant) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Déclinaison impossible')); return; }
        const existed = !ev.created;
        if (!res || !res.ok) {
          if (res && res.reason === 'doublon') toast(`Ce code est déjà sur ${res.owner.product.name} · ${res.owner.variant.colorLabel} ${res.owner.variant.size}`);
          else toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code refusé'));
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = pid;
        intakeNote('variante', `${d.product.name} · ${size} · ${existed ? 'code ajouté' : 'déclinaison créée'}, ${qty} pièce${qty > 1 ? 's' : ''}`);
        toast(`${d.product.name} · ${size} enregistré`);
        intakeHint(`${d.product.name} · ${size} enregistré. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => { const s = $('#bqx-size', el); if (s) s.focus(); }, 40);
    });
  }

  /* ═══ état 3 bis · RATTACHER le code à une fiche déjà importée ═══
     La seconde moitié d'une reprise : le fichier du fournisseur est entré au
     tableau de bord avec les noms, les prix et les coûts, mais sans code — un
     tarif Excel n'en porte pas. L'employé parcourt le magasin, scanne, et
     retrouve ici la fiche qui attend son code. Rien à ressaisir. */
  function intakeLink(j) {
    intake.mode = 'rattacher';
    const cat = catDB();
    const draw = (q) => {
      const hits = cat.listCodeless({ q, limit: 40 });
      if (!hits.length) {
        return `<div class="bqx-log-empty">${q ? 'Aucune fiche sans code-barres ne porte ce nom.' : 'Toutes les fiches ont déjà un code-barres.'}</div>`;
      }
      return `<div class="bqx-linklist">${hits.map((h) => `
        <div class="bqx-linkprod">
          <div class="bqx-linkhead">
            <span class="bqi-art">${artOf(h.product)}</span>
            <div><b>${esc(h.product.name)}</b><span>${fmtMAD(h.product.priceMAD)}${h.product.cost ? ' · coût ' + fmtMAD(h.product.cost) : ''} · ${h.variants.length}/${h.total} sans code</span></div>
          </div>
          <div class="bqx-chips">${h.variants.map((v) => `
            <button type="button" class="bqx-chip is-pick" data-link-v="${v.id}" data-link-p="${h.product.id}">
              <i style="background:${v.colorHex}"></i>${esc(v.colorLabel)} · ${esc(v.size)} <b>${v.stock}</b>
            </button>`).join('')}</div>
        </div>`).join('')}</div>`;
    };
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new">
        <i data-lucide="link"></i>
        <div>
          <b>Rattacher ce code à une fiche existante</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-body">
        <div class="bqx-scanbox slim"><i data-lucide="search"></i>
          <input id="bqx-lq" placeholder="Nom de l'article…" autocomplete="off" />
        </div>
        <div class="bqi-help">Touchez la déclinaison correspondante : le code y sera rattaché tel quel, sans réimpression.</div>
        <div id="bqx-lres">${draw('')}</div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-lback">Retour</button>
      </div>`, (el) => {
      const res = $('#bqx-lres', el), q = $('#bqx-lq', el);
      const wire = () => {
        res.querySelectorAll('[data-link-v]').forEach((b) => b.addEventListener('click', () => {
          const vid = b.getAttribute('data-link-v'), pid = b.getAttribute('data-link-p');
          const r = cat.attachBarcode(vid, j.code);
          if (!r.ok) {
            toast(r.reason === 'doublon' ? `Ce code vient d'être attribué à ${r.owner.product.name}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rattachement impossible'));
            return;
          }
          const d = cat.getProduct(pid);
          intake.count++;
          intake.lastProduct = pid;
          intakeNote('variante', `${d.product.name} · code rattaché à une fiche importée`);
          toast(`Code ${j.code} rattaché à ${d.product.name}`);
          intakeHint(`${d.product.name} a maintenant son code. Scannez l'article suivant.`, 'good');
          paintIntake();
        }));
      };
      /* Le champ de recherche se tape à la main ; la douchette, elle, doit
         pouvoir scanner l'article SUIVANT sans quitter cet écran. */
      armScanCapture((c) => intakeTake(c));
      let t = null;
      q.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => { res.innerHTML = draw(q.value); wire(); icons(); }, 120);
      });
      $('#bqx-lback', el).onclick = () => intakeNew(j, {});
      wire();
      setTimeout(() => q.focus(), 40);
    });
  }

  /* ═══ état 4 · code DÉJÀ CONNU ═══
     Jamais de doublon silencieux. On montre ce que la boutique a déjà, et on
     propose les seules suites qui aient un sens : recevoir, compléter, corriger. */
  function intakeKnown(j) {
    intake.mode = 'connu';
    const cat = catDB();
    const pid = j.hit.product.id;
    const d = cat.getProduct(pid);
    const v = j.hit.variant;
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-known">
        <i data-lucide="package-check"></i>
        <div>
          <b>Article déjà au catalogue</b>
          <span class="bqx-codeline">${esc(j.code)} ${symBadge(j)}</span>
        </div>
      </div>
      <div class="bqx-known-card">
        <span class="bqi-art">${artOf(d.product)}</span>
        <div>
          <b>${esc(d.product.name)}</b>
          <span>${esc(d.category ? d.category.name : 'Divers')} · ${fmtMAD(d.product.priceMAD)} · ${d.stock} en stock au total</span>
          <span class="bqx-thisvar"><i style="background:${v.colorHex}"></i>Ce code désigne <b>${esc(v.colorLabel)} · ${esc(v.size)}</b> · ${v.stock} en stock</span>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Toutes ses déclinaisons</span>
        <div class="bqx-chips">${d.variants.map((x) => `<span class="bqx-chip${x.id === v.id ? ' on' : ''}"><i style="background:${x.colorHex}"></i>${esc(x.colorLabel)} · ${esc(x.size)} <b>${x.stock}</b></span>`).join('')}</div>
      </div>
      <div class="bqx-acts">
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="package-plus"></i><b>Recevoir du stock</b></div>
          <p>Plusieurs pièces du même article : indiquez la quantité, sans scanner chaque pièce.</p>
          <div class="bqx-qtyrow">
            <button class="bqi-mini" id="bqx-qminus" aria-label="Moins">−</button>
            <input id="bqx-rqty" type="number" min="1" step="1" inputmode="numeric" value="1" />
            <button class="bqi-mini" id="bqx-qplus" aria-label="Plus">+</button>
            <button class="bq-btn" id="bqx-receive">Ajouter au stock</button>
          </div>
        </div>
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="git-branch"></i><b>Une taille ou couleur manque</b></div>
          <p>Le fournisseur donne un code par déclinaison : ajoutez-la sans recréer le produit.</p>
          <button class="bq-btn secondary" id="bqx-addvar">Ajouter une déclinaison</button>
        </div>
        <div class="bqx-act">
          <div class="bqx-act-h"><i data-lucide="pencil"></i><b>La fiche est fausse</b></div>
          <p>Nom, prix ou catégorie saisis de travers : corrigez l'article existant.</p>
          <button class="bq-btn secondary" id="bqx-fix">Corriger la fiche</button>
        </div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-next">Passer au suivant</button>
      </div>`, (el) => {
      const qty = $('#bqx-rqty', el);
      const nudge = (dz) => { qty.value = Math.max(1, (parseInt(qty.value, 10) || 1) + dz); };
      $('#bqx-qminus', el).onclick = () => nudge(-1);
      $('#bqx-qplus', el).onclick = () => nudge(1);
      const receive = () => {
        const n = parseInt(qty.value, 10) || 0;
        const res = cat.receiveStock(v.id, n);
        if (!res.ok) { toast(res.reason === 'quantite' ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Indiquez une quantité d\'au moins 1') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Réception impossible')); return; }
        /* Un réassort compte comme un article repris : sans ce `count++`, une
           session passée entièrement à remettre du stock sur des tailles déjà
           connues affichait « 0 article · 12 pièces » — un compteur qui se
           contredit lui-même et fait douter la vendeuse de tout l'écran. */
        intake.count++;
        intake.pieces += res.added;
        intakeNote('recu', `${d.product.name} · ${v.size} · ${res.added} reçue${res.added > 1 ? 's' : ''} (${res.before} → ${res.stock})`);
        toast(`${d.product.name} · ${v.size} : ${res.before} → ${res.stock}`);
        intakeHint(`${res.added} pièce${res.added > 1 ? 's' : ''} ajoutée${res.added > 1 ? 's' : ''} · ${d.product.name} ${v.size} passe à ${res.stock}. Scannez le suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-receive', el).onclick = receive;
      qty.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); receive(); } };
      $('#bqx-addvar', el).onclick = () => intakeAddVariantHere(pid);
      $('#bqx-fix', el).onclick = () => intakeFix(pid);
      $('#bqx-next', el).onclick = () => { intake.lastProduct = pid; paintIntake(); };
      setTimeout(() => { if (qty) { qty.focus(); qty.select(); } }, 40);
    });
  }

  /* Ajouter une déclinaison MANQUANTE à un article connu, avec son propre code
     fournisseur — on redemande le code puisque celui qu'on vient de scanner
     appartient déjà à une autre déclinaison. */
  function intakeAddVariantHere(pid) {
    const cat = catDB();
    const d = cat.getProduct(pid); if (!d) return;
    const presets = cat.sizePresets(d.product.kind);
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-new"><i data-lucide="git-branch"></i>
        <div><b>Déclinaison manquante · ${esc(d.product.name)}</b><span>Scannez le code de CETTE taille/couleur, ou laissez vide pour l'ajouter sans code.</span></div>
      </div>
      <div class="bqi-form bqx-form">
        <div class="bqi-fg"><label>Code-barres de la déclinaison</label>
          <div class="bqx-scanbox slim"><i data-lucide="scan-line"></i><input id="bqx-vcode" placeholder="Scannez ou tapez…" autocomplete="off" spellcheck="false" /></div>
          <div class="bqi-help" id="bqx-vhint">Chaque déclinaison peut porter son propre code fournisseur.</div>
        </div>
        <div class="bqi-fg"><label>Couleur</label><div id="bqx-sw">${colorPicker('noir')}</div></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Taille</label><input id="bqx-size" list="bqx-sizes3" placeholder="${esc(presets[0] || 'TU')}" autocomplete="off" /><datalist id="bqx-sizes3">${presets.map((s) => `<option value="${esc(s)}">`).join('')}</datalist></div>
          <div class="bqi-fg"><label>Quantité reçue</label><input id="bqx-qty" type="number" min="0" step="1" inputmode="numeric" value="1" /></div>
        </div>
      </div>
      <div class="bqx-existing">
        <span>Déjà au catalogue</span>
        <div class="bqx-chips">${d.variants.map((x) => `<span class="bqx-chip"><i style="background:${x.colorHex}"></i>${esc(x.colorLabel)} · ${esc(x.size)} <b>${x.stock}</b></span>`).join('')}</div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-back">Retour</button>
        <button class="bq-btn" id="bqx-save"><i data-lucide="check"></i>Ajouter la déclinaison</button>
      </div>`, (el) => {
      /* Le sélecteur de couleurs partagé (assets/color-palette.js) porte son propre
         état et sa navigation clavier : on lui DEMANDE sa valeur au moment
         d'enregistrer, plutôt que de suivre les clics à la main. */
      const pickedColor = () => { const k = KC(); return (k && k.value($('#bqx-sw', el))) || 'noir'; };
      const codeIn = $('#bqx-vcode', el);
      /* Le verdict s'affiche sous le champ, et il est le MÊME que le code arrive
         de la douchette ou des doigts : sans le second câblage, un employé qui
         tape un code déjà pris ne l'apprenait qu'au moment d'enregistrer. */
      const judgeV = (raw) => {
        const jj = intakeJudge(raw);
        const hint = $('#bqx-vhint', el);
        if (!hint) return jj;
        if (jj.kind === 'invalide') { hint.textContent = INVALID_MSG[jj.reason] || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code illisible.'); hint.className = 'bqi-help is-bad'; }
        else if (jj.kind === 'connu') { hint.textContent = `Déjà utilisé par ${jj.hit.product.name} · ${jj.hit.variant.colorLabel} ${jj.hit.variant.size}. Un code ne peut désigner qu'un seul article.`; hint.className = 'bqi-help is-bad'; }
        else { hint.textContent = `Code lu · ${(window.KiwiBarcode && window.KiwiBarcode.symLabel) ? window.KiwiBarcode.symLabel(jj.sym) : ''}${jj.check === 'bad' ? ' (clé de contrôle inhabituelle, accepté tel quel)' : ''}`; hint.className = 'bqi-help is-good'; }
        return jj;
      };
      armScanCapture((c) => { codeIn.value = normScan(c); judgeV(c); });   /* le scan vient ici, pas sur le ticket */
      const liveJudge = () => { const v = codeIn.value.trim(); if (v) judgeV(v); };
      codeIn.addEventListener('input', liveJudge);
      codeIn.addEventListener('change', liveJudge);
      $('#bqx-back', el).onclick = () => paintIntake();
      const save = () => {
        const size = $('#bqx-size', el).value.trim() || presets[0] || 'TU';
        const qty = Math.max(0, parseInt($('#bqx-qty', el).value, 10) || 0);
        const raw = codeIn.value.trim();
        if (raw) {
          const jj = judgeV(raw);   // refuse ET explique, sous le champ concerné
          if (jj.kind === 'invalide') { toast(INVALID_MSG[jj.reason] || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code illisible')); return; }
          if (jj.kind === 'connu') { toast(`Code déjà porté par ${jj.hit.product.name} · ${jj.hit.variant.size}`); return; }
        }
        let ev = null, res = null;
        cat.batch(() => {
          ev = cat.ensureVariant({ productId: pid, colorId: pickedColor(), size, stock: 0 });
          if (!ev.variant) return;
          if (raw) {
            res = cat.attachBarcode(ev.variant.id, raw);
            if (!res.ok) { if (ev.created) cat.deleteVariant(ev.variant.id); return; }
          }
          if (qty > 0) cat.receiveStock(ev.variant.id, qty);
        });
        if (!ev || !ev.variant) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Déclinaison impossible')); return; }
        if (res && !res.ok) {
          toast(res.reason === 'doublon' ? `Code déjà utilisé par ${res.owner.product.name}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Code refusé'));
          return;
        }
        intake.count++; intake.pieces += qty;
        intake.lastProduct = pid;
        intakeNote('variante', `${d.product.name} · ${size} · ${ev.created ? 'déclinaison créée' : 'déjà présente'}, ${qty} pièce${qty > 1 ? 's' : ''}`);
        toast(`${d.product.name} · ${size} ajouté`);
        intakeHint(`${d.product.name} · ${size} ajouté. Scannez l'article suivant.`, 'good');
        paintIntake();
      };
      $('#bqx-save', el).onclick = save;
      el.querySelectorAll('.bqx-form input').forEach((i) => {
        i.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
      });
      setTimeout(() => codeIn.focus(), 40);
    });
  }

  /* Corriger une fiche saisie de travers. Geste sensible (le prix part en caisse
     et le coût en compta) : passe par l'autorisation responsable, comme une remise. */
  function intakeFix(pid) {
    const cat = catDB();
    const d = cat.getProduct(pid); if (!d) return;
    const p = d.product;
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      ${intakeHeader()}
      <div class="bqx-found is-fix"><i data-lucide="pencil"></i>
        <div><b>Corriger « ${esc(p.name)} »</b><span>Le code-barres et le stock ne changent pas · seule la fiche est corrigée.</span></div>
      </div>
      <div class="bqi-form bqx-form">
        <div class="bqi-fg"><label>Nom</label><input id="bqx-fname" value="${esc(p.name)}" /></div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Catégorie</label><select id="bqx-fcat">${catSelectOptions(p.categoryId)}</select></div>
          <div class="bqi-fg"><label>Type de taille</label><select id="bqx-fkind">${kindSelectOptions(p.kind)}</select></div>
        </div>
        <div class="bqi-frow">
          <div class="bqi-fg"><label>Prix de vente (MAD)</label><input id="bqx-fprice" type="number" min="0" step="0.01" value="${p.priceMAD}" /></div>
          <div class="bqi-fg"><label>Coût d'achat (MAD)</label><input id="bqx-fcost" type="number" min="0" step="0.01" value="${p.cost || 0}" /></div>
        </div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-back">Retour</button>
        <button class="bq-btn" id="bqx-fsave"><i data-lucide="check"></i>Enregistrer la correction</button>
      </div>`, (el) => {
      $('#bqx-back', el).onclick = () => paintIntake();
      $('#bqx-fsave', el).onclick = () => {
        const name = $('#bqx-fname', el).value.trim();
        if (!name) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Le nom est requis')); return; }
        const patch = {
          name, categoryId: $('#bqx-fcat', el).value || null, kind: $('#bqx-fkind', el).value,
          priceMAD: bqMoney($('#bqx-fprice', el).value), cost: bqMoney($('#bqx-fcost', el).value),
        };
        const apply = () => {
          cat.updateProduct(pid, patch);
          intakeNote('recu', `${name} · fiche corrigée`);
          toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Fiche corrigée'));
          paintIntake();
        };
        /* Changer le prix change ce que la caisse encaissera, et l'ancien prix
           est peut-être le bon : on fait confirmer l'écart explicitement plutôt
           que de l'appliquer au passage. (openApprove() ne convient pas ici —
           il parle d'une remise et lit state.ticket, qui n'existe pas pendant
           une reprise de stock.) */
        if (patch.priceMAD !== p.priceMAD) intakeConfirmPrice(p, patch.priceMAD, apply);
        else apply();
      };
      setTimeout(() => { const n = $('#bqx-fname', el); if (n) { n.focus(); n.select(); } }, 40);
    });
  }

  /* Un prix corrigé se répercute sur tous les encaissements suivants : l'écart est
     montré en clair, avec le nom de qui est à la caisse, avant d'être appliqué. */
  function intakeConfirmPrice(p, next, onOk) {
    const who = (STAFF.caissiere && STAFF.caissiere.name) || '';
    invSetModal(`
      <button class="bq-modal-x" data-inv-x aria-label="Fermer"><i data-lucide="x"></i></button>
      <div class="bqx-found is-fix"><i data-lucide="alert-triangle"></i>
        <div><b>Confirmer le changement de prix</b><span>${esc(p.name)} sera encaissé à ce nouveau prix dès la prochaine vente.</span></div>
      </div>
      <div class="bqx-pricediff">
        <div><span>Prix actuel</span><b>${fmtMAD(p.priceMAD)}</b></div>
        <i data-lucide="arrow-right"></i>
        <div class="next"><span>Nouveau prix</span><b>${fmtMAD(next)}</b></div>
      </div>
      <div class="bqi-modfoot bqx-foot">
        <button class="bq-btn secondary" id="bqx-pno">Garder ${fmtMAD(p.priceMAD)}</button>
        <button class="bq-btn" id="bqx-pyes"><i data-lucide="check"></i>Appliquer${who ? ' · ' + esc(who) : ''}</button>
      </div>`, (el) => {
      $('#bqx-pno', el).onclick = () => intakeFix(p.id);
      $('#bqx-pyes', el).onclick = () => onOk();
    });
  }

  /* ─── label printing (printer wired to the caisse) ─── */
  /* L'étiquette de rayon porte le prix QU'ON ENCAISSE, pas le prix catalogue.
     Sans ça, lancer une promotion obligeait à réimprimer tout un rayon à la
     main — ou, pire, laissait les étagères annoncer l'ancien prix pendant que
     la caisse en encaisse un autre : c'est le commerçant qui se retrouve à
     devoir expliquer l'écart à la cliente, au comptoir, sans savoir d'où il
     vient. `was` fait ressortir l'ancien prix barré, comme une vraie affiche de
     soldes. Quand la promotion s'arrête, réimprimer redonne le prix plein. */
  function labelForVariant(pid, v) {
    const cat = catDB(); const p = cat.getProduct(pid).product;
    const code = cat.primaryBarcode(v);
    if (!code) return null;
    const extra = v.note || variantSource(v) || '';
    const pr = promoFor(pid);
    return {
      title: p.name, sub: String(v.colorId) === SZ.ONE_COLOR ? SZ.variantWords(v, szLang()) : `${v.colorLabel}${extra ? ` (${extra})` : ''} · ${v.size}`,
      price: fmtNum(pr ? pr.price : p.priceMAD),
      was: pr ? fmtNum(pr.was) : null,
      code, format: window.KiwiBarcode.isValidEan13(code) ? 'ean13' : 'code128',
    };
  }
  function printVariantLabel(vid) {
    const cat = catDB();
    let pid = null, v = null;
    for (const p of cat.listProducts({ includeArchived: true })) { const found = cat.listVariants(p.id).find((x) => x.id === vid); if (found) { pid = p.id; v = found; break; } }
    if (!v) return;
    const label = labelForVariant(pid, v);
    if (!label) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Générez d\'abord un EAN-13')); return; }
    labelToast(window.KiwiBarcode.printLabels([label], { copies: 1 }), 'Étiquette');
  }
  function printProductLabels(pid) {
    const cat = catDB(); const d = cat.getProduct(pid); if (!d) return;
    const labels = [];
    d.variants.forEach((v) => {
      const label = labelForVariant(pid, v);
      if (!label) return;
      const stock = Math.max(0, Math.floor(Number(v.stock) || 0));
      for (let i = 0; i < stock; i++) labels.push(label);
    });
    if (!labels.length) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucune unité en stock avec un code-barres à imprimer')); return; }
    labelToast(window.KiwiBarcode.printLabels(labels, { copies: 1 }), `${labels.length} étiquette(s)`);
  }
  // Toast the true outcome of a print (thermal / browser / connect-a-printer),
  // never a blanket "sent" — printLabels resolves with { ok, browser?, reason? }.
  function labelToast(p, what) {
    if (!p || !p.then) return;
    p.then((res) => {
      // Only announce a real send to a connected printer (res.via = bluetooth/bridge).
      // For the chooser (Imprimer / Enregistrer en PDF), the modal speaks for itself.
      if (res && res.ok && res.via) toast(`${what} envoyée à l'imprimante`);
    });
  }
export { intake, intakeReset, intakeTake, invSetModal, invUnseen, offerRegister, openInvProduct, renderInventaire };
