
    /* Record one completed tender (table payment, vente rapida, or split part).
       `amount` stays the base addition; `tip` (pourboire) is recorded alongside.
       `lines` (optional) · itemised order [{ name, qty, total }] for the receipt. */
    function accountActiveDiscount(settlementTable, saleDiscount) {
      let d = null, cut = 0;
      const tId = settlementTable || selectedId;
      if (mode === 'vrap') {
        d = vrapDiscount;
        const gross = cart.reduce((s, l) => s + l.price * l.qty, 0);
        cut = vrapDiscountAmount(gross);
      } else if (tId && tables[tId]) {
        d = tables[tId].discount;
        const gross = generateOrder(tId, tables[tId]).reduce((s, l) => s + l.total, 0);
        cut = discountAmountFor(tId, gross);
      }
      /* À l'emporter, `finalizeTender` a déjà envoyé le panier en cuisine et l'a
         vidé quand on arrive ici : la remise recalculée sur le panier valait 0 et
         le Z affichait « Réductions accordées 0 » pour une remise bien écrite en
         base. La vente porte sa propre remise (activeSaleDiscount) : on s'y fie. */
      if (!(cut > 0) && saleDiscount && saleDiscount.discountAmountCents > 0) {
        cut = saleDiscount.discountAmountCents / 100;
      }
      /* New discounts explicitly carry `accounted:false`. Legacy persisted
         discounts have no flag and were already added at approval time. */
      if (!d || d.accounted !== false || !(cut > 0)) return;
      const accounted = { ...d, amount: money(cut), accounted: true };
      if (mode === 'vrap') currentOrder().setDiscount(accounted);
      else if (tId && tables[tId]) tableSettlement().project(tables[tId], { discount: accounted });
      shift.discounts = money(shift.discounts + cut);
      shift.discountsCount++;
    }
    function discountReasonCode(value) {
      const key = String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (/client/.test(key)) return 'loyal-customer';
      if (/cuisine/.test(key)) return 'kitchen-error';
      if (/commercial/.test(key)) return 'commercial';
      return 'other';
    }
    function activeSaleDiscount(amount, lines, settlementTable) {
      const tId = settlementTable || selectedId;
      const d = mode === 'vrap' ? vrapDiscount : (tId && tables[tId] && tables[tId].discount);
      if (!d || !Array.isArray(lines) || !lines.length) return null;
      const gross = money(lines.reduce((sum, line) => sum + (Number(line && (line.total != null ? line.total : ((line.price || 0) * (line.qty || 0)))) || 0), 0));
      const discount = money(Math.max(0, gross - money(amount)));
      if (!(gross > 0) || !(discount > 0) || discount > gross) return null;
      return {
        grossAmountCents: minor(gross), discountAmountCents: minor(discount),
        discountKind: d.kind === 'pct' ? 'percent' : 'amount',
        discountPercent: d.kind === 'pct' ? Number(d.value) : null,
        discountReason: discountReasonCode(d.reason),
        actorId: String(d.actorId || (currentCashier && currentCashier.id) || '').slice(0, 96)
      };
    }   // { key, rows: [{ entry, shift, at }] }
