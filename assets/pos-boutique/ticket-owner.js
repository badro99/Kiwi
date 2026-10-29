/* Propriétaire des mutations du ticket. Les contrôles de stock et les effets
 * restent chez les appelants ; les opérations conservent les règles historiques. */
const ticketOwner = {
  clear(state, ticket) { state.ticket = ticket; },
  replaceLines(ticket, lines) { ticket.lines = lines; },
  prune(ticket, products) { ticket.lines = ticket.lines.filter(line => products[line.pid]); },
  addLine(ticket, line) {
    const same = ticket.lines.find(l => l.pid === line.pid && l.size === line.size && l.color === line.color && l.remise === line.remise);
    if (same) {
      same.qty += line.qty;
      if (line.promo && (!same.promo || line.promo.price < same.promo.price)) same.promo = line.promo;
    } else ticket.lines.push(line);
  },
  changeQuantity(ticket, index, delta) {
    const line = ticket.lines[index];
    line.qty = +line.qty + delta;
    if (line.qty <= 0) ticket.lines.splice(index, 1);
  },
  setCustomer(ticket, client) { ticket.client = client; },
  applyDiscount(ticket, approval) { ticket.remiseAuth = approval; },
  /* La remise de TICKET (peau 2027, bouton « Remise » du pied) descend sur
     chaque ligne : le pourcentage vit déjà là, et ticketTotals l'y additionne.
     Rien de neuf dans le calcul, rien de neuf dans la vente envoyée — c'est le
     chemin de la remise par article, appliqué d'un geste. */
  discountAllLines(ticket, pct) { ticket.lines.forEach((line) => { line.remise = pct; }); },
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
