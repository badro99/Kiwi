  function creditMerchant() {
    try {
      var venue = window.KiwiVenue && KiwiVenue.getCurrentVenueData && KiwiVenue.getCurrentVenueData();
      if (venue && (venue.slug || venue.merchant)) return venue.slug || venue.merchant;
    } catch (_) {}
    try { return localStorage.getItem('kiwiLiveMerchant') || ''; } catch (_) { return ''; }
  }

  /* #105 · La boutique garde ses avoirs et son journal des retours sur la caisse
     (kiwi:bqAvoirs, kiwi:bqReturns ; le journal des retours est aussi poussé au
     cloud). La fiche client ne lisait que le registre serveur : un avoir émis
     au comptoir n'y apparaissait pas, et l'achat retourné restait affiché
     comme s'il ne l'avait jamais été. On lit donc aussi ces deux journaux. */
  /* Le cache est rangé par commerce (`kiwi:bqAvoirs@<slug>`, voir avoirKey dans
     pos-boutique.js / pos-maison.js) : on ne lit que celui du commerce regardé. */
  function localAvoirs() {
    try { var a = JSON.parse(localStorage.getItem('kiwi:bqAvoirs@' + (creditMerchant() || 'local')) || '[]'); return Array.isArray(a) ? a.filter(Boolean) : []; }
    catch (_) { return []; }
  }
  function localReturns() {
    try {
      var d = JSON.parse(localStorage.getItem('kiwi:bqReturns') || 'null');
      var m = creditMerchant();
      if (!d || !Array.isArray(d.list) || (d.m && m && d.m !== m)) return [];
      return d.list.filter(Boolean);
    } catch (_) { return []; }
  }
  function localCreditView(a) {
    var at = a.at ? new Date(a.at).getTime() : 0;
    return {
      code: a.code, status: a.status || (a.balance > 0 ? 'active' : 'consumed'),
      amountCents: Math.round((+a.amount || 0) * 100), balanceCents: Math.round((+a.balance || 0) * 100),
      createdAt: at, expiresAt: a.until ? new Date(a.until).getTime() : 0,
      originalRef: a.from || '', reason: a.motif || 'Retour', issuedBy: 'Caisse',
      events: Array.isArray(a.lines) && a.lines.length ? [{ action: 'issue', lines: a.lines }] : [],
    };
  }
  function clientLocalCredits(clientId) {
    return localAvoirs().filter(function (a) { return a.holderId && a.holderId === clientId; }).map(localCreditView);
  }

  function loadClientCredits(clientId, host) {
    if (!host) return;
    var local = clientLocalCredits(clientId);
    function paint(remote) {
      if (!host.isConnected) return;
      /* A failed server read is said, with a retry, above the avoirs this
         device holds locally: never a silent zero, never a hidden register. */
      var failed = remote === null;
      var pageLang = typeof document !== 'undefined' && document.documentElement ? document.documentElement.lang : '';
      var dateLocale = pageLang === 'ar' ? 'ar-MA-u-nu-latn' : pageLang === 'en' ? 'en-GB' : 'fr-FR';
      if (failed) remote = [];
      var seen = {};
      var credits = (remote || []).concat(local).filter(function (credit) {
        if (!credit || !credit.code || seen[credit.code]) return false;
        seen[credit.code] = 1; return true;
      });
      var active = credits.reduce(function (sum, credit) {
        return sum + (credit.status === 'active' ? Number(credit.balanceCents || 0) : 0);
      }, 0) / 100;
      host.innerHTML = (failed ? '<div role="alert">' + esc(tr('Solde des avoirs indisponible. La lecture du serveur a échoué.')) + '</div><button type="button" data-credit-retry>' + esc(tr('Réessayer')) + '</button>' : '') + '<div class="kcb-section">' + esc(tr('Avoirs · solde')) + ' ' + fmt(active) + ' MAD</div>' + (credits.length
        ? '<div class="kcb-info">' + credits.map(function (credit) {
            var issued = (credit.events || []).filter(function (event) { return event.action === 'issue'; })[0] || {};
            var products = Array.isArray(issued.lines) && issued.lines.length
              ? issued.lines.map(function (line) { return window.KiwiClientNumbers.quantity(line.qty ?? 1) + '× ' + (line.name || 'Article'); }).join(' · ')
              : (credit.reason || 'Retour');
            var movements = (credit.events || []).filter(function (event) { return event.action !== 'issue'; }).map(function (event) {
              return '<small style="display:block;margin-top:4px">' + esc(event.action === 'redeem' ? tr('Utilisé') : event.action === 'cancel' ? tr('Annulé') : event.action)
                + ' · ' + fmt(Number(event.amountCents || 0) / 100) + ' MAD · ' + esc(event.actor || 'Caisse')
                + ' · ' + esc(tr('solde')) + ' ' + fmt(Number(event.balanceAfterCents || 0) / 100) + ' MAD</small>';
            }).join('');
            var issuedAt = credit.createdAt ? new Date(credit.createdAt).toLocaleString(dateLocale, { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' }) : tr('Date inconnue');
            var expiry = credit.expiresAt ? creditLastDay(credit.expiresAt).toLocaleDateString(dateLocale) : tr('sans échéance');
            var used = credit.status === 'active' ? '' : ' · ' + (credit.status === 'cancelled' ? tr('annulé') : tr('utilisé'));
            return '<div class="kcb-inforow"><span class="k">' + esc(credit.code) + '<small style="display:block;margin-top:3px">' + esc(issuedAt) + ' · ' + esc(tr('expire')) + ' ' + esc(expiry) + '</small></span>'
              + '<span class="v"><b>' + fmt(Number(credit.amountCents || 0) / 100) + ' MAD · ' + esc(tr('reste')) + ' ' + fmt(Number(credit.balanceCents || 0) / 100) + ' MAD' + esc(used) + '</b>'
              + '<small style="display:block;margin-top:3px">' + esc(tr('Vente')) + ' ' + esc(credit.originalRef || credit.originalSaleId || '·') + ' · ' + esc(products) + ' · ' + esc(issued.actor || credit.issuedBy || 'Caisse') + '</small>' + movements + '</span></div>';
          }).join('') + '</div>'
        : '<div class="kcb-empty" style="min-height:70px"><b>' + esc(tr('Aucun avoir')) + '</b><div>' + esc(tr('Les crédits boutique émis à ce client apparaîtront ici.')) + '</div></div>');
      var retry = failed && host.querySelector('[data-credit-retry]');
      if (retry) retry.onclick = function () { loadClientCredits(clientId, host); };
    }
    var merchant = creditMerchant();
    if (!merchant || typeof fetch !== 'function') { paint(null); return; }
    host.innerHTML = '<div role="status">' + esc(tr('Chargement des avoirs…')) + '</div>';
    fetch('/api/store-credits?merchant=' + encodeURIComponent(merchant) + '&customerId=' + encodeURIComponent(clientId),
      { headers: { Accept: 'application/json' } })
      .then(function (response) { if (!response || !response.ok) throw new Error('credit-read'); return response.json(); })
      .then(function (data) { if (!data || !Array.isArray(data.credits)) throw new Error('credit-read'); paint(data.credits); })
      .catch(function () { paint(null); });
  }

