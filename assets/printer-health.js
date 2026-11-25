/* Caisse · une imprimante du relais qui ne répond pas se voit AVANT la commande.
 *
 * Browse, 25 nov. 2026 : l'imprimante cuisine (192.168.11.87) ne répondait qu'au
 * premier bon après une longue pause (3 h la veille, toute la nuit ce matin). Le
 * bon de 12:21 a expiré sans sortir et personne ne l'a su avant la réclamation.
 *
 * À l'ouverture de la caisse, puis toutes les 30 min tant qu'elle est à l'écran,
 * chaque imprimante réseau des réglages reçoit un « probe » par le relais : le pont
 * ouvre vraiment la connexion et n'écrit que ESC @, qui n'imprime rien. Une
 * imprimante qui dort peut rater la première connexion, donc un échec est revérifié
 * 30 s plus tard avant d'alerter. L'alerte nomme l'imprimante, reste tant qu'elle
 * ne répond pas (revérifiée toutes les 2 min, et tout de suite avec « Tester à
 * nouveau ») et s'en va seule dès qu'elle répond. Plusieurs caisses du même commerce
 * partagent le même probe (clé par tranche de temps) : une seule ligne en file.
 * Sans pont en ligne, ou sans réponse claire, on ne dit rien : ce n'est pas une
 * preuve contre l'imprimante, et le relais a déjà sa propre alerte de pont. */
(function () {
  'use strict';
  if (window.KiwiPrinterHealth) return;
  var EVERY_MS = 30 * 60000, RECHECK_MS = 2 * 60000, CONFIRM_MS = 30000, WATCH_MS = 75000, POLL_MS = 2500, SNOOZE_MS = 30 * 60000;
  var printers = {}, snoozedUntil = 0, manual = false;

  function tr(text) { return window.KiwiCaisseLang && window.KiwiCaisseLang.tr ? window.KiwiCaisseLang.tr(text) : text; }
  function merchant() {
    try { return (window.KiwiKitchenRelay && window.KiwiKitchenRelay.merchant && window.KiwiKitchenRelay.merchant()) || ''; } catch (_) { return ''; }
  }
  function later(ms, fn) { var h = setTimeout(fn, ms); if (h && h.unref) h.unref(); return h; }
  function hidden() { try { return !!document.hidden; } catch (_) { return false; } }

  /* Les imprimantes réseau des réglages : chaque poste nommé, plus l'imprimante par défaut. */
  function targets() {
    var P = window.KiwiPrinter, out = [];
    if (!P) return out;
    function add(ip, port, name) {
      ip = String(ip || '').trim();
      if (!/^[0-9a-z]([0-9a-z.-]{0,251}[0-9a-z])?$/i.test(ip)) return;
      port = Number(port) || 9100;
      var key = ip + ':' + port, known = out.filter(function (t) { return t.key === key; })[0];
      if (known) { if (!known.name && name) known.name = String(name).slice(0, 40); return; }
      out.push({ key: key, ip: ip, port: port, name: String(name || '').slice(0, 40) });
    }
    try { ((P.getStationConfig() || {}).profiles || []).forEach(function (p) { if (p && p.ip && !p.osPrinter) add(p.ip, p.port, p.name); }); } catch (_) {}
    try { var c = P.getConfig() || {}; if (c.ip && !c.osPrinter) add(c.ip, c.port, ''); } catch (_) {}
    return out;
  }
  function label(t) { return (t.name ? tr('Imprimante') + ' ' + t.name : tr('Imprimante')) + ' (' + t.ip + ')'; }

  function call(m, query, init) {
    var url = '/api/print/jobs?merchant=' + encodeURIComponent(m) + query;
    var request = fetch(url, Object.assign({ credentials: 'same-origin', cache: 'no-store' }, init || {}))
      .then(function (r) { return r.json().catch(function () { return null; }); });
    var deadline = new Promise(function (resolve) { later(10000, function () { resolve(null); }); });
    return Promise.race([request, deadline]).catch(function () { return null; });
  }
  /* 'up' : le pont a écrit sur l'imprimante. 'down' : le pont a essayé et la connexion a échoué.
     'unknown' : pas de pont, pas de réponse, pas de verdict ; on ne dit rien. */
  function probe(t, ref) {
    var m = merchant();
    if (!m) return Promise.resolve('unknown');
    return call(m, '', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target: { ip: t.ip, port: t.port }, kind: 'probe', clientRef: ref }),
    }).then(function (dep) {
      if (!dep || !dep.ok || !dep.id) return 'unknown';
      var started = Date.now();
      return new Promise(function (resolve) {
        (function look() {
          call(m, '&id=' + encodeURIComponent(dep.id)).then(function (st) {
            var job = st && st.ok && st.job;
            if (job && job.status === 'done') return resolve('up');
            /* « not-saved » / « not-local » : CE pont ne connaît pas cette imprimante, ce n'est pas elle qui est éteinte. */
            if (job && job.status === 'failed') return resolve(/printer-target-not-(saved|local)/.test(String(job.error || '')) ? 'unknown' : 'down');
            if (job && (job.status === 'expired' || job.status === 'uncertain')) return resolve('unknown');
            if (Date.now() - started > WATCH_MS) return resolve('unknown');
            later(POLL_MS, look);
          });
        })();
      });
    });
  }
  function ref(t, what, slot) {
    return ('probe:' + t.ip + ':' + t.port + ':' + what + ':' + slot).replace(/[^A-Za-z0-9_:.-]/g, '-').slice(0, 80);
  }

  function check(t, what) {
    var st = printers[t.key] || (printers[t.key] = { down: false, checking: false, at: 0 });
    if (st.checking) return Promise.resolve(st.down);
    st.checking = true; st.at = Date.now(); paint();
    var slot = what === 'manual' ? String(Date.now()) : String(Math.floor(Date.now() / (what === 'scheduled' ? EVERY_MS : what === 'confirm' ? CONFIRM_MS : RECHECK_MS)));
    return probe(t, ref(t, what, slot)).then(function (verdict) {
      if (verdict === 'up') { st.checking = false; st.down = false; paint(); return false; }
      if (verdict !== 'down' || st.down || what === 'confirm' || what === 'manual') {
        st.checking = false;
        if (verdict === 'down') st.down = true;
        paint(); return st.down;
      }
      /* Premier échec : une imprimante qui dort rate parfois la première connexion. */
      return new Promise(function (resolve) { later(CONFIRM_MS, resolve); }).then(function () {
        st.checking = false;
        return check(t, 'confirm');
      });
    });
  }
  function tick() {
    if (hidden()) return;
    targets().forEach(function (t) {
      var st = printers[t.key], age = st ? Date.now() - st.at : Infinity;
      if (st && st.down) { if (age >= RECHECK_MS) check(t, 'recheck'); }
      else if (age >= EVERY_MS) check(t, 'scheduled');
    });
  }

  function paint() {
    var list = targets(), down = list.filter(function (t) { return printers[t.key] && printers[t.key].down; });
    var entry = document.getElementById('caisse-printer-health');
    if (!down.length || Date.now() < snoozedUntil) { if (entry) entry.remove(); if (!down.length) snoozedUntil = 0; return; }
    if (!entry) {
      entry = document.createElement('div');
      entry.id = 'caisse-printer-health'; entry.className = 'toast is-warn'; entry.style.pointerEvents = 'auto';
      entry.setAttribute('role', 'alert');
      var btn = 'font:inherit;font-size:12px;font-weight:650;border-radius:10px;padding:7px 11px;cursor:pointer;min-height:34px;';
      var part = function (tag, attr, cls, css) {
        var n = document.createElement(tag);
        if (attr) n.setAttribute(attr, '');
        if (cls) n.className = cls;
        if (css) n.style.cssText = css;
        if (tag === 'button') n.type = 'button';
        return n;
      };
      var copy = part('div', '', 'toast-copy'), row = part('span', '', 'toast-desc', 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px');
      row.appendChild(part('button', 'data-test', '', btn + 'border:0;background:var(--atlas,#0B6E4F);color:var(--paper,#F7F5F0)'));
      row.appendChild(part('button', 'data-later', '', btn + 'border:1px solid rgba(10,15,13,.18);background:transparent;color:#0A0F0D'));
      copy.appendChild(part('span', 'data-msg', 'toast-title'));
      copy.appendChild(row);
      entry.appendChild(copy);
      entry.querySelector('[data-test]').addEventListener('click', function () {
        if (manual) return;
        manual = true; paint();
        Promise.all(targets().filter(function (t) { return printers[t.key] && printers[t.key].down; }).map(function (t) { return check(t, 'manual'); }))
          .then(function () { manual = false; paint(); }, function () { manual = false; paint(); });
      });
      entry.querySelector('[data-later]').addEventListener('click', function () { snoozedUntil = Date.now() + SNOOZE_MS; paint(); });
      (document.getElementById('toast-stack') || document.body).appendChild(entry);
    }
    var names = down.map(label).join(', ');
    entry.querySelector('[data-msg]').textContent = tr(down.length > 1
      ? '{label} ne répondent pas. Allumez-les et vérifiez leur câble réseau avant la prochaine commande.'
      : '{label} ne répond pas. Allumez-la et vérifiez son câble réseau avant la prochaine commande.').split('{label}').join(names);
    var test = entry.querySelector('[data-test]');
    test.disabled = manual;
    test.textContent = tr(manual ? 'Test en cours…' : 'Tester à nouveau');
    entry.querySelector('[data-later]').textContent = tr('Plus tard');
  }

  if (window.KiwiCaisseLang && window.KiwiCaisseLang.subscribe) window.KiwiCaisseLang.subscribe(paint);
  try { document.addEventListener('visibilitychange', function () { if (!hidden()) tick(); }); } catch (_) {}
  var every = setInterval(tick, RECHECK_MS); if (every && every.unref) every.unref();
  tick();
  window.KiwiPrinterHealth = { check: check, tick: tick, targets: targets, state: function () { return printers; } };
})();
