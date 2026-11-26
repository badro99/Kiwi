/* Owner: caisse held splits and receipt reopen glue.
 * Exposes the classic global function declarations below.
 * Requires caisse-app.js shared lexical state and the accounting/floor/kitchen
 * declarations. No startup effects; load before caisse-app.js initializers.
 */

    function vrapSplitKey(num) { return num == null ? 'new' : 'n' + Number(num); }
    function currentVrapSplit() { return vrapSplits.get(vrapSplitKey(vrapEditingNum)) || null; }

    function splitPaidCount(saved) {
      if (!saved || !Array.isArray(saved.parts)) return 0;
      return saved.parts.filter((part) => part && part.paid === true).length;
    }

    function liveTableSplit(id) {
      const saved = tableSplits.get(id);
      if (!saved) return null;
      const visit = String(phoneSessionOf(id) || tables[id]?.timerSession || '');
      /* A legacy till may have persisted a completed split before markPaid()
         could clear it. A new waiter/phone visit can also reuse this table
         without passing through the cashier's new-table modal. Neither may
         inherit the previous party's paid parts. */
      /* A split set up before the table had a visit carries the till's own
         « flow-… » key: the visit that arrives after (the first ticket's queue
         answer) is the same party, not a new one. Dropping it there erased the
         shares already paid and put the whole bill back (Browse, 26 Nov 2026). */
      const local = /^flow-/.test(String(saved.session || ''));
      if (!Array.isArray(saved.parts) || !saved.parts.length
        || splitPaidCount(saved) === saved.parts.length
        || (saved.session && !local && visit && String(saved.session) !== visit)) {
        tableSplits.delete(id);
        try { persistShift(); } catch (_) {}
        return null;
      }
      return saved;
    }

    /* True when the table carries a split with a part still due (the same test
       renderRightPanel uses to hide the ordinary pay button): the whole-bill
       « Encaisser » must stay out of reach. */
    function tableHasOpenSplit(id) {
      const saved = liveTableSplit(id);
      return !!(saved && splitPaidCount(saved) < saved.parts.length);
    }

    /* What is still due: the bill less the shares paid (a share's tip is not the bill's). */
    /* A share already paid on this bill: the rest is paid share by share.
       Taking the whole bill charged again what was settled (finalizeTender). */
    function refuseWholeBillMidSplit(method) {
      const vrapOpen = mode === 'vrap' && currentVrapSplit(), tableOpen = mode !== 'vrap' && selectedId && tableHasOpenSplit(selectedId);
      if (method === 'platform' || !(tableOpen || (vrapOpen && splitPaidCount(vrapOpen) > 0))) return;
      toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Un partage est en cours : encaissez ses parts'));
      throw new Error('split-open');
    }
    function splitRemainingTotal(saved) {
      if (!saved || !Array.isArray(saved.parts)) return 0;
      return money(saved.parts.reduce((sum, part) => sum + (part && !part.paid ? Number(part.base != null ? part.base : part.amount) || 0 : 0), 0));
    }

    /* The bill moved after its split was set up: a dish added at the table, by
       the waiter's phone, or one voided. The saved total went stale and the
       last share freed the table with dishes nobody paid. Nothing paid yet: the
       split is dropped and set up again. Shares paid: what was added becomes a
       share of its own, what was voided comes off the shares still due. Returns
       the split to use, or null. `id` is the table, null for this takeaway. */
    function syncSplitToBill(id) {
      const isVrap = id == null;
      const saved = isVrap ? currentVrapSplit() : liveTableSplit(id);
      if (!saved) return null;
      let lines, net;
      if (isVrap) {
        lines = cart.map(c => ({ name: lineLabel(c), baseName: c.baseName || c.name, itemId: c.id || '', qty: c.qty, total: c.price * c.qty }));
        const gross = money(lines.reduce((s, l) => s + l.total, 0));
        net = money(gross - vrapDiscountAmount(gross));
      } else {
        lines = generateOrder(id, tables[id]);
        const gross = money(lines.reduce((s, l) => s + l.total, 0));
        net = money(gross - discountAmountFor(id, gross));
      }
      const diff = minor(net) - minor(saved.total);
      if (!diff || !lines.length) return saved;
      const drop = () => {
        if (isVrap) { for (const [k, v] of vrapSplits) if (v === saved) vrapSplits.delete(k); }
        else tableSplits.delete(id);
        if (splitState.flow && String(splitState.flow.id) === String(saved.id)) splitState.flow = null;
        try { persistShift(); } catch (_) {}
        return null;
      };
      const base = (p) => minor(p.base != null ? p.base : p.amount);
      const paid = saved.parts.filter(p => p.paid), due = saved.parts.filter(p => !p.paid);
      if (!paid.length) return drop();
      if (diff > 0) {
        /* The dishes added since: each line's quantity above what the split saw. */
        const seen = {};
        (saved.sourceLines || []).forEach(l => { seen[l.name] = (seen[l.name] || 0) + (Number(l.qty) || 0); });
        const added = [];
        lines.forEach(l => {
          const more = (Number(l.qty) || 0) - (seen[l.name] || 0);
          seen[l.name] = Math.max(0, (seen[l.name] || 0) - (Number(l.qty) || 0));
          if (more > 0) {
            const unit = l.qty > 0 ? l.total / l.qty : l.total;
            added.push({ name: l.name, baseName: l.baseName || '', qty: more, unit, price: unit, total: money(unit * more), cat: lineCat(l.itemId || null, l.name), itemId: l.itemId || '' });
          }
        });
        /* Dishes added one by one land in one share still due, not one share each. */
        const open = saved.parts.find(p => p.added && !p.paid);
        if (open) {
          added.forEach(l => { const same = open.lines.find(x => x.name === l.name); if (same) { same.qty += l.qty; same.total = money(same.total + l.total); } else open.lines.push(l); });
          open.base = money(open.base + major(diff)); open.amount = money(open.base + (Number(open.tip) || 0));
          open.label = open.lines.map(l => (l.qty > 1 ? l.qty + '× ' : '') + l.name).join(', ');
        } else saved.parts.push({ base: major(diff), tip: 0, amount: major(diff), label: added.map(l => (l.qty > 1 ? l.qty + '× ' : '') + l.name).join(', ') || 'Ajouts après le partage', lines: added, paid: false, payMethod: null, added: true });
      } else {
        /* A void: off the shares still due, in proportion; never below what was paid. */
        const left = due.reduce((s, p) => s + base(p), 0) + diff;
        if (left < 0) { toast((globalThis.window?.KiwiCaisseLang || { tr: s => s }).tr('Addition plus basse que les parts déjà payées · vérifiez avant de continuer')); return saved; }
        if (left === 0) saved.parts = saved.parts.filter(p => p.paid);
        else {
          const cut = shareWeighted(major(left), due.map(base));
          due.forEach((p, i) => { p.base = cut[i]; p.amount = money(cut[i] + (Number(p.tip) || 0)); });
          saved.parts = saved.parts.filter(p => p.paid || minor(p.base) > 0);
        }
      }
      saved.total = net;
      saved.sourceLines = lines.slice(0, 40).map(l => ({ ...l }));
      saved.paidCount = splitPaidCount(saved);
      if (!isVrap) { try { tableSettlement().bill(id, { totalCents: minor(net), lines }); } catch (_) {} }
      if (splitState.flow && String(splitState.flow.id) === String(saved.id)) splitState.flow = null;   /* reloaded from the saved split */
      try { persistShift(); } catch (_) {}
      return saved;
    }

    function savedTakeawaySplitFor(order) {
      if (!order) return null;
      const byNum = vrapSplits.get(order.num == null ? 'new' : 'n' + Number(order.num));
      if (byNum) return byNum;
      for (const saved of vrapSplits.values()) {
        if (String(saved.sourceLabel || '') === `À emporter #${order.num}`) return saved;
      }
      return null;
    }

    function saveSplitFlow() {
      if (!splitState.flow) return;
      const saved = {
        mode:      splitState.splitMode,
        total:     splitState.total,
        sourceLines: Array.isArray(splitState.sourceLines)
          ? splitState.sourceLines.map(line => ({ ...line })) : [],
        parts:     splitState.flow.parts.map(p => ({
          ...p,
          lines: Array.isArray(p.lines) ? p.lines.map(l => ({ ...l })) : [],
        })),
        paidCount: splitPaidCount(splitState.flow),
        id: String(splitState.flow.id || ''),
        session: String(splitState.flow.session || ''),
        sourceLabel: splitState.sourceLabel || '',
        orderNum: splitState.isVrap && vrapEditingNum != null ? Number(vrapEditingNum) : null,
      };
      if (splitState.isVrap) {
        /* The cart's split moves to its order number once the order is sent: no copy stays under 'new'. */
        for (const [k, v] of vrapSplits) if (v && String(v.id) === saved.id) vrapSplits.delete(k);
        vrapSplits.set(vrapSplitKey(saved.orderNum), saved);
      }
      else if (splitState.tableId) tableSplits.set(splitState.tableId, saved);
      try { persistShift(); } catch (_) {}
    }

    function loadSplitFlow(tableId) {
      const isVrap = mode === 'vrap';
      const saved = isVrap ? currentVrapSplit() : liveTableSplit(tableId);
      if (!saved) return false;
      const t = isVrap ? null : tables[tableId];
      const currentLines = isVrap
        ? cart.map(c => ({ name: lineLabel(c), qty: c.qty, total: c.price * c.qty }))
        : generateOrder(tableId, t);
      /* The original bill, not the remaining amount or a freshly rendered
         table, belongs on every split receipt. Keep it across backgrounding
         and reloads so a later void can restore the exact bill lines. */
      const sourceLines = Array.isArray(saved.sourceLines) && saved.sourceLines.length
        ? saved.sourceLines : currentLines;
      Object.assign(splitState, {
        tableId: isVrap ? null : tableId,
        isVrap,
        sourceLabel: isVrap ? (vrapEditingNum != null ? ('À emporter #' + vrapEditingNum) : 'À emporter')
          : (saved.sourceLabel || tableId),
        total:     saved.total,
        sourceLines: sourceLines.map(line => ({ ...line })),
        splitMode: saved.mode,
        numParts:  saved.parts.length,
        tipMode:   '0', customTipPct: 0,
        numConvives: saved.parts.length,
        assignments: {},
        itemTotals: typeof splitItemTotals === 'function' ? splitItemTotals(sourceLines) : {}, perConvive: {},
        flow: {
          id: String(saved.id || ''),
          session: String(saved.session || ''),
          parts: saved.parts.map(p => ({
            ...p,
            lines: Array.isArray(p.lines) ? p.lines.map(l => ({ ...l })) : [],
          })),
          paidCount: splitPaidCount(saved),
        },
      });
      return true;
    }

    function renderRpSplitCard(id) {
      const card = $('#rp-split-card');
      if (!card) return;
      const saved = liveTableSplit(id);
      if (!saved) { card.hidden = true; return; }
      const paidCount = splitPaidCount(saved);
      const remaining = splitRemainingTotal(saved);
      const pct = Math.round((paidCount / saved.parts.length) * 100);
      $('#rp-split-card-sub').textContent =
        `${paidCount} / ${saved.parts.length} parts réglées · ${pct}% · reste ${fmtMAD(remaining)}`;
      $('#rp-split-bar-fill').style.width = pct + '%';
      card.hidden = false;
    }

    
