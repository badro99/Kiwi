/* Santé de Kiwi — fenêtre de pilotage de la console opérateur (God mode).
 *
 * Lit deux routes déjà réservées à l'opérateur, et rien d'autre :
 *   GET /api/admin/overview   → clients, MRR, volume 30 j, villes
 *   GET /api/admin/workspace  → parc (caisses, relais, impressions, erreurs,
 *                               Z, conflits), activité 7 j, tableau produit
 * N'écrit rien, n'envoie rien. Trois règles, celles de overview.js :
 *   1. Une source qui n'a pas répondu s'affiche « indisponible », jamais 0.
 *   2. Une source tronquée (plafond serveur) s'affiche « au moins N ».
 *   3. Chaque bloc dit de quelle route et de quelles tables il vient.
 */
(function () {
  'use strict';
  var REFRESH_MS = 60000, STALE_MS = 150000, HOUR = 3600000, DAY = 86400000;
  var state = { overview: null, workspace: null, at: 0, busy: false, ovErr: null, wsErr: null };
  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };
  var nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
  var mad = function (n) { return nf.format(Math.round(Number(n) || 0)) + ' MAD'; };
  var int = function (n) { return nf.format(Number(n) || 0); };
  var dayFmt = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
  var timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
  var dayLabel = function (d) { return dayFmt.format(new Date(d + 'T12:00:00Z')); };
  function ago(ts) {
    if (!ts) return 'jamais';
    var m = Math.round((Date.now() - ts) / 60000);
    if (m < 1) return 'à l’instant';
    if (m < 60) return 'il y a ' + m + ' min';
    var h = Math.round(m / 60);
    if (h < 48) return 'il y a ' + h + ' h';
    return 'il y a ' + Math.round(h / 24) + ' j';
  }

  async function get(path) {
    var r = await fetch('/api/admin/' + path, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' });
    if (!r.ok) { var e = new Error('http-' + r.status); e.status = r.status; throw e; }
    return r.json();
  }

  async function load() {
    if (state.busy) return;
    state.busy = true;
    $('kh-main').setAttribute('aria-busy', 'true');
    var res = await Promise.allSettled([get('overview'), get('workspace')]);
    state.busy = false;
    $('kh-main').setAttribute('aria-busy', 'false');
    var forbidden = res.every(function (r) { return r.status === 'rejected' && r.reason && (r.reason.status === 401 || r.reason.status === 403); });
    if (forbidden) return renderGate();
    state.ovErr = res[0].status === 'rejected' ? res[0].reason : null;
    state.wsErr = res[1].status === 'rejected' ? res[1].reason : null;
    if (!state.ovErr) state.overview = res[0].value;
    if (!state.wsErr) state.workspace = res[1].value;
    if (!state.ovErr || !state.wsErr) state.at = Date.now();
    render();
  }

  function renderGate() {
    document.body.querySelector('main').innerHTML =
      '<div class="kh-gate"><h2>Accès réservé aux opérateurs</h2>' +
      '<p>Cette fenêtre lit les chiffres de tout le parc Kiwi. Ouvrez-la depuis la console opérateur, une fois connecté.</p>' +
      '<a href="kiwi-admin.html">Ouvrir la console opérateur</a></div>';
    $('kh-fresh').textContent = 'Non connecté';
  }

  function unavailable(el, what) {
    el.innerHTML = '<p class="kh-empty">Source indisponible (' + esc(what) + ' n’a pas répondu). Rien n’est affiché plutôt qu’un zéro trompeur.</p>';
  }

  /* ── L'entreprise ──────────────────────────────────────────────────────── */
  function tile(label, value, sub, src) {
    return '<div class="kh-tile"><p class="kh-l">' + esc(label) + '</p><p class="kh-v">' + value + '</p>' +
      (sub ? '<p class="kh-sub">' + sub + '</p>' : '') + '<p class="kh-tsrc">' + src + '</p></div>';
  }
  function renderBusiness() {
    var el = $('kh-business'), o = state.overview;
    if (!o) return unavailable(el, '/api/admin/overview');
    var c = o.clients || {}, g = o.gmv || {}, m = o.mrr || {};
    var mrrSub = [];
    if (m.untariffed) mrrSub.push(m.untariffed + ' non tarifé' + (m.untariffed > 1 ? 's' : ''));
    if (m.excluded) mrrSub.push(m.excluded + ' hors MRR (essai, futur, expiré)');
    if (m.suspended) mrrSub.push(m.suspended + ' suspendu' + (m.suspended > 1 ? 's' : ''));
    var mrrValue = o.columns && o.columns.lifecycle === false
      ? '<span class="kh-na">Colonnes de contrat absentes</span>'
      : nf.format(m.total || 0) + '<small>MAD / mois</small>';
    el.innerHTML =
      tile('MRR payé', mrrValue, esc(mrrSub.join(' · ') || 'Tous les contrats actifs sont tarifés'), '<code>merchant_config</code> · contrats actifs') +
      tile('Clients', int(c.accounts) + '<small>' + int(c.stores) + ' établ.</small>',
        esc('+' + int(c.new30) + ' en 30 j' + (c.suspended ? ' · ' + c.suspended + ' suspendu' + (c.suspended > 1 ? 's' : '') : '') + ' · ' + int(c.demo) + ' démos à part'),
        '<code>accounts</code> × <code>merchant_config</code>') +
      tile('Actifs aujourd’hui', int(g.activeToday) + '<small>/ ' + int(c.stores) + '</small>',
        esc(int(g.silent7) + ' sans vente depuis 7 j'), '<code>sales</code> · depuis 5 h') +
      tile('Volume 30 jours', nf.format(g.d30 || 0) + '<small>MAD</small>',
        esc(int(g.count30) + ' ventes · panier moyen ' + mad(g.basket30)), '<code>sales</code> · hors annulations');
  }

  /* ── Courbe du volume ──────────────────────────────────────────────────── */
  var tip = null;
  function showTip(html, x, y) {
    tip = tip || $('kh-tip');
    tip.innerHTML = html; tip.hidden = false;
    var w = tip.offsetWidth, h = tip.offsetHeight;
    var left = Math.min(window.innerWidth - w - 8, Math.max(8, x + 14));
    var top = Math.max(8, y - h - 12);
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  function hideTip() { if (tip) tip.hidden = true; }

  function niceMax(v) {
    if (v <= 0) return 100;
    var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }
  function short(n) {
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1).replace('.', ',') + ' M';
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1).replace('.', ',') + ' k';
    return String(Math.round(n));
  }
  function renderGmv() {
    var el = $('kh-gmv'), tableEl = $('kh-gmv-table'), o = state.overview;
    if (!o || !Array.isArray(o.series)) { unavailable(el, '/api/admin/overview'); tableEl.innerHTML = ''; return; }
    var s = o.series, W = Math.max(320, el.clientWidth || 800), H = 240;
    var pad = { l: 48, r: 12, t: 12, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var max = niceMax(Math.max.apply(null, s.map(function (p) { return p.amount || 0; })));
    var x = function (i) { return pad.l + (s.length < 2 ? iw / 2 : i * iw / (s.length - 1)); };
    var y = function (v) { return pad.t + ih - (v / max) * ih; };
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Volume encaissé par jour sur 30 jours">';
    for (var k = 0; k <= 4; k++) {
      var v = max * k / 4, yy = y(v);
      svg += '<line class="' + (k ? 'grid' : 'base') + '" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + yy + '" y2="' + yy + '"/>';
      svg += '<text class="ax" x="' + (pad.l - 8) + '" y="' + (yy + 4) + '" text-anchor="end">' + short(v) + '</text>';
    }
    var every = W < 560 ? 10 : 5;
    s.forEach(function (p, i) {
      if (i % every === 0 || i === s.length - 1)
        svg += '<text class="ax" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + esc(dayLabel(p.d)) + '</text>';
    });
    var pts = s.map(function (p, i) { return x(i) + ',' + y(p.amount || 0); });
    svg += '<path class="area" d="M' + x(0) + ',' + y(0) + ' L' + pts.join(' L') + ' L' + x(s.length - 1) + ',' + y(0) + ' Z"/>';
    svg += '<polyline class="line" points="' + pts.join(' ') + '"/>';
    svg += '<line class="xhair" id="kh-xh" y1="' + pad.t + '" y2="' + (pad.t + ih) + '" x1="-10" x2="-10" visibility="hidden"/>';
    svg += '<circle class="dot" id="kh-dot" r="5" cx="-10" cy="-10" visibility="hidden"/>';
    svg += '<rect id="kh-hit" x="' + pad.l + '" y="' + pad.t + '" width="' + iw + '" height="' + ih + '" fill="transparent"/>';
    svg += '</svg>';
    el.innerHTML = svg;
    var svgEl = el.querySelector('svg'), hit = el.querySelector('#kh-hit'), xh = el.querySelector('#kh-xh'), dot = el.querySelector('#kh-dot');
    function move(ev) {
      var rect = svgEl.getBoundingClientRect(), px = (ev.clientX - rect.left) * (W / rect.width);
      var i = Math.max(0, Math.min(s.length - 1, Math.round((px - pad.l) / (iw / Math.max(1, s.length - 1)))));
      var p = s[i];
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      dot.setAttribute('cx', x(i)); dot.setAttribute('cy', y(p.amount || 0)); dot.setAttribute('visibility', 'visible');
      showTip('<b>' + esc(dayLabel(p.d)) + '</b><br>' + esc(mad(p.amount)), ev.clientX, ev.clientY);
    }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', function () { hideTip(); xh.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); });
    tableEl.innerHTML = '<div class="kh-scroll"><table class="kh-table"><thead><tr><th>Journée</th><th class="n">Volume</th></tr></thead><tbody>' +
      s.slice().reverse().map(function (p) { return '<tr><td>' + esc(p.d) + '</td><td class="n">' + esc(mad(p.amount)) + '</td></tr>'; }).join('') +
      '</tbody></table></div>';
  }

  /* ── MRR par palier, villes ────────────────────────────────────────────── */
  var TIER = { basic: 'Basic', pro: 'Pro', ultra: 'Ultra', ultimate: 'Ultimate', '·': 'Sans palier' };
  function bars(rows) {
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    return '<ul class="kh-bars">' + rows.map(function (r) {
      return '<li class="kh-bar" data-tip="' + esc(r.tip) + '"><span class="lbl">' + esc(r.label) + '<small>' + esc(r.sub) + '</small></span>' +
        '<span class="track"><span class="fill" style="width:' + (r.value / max * 100).toFixed(1) + '%"></span></span>' +
        '<span class="amt">' + esc(r.amt) + '</span></li>';
    }).join('') + '</ul>';
  }
  function bindBarTips(root) {
    root.querySelectorAll('[data-tip]').forEach(function (li) {
      li.addEventListener('pointermove', function (ev) { showTip(esc(li.getAttribute('data-tip')), ev.clientX, ev.clientY); });
      li.addEventListener('pointerleave', hideTip);
    });
  }
  function renderMrr() {
    var el = $('kh-mrr'), o = state.overview;
    if (!o || !o.mrr) return unavailable(el, '/api/admin/overview');
    var tiers = (o.mrr.tiers || []).filter(function (t) { return t.stores; });
    if (!tiers.length) { el.innerHTML = '<p class="kh-empty">Aucun établissement réel pour l’instant.</p>'; return; }
    el.innerHTML = bars(tiers.map(function (t) {
      var paying = t.stores - (t.suspended || 0);
      return { label: TIER[t.plan] || t.plan, sub: t.stores + ' établ.' + (t.unit ? ' · ' + t.unit + ' MAD' : ''),
        value: t.amount || 0, amt: mad(t.amount),
        tip: (TIER[t.plan] || t.plan) + ' · ' + mad(t.amount) + ' / mois · ' + paying + ' actif(s), ' + (t.untariffed || 0) + ' non tarifé(s), ' + (t.suspended || 0) + ' suspendu(s)' };
    })) + (o.mrr.untariffed ? '<p class="kh-note">' + o.mrr.untariffed + ' établissement(s) sans tarif ni montant convenu : comptés nulle part. Saisissez le montant dans la console.</p>' : '');
    bindBarTips(el);
  }
  function renderCities() {
    var el = $('kh-cities'), o = state.overview;
    if (!o || !Array.isArray(o.cities)) return unavailable(el, '/api/admin/overview');
    var list = o.cities.slice(0, 6);
    if (!list.length && !o.untagged) { el.innerHTML = '<p class="kh-empty">Aucune ville saisie.</p>'; return; }
    el.innerHTML = bars(list.map(function (c) {
      return { label: c.city, sub: c.clients + ' client' + (c.clients > 1 ? 's' : ''), value: c.stores,
        amt: c.stores + ' établ.', tip: c.city + ' · ' + c.stores + ' établissement(s) · ' + mad(c.gmv30) + ' sur 30 j' };
    })) + (o.cities.length > 6 ? '<p class="kh-src">+ ' + (o.cities.length - 6) + ' autre(s) ville(s).</p>' : '') +
      (o.untagged ? '<p class="kh-note">' + o.untagged + ' établissement(s) sans ville : non situés, pas rangés dans « autre ».</p>' : '');
    bindBarTips(el);
  }

  /* ── Le parc ───────────────────────────────────────────────────────────── */
  function src(name) {
    var w = state.workspace;
    var s = w && w.sources && w.sources[name];
    return s && s.available ? s : null;
  }
  function count(s) { return (s.truncated ? 'au moins ' : '') + int(s.rows.length); }
  var ICON = { ok: '✓', watch: '!', bad: '×', na: '–' };
  var WORD = { ok: 'Normal', watch: 'À surveiller', bad: 'À traiter', na: 'Indisponible' };
  function st(title, level, value, detail) {
    return '<div class="kh-st ' + level + '"><span class="ic ' + level + '" aria-hidden="true">' + ICON[level] + '</span><div>' +
      '<p class="t">' + esc(title) + '</p><p class="v">' + value + '</p>' +
      '<p class="d"><span class="state ' + level + '">' + WORD[level] + '</span>' + (detail ? ' · ' + esc(detail) : '') + '</p></div></div>';
  }
  function na(title, name) { return st(title, 'na', '–', 'source ' + name + ' absente'); }
  function semverBelow(v, min) {
    var m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || ''));
    if (!m) return null;
    for (var i = 0; i < 3; i++) { var a = Number(m[i + 1]), b = min[i]; if (a !== b) return a < b; }
    return false;
  }
  function renderFleet() {
    var el = $('kh-fleet'), now = (state.workspace && state.workspace.now) || Date.now();
    if (!state.workspace) return unavailable(el, '/api/admin/workspace');
    var out = [], s;

    if ((s = src('caisseSync'))) {
      var rows = s.rows, online = 0, quiet = 0, off = 0, blocked = 0, blockedCents = 0, late = 0;
      rows.forEach(function (r) {
        var age = now - (r.updated_ts || 0);
        if (age <= HOUR) online++; else if (age <= DAY) quiet++; else off++;
        if (r.sync) {
          blocked += r.sync.blocked || 0;
          (r.sync.blockedEntries || []).forEach(function (b) { blockedCents += b.amountCents || 0; });
          if (r.sync.pending > 0 && r.sync.oldestPendingAt && now - r.sync.oldestPendingAt > 30 * 60000) late++;
        }
      });
      out.push(st('Caisses en ligne (1 h)', off ? 'watch' : 'ok', int(online) + ' / ' + count(s),
        quiet + ' silencieuse(s) 1–24 h · ' + off + ' hors ligne > 24 h'));
      out.push(st('Ventes bloquées sur une caisse', blocked ? 'bad' : 'ok', int(blocked),
        blocked ? mad(blockedCents / 100) + ' refusé(s) par le serveur' : 'aucune vente refusée en attente'));
      out.push(st('Ventes non confirmées > 30 min', late ? 'bad' : 'ok', int(late), late ? 'caisse(s) avec une file en retard' : 'files à jour'));
    } else { out.push(na('Caisses en ligne', 'heartbeats')); }

    if ((s = src('bridges'))) {
      var old = 0, unknown = 0, offB = 0;
      s.rows.forEach(function (b) {
        var below = semverBelow(b.version, [1, 4, 0]);
        if (below === null) unknown++; else if (below) old++;
        if (now - (b.last_seen_ts || 0) > DAY) offB++;
      });
      out.push(st('Relais d’impression', old || offB ? 'watch' : 'ok', count(s),
        old + ' sous 1.4.0 · ' + offB + ' muet(s) > 24 h' + (unknown ? ' · ' + unknown + ' version inconnue' : '')));
    } else { out.push(na('Relais d’impression', 'print_bridges')); }

    if ((s = src('print'))) {
      var failed = s.rows.filter(function (j) { return j.status === 'failed' || j.status === 'expired'; }).length;
      var rate = s.rows.length ? Math.round(failed / s.rows.length * 100) : 0;
      out.push(st('Impressions cloud 24 h', failed ? (rate >= 10 ? 'bad' : 'watch') : 'ok', count(s),
        failed + ' échouée(s) ou expirée(s)' + (s.rows.length ? ' · ' + rate + ' %' : '')));
    } else { out.push(na('Impressions cloud 24 h', 'print_jobs')); }

    if ((s = src('errors'))) {
      var hits = s.rows.reduce(function (a, r) { return a + (Number(r.count) || 0); }, 0);
      var who = new Set(s.rows.map(function (r) { return r.merchant; })).size;
      out.push(st('Erreurs applicatives 7 j', s.rows.length ? 'watch' : 'ok', count(s),
        int(hits) + ' occurrence(s) · ' + who + ' établissement(s)'));
    } else { out.push(na('Erreurs applicatives 7 j', 'client_errors')); }

    if ((s = src('zChecks'))) {
      var bad = s.rows.filter(function (z) { return z.status && z.status !== 'matched'; }).length;
      out.push(st('Z en désaccord 14 j', bad ? 'bad' : 'ok', int(bad), s.rows.length + ' Z comparés au serveur'));
    } else { out.push(na('Z en désaccord 14 j', 'z_reconciliations')); }

    var c = src('conflicts'), t = src('tenantGuard');
    if (c || t) {
      var n = (c ? c.rows.length : 0) + (t ? t.rows.length : 0);
      out.push(st('Conflits de données 14 j', n ? 'bad' : 'ok', int(n),
        (c ? c.rows.length : '–') + ' vente(s) en conflit · ' + (t ? t.rows.length : '–') + ' copie(s) d’un autre établissement refusée(s)'));
    } else { out.push(na('Conflits de données', 'sale_sync_conflicts')); }

    if ((s = src('support'))) {
      var urgent = s.rows.filter(function (r) { return String(r.priority) === 'urgent' || Number(r.priority) === 1; }).length;
      out.push(st('Support ouvert', urgent ? 'bad' : s.rows.length ? 'watch' : 'ok', count(s), urgent + ' urgent(s)'));
    } else { out.push(na('Support ouvert', 'support_tickets')); }

    var integ = src('integrations'), shop = src('shopify');
    if (integ || shop) {
      var failing = (integ ? integ.rows.filter(function (r) { return /fail|error|dead/.test(String(r.status)); }).length : 0) +
        (shop ? shop.rows.filter(function (r) { return /fail|error|dead/.test(String(r.status)); }).length : 0);
      var waiting = (integ ? integ.rows.filter(function (r) { return !(r.domain === 'device' && r.action === 'heartbeat'); }).length : 0) + (shop ? shop.rows.length : 0);
      out.push(st('Intégrations en attente', failing ? 'bad' : waiting ? 'watch' : 'ok', int(waiting), failing + ' en échec · Shopify ' + (shop ? shop.rows.length : '–')));
    } else { out.push(na('Intégrations', 'operational_commands')); }

    el.innerHTML = out.join('');
  }

  /* ── Silencieux et tableau produit ─────────────────────────────────────── */
  function renderSilent() {
    var el = $('kh-silent'), o = state.overview, act = src('activity');
    if (!o || !o.mrr) return unavailable(el, '/api/admin/overview');
    if (!act) return unavailable(el, 'activité 7 j de /api/admin/workspace');
    var now = Date.now(), byM = {};
    act.rows.forEach(function (r) { byM[r.merchant] = r; });
    var live = ['active', 'unpriced', 'trial'];
    var rows = (o.mrr.contributions || []).filter(function (c) { return live.indexOf(c.status) >= 0; }).map(function (c) {
      var a = byM[c.merchant];
      return { name: c.name, merchant: c.merchant, plan: c.plan, status: c.status, last: a ? a.last_ts : 0, days: a ? a.active_days_7d : 0 };
    }).filter(function (r) { return !r.last || now - r.last > 2 * DAY; })
      .sort(function (a, b) { return (b.days - a.days) || (b.last - a.last); });
    if (!rows.length) { el.innerHTML = '<p class="kh-empty">Tous les clients actifs ont vendu dans les dernières 48 h.</p>'; return; }
    el.innerHTML = '<div class="kh-scroll"><table class="kh-table"><thead><tr><th>Établissement</th><th>Palier</th><th>Dernière vente</th><th class="n">Jours actifs / 7</th></tr></thead><tbody>' +
      rows.slice(0, 12).map(function (r) {
        return '<tr><td>' + esc(r.name) + (r.status === 'trial' ? ' <span class="kh-pill">essai</span>' : '') + '</td><td>' + esc(TIER[r.plan] || r.plan || '–') +
          '</td><td>' + esc(r.last ? ago(r.last) : 'aucune en 7 j') + '</td><td class="n">' + int(r.days) + '</td></tr>';
      }).join('') + '</tbody></table></div>' +
      (rows.length > 12 ? '<p class="kh-src">+ ' + (rows.length - 12) + ' autre(s). Liste complète dans la console, filtre Actifs.</p>' : '') +
      (act.truncated ? '<p class="kh-note">Activité tronquée à ' + act.rows.length + ' établissements : la liste peut contenir des faux silencieux.</p>' : '');
  }
  function renderBoard() {
    var el = $('kh-board'), s = src('board');
    if (!state.workspace) return unavailable(el, '/api/admin/workspace');
    if (!s) return unavailable(el, 'kiwi_tickets');
    var money = s.rows.filter(function (r) { return Number(r.money_at_risk) > 0; });
    var kinds = {};
    s.rows.forEach(function (r) { var k = r.kind || 'autre'; kinds[k] = (kinds[k] || 0) + 1; });
    el.innerHTML = '<div class="kh-tiles" style="grid-template-columns:repeat(2,minmax(0,1fr));margin-bottom:12px">' +
      tile('Tickets ouverts', count(s), esc(Object.keys(kinds).map(function (k) { return kinds[k] + ' ' + k; }).join(' · ')), '<code>kiwi_tickets</code>') +
      tile('Argent en jeu', int(money.length), 'ticket(s) marqué(s) « argent »', '<code>money_at_risk</code>') + '</div>' +
      (s.rows.length ? '<div class="kh-scroll"><table class="kh-table"><tbody>' + s.rows.slice(0, 5).map(function (r) {
        return '<tr><td><span class="kh-pill' + (Number(r.money_at_risk) > 0 ? ' money' : '') + '">#' + esc(r.id) + '</span></td><td>' + esc(r.summary) + '</td></tr>';
      }).join('') + '</tbody></table></div>' : '<p class="kh-empty">Aucun ticket ouvert.</p>');
  }

  function renderFresh() {
    var el = $('kh-fresh');
    if (!state.at) { el.textContent = 'Données indisponibles'; return; }
    var stale = Date.now() - state.at > STALE_MS;
    var partial = state.ovErr || state.wsErr;
    el.className = 'kh-fresh' + (stale || partial ? ' stale' : '');
    el.textContent = (stale ? 'Données anciennes · ' : partial ? 'Partiel · ' : 'À jour · ') + timeFmt.format(state.at);
  }

  function render() {
    renderBusiness(); renderGmv(); renderMrr(); renderCities(); renderFleet(); renderSilent(); renderBoard(); renderFresh();
  }

  document.addEventListener('DOMContentLoaded', function () {
    $('kh-refresh').addEventListener('click', load);
    // Ouverte par la console : « Console » ramène à la fenêtre d'origine au
    // lieu d'en ouvrir une deuxième.
    $('kh-console').addEventListener('click', function (ev) {
      try { if (window.opener && !window.opener.closed) { ev.preventDefault(); window.opener.focus(); } } catch (_) {}
    });
    var resizeTimer = 0;
    window.addEventListener('resize', function () { clearTimeout(resizeTimer); resizeTimer = setTimeout(function () { if (state.overview) renderGmv(); }, 120); });
    setInterval(function () { if (document.visibilityState === 'visible') load(); else renderFresh(); }, REFRESH_MS);
    setInterval(renderFresh, 15000);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && Date.now() - state.at > REFRESH_MS) load();
    });
    load();
  });
})();
