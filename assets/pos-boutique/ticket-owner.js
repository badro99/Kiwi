/* Propriétaire des mutations du ticket. Les contrôles de stock et les effets
 * restent chez les appelants ; les opérations conservent les règles historiques. */
const ticketOwner = {
  clear(state, ticket) { state.ticket = ticket; },
  replaceLines(ticket, lines) { ticket.lines = lines; },
  prune(ticket, products) { ticket.lines = ticket.lines.filter(line => products[line.pid]); },
  addLine(ticket, line) {
    const same = ticket.lines.find(l => l.pid === line.pid && l.size === line.size && l.color === line.color && l.remise === line.remise
      && (l.agreed ?? null) === (line.agreed ?? null));
    if (same) {
      same.qty += line.qty;
      if (line.promo && (!same.promo || line.promo.price < same.promo.price)) same.promo = line.promo;
    } else ticket.lines.push(line);
  },
  /* Les gestes de ligne (line-gestures.js) : une copie posée juste dessous,
     jamais fusionnée ; une ligne remplacée sur place par la fiche. */
  insertLine(ticket, index, line) { ticket.lines.splice(Math.max(0, Math.min(index, ticket.lines.length)), 0, line); },
  replaceLine(ticket, index, line) { if (ticket.lines[index]) ticket.lines[index] = line; },
  changeQuantity(ticket, index, delta) {
    const line = ticket.lines[index];
    /* Un prix convenu pour le ticket entier valait pour CES pièces : une pièce
       ajoutée ensuite part à son prix, sur sa propre ligne (revue 2026-11-18). */
    if (delta > 0 && line.agreedFrom === 'ticket') {
      const extra = JSON.parse(JSON.stringify(line));
      delete extra.agreed; delete extra.agreedFrom;
      extra.qty = delta; extra.remise = 0;
      ticket.lines.splice(index + 1, 0, extra);
      return;
    }
    line.qty = +line.qty + delta;
    if (line.qty <= 0) ticket.lines.splice(index, 1);
  },
  setCustomer(ticket, client) { ticket.client = client; },
  setSeller(ticket, seller) { ticket.seller = seller; },
  applyDiscount(ticket, approval) { ticket.remiseAuth = approval; },
  /* La remise de TICKET (peau 2027, bouton « Remise » du pied) descend sur
     chaque ligne : le pourcentage vit déjà là, et ticketTotals l'y additionne.
     Rien de neuf dans le calcul, rien de neuf dans la vente envoyée — c'est le
     chemin de la remise par article, appliqué d'un geste. */
  discountAllLines(ticket, pct) { ticket.lines.forEach((line) => { line.remise = pct; delete line.agreed; delete line.agreedFrom; }); },
  /* La même remise, sur UNE ligne (bouton « Remise » de la ligne : l'article scanné). */
  discountLine(ticket, index, pct) { const line = ticket.lines[index]; if (!line) return; line.remise = pct; delete line.agreed; delete line.agreedFrom; },
  /* Remise à la marocaine (bargain.js) : le prix convenu d'une pièce, posé ou
     retiré sur une ligne ; il remplace le pourcentage de cette ligne. */
  agreeLine(ticket, index, agreed) {
    const line = ticket.lines[index];
    if (!line) return;
    line.remise = 0;
    delete line.agreedFrom;
    if (agreed > 0) line.agreed = agreed; else delete line.agreed;
  },
  /* « Kolchi b 500 » : spreadTicket a réparti le total ; chaque entrée nomme
     sa ligne d'origine (key = index) et peut la couper en deux. */
  agreeTicket(ticket, assign) {
    /* Une ligne que la répartition n'a pas reçue (pièce offerte, prix 0) reste
       telle quelle : son stock est déjà sorti, elle doit rester sur la vente. */
    ticket.lines = ticket.lines.flatMap((line, i) => {
      const mine = assign.filter((a) => a.key === i);
      if (!mine.length) return [line];
      return mine.map((a) => Object.assign(JSON.parse(JSON.stringify(line)), { qty: a.qty, remise: 0, agreed: a.agreed, agreedFrom: 'ticket' }));
    });
  },
  applyReward(ticket, reward) { ticket.reward = reward; },
  reserveReward(ticket, ref) { return ticket.reward.reservation || (ticket.reward.reservation = { ref }); },
  acceptReward(intent) { intent.accepted = true; },
  removeReward(ticket) { delete ticket.reward; },
  numbering(ticket) { ticket.numbering = true; ticket.numError = false; },
  numbered(ticket, num, period) {
    ticket.num = num; ticket.period = period;
    ticket.numbering = false; ticket.numError = false;
  },
  numberReady(ticket) { ticket.numbering = false; ticket.numError = false; },
  numberFailed(ticket) { ticket.numbering = false; ticket.numError = true; },
  renewPeriod(ticket, period) { ticket.num = ''; ticket.period = period; },
  startReturn(state, exchange) { state.exchange = exchange; state.ret = null; },
};
export { ticketOwner };
