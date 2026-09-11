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
  function downscaleImage(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, MAX_IMG_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * scale));
          const h = Math.max(1, Math.round(img.naturalHeight * scale));
          const canvas = document.createElement('canvas');
          canvas.width = w; canvas.height = h;
          canvas.getContext('2d').drawImage(img, 0, 0, w, h);
          URL.revokeObjectURL(url);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (e) { URL.revokeObjectURL(url); reject(e); }
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image')); };
      img.src = url;
    });
  }

  async function callApi(image) {
    const venue = (window.Kiwi && Kiwi.venue && Kiwi.venue()) || '';
    const res = await fetch('/api/ai/salle-import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ merchant: venue, image }),
    });
    let data = null;
    try { data = await res.json(); } catch (_) {}
    if (res.status === 401) throw new Error('auth');
    if (res.status === 429) throw new Error('quota');
    if (!res.ok) throw new Error('server');
    if (!data || !data.ok) throw new Error((data && (data.reason || data.error)) || 'unparsed');
    return data;
  }

  const FAIL_MSGS = {
    auth: ['Compte Kiwi requis', 'Le scan AI fonctionne avec un compte connecté. Le questionnaire reste disponible.'],
    quota: ['Limite du jour atteinte', 'Réessayez demain, ou passez par le questionnaire.'],
    'not-a-room': ['Ce n\'est pas une salle', 'La photo ne montre pas un espace de restauration. Photographiez la salle, ou un croquis du plan.'],
    unparsed: ['Photo illisible', 'Le modèle n\'a pas reconnu de tables. Essayez une photo plus large, prise d\'un angle de la salle.'],
  };
  function failToast(err) {
    const [t, d] = FAIL_MSGS[err && err.message] || ['Scan impossible', 'Réessayez, ou passez par le questionnaire.'];
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

  function busyHtml(title, sub) {
    return '<div class="kss-busy"><div class="sp"></div><b>' + esc(title) + '</b><span>' + esc(sub) + '</span></div>';
  }

  function stage1Html() {
    return [
      '<div class="st-dropzone" data-kss-drop tabindex="0" role="button">',
      '  <div class="st-dropzone-t">Photo de votre salle · ou d\'un croquis du plan</div>',
      '  <div class="st-dropzone-s">Une photo par espace (salle, terrasse…), jusqu\'à ' + MAX_FILES + '</div>',
      '  <div style="display:flex;gap:10px;justify-content:center;margin-top:12px;">',
      '    <button class="st-btn" type="button" data-kss-pick>Choisir des photos</button>',
      '    <button class="st-btn" type="button" data-kss-cam>Prendre une photo</button>',
      '  </div>',
      '</div>',
      '<input type="file" hidden multiple accept="image/*" data-kss-file />',
      '<input type="file" hidden accept="image/*" capture="environment" data-kss-camfile />',
      '<ul class="kss-tips">',
      '  <li>Placez-vous dans un angle de la salle, pour voir un maximum de tables.</li>',
      '  <li>Kiwi AI compte les tables, les formes et les places · vous ajustez ensuite.</li>',
      '</ul>',
      '<div class="kss-note">Analyse par Kiwi AI (hébergée Cloudflare). Trois plans vous seront proposés · rien n\'est remplacé sans votre confirmation.</div>',
    ].join('');
  }

  function open(opts) {
    opts = opts || {};
    ensureCss();
    if (!window.Kiwi || !Kiwi.modal) return;

    const m = Kiwi.modal({
      tag: 'Kiwi AI', title: 'Scanner ma salle', width: 560,
      body: '<div data-kss-stage></div>',
      foot: '<button class="st-btn" data-kss-cancel type="button">Annuler</button>',
    });
    const stage = m.el.querySelector('[data-kss-stage]');
    let busy = false;

    function render() { stage.innerHTML = stage1Html(); }

    async function runFiles(files) {
      if (busy) return;
      const list = [...files].slice(0, MAX_FILES);
      if (!list.length) return;
      busy = true;
      try {
        const results = [];
        for (let i = 0; i < list.length; i++) {
          stage.innerHTML = busyHtml(
            list.length > 1 ? 'Lecture ' + (i + 1) + ' / ' + list.length : 'Lecture de la photo…',
            'Kiwi AI compte les tables et les places.'
          );
          results.push(await callApi(await downscaleImage(list[i])));
        }
        const facts = aggregate(results);
        if (!facts) { failToast(new Error('unparsed')); render(); busy = false; return; }
        /* Les faits partent dans le questionnaire du plan — et CE modal se
         * ferme : le générateur devient la seule surface, pas une pile. */
        m.close();
        toast(facts.tables + ' table' + (facts.tables > 1 ? 's' : '') + ' repérée' + (facts.tables > 1 ? 's' : ''), {
          type: 'success',
          desc: 'Vérifiez les réponses pré-remplies, puis générez le plan.',
        });
        if (opts.onFacts) opts.onFacts(facts);
      } catch (err) { failToast(err); render(); }
      busy = false;
    }

    m.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-kss-cancel]')) { m.close(); return; }
      if (e.target.closest('[data-kss-cam]')) { m.el.querySelector('[data-kss-camfile]').click(); return; }
      if (e.target.closest('[data-kss-pick]') || e.target.closest('[data-kss-drop]')) { m.el.querySelector('[data-kss-file]').click(); return; }
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
