/* Caisses Boutique et Maison · régler les notes d'une cliente en un paiement
 * (La Maison en Vogue, 20 nov. 2026).
 *
 * L'écran Acomptes (retail-balances.js) choisit les notes et le montant ; ici,
 * un seul passage par l'écran des modes encaisse le tout, puis chaque note
 * reçoit son propre règlement : sa vente « acompte-reglement », sa ligne dans
 * le journal de la caisse, son envoi au serveur. Le montant reçu couvre les
 * notes les plus anciennes d'abord, et chaque reçu porte sa part exacte de
 * chaque mode (espèces, carte, avoir) : le Z et le tiroir tombent juste.
 *
 * `d` apporte ce que la caisse possède : openPay, la fiche cliente, les
 * conversions de modes pour le serveur, et ce qu'il faut faire après. */
const lang = () => globalThis.window?.KiwiCaisseLang || { tr: (text) => text };
const tr = (text) => lang().tr(text);

export function settleBalances(sel, d) {
  const R = d.R;
  const picked = sel && Array.isArray(sel.rows) ? sel.rows : sel ? [sel] : [];
  if (!R || picked.some((row) => row.pendingCents > 0)) { d.toast(tr('Synchronisation de l’acompte en attente')); return; }
  const rows = picked.filter((row) => R.due(row) > 0);
  const owed = rows.reduce((sum, row) => sum + R.due(row), 0);
  if (!(owed > 0)) { d.toast(tr('Cette note est déjà réglée')); d.refresh(); return; }
  const amountCents = Math.min(owed, Math.round(Number(sel.amountCents) || owed));
  const customerId = rows[0].customerId;
  const client = d.clById(customerId);
  const refs = rows.map((row) => row.ticketRef).join(' + ');
  d.openPay({
    amount: amountCents / 100, balanceExisting: true,
    balanceTotal: rows.reduce((sum, row) => sum + row.totalCents, 0) / 100,
    balancePaid: rows.reduce((sum, row) => sum + row.totalCents - R.due(row), 0) / 100,
    customerId, title: 'Régler un acompte', subtitle: `${refs} · ${client ? d.esc(client.name) : 'Cliente'}`,
    ref: refs, lines: [], customer: client ? { name: client.name, phone: client.phone } : null,
    waName: client ? d.firstName(client.name) : '', waPhone: client ? client.phone : '',
    onPaid: (parts, context) => {
      const paidCents = Math.round((Number(context.paidNow) || 0) * 100);
      const plan = R.allocate(rows, paidCents);
      const slices = R.sliceTender(parts, plan.map((item) => item.cents));
      const at = new Date();
      const sales = [];
      for (let i = 0; i < plan.length; i++) {
        const { row, cents } = plan[i];
        const slice = slices[i].length ? slices[i] : [{ m: parts[0].m, amount: cents / 100 }];
        const amount = cents / 100;
        const syncId = d.newSaleId();
        const method = d.payMethod(slice);
        const sale = {
          id: row.ticketRef + '-P' + at.getTime(), syncId, tenderVersion: 2, at,
          clientId: row.customerId, by: d.staffName, kind: 'acompte-reglement',
          methods: slice[0].m, parts: slice, lines: [], total: amount,
          balanceTotal: row.totalCents / 100,
          balanceDue: Math.max(0, (R.due(row) - cents) / 100),
        };
        const saved = R.record(d.merchant, {
          id: row.id, customerId: row.customerId, ticketRef: row.ticketRef,
          totalCents: row.totalCents, basePaidCents: row.paidCents,
          receipt: { id: syncId, amountCents: cents, method, ts: +at },
        });
        if (!saved) {
          d.toast(tr('Règlement non conservé : stockage local indisponible'));
          /* Rien n'est encore écrit : l'écran des modes reste ouvert. Plus loin,
             les notes déjà réglées le sont pour de bon : on s'arrête là. */
          if (!sales.length) return { error: 'balance-storage-failed' };
          break;
        }
        d.addSale(sale); sales.push(sale);
        try {
          d.post(sale, {
            id: syncId, amount, amountCents: cents, method,
            paymentParts: d.payParts(slice), ticketAmountCents: cents,
            label: 'Règlement acompte', ref: row.ticketRef, time: at, channel: 'counter',
            retailBalance: { id: row.id, customerId: row.customerId, ticketRef: row.ticketRef,
              totalCents: row.totalCents, stage: 'payment' },
          });
        } catch (_) { /* the local journal remains readable */ }
      }
      d.after();
      const received = sales.reduce((sum, sale) => sum + sale.total, 0);
      return { sale: sales[0], sales, line: `Reçu ${d.fmtMAD(received)} · reste ${d.fmtMAD(Math.max(0, owed / 100 - received))}` };
    },
  });
}
