#!/usr/bin/env node
const printerTestSource = require('./printer-test-source.cjs');
'use strict';

const caisseTestSource = require('./caisse-test-source.cjs');

/* L'imprimante et la clôture parlent la langue du comptoir.
 *
 * Deux écrans de la caisse sont restés en français sur un iPhone réglé en
 * anglais (Kiwi Pro, 2026-10-12) : le dialogue « Connecter une imprimante »
 * (assets/printer-bridge.js) et la feuille de fin de service
 * (kiwi-caisse.html, #cloture-modal et les deux voiles qui la suivent). Ni l'un
 * ni l'autre n'est balisé : ils écrivent en français et le balayage
 * d'assets/caisse-lang.js traduit ce qu'il reconnaît. Une phrase absente du
 * dictionnaire ne casse rien, elle reste simplement en français. C'est
 * exactement comme ça que ces deux écrans ont glissé.
 *
 * Ce banc relit donc la SOURCE de ces deux surfaces, en sort chaque morceau de
 * texte qu'un caissier peut voir, et exige pour chacun une traduction anglaise
 * ET arabe, passée par le vrai moteur (découpe sur « · », gabarits {n} et {x}).
 * Une nouvelle phrase ajoutée au dialogue sans sa paire fait tomber le gate.
 *
 * Limite assumée : un morceau découpé par une concaténation (« Ticket test
 * envoyé (' + nom + ') ») est accepté s'il appartient à une clé à trou {x} ou
 * {n} du dictionnaire. Un mot isolé très courant (« Imprimante ») passe donc
 * dès qu'une clé le contient ; une PHRASE nouvelle, elle, ne passe pas.
 */

const fs = require('fs');
const vm = require('vm');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/* ── le moteur, chargé tel quel ─────────────────────────────────────────── */
const store = new Map();
const el = () => ({
  style: {}, dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  setAttribute() {}, getAttribute: () => null, hasAttribute: () => false,
  appendChild() {}, insertBefore() {}, addEventListener() {},
  querySelector: () => null, querySelectorAll: () => [],
});
const document = {
  readyState: 'complete', documentElement: el(), body: el(), head: el(),
  createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, createTreeWalker: () => ({ nextNode: () => null }),
};
const window = { localStorage: { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)) } };
vm.runInNewContext(read('assets/caisse-lang.js'), {
  window, document, localStorage: window.localStorage,
  MutationObserver: function () { this.observe = function () {}; this.disconnect = function () {}; },
  NodeFilter: { SHOW_TEXT: 4, SHOW_ELEMENT: 1 }, WeakMap, setTimeout: () => 0,
}, { filename: 'caisse-lang.js' });
const L = window.KiwiCaisseLang;
L.set('en'); const EN = Object.assign({}, L.dict());
L.set('ar'); const AR = Object.assign({}, L.dict());
const tr = (lang, s) => { L.set(lang); const r = L.tr(s); L.set('fr'); return r; };

let failed = 0, ran = 0;
function check(ok, label) {
  ran++;
  if (!ok) { console.error(`  ✗ ${label}`); failed++; return; }
  if (process.env.VERBOSE) console.log(`  ✓ ${label}`);
}

/* ── un lecteur de chaînes JS ───────────────────────────────────────────────
   Pas d'expressions régulières naïves : « Fond d'ouverture » est entre
   guillemets doubles, « l’imprimante » porte une apostrophe typographique, et
   les commentaires sont pleins de français qui ne s'affiche nulle part. */
function jsStrings(src) {
  const out = [];
  let i = 0;
  const n = src.length;
  function readQuoted(q) {
    let s = '';
    i++;
    while (i < n && src[i] !== q) {
      if (src[i] === '\\') { const c = src[i + 1]; s += c === 'n' ? '\n' : c; i += 2; continue; }
      s += src[i++];
    }
    i++;
    return s;
  }
  function readTemplate() {
    const parts = [];
    let s = '';
    i++;
    while (i < n && src[i] !== '`') {
      if (src[i] === '\\') { s += src[i + 1]; i += 2; continue; }
      if (src[i] === '$' && src[i + 1] === '{') {
        parts.push(s); s = '';
        i += 2;
        let depth = 1;
        while (i < n && depth) {
          const c = src[i];
          if (c === '\'' || c === '"') { out.push(readQuoted(c)); continue; }
          if (c === '`') { readTemplate().forEach((p) => out.push(p)); continue; }
          if (c === '{') depth++;
          else if (c === '}') depth--;
          i++;
        }
        continue;
      }
      s += src[i++];
    }
    i++;
    parts.push(s);
    return parts;
  }
  /* Une expression régulière (`/[&<>"']/g`) porte des guillemets qui ne
     commencent aucune chaîne. Un « / » ouvre une regex quand il suit un
     opérateur ou une ouverture, pas quand il suit une valeur (une division). */
  function regexStarts() {
    let j = i - 1;
    while (j >= 0 && /\s/.test(src[j])) j--;
    if (j < 0) return true;
    if (/[(,=:[!&|?{};+\-*%<>~^]/.test(src[j])) return true;
    return /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, j - 6), j + 1));
  }
  function skipRegex() {
    let inClass = false;
    i++;
    while (i < n && src[i] !== '\n') {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '[') inClass = true;
      else if (c === ']') inClass = false;
      else if (c === '/' && !inClass) { i++; break; }
      i++;
    }
    while (i < n && /[a-z]/.test(src[i])) i++;      // drapeaux
  }
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? n : e + 2; continue; }
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); i = e < 0 ? n : e; continue; }
    if (c === '/' && regexStarts()) { skipRegex(); continue; }
    if (c === '\'' || c === '"') { out.push(readQuoted(c)); continue; }
    if (c === '`') { readTemplate().forEach((p) => out.push(p)); continue; }
    i++;
  }
  return out;
}

/* Ce qu'un humain lit dans une chaîne : le texte entre les balises, et les
   attributs qui se lisent (aria-label, placeholder, title). */
function visibleText(lit) {
  const bits = [];
  lit.replace(/(?:aria-label|placeholder|title)="([^"]*)"/g, (_, v) => { bits.push(v); return ''; });
  let s = lit;
  const gt = s.indexOf('>'), lt = s.indexOf('<');
  if (gt >= 0 && (lt < 0 || gt < lt)) s = s.slice(gt + 1);           // commence au milieu d'une balise
  s.split(/<[^>]*(?:>|$)/).forEach((t) => bits.push(t));
  return bits;
}

/* Ce qu'on retire autour d'un morceau : la ponctuation de couture. Une
   parenthèse OUVRANTE en fin de morceau (« Ticket test envoyé ( ») ou fermante en
   tête appartient à la concaténation ; une parenthèse entière, au texte. */
const PUNCT = /^[\s·:«»+)\-–]+|[\s·:«»+(\-–]+$/g;
function fragments(lits) {
  const out = [];
  lits.forEach((lit) => visibleText(lit).forEach((t) => {
    t.split(' · ').forEach((piece) => {
      const f = piece.replace(/&nbsp;/g, ' ').replace(PUNCT, '').trim();
      if (f.length < 3) return;
      if (!/[a-zà-ÿœ]/.test(f)) return;                         // TEST CAISSE, POST, #TEST
      if (!/\s/.test(f) && !/^[A-ZÀ-ÝŒ]/.test(f)) return;       // identifiants : none, block, kpr-status
      if (/^(kpr-|data-|aria-)|[={}#;]|https?:|^\/|\.js\b|\.json\b/.test(f)) return;
      out.push(f);
    });
  }));
  return Array.from(new Set(out));
}

/* Ce qui n'est PAS de l'interface, et pourquoi. */
const NOT_UI = new Set([
  'Content-Type',                       // en-tête HTTP
  'Escape',                             // nom de touche clavier (e.key), jamais affiché
  'Test reçu client', 'Article test',   // imprimé sur le papier du ticket test, pas à l'écran
  'Test', 'Poste', 'Caisse',            // valeurs par défaut d'une donnée (nom, poste) : elles voyagent dans un {x}
  'Café Atlas', 'Othmane N.',            // gabarit de #clo-meta, remplacé au premier rendu
  'ouverture hors horaires',            // motif ENREGISTRÉ dans la fiche horaires, jamais affiché ici
  'Action à autoriser',                 // repli de la fenêtre manager, hors de ces deux surfaces
  'Kiwi Printer Bridge',                // un nom de produit
]);
/* Un mot qui s'écrit pareil en anglais : on exige alors l'arabe seul. */
const SAME_IN_EN = new Set(['Type', 'Port', 'Transactions', '{n} mm', '{n} mm (standard)',
  'Terminal + {n} MAD', '{n}h {n}', '{n} transaction', '{n} transactions']);
const NUM = /\d[\d\s\u202f\u00a0.,]*\d|\d/g;
const sameInEn = (f) => SAME_IN_EN.has(f) || SAME_IN_EN.has(f.replace(NUM, '{n}'));

const TEMPLATE_KEYS = Object.keys(EN).filter((k) => /\{[nx]\}/.test(k));
function covered(f) {
  const en = tr('en', f), ar = tr('ar', f);
  if (ar !== f && (en !== f || sameInEn(f))) return true;
  // Un morceau d'une phrase concaténée : il doit appartenir à une clé connue,
  // traduite des deux côtés.
  return Object.keys(EN).some((k) => k.includes(f) && AR[k] && AR[k] !== k && EN[k]
    && (EN[k] !== k || TEMPLATE_KEYS.includes(k) || SAME_IN_EN.has(k)));
}

function between(src, start, end, label) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + 1);
  check(a >= 0 && b > a, `${label} : repère « ${start.slice(0, 40)} » … « ${end.slice(0, 40)} » trouvé dans la source`);
  return a >= 0 && b > a ? src.slice(a, b) : '';
}
function audit(label, lits) {
  const frs = fragments(lits).filter((f) => !NOT_UI.has(f));
  const missing = frs.filter((f) => !covered(f));
  check(frs.length > 0, `${label} : des phrases ont été lues (${frs.length})`);
  check(!missing.length, `${label} : chaque phrase a sa traduction anglaise et arabe${missing.length ? ' — manque : ' + missing.join(' | ') : ''}`);
  return frs;
}

/* ── 1 · le dialogue d'imprimante ───────────────────────────────────────── */
const pbCore = printerTestSource();
const pbUi = read('assets/printer/pairing-ui.js');
const pb = pbCore + '\n' + pbUi;
const setup = between(pbUi, 'function openSetup(context)', 'core.install(', 'printer-bridge.js · openSetup');
const discovery = between(pb, "window.addEventListener('kiwi:printer-discovery'", 'try { reconnectUsb(); }', 'printer-bridge.js · avis de découverte');
const models = between(pb, 'var MODELS = [', 'function modelNote(id)', 'printer-bridge.js · MODELS');
/* Les fabricants (Epson, Rongta, Zebra…) sont des noms propres. On lit la mise
   en garde de chaque modèle, le libellé générique, et ce qui suit un « · »
   dans un libellé (« Zebra (ZQ / ZD) · étiquettes »). */
const MODELS = vm.runInNewContext(models.replace(/^var MODELS = /, '').replace(/;\s*$/, ''));
const modelLits = [];
MODELS.forEach((m) => {
  if (m.note) modelLits.push(m.note);
  if (m.id === 'escpos') modelLits.push(m.label);
  m.label.split(' · ').slice(1).forEach((q) => modelLits.push(q));
});
check(MODELS.length >= 20 && modelLits.length >= 8, `les modèles d'imprimante sont lus (${MODELS.length} modèles, ${modelLits.length} textes)`);
const paper = between(read('assets/escpos.js'), 'paperWidths: [', ']', 'escpos.js · paperWidths');
const printerFr = audit('Imprimante', jsStrings(setup).concat(jsStrings(discovery), modelLits, jsStrings(paper)));
check(printerFr.length >= 120, `le dialogue d'imprimante est lu en entier (${printerFr.length} phrases ≥ 120)`);

/* ── 2 · la clôture, le Z, l'ouverture hors horaires ───────────────────── */
const html = caisseTestSource(read('kiwi-caisse.html')).replace(/<link rel="stylesheet" href="assets\/caisse-shell\.css\?v=\d+"\s*\/?>/, () => '<style>' + read('assets/caisse-shell.css') + '</style>');
const markup = between(html, '<div class="cloture-veil" id="cloture-modal"', '<!-- ============ TEAM DRAWER', 'kiwi-caisse.html · voiles de clôture')
  .replace(/<!--[\s\S]*?-->/g, '');
const markupText = [];
markup.replace(/>([^<]+)</g, (_, t) => { markupText.push(t); return ''; });
markup.replace(/(?:aria-label|placeholder|title)="([^"]*)"/g, (_, v) => { markupText.push(v); return ''; });
const cloJs = caisseTestSource.declarations('updateEcart','updateCardEcart','openCloture','openTableBills','renderOpenTableBills','renderCloture')
  + caisseTestSource.declarations('tillKitZNumber','showPostClose','finishClose','closeStepWithin','setCloseBusy')
  + between(html, "if (registerClosing) { toast('", "const countInput = $('#clo-count');", 'kiwi-caisse.html · clôture en cours')
  + between(html, "$('#clo-close').addEventListener", "/* ---- L'écran d'après-clôture", 'kiwi-caisse.html · bouton fermer');
const fmtDur = between(html, 'function fmtDur(min) {', '\n    }', 'kiwi-caisse.html · fmtDur');
audit('Clôture', markupText.concat(jsStrings(cloJs), jsStrings(fmtDur)));

/* ── 3 · les phrases composées, telles que la caisse les écrit ─────────── */
const both = (fr, en, ar, label) => {
  check(tr('en', fr) === en, `${label} (EN) : « ${fr} » → « ${tr('en', fr)} »`);
  check(tr('ar', fr) === ar, `${label} (AR) : « ${fr} » → « ${tr('ar', fr)} »`);
};
// Une donnée AU MILIEU d'une phrase traverse sans être lue : le {x}.
both('Imprimante « Cuisine » enregistrée', 'Printer “Cuisine” saved', 'تم حفظ الطابعة «Cuisine»', 'le nom de l\'imprimante reste celui du commerçant');
both('Ticket test envoyé (Bar)', 'Test receipt sent (Bar)', 'تم إرسال التذكرة التجريبية (Bar)', 'le poste passe dans la parenthèse');
both('Imprimante retrouvée sur 192.168.1.50. La file reprend automatiquement.',
  'Printer found again at 192.168.1.50. The queue resumes automatically.',
  'تم العثور على الطابعة مجددًا على 192.168.1.50. تستأنف قائمة الانتظار تلقائيًا.', 'une adresse IP n\'est pas un nombre à traduire');
both('Connectée · EPSON TM-T20', 'Connected · EPSON TM-T20', 'متصلة · EPSON TM-T20', 'le nom Bluetooth de l\'imprimante');
// Un échec porte sa raison derrière « · » : chaque morceau se traduit.
both('Échec · Imprimante injoignable · vérifiez l’adresse IP et qu’elle est allumée',
  'Failed · Printer unreachable · check the IP address and that it is switched on',
  'فشل · تعذّر الوصول إلى الطابعة · تحقق من عنوان IP ومن أنها مشغّلة', 'un échec et sa raison');
both('2 tickets en attente · nouvelle tentative automatique', '2 tickets waiting · retrying automatically', '2 تذاكر في الانتظار · إعادة المحاولة تلقائيًا', 'la file du hub');
both('Pont connecté · v1.4.0 · impression maintenue, mise à jour de sécurité recommandée',
  'Bridge connected · v1.4.0 · printing still works, security update recommended',
  'الجسر متصل · v1.4.0 · الطباعة مستمرة، يُنصح بتحديث أمني', 'la version du pont traverse');
both('80 mm (standard)', '80 mm (standard)', '80 مم (قياسي)', 'la largeur du rouleau');
// La clôture : l'en-tête, la durée, les écarts, le récapitulatif du Z.
both('Café Atlas · Othmane N. · Lundi 12 octobre', 'Café Atlas · Othmane N. · Monday 12 October', 'Café Atlas · Othmane N. · الاثنين 12 أكتوبر', 'la date en toutes lettres de la clôture');
both('2h 05', '2h 05', '2 س 05 د', 'une durée de service');
both('45 mn', '45 min', '45 د', 'une durée courte');
both('Rapproché · 0 MAD', 'Matched · 0 MAD', 'متطابق · 0 MAD', 'le rapprochement carte à zéro');
both('Terminal + 120 MAD', 'Terminal + 120 MAD', 'الجهاز + 120 MAD', 'un écart terminal');
both('12 transactions · Z provisoire · rapprochement distant incomplet · écart − 15 MAD · carte rapprochée',
  '12 transactions · Provisional Z · remote reconciliation incomplete · difference − 15 MAD · card matched',
  '12 معاملة · Z مؤقت · المطابقة عن بُعد غير مكتملة · الفرق − 15 MAD · البطاقة متطابقة', 'le récapitulatif du Z');
both('Caisse fermée · à bientôt Rania', 'Till closed · see you soon, Rania', 'تم إغلاق الصندوق · إلى اللقاء Rania', 'le dernier mot de la caisse');
both("de l'objectif d'lyoum, 10 440 MAD restants.", 'of today’s target, 10 440 MAD to go.', 'من هدف اليوم، يتبقى 10 440 MAD.', 'le reste de l\'objectif (démonstration)');
// Les montants ne bougent pas : ni chiffres, ni « MAD », ni séparateurs.
check(tr('en', 'Rapproché · 1 234,50 MAD').endsWith('1 234,50 MAD'), 'un montant MAD traverse la traduction tel quel');

/* ── 4 · le dialogue et la clôture suivent la page en arabe ─────────────── */
check(/\[dir="rtl"\] \.kpr-x\{float:left;\}/.test(pb), 'en arabe, la croix du dialogue passe à gauche');
check(!/margin-left:2px/.test(between(pb, 'function injectCss()', 'function openSetup(', 'printer-bridge.js · injectCss')), 'le dialogue n\'a plus de marge physique à gauche');
check(/\.clo-row\.is-sub \.clo-row-label \{ padding-inline-start: 14px;/.test(html), 'les sous-lignes de la clôture s\'indentent du côté où l\'on lit');
check(/\[lang="ar"\] \.clo-eyebrow, \[lang="ar"\] \.clo-drawer-title \{ letter-spacing: 0; \}/.test(html), 'pas d\'espacement des lettres sur l\'arabe de la clôture');
check(/vocab\(undefined, carteLang\(\)\)/.test(html), 'le Z compte « plats » ou « dishes » selon la langue de la caisse');
check(/KH\.summary\(Date\.now\(\), undefined, carteLang\(\)\)/.test(html), 'l\'ouverture hors horaires dit les horaires dans la langue de la caisse');

/* ── 5 · « Dissocier ce pont ? » : plus de boîte native ────────────────────
   La question s'ouvre dans le panneau (askRevoke), ses textes passent par
   say(), le focus part sur Annuler, Échap ou Annuler ne touchent pas au relais
   et rendent le focus au ×, seul « Dissocier » appelle relayRevoke. La VRAIE
   fonction tourne ici, sur un DOM de poche. */
check(!/(^|[^\w.])confirm\(/m.test(pb) && !/window\.confirm\(/.test(pb), 'printer-bridge.js n\'ouvre plus aucune boîte native confirm()');
{
  const askSrc = between(pb, 'var askSeq = 0;', '    function showPairCode(j) {', 'printer-bridge.js · askRevoke');
  let focused = null;
  const node = (tag) => {
    const n = { tag, attrs: {}, listeners: {}, className: '', disabled: false, parentNode: null,
      setAttribute(k, v) { n.attrs[k] = String(v); }, getAttribute(k) { return n.attrs[k] == null ? null : n.attrs[k]; },
      addEventListener(t, fn) { (n.listeners[t] ||= []).push(fn); },
      fire(t, e) { (n.listeners[t] || []).forEach((fn) => fn.call(n, e || {})); },
      focus() { focused = n; },
      classList: { contains: (c) => n.className.split(/\s+/).includes(c) } };
    let html = '';
    Object.defineProperty(n, 'innerHTML', { get: () => html, set: (v) => {
      html = v; n.kids = {};
      ['data-relay-keep', 'data-relay-confirm'].forEach((a) => { if (v.includes(a)) n.kids[a] = node('button'); });
    } });
    n.querySelector = (sel) => { const a = (sel.match(/^\[([\w-]+)\]$/) || [])[1]; return (n.kids && n.kids[a]) || null; };
    return n;
  };
  const list = { kids: [], insertBefore(x, ref) { const i = ref ? list.kids.indexOf(ref) : -1; x.parentNode = list; if (i < 0) list.kids.push(x); else list.kids.splice(i, 0, x); },
    removeChild(x) { list.kids = list.kids.filter((k) => k !== x); x.parentNode = null; } };
  const row = node('div'); row.className = 'kpr-relay-row'; row.parentNode = list; list.kids.push(row);
  Object.defineProperty(row, 'nextSibling', { get: () => list.kids[list.kids.indexOf(row) + 1] || null });
  Object.defineProperty(row, 'nextElementSibling', { get: () => list.kids[list.kids.indexOf(row) + 1] || null });
  const x = node('button'); x.setAttribute('data-relay-revoke', 'b-7'); x.closest = (sel) => (sel === '.kpr-relay-row' ? row : null);
  const calls = { revoke: [], toast: [], paint: 0 };
  const ctx = vm.createContext({
    document: { createElement: node },
    esc: (v) => String(v),
    say: (fr) => '«' + tr('en', fr) + '»',
    // pairing-ui.js lit say() sous le nom tr() (var tr = say) : même fonction.
    tr: (fr) => '«' + tr('en', fr) + '»',
    relayRevoke: (id) => { calls.revoke.push(id); return { then: (fn) => fn(true) }; },
    toast: (m) => calls.toast.push(m), paintRelay: () => { calls.paint++; }, refreshStatus: () => {},
  });
  vm.runInContext(askSrc + '\nthis.askRevoke = askRevoke;', ctx, { filename: 'printer-bridge.js#askRevoke' });
  const open = () => { focused = x; ctx.askRevoke(x); return list.kids[1]; };

  let box = open();
  check(box && box.getAttribute('role') === 'alertdialog' && /«Unlink this bridge\? It will no longer receive tickets from your tablets\.»/.test(box.innerHTML)
    && /data-relay-keep>«Cancel»/.test(box.innerHTML) && /data-relay-confirm>«Unlink»/.test(box.innerHTML),
    'Dissocier : la question s\'ouvre dans le panneau, ses trois textes passent par say() (EN : Unlink / Cancel)');
  check(focused === box.kids['data-relay-keep'] && x.getAttribute('aria-expanded') === 'true', 'le focus entre dans la question, sur Annuler (le choix sûr)');
  let stopped = false;
  box.fire('keydown', { key: 'Escape', preventDefault() {}, stopPropagation() { stopped = true; } });
  check(list.kids.length === 1 && focused === x && stopped && calls.revoke.length === 0, 'Échap : la question se ferme, rien n\'est dissocié, le focus revient au ×');
  box = open();
  box.kids['data-relay-keep'].fire('click');
  check(list.kids.length === 1 && focused === x && calls.revoke.length === 0 && x.getAttribute('aria-expanded') === 'false', 'Annuler : le pont reste associé, le focus revient au ×');
  box = open(); ctx.askRevoke(x);
  check(list.kids.length === 2, 'un second clic sur × n\'ouvre pas une seconde question');
  box.kids['data-relay-confirm'].fire('click');
  check(calls.revoke.join() === 'b-7' && box.kids['data-relay-confirm'].disabled && calls.toast[0] === '«' + tr('en', 'Pont dissocié') + '»' && calls.paint === 1, 'Dissocier : relayRevoke une fois sur ce pont, puis le relais se repeint');
}

if (failed) { console.error(`\n✗ ${failed} vérification(s) en échec sur l'imprimante et la clôture.`); process.exit(1); }
console.log(`✓ ${ran} vérifications · imprimante et clôture en FR/EN/AR.`);
