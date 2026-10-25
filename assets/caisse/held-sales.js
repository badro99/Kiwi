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
      if (!Array.isArray(saved.parts) || !saved.parts.length
        || splitPaidCount(saved) === saved.parts.length
        || (saved.session && visit && String(saved.session) !== visit)) {
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

    function splitRemainingTotal(saved) {
      if (!saved || !Array.isArray(saved.parts)) return 0;
      return money(saved.parts.reduce((sum, part) => sum + (part && !part.paid ? Number(part.amount) || 0 : 0), 0));
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
          ? splitState.sourceLines.slice(0, 40).map(line => ({ ...line })) : [],
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
      if (splitState.isVrap) vrapSplits.set(vrapSplitKey(saved.orderNum), saved);
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

    
