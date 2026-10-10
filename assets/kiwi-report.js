/* Rapport mensuel Kiwi — rend GET /api/admin/report en une page A4.
 * kiwi-report.html?merchant=<slug>[&month=YYYY-MM]. Aucun mois ⇒ le dernier
 * mois clos (choisi par le serveur, sur l'horloge du magasin). */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var nf2 = new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  var mad = function (c) { return nf.format(Math.round((Number(c) || 0) / 100)) + ' MAD'; };
  var madExact = function (c) { return nf2.format((Number(c) || 0) / 100) + ' MAD'; };
  var monthName = function (m) {
    var s = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(m + '-15T12:00:00Z'));
    return s.charAt(0).toUpperCase() + s.slice(1);
  };
  var dayLong = function (d) { return new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(d + 'T12:00:00Z')); };
  var METHOD = { cash: 'Espèces', card: 'Carte', transfer: 'Virement', cheque: 'Chèque', split: 'Paiement fractionné', tap: 'Sans contact',
    qr: 'QR', wallet: 'Portefeuille', complimentary: 'Offert', credit: 'Avoir' };
  var WEEK = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];
  var TYPE = { restaurant: 'Restaurant', cafe: 'Café', boutique: 'Boutique', hotel: 'Hôtel', pressing: 'Pressing', bakery: 'Boulangerie' };

  var params = new URLSearchParams(location.search);
  var merchant = params.get('merchant') || '';

  var tip;
  function showTip(text, x, y) {
    tip = tip || $('kr-tip'); tip.textContent = text; tip.hidden = false;
    tip.style.left = Math.min(window.innerWidth - tip.offsetWidth - 8, x + 12) + 'px';
    tip.style.top = Math.max(8, y - tip.offsetHeight - 10) + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function fail(title, text) {
    $('kr-page').innerHTML = '<div class="kr-error"><h1>' + esc(title) + '</h1><p>' + esc(text) + '</p></div>';
    $('kr-page').setAttribute('aria-busy', 'false');
  }

  async function load() {
    if (!/^[a-z0-9][a-z0-9_-]{0,63}$/.test(merchant)) return fail('Établissement manquant', 'Ouvrez ce rapport depuis le dossier du client dans la console opérateur.');
    var month = $('kr-month').value;
    var q = '/api/admin/report?merchant=' + encodeURIComponent(merchant) + (month ? '&month=' + encodeURIComponent(month) : '');
    $('kr-page').setAttribute('aria-busy', 'true');
    var r;
    try { r = await fetch(q, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' }); }
    catch (_) { return fail('Rapport indisponible', 'Le serveur n’a pas répondu. Réessayez dans un instant.'); }
    if (r.status === 401 || r.status === 403) return fail('Accès réservé aux opérateurs', 'Connectez-vous à la console opérateur, puis rouvrez ce rapport.');
    var data = null; try { data = await r.json(); } catch (_) {}
    if (!r.ok || !data) {
      var why = data && data.error === 'future-month' ? 'Ce mois n’a pas encore commencé.' : data && data.error === 'not-found' ? 'Cet établissement est inconnu.' : 'Le rapport n’a pas pu être calculé.';
      return fail('Rapport indisponible', why);
    }
    if (!$('kr-month').value) $('kr-month').value = data.month;
    history.replaceState(null, '', '?merchant=' + encodeURIComponent(merchant) + '&month=' + data.month);
    render(data);
  }

  function dayChart(days, bestDay) {
    var W = 680, H = 180, pad = { l: 40, r: 4, t: 8, b: 22 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var max = Math.max.apply(null, days.map(function (d) { return d.cents; }).concat([1]));
    var p = Math.pow(10, Math.floor(Math.log10(max))), n = max / p;
    max = (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
    var slot = iw / days.length, bw = Math.max(2, slot - 2);
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Chiffre d’affaires par jour">';
    for (var k = 0; k <= 3; k++) {
      var v = max * k / 3, y = pad.t + ih - ih * k / 3;
      svg += '<line class="grid" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/>';
      svg += '<text class="ax" x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end">' + (v >= 1e5 ? Math.round(v / 1e5) + ' k' : nf.format(Math.round(v / 100))) + '</text>';
    }
    days.forEach(function (d, i) {
      var h = Math.max(0, d.cents) / max * ih, x = pad.l + i * slot + 1, y = pad.t + ih - h;
      if (d.cents > 0) svg += '<path class="bar' + (bestDay && d.d === bestDay ? ' best' : '') + '" data-d="' + d.d + '" data-c="' + d.cents + '" data-n="' + d.count + '" d="M' + x + ',' + (pad.t + ih) +
        ' V' + (y + Math.min(4, h)) + ' Q' + x + ',' + y + ' ' + (x + Math.min(4, bw / 2)) + ',' + y + ' H' + (x + bw - Math.min(4, bw / 2)) +
        ' Q' + (x + bw) + ',' + y + ' ' + (x + bw) + ',' + (y + Math.min(4, h)) + ' V' + (pad.t + ih) + ' Z"/>';
      var dayNum = Number(d.d.slice(8));
      if (dayNum === 1 || dayNum % 5 === 0) svg += '<text class="ax" x="' + (x + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + dayNum + '</text>';
    });
    return svg + '</svg>';
  }

  function render(d) {
    var t = d.totals, prev = d.previous;
    var change = prev.changePct == null ? '' : '<p class="s n ' + (prev.changePct >= 0 ? 'up' : 'down') + '">' +
      (prev.changePct >= 0 ? '+' : '') + String(prev.changePct).replace('.', ',') + ' % vs ' + esc(monthName(prev.month).toLowerCase()) + '</p>';
    var methodsTotal = d.methods.reduce(function (a, m) { return a + Math.max(0, m.cents); }, 0) || 1;
    var hourMax = Math.max.apply(null, d.hours.map(function (h) { return h.cents; }).concat([1]));
    var week = [1, 2, 3, 4, 5, 6, 0].map(function (w) { return d.weekdays[w]; });
    var top = d.products.top;
    var html = '';
    html += '<header class="kr-head"><div><img src="assets/kiwi-newlogo.svg" alt="Kiwi" />' +
      '<h1>' + esc(monthName(d.month)) + '</h1><p>Votre mois avec Kiwi' + (d.complete ? '' : ' · mois en cours, chiffres provisoires') + '</p></div>' +
      '<div class="kr-meta"><b>' + esc(d.store.name) + '</b>' + esc([TYPE[d.store.type] || d.store.type, d.store.city].filter(Boolean).join(' · ')) +
      '<br>Journée commerciale : coupure ' + d.cutoff + ' h · ' + esc(d.zone) + '</div></header>';

    html += '<div class="kr-hero">' +
      '<div class="kr-k main"><p>Chiffre d’affaires</p><p class="v n">' + esc(mad(t.cents)) + '</p>' + change + '</div>' +
      '<div class="kr-k"><p>Ventes</p><p class="v n">' + nf.format(t.count) + '</p></div>' +
      '<div class="kr-k"><p>Panier moyen</p><p class="v n">' + esc(mad(t.basketCents)) + '</p></div>' +
      '<div class="kr-k"><p>Jours ouverts</p><p class="v n">' + t.openDays + '</p><p class="s n">' + esc(mad(t.avgOpenDayCents)) + ' / jour</p></div></div>';

    html += '<section class="kr-sec"><h2>Jour par jour</h2>' +
      (t.best ? '<p class="sub">Meilleure journée : ' + esc(dayLong(t.best.d)) + ', ' + esc(mad(t.best.cents)) + '.</p>' : '') +
      '<div class="kr-chart" id="kr-days">' + dayChart(d.days, t.best && t.best.d) + '</div></section>';

    html += '<div class="kr-two"><section class="kr-sec"><h2>Moyens de paiement</h2>' +
      (d.methods.length ? '<table class="kr-table"><thead><tr><th>Moyen</th><th class="n">Ventes</th><th class="n">Montant</th></tr></thead><tbody>' +
        d.methods.map(function (m) {
          var share = Math.max(0, m.cents) / methodsTotal * 100;
          return '<tr><td><span class="kr-share" style="width:' + (share * 0.6).toFixed(1) + 'px"></span>' + esc(METHOD[m.method] || m.method) +
            '</td><td class="n">' + nf.format(m.count) + '</td><td class="n">' + esc(mad(m.cents)) + ' <small>(' + Math.round(share) + ' %)</small></td></tr>';
        }).join('') + '</tbody></table>' : '<p class="kr-note">Aucune vente ce mois-ci.</p>') + '</section>';

    html += '<section class="kr-sec"><h2>Jours de la semaine</h2><table class="kr-table"><tbody>' +
      week.map(function (w) { return '<tr><td>' + WEEK[w.w] + '</td><td class="n">' + nf.format(w.count) + ' ventes</td><td class="n">' + esc(mad(w.cents)) + '</td></tr>'; }).join('') +
      '</tbody></table></section></div>';

    html += '<section class="kr-sec"><h2>Heures d’affluence</h2><p class="sub">Chiffre d’affaires par heure de la journée, heure locale du magasin.</p>' +
      '<div class="kr-hours" id="kr-hours">' + d.hours.map(function (h) {
        return '<span class="' + (h.cents > 0 ? '' : 'zero') + '" data-h="' + h.h + '" data-c="' + h.cents + '" data-n="' + h.count + '" style="height:' + Math.max(2, h.cents / hourMax * 100).toFixed(1) + '%"></span>';
      }).join('') + '</div><div class="kr-hours-ax">' + d.hours.map(function (h) { return '<i>' + (h.h % 3 === 0 ? h.h + 'h' : '') + '</i>'; }).join('') + '</div></section>';

    html += '<section class="kr-sec"><h2>Produits les plus vendus</h2>';
    if (top.length) {
      html += '<table class="kr-table"><thead><tr><th>#</th><th>Produit</th><th class="n">Quantité</th><th class="n">Montant</th></tr></thead><tbody>' +
        top.map(function (p, i) { return '<tr><td class="n">' + (i + 1) + '</td><td>' + esc(p.name) + '</td><td class="n">' + nf.format(p.qty) + '</td><td class="n">' + esc(mad(p.cents)) + '</td></tr>'; }).join('') +
        '</tbody></table>';
      if (d.products.detailedTickets < d.products.tickets)
        html += '<p class="kr-note">Classement établi sur ' + nf.format(d.products.detailedTickets) + ' tickets détaillés sur ' + nf.format(d.products.tickets) + ' : les autres n’ont pas de détail d’articles.</p>';
    } else {
      html += '<p class="kr-note">Aucun ticket détaillé ce mois-ci : le classement des produits n’est pas disponible.</p>';
    }
    html += '</section>';

    var notes = [];
    if (t.refunds) notes.push(nf.format(t.refunds) + ' remboursement(s) pour ' + madExact(-t.refundsCents) + ', déjà déduits du chiffre d’affaires.');
    if (d.voided.count) notes.push(nf.format(d.voided.count) + ' vente(s) annulée(s) pour ' + madExact(d.voided.cents) + ', exclues du chiffre d’affaires.');
    if (d.truncated) notes.push('Plus de ' + nf.format(d.rowCap) + ' ventes : le détail par jour, heure et produit porte sur les ' + nf.format(d.rowCap) + ' premières.');
    if (notes.length) html += '<section class="kr-sec"><h2>À savoir</h2>' + notes.map(function (n) { return '<p class="kr-note">' + esc(n) + '</p>'; }).join('') + '</section>';

    html += '<footer class="kr-foot"><span>Ventes enregistrées par Kiwi, annulations exclues. Montants TTC en dirhams.</span><span>Édité le ' +
      esc(new Intl.DateTimeFormat('fr-FR', { dateStyle: 'long' }).format(d.generated_ts)) + ' · kiwi-os.com</span></footer>';

    $('kr-page').innerHTML = html;
    $('kr-page').setAttribute('aria-busy', 'false');
    document.title = 'Kiwi · ' + d.store.name + ' · ' + monthName(d.month);
    $('kr-bar-note').textContent = d.complete ? '' : 'Mois en cours : chiffres provisoires.';

    $('kr-days').querySelectorAll('.bar').forEach(function (b) {
      b.addEventListener('pointermove', function (ev) { showTip(dayLong(b.dataset.d) + ' · ' + mad(b.dataset.c) + ' · ' + b.dataset.n + ' ventes', ev.clientX, ev.clientY); });
      b.addEventListener('pointerleave', hideTip);
    });
    $('kr-hours').querySelectorAll('span').forEach(function (s) {
      s.addEventListener('pointermove', function (ev) { showTip(s.dataset.h + ' h – ' + (Number(s.dataset.h) + 1) + ' h · ' + mad(s.dataset.c) + ' · ' + s.dataset.n + ' ventes', ev.clientX, ev.clientY); });
      s.addEventListener('pointerleave', hideTip);
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    var m = params.get('month');
    if (m && /^\d{4}-\d{2}$/.test(m)) $('kr-month').value = m;
    $('kr-month').addEventListener('change', load);
    $('kr-print').addEventListener('click', function () { window.print(); });
    load();
  });
})();
