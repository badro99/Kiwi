
    /* Le rapport de l'instant. Non clôturé, sans comptage de tiroir : on ne
       demande ici que ce que le journal sait déjà. */
    function rpReport() {
      try { return buildDayReport(null, 0); } catch (_) { return null; }
    }
    function rpVocab() {
      try { return window.KiwiDayReport ? window.KiwiDayReport.vocab() : null; } catch (_) { return null; }
    }
    function rpEsc(s) {
      return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    }
    function rpHour(h) { return String(h).padStart(2, '0') + 'h'; }

    /* ── Onglet Résumé ── */
    function renderResume(r) {
      const body = $('#journal-body');
      if (!body) return;
      if (!r || (!r.txns && !(r.refunds && r.refunds.count))) {
        body.innerHTML = '<div class="rp-empty">Aucune vente pour l’instant.<br>Le rapport se remplit tout seul au premier encaissement.</div>';
        return;
      }
      const kpi = (l, v, sub, lead) =>
        `<div class="rp-kpi${lead ? ' is-lead' : ''}"><div class="rp-kpi-l">${rpEsc(l)}</div>`
        + `<div class="rp-kpi-v">${rpEsc(v)}${sub ? `<small>${rpEsc(sub)}</small>` : ''}</div></div>`;
      const row = (l, v) => `<div class="rp-r"><span class="rp-r-l">${rpEsc(l)}</span><span class="rp-r-v">${rpEsc(v)}</span></div>`;
      const M = { cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR', link: 'Lien' };

      /* `gross` est le brut AVANT remboursements, `methods` les porte déjà en
         négatif : afficher l'un au-dessus des autres faisait dire à l'écran
         « Encaissé 12 651 » et « Espèces 12 321 » sur la même vue · l'écart
         valait exactement les remboursements du service, et il a coûté une nuit
         de recherche à un commerçant. On nomme donc explicitement le brut et
         le net ; les modes de paiement affichent leur total net. */
      const refundAmt = (r.refunds && r.refunds.count) ? (+r.refunds.amount || 0) : 0;
      const collected = money(r.gross - refundAmt);

      let html = '<div class="rp-kpis">'
        + kpi('Net après remboursements', fmtMAD(r.net), '', true)
        + kpi('Transactions', String(r.txns))
        + kpi('Ticket moyen', fmtMAD(r.basket))
        + kpi('Ventes avant remboursements', fmtMAD(r.gross))
        + '</div>';

      const meth = Object.keys(r.methods || {}).filter(k => r.methods[k])
        .sort((a, b) => r.methods[b] - r.methods[a])
        .map(k => row(M[k] || k, fmtMAD(r.methods[k]))).join('');
      if (meth) html += `<div class="rp-sec"><div class="rp-h"><span>Moyens de paiement · net</span><em>${rpEsc(fmtMAD(collected))}</em></div>${meth}</div>`;

      /* Le rythme du service. Utile au comptoir pour une raison très concrète :
         savoir si le coup de feu est passé avant d'envoyer quelqu'un en pause. */
      const hrs = (r.hours || []).filter(h => h && (h.net > 0 || h.txns > 0));
      if (hrs.length > 1) {
        const max = hrs.reduce((m, h) => Math.max(m, h.net), 0);
        const peak = hrs.reduce((m, h) => (!m || h.net > m.net) ? h : m, null);
        const every = hrs.length > 7 ? 2 : 1;
        const cols = hrs.map(h => {
          const pct = max > 0 ? Math.max(3, Math.round(h.net / max * 100)) : 3;
          return `<div class="rp-hr${peak && h.h === peak.h ? ' is-peak' : ''}" title="${rpEsc(rpHour(h.h) + ' · ' + fmtMAD(h.net) + ' · ' + h.txns + ' ticket' + (h.txns > 1 ? 's' : ''))}">`
               + `<span class="rp-hr-b" style="height:${pct}%"></span></div>`;
        }).join('');
        const labels = hrs.map((h, i) => `<span>${i % every === 0 ? rpEsc(rpHour(h.h)) : ''}</span>`).join('');
        html += `<div class="rp-sec"><div class="rp-h"><span>Le rythme du service</span>`
              + `<em>Pic ${rpEsc(rpHour(peak.h))} · ${rpEsc(fmtMAD(peak.net))}</em></div>`
              + `<div class="rp-hrs">${cols}</div><div class="rp-hrx">${labels}</div></div>`;
      }

      let adj = '';
      if (refundAmt) {
        adj += row('Ventes brutes', fmtMAD(r.gross));
        adj += row(`Remboursements (${r.refunds.count})`, '− ' + fmtMAD(refundAmt));
      }
      if (r.discounts && r.discounts.amount) adj += row('Remises accordées', '− ' + fmtMAD(r.discounts.amount));
      if (r.tips) adj += row('Pourboires', fmtMAD(r.tips));
      if (adj) html += `<div class="rp-sec"><div class="rp-h"><span>Ajustements</span></div>${adj}</div>`;

      body.innerHTML = html;
    }

    /* ── Onglet Ventes par article ──
       LA question du comptoir : combien j'en ai vendu, de celui-là. Les données
       existaient déjà (le Z les imprime depuis toujours) mais aucun écran de la
       caisse ne les montrait · il fallait fermer la journée pour les voir. */
    function renderItems(r) {
      const body = $('#journal-body');
      if (!body) return;
      const V = rpVocab() || { item: 'article', items: 'articles', cats: 'catégories' };
      const cats = (r && r.categories) || [];
      if (!cats.length) {
        body.innerHTML = (r && r.txns)
          ? '<div class="rp-empty">Les ventes de ce service ont été encaissées sans panier détaillé.<br>Le détail par article n’existe que pour les ventes passées par la carte ou le catalogue.</div>'
          : '<div class="rp-empty">Aucun article vendu pour l’instant.</div>';
        return;
      }
      const q = journalSearch.trim().toLowerCase();
      let totQ = 0, totV = 0, shown = 0;
      const blocks = cats.map((c) => {
        const prods = (c.products || []).filter(p => !q || String(p.name).toLowerCase().includes(q));
        if (!prods.length) return '';
        shown += prods.length;
        let cq = 0, cv = 0;
        const rows = prods.map((p) => {
          cq += (+p.qty || 0); cv += (+p.total || 0);
          return `<div class="rp-it"><span class="rp-it-q">${rpEsc(p.qty)}×</span>`
               + `<span class="rp-it-n">${rpEsc(p.name)}</span>`
               + `<span class="rp-it-t">${rpEsc(fmtMAD(p.total))}</span></div>`;
        }).join('');
        totQ += cq; totV += cv;
        return `<div class="rp-cat"><div class="rp-cat-h">`
             + `<span class="rp-cat-n">${rpEsc(c.name)}</span>`
             + `<span class="rp-cat-v">${rpEsc(fmtMAD(cv))}</span></div>`
             + `<div class="rp-cat-b">${rows}</div></div>`;
      }).join('');
      if (!shown) {
        body.innerHTML = '<div class="rp-empty">Walo, aucun article ne correspond.</div>';
        return;
      }
      /* La couverture se dit quand elle n'est pas totale : un détail article qui
         ne couvre que les deux tiers du chiffre a l'air complet si on se tait. */
      const cover = (!q && r.coverage != null && r.coverage < 100)
        ? `<div class="rp-note">Ce détail porte sur ${r.coverage}% du chiffre encaissé · les ventes sans panier détaillé n’y figurent pas.</div>` : '';
      body.innerHTML = `<div class="rp-sec"><div class="rp-h"><span>${rpEsc(V.items)} vendus</span>`
        + `<em>${rpEsc(String(totQ))} · ${rpEsc(fmtMAD(totV))}</em></div>${blocks}${cover}</div>`;
    }

    /* ── Onglet Journal ── (l'ancien tiroir, mot pour mot) */
    function renderJournalList() {
      /* Le résumé de la barre d'outils est posé par renderJournal() · il change
         de nature selon l'onglet, donc il ne s'écrit plus ici. */
      const q = journalSearch.trim().toLowerCase();
      /* Les ventes sorties des livres ne se réimpriment pas et ne se remboursent
         pas : les laisser dans la liste, c'est laisser un caissier rendre de
         l'argent sur une vente qui n'existe plus. */
      let list = journal.filter(e => !e.voided).reverse();  // newest first
      if (journalFilter !== 'all') list = list.filter(e =>
        journalFilter === 'complimentary'
          ? (e.kind === 'complimentary' || e.settlementKind === 'complimentary' || e.method === 'complimentary')
          : e.method === journalFilter);
      if (q) list = list.filter(e =>
        e.label.toLowerCase().includes(q) ||
        e.ref.toLowerCase().includes(q) ||
        String(e.amount).includes(q)
      );

      const body = $('#journal-body');
      if (!body) return;
      if (list.length === 0) {
        body.innerHTML = '<div class="jr-empty">Walo, aucune transaction ne correspond.</div>';
        return;
      }
      body.innerHTML = list.map(e => {
        const hh = String(e.time.getHours()).padStart(2, '0');
        const mm = String(e.time.getMinutes()).padStart(2, '0');
        const isRefund = e.kind === 'refund';
        const isComplimentary = e.kind === 'complimentary' || e.settlementKind === 'complimentary' || e.method === 'complimentary';
        const icCls  = isRefund ? 'refund' : (isComplimentary ? 'complimentary' : e.method);
        const icon   = isRefund ? 'corner-up-left' : (isComplimentary ? 'gift' : (e.method === 'cash' ? 'banknote' : 'credit-card'));
        const mLabel = isComplimentary ? 'Offerte' : ({ cash: 'Espèces', card: 'Carte', wallet: 'Virement', tap: 'Kiwi Tap', qr: 'QR' }[e.method] || 'Autre');
        const fresh  = e.id === lastSaleId ? ' jr-entry--fresh' : '';
        const amtTxt = isRefund
          ? '− ' + fmtMAD(Math.abs(e.amount))
          : fmtMAD(e.amount);
        const refundedTag = e.refunded
          ? `<span class="jr-tag-refunded">remboursé</span>` : '';
        const sourceMeta = e.origin === 'employee'
          ? ` · App employé${e.cashier ? ' · ' + rpEsc(e.cashier) : ''}`
          : (e.origin === 'orderpro' ? ' · OrderPro' : '');
        const tipMeta = (!isRefund && e.tip > 0)
          ? ` · pourboire ${fmtMAD(e.tip)}` : '';
        return `<button class="jr-entry${fresh}" data-jr-id="${escTeam(e.id || '')}"${e.id ? '' : ' disabled'}>`
             + `<span class="jr-entry-ic jr-entry-ic--${icCls}"><i data-lucide="${icon}"></i></span>`
             + `<span class="jr-entry-main">`
             /* L'étiquette porte maintenant le nom de table, saisi par le
                commerçant : elle passe par l'échappement comme ses voisines. */
             +   `<span class="jr-entry-label">${rpEsc(e.label)}${refundedTag}</span>`
             +   `<span class="jr-entry-meta">${hh}:${mm} · ${mLabel} · ${e.ref}${sourceMeta}${tipMeta}</span>`
             + `</span>`
             + `<span class="jr-entry-amount${isRefund ? ' is-refund' : ''}">${amtTxt}</span>`
             + `<span class="jr-entry-invoice" data-jr-invoice="${escTeam(e.id || '')}" role="button" tabindex="0" aria-label="Facture A4 ${escTeam(e.ref)}"><i data-lucide="file-text"></i></span>`
             + `<span class="jr-entry-reprint" data-jr-print="${escTeam(e.id || '')}" role="button" tabindex="0" aria-label="Réimprimer le ticket ${escTeam(e.ref)}"><i data-lucide="printer"></i></span>`
             + `</button>`;
      }).join('');
      if (window.lucide) lucide.createIcons();
    }

    /* Le chef d'orchestre. Les autres modules appellent renderJournal() quand une
       vente tombe ou qu'un remboursement passe : ils n'ont pas à savoir quel
       onglet est ouvert, ils demandent un rafraîchissement et c'est tout. */
    function renderJournal() {
      const tot = journalTotals();
      const sumEl = $('#jr-summary');
      const searchEl = $('#rp-search');
      const filtEl = $('#jr-filters');
      const input = $('#jr-search-input');

      /* Une seule barre d'outils pour trois onglets : ce qui n'a pas de sens
         disparaît au lieu de rester là sans effet. Les filtres carte/espèces ne
         veulent rien dire sur un classement d'articles. */
      if (searchEl) searchEl.hidden = (rpTab === 'resume');
      if (filtEl) filtEl.hidden = (rpTab !== 'journal');
      if (input) input.placeholder = (rpTab === 'items')
        ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rechercher un article') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rechercher, table, montant, réf');

      let r = null;
      if (rpTab !== 'journal') r = rpReport();

      if (sumEl) {
        if (rpTab === 'items' && r) {
          const V = rpVocab() || { items: 'articles' };
          const n = (r.categories || []).reduce((s, c) => s + (+c.qty || 0), 0);
          sumEl.textContent = `${n} ${V.items} · ${(r.categories || []).length} ${(r.categories || []).length > 1 ? (V.cats || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('catégories')) : (V.cat || (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('catégorie'))}`;
        } else {
          sumEl.textContent = `${tot.txns} transaction${tot.txns > 1 ? 's' : ''} · ${fmtMAD(tot.revenue)} encaissés`;
        }
      }

      if (rpTab === 'resume') renderResume(r);
      else if (rpTab === 'items') renderItems(r);
      else renderJournalList();

      renderRapportFoot();
    }

    /* Les actions du pied suivent l'onglet : on imprime ce qu'on est en train
       de lire, pas un menu d'impressions dont deux sur trois ne correspondent
       pas à l'écran. */
    function renderRapportFoot() {
      const foot = $('#rp-foot');
      if (!foot) return;
      const has = journal.some(e => !e.voided);
      let html = '';
      if (rpTab === 'items') {
        html = `<button class="rp-btn primary" data-rp-act="print-items"><i data-lucide="printer"></i><span>Imprimer les ventes par article</span></button>`;
      } else if (rpTab === 'journal') {
        html = `<button class="rp-btn" data-rp-act="reprint-last"><i data-lucide="rotate-ccw"></i><span>Réimprimer le dernier ticket</span></button>`;
      } else {
        html = `<button class="rp-btn primary" data-rp-act="print-report"><i data-lucide="printer"></i><span>Imprimer le rapport</span></button>`;
      }
      foot.innerHTML = html;
      foot.hidden = !has;
      if (window.lucide) lucide.createIcons();
    }

    /* Le ticket « ventes par article ». Il se sort EN PLEIN SERVICE · c'est tout
       son intérêt · donc il porte « EN COURS » et pas d'heure de fermeture : un
       ticket daté d'une clôture qui n'a pas eu lieu est un faux. */
    function printItemSales() {
      const r = rpReport();
      if (!r) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport indisponible')); return; }
      if (!window.KiwiPrinter || !window.KiwiPrinter.printDayReport) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Imprimante indisponible')); return; }
      const V = rpVocab() || { items: 'articles' };
      const opts = dayReportPrintOpts(r, registerClosing ? '' : 'EN COURS');
      opts.itemsOnly = true;
      opts.title = 'VENTES PAR ' + String(V.item || 'article').toUpperCase();
      opts.closedLabel = '';
      opts.noItemsWord = 'Aucun article détaillé';
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression…'));
      Promise.resolve(window.KiwiPrinter.printDayReport(opts)).then(
        (res) => toast(res && res.ok ? (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Ventes par article imprimées') : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible')),
        () => toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Impression impossible')));
    }
    function printLiveReport() {
      const r = rpReport();
      if (!r) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Rapport indisponible')); return; }
      doPrintDayReport(r, registerClosing ? '' : 'EN COURS');
    }
    /* Le rouleau bourre sur la dernière vente : c'est le geste de panne le plus
       fréquent d'un comptoir, il mérite un bouton et pas une chasse dans la
       liste. Les ventes sorties des livres ne comptent pas. */
    function reprintLastTicket() {
      const last = journal.slice().reverse().find(e => e && !e.voided && e.kind !== 'refund');
      if (!last) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Aucun ticket à réimprimer')); return; }
      printSaleTicket(last, { copy: true });
    }

    function openJournal(tab) {
      lastSaleId = null;
      rpTab = tab || 'journal';
      $$('#rp-tabs [data-rp-tab]').forEach((b) => {
        const on = b.dataset.rpTab === rpTab;
        b.classList.toggle('is-active', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const dayEl = $('#rp-day');
      if (dayEl) {
        const d = String(currentBusinessDay() || '').split('-');
        dayEl.textContent = d.length === 3 ? `· ${d[2]}/${d[1]}` : (globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('· ce service');
      }
      renderJournal();
      $('#journal-drawer').classList.add('is-open');
    }
    function closeJournal() { $('#journal-drawer').classList.remove('is-open'); }
