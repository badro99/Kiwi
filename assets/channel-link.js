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
    /* Attention à ce qu'on promet ici. Un webhook Shopify ne permet de
     * configurer QU'UNE URL : il n'envoie pas d'en-tête Authorization, et son
     * corps a sa propre forme (line_items, total_price en chaîne, …). Coller
     * cette adresse dans Shopify ne marcherait donc pas, et l'écrire serait
     * refaire exactement le « Connecté » qui ne connectait rien.
     * Ce qui marche aujourd'hui, c'est un relais qui traduit — d'où ce texte.
     * La réception native (signature HMAC de Shopify + traduction du format)
     * reste à construire. */
    shopify: {
      fr: 'Shopify ne sait envoyer ses commandes qu\'à une URL nue, sans en-tête d\'authentification, et dans son propre format. Passez donc par un relais (Make, Zapier, un petit script) qui reçoit le webhook « Création de commande » et le repose ici avec la clé ci-dessous. La réception directe depuis Shopify n\'est pas encore en place.',
      en: 'Shopify can only post to a bare URL, with no authentication header, and in its own format. So use a relay (Make, Zapier, a small script) that takes the "Order creation" webhook and re-posts it here with the key below. Direct Shopify intake is not in place yet.',
      ar: 'لا يمكن لـ Shopify الإرسال إلا إلى رابط مجرّد، دون ترويسة مصادقة، وبصيغته الخاصة. استخدم وسيطًا يعيد الإرسال هنا بالمفتاح أدناه. الاستقبال المباشر غير متوفر بعد.',
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
    },
    en: {
      title: 'Connect a channel', once: 'This key will never be shown again. Copy it now.',
      addr: 'Address to call', key: 'Secret key', copy: 'Copy', copied: 'Copied',
      what: 'What happens next', fmt: 'Expected format',
      done: 'Key created', pending: 'Waiting on the provider',
      err: 'Could not create the key', errSub: 'Try again in a moment.',
      hdr: 'Every order received becomes a pending ticket at the till. Nobody sends it to the kitchen for you: your team accepts it, like a counter order.',
    },
    ar: {
      title: 'ربط قناة', once: 'لن يُعرض هذا المفتاح مرة أخرى. انسخه الآن.',
      addr: 'العنوان المطلوب', key: 'المفتاح السري', copy: 'نسخ', copied: 'تم النسخ',
      what: 'ما يحدث بعد ذلك', fmt: 'الصيغة المتوقعة',
      done: 'تم إنشاء المفتاح', pending: 'في انتظار المزوّد',
      err: 'تعذّر إنشاء المفتاح', errSub: 'أعد المحاولة بعد لحظات.',
      hdr: 'كل طلب يصل يصبح تذكرة في انتظار الصندوق. فريقك هو من يقبلها.',
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

  function panel(channel, res) {
    var s = str();
    var box = document.createElement('div');
    box.className = 'chl';

    var hdr = document.createElement('p');
    hdr.className = 'chl-hdr'; hdr.textContent = s.hdr;
    box.appendChild(hdr);

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
  html[data-theme="dark"] .chl-f-v.is-key { color:var(--mint); }';

  try {
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
  } catch (_) {}

  window.KiwiChannels = { connect: connect, list: list };
})();
