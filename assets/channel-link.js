/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · CONNECTER UN CANAL EXTÉRIEUR — window.KiwiChannels
 * ---------------------------------------------------------------------------
 * Le bouton « Connecter » d'un agrégateur ne connectait rien : il remplaçait son
 * propre libellé par « Connecté » et affichait un toast de succès. Un clic, et
 * le commerçant croyait Glovo branché sur sa caisse — pour toujours, puisque
 * rien ne viendrait jamais le détromper.
 *
 * Ce module fait ce que ce bouton prétendait faire. Il demande au serveur une
 * clé (POST /api/channel/keys), montre au commerçant l'URL et le jeton à
 * remettre, et dit en toutes lettres ce qui manque encore pour que des
 * commandes arrivent vraiment.
 *
 * ── Ce que « connecté » veut dire, et ne veut pas dire ─────────────────────
 * La clé est réelle et fonctionne dès maintenant : n'importe quel système
 * capable de faire un POST HTTP (le connecteur d'un prestataire, un relais
 * Make / Zapier, un script de la boutique) dépose une commande qui devient un
 * ticket imprimable. Ce que Kiwi ne peut PAS faire seul, c'est obliger Glovo à
 * appeler cette URL : le programme POS de Delivery Hero (propriétaire de Glovo)
 * passe par un accord signé et des identifiants remis par un représentant
 * local. Tant qu'il n'existe pas, la clé attend — et l'écran le dit, plutôt que
 * d'afficher une pastille verte.
 *
 * API
 *   KiwiChannels.connect(channel, label)  → ouvre le panneau, renvoie Promise<bool>
 *   KiwiChannels.list()                   → Promise<[{id, channel, status, last_ts…}]>
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LANG = function () { try { return localStorage.getItem('kiwiLang') || 'fr'; } catch (_) { return 'fr'; } };

  /* Ce qu'il reste à faire APRÈS avoir la clé, par canal. C'est la partie que le
   * commerçant ne peut pas deviner et que personne d'autre ne lui dira. */
  var NOTES = {
    glovo: {
      fr: 'Glovo (groupe Delivery Hero) ne laisse pas un logiciel de caisse se brancher tout seul : leur programme POS demande un accord signé, puis des identifiants remis par leur représentant au Maroc. Donnez-leur l\'adresse et la clé ci-dessous — c\'est exactement ce qu\'ils réclament. En attendant, la clé fonctionne déjà avec un relais (Make, Zapier, votre propre script).',
      en: 'Glovo (Delivery Hero group) does not let a POS connect on its own: their POS programme requires a signed agreement, then credentials handed over by their representative in Morocco. Give them the address and key below — that is exactly what they ask for. Meanwhile the key already works with a relay (Make, Zapier, your own script).',
      ar: 'لا تسمح Glovo (مجموعة Delivery Hero) لبرنامج صندوق بالاتصال وحده: برنامجهم يتطلب اتفاقًا موقعًا ثم بيانات اعتماد يسلمها ممثلهم في المغرب. أعطهم العنوان والمفتاح أدناه.',
    },
    yassir: {
      fr: 'Yassir Express ne publie pas d\'interface de caisse ouverte. Passez par votre gestionnaire de compte, ou reliez leur tableau de bord à cette adresse via un relais (Make, Zapier).',
      en: 'Yassir Express publishes no open POS interface. Go through your account manager, or link their dashboard to this address via a relay (Make, Zapier).',
      ar: 'لا تنشر Yassir Express واجهة صندوق مفتوحة. مرّ عبر مدير حسابك أو اربط لوحتهم بهذا العنوان عبر وسيط.',
    },
    /* Shopify ne permet de configurer QU'UNE URL, sans en-tête. C'est pour ça
     * que l'adresse ci-dessous porte l'identité dans son chemin et que
     * l'authentification passe par la signature HMAC que Shopify calcule.
     * Le relais (Make, Zapier) n'est donc plus nécessaire — il reste possible
     * via une clé « générique » pour qui en a déjà un qui tourne. */
    shopify: {
      fr: 'Shopify signe chaque commande qu\'il envoie. Kiwi vérifie cette signature : il faut donc lui confier la clé que Shopify affiche au moment où vous créez le webhook. Sans elle, l\'adresse ci-dessus refuse tout — y compris les vraies commandes.',
      en: 'Shopify signs every order it sends. Kiwi verifies that signature, so it needs the key Shopify shows you when you create the webhook. Without it the address above refuses everything — including genuine orders.',
      ar: 'يوقّع Shopify كل طلب يرسله. تتحقق Kiwi من هذا التوقيع، لذا تحتاج إلى المفتاح الذي يعرضه Shopify عند إنشاء الـ webhook. بدونه يرفض العنوان أعلاه كل شيء.',
    },
    generic: {
      fr: 'N\'importe quel système capable d\'un POST HTTP peut déposer une commande ici : un relais Make ou Zapier, un script, votre site. Le format attendu est décrit sous l\'adresse.',
      en: 'Any system that can make an HTTP POST can drop an order here: a Make or Zapier relay, a script, your website. The expected format is described under the address.',
      ar: 'أي نظام قادر على POST HTTP يمكنه إيداع طلب هنا: وسيط Make أو Zapier، أو سكربت، أو موقعك.',
    },
  };

  var T = {
    fr: {
      title: 'Connecter un canal', once: 'Cette clé ne sera plus jamais affichée. Copiez-la maintenant.',
      addr: 'Adresse à appeler', key: 'Clé secrète', copy: 'Copier', copied: 'Copié',
      what: 'Ce qui se passe ensuite', fmt: 'Format attendu',
      done: 'Clé créée', pending: 'En attente du prestataire',
      err: 'Impossible de créer la clé', errSub: 'Réessayez dans un instant.',
      hdr: 'Chaque commande reçue devient un ticket en attente à la caisse. Personne ne la met en cuisine à votre place : votre équipe l\'accepte, comme une commande au comptoir.',
      hook: 'Adresse du webhook', sig: 'Clé de signature Shopify',
      sigPh: 'Collez ici la clé affichée par Shopify',
      save: 'Enregistrer', saving: '…', savedT: 'Signature enregistrée',
      savedD: 'Les commandes de cette boutique seront acceptées.',
      saveErr: 'Enregistrement impossible', saveErrD: 'Vérifiez la clé et réessayez.',
      steps: 'Dans Shopify, en trois gestes',
      st1: 'Réglages → Notifications → Webhooks → « Créer un webhook ».',
      st2: 'Événement « Création de commande », format JSON, et collez l\'adresse ci-dessus.',
      st3: 'Shopify affiche alors une clé de signature : recopiez-la ici et enregistrez.',
    },
    en: {
      title: 'Connect a channel', once: 'This key will never be shown again. Copy it now.',
      addr: 'Address to call', key: 'Secret key', copy: 'Copy', copied: 'Copied',
      what: 'What happens next', fmt: 'Expected format',
      done: 'Key created', pending: 'Waiting on the provider',
      err: 'Could not create the key', errSub: 'Try again in a moment.',
      hdr: 'Every order received becomes a pending ticket at the till. Nobody sends it to the kitchen for you: your team accepts it, like a counter order.',
      hook: 'Webhook address', sig: 'Shopify signing key',
      sigPh: 'Paste the key Shopify shows you',
      save: 'Save', saving: '…', savedT: 'Signature saved',
      savedD: 'Orders from this shop will now be accepted.',
      saveErr: 'Could not save', saveErrD: 'Check the key and try again.',
      steps: 'In Shopify, in three steps',
      st1: 'Settings → Notifications → Webhooks → "Create webhook".',
      st2: 'Event "Order creation", JSON format, and paste the address above.',
      st3: 'Shopify then shows a signing key: copy it here and save.',
    },
    ar: {
      title: 'ربط قناة', once: 'لن يُعرض هذا المفتاح مرة أخرى. انسخه الآن.',
      addr: 'العنوان المطلوب', key: 'المفتاح السري', copy: 'نسخ', copied: 'تم النسخ',
      what: 'ما يحدث بعد ذلك', fmt: 'الصيغة المتوقعة',
      done: 'تم إنشاء المفتاح', pending: 'في انتظار المزوّد',
      err: 'تعذّر إنشاء المفتاح', errSub: 'أعد المحاولة بعد لحظات.',
      hdr: 'كل طلب يصل يصبح تذكرة في انتظار الصندوق. فريقك هو من يقبلها.',
      hook: 'عنوان الـ webhook', sig: 'مفتاح توقيع Shopify',
      sigPh: 'الصق هنا المفتاح الذي يعرضه Shopify',
      save: 'حفظ', saving: '…', savedT: 'تم حفظ التوقيع',
      savedD: 'ستُقبل طلبات هذا المتجر من الآن.',
      saveErr: 'تعذّر الحفظ', saveErrD: 'تحقّق من المفتاح وأعد المحاولة.',
      steps: 'في Shopify، بثلاث خطوات',
      st1: 'الإعدادات ← الإشعارات ← Webhooks ← «إنشاء webhook».',
      st2: 'الحدث «إنشاء طلب»، صيغة JSON، والصق العنوان أعلاه.',
      st3: 'يعرض Shopify عندئذٍ مفتاح توقيع: انسخه هنا واحفظه.',
    },
  };
  var str = function () { return T[LANG()] || T.fr; };
  var note = function (ch) { var n = NOTES[ch] || NOTES.generic; return n[LANG()] || n.fr; };

  var SAMPLE = '{\n  "ref": "GLV-4712",\n  "total": 240,\n  "customer": { "name": "…", "phone": "…", "address": "…" },\n  "lines": [ { "name": "Tajine kefta", "qty": 2, "unitPrice": 120 } ]\n}';

  function toast(m, o) { try { window.Kiwi && window.Kiwi.toast && window.Kiwi.toast(m, o); } catch (_) {} }

  /* Un bloc « valeur + bouton copier ». Le jeton passe par textContent, jamais
   * par innerHTML : c'est une chaîne que le serveur vient de fabriquer, elle n'a
   * aucune raison de traverser un parseur HTML. */
  function field(label, value, mono) {
    var wrap = document.createElement('div');
    wrap.className = 'chl-f';
    var lb = document.createElement('div');
    lb.className = 'chl-f-l'; lb.textContent = label;
    var row = document.createElement('div');
    row.className = 'chl-f-r';
    var v = document.createElement('code');
    v.className = 'chl-f-v' + (mono ? ' is-key' : ''); v.textContent = value;
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chl-copy'; btn.textContent = str().copy;
    btn.addEventListener('click', function () {
      try { navigator.clipboard.writeText(value); } catch (_) {}
      btn.textContent = str().copied;
      setTimeout(function () { btn.textContent = str().copy; }, 1600);
    });
    row.appendChild(v); row.appendChild(btn);
    wrap.appendChild(lb); wrap.appendChild(row);
    return wrap;
  }

  /* Le champ où le commerçant recopie la clé que Shopify vient de lui montrer.
   * Il part vers le serveur et n'en revient jamais : rien dans l'API ne peut
   * le relire. Tant qu'il n'est pas enregistré, la porte refuse tout — et le
   * dire ici évite au commerçant de croire que coller l'adresse suffisait. */
  function sigField(linkId) {
    var s = str();
    var wrap = document.createElement('div');
    wrap.className = 'chl-f';
    var lb = document.createElement('div');
    lb.className = 'chl-f-l'; lb.textContent = s.sig;
    var row = document.createElement('div');
    row.className = 'chl-f-r';
    var inp = document.createElement('input');
    inp.type = 'text'; inp.className = 'chl-f-v chl-in'; inp.placeholder = s.sigPh;
    inp.setAttribute('autocomplete', 'off'); inp.setAttribute('spellcheck', 'false');
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'chl-copy'; btn.textContent = s.save;

    btn.addEventListener('click', function () {
      var v = String(inp.value || '').trim();
      if (!v) { inp.focus(); return; }
      btn.disabled = true; btn.textContent = s.saving;
      fetch('/api/channel/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: linkId, config: { shopifySecret: v } }),
      })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
        .then(function (out) {
          if (out.status !== 200 || !out.j || !out.j.ok) throw new Error('save');
          btn.textContent = s.savedT;
          inp.value = ''; inp.disabled = true;
          inp.placeholder = s.savedT;
          toast(s.savedT, { type: 'success', desc: s.savedD });
        })
        .catch(function () {
          btn.disabled = false; btn.textContent = s.save;
          toast(s.saveErr, { type: 'warn', desc: s.saveErrD });
        });
    });

    row.appendChild(inp); row.appendChild(btn);
    wrap.appendChild(lb); wrap.appendChild(row);
    return wrap;
  }

  function steps(s) {
    var ol = document.createElement('ol');
    ol.className = 'chl-steps';
    [s.st1, s.st2, s.st3].forEach(function (t) {
      var li = document.createElement('li'); li.textContent = t; ol.appendChild(li);
    });
    return ol;
  }

  function panel(channel, res) {
    var s = str();
    var box = document.createElement('div');
    box.className = 'chl';

    var hdr = document.createElement('p');
    hdr.className = 'chl-hdr'; hdr.textContent = s.hdr;
    box.appendChild(hdr);

    /* ── Shopify : réception native ──────────────────────────────────────────
     * Pas de jeton porteur à recopier ici — Shopify ne saurait pas l'envoyer.
     * L'identité est dans l'adresse, la preuve est dans la signature. Le seul
     * secret qui circule va donc dans l'autre sens : de Shopify vers Kiwi. */
    if (channel === 'shopify' && res.webhook) {
      box.appendChild(field(s.hook, res.webhook, false));

      var hs = document.createElement('div');
      hs.className = 'chl-h'; hs.textContent = s.steps;
      box.appendChild(hs);
      box.appendChild(steps(s));

      box.appendChild(sigField(res.key && res.key.id));

      var ps = document.createElement('p');
      ps.className = 'chl-note'; ps.textContent = note(channel);
      box.appendChild(ps);
      return box;
    }

    var warn = document.createElement('div');
    warn.className = 'chl-once'; warn.textContent = s.once;
    box.appendChild(warn);

    box.appendChild(field(s.addr, res.endpoint, false));
    box.appendChild(field(s.key, res.token, true));

    var h = document.createElement('div');
    h.className = 'chl-h'; h.textContent = s.what;
    box.appendChild(h);
    var p = document.createElement('p');
    p.className = 'chl-note'; p.textContent = note(channel);
    box.appendChild(p);

    var h2 = document.createElement('div');
    h2.className = 'chl-h'; h2.textContent = s.fmt;
    box.appendChild(h2);
    var pre = document.createElement('pre');
    pre.className = 'chl-pre';
    pre.textContent = 'POST ' + res.endpoint + '\nAuthorization: Bearer ' + '<' + s.key.toLowerCase() + '>' + '\nContent-Type: application/json\n\n' + SAMPLE;
    box.appendChild(pre);

    return box;
  }

  function connect(channel, label) {
    channel = String(channel || 'generic');
    return fetch('/api/channel/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channel, label: String(label || '') }),
    })
      .then(function (r) { return r.json().then(function (j) { return { status: r.status, j: j }; }); })
      .then(function (out) {
        var s = str();
        if (out.status !== 200 || !out.j || !out.j.ok || !out.j.token) {
          toast(s.err, { type: 'warn', desc: s.errSub });
          return false;
        }
        /* Kiwi.modal interpole `body` dans du innerHTML : lui passer un nœud
         * DOM y écrit « [object HTMLDivElement] ». On ouvre donc une coque vide
         * et on monte le panneau dedans — le jeton continue de passer par
         * textContent, sans jamais traverser un parseur HTML.
         *
         * Et surtout : si la fenêtre ne s'ouvre pas, on ne dit PAS que c'est
         * fait. La clé existe côté serveur mais le commerçant n'a pas pu la
         * lire — un toast vert ici serait exactement le mensonge que ce module
         * a été écrit pour supprimer. */
        var m = null;
        try {
          m = window.Kiwi.modal({ title: s.title + ' · ' + (label || channel), width: 620, body: '' });
          var slot = m && m.el && m.el.querySelector('.kiwi-modal-body');
          if (!slot) throw new Error('no modal body');
          slot.appendChild(panel(channel, out.j));
        } catch (_) {
          if (m && m.close) { try { m.close(); } catch (__) {} }
          toast(s.err, { type: 'warn', desc: s.errSub });
          return false;
        }
        toast(s.done, { type: 'success' });
        return true;
      })
      .catch(function () { toast(str().err, { type: 'warn', desc: str().errSub }); return false; });
  }

  function list() {
    return fetch('/api/channel/keys', { headers: { Accept: 'application/json' } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { return (j && j.keys) || []; })
      .catch(function () { return []; });
  }

  var CSS = '\
  .chl { display:flex; flex-direction:column; gap:14px; }\
  .chl-hdr { margin:0; font-size:13px; line-height:1.55; color:var(--n-600); }\
  .chl-once { padding:10px 12px; border-radius:10px; background:rgba(217,154,43,.12); color:#8A6210; font-size:12.5px; font-weight:600; }\
  .chl-f-l { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--n-500); margin-bottom:6px; }\
  .chl-f-r { display:flex; align-items:stretch; gap:8px; }\
  .chl-f-v { flex:1; min-width:0; padding:9px 11px; border:1px solid var(--n-200); border-radius:9px; background:var(--paper-soft);\
             font-family:var(--mono,ui-monospace,monospace); font-size:12px; color:var(--ink); overflow-x:auto; white-space:nowrap; }\
  .chl-f-v.is-key { color:var(--atlas); }\
  .chl-copy { flex:0 0 auto; padding:0 14px; border:0; border-radius:9px; background:var(--atlas); color:#fff;\
              font-size:12px; font-weight:600; cursor:pointer; }\
  .chl-h { font-size:11px; font-weight:700; letter-spacing:.04em; text-transform:uppercase; color:var(--n-500); margin-top:2px; }\
  .chl-note { margin:0; font-size:13px; line-height:1.6; color:var(--n-600); }\
  .chl-pre { margin:0; padding:12px; border-radius:10px; background:var(--paper-soft); border:1px solid var(--n-200);\
             font-family:var(--mono,ui-monospace,monospace); font-size:11.5px; line-height:1.6; color:var(--n-600); overflow-x:auto; }\
  .chl-in { white-space:normal; outline:none; }\
  .chl-in:focus { border-color:var(--atlas); }\
  .chl-in:disabled { color:var(--n-500); }\
  .chl-copy:disabled { opacity:.6; cursor:default; }\
  .chl-steps { margin:0; padding-inline-start:18px; display:flex; flex-direction:column; gap:6px;\
               font-size:13px; line-height:1.55; color:var(--n-600); }\
  html[data-theme="dark"] .chl-f-v.is-key { color:var(--mint); }';

  try {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  } catch (_) {}

  window.KiwiChannels = { connect: connect, list: list };
})();
