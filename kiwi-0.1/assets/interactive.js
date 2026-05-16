/* ==========================================================================
   Kiwi v2 — Interactive layer
   One global click handler that routes data-action attributes to handlers.
   Primitives: toast, modal, drawer, confetti, ripple, copy, palette.
   Every button on every page should resolve to ONE of these handlers — no
   dead clicks. Add new actions by registering a handler in ACTIONS below.
   ========================================================================== */

(function () {
  "use strict";

  // -----------------------------------------------------------------------
  // 1. TOAST — bottom-right notification, auto-dismisses
  // -----------------------------------------------------------------------
  function ensureToastLayer() {
    let layer = document.getElementById("kiwi-toast-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.id = "kiwi-toast-layer";
      layer.className = "k-toast-layer";
      layer.setAttribute("aria-live", "polite");
      layer.setAttribute("role", "status");
      document.body.appendChild(layer);
    }
    return layer;
  }

  function toast(message, opts) {
    opts = opts || {};
    const layer = ensureToastLayer();
    const el = document.createElement("div");
    el.className = "k-toast" + (opts.kind ? " k-toast--" + opts.kind : "");
    el.innerHTML =
      (opts.icon ? '<span class="k-toast-ic">' + opts.icon + "</span>" : "") +
      '<span class="k-toast-msg">' + message + "</span>" +
      (opts.action ? '<button class="k-toast-act" data-toast-action="1">' + opts.action + "</button>" : "");
    layer.appendChild(el);
    requestAnimationFrame(() => el.classList.add("k-toast--in"));
    const dur = opts.duration || 3600;
    const timeout = setTimeout(() => dismissToast(el), dur);
    el.addEventListener("click", (e) => {
      if (e.target.matches("[data-toast-action]") && opts.onAction) opts.onAction();
      clearTimeout(timeout);
      dismissToast(el);
    });
    return el;
  }
  function dismissToast(el) {
    el.classList.remove("k-toast--in");
    el.classList.add("k-toast--out");
    setTimeout(() => el.remove(), 280);
  }

  // -----------------------------------------------------------------------
  // 2. MODAL — backdrop + centered glass card with auto-close
  // -----------------------------------------------------------------------
  function modal(opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "k-modal";
    wrap.setAttribute("role", "dialog");
    wrap.setAttribute("aria-modal", "true");
    wrap.innerHTML =
      '<div class="k-modal-card" role="document">' +
      (opts.title ? '<header class="k-modal-h"><h3>' + opts.title + "</h3>" +
        '<button class="k-modal-x" aria-label="Fermer" data-dismiss>' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>' +
        "</button></header>" : "") +
      '<div class="k-modal-body">' + (opts.body || "") + "</div>" +
      (opts.footer ? '<footer class="k-modal-f">' + opts.footer + "</footer>" : "") +
      "</div>";
    document.body.appendChild(wrap);
    document.body.classList.add("k-no-scroll");
    requestAnimationFrame(() => wrap.classList.add("k-modal--open"));

    const close = () => {
      wrap.classList.remove("k-modal--open");
      document.body.classList.remove("k-no-scroll");
      setTimeout(() => wrap.remove(), 280);
      document.removeEventListener("keydown", esc);
      if (typeof opts.onClose === "function") opts.onClose();
    };
    function esc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", esc);

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest("[data-dismiss]")) close();
    });
    return { el: wrap, close };
  }

  // -----------------------------------------------------------------------
  // 3. DRAWER — slide-in from the right
  // -----------------------------------------------------------------------
  function drawer(opts) {
    opts = opts || {};
    const wrap = document.createElement("div");
    wrap.className = "k-drawer";
    wrap.innerHTML =
      '<div class="k-drawer-card" role="dialog" aria-modal="true">' +
      '<header class="k-drawer-h">' +
      '<h3>' + (opts.title || "") + "</h3>" +
      '<button class="k-drawer-x" aria-label="Fermer" data-dismiss>' +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="6" y1="18" x2="18" y2="6"/></svg>' +
      "</button></header>" +
      '<div class="k-drawer-body">' + (opts.body || "") + "</div>" +
      (opts.footer ? '<footer class="k-drawer-f">' + opts.footer + "</footer>" : "") +
      "</div>";
    document.body.appendChild(wrap);
    document.body.classList.add("k-no-scroll");
    requestAnimationFrame(() => wrap.classList.add("k-drawer--open"));

    const close = () => {
      wrap.classList.remove("k-drawer--open");
      document.body.classList.remove("k-no-scroll");
      setTimeout(() => wrap.remove(), 320);
      document.removeEventListener("keydown", esc);
      if (typeof opts.onClose === "function") opts.onClose();
    };
    function esc(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", esc);

    wrap.addEventListener("click", (e) => {
      if (e.target === wrap || e.target.closest("[data-dismiss]")) close();
    });
    return { el: wrap, close };
  }

  // -----------------------------------------------------------------------
  // 4. CONFETTI — for milestones (Daret payout, Aid greeting, success)
  // -----------------------------------------------------------------------
  function confetti() {
    const COLORS = ["#0B6E4F", "#7DF2B0", "#053B2C", "#C97B2D", "#F7F5F0"];
    const N = 80;
    const layer = document.createElement("div");
    layer.className = "k-confetti";
    document.body.appendChild(layer);
    for (let i = 0; i < N; i++) {
      const p = document.createElement("i");
      const x = (Math.random() - 0.5) * 600;
      const y = -200 - Math.random() * 400;
      const r = (Math.random() - 0.5) * 720;
      const c = COLORS[i % COLORS.length];
      const w = 5 + Math.random() * 8;
      const h = 8 + Math.random() * 12;
      p.style.cssText =
        "left:50%;top:50%;width:" + w + "px;height:" + h + "px;background:" + c +
        ";--tx:" + x + "px;--ty:" + y + "px;--rot:" + r + "deg;animation-delay:" + (i * 8) + "ms;";
      layer.appendChild(p);
    }
    setTimeout(() => layer.remove(), 2400);
  }

  // -----------------------------------------------------------------------
  // 5. RIPPLE — press feedback on any data-ripple element
  // -----------------------------------------------------------------------
  function ripple(target, e) {
    const r = target.getBoundingClientRect();
    const x = (e.clientX || r.left + r.width / 2) - r.left;
    const y = (e.clientY || r.top + r.height / 2) - r.top;
    const i = document.createElement("span");
    i.className = "k-ripple";
    i.style.left = x + "px";
    i.style.top = y + "px";
    target.appendChild(i);
    setTimeout(() => i.remove(), 600);
  }

  // -----------------------------------------------------------------------
  // 6. COPY — to clipboard with toast confirmation
  // -----------------------------------------------------------------------
  async function copy(text, label) {
    try {
      await navigator.clipboard.writeText(text);
      toast((label || "Copié") + " · " + text, { kind: "success", icon: "✓" });
    } catch (e) {
      toast("Impossible de copier", { kind: "error", icon: "✕" });
    }
  }

  // -----------------------------------------------------------------------
  // 7. ACTION ROUTER — single handler for all data-action="*" clicks
  // -----------------------------------------------------------------------
  const ACTIONS = {

    /* ---------- Generic ---------- */

    "toast": (el) => toast(el.dataset.toast || el.textContent.trim(), {
      kind: el.dataset.kind, icon: el.dataset.icon
    }),

    "copy": (el) => copy(el.dataset.copy, el.dataset.label),

    "confetti": () => confetti(),

    "soon": () => toast("Bientôt disponible", { icon: "⏳" }),

    /* ---------- Demo / contact ---------- */

    "demo": () => modal({
      title: "Réserver une démo",
      body:
        '<p class="k-p">Une démo Kiwi dure 20 minutes. On te montre la caisse, le wallet, et on configure ton premier paiement en direct.</p>' +
        '<form class="k-form" onsubmit="event.preventDefault(); window.Kiwi.toast(\'Démo envoyée · on te recontacte sous 4h\', {kind:\'success\', icon:\'✓\'}); this.closest(\'.k-modal\').click();">' +
        '<label>Téléphone <input required type="tel" placeholder="+212 6 12 34 56 78"></label>' +
        '<label>Type de commerce <select><option>Café · restaurant</option><option>Boutique · retail</option><option>Riad · hôtellerie</option><option>Atelier · artisanat</option><option>Service · profession libérale</option></select></label>' +
        '<label>Volume mensuel <select><option>< 10 000 DH</option><option>10 000 – 50 000 DH</option><option>50 000 – 250 000 DH</option><option>> 250 000 DH</option></select></label>' +
        '<button type="submit" class="btn btn-primary btn-lg" style="width:100%; margin-top:8px;">Recevoir un appel</button>' +
        "</form>"
    }),

    "whatsapp": () => {
      window.open("https://wa.me/212522000000?text=" + encodeURIComponent("Salut Kiwi, j'aimerais en savoir plus sur la solution POS."), "_blank");
    },

    "video": () => modal({
      title: "Démo Kiwi · 90 secondes",
      body:
        '<div class="k-video-frame">' +
        '<div class="k-video-mock"><div class="k-video-play">▶</div><span class="k-video-caption">Démo · Café Atlas, Maarif · 0:00 / 1:32</span></div>' +
        '<p class="k-p" style="margin-top:16px;">Une vraie session — Youssef encaisse 14 transactions en 90 secondes (Tap-to-Pay, QR table, Wafacash, DCC EUR).</p>' +
        "</div>"
    }),

    /* ---------- Feature deep-dives (drawer per feature) ---------- */

    "feature": (el) => {
      const key = el.dataset.feature || el.dataset.action;
      const f = FEATURES[key] || FEATURES["default"];
      drawer({ title: f.title, body: f.body, footer: f.footer });
    },

    /* ---------- Dashboard nav ---------- */

    "nav": (el) => {
      const view = el.dataset.nav;
      document.querySelectorAll(".nav-row").forEach((b) => b.classList.toggle("active", b === el));
      const n = NAV_VIEWS[view] || NAV_VIEWS["default"];
      // Update breadcrumb
      const crumb = document.getElementById("breadcrumb") || document.querySelector(".top-crumb .here");
      if (crumb) crumb.textContent = n.title;
      toast(n.title + " · " + (n.toast || "ouvert"), { icon: n.icon || "→" });
    },

    "store-switch": () => drawer({
      title: "Changer de boutique",
      body:
        '<ul class="k-list">' +
        STORES.map((s) => '<li data-store="' + s.code + '"><span class="k-list-av" style="background:' + s.color + ';">' + s.code + '</span>' +
          '<div><strong>' + s.name + '</strong><span>' + s.city + ' · ' + s.staff + ' employés</span></div>' +
          '<span class="k-list-meta">' + s.kpi + '</span></li>').join("") +
        "</ul>"
    }),

    "new-sale": () => modal({
      title: "Nouvelle vente",
      body:
        '<div class="k-tab-bar"><button class="k-tab k-tab--on">Tap-to-Pay</button><button class="k-tab">QR table</button><button class="k-tab">Lien de paiement</button><button class="k-tab">Espèces</button></div>' +
        '<div class="k-amount-pad">' +
        '<div class="k-amount-display"><span class="k-amount-cur">DH</span><span class="k-amount-val">0,00</span></div>' +
        '<div class="k-keypad">' + ["1","2","3","4","5","6","7","8","9",".","0","⌫"].map((k) => '<button class="k-key">' + k + "</button>").join("") + "</div>" +
        '<button class="btn btn-primary btn-lg" style="width:100%;" onclick="window.Kiwi.toast(\'Encaissement lancé · approche la carte\', {kind:\'success\', icon:\'✓\'}); this.closest(\'.k-modal\').click();">Encaisser maintenant</button>' +
        "</div>"
    }),

    "export": () => {
      toast("Export en cours · format DGI conforme", { icon: "⤓" });
      setTimeout(() => toast("Export prêt · ventes_2026-04-25.xlsx", { kind: "success", icon: "✓", duration: 5000 }), 1800);
    },

    "kiwi-iq": () => drawer({
      title: "Kiwi IQ · ton assistant",
      body:
        '<div class="k-iq-chat">' +
        '<div class="k-iq-msg k-iq-msg--ai">Salam Youssef. Hier tu as encaissé 18 420 DH (+12,4 % vs lundi). Trois choses à savoir aujourd\'hui :' +
        '<ol><li>Pic à 19h05 · prévois Asma + Imane en caisse</li><li>Chebakia · rupture J+3, je commande 25 kg ?</li><li>Bundle Thé+Msemen testé · +18 % de panier moyen</li></ol></div>' +
        '<div class="k-iq-msg k-iq-msg--user">Lance la commande chez Soukra Pâtisserie</div>' +
        '<div class="k-iq-msg k-iq-msg--ai">Commande envoyée à Soukra Pâtisserie · 25 kg de chebakia · 1 050 DH · livraison demain 8h. Tu confirmes ?<div class="k-iq-actions"><button class="btn btn-primary btn-sm">Confirmer</button><button class="btn btn-ghost btn-sm">Modifier</button></div></div>' +
        "</div>" +
        '<div class="k-iq-input"><input placeholder="Demande à Kiwi IQ — en français, en العربية, en Darija…"><button class="btn btn-primary btn-sm">Envoyer</button></div>'
    }),

    "notifications": () => drawer({
      title: "Notifications",
      body:
        '<ul class="k-list">' +
        '<li><span class="k-list-av k-list-av--ink">!</span><div><strong>Stock bas · Jus d\'orange</strong><span>4 unités restantes · commande recommandée</span></div><span class="k-list-meta">il y a 3 min</span></li>' +
        '<li><span class="k-list-av k-list-av--mint">✓</span><div><strong>Versement reçu</strong><span>12 480 DH versés sur ton IBAN BMCE</span></div><span class="k-list-meta">9h00</span></li>' +
        '<li><span class="k-list-av">i</span><div><strong>Mode Ramadan disponible</strong><span>Active-le en un clic · 14 mars 2026</span></div><span class="k-list-meta">hier</span></li>' +
        "</ul>"
    }),

    "profile": () => drawer({
      title: "Youssef El Amrani",
      body:
        '<div class="k-profile">' +
        '<div class="k-profile-h"><span class="k-profile-av">YA</span><div><strong>Youssef El Amrani</strong><span>Gérant · Café Atlas · #EMP0032</span></div></div>' +
        '<ul class="k-list k-list--menu">' +
        '<li data-action="copy" data-copy="EMP0032" data-label="ID copié"><span>Mon ID employé</span><code>EMP0032</code></li>' +
        '<li data-action="soon"><span>Mes paramètres</span><span>→</span></li>' +
        '<li data-action="soon"><span>Mes rapports</span><span>→</span></li>' +
        '<li data-action="soon"><span>Aide · Support 24/7</span><span>→</span></li>' +
        '<li data-action="logout"><span>Se déconnecter</span><span>→</span></li>' +
        "</ul></div>"
    }),

    "logout": () => {
      toast("Déconnexion en cours…", { icon: "→" });
      setTimeout(() => { window.location.href = "index.html"; }, 1200);
    },

    "range": (el) => {
      const r = el.dataset.range || "Aujourd'hui";
      // Update display in any range trigger
      document.querySelectorAll(".range-label").forEach((x) => { x.textContent = r; });
      toast("Plage · " + r, { icon: "📅" });
    },

    "filter-status": (el) => {
      const s = el.dataset.status || el.textContent.trim();
      toast("Filtré · " + s, { icon: "▾" });
    },

    /* ---------- Wallet quick actions ---------- */

    "send": () => modal({
      title: "Envoyer de l'argent",
      body:
        '<div class="k-tab-bar"><button class="k-tab k-tab--on">À un ami</button><button class="k-tab">À ma famille</button><button class="k-tab">Au Maroc</button><button class="k-tab">À l\'étranger</button></div>' +
        '<form class="k-form" onsubmit="event.preventDefault(); window.Kiwi.toast(\'Envoyé en 47 secondes · 1,2 % de frais\', {kind:\'success\', icon:\'✓\'}); this.closest(\'.k-modal\').click();">' +
        '<label>Destinataire <input required placeholder="Nom ou téléphone +212…"></label>' +
        '<label>Montant <div class="k-amount-row"><input required type="number" placeholder="0,00"><select><option>DH</option><option>EUR</option><option>USD</option></select></div></label>' +
        '<label>Message (optionnel) <input placeholder="Khabar zwin · pour ta semaine"></label>' +
        '<button type="submit" class="btn btn-primary btn-lg" style="width:100%; margin-top:8px;">Envoyer</button>' +
        "</form>"
    }),

    "receive": () => modal({
      title: "Recevoir un paiement",
      body:
        '<div class="k-qr-mock"><div class="k-qr-pattern"></div></div>' +
        '<p class="k-p" style="text-align:center;">Montre ce code QR · le paiement arrive instantanément sur ton compte Kiwi.</p>' +
        '<button class="btn btn-primary btn-lg" style="width:100%;" data-action="copy" data-copy="https://kiwi.app/pay/yhilali">Copier le lien</button>'
    }),

    "scan": () => toast("Scanner activé · approche un code QR", { icon: "▣" }),

    "card": () => drawer({
      title: "Carte Kiwi · Yasmine Hilali",
      body:
        '<div class="k-card-flip" id="kCardFlip">' +
        '<div class="k-card-side k-card-front">' +
        '<div class="k-card-brand">Kiwi · Visa</div>' +
        '<div class="k-card-num">4521 · 8842 · 0093 · 1207</div>' +
        '<div class="k-card-foot"><span><small>PORTEUR</small>YASMINE HILALI</span><span><small>EXP</small>09/29</span></div>' +
        "</div></div>" +
        '<div class="k-card-actions"><button class="btn btn-ghost" onclick="document.getElementById(\'kCardFlip\').classList.toggle(\'is-back\')">Voir CVV</button><button class="btn btn-ghost" data-action="copy" data-copy="4521884200931207" data-label="Numéro copié">Copier le numéro</button><button class="btn btn-ghost" data-action="card-freeze">Verrouiller</button></div>'
    }),

    "card-freeze": () => toast("Carte verrouillée · réactive en un clic", { kind: "success", icon: "🔒" }),

    "daret-circle": () => drawer({
      title: "Daret · Tour 3 sur 8",
      body:
        '<div class="k-daret-detail">' +
        '<div class="k-daret-status"><strong>2 156 DH</strong><span>déjà versés ce mois · 8/8 amis ont participé</span></div>' +
        '<ol class="k-daret-rotation">' +
        '<li class="done"><span>1</span> Karim T. <em>· 8 000 DH reçus · janvier</em></li>' +
        '<li class="done"><span>2</span> Soukaina A. <em>· 8 000 DH reçus · février</em></li>' +
        '<li class="done"><span>3</span> Yasmine H. <em>· 8 000 DH · ton tour, ce mois</em></li>' +
        '<li><span>4</span> Mehdi F. <em>· avril</em></li>' +
        '<li><span>5</span> Imane B. <em>· mai</em></li>' +
        '<li><span>6</span> Nadia A. <em>· juin</em></li>' +
        '<li><span>7</span> Rachid E. <em>· juillet</em></li>' +
        '<li><span>8</span> Fatima Z. <em>· août</em></li>' +
        "</ol></div>",
      footer:
        '<button class="btn btn-ghost" data-action="soon">Inviter un ami</button>' +
        '<button class="btn btn-primary" data-action="confetti" data-toast-success="Encaissement Daret confirmé">Encaisser mon tour</button>'
    }),

    "capital": (el) => {
      const goal = el.dataset.goal || "Objectif";
      drawer({
        title: "Capital · " + goal,
        body:
          '<div class="k-cap-detail">' +
          '<div class="k-cap-progress-large"><div class="k-cap-fill" style="width:62%;"></div></div>' +
          '<div class="k-cap-stats"><div><strong>28 480 DH</strong><span>déjà épargné</span></div><div><strong>17 520 DH</strong><span>restant</span></div><div><strong>~6 mois</strong><span>au rythme actuel</span></div></div>' +
          '<h4>Mes versements automatiques</h4>' +
          '<ul class="k-cap-list">' +
          '<li><span>Avril 2026</span><strong>+ 1 200 DH</strong><em>versé</em></li>' +
          '<li><span>Mars 2026</span><strong>+ 1 200 DH</strong><em>versé</em></li>' +
          '<li><span>Février 2026</span><strong>+ 1 200 DH</strong><em>versé</em></li>' +
          '<li class="upcoming"><span>Mai 2026</span><strong>+ 1 200 DH</strong><em>prévu</em></li>' +
          "</ul></div>",
        footer:
          '<button class="btn btn-ghost" data-action="soon">Modifier l\'objectif</button>' +
          '<button class="btn btn-primary" data-action="soon">Verser maintenant</button>'
      });
    },

    /* ---------- Pricing / compare table ---------- */

    "compare-tier": () => toast("Plan Plus déverrouille IA + multi-devises + Daret pro", { icon: "✦" }),

    /* ---------- Pitch deck navigation ---------- */

    "deck-next": () => {
      const slides = document.querySelectorAll(".slide");
      const cur = window.scrollY;
      let next = slides[0];
      slides.forEach((s) => { if (s.offsetTop > cur + 100 && s.offsetTop < next.offsetTop + window.innerHeight) next = s; });
      window.scrollTo({ top: next.offsetTop, behavior: "smooth" });
    },
    "deck-prev": () => {
      const slides = Array.from(document.querySelectorAll(".slide")).reverse();
      const cur = window.scrollY;
      let prev = slides[0];
      slides.forEach((s) => { if (s.offsetTop < cur - 100 && s.offsetTop > prev.offsetTop - window.innerHeight) prev = s; });
      window.scrollTo({ top: prev.offsetTop, behavior: "smooth" });
    },

    /* ---------- Fallback ---------- */

    "default": (el) => toast(el.dataset.toast || "Action enregistrée", { icon: "✓" }),
  };

  // -----------------------------------------------------------------------
  // 8. CONTENT — feature drawers, store switcher, nav views
  // -----------------------------------------------------------------------

  const FEATURES = {
    "tap-to-pay": {
      title: "Tap-to-Pay · sur ton téléphone",
      body:
        '<p class="k-p">Accepte Visa, Mastercard, CMI et Wafacash directement sur ton iPhone ou Android. Aucun terminal, aucun contrat.</p>' +
        '<ul class="k-feat-list">' +
        '<li><strong>Setup en 5 minutes</strong><span>Scan ta CIN, fais un selfie, ton compte est actif.</span></li>' +
        '<li><strong>Compatible iPhone XS+ / Android NFC</strong><span>Tous les modèles depuis 2018.</span></li>' +
        '<li><strong>1,79 % par transaction</strong><span>Pas d\'abonnement, pas de minimum mensuel.</span></li>' +
        '<li><strong>Versement T+1 à 9h00</strong><span>L\'argent du vendredi atterrit le samedi matin.</span></li>' +
        "</ul>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Activer Tap-to-Pay</button>'
    },
    "kiwi-iq": {
      title: "Kiwi IQ · IA en Darija",
      body:
        '<p class="k-p">"Kanchhal 3la les ventes hier ?" — l\'IA répond, ajuste tes prix, lance une campagne SMS.</p>' +
        '<div class="k-iq-demo">' +
        '<div class="k-iq-msg k-iq-msg--user">kanchhal 3la les ventes hier ?</div>' +
        '<div class="k-iq-msg k-iq-msg--ai">Hier (jeudi 24 avril) : 18 420 DH encaissés sur 184 transactions. +12,4 % vs jeudi précédent. Top produit : Thé à la menthe (312 ventes).</div>' +
        '<div class="k-iq-msg k-iq-msg--user">augmente les prix de 5 % sur la pâtisserie</div>' +
        '<div class="k-iq-msg k-iq-msg--ai">12 produits pâtisserie ajustés. Test A/B lancé sur 50 % des clients pendant 7 jours pour valider l\'élasticité.</div>' +
        "</div>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Tester Kiwi IQ</button>'
    },
    "ramadan": {
      title: "Mode Ramadan · automatique",
      body:
        '<p class="k-p">Activé automatiquement le 14 mars 2026 (1er Ramadan 1447 AH). Tout s\'adapte sans toi.</p>' +
        '<ul class="k-feat-list">' +
        '<li><strong>Horaires shifted</strong><span>Ouverture après iftar, suhoor menu visible la nuit.</span></li>' +
        '<li><strong>Alcool caché</strong><span>SKU alcool retirés du menu pendant le mois (établissements mixtes).</span></li>' +
        '<li><strong>Loyalty ×2</strong><span>Points de fidélité doublés pour Ramadan (booste la rétention).</span></li>' +
        '<li><strong>Compte à rebours iftar</strong><span>Affiché en caisse · ton équipe ne le rate jamais.</span></li>' +
        "</ul>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Activer maintenant</button>'
    },
    "qr-table": {
      title: "QR pay-at-table · sans junk fees",
      body:
        '<p class="k-p">Le client scanne, paie en 10 secondes, partage l\'addition. Frais transparents, affichés avant le tap.</p>' +
        '<ul class="k-feat-list">' +
        '<li><strong>Splitter par item</strong><span>Chaque ami paie ses propres plats.</span></li>' +
        '<li><strong>Tip en un tap</strong><span>10 % / 15 % / 20 % ou montant libre.</span></li>' +
        '<li><strong>Review nudge</strong><span>5× plus d\'avis Google après chaque paiement.</span></li>' +
        '<li><strong>Aucun frais caché</strong><span>1,79 % par tap. Point. Pas de "service fee" surprise.</span></li>' +
        "</ul>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Activer le QR table</button>'
    },
    "multi-currency": {
      title: "Multi-devises · DCC · MAD/EUR/USD/GBP",
      body:
        '<p class="k-p">Le touriste paie en EUR, USD, GBP — tu reçois en MAD. Ticket bilingue arabe + latin imprimé en 2 secondes.</p>' +
        '<ul class="k-feat-list">' +
        '<li><strong>14 M touristes/an</strong><span>Marrakech · Casablanca · Tangier · Fes.</span></li>' +
        '<li><strong>Marge captée</strong><span>0,2-0,3 % de FX margin restitué au commerçant.</span></li>' +
        '<li><strong>Reçu bilingue</strong><span>Arabe (RTL) + Latin (LTR), même papier 80mm.</span></li>' +
        "</ul>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Activer le DCC</button>'
    },
    "mode-participatif": {
      title: "Mode participatif · halal certifié",
      body:
        '<p class="k-p">Calcul de zakat automatique sur ton bénéfice net · hardware financé en murabaha (sans riba) · comptabilité conforme aux 5 banques participatives.</p>' +
        '<ul class="k-feat-list">' +
        '<li><strong>Zakat auto · 2,5 % du nisab</strong><span>Calculé sur cash + stock + créances.</span></li>' +
        '<li><strong>Murabaha hardware</strong><span>Marge transparente, contrat 18 mois, propriétaire à la fin.</span></li>' +
        '<li><strong>Sharia board AAOIFI</strong><span>Audit annuel public · zéro produit non conforme.</span></li>' +
        "</ul>",
      footer: '<button class="btn btn-ghost" data-dismiss>Plus tard</button><button class="btn btn-primary" data-action="demo">Activer le mode</button>'
    },
    "default": {
      title: "Cette feature arrive bientôt",
      body: "<p class='k-p'>On la finalise. Demande une démo et on te tient au courant.</p>",
      footer: '<button class="btn btn-primary" data-action="demo">Demander une démo</button>'
    },
  };

  const STORES = [
    { code: "CA", name: "Café Atlas · Maarif", city: "Casablanca", staff: 5, kpi: "18 420 DH", color: "linear-gradient(135deg, #0B6E4F, #7DF2B0)" },
    { code: "AG", name: "Café Atlas · Gauthier", city: "Casablanca", staff: 4, kpi: "12 880 DH", color: "linear-gradient(135deg, #053B2C, #0B6E4F)" },
    { code: "RA", name: "Café Atlas · Anfa", city: "Casablanca", staff: 6, kpi: "21 340 DH", color: "linear-gradient(135deg, #C97B2D, #F7D7B5)" },
    { code: "+", name: "Ouvrir une nouvelle boutique", city: "5 minutes via l'app", staff: 0, kpi: "→", color: "var(--paper-soft)" }
  ];

  const NAV_VIEWS = {
    "dashboard": { title: "Tableau de bord", icon: "▦", toast: "vue d'ensemble" },
    "pos": { title: "Caisse", icon: "💳", toast: "F2 pour ouvrir" },
    "orders": { title: "Commandes", icon: "📋", toast: "12 en attente" },
    "products": { title: "Produits", icon: "🏷", toast: "248 références" },
    "inventory": { title: "Stock", icon: "📦", toast: "1 alerte rupture" },
    "customers": { title: "Clients", icon: "👥", toast: "2 380 fidèles" },
    "suppliers": { title: "Fournisseurs", icon: "🚚", toast: "5 commandes en cours" },
    "team": { title: "Équipe", icon: "👤", toast: "5 employés actifs" },
    "analytics": { title: "Analyses", icon: "📈", toast: "6 rapports prêts" },
    "marketing": { title: "Marketing & IA", icon: "✦", toast: "1 campagne live" },
    "accounting": { title: "Comptabilité · TVA", icon: "📑", toast: "DGI conforme" },
    "settings": { title: "Paramètres", icon: "⚙", toast: "" },
    "integrations": { title: "Intégrations", icon: "⚡", toast: "8 connectées" },
    "default": { title: "—", icon: "→", toast: "ouvert" },
  };

  // -----------------------------------------------------------------------
  // 9. GLOBAL CLICK DELEGATOR
  // -----------------------------------------------------------------------
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-action]");
    if (!target) return;
    e.preventDefault();
    const action = target.dataset.action;
    const handler = ACTIONS[action] || ACTIONS["default"];
    handler(target, e);
  });

  // Press feedback ripple — on any .btn or [data-ripple]
  document.addEventListener("pointerdown", (e) => {
    const t = e.target.closest(".btn, [data-ripple]");
    if (!t || t.disabled) return;
    if (getComputedStyle(t).position === "static") t.style.position = "relative";
    if (getComputedStyle(t).overflow === "visible") t.style.overflow = "hidden";
    ripple(t, e);
  });

  // -----------------------------------------------------------------------
  // 10. EXPOSE
  // -----------------------------------------------------------------------
  window.Kiwi = { toast, modal, drawer, confetti, copy, ACTIONS, FEATURES };
})();
