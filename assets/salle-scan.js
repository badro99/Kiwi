/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · SALLE SCAN — window.KiwiSalleScan
 * ---------------------------------------------------------------------------
 * « Scanner ma salle » : le restaurateur photographie sa salle (ou un croquis
 * dessiné à la main) et Kiwi AI (Workers AI, hébergé Cloudflare) en extrait
 * les FAITS : combien de tables, quelles formes, combien de places, terrasse
 * ou intérieur, comptoir. Jamais de coordonnées — un modèle vision compte
 * bien mais place mal.
 *
 * Ce module n'écrit RIEN dans le plan. Il réduit les photos côté client,
 * appelle POST /api/ai/salle-import (une photo = un espace), agrège les faits
 * et les remet à `onFacts` — le plan de salle (pages-pro.js) pré-remplit
 * alors son questionnaire et son générateur produit trois plans propres que
 * le commerçant compare et confirme. Un seul chemin d'écriture : le sien.
 *
 * Dépend de : Kiwi.modal. Fail-soft : sans backend (démo locale, hors ligne),
 * l'appel AI échoue proprement et le questionnaire reste le chemin normal.
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const toast = (t, o) => { try { window.Kiwi && Kiwi.toast && Kiwi.toast(t, o); } catch (_) {} };

  /* Langue : le texte français est l'original, écrit ici ; l'anglais et
   * l'arabe viennent des clés salleScan.* de assets/i18n.js, comme le fait
   * invoice.js pour son habillage. {n}, {max}… sont remplacés après la
   * traduction, pour que chaque langue place le nombre où elle veut. */
  const lang = () => { try { return (window.KiwiI18n && KiwiI18n.getLang && KiwiI18n.getLang()) || 'fr'; } catch (_) { return 'fr'; } };
  function L(key, fr, vars) {
    let s = fr;
    try {
      const d = window.KiwiI18n && KiwiI18n.T && KiwiI18n.T[lang()];
      if (d && typeof d['salleScan.' + key] === 'string') s = d['salleScan.' + key];
    } catch (_) {}
    return vars ? s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  }

  const MAX_FILES = 4;        // une photo par espace (salle, terrasse, étage…)
  const MAX_IMG_EDGE = 1600;  // px — assez pour compter les chaises, léger à envoyer

  /* ── forme + places observées → type de table du plan de salle ─────────────
   * Les clés sont celles de PDS_TABLE_TYPES (floorplan-core.js). */
  function typeFor(shape, seats) {
    if (shape === 'bar') return 'bar';
    if (shape === 'high') return 'high';
    if (shape === 'square') return seats <= 2 ? 'sq2' : 'sq4';
    if (shape === 'rect') {
      if (seats <= 4) return 'rect4';
      if (seats <= 6) return 'rect6';
      if (seats <= 8) return 'rect8';
      return 'rect10';
    }
    /* round, et tout ce qui reste */
    if (seats <= 2) return 'round2';
    if (seats <= 4) return 'round4';
    if (seats <= 6) return 'round6';
    return 'round8';
  }
  const TYPE_SEATS = { round2: 2, round4: 4, round6: 6, round8: 8, sq2: 2, sq4: 4, rect4: 4, rect6: 6, rect8: 8, rect10: 10, bar: 1, high: 2 };

  /* Histogramme {type: n} → mix proportionnel pour pdsGeneratePlan : chaque
   * type pèse dans le mix ce qu'il pèse dans la salle photographiée. */
  function mixFrom(hist) {
    const entries = Object.entries(hist).filter(([, c]) => c > 0).sort((a, b) => b[1] - a[1]).slice(0, 6);
    const total = entries.reduce((s, [, c]) => s + c, 0);
    if (!total) return [];
    const mix = [];
    entries.forEach(([type, c]) => {
      const reps = Math.max(1, Math.round((c / total) * 6));
      for (let i = 0; i < reps && mix.length < 8; i++) mix.push([type, TYPE_SEATS[type] || 4]);
    });
    return mix;
  }

  /* Réponses serveur (une par photo) → faits agrégés pour le questionnaire. */
  function aggregate(results) {
    const hist = {};
    let total = 0, outdoor = false, counter = false, venue = '';
    results.forEach((r) => {
      if (!r) return;
      if (r.outdoor) outdoor = true;
      if (r.counter) counter = true;
      if (!venue && r.venue) venue = r.venue;
      (r.tables || []).forEach((t) => {
        const type = typeFor(t.shape, t.seats);
        hist[type] = (hist[type] || 0) + t.count;
        total += t.count;
      });
    });
    if (!total) return null;
    return { venue: venue || 'restaurant', tables: total, mix: mixFrom(hist), terrasse: outdoor, counter };
  }

  /* Une photo de salle en 4000×3000 n'apprend rien de plus au modèle qu'en
   * 1600 px de grand côté — mais coûte dix fois plus à envoyer. */
  function downscaleImage(file) { return window.KiwiAiImageImport.downscaleImage(file); }

  function callApi(image, signal) {
    return window.KiwiAiImageImport.callApi('/api/ai/salle-import', { image }, signal);
  }

  /* Lus à l'affichage, pas au chargement : la langue peut changer entre-temps. */
  const FAIL_MSGS = {
    timeout: () => [L('timeoutT', 'Délai dépassé'), L('timeoutD', 'Le scan a pris trop de temps. Choisissez à nouveau vos photos pour réessayer.')],
    auth: () => [L('authT', 'Compte Kiwi requis'), L('authD', 'Le scan AI fonctionne avec un compte connecté. Le questionnaire reste disponible.')],
    quota: () => [L('quotaT', 'Limite du jour atteinte'), L('quotaD', 'Réessayez demain, ou passez par le questionnaire.')],
    'not-a-room': () => [L('roomT', 'Ce n\'est pas une salle'), L('roomD', 'La photo ne montre pas un espace de restauration. Photographiez la salle, ou un croquis du plan.')],
    unparsed: () => [L('unparsedT', 'Photo illisible'), L('unparsedD', 'Le modèle n\'a pas reconnu de tables. Essayez une photo plus large, prise d\'un angle de la salle.')],
  };
  function failToast(err) {
    const pick = Object.prototype.hasOwnProperty.call(FAIL_MSGS, err && err.message) ? FAIL_MSGS[err.message] : null;
    const [t, d] = pick ? pick() : [L('failT', 'Scan impossible'), L('failD', 'Réessayez, ou passez par le questionnaire.')];
    toast(t, { type: 'warn', desc: d });
  }

  /* ── styles du modal (injectés une fois, préfixe kss-) ── */
  function ensureCss() {
    if (document.getElementById('kss-css')) return;
    const s = document.createElement('style');
    s.id = 'kss-css';
    s.textContent = '.kss-busy{text-align:center;padding:44px 20px}.kss-busy .sp{width:34px;height:34px;margin:0 auto 16px;border:3px solid var(--n-200);border-top-color:var(--atlas);border-radius:50%;animation:kss-spin .8s linear infinite}@keyframes kss-spin{to{transform:rotate(360deg)}}.kss-busy b{display:block;font-size:15px;margin-bottom:4px}.kss-busy span{font-size:12px;color:var(--n-500)}.kss-note{margin-top:10px;font-size:11.5px;color:var(--n-500);text-align:center}.kss-tips{margin:14px 0 0;padding:0;list-style:none;display:grid;gap:6px}.kss-tips li{font-size:12px;color:var(--n-500);padding-left:18px;position:relative}.kss-tips li:before{content:"";position:absolute;left:2px;top:6px;width:6px;height:6px;border-radius:50%;background:var(--atlas)}';
    document.head.appendChild(s);
  }

  function busyHtml(title, sub) { return window.KiwiAiImageImport.busyHtml('kss', title, sub); }

  function stage1Html() {
    return [
      '<div class="st-dropzone" data-kss-drop tabindex="0" role="button" aria-label="' + esc(L('pick', 'Choisir des photos')) + '">',
      '  <div class="st-dropzone-t">' + esc(L('dropT', 'Photo de votre salle · ou d\'un croquis du plan')) + '</div>',
      '  <div class="st-dropzone-s">' + esc(L('dropS', 'Une photo par espace (salle, terrasse…), jusqu\'à {max}', { max: MAX_FILES })) + '</div>',
      '  <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">',
      '    <button class="st-btn" type="button" data-kss-pick>' + esc(L('pick', 'Choisir des photos')) + '</button>',
      '    <button class="st-btn" type="button" data-kss-cam>' + esc(L('cam', 'Prendre une photo')) + '</button>',
      '  </div>',
      '</div>',
      '<input type="file" hidden multiple accept="image/*" data-kss-file />',
      '<input type="file" hidden accept="image/*" capture="environment" data-kss-camfile />',
      '<ul class="kss-tips">',
      '  <li>' + esc(L('tip1', 'Placez-vous dans un angle de la salle, pour voir un maximum de tables.')) + '</li>',
      '  <li>' + esc(L('tip2', 'Kiwi AI compte les tables, les formes et les places · vous ajustez ensuite.')) + '</li>',
      '</ul>',
      '<div class="kss-note">' + esc(L('note', 'Analyse par Kiwi AI (hébergée Cloudflare). Trois plans vous seront proposés · rien n\'est remplacé sans votre confirmation.')) + '</div>',
    ].join('');
  }

  function open(opts) {
    opts = opts || {};
    ensureCss();
    if (!window.Kiwi || !Kiwi.modal) return;

    const m = Kiwi.modal({
      tag: 'Kiwi AI', title: L('title', 'Scanner ma salle'), width: 560,
      body: '<div data-kss-stage></div>',
      foot: '<button class="st-btn" data-kss-cancel type="button">' + esc(L('cancel', 'Annuler')) + '</button>',
    });
    /* Le modal porte sa propre langue et son sens de lecture : en arabe, de
     * droite à gauche, même si la page ne l'a pas encore basculée. */
    const lg = lang();
    m.el.setAttribute('lang', lg);
    m.el.setAttribute('dir', lg === 'ar' ? 'rtl' : 'ltr');
    const stage = m.el.querySelector('[data-kss-stage]');
    let busy = false;
    let operation = null;
    const closeModal = m.close.bind(m);
    m.close = () => { if (operation) operation.abort(); closeModal(); };

    function render() { stage.innerHTML = stage1Html(); }

    async function runFiles(files) {
      if (busy) return;
      const list = [...files];
      if (list.length > MAX_FILES) {
        toast(L('limitT', 'Sélection refusée'), { type: 'warn', desc: L('limitD',
          'Maximum {max} photos. Aucune photo analysée. Fichiers au-delà de la limite : {files}',
          { max: MAX_FILES, files: list.slice(MAX_FILES).map((file) => file.name).join(', ') }) });
        return;
      }
      if (!list.length) return;
      busy = true;
      const signal = (operation = new AbortController()).signal;
      try {
        const results = [];
        for (let i = 0; i < list.length; i++) {
          stage.innerHTML = busyHtml(
            list.length > 1 ? L('readingN', 'Lecture {i} / {total}', { i: i + 1, total: list.length }) : L('reading1', 'Lecture de la photo…'),
            L('readingSub', 'Kiwi AI compte les tables et les places.')
          );
          results.push(await callApi(await downscaleImage(list[i]), signal));
        }
        const facts = aggregate(results);
        if (!facts) { failToast(new Error('unparsed')); render(); busy = false; return; }
        /* Les faits partent dans le questionnaire du plan — et CE modal se
         * ferme : le générateur devient la seule surface, pas une pile. */
        m.close();
        toast(facts.tables > 1 ? L('foundN', '{n} tables repérées', { n: facts.tables }) : L('found1', '{n} table repérée', { n: facts.tables }), {
          type: 'success',
          desc: L('foundD', 'Vérifiez les réponses pré-remplies, puis générez le plan.'),
        });
        if (opts.onFacts) opts.onFacts(facts);
      } catch (err) { if (!signal.aborted) { failToast(err); render(); } }
      busy = false;
    }

    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kss-cancel]')) { m.close(); return; }
      if (e.target.closest('[data-kss-cam]')) { m.el.querySelector('[data-kss-camfile]').click(); return; }
      if (e.target.closest('[data-kss-pick]') || e.target.closest('[data-kss-drop]')) { m.el.querySelector('[data-kss-file]').click(); return; }
    });
    /* La zone de dépôt est un role="button" focusable : Entrée et Espace
     * l'activent comme un clic. Ses deux vrais boutons gardent leur
     * comportement natif (la cible doit être la zone elle-même). */
    m.el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
      if (!e.target.matches || !e.target.matches('[data-kss-drop]')) return;
      e.preventDefault();
      m.el.querySelector('[data-kss-file]').click();
    });
    m.el.addEventListener('change', (e) => {
      if (e.target.matches('[data-kss-file]') || e.target.matches('[data-kss-camfile]')) runFiles(e.target.files || []);
    });
    ['dragenter', 'dragover'].forEach((n) => m.el.addEventListener(n, (e) => {
      if (e.target.closest('[data-kss-drop]')) { e.preventDefault(); e.target.closest('[data-kss-drop]').classList.add('is-dragover'); }
    }));
    m.el.addEventListener('dragleave', (e) => {
      const d = e.target.closest('[data-kss-drop]'); if (d) d.classList.remove('is-dragover');
    });
    m.el.addEventListener('drop', (e) => {
      const d = e.target.closest('[data-kss-drop]'); if (!d) return;
      e.preventDefault(); d.classList.remove('is-dragover');
      if (e.dataTransfer && e.dataTransfer.files) runFiles(e.dataTransfer.files);
    });

    render();
    return m;
  }

  window.KiwiSalleScan = { open, _typeFor: typeFor, _mixFrom: mixFrom, _aggregate: aggregate };
})();
