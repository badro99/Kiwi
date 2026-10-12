/* Kiwi Caisse · « Souvent avec… », la suggestion au comptoir.
 *
 * Quand un plat entre dans la commande, la caisse peut proposer celui que les
 * tickets de ce commerce lui associent le plus souvent (un msemen appelle un
 * thé). Les paires viennent du serveur, calculées sur les 28 derniers jours de
 * tickets réels (functions/api/pairs.js) : la caisse ne garde pas l'historique.
 *
 * Ce module ne dessine rien et n'ajoute rien. Il garde les paires du commerce
 * appairé et répond à une question : « pour cette commande, que proposer ? ».
 * La caisse affiche la réponse dans la commande et, au toucher, passe par son
 * propre chemin d'ajout (options, formule, plat épuisé compris).
 *
 * Rien en démo, rien sans commerce identifié, rien sous le seuil du serveur.
 * Une suggestion écartée ne revient pas dans la même commande.
 */
(function () {
  'use strict';
  var REFRESH_MS = 30 * 60 * 1000;
  var state = { merchant: '', pairs: {}, at: 0 };
  var dismissed = new Set();
  var inflight = null;

  function ls(op, k, v) {
    try { return op === 'get' ? localStorage.getItem(k) : localStorage.setItem(k, v); } catch (_) { return null; }
  }
  /* Le commerce de CETTE caisse : son appairage, et lui seul. kiwiLiveMerchant
   * est global au navigateur (un patron qui a consulté un autre commerce le
   * laisse pointer ailleurs) ; il ne sert jamais ici. */
  function merchant() {
    try {
      var P = window.KiwiCaissePairing;
      if (!P || !P.isPaired || !P.isPaired()) return '';
      var pv = P.pairedVenue && P.pairedVenue();
      return String((pv && pv.merchant) || '').slice(0, 64);
    } catch (_) { return ''; }
  }
  function cacheKey(m) { return 'kiwi:pairs:' + m; }
  function clean(body, m) {
    if (!body || body.merchant !== m || !body.pairs || typeof body.pairs !== 'object') return null;
    var pairs = {};
    Object.keys(body.pairs).slice(0, 2000).forEach(function (lead) {
      var list = Array.isArray(body.pairs[lead]) ? body.pairs[lead] : [];
      var rows = list.slice(0, 3).map(function (p) {
        return p && p.i ? { i: String(p.i).slice(0, 80), n: String(p.n || '').slice(0, 80), together: Math.max(0, +p.together || 0), share: Math.max(0, Math.min(1, +p.share || 0)) } : null;
      }).filter(Boolean);
      if (rows.length) pairs[String(lead).slice(0, 80)] = rows;
    });
    return { merchant: m, pairs: pairs, at: +body.at || Date.now() };
  }
  /* Le cache local est rangé PAR commerce : une caisse réappairée ailleurs ne
   * lit jamais les paires du précédent. Le préfixe « kiwi: » le fait partir
   * avec la purge du dépairage (assets/pairing-commit.js). */
  function fromCache(m) {
    if (!m) return;
    if (state.merchant === m && state.at) return;
    var hit = null;
    try { hit = clean(JSON.parse(ls('get', cacheKey(m)) || 'null'), m); } catch (_) { hit = null; }
    state = hit || { merchant: m, pairs: {}, at: 0 };
  }
  function refresh() {
    var m = merchant();
    if (!m || typeof fetch !== 'function') return Promise.resolve(null);
    fromCache(m);
    if (inflight) return inflight;
    inflight = fetch('/api/pairs?merchant=' + encodeURIComponent(m), { credentials: 'same-origin' })
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (body) {
        var next = clean(body, m);
        if (next && merchant() === m) {
          state = next;
          ls('set', cacheKey(m), JSON.stringify({ merchant: m, pairs: next.pairs, at: next.at }));
        }
        return next;
      })
      .catch(function () { return null; })
      .then(function (v) { inflight = null; return v; });
    return inflight;
  }

  /* ids : les articles de la commande, dans l'ordre où ils y sont entrés.
   * sellable(id) : la caisse dit si l'article se vend seul en ce moment.
   * scope : la commande (« cart » à emporter, l'id de la table en salle). */
  /* Une commande vide (encaissée, vidée, table libérée) : ce qu'on avait
   * écarté pour elle ne vaut pas pour le client suivant. */
  function reset(scope) {
    scope = String(scope || 'cart');
    dismissed.forEach(function (k) { if (k.indexOf(scope + '|') === 0) dismissed.delete(k); });
  }
  function suggest(ids, sellable, scope) {
    var m = merchant();
    scope = String(scope || 'cart');
    ids = (Array.isArray(ids) ? ids : []).map(String);
    if (!ids.length) { reset(scope); return null; }
    if (!m) return null;
    fromCache(m);
    var inOrder = new Set(ids);
    for (var k = ids.length - 1; k >= 0; k--) {
      var list = state.pairs[ids[k]];
      if (!list) continue;
      for (var j = 0; j < list.length; j++) {
        var p = list[j];
        if (inOrder.has(p.i) || dismissed.has(scope + '|' + p.i)) continue;
        var ok = false;
        try { ok = typeof sellable === 'function' ? !!sellable(p.i) : true; } catch (_) { ok = false; }
        if (!ok) continue;
        return { lead: ids[k], id: p.i, name: p.n, together: p.together, share: p.share };
      }
    }
    return null;
  }
  function dismiss(scope, id) { dismissed.add(String(scope || 'cart') + '|' + String(id || '')); }

  window.KiwiPairs = { suggest: suggest, dismiss: dismiss, reset: reset, refresh: refresh, _state: function () { return state; } };

  setTimeout(refresh, 4000);
  setInterval(refresh, REFRESH_MS);
  window.addEventListener('storage', function (e) {
    if (e && (e.key === 'kiwiLiveMerchant' || e.key === 'kiwiPaired' || e.key === 'kiwiPairedVenue')) refresh();
  });
})();
