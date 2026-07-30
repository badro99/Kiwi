/* ═══════════════════════════════════════════════════════════════════════════
 * Kiwi · BARCODE ENGINE — window.KiwiBarcode
 * ---------------------------------------------------------------------------
 * Dependency-free, offline. Renders REAL, scannable barcodes to inline SVG.
 * Used by the boutique catalog (assets/boutique-catalog.js) on both surfaces:
 *   · the caisse boutique (PIN 0002 · assets/pos-boutique.js) — generate + print
 *   · the dashboard boutique (assets/pages-pro.js) — view + reprint
 *
 * Supported symbologies
 *   · EAN-13   — the retail default. Full L/G/R encoding, first-digit parity
 *                pattern, mod-10 check digit. Store-generated codes live in the
 *                GS1 "restricted circulation within a company" range (prefix
 *                20–29) so they can NEVER collide with a real manufacturer GTIN.
 *   · Code 128 — Code Set B (ASCII 32–127), mod-103 checksum. Opt-in, for
 *                human-readable SKU strings (e.g. CFB-001-EMERAUDE-M).
 *
 * API (all pure unless noted)
 *   KiwiBarcode.ean13CheckDigit(d12)   → check digit (number) for 12 digits
 *   KiwiBarcode.isValidEan13(str)      → true if 13 digits + valid check
 *   KiwiBarcode.ean13(digits)          → { modules:'1010…', text:'…' }  (bit string)
 *   KiwiBarcode.code128(data)          → { modules:'1010…', text:'…' }
 *   KiwiBarcode.detect(raw)            → 'ean13'|'ean8'|'upca'|'code128'|'unknown'
 *   KiwiBarcode.nextInStoreEan()       → fresh valid in-store EAN-13 string (STATEFUL — bumps a localStorage counter)
 *   KiwiBarcode.peekNextSeq()          → the counter value that nextInStoreEan() would use next
 *   KiwiBarcode.svg(value, opts)       → '<svg…>' render (auto-detects format unless opts.format given)
 * ═══════════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────── EAN-13 ─────────────────────────── */

  // 7-module encodings, indexed by digit 0-9.
  const L = ['0001101','0011001','0010011','0111101','0100011','0110001','0101111','0111011','0110111','0001011']; // odd parity (left)
  const G = ['0100111','0110011','0011011','0100001','0011101','0111001','0000101','0010001','0001001','0010111']; // even parity (left)
  const R = ['1110010','1100110','1101100','1000010','1011100','1001110','1010000','1000100','1001000','1110100']; // right
  // Which of the 6 left digits use L vs G, keyed by the first digit.
  const PARITY = ['LLLLLL','LLGLGG','LLGGLG','LLGGGL','LGLLGG','LGGLLG','LGGGLL','LGLGLG','LGLGGL','LGGLGL'];

  function ean13CheckDigit(d12) {
    const s = String(d12).replace(/\D/g, '').slice(0, 12).padStart(12, '0');
    let sum = 0;
    for (let i = 0; i < 12; i++) {
      // 1-indexed positions: odd → ×1, even → ×3.
      sum += (+s[i]) * (i % 2 === 0 ? 1 : 3);
    }
    return (10 - (sum % 10)) % 10;
  }

  function isValidEan13(str) {
    const s = String(str || '').replace(/\D/g, '');
    if (s.length !== 13) return false;
    return ean13CheckDigit(s.slice(0, 12)) === +s[12];
  }

  // Accepts 12 digits (check appended) or 13 (validated/normalised). Returns bit modules.
  function ean13(digits) {
    let s = String(digits || '').replace(/\D/g, '');
    if (s.length === 12) s += String(ean13CheckDigit(s));
    if (s.length !== 13) throw new Error('EAN-13 needs 12 or 13 digits, got ' + s.length);
    const first = +s[0];
    const parity = PARITY[first];
    let bits = '101'; // start guard
    for (let i = 1; i <= 6; i++) {
      const d = +s[i];
      bits += (parity[i - 1] === 'L' ? L : G)[d];
    }
    bits += '01010'; // centre guard
    for (let i = 7; i <= 12; i++) bits += R[+s[i]];
    bits += '101'; // end guard
    return { modules: bits, text: s, format: 'ean13' };
  }

  /* ─────────────────────────── EAN-8 / UPC-A ───────────────────────────
   * Kiwi only ever GENERATES EAN-13, but it must READ and re-render whatever is
   * already printed on a merchant's existing stock. On the shelves of a Moroccan
   * boutique that means EAN-8 (small packaging) and UPC-A (anything imported from
   * North America) alongside EAN-13.
   *
   * UPC-A is not a separate symbology here: a 12-digit UPC-A prefixed with a "0"
   * IS the equivalent EAN-13, check digit included. Rendering it that way keeps
   * one encoder for both — and fixes a real misread: encode() used to see 12
   * digits, treat them as 12 DATA digits and append a 13th check digit, which
   * produces a barcode carrying a different number than the box in the hand. */
  function ean8CheckDigit(d7) {
    const s = String(d7).replace(/\D/g, '').slice(0, 7).padStart(7, '0');
    let sum = 0;
    // 7 data digits, weights 3,1,3,1,3,1,3 from the left.
    for (let i = 0; i < 7; i++) sum += (+s[i]) * (i % 2 === 0 ? 3 : 1);
    return (10 - (sum % 10)) % 10;
  }
  function isValidEan8(str) {
    const s = String(str || '').replace(/\D/g, '');
    if (s.length !== 8) return false;
    return ean8CheckDigit(s.slice(0, 7)) === +s[7];
  }
  // A UPC-A is valid exactly when its EAN-13 form ("0" + the 12 digits) is.
  function isValidUpcA(str) {
    const s = String(str || '').replace(/\D/g, '');
    if (s.length !== 12) return false;
    return isValidEan13('0' + s);
  }
  function ean8(digits) {
    let s = String(digits || '').replace(/\D/g, '');
    if (s.length === 7) s += String(ean8CheckDigit(s));
    if (s.length !== 8) throw new Error('EAN-8 needs 7 or 8 digits, got ' + s.length);
    let bits = '101';                                   // start guard
    for (let i = 0; i < 4; i++) bits += L[+s[i]];        // left half: all odd parity
    bits += '01010';                                    // centre guard
    for (let i = 4; i < 8; i++) bits += R[+s[i]];        // right half
    bits += '101';                                      // end guard
    return { modules: bits, text: s, format: 'ean8' };
  }

  /* ─────────────────────────── Code 128 (Set B) ─────────────────────────── */

  // 107 symbol patterns (values 0-106). Each is a 6-run width string; runs
  // alternate bar/space starting with a bar. Value 106 (stop) carries a 7th run.
  const C128 = ['212222','222122','222221','121223','121322','131222','122213','122312','132212','221213','221312','231212','112232','122132','122231','113222','123122','123221','223211','221132','221231','213212','223112','312131','311222','321122','321221','312212','322112','322211','212123','212321','232121','111323','131123','131321','112313','132113','132311','211313','231113','231311','112133','112331','132131','113123','113321','133121','313121','211331','231131','213113','213311','213131','311123','311321','331121','312113','312311','332111','314111','221411','431111','111224','111422','121124','121421','141122','141221','112214','112412','122114','122411','142112','142211','241211','221114','413111','241112','134111','111242','121142','121241','114212','124112','124211','411212','421112','421211','212141','214121','412121','111143','111341','131141','114113','114311','411113','411311','113141','114131','311141','411131','211412','211214','211232','2331112'];
  const START_B = 104, STOP = 106;

  function runsToBits(runs) {
    // runs = string of widths; alternate bar(1)/space(0) starting with bar.
    let bits = '', bar = true;
    for (const ch of runs) {
      const w = +ch;
      bits += (bar ? '1' : '0').repeat(w);
      bar = !bar;
    }
    return bits;
  }

  function code128(data) {
    const str = String(data == null ? '' : data);
    const vals = [START_B];
    for (const ch of str) {
      const code = ch.charCodeAt(0);
      if (code < 32 || code > 126) throw new Error('Code 128-B: unsupported char "' + ch + '"');
      vals.push(code - 32); // Set B value = ascii - 32
    }
    // Checksum: (start + Σ i·value_i) mod 103, i from 1 for the first data symbol.
    let sum = START_B;
    for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
    vals.push(sum % 103);
    vals.push(STOP);
    let bits = '';
    for (const v of vals) bits += runsToBits(C128[v]);
    return { modules: bits, text: str, format: 'code128' };
  }

  /* ─────────────────────────── generation / detection ─────────────────────────── */

  /* Le compteur de codes-barres est PAR MAGASIN.
   *
   * Il était figé sur 'kiwiBarcodeSeq:maisonMansour' — le nom de la toute
   * première boutique, laissé en dur. Un seul compteur pour tous les
   * établissements : les codes ne se télescopaient pas (le compteur ne fait que
   * monter), mais deux magasins du même compte se partageaient une numérotation,
   * et le jour où l'on nettoie cette clé, c'est le stock des deux qui perd ses
   * références. La clé suit donc le magasin courant, comme le catalogue lui-même.
   *
   * L'ancienne clé reste lue, et le compteur prend toujours le PLUS HAUT des
   * deux : une boutique déjà en service ne réémet jamais un code qu'elle a déjà
   * imprimé, et rien n'est à migrer. boutique-catalog.js remonte en plus ce
   * compteur au-dessus du plus grand code réellement présent après une
   * hydratation depuis le cloud, pour qu'un appareil neuf ne reparte pas de zéro. */
  const LEGACY_SEQ_KEY = 'kiwiBarcodeSeq:maisonMansour';
  function seqKey() {
    let venue = '';
    try {
      const C = window.KiwiBoutiqueCatalog;
      if (C && C.currentVenue) venue = String(C.currentVenue() || '');
    } catch (_) {}
    return venue ? 'kiwiBarcodeSeq:' + venue : LEGACY_SEQ_KEY;
  }
  function readAt(key) {
    try { const n = parseInt(localStorage.getItem(key) || '0', 10); return isNaN(n) ? 0 : n; }
    catch (_) { return 0; }
  }
  function readSeq() {
    const key = seqKey();
    const own = readAt(key);
    return key === LEGACY_SEQ_KEY ? own : Math.max(own, readAt(LEGACY_SEQ_KEY));
  }
  function peekNextSeq() { return readSeq() + 1; }

  // Fresh in-store EAN-13. Prefix "20" (GS1 restricted-circulation range 20-29)
  // + 10-digit zero-padded counter → 12 data digits, + mod-10 check = 13.
  function nextInStoreEan() {
    const seq = readSeq() + 1;
    try { localStorage.setItem(seqKey(), String(seq)); } catch (_) {}
    const body = '20' + String(seq).padStart(10, '0'); // 12 digits
    return body + String(ean13CheckDigit(body));
  }

  function detect(raw) {
    const s = String(raw || '').trim();
    const digits = s.replace(/\D/g, '');
    if (/^\d+$/.test(s)) {
      if (s.length === 13) return 'ean13';
      if (s.length === 12) return 'upca';
      if (s.length === 8)  return 'ean8';
    }
    if (s.length && digits.length === s.length && s.length <= 18) return 'numeric';
    return s.length ? 'code128' : 'unknown';
  }

  /* Human-readable symbology name, for the till's feedback line. */
  const SYM_LABEL = { ean13: 'EAN-13', ean8: 'EAN-8', upca: 'UPC-A', numeric: 'code numérique', code128: 'Code 128', unknown: 'inconnu' };
  function symLabel(sym) { return SYM_LABEL[sym] || String(sym || ''); }

  /* ── validate() — the ONE judge of "can this code be used as an identifier?" ──
   * Used by the inventory intake before a supplier code is attached to a variant.
   * Three outcomes, deliberately distinct:
   *   ok:false           → not a usable code at all (empty, garbled, partial burst)
   *   ok:true check:'bad'→ usable, but its own check digit disagrees. That is NOT
   *                        a refusal: plenty of shops carry in-house codes that
   *                        merely LOOK like an EAN. The till warns and lets the
   *                        employee confirm, because refusing outright would make
   *                        their real stock unregisterable.
   *   ok:true check:'ok' → a standards-valid retail barcode.
   * The code is returned VERBATIM (trimmed only). Never parsed as a number, so a
   * leading zero — which carries meaning in a GTIN — always survives. */
  function validate(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!s) return { ok: false, reason: 'vide', code: '' };
    // A control character means a truncated / mangled HID burst, not a code.
    if (/[\x00-\x1F\x7F]/.test(s)) return { ok: false, reason: 'illisible', code: s };
    // A 1-3 character read is a partial scan; no retail symbology is that short.
    if (s.length < 4) return { ok: false, reason: 'trop-court', code: s };
    if (s.length > 48) return { ok: false, reason: 'trop-long', code: s };
    const sym = detect(s);
    let check = 'na';                                   // no check digit to verify
    if (sym === 'ean13') check = isValidEan13(s) ? 'ok' : 'bad';
    else if (sym === 'ean8') check = isValidEan8(s) ? 'ok' : 'bad';
    else if (sym === 'upca') check = isValidUpcA(s) ? 'ok' : 'bad';
    return { ok: true, code: s, sym, check, label: symLabel(sym) };
  }

  /* ── GTIN equivalence, for LOOKUP only ───────────────────────────────────────
   * The same physical barcode can be reported by two different scanners as two
   * different strings: a UPC-A is "036000291452" to one and "0036000291452" to
   * the next, and an EAN-8 may arrive zero-padded to 13. GS1 weights the check
   * digit from the RIGHT, so zero-padding never changes it — these really are the
   * same identifier. Without this, a shop registers a code with the till's own
   * scanner, then a second device (or the same scanner after a firmware setting
   * changes) reads "the same" box and finds nothing.
   *
   * Storage stays VERBATIM — nothing here rewrites what the employee scanned.
   * This only widens the *search*, and only between codes whose check digit is
   * valid: a code that fails its own check digit is treated as opaque and must
   * match exactly, so an in-house reference like "0012" can never be silently
   * conflated with "12". */
  function gtinKey(raw) {
    const s = String(raw == null ? '' : raw).trim();
    if (!/^\d+$/.test(s)) return null;
    const valid = (s.length === 13 && isValidEan13(s))
      || (s.length === 12 && isValidUpcA(s))
      || (s.length === 8 && isValidEan8(s));
    if (!valid) return null;
    // Canonical form: significant digits only. Zero-padding is not information.
    return s.replace(/^0+/, '') || '0';
  }

  /* Which symbology should a REPRINT of this code use, so the reprinted label
   * carries the same number the original did. */
  function bestFormat(code) {
    const sym = detect(code);
    if (sym === 'ean13' && isValidEan13(code)) return 'ean13';
    if (sym === 'upca' && isValidUpcA(code)) return 'ean13';   // rendered as 0 + 12
    if (sym === 'ean8' && isValidEan8(code)) return 'ean8';
    return 'code128';
  }

  /* ─────────────────────────── SVG render ─────────────────────────── */

  /* Pick the encoder. An EXISTING supplier code must render as the symbology it
   * already is, or the label would carry a different number than the product:
   *   · a valid UPC-A renders as EAN-13 of "0" + its 12 digits (same number),
   *   · a valid EAN-8 renders as EAN-8 (it used to fall through to Code 128),
   *   · 12 loose digits that are NOT a valid UPC-A keep the old behaviour of
   *     "12 data digits + computed check", which is how Kiwi's own generator
   *     hands them over. */
  function encode(value, format) {
    const s = String(value == null ? '' : value);
    const digits = s.replace(/\D/g, '');
    let fmt = format;
    if (!fmt) {
      if (isValidEan13(s)) fmt = 'ean13';
      else if (isValidUpcA(s)) fmt = 'upca';
      else if (isValidEan8(s)) fmt = 'ean8';
      else if (/^\d{12}$/.test(digits)) fmt = 'ean13';
      else fmt = 'code128';
    }
    if (fmt === 'upca') return ean13('0' + digits);
    if (fmt === 'ean8') return ean8(s);
    if (fmt === 'ean13') return ean13(s);
    return code128(s);
  }

  // opts: { format, height=44, module=2, showText=true, quiet=10, color='#0A0F0D', bg='transparent', textSize }
  function svg(value, opts) {
    opts = opts || {};
    let enc;
    try { enc = encode(value, opts.format); }
    catch (e) { return `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="4" y="24" font-size="10" fill="#9B2F22">code invalide</text></svg>`; }
    const mod    = opts.module != null ? opts.module : 2;
    const height = opts.height != null ? opts.height : 44;
    const quiet  = opts.quiet  != null ? opts.quiet  : 10;
    const showText = opts.showText !== false;
    const color = opts.color || '#0A0F0D';
    const textH = showText ? (opts.textSize || 11) + 5 : 0;
    const bits = enc.modules;
    const totalMod = bits.length + quiet * 2;
    const w = totalMod * mod;
    const h = height + textH;
    let rects = '';
    let x = quiet, run = 0;
    for (let i = 0; i <= bits.length; i++) {
      if (bits[i] === '1') { run++; }
      else {
        if (run > 0) { rects += `<rect x="${(x) * mod}" y="0" width="${run * mod}" height="${height}" fill="${color}"/>`; x += run; run = 0; }
        x++;
      }
    }
    let txt = '';
    if (showText) {
      const label = enc.format === 'ean13'
        ? enc.text.replace(/^(\d)(\d{6})(\d{6})$/, '$1 $2 $3')
        : enc.text;
      txt = `<text x="${w / 2}" y="${height + textH - 3}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="${opts.textSize || 11}" letter-spacing="1" fill="${color}">${escapeXml(label)}</text>`;
    }
    const bgRect = opts.bg && opts.bg !== 'transparent' ? `<rect width="${w}" height="${h}" fill="${opts.bg}"/>` : '';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="code-barres ${escapeXml(enc.text)}">${bgRect}${rects}${txt}</svg>`;
  }

  function escapeXml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ─────────────────────────── printable labels ───────────────────────────
   * Shared by the caisse (label printer wired to the till) and the dashboard.
   * A print root is appended in-page and shown ONLY at print time (@media print)
   * so it works without popups. Each label carries name · size · colour · price
   * and the scannable barcode + its human-readable number. */
  function ensurePrintCss() {
    const L = labelSize();
    const stamp = L.w + 'x' + L.h;
    const prev = document.getElementById('kbl-print-css');
    // Rebuild when the shop changes its label stock — a cached stylesheet would
    // otherwise keep printing the previous size forever.
    if (prev) {
      if (prev.getAttribute('data-size') === stamp) return;
      prev.remove();
    }
    const st = document.createElement('style');
    st.id = 'kbl-print-css';
    st.setAttribute('data-size', stamp);
    // ONE label per page, the page sized to the label stock itself. This is what
    // makes a browser/PDF print look like a real étiquette instead of a small
    // sticker lost on an A4 sheet (the "empty page" problem). Every label after
    // the first starts a new page, avoiding a trailing blank sticker.
    // Short stock (20 mm-class) has no room for a second title line — one line,
    // tighter padding. The bars are a fixed-height block STRETCHED to the full
    // label width (preserveAspectRatio="none" on the svg): bar widths are
    // relative, so horizontal stretch stays scannable. Letting the svg keep its
    // aspect ratio under a max-height shrank the whole block — bars AND the
    // number — to half the sticker. The human-readable number is plain HTML
    // below the bars, so it never scales with them.
    const short = L.h <= 24;
    const lines = short ? 1 : 2;
    // Height budget in mm: padding + title line(s) + the largest meta glyph
    // (the price is intentionally larger) + number + margins. Keeping a small
    // guard prevents printer-driver rounding from scaling the whole 20 mm page.
    const PT = 0.3528;                                   // 1 pt in mm
    const titlePt = short ? 12 : 11;
    const metaPt = short ? 10 : 9;
    const pricePt = short ? 22 : 10.5;
    const numberPt = short ? 6.5 : 7;
    const used = (short ? 0.8 : 3.5)
      + lines * titlePt * (short ? 1 : 1.05) * PT
      + (short ? 0.1 : 0.4) + Math.max(metaPt, pricePt) * 0.95 * PT
      + (short ? 0.2 : 0.3) + numberPt * 0.9 * PT
      + 0.3;
    const barMM = Math.max(5, +(L.h - used).toFixed(1));
    st.textContent = `
      #kbl-print-root { display: none; }
      @media print {
        html, body { background: var(--surface) !important; margin: 0 !important; padding: 0 !important; }
        body > *:not(#kbl-print-root) { display: none !important; }
        #kbl-print-root { display: block !important; position: static; margin: 0; padding: 0; }
        .kbl-sheet { display: block; margin: 0; padding: 0; }
        .kbl {
          width: ${L.w}mm; height: calc(${L.h}mm - 0.2mm); box-sizing: border-box; overflow: hidden;
          padding: ${short ? '0.45mm 0.35mm 0.35mm' : '2mm 2.5mm 1.5mm'};
          display: flex; flex-direction: column; align-items: center; justify-content: flex-start;
          page-break-inside: avoid; break-inside: avoid-page; text-align: center;
          font-family: 'Inter Tight', system-ui, sans-serif; color: #0A0F0D;
        }
        .kbl + .kbl { page-break-before: always; break-before: page; }
        .kbl-head { width: 100%; }
        .kbl-t {
          font-size: ${titlePt}pt; font-weight: 700; line-height: ${short ? '1' : '1.05'};
          display: -webkit-box; -webkit-line-clamp: ${lines}; -webkit-box-orient: vertical; overflow: hidden;
        }
        .kbl-m {
          width: 100%; min-width: 0; display: flex; align-items: baseline; justify-content: center;
          gap: 0.5mm; white-space: nowrap; overflow: hidden;
          font-size: ${metaPt}pt; line-height: 0.95; color: #333; margin-top: ${short ? '0.1mm' : '0.4mm'};
        }
        .kbl-s { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .kbl-m.has-price .kbl-s { display: ${short ? 'none' : 'block'}; }
        .kbl-m b { color: #0A0F0D; font-family: Arial, Helvetica, sans-serif; font-size: ${pricePt}pt; line-height: 0.95; flex: 0 0 auto; }
        /* Le prix barré d'une promotion. Volontairement PLUS PETIT que le prix
           courant : sur une étiquette de rayon, deux nombres de même taille se
           lisent comme une hésitation, et c'est le nouveau prix qu'on vient
           chercher. Le barré n'est pas décoratif — c'est lui qui dit « celui-ci
           ne s'applique plus », sans quoi une cliente lit deux prix et demande
           lequel est le bon. */
        .kbl-m s { color: #6B7280; font-family: Arial, Helvetica, sans-serif;
                   font-size: ${(pricePt * 0.5).toFixed(1)}pt; line-height: 0.95; flex: 0 0 auto; }
        .kbl-bc {
          width: ${short ? '86%' : '100%'}; line-height: 0; margin-top: auto; flex-shrink: 0;
        }
        .kbl-bc svg { display: block; width: 100%; height: ${barMM}mm; }
        .kbl-n {
          font-family: Arial, Helvetica, sans-serif; font-size: ${numberPt}pt;
          letter-spacing: 0.5px; line-height: 0.9; margin-top: ${short ? '0.2mm' : '0.3mm'};
        }
        @page { size: ${L.w}mm ${L.h}mm; margin: 0; }
      }`;
    document.head.appendChild(st);
  }

  /* Physical label stock, in mm. A shop's roll is whatever they bought — the
   * WD8210 alone takes 110 mm-wide stock — and printing a 50 x 30 page onto it
   * scales or clips every sticker. So the size is a setting (kiwiPrinterCfg.label)
   * and BOTH renderers (browser @page and the PDF) read it from here, so they can
   * never disagree. Boutique stock defaults to the deployed 50 x 20 mm roll. */
  const LABEL_DEFAULT = { w: 50, h: 20 };
  function labelSize() {
    try {
      const cfg = (window.KiwiPrinter && window.KiwiPrinter.getConfig && window.KiwiPrinter.getConfig()) || {};
      const l = cfg.label || {};
      const w = Number(l.w) || LABEL_DEFAULT.w;
      const h = Number(l.h) || LABEL_DEFAULT.h;
      // Guard against a nonsense value bricking every print.
      if (w < 10 || w > 210 || h < 10 || h > 297) return LABEL_DEFAULT;
      return { w: w, h: h };
    } catch (_) { return LABEL_DEFAULT; }
  }

  function labelHTML(l) {
    l = l || {};
    // Bars only — the number is rendered as HTML below (see ensurePrintCss for
    // why). preserveAspectRatio="none" lets the CSS stretch the bars to the full
    // label width whatever the stock height.
    const bars = api.svg(l.code, { format: l.format, height: 40, module: 1.5, showText: false, quiet: 8 })
      .replace('<svg ', '<svg preserveAspectRatio="none" ');
    let num = '';
    try {
      const enc = encode(l.code, l.format);
      num = enc.format === 'ean13' ? enc.text.replace(/^(\d)(\d{6})(\d{6})$/, '$1 $2 $3') : enc.text;
    } catch (e) { num = ''; }
    const svg = bars + (num ? `<div class="kbl-n">${escapeXml(num)}</div>` : '');
    // Show a price only when it's a real, positive amount — a "0 MAD" on a shelf
    // label is noise, and it's exactly what read as broken on the empty sheet.
    const hasPrice = l.price != null && String(l.price).trim() !== '' && parseFloat(String(l.price).replace(',', '.')) > 0;
    const priceStr = hasPrice ? `<b>${escapeXml(String(l.price))} MAD</b>` : '';
    // `was` = l'ancien prix, barré, quand l'article est en promotion. On ne le
    // pose que s'il est RÉELLEMENT plus haut que le prix imprimé : une étiquette
    // qui barre un prix identique, ou plus bas, annonce une remise qui n'existe
    // pas — et sur une vitrine, c'est un problème d'affichage des prix.
    const wasNum = l.was == null ? NaN : parseFloat(String(l.was).replace(',', '.'));
    const hasWas = hasPrice && Number.isFinite(wasNum) && wasNum > parseFloat(String(l.price).replace(',', '.'));
    const wasStr = hasWas ? `<s>${escapeXml(String(l.was))}</s>` : '';
    const meta = (l.sub || hasPrice) ? `<div class="kbl-m${hasPrice ? ' has-price' : ''}"><span class="kbl-s">${escapeXml(l.sub || '')}</span>${wasStr}${priceStr}</div>` : '';
    return `<div class="kbl">` +
             `<div class="kbl-head"><div class="kbl-t">${escapeXml(l.title || '')}</div>${meta}</div>` +
             `<div class="kbl-bc">${svg}</div>` +
           `</div>`;
  }

  // Browser fallback: paint a hidden print root and open the OS print sheet.
  // Only reached when no thermal printer is paired, or a paired bridge is down.
  function browserPrint(flat) {
    let root = document.getElementById('kbl-print-root');
    if (root) root.remove();
    root = document.createElement('div');
    root.id = 'kbl-print-root';
    root.innerHTML = `<div class="kbl-sheet">${flat.map(labelHTML).join('')}</div>`;
    document.body.appendChild(root);
    ensurePrintCss();
    setTimeout(() => { try { window.print(); } catch (e) {} setTimeout(() => root.remove(), 600); }, 60);
  }

  /* ── real PDF (no library) ────────────────────────────────────────────────
   * Build a downloadable PDF, one 50 × 30 mm page per label, drawn as VECTOR:
   * Helvetica text + black rectangles for the barcode (crisp + scannable, no
   * raster). Lets the "Enregistrer en PDF" button hand the merchant a real file
   * with no print dialog at all. */
  function buildLabelPdf(flat) {
    const MM = 72 / 25.4;                 // points per mm
    const L = labelSize();
    const PW = +(L.w * MM).toFixed(2), PH = +(L.h * MM).toFixed(2);
    const objs = ['', '', '', ''];        // slots: 1 catalog, 2 pages, 3 font, 4 bold
    objs[2] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
    objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>';
    const put = (body) => { objs.push(body); return objs.length; };   // → obj number
    // WinAnsi-safe text: map common typographic chars to their WinAnsi byte, drop
    // anything else >255, escape PDF string metacharacters. (é/è/à… are ≤255 and
    // pass straight through since Latin-1 aligns with WinAnsi for them.)
    const WA = { '—': '\x97', '–': '\x96', '‘': '\x91', '’': '\x92', '“': '\x93', '”': '\x94', '…': '\x85', '•': '\x95', '€': '\x80' };
    const tx = (s) => String(s == null ? '' : s).split('').map((c) => WA[c] || (c.charCodeAt(0) > 255 ? '?' : c)).join('').replace(/[\\()]/g, '\\$&');
    const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n - 1) + '.' : s; };
    const wid = (s, sz, bold) => s.length * sz * (bold ? 0.56 : 0.52);   // rough Helvetica width
    const cx = (s, sz, bold) => Math.max(4, (PW - wid(s, sz, bold)) / 2);
    const pageRefs = [];
    flat.forEach((l) => {
      let enc = null; try { enc = encode(l.code, l.format); } catch (e) { enc = null; }
      let s = '';
      const short = L.h <= 24;
      const title = clip(l.title || '', short ? 20 : 22);
      const titleSize = short ? 12 : 11;
      const metaSize = short ? 22 : 9;
      const numberSize = short ? 6.5 : 7;
      if (title) s += 'BT /F2 ' + titleSize + ' Tf ' + cx(title, titleSize, true).toFixed(1) + ' ' + (PH - (short ? 9.5 : 13)).toFixed(1) + ' Td (' + tx(title) + ') Tj ET\n';
      const hasPrice = l.price != null && String(l.price).trim() !== '' && parseFloat(String(l.price).replace(',', '.')) > 0;
      /* Pas de barré possible ici (texte PDF nu), donc on l'écrit en toutes
         lettres — et seulement sur les grandes étiquettes. Sur une 20 mm il n'y
         a la place que d'UN nombre, et ce nombre doit être le prix à payer :
         imprimer l'ancien à côté sans pouvoir le barrer serait pire que de ne
         pas le mentionner du tout. */
      const wasNum2 = l.was == null ? NaN : parseFloat(String(l.was).replace(',', '.'));
      const hasWas2 = hasPrice && Number.isFinite(wasNum2) && wasNum2 > parseFloat(String(l.price).replace(',', '.'));
      let meta = short && hasPrice ? (l.price + ' MAD') : (l.sub || '');
      if (!short && hasPrice) meta = meta ? (meta + '   ' + l.price + ' MAD') : (l.price + ' MAD');
      if (!short && hasWas2) meta += ' (au lieu de ' + l.was + ')';
      if (meta) s += 'BT /F2 ' + metaSize + ' Tf ' + cx(meta, metaSize, true).toFixed(1) + ' ' + (PH - (short ? 30 : 25)).toFixed(1) + ' Td (' + tx(meta) + ') Tj ET\n';
      if (enc && enc.modules) {
        // Bars take whatever height the text leaves: a fixed 30 pt bar block
        // overlapped the text on 20 mm stock (pages only 56.7 pt tall).
        const bits = enc.modules, pad = short ? 10 : 8, mW = (PW - pad * 2) / bits.length;
        const barY = short ? 9 : 13.5;
        const barH = short ? 12 : Math.max(10, PH - 29 - barY);
        s += '0 0 0 rg\n';
        let x = pad, run = 0;
        for (let i = 0; i <= bits.length; i++) {
          if (bits[i] === '1') { run++; }
          else { if (run > 0) { s += x.toFixed(2) + ' ' + barY + ' ' + (run * mW).toFixed(2) + ' ' + barH + ' re f\n'; x += run * mW; run = 0; } x += mW; }
        }
        const num = enc.format === 'ean13' ? enc.text.replace(/^(\d)(\d{6})(\d{6})$/, '$1 $2 $3') : enc.text;
        s += 'BT /F1 ' + numberSize + ' Tf ' + cx(num, numberSize, false).toFixed(1) + ' ' + (short ? '2' : '11') + ' Td (' + tx(num) + ') Tj ET\n';
      }
      const cNum = put('<< /Length ' + s.length + ' >>\nstream\n' + s + 'endstream');
      pageRefs.push(put('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ' + cNum + ' 0 R >>'));
    });
    objs[0] = '<< /Type /Catalog /Pages 2 0 R >>';
    objs[1] = '<< /Type /Pages /Kids [' + pageRefs.map((n) => n + ' 0 R').join(' ') + '] /Count ' + pageRefs.length + ' >>';
    let pdf = '%PDF-1.4\n%\xFF\xFF\xFF\xFF\n';
    const off = [];
    for (let i = 0; i < objs.length; i++) { off[i] = pdf.length; pdf += (i + 1) + ' 0 obj\n' + objs[i] + '\nendobj\n'; }
    const xref = pdf.length;
    pdf += 'xref\n0 ' + (objs.length + 1) + '\n0000000000 65535 f \n';
    for (let i = 0; i < objs.length; i++) pdf += String(off[i]).padStart(10, '0') + ' 00000 n \n';
    pdf += 'trailer\n<< /Size ' + (objs.length + 1) + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF';
    const bytes = new Uint8Array(pdf.length);
    for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }

  function downloadPdf(flat) {
    try {
      const url = URL.createObjectURL(buildLabelPdf(flat));
      const a = document.createElement('a');
      a.href = url; a.download = flat.length > 1 ? 'etiquettes.pdf' : 'etiquette.pdf';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return true;
    } catch (e) { browserPrint(flat); return false; }   // fail soft to native print
  }

  function ensureChooseCss() {
    if (document.getElementById('kbl-choose-css')) return;
    const st = document.createElement('style'); st.id = 'kbl-choose-css';
    st.textContent =
      '#kbl-choose-ov{position:fixed;inset:0;z-index: var(--z-overlay, 600);display:grid;place-items:center;background:rgba(10,15,13,.5);padding:20px;}' +
      '#kbl-choose{background:var(--paper,#F7F5F0);color:var(--ink,#0A0F0D);width:380px;max-width:94vw;border-radius:18px;padding:24px;box-shadow:0 30px 70px -24px rgba(5,59,44,.5);}' +
      '#kbl-choose h3{margin:0 0 4px;font-size:1.12rem;}' +
      '#kbl-choose p{margin:0 0 16px;font-size:.9rem;opacity:.65;line-height:1.5;}' +
      '.kbl-cbtn{width:100%;font:inherit;font-weight:700;padding:14px;border-radius:12px;cursor:pointer;border:0;margin:0 0 10px;}' +
      '.kbl-cbtn.print{background:var(--atlas,#0B6E4F);color:#fff;}.kbl-cbtn.print:hover{filter:brightness(1.06);}' +
      '.kbl-cbtn.pdf{background:var(--surface);border:1.5px solid var(--atlas,#0B6E4F);color:var(--atlas,#0B6E4F);}' +
      '.kbl-cbtn.cancel{background:none;color:var(--ink,#0A0F0D);opacity:.55;margin:2px 0 0;padding:6px;font-weight:600;}' +
      '#kbl-choose .kbl-chint{margin:12px 0 0;font-size:.78rem;opacity:.6;}';
    document.head.appendChild(st);
  }

  // Explicit two-way choice instead of dropping the owner into Chrome's raw dialog
  // (where "Save as PDF" is a confusing default): print to a printer, or save a PDF.
  function printChooser(flat) {
    ensureChooseCss();
    const ov = document.createElement('div'); ov.id = 'kbl-choose-ov';
    ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true');
    const n = flat.length;
    ov.innerHTML =
      '<div id="kbl-choose">' +
        '<h3>' + (n > 1 ? n + ' étiquettes prêtes' : 'Étiquette prête') + '</h3>' +
        '<p>Comment souhaitez-vous l’obtenir ?</p>' +
        '<button class="kbl-cbtn print" type="button" data-k="print">Imprimer</button>' +
        '<button class="kbl-cbtn pdf" type="button" data-k="pdf">Enregistrer en PDF</button>' +
        '<button class="kbl-cbtn cancel" type="button" data-k="cancel">Annuler</button>' +
        '<p class="kbl-chint">Pas d’imprimante ? Enregistrez en PDF pour imprimer plus tard.</p>' +
      '</div>';
    document.body.appendChild(ov);
    const close = () => ov.remove();
    ov.addEventListener('click', (e) => {
      if (e.target === ov) return close();
      const k = e.target && e.target.getAttribute && e.target.getAttribute('data-k');
      if (!k) return;
      close();
      if (k === 'print') browserPrint(flat);
      else if (k === 'pdf') downloadPdf(flat);
    });
  }

  // Clicking print with no printer connected opens the connect-a-printer modal
  // (Klit-style): connect a Bluetooth or network printer, or use the quick actions
  // to print now / save a real PDF. Falls back to the standalone chooser only if
  // the printer module isn't loaded.
  function openConnect(flat) {
    const KP = window.KiwiPrinter;
    if (KP && typeof KP.openSetup === 'function') {
      KP.openSetup({ onBrowserPrint: () => browserPrint(flat), onSavePdf: () => downloadPdf(flat) });
    } else {
      printChooser(flat);
    }
  }

  // labels: [{ title, sub, price, was, code, format }]. opts: { copies }
  // `was` : ancien prix, barré, quand l'article part en promotion (ignoré s'il
  // n'est pas strictement supérieur au prix imprimé).
  // When a printer is actively CONNECTED (Bluetooth or the network bridge) we send
  // ESC/POS straight to it. Otherwise clicking print opens the connect-a-printer
  // modal (with Imprimer / Enregistrer-en-PDF quick actions inside it).
  function printLabels(labels, opts) {
    opts = opts || {};
    const copies = Math.max(1, opts.copies || 1);
    const list = (Array.isArray(labels) ? labels : [labels]).filter(Boolean);
    const flat = [];
    list.forEach((l) => { for (let i = 0; i < copies; i++) flat.push(l); });
    if (!flat.length) return Promise.resolve({ ok: false, reason: 'no-labels' });

    const KP = window.KiwiPrinter;
    if (KP && KP.isConnected && KP.isConnected() && window.KiwiEscPos) {
      return KP.printLabels(flat).then((res) => {
        if (res && res.ok) return res;
        openConnect(flat);                        // connected printer failed → modal
        return res || { ok: false };
      }, () => { openConnect(flat); return { ok: false }; });
    }
    openConnect(flat);
    return Promise.resolve({ ok: true, connect: true });
  }

  const api = {
    ean13CheckDigit,
    isValidEan13,
    ean13,
    ean8CheckDigit,
    isValidEan8,
    isValidUpcA,
    ean8,
    code128,
    detect,
    symLabel,
    validate,
    bestFormat,
    gtinKey,
    nextInStoreEan,
    peekNextSeq,
    encode,
    svg,
    labelHTML,
    buildLabelPdf,
    printLabels,
  };
  window.KiwiBarcode = api;
})();
