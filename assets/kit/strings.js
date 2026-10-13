/* Kiwi · strings.js · KiwiStrings, le rendu des chaînes à clé (design 2027, §9).
 *
 * Les paquets assets/kit/strings/<surface>.<lang>.js s'enregistrent eux-mêmes
 * dans self.__kiwiStrings['<surface>.<lang>']. Ce fichier ne charge rien : il
 * lit le registre à la demande, donc l'ordre des balises <script> n'a pas
 * d'importance (§9.3 : jamais d'URL construite à l'exécution).
 *
 *   KiwiStrings.t(key, args)       texte, chaque argument isolé par FSI … PDI
 *                                   (aria-label, title, presse-papiers) ;
 *                                   une clé à liste renvoie un tableau
 *   KiwiStrings.format(key, args)  DocumentFragment ; chaque argument dans son
 *                                   propre <bdi> (dir="ltr" pour un nombre ou
 *                                   un montant, sinon la direction de son
 *                                   premier caractère fort)
 *   KiwiStrings.raw(key, args)     texte sans isolats (tests, journaux)
 *   KiwiStrings.ltr(text)          marque un argument comme nombre/montant
 *   KiwiStrings.setLocale('fr')    / locale() / has(key)
 *
 * Chaîne de repli (§9.3) : la langue courante, puis EN. Le français n'est
 * JAMAIS le repli de l'EN ni de l'AR. Une clé absente de la langue courante
 * affiche l'EN et journalise la clé ; absente de l'EN, elle affiche la clé.
 *
 * Syntaxe : sous-ensemble d'ICU MessageFormat. {nom} ; {n, plural, one {…}
 * other {…}} (catégories zero one two few many other, et =N) ; # dans une
 * branche vaut le nombre. Pas d'apostrophe d'échappement : les accolades sont
 * de la syntaxe et ne servent jamais de texte. Les catégories viennent de
 * Intl.PluralRules (Safari 13+), jamais d'une table à la main. */
(function (root) {
  'use strict';

  var FSI = '⁨';
  var PDI = '⁩';
  var current = null;
  var warned = {};
  var merged = {};            // lang → { count, map }
  var rules = {};             // lang → Intl.PluralRules
  var parsed = {};            // message → arbre

  function registry() { return (root.__kiwiStrings = root.__kiwiStrings || {}); }

  function warn(msg) {
    var k = 'w:' + msg;
    if (warned[k]) return;
    warned[k] = 1;
    try { if (root.console && root.console.warn) root.console.warn('[KiwiStrings] ' + msg); } catch (e) { /* journal muet */ }
  }

  function locale() {
    if (current) return current;
    var l = '';
    try { l = (root.document && root.document.documentElement && root.document.documentElement.lang) || ''; } catch (e) { l = ''; }
    l = String(l).slice(0, 2).toLowerCase();
    return l === 'fr' || l === 'ar' ? l : 'en';
  }

  function setLocale(l) {
    l = String(l || '').slice(0, 2).toLowerCase();
    current = l === 'fr' || l === 'ar' ? l : 'en';
    return current;
  }

  /* Tous les paquets d'une langue, fusionnés. Recalculé quand un paquet arrive. */
  function table(lang) {
    var reg = registry();
    var names = Object.keys(reg);
    var m = merged[lang];
    if (m && m.count === names.length) return m.map;
    var map = {};
    names.forEach(function (n) {
      if (n.slice(-3) !== '.' + lang) return;
      var b = reg[n];
      for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) map[k] = b[k];
    });
    merged[lang] = { count: names.length, map: map };
    return map;
  }

  function lookup(key) {
    var lang = locale();
    var v = table(lang)[key];
    if (v != null) return { lang: lang, value: v };
    if (lang !== 'en') {
      v = table('en')[key];
      if (v != null) { warn('"' + key + '" missing in ' + lang + ', showing EN'); return { lang: 'en', value: v }; }
    }
    warn('"' + key + '" missing in EN');
    return null;
  }

  function has(key) { return table('en')[key] != null || table(locale())[key] != null; }

  /* ── Analyse ───────────────────────────────────────────────────────────── */

  function parseMessage(s, i, inPlural) {
    var nodes = [];
    var text = '';
    function flush() { if (text) { nodes.push({ t: 'text', v: text }); text = ''; } }
    while (i < s.length) {
      var c = s.charAt(i);
      if (c === '}') {
        if (inPlural === null) throw new Error('accolade fermante isolée dans « ' + s + ' »');
        flush();
        return { nodes: nodes, end: i };
      }
      if (c === '#' && inPlural) { flush(); nodes.push({ t: 'hash', name: inPlural }); i++; continue; }
      if (c !== '{') { text += c; i++; continue; }
      flush();
      i++;
      var j = i;
      while (j < s.length && s.charAt(j) !== ',' && s.charAt(j) !== '}') j++;
      var name = s.slice(i, j).trim();
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw new Error('nom d\'argument illisible « ' + name + ' » dans « ' + s + ' »');
      if (s.charAt(j) === '}') { nodes.push({ t: 'arg', name: name }); i = j + 1; continue; }
      // {name, plural, cat {…} …}
      j++;
      var k = j;
      while (k < s.length && s.charAt(k) !== ',') k++;
      if (s.slice(j, k).trim() !== 'plural') throw new Error('seul « plural » est géré dans « ' + s + ' »');
      k++;
      var branches = {};
      for (;;) {
        while (k < s.length && /\s/.test(s.charAt(k))) k++;
        if (s.charAt(k) === '}') { k++; break; }
        var sel = k;
        while (k < s.length && !/[\s{]/.test(s.charAt(k))) k++;
        var cat = s.slice(sel, k);
        while (k < s.length && /\s/.test(s.charAt(k))) k++;
        if (!cat || s.charAt(k) !== '{') throw new Error('branche illisible dans « ' + s + ' »');
        var inner = parseMessage(s, k + 1, name);
        branches[cat] = inner.nodes;
        k = inner.end + 1;
      }
      nodes.push({ t: 'plural', name: name, branches: branches });
      i = k;
    }
    if (inPlural !== null) throw new Error('accolade non fermée dans « ' + s + ' »');
    flush();
    return { nodes: nodes, end: i };
  }

  function parse(message) {
    var p = parsed[message];
    if (!p) p = parsed[message] = parseMessage(String(message), 0, null).nodes;
    return p;
  }

  /* ── Arguments ─────────────────────────────────────────────────────────── */

  function ltr(text) { return { kiwiArg: true, text: String(text), dir: 'ltr' }; }

  function norm(v) {
    if (v == null) return null;
    if (typeof v === 'number') return { text: String(v), dir: 'ltr', n: v };
    if (typeof v === 'object' && v.kiwiArg) return { text: v.text, dir: v.dir, n: v.n };
    if (typeof v === 'object' && v.nodeType) return { node: v, dir: null };
    return { text: String(v), dir: null };
  }

  function numberOf(a) {
    if (!a) return NaN;
    if (typeof a.n === 'number') return a.n;
    return Number(a.text);
  }

  function category(lang, n) {
    var pr = rules[lang] || (rules[lang] = new Intl.PluralRules(lang));
    return pr.select(n);
  }

  function pickBranch(node, lang, args) {
    var n = numberOf(norm(args[node.name]));
    if (isNaN(n)) { warn('argument pluriel « ' + node.name + ' » absent ou non numérique'); return node.branches.other || []; }
    if (node.branches['=' + n]) return node.branches['=' + n];
    return node.branches[category(lang, n)] || node.branches.other || [];
  }

  /* Aplati l'arbre en une suite de morceaux { text } | { arg: normalisé, name }. */
  function pieces(nodes, lang, args, out) {
    nodes.forEach(function (node) {
      if (node.t === 'text') out.push({ text: node.v });
      else if (node.t === 'arg' || node.t === 'hash') {
        var a = norm(args[node.name]);
        if (!a) { warn('argument « ' + node.name + ' » manquant'); return; }
        out.push({ arg: a, name: node.name });
      } else pieces(pickBranch(node, lang, args), lang, args, out);
    });
    return out;
  }

  /* Une étiquette qui s'ouvre sur un argument est mise en capitale par t()
   * (§9.4 : « {weekday} dernier à {time} »). Seul le jour de la semaine : un
   * nom saisi par le commerçant n'est jamais retouché. */
  var CAPITALISE = { weekday: 1 };
  function capitalise(list, lang) {
    var first = list[0];
    if (!first || !first.arg || !CAPITALISE[first.name] || first.arg.node) return;
    var s = first.arg.text;
    if (!s) return;
    var cp = String.fromCodePoint(s.codePointAt(0));
    first.arg = { text: cp.toLocaleUpperCase(lang) + s.slice(cp.length), dir: first.arg.dir, n: first.arg.n };
  }

  function entryFor(key) {
    var hit = lookup(key);
    return hit ? { lang: hit.lang, value: hit.value } : { lang: 'en', value: key };
  }

  function build(key, args) {
    var e = entryFor(key);
    args = args || {};
    function one(msg) {
      var list = pieces(parse(msg), e.lang, args, []);
      capitalise(list, e.lang);
      return list;
    }
    return Array.isArray(e.value) ? { multi: true, items: e.value.map(one) } : { multi: false, items: one(e.value) };
  }

  function textOf(list, isolate) {
    return list.map(function (p) {
      if (p.text != null) return p.text;
      var s = p.arg.node ? (p.arg.node.textContent || '') : p.arg.text;
      return isolate ? FSI + s + PDI : s;
    }).join('');
  }

  function t(key, args) {
    var b = build(key, args);
    return b.multi ? b.items.map(function (l) { return textOf(l, true); }) : textOf(b.items, true);
  }

  function raw(key, args) {
    var b = build(key, args);
    return b.multi ? b.items.map(function (l) { return textOf(l, false); }) : textOf(b.items, false);
  }

  function fragment(list) {
    var doc = root.document;
    var frag = doc.createDocumentFragment();
    list.forEach(function (p) {
      if (p.text != null) { frag.appendChild(doc.createTextNode(p.text)); return; }
      var bdi = doc.createElement('bdi');
      if (p.arg.dir) bdi.setAttribute('dir', p.arg.dir);
      if (p.arg.node) bdi.appendChild(p.arg.node); else bdi.textContent = p.arg.text;
      frag.appendChild(bdi);
    });
    return frag;
  }

  function format(key, args) {
    var b = build(key, args);
    return b.multi ? b.items.map(fragment) : fragment(b.items);
  }

  /* Pour les tests : chaque phrase complète qu'un message peut produire, les
   * arguments restant écrits {nom} (# devient {nom} du sélecteur). */
  function expand(message) {
    var out = [];
    (function walk(nodes) {
      var at = -1;
      nodes.forEach(function (n, idx) { if (at < 0 && n.t === 'plural') at = idx; });
      if (at < 0) {
        out.push(nodes.map(function (n) { return n.t === 'text' ? n.v : '{' + n.name + '}'; }).join(''));
        return;
      }
      var node = nodes[at];
      Object.keys(node.branches).forEach(function (cat) {
        walk(nodes.slice(0, at).concat(node.branches[cat], nodes.slice(at + 1)));
      });
    })(parse(message));
    return out;
  }

  /* Les catégories de chaque sélecteur du message, par nom d'argument. */
  function selectors(message) {
    var out = {};
    (function walk(nodes) {
      nodes.forEach(function (n) {
        if (n.t !== 'plural') return;
        out[n.name] = Object.keys(n.branches);
        Object.keys(n.branches).forEach(function (c) { walk(n.branches[c]); });
      });
    })(parse(message));
    return out;
  }

  /* Les noms d'arguments (sélecteurs compris) de toutes les branches. */
  function argNames(message) {
    var set = {};
    (function walk(nodes) {
      nodes.forEach(function (n) {
        if (n.t === 'arg' || n.t === 'hash') set[n.name] = 1;
        if (n.t === 'plural') { set[n.name] = 1; Object.keys(n.branches).forEach(function (c) { walk(n.branches[c]); }); }
      });
    })(parse(message));
    return Object.keys(set).sort();
  }

  var api = {
    t: t, format: format, raw: raw, ltr: ltr, has: has,
    locale: locale, setLocale: setLocale,
    categories: function (lang) { return new Intl.PluralRules(lang).resolvedOptions().pluralCategories.slice(); },
    _pieces: function (key, args) { var b = build(key, args); return b.items; },
    _parse: parse, _expand: expand, _selectors: selectors, _args: argNames, _table: table, _FSI: FSI, _PDI: PDI,
  };
  root.KiwiStrings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : (typeof globalThis !== 'undefined' ? globalThis : this));
