/* Kiwi · format.js , KiwiFormat, le seul formateur de chiffres, de dates et d'unités.
 *
 * Direction 2027, §6.3. `Intl` seul ne produit pas le tableau du produit
 * (mesuré dans Chromium 152) : le français groupe avec U+202F, l'arabe
 * (`ar-MA`) groupe avec un point, le pourcent arabe sort trois repères
 * bidirectionnels, la date arabe porte une virgule arabe, le compact anglais
 * sort `30.1k`, et tout négatif est un trait d'union. Ni la police latine ni
 * l'arabe livrées n'ont U+202F (§6.1).
 *
 * Donc ce module NOMME ses locales (en-GB, fr-FR, ar-MA-u-nu-latn : chiffres
 * latins, mois marocains) puis ASSEMBLE chaque chaîne depuis `formatToParts`,
 * par type de partie, sans jamais éditer une chaîne déjà formatée :
 *
 *   group → ',' (EN) · U+00A0 (FR, AR)        decimal → '.' (EN) · ',' (FR, AR)
 *   minusSign → U+2212, plusSign → '+'        literal d'un nombre → supprimé
 *   percentSign → '%' (EN) · U+00A0 puis '%'  compact → K / M · U+00A0 k / M · U+00A0 ألف / مليون
 *   dates → weekday, day, month dans cet ordre, séparés par UN espace
 *   heure → hour:minute, h23, 2 chiffres      jour relatif → RelativeTimeFormat, 'auto' à 0 et 1
 *
 * Le signe est posé par nous, sur la valeur ARRONDIE aux chiffres affichés :
 * -0.004 à deux décimales s'écrit « 0.00 », jamais « \u22120.00 » (zéro négatif).
 *
 * Une assertion passe sur chaque chaîne rendue : aucun de U+200E, U+200F,
 * U+061C, U+202F ni trait d'union. En test (`KiwiFormat.strict = true`) elle
 * lève. En production elle ne vide JAMAIS un chiffre : la chaîne est réparée
 * (les repères tombent, U+202F devient U+00A0, le trait d'union devient U+2212),
 * affichée, et `KiwiReportError(new Error('format-banned-char'),
 * 'format:<appel>')` part UNE fois par appel et par chargement de page, avec les
 * points de code trouvés et jamais la valeur.
 *
 * Les dates viennent de la zone du MAGASIN, jamais de l'appareil :
 *   · une date civile 'AAAA-MM-JJ' (un jour commercial) n'a pas de zone ;
 *   · un instant (ms ou Date) est lu dans `configure({ zone })`, sinon dans
 *     KiwiBusinessDay.DEFAULT_ZONE.
 *
 * Une valeur qui n'est pas un nombre fini ou une date lisible rend ''. Le
 * composant montre alors l'état « non calculable » (§17.3), pas un zéro.
 *
 * Usage :
 *   KiwiFormat.for('fr').money(19174.5, 2)   → '19 174,50 MAD' (U+00A0 partout)
 *   KiwiFormat.setLang('ar'); KiwiFormat.signed(-13, 0)
 * Sans état caché hors langue et zone. Aucune dépendance. */
(function (root) {
  'use strict';

  var NBSP = '\u00A0';
  var MINUS = '\u2212';
  var BANNED = /[\u200E\u200F\u061C\u202F\-]/g;

  var LOCALES = {
    en: {
      tags: ['en-GB'], group: ',', decimal: '.', pct: '%', compactSep: '',
      k: 'K', m: 'M', unit: 'MAD', pt: 'pt', min: 'min', hour: 'h', now: 'Just now',
      last: function (w) { return 'last ' + w; }
    },
    fr: {
      tags: ['fr-FR'], group: NBSP, decimal: ',', pct: NBSP + '%', compactSep: NBSP,
      k: 'k', m: 'M', unit: 'MAD', pt: 'pt', min: 'min', hour: 'h', now: "À l'instant",
      last: function (w) { return w + ' dernier'; }
    },
    ar: {
      tags: ['ar-MA-u-nu-latn', 'ar-u-nu-latn', 'ar'], group: NBSP, decimal: ',', pct: NBSP + '%', compactSep: NBSP,
      k: 'ألف', m: 'مليون',
      unit: 'درهم', pt: 'نقطة', min: 'د', hour: 'س',
      now: 'الآن',
      last: function (w) { return w + ' الماضي'; }
    }
  };

  var state = { lang: '', zone: '', strict: false };
  var reported = {};
  var cache = {};

  /* ── langue, zone ───────────────────────────────────────────────────── */

  function normLang(l) {
    var s = String(l == null ? '' : l).toLowerCase().slice(0, 2);
    return LOCALES[s] ? s : '';
  }
  function currentLang() {
    var l = normLang(state.lang);
    if (l) return l;
    try { l = normLang(document.documentElement.getAttribute('lang')); } catch (_) { l = ''; }
    if (l) return l;
    try { l = normLang(localStorage.getItem('kiwiLang')); } catch (_) { l = ''; }
    return l || 'fr';
  }
  function defaultZone() {
    if (state.zone) return state.zone;
    var bd = root && root.KiwiBusinessDay;
    /* The store default lives only in business-day.js (§17.1, kit-lint K7): ask it. */
    return (bd && typeof bd.resolve === 'function' && bd.resolve({}).zone) || 'UTC';
  }

  /* ── Intl, mis en cache, avec repli de balise ───────────────────────── */

  function build(kind, lang, opts) {
    var key = kind + '|' + lang + '|' + JSON.stringify(opts);
    if (cache[key]) return cache[key];
    var tags = LOCALES[lang].tags, made = null, err = null;
    for (var i = 0; i < tags.length && !made; i++) {
      try {
        if (kind === 'n') made = new Intl.NumberFormat(tags[i], opts);
        else if (kind === 'd') made = new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)(tags[i], opts);
        else made = new Intl.RelativeTimeFormat(tags[i], opts);
      } catch (e) { err = e; }
    }
    if (!made) throw err || new Error('format-no-locale');
    cache[key] = made;
    return made;
  }
  function numberFormat(lang, o) {
    var base = { minimumFractionDigits: o.min, maximumFractionDigits: o.max };
    if (o.percent) base.style = 'percent';
    /* 'always' groupe aussi les nombres à quatre chiffres ; un moteur qui ne
     * le connaît pas retombe sur le groupement par défaut, qui les groupe déjà
     * en en, fr et ar-MA. */
    try { return build('n', lang, Object.assign({ useGrouping: 'always' }, base)); }
    catch (_) { return build('n', lang, Object.assign({ useGrouping: true }, base)); }
  }

  /* ── la règle des parties ───────────────────────────────────────────── */

  /* Le cœur d'un nombre positif : { text, zero }. `zero` dit que l'arrondi aux
   * chiffres affichés donne zéro, donc qu'aucun signe ne s'écrit. */
  function core(lang, abs, min, max, percent) {
    var L = LOCALES[lang];
    var out = '', digits = '';
    numberFormat(lang, { min: min, max: max, percent: !!percent }).formatToParts(abs).forEach(function (p) {
      if (p.type === 'integer' || p.type === 'fraction') { out += p.value; digits += p.value; }
      else if (p.type === 'group') out += L.group;
      else if (p.type === 'decimal') out += L.decimal;
      else if (p.type === 'percentSign') out += L.pct;
      /* literal, minusSign, plusSign : supprimés, le signe est le nôtre. */
    });
    return { text: out, zero: !/[1-9]/.test(digits) };
  }
  function finite(n) { return typeof n === 'number' && isFinite(n); }
  function sign(n, zero, mode) {
    if (zero) return '';
    if (n < 0) return MINUS;
    return mode === 'exceptZero' ? '+' : '';
  }
  function digitsOf(d, fallback) {
    d = d === undefined || d === null ? fallback : Math.round(Number(d));
    return isFinite(d) && d >= 0 && d <= 10 ? d : fallback;
  }

  /* ── l'assertion ────────────────────────────────────────────────────── */

  function names(found) {
    return Object.keys(found).map(function (c) { return 'U+' + ('0000' + c.charCodeAt(0).toString(16).toUpperCase()).slice(-4); }).join(',');
  }
  function guard(str, call) {
    if (typeof str !== 'string') return str;
    BANNED.lastIndex = 0;
    if (!BANNED.test(str)) return str;
    var found = {};
    str.replace(BANNED, function (c) { found[c] = 1; return c; });
    if (state.strict || api.strict) throw new Error('format-banned-char in ' + call + ': ' + names(found));
    if (!reported[call]) {
      reported[call] = 1;
      try {
        if (root && typeof root.KiwiReportError === 'function') {
          var e = new Error('format-banned-char');
          e.codepoints = names(found);
          root.KiwiReportError(e, 'format:' + call);
        }
      } catch (_) {}
    }
    return str.replace(BANNED, function (c) { return c === '\u202F' ? NBSP : c === '-' ? MINUS : ''; });
  }

  /* ── un formateur lié à une langue ──────────────────────────────────── */

  function make(getLang) {
    function L() { return LOCALES[getLang()]; }
    function lang() { return getLang(); }

    function numCore(n, d, mode, call) {
      if (!finite(n)) return '';
      var c = core(lang(), Math.abs(n), d, d, false);
      return guard(sign(n, c.zero, mode) + c.text, call);
    }

    var f = {};

    /* Un montant ou un compte : moins seulement sur un négatif. */
    f.num = function (n, digits) { return numCore(n, digitsOf(digits, 0), 'auto', 'num'); };
    /* Un changement : + ou \u2212, rien sur zéro. */
    f.signed = function (n, digits) { return numCore(n, digitsOf(digits, 0), 'exceptZero', 'signed'); };

    /* Un changement en pourcentage (frac 0.042 → +4.2 %). */
    f.pct = function (frac, digits) {
      if (!finite(frac)) return '';
      var d = digitsOf(digits, 1);
      var c = core(lang(), Math.abs(frac), d, d, true);
      return guard(sign(frac, c.zero, 'exceptZero') + c.text, 'pct');
    };
    /* Une part d'un tout : entière, non signée (82 %). */
    f.share = function (frac) {
      if (!finite(frac)) return '';
      var c = core(lang(), Math.abs(frac), 0, 0, true);
      return guard(sign(frac, c.zero, 'auto') + c.text, 'share');
    };

    f.unit = function (text, which) {
      var u = L()[which || 'unit'];
      return text === '' ? '' : text + NBSP + u;
    };
    f.money = function (n, digits) {
      var t = f.num(n, digits);
      return t === '' ? '' : guard(t + NBSP + L().unit, 'money');
    };
    f.signedMoney = function (n, digits) {
      var t = f.signed(n, digits);
      return t === '' ? '' : guard(t + NBSP + L().unit, 'signedMoney');
    };
    /* Un point de pourcentage (le changement d'un pourcentage) : +1 pt. */
    f.pts = function (n, digits) {
      var t = f.signed(n, digits);
      return t === '' ? '' : guard(t + NBSP + L().pt, 'pts');
    };

    /* 20K, 30.1K, 1.2M : un chiffre après la virgule au plus, puis K ou M. */
    f.compact = function (n) {
      if (!finite(n)) return '';
      var l = lang(), loc = L(), abs = Math.abs(n);
      var body, c;
      if (Math.round(abs) < 1000) {
        c = core(l, abs, 0, 0, false);
        body = c.text;
      } else {
        var k = abs / 1000;
        if (Math.round(k * 10) / 10 < 1000) {
          c = core(l, k, 0, 1, false);
          body = c.text + loc.compactSep + loc.k;
        } else {
          c = core(l, abs / 1e6, 0, 1, false);
          body = c.text + loc.compactSep + loc.m;
        }
      }
      return guard(sign(n, c.zero, 'auto') + body, 'compact');
    };

    /* 45 min, 3 h, À l'instant : `minutes` écoulées. */
    f.elapsed = function (minutes) {
      if (!finite(minutes)) return '';
      var loc = L(), m = Math.max(0, Math.floor(minutes));
      if (m < 1) return guard(loc.now, 'elapsed');
      if (m < 60) return guard(f.num(m, 0) + NBSP + loc.min, 'elapsed');
      return guard(f.num(Math.floor(m / 60), 0) + NBSP + loc.hour, 'elapsed');
    };

    /* ── dates ── */

    function instant(v) {
      if (v instanceof Date) v = v.getTime();
      return finite(v) ? v : NaN;
    }
    /* Rend { date, zone } : une date civile se lit en UTC à midi (aucune zone
     * ne peut la déplacer d'un jour), un instant dans la zone du magasin. */
    function when(v) {
      if (typeof v === 'string') {
        var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
        if (!m) return null;
        var t = Date.UTC(+m[1], +m[2] - 1, +m[3], 12);
        var back = new Date(t);
        if (back.getUTCMonth() !== +m[2] - 1 || back.getUTCDate() !== +m[3]) return null;
        return { t: t, zone: 'UTC' };
      }
      var e = instant(v);
      return isNaN(e) ? null : { t: e, zone: defaultZone() };
    }
    function dateParts(v, opts, order) {
      var w = when(v);
      if (!w) return '';
      var o = Object.assign({ timeZone: w.zone }, opts);
      var got = {};
      build('d', lang(), o).formatToParts(w.t).forEach(function (p) { if (p.type !== 'literal') got[p.type] = p.value; });
      return order.map(function (k) { return got[k]; }).filter(Boolean).join(' ');
    }
    f.date = function (v) {
      return guard(dateParts(v, { weekday: 'long', day: 'numeric', month: 'long' }, ['weekday', 'day', 'month']), 'date');
    };
    /* 3 Oct, 3 oct. ; l'arabe garde le mois entier, 3 أكتوبر. */
    f.short = function (v) {
      return guard(dateParts(v, { day: 'numeric', month: lang() === 'ar' ? 'long' : 'short' }, ['day', 'month']), 'short');
    };
    f.weekday = function (v) {
      return guard(dateParts(v, { weekday: 'long' }, ['weekday']), 'weekday');
    };
    /* last Monday, lundi dernier, الاثنين الماضي. */
    f.weekdayBaseline = function (v) {
      var w = f.weekday(v);
      return w === '' ? '' : guard(L().last(w), 'weekdayBaseline');
    };
    /* 17:39 : 'HH:MM' tel quel (complété), ou un instant lu dans la zone du magasin. */
    f.time = function (v) {
      if (typeof v === 'string') {
        var m = /^(\d{1,2}):(\d{2})$/.exec(v);
        if (!m || +m[1] > 23 || +m[2] > 59) return '';
        return guard(('0' + m[1]).slice(-2) + ':' + m[2], 'time');
      }
      var e = instant(v);
      if (isNaN(e)) return '';
      var got = {};
      build('d', lang(), { timeZone: defaultZone(), hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
        .formatToParts(e).forEach(function (p) { got[p.type] = p.value; });
      var h = got.hour === '24' ? '00' : got.hour;
      return guard(h + ':' + got.minute, 'time');
    };

    /* today, yesterday, 2 days ago : `days` en arrière (0, 1, 2, ...). */
    f.rel = function (days) {
      if (!finite(days)) return '';
      var n = Math.round(days);
      var rtf = build('r', lang(), { numeric: Math.abs(n) <= 1 ? 'auto' : 'always' });
      var out = '';
      rtf.formatToParts(-n, 'day').forEach(function (p) {
        if (p.type === 'integer') out += p.value;
        else if (p.type === 'literal') out += p.value.replace(/[\u200E\u200F\u061C]/g, '').replace(/\u2019/g, "'");
      });
      return guard(out, 'rel');
    };

    return f;
  }

  var api = make(currentLang);

  /* Un formateur figé sur une langue, pour un composant qui reçoit la sienne. */
  api.for = function (l) {
    var fixed = normLang(l) || currentLang();
    var bound = make(function () { return fixed; });
    bound.lang = fixed;
    return bound;
  };
  api.setLang = function (l) { state.lang = normLang(l); return currentLang(); };
  api.lang = currentLang;
  /* `zone` : la zone du magasin pour les instants (KiwiBusinessDay.resolve(config).zone). */
  api.configure = function (o) {
    o = o || {};
    if ('zone' in o) {
      var z = String(o.zone || '').trim();
      var ok = '';
      if (z) { try { new (globalThis.KiwiZoneLaw?.DateTimeFormat || Intl.DateTimeFormat)('en-GB', { timeZone: z }).format(0); ok = z; } catch (_) {} }
      state.zone = ok;
    }
    if ('lang' in o) state.lang = normLang(o.lang);
    return { lang: currentLang(), zone: defaultZone() };
  };
  /* Pour les tests : l'assertion seule, et la remise à zéro des rapports. */
  api.guard = guard;
  api.resetReports = function () { reported = {}; };
  api.strict = false;
  api.NBSP = NBSP;
  api.MINUS = MINUS;
  api.LANGS = Object.keys(LOCALES);

  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) root.KiwiFormat = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
