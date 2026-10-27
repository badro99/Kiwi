/* Rapport journalier · deux clôtures qui se contredisent.
 *
 * Quand deux appareils envoient une clôture différente pour le même tiroir
 * (assets/day-report.js, mergeDaySnapshots), le rapport en garde une et note
 * l'autre dans snapshotConflicts. Rien ne le disait au patron : il lisait le
 * comptage retenu sans savoir qu'un autre existait. Ce bloc nomme les deux
 * versions (qui, quand, attendu, compté, écart) et marque celle que le rapport
 * affiche. Il ne tranche rien : le patron vérifie avec la personne concernée.
 *
 * html(report, ui) rend le bloc, ou une chaîne vide s'il n'y a rien à dire.
 * ui = { LANG, esc, hm, money, CUR, row } fournis par day-report-dash.js. */
(function () {
  'use strict';
  var TXT = {
    title: { fr: 'Deux clôtures différentes pour ce tiroir', en: 'Two different closings for this drawer', ar: 'إقفالان مختلفان لهذا الدرج' },
    note: {
      fr: 'Deux appareils ont envoyé un comptage différent pour la même clôture. Le rapport affiche la version retenue. Vérifiez le comptage avec la personne concernée.',
      en: 'Two devices sent a different count for the same closing. The report shows the kept version. Check the count with the person concerned.',
      ar: 'أرسل جهازان جرداً مختلفاً للإقفال نفسه. يعرض التقرير النسخة المعتمدة. تحقق من الجرد مع الشخص المعني.'
    },
    kept: { fr: 'Retenue', en: 'Kept', ar: 'المعتمدة' },
    other: { fr: 'Écartée', en: 'Set aside', ar: 'المستبعدة' },
    unknown: { fr: 'inconnu', en: 'unknown', ar: 'غير معروف' },
    by: { fr: 'par', en: 'by', ar: 'بواسطة' },
    expected: { fr: 'Attendu', en: 'Expected', ar: 'المتوقع' },
    counted: { fr: 'Compté', en: 'Counted', ar: 'المعدود' },
    ecart: { fr: 'Écart', en: 'Difference', ar: 'الفرق' }
  };
  function num(v) { return v == null || v === '' ? null : +v; }

  /* Ce que le rapport affiche pour la clôture : le tiroir qui porte la même
     heure de fermeture et le même comptage que le côté examiné. */
  function isKept(r, side) {
    var rows = (r.drawerSessions || []).slice();
    if (r.cash) rows.push({ closedAt: r.closedAt, cash: r.cash });
    return rows.some(function (d) {
      var c = d && d.cash || {};
      return +d.closedAt === +side.closedAt && num(c.counted) === num(side.counted) && num(c.expected) === num(side.expected);
    });
  }

  /* Le modèle sans HTML : une ligne par contradiction, chaque côté dit s'il est
     retenu. Si les deux (ou aucun) ressemblent à l'affichage, la clôture la plus
     récente fait foi, comme preferDrawer() dans day-report.js. */
  function view(r) {
    return ((r && r.snapshotConflicts) || []).map(function (c) {
      var a = { side: c.left, kept: isKept(r, c.left) }, b = { side: c.right, kept: isKept(r, c.right) };
      if (a.kept === b.kept) { var newer = +c.right.closedAt >= +c.left.closedAt; a.kept = !newer; b.kept = newer; }
      return { key: c.key, sides: [a, b] };
    });
  }

  function html(r, ui) {
    var items = view(r);
    if (!items.length) return '';
    var L = ui.LANG(), T = function (o) { return o[L] != null ? o[L] : o.fr; };
    var amount = function (n) { return n == null ? T(TXT.unknown) : ui.money(n) + ' ' + ui.CUR(); };
    var body = items.map(function (it) {
      return it.sides.map(function (x) {
        var s = x.side;
        var who = s.closedBy ? ' ' + T(TXT.by) + ' ' + s.closedBy : '';
        var ecart = s.ecart == null ? T(TXT.unknown) : (s.ecart > 0 ? '+ ' : s.ecart < 0 ? '− ' : '') + ui.money(Math.abs(s.ecart)) + ' ' + ui.CUR();
        return '<div class="kdr-conflict' + (x.kept ? ' is-kept' : '') + '">'
          + ui.row((x.kept ? T(TXT.kept) : T(TXT.other)) + ' · ' + (s.closedAt ? ui.hm(s.closedAt) : T(TXT.unknown)) + who, '', x.kept ? 'total' : 'sub')
          + ui.row(T(TXT.expected), amount(s.expected)) + ui.row(T(TXT.counted), amount(s.counted)) + ui.row(T(TXT.ecart), ecart)
          + '</div>';
      }).join('');
    }).join('');
    return '<div class="kdr-sec" data-kdr-conflicts><div class="kdr-h"><span>' + ui.esc(T(TXT.title)) + '</span><em>' + items.length + '</em></div>'
      + '<div class="kdr-note">' + ui.esc(T(TXT.note)) + '</div>' + body + '</div>';
  }

  window.KiwiDayReportConflicts = { view: view, html: html };
})();
