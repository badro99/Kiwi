/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · ESC/POS ENCODER — window.KiwiEscPos
 * ---------------------------------------------------------------------------
 * Builds real ESC/POS byte streams for thermal printers (receipts, kitchen
 * tickets, barcode labels). Dependency-free, offline. The bytes are handed to
 * the Kiwi Printer Bridge (assets/printer-bridge.js → bridge/server.js), which
 * relays them to the printer over TCP.
 *
 * Text is encoded as Windows-1252 (CP1252) and the printer is set to code page
 * 16 (WPC1252) so French accents (é è à ç ù …) print correctly.
 *
 * API
 *   KiwiEscPos.builder()                      → chainable Builder (see below)
 *   KiwiEscPos.toB64(bytes)                   → base64 string for the bridge
 *   KiwiEscPos.receipt(o)                     → Uint8Array (sales receipt)
 *   KiwiEscPos.kitchenTicket(o)               → Uint8Array (kitchen/prep ticket)
 *   KiwiEscPos.label(o)                       → Uint8Array (barcode étiquette)
 *   KiwiEscPos.testSlip(o)                    → Uint8Array (printer test)
 *   o.paper: '58' | '80'  (mm; default '80')
 *   o.label: { w, h }     (mm; barcode labels only)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ESC = 0x1B, GS = 0x1D;

  // Windows-1252 upper-range specials (0x80–0x9F) that differ from Latin-1.
  var CP1252 = {
    '€': 0x80, '‚': 0x82, 'ƒ': 0x83, '„': 0x84, '…': 0x85,
    '†': 0x86, '‡': 0x87, 'ˆ': 0x88, '‰': 0x89, 'Š': 0x8A,
    '‹': 0x8B, 'Œ': 0x8C, 'Ž': 0x8E, '‘': 0x91, '’': 0x92,
    '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97,
    '˜': 0x98, '™': 0x99, 'š': 0x9A, '›': 0x9B, 'œ': 0x9C,
    'ž': 0x9E, 'Ÿ': 0x9F,
  };

  function encodeCp1252(str) {
    var out = [];
    str = String(str == null ? '' : str);
    for (var i = 0; i < str.length; i++) {
      var ch = str[i], cc = str.charCodeAt(i);
      if (cc <= 0xFF) out.push(cc);            // ASCII + Latin-1 map 1:1
      else if (CP1252[ch] != null) out.push(CP1252[ch]);
      else out.push(0x3F);                     // '?' for anything unmappable
    }
    return out;
  }

  function Builder() { this._ = []; }
  Builder.prototype.raw = function (arr) { for (var i = 0; i < arr.length; i++) this._.push(arr[i] & 0xFF); return this; };
  Builder.prototype.init = function () { return this.raw([ESC, 0x40]).raw([ESC, 0x74, 16]); }; // reset + CP1252
  Builder.prototype.text = function (s) { return this.raw(encodeCp1252(s)); };
  Builder.prototype.line = function (s) { return this.text(s == null ? '' : s).raw([0x0A]); };
  Builder.prototype.feed = function (n) { return this.raw([ESC, 0x64, Math.max(0, n | 0)]); };   // ESC d n
  Builder.prototype.feedDots = function (n) { return this.raw([ESC, 0x4A, Math.max(0, Math.min(255, n | 0))]); }; // ESC J n
  Builder.prototype.align = function (a) { var m = a === 'center' ? 1 : a === 'right' ? 2 : 0; return this.raw([ESC, 0x61, m]); };
  Builder.prototype.bold = function (on) { return this.raw([ESC, 0x45, on ? 1 : 0]); };
  // GS ! n — width multiplier in high nibble, height in low nibble (1–8 → 0–7).
  Builder.prototype.size = function (w, h) {
    var wm = Math.min(8, Math.max(1, w || 1)) - 1, hm = Math.min(8, Math.max(1, h || 1)) - 1;
    return this.raw([GS, 0x21, (wm << 4) | hm]);
  };
  Builder.prototype.drawer = function () { return this.raw([ESC, 0x70, 0x00, 0x19, 0xFA]); };    // kick pin 2
  Builder.prototype.cut = function () { return this.feed(3).raw([GS, 0x56, 0x00]); };            // feed + full cut
  Builder.prototype.cutNow = function () { return this.raw([GS, 0x56, 0x00]); };                  // full cut, no receipt feed

  // Barcode via GS k format 2 (length-prefixed). HRI text below.
  //   ean13: 12 or 13 ASCII digits (m=67).   code128: "{B"+data (m=73).
  Builder.prototype.barcode = function (value, opts) {
    opts = opts || {};
    var height = opts.height || 70, hri = opts.hri === false ? 0 : 2; // 2 = below
    this.raw([GS, 0x68, height]);          // GS h — height
    this.raw([GS, 0x77, opts.module || 2]); // GS w — module width
    this.raw([GS, 0x48, hri]);             // GS H — HRI position
    this.raw([ESC, 0x61, 1]);              // center
    var fmt = opts.format || 'ean13';
    if (fmt === 'ean13') {
      var digits = String(value).replace(/\D/g, '');
      var bytes = encodeCp1252(digits);
      this.raw([GS, 0x6B, 67, bytes.length]).raw(bytes);
    } else {
      var data = '{B' + String(value);
      var b = encodeCp1252(data);
      this.raw([GS, 0x6B, 73, b.length]).raw(b);
    }
    return this.raw([ESC, 0x61, 0]); // back to left
  };

  Builder.prototype.bytes = function () { return new Uint8Array(this._); };

  // ── helpers ────────────────────────────────────────────────────────────────
  /* Character columns per roll width, Font A (12 dots wide). These are the widths
   * actually sold for POS in Morocco, plus the impact/kitchen sizes:
   *   44 mm  → 24  small label / parking-style rolls
   *   57 mm  → 32  the SAME roll as 58 mm — suppliers label it either way, so
   *   58 mm  → 32  both are offered rather than making the owner guess
   *   76 mm  → 40  dot-matrix kitchen printers (Epson TM-U220 and friends)
   *   80 mm  → 48  the standard thermal receipt roll
   *   110 mm → 66  measured, not guessed: the WD8210 datasheet gives a 104 mm
   *                 print width at 203 dpi = 800 dots max, and Font A is 12 dots
   *                 wide, so 800/12 = 66 columns (792 dots, inside the head)
   *   112 mm → 64  wide report rolls
   * The wide sizes are deliberately CONSERVATIVE: those heads are usually 832
   * dots (69 columns Font A) but some are 720 (60). Under-counting prints a
   * slightly narrow ticket; over-counting wraps every line and garbles it.
   * Anything unknown falls back to 48 so a bad value can never produce a garbled
   * ticket — it just prints as standard 80 mm. */
  var COLS = { '44': 24, '57': 32, '58': 32, '76': 40, '80': 48, '110': 66, '112': 64 };
  function cols(paper) { return COLS[String(paper)] || 48; }
  function cell(v) {
    return String(v == null ? '' : v).replace(/[\r\n\t\x00-\x1F\x7F]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
  }
  function fit(v, paper, widthMultiplier) {
    var cap = Math.max(1, Math.floor(cols(paper) / Math.max(1, widthMultiplier || 1)));
    return cell(v).slice(0, cap);
  }
  // "name .......... price" padded to the paper width.
  function row(left, right, paper) {
    var w = cols(paper);
    left = cell(left);
    right = cell(right);
    /* Never let a merchant-entered label or an unexpectedly long amount push a
       fixed-width row past the configured roll. The right column is kept first
       because it carries the accounting value. */
    if (right.length >= w) right = right.slice(0, w - 1);
    if (left.length + right.length + 1 > w) left = left.slice(0, Math.max(0, w - right.length - 1));
    var gap = Math.max(1, w - left.length - right.length);
    return left + new Array(gap + 1).join(' ') + right;
  }
  function rule(paper) { return new Array(cols(paper) + 1).join('-'); }
  function toB64(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return btoa(s); } catch (_) { return ''; }
  }

  // ── high-level tickets ───────────────────────────────────────────────────
  function receipt(o) {
    o = o || {}; var paper = o.paper || '80';
    var b = new Builder().init();
    b.align('center').bold(true).size(2, 2).line(fit(o.shop || 'Kiwi', paper, 2)).size(1, 1).bold(false);
    if (o.address) b.line(fit(o.address, paper));
    if (o.phone) b.line(fit(o.phone, paper));
    if (o.ref || o.date) b.line(fit([o.ref, o.date].filter(Boolean).join('  '), paper));
    b.align('left').line(rule(paper));
    (o.lines || []).forEach(function (l) {
      var name = (l.qty ? l.qty + '× ' : '') + (l.name || '');
      b.line(row(name, l.price != null ? String(l.price) : '', paper));
    });
    b.line(rule(paper));
    b.bold(true).size(1, 2).line(row('TOTAL', (o.total != null ? o.total : '') + '', paper)).size(1, 1).bold(false);
    if (o.method) b.line(row('Paiement', o.method, paper));
    if (o.footer) b.feed(1).align('center').line(fit(o.footer, paper));
    b.align('center').feed(1).line('Merci · Kiwi');
    b.cut();
    if (o.openDrawer) b.drawer();
    return b.bytes();
  }

  function kitchenTicket(o) {
    o = o || {}; var paper = o.paper || '80';
    var b = new Builder().init();
    b.align('center').bold(true).size(2, 2).line(fit(o.title || 'CUISINE', paper, 2)).size(1, 1).bold(false);
    if (o.table || o.order) b.line(fit([o.table, o.order].filter(Boolean).join('  ·  '), paper));
    if (o.time) b.line(fit(o.time, paper));
    b.align('left').line(rule(paper));
    (o.items || []).forEach(function (it) {
      b.bold(true).size(1, 2).line(fit((it.qty ? it.qty + '× ' : '') + (it.name || ''), paper)).size(1, 1).bold(false);
      if (it.note) b.line(fit('   > ' + it.note, paper));
    });
    b.line(rule(paper)).cut();
    return b.bytes();
  }

  function label(o) {
    o = o || {}; var paper = o.paper || '80';
    var b = new Builder().init().align('center');
    var compact = o.label && Number(o.label.h) <= 24;
    // A 50 × 20 mm label has room for exactly the hierarchy used by the browser
    // and PDF renderers: name, dominant price, compact scannable barcode. The
    // receipt-style three-line cutter feed used to make this path much taller
    // than the selected stock, so compact labels cut after a few printer dots.
    if (compact) {
      if (o.title) b.bold(true).line(fit(o.title, paper)).bold(false);
      if (o.price != null && o.price !== '') b.bold(true).size(2, 2).line(fit(String(o.price) + ' MAD', paper, 2)).size(1, 1).bold(false);
      b.barcode(o.code, { format: o.format || 'ean13', height: 32, module: 2 });
      b.feedDots(4).cutNow();
      return b.bytes();
    }
    if (o.title) b.bold(true).line(fit(o.title, paper)).bold(false);
    if (o.sub) b.line(fit(o.sub, paper));
    if (o.price != null && o.price !== '') b.bold(true).size(1, 2).line(fit(String(o.price) + ' MAD', paper)).size(1, 1).bold(false);
    b.feed(1).barcode(o.code, { format: o.format || 'ean13', height: 60 });
    b.feed(1).cut();
    return b.bytes();
  }

  /* ── RAPPORT JOURNALIER (le « Z ») ────────────────────────────────────────
   * Le ticket qu'on agrafe dans le classeur le soir. Il doit tenir dans une
   * main et pourtant suffire tout seul : un contrôleur, un comptable ou le
   * patron six mois plus tard doivent pouvoir le lire sans rouvrir Kiwi.
   *
   * D'où l'ordre : d'abord QUI et QUAND (établissement, journée commerciale,
   * heures d'ouverture et de fermeture, qui a ouvert et qui a fermé), puis
   * l'argent (total, moyens de paiement), puis le détail par catégorie et par
   * produit, puis le tiroir (attendu, compté, écart) qui est la seule partie
   * qu'on signe. Le net de la journée ferme le ticket.
   *
   * Ce qui est VOLONTAIREMENT compact : pas de ligne vide décorative, pas de
   * logo, les catégories en gras et les produits en police normale indentés de
   * deux espaces. Sur 80 mm une journée à huit catégories et quarante
   * références tient sur une trentaine de centimètres de papier ; sur 58 mm la
   * mise en page se resserre toute seule (row() borne à la largeur du papier).
   *
   * `o` est le rapport rendu par KiwiDayReport.build() plus l'habillage :
   *   { report, shop, address, title, fmt(n) → '1 400', paper }
   * fmt est injecté pour que le ticket et l'écran formatent les montants de la
   * même façon — un rapport imprimé qui n'a pas les mêmes séparateurs que le
   * tableau de bord fait douter de tout le reste. */
  function dayReport(o) {
    o = o || {}; var paper = o.paper || '80';
    var r = o.report || {};
    var f = o.fmt || function (n) { return String(Math.round(+n || 0)); };
    var money = function (n) { return f(n) + ' MAD'; };
    var b = new Builder().init();

    /* En-tête — l'identité du commerce et la journée décrite. */
    b.align('center').bold(true).size(2, 2).line(fit(o.shop || (r.store && r.store.name) || 'Kiwi', paper, 2)).size(1, 1);
    b.line(fit(o.title || 'RAPPORT JOURNALIER', paper)).bold(false);
    if (o.address || (r.store && r.store.location)) b.line(fit(o.address || r.store.location, paper));
    if (o.dateLabel) b.line(fit(o.dateLabel, paper));
    /* Une réimpression doit se voir : deux exemplaires du même Z qui circulent
       sans le dire, c'est une pièce comptable qu'on ne peut plus rapprocher. */
    if (o.copy) b.bold(true).line('— ' + o.copy + ' —').bold(false);
    b.align('left').line(rule(paper));

    if (o.openedLabel) b.line(row('Ouverture', o.openedLabel, paper));
    if (o.closedLabel) b.line(row('Fermeture', o.closedLabel, paper));
    if (r.openedBy) b.line(row('Ouvert par', r.openedBy, paper));
    if (r.closedBy) b.line(row('Fermé par', r.closedBy, paper));
    b.line(rule(paper));

    /* itemsOnly — « qu'est-ce que j'ai vendu aujourd'hui, et combien de chaque ».
       Le même document, amputé de tout ce qui n'est pas la marchandise : ni
       moyens de paiement, ni tiroir, ni net. C'est un ticket qu'on sort EN PLEIN
       SERVICE pour savoir s'il reste du tajine, pas une pièce comptable — et
       comme il ne porte pas le net, il ne peut pas être confondu avec le Z.
       Une variante du même encodeur plutôt qu'un second : deux mises en page
       pour un même tableau finissent toujours par diverger. */
    var itemsOnly = !!o.itemsOnly;

    /* L'argent. */
    if (!itemsOnly) {
      b.line(row('Transactions', String(r.txns || 0), paper));
      b.bold(true).line(row('TOTAL ENCAISSÉ', money(r.gross), paper)).bold(false);
      var M = o.methodLabels || {};
      Object.keys(r.methods || {}).forEach(function (k) {
        if (!r.methods[k]) return;
        b.line(row('  ' + (M[k] || k), money(r.methods[k]), paper));
      });
      if (r.basket) b.line(row('Ticket moyen', money(r.basket), paper));
      if (r.tips) b.line(row('Pourboires', money(r.tips), paper));
      if (r.discounts && r.discounts.amount) {
        b.line(row('Remises accordées', '- ' + money(r.discounts.amount), paper));
      }
      if (r.refunds && r.refunds.count) {
        b.line(row('Remboursements (' + r.refunds.count + ')', '- ' + money(r.refunds.amount), paper));
      }
      if (r.cancels) b.line(row('Annulations', String(r.cancels), paper));
    }

    /* Le détail. Sauté entièrement s'il n'y a rien à détailler — un titre
       « DÉTAIL » suivi du vide laisse croire à une panne. */
    if ((r.categories || []).length) {
      b.line(rule(paper));
      /* Sur le ticket « ventes par article » le détail EST le document : un
         second titre « DÉTAIL PAR CATÉGORIE » sous « VENTES PAR PLAT » répète
         l'en-tête sur un papier où chaque ligne coûte. */
      if (!itemsOnly) {
        b.align('center').bold(true).line(o.detailTitle || 'DÉTAIL PAR CATÉGORIE').bold(false).align('left');
      }
      /* « = 1 plats ». Le pluriel bâclé sur un total est exactement le détail qui
         fait douter des chiffres au-dessus. L'arabe ne marque pas le pluriel de
         la même façon : sans forme singulière fournie, on ne touche à rien. */
      var unit = function (n) {
        return (Math.abs(+n || 0) === 1 && o.unitWordOne) ? o.unitWordOne : (o.unitWord || 'articles');
      };
      r.categories.forEach(function (c) {
        b.bold(true).line(row(c.name, money(c.total), paper)).bold(false);
        (c.products || []).forEach(function (p) {
          b.line(row('  ' + p.qty + '× ' + p.name, money(p.total), paper));
        });
        b.line(row('  = ' + c.qty + ' ' + unit(c.qty), money(c.total), paper));
      });
      /* L'honnêteté du classement : si un tiers du chiffre n'a pas de panier
         détaillé, le détail ci-dessus n'est pas la journée entière et doit le
         dire au lieu d'avoir l'air complet. */
      if (r.coverage != null && r.coverage < 100) {
        b.line('* détail portant sur ' + r.coverage + '% du chiffre');
      }
      /* Le ticket « ventes par article » se ferme sur SON total à lui : combien
         de pièces sont sorties, pour combien. Sans cette ligne il s'arrêtait sur
         la dernière catégorie et n'avait pas l'air terminé. */
      if (itemsOnly) {
        var totQ = 0, totV = 0;
        r.categories.forEach(function (c) { totQ += (+c.qty || 0); totV += (+c.total || 0); });
        b.line(rule(paper));
        b.bold(true).line(row('TOTAL ' + String(o.unitWord || 'articles').toUpperCase(),
          totQ + ' · ' + money(totV), paper)).bold(false);
      }
    } else if (itemsOnly) {
      /* Rien à détailler : le dire, plutôt que de sortir un ticket vide qui
         ressemble à une panne d'imprimante. */
      b.line(rule(paper));
      b.align('center').line(o.noItemsWord || 'Aucun article détaillé').align('left');
    }

    if (itemsOnly) {
      b.align('center').feed(1).line('Kiwi · ' + (r.day || ''));
      b.cut();
      return b.bytes();
    }

    /* Le tiroir — la partie qu'on compte et qu'on signe. */
    var cash = r.cash || {};
    b.line(rule(paper));
    b.align('center').bold(true).line(o.drawerTitle || 'TIROIR-CAISSE').bold(false).align('left');
    b.line(row("Fond d'ouverture", money(cash.opening), paper));
    b.line(row('Espèces encaissées', '+ ' + money(cash.sales), paper));
    if (cash.tips) b.line(row('Pourboires espèces', '+ ' + money(cash.tips), paper));
    (cash.movements || []).forEach(function (m) {
      b.line(row('  ' + (m.reason || (m.type === 'in' ? 'Entrée' : 'Sortie')),
        (m.type === 'in' ? '+ ' : '- ') + money(m.amount), paper));
    });
    b.bold(true).line(row('ATTENDU EN CAISSE', money(cash.expected), paper)).bold(false);
    if (cash.counted != null) {
      b.line(row('Compté', money(cash.counted), paper));
      var e = cash.ecart || 0;
      b.bold(true).line(row('ÉCART', (e > 0 ? '+ ' : e < 0 ? '- ' : '') + money(Math.abs(e)), paper)).bold(false);
    } else {
      b.line(row('Compté', o.notCounted || 'non compté', paper));
    }

    /* Le net ferme le ticket : c'est le chiffre qu'on reporte. */
    b.line(rule(paper));
    b.bold(true).size(1, 2).line(row(o.netLabel || 'NET DU JOUR', money(r.net), paper)).size(1, 1).bold(false);

    /* Les passations et les réouvertures — la trace, en petit, tout en bas. */
    if ((r.handovers || []).length) {
      b.line(rule(paper));
      (r.handovers || []).forEach(function (h) {
        b.line(row((o.handoverWord || 'Passation') + ' ' + h.from + ' > ' + h.to, f(h.ecart), paper));
      });
    }
    if ((r.closedCount || 0) > 1) {
      b.line(rule(paper));
      b.line((o.reopenWord || 'Clôture n°') + ' ' + r.closedCount);
    }

    b.align('center').feed(1).line('Kiwi · ' + (r.day || ''));
    b.cut();
    return b.bytes();
  }

  function testSlip(o) {
    o = o || {}; var paper = o.paper || '80';
    var b = new Builder().init();
    b.align('center').bold(true).size(2, 2).line('Kiwi').size(1, 1).bold(false);
    b.line('Test d’impression').line(rule(paper));
    b.align('left');
    b.line(row('Imprimante', o.ip || '', paper));
    b.line(row('Largeur', paper + ' mm', paper));
    b.line(rule(paper));
    b.line('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
    b.line('0123456789  éèàçùâêîôû €');
    b.feed(1).align('center').barcode('2000000000015', { format: 'ean13', height: 60 });
    b.feed(1).line('Imprimante connectée ✓');
    b.cut();
    return b.bytes();
  }

  window.KiwiEscPos = {
    builder: function () { return new Builder(); },
    encodeCp1252: encodeCp1252,
    toB64: toB64,
    receipt: receipt,
    kitchenTicket: kitchenTicket,
    label: label,
    dayReport: dayReport,
    testSlip: testSlip,
    /* Single source of truth for the settings dropdown, so the widths the owner
     * can pick and the widths the encoder knows how to lay out can never drift. */
    paperWidths: [
      { value: '80', label: '80 mm (standard)' },
      { value: '58', label: '58 mm' },
      { value: '57', label: '57 mm' },
      { value: '76', label: '76 mm (matricielle / cuisine)' },
      { value: '110', label: '110 mm (large)' },
      { value: '112', label: '112 mm (large)' },
      { value: '44', label: '44 mm (étiquettes)' },
    ],
    paperCols: cols,
  };
})();
