/* ── UN NUMÉRO NE SE PREND QU'AU MOMENT D'ENCAISSER ────────────────────────
 * Le play-test Amira (2026-10-29) a sauté 22504 et 22563 sans aucun ticket
 * annulé : le numéro était pris À LA CRÉATION du panier, si bien qu'un « Vider
 * le ticket », un rechargement de la caisse ou un échange abandonné jetait un
 * numéro que personne n'encaisserait jamais. Le panier ouvert ne fait donc plus
 * que s'assurer qu'une série est prête (l'échec se voit toujours tout de suite,
 * sans rien consommer) ; le numéro est tiré quand la caissière encaisse
 * (checkout → assignTicketNumber).
 *
 * La série elle-même (plage serveur, bail en localStorage, verrou entre
 * onglets) reste dans pos-boutique.js ; `io` en passe les accès :
 *   demo, ensure() → Promise de bail, lock(work), lease() → bail relu,
 *   save() → bool, seq() / setSeq(n), sales() → journal, render(ticket). */
import { ticketOwner } from './ticket-owner.js?v=3';

export function prepareNumber(ticket, io) {
  if (io.demo || !ticket || ticket.num) return Promise.resolve(ticket && ticket.num);
  ticketOwner.numbering(ticket);
  return io.ensure().then(() => {
    if (!ticket.num) ticketOwner.numberReady(ticket);
    io.render(ticket);
    return '';
  }, (e) => {
    ticketOwner.numberFailed(ticket);
    io.render(ticket);
    throw e;
  });
}

/* Un numéro tiré puis abandonné (ticket vidé après un paiement fermé, échange
   annulé ou refusé) revient à la série s'il est encore le DERNIER tiré sur
   cette tablette : rien n'a pu l'imprimer ni l'envoyer. Si un autre onglet a
   déjà tiré le suivant, on ne touche à rien : un trou vaut mieux qu'un doublon. */
export function releaseNumber(num, io) {
  if (io.demo) return Promise.resolve(false);
  const n = parseInt(String(num || ''), 10);
  if (!Number.isInteger(n) || String(n) !== String(num)) return Promise.resolve(false);
  if (io.sales().some((s) => s && String(s.id) === String(n))) return Promise.resolve(false);
  return Promise.resolve(io.lock(() => {
    const lease = io.lease();
    if (!lease || +lease.next !== n + 1 || io.seq() > n + 1) return false;
    const previousSeq = io.seq();
    lease.next = n;
    io.setSeq(n);
    if (io.save()) return true;
    lease.next = n + 1;
    io.setSeq(previousSeq);
    return false;
  })).catch(() => false);
}
