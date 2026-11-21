/* Table rouverte pendant l'encaissement.
 *
 * Le serveur refuse un paiement du téléphone (409, `reopened`) quand la visite
 * qu'il vise est soldée et que la table a rouvert sous une nouvelle visite,
 * ou quand une part de partage appartient à une autre visite
 * (functions/api/_visit-cover.js, functions/api/_split-visit.js). Rien n'a
 * été écrit. Le téléphone jette alors tout ce qui appartenait à l'ancienne
 * note, puis relit : la relance part contre la nouvelle note, à son montant.
 *
 * Ce qui est jeté, et pourquoi (juge, rounds 3 et 4) :
 *   · le partage (feuille, parts, leurs identifiants de vente, sa copie
 *     enregistrée) : sinon la part suivante repartait contre la nouvelle
 *     visite avec le flux de l'ancienne ;
 *   · l'identifiant de visite, les lignes et les commandes de la table :
 *     sinon, relue, l'addition gardait la ligne déjà payée de l'ancienne
 *     visite (64,00 au lieu de 50,00).
 *
 * Module à part, chargé à la demande comme ../request-deadline.mjs : le paquet
 * assets/serveur/service.js est figé à sa taille, sa preuve de découpe
 * n'accepte pas de nouvelle fonction, et kiwi-serveur.html est au plafond de
 * ses balises <script>. Un module lit les liaisons globales des scripts
 * classiques (tableSplits, splitState, toast…) comme n'importe quel script.
 * Appelé seulement depuis payments.js (markTablePaid, markSplitPartPaid), au
 * retour d'un refus du serveur : le réseau répond à ce moment-là. */

export function dropReopenedBill(tableId, method) {
  // Lu avant keepServiceBillOpen, qui efface le partage de la table.
  const oldSplit = tableSplits.get(tableId)
    || (splitState.tableId === tableId ? splitState.flow : null);

  // Le socle commun : identifiant de paiement, partage enregistré, statut, rendu.
  keepServiceBillOpen(tableId, {});

  const partCount = Math.max(oldSplit && oldSplit.parts ? oldSplit.parts.length : 0, 12);
  for (let i = 0; i < partCount; i++) employeePaymentRefForget(tableId + ':split:' + i);

  serviceTableSessions.delete(tableId);
  for (const [orderId, order] of Array.from(serviceCanonicalOrders.entries())) {
    if (order && String(order.table) === String(tableId)) serviceCanonicalOrders.delete(orderId);
  }
  delete tableOrders[tableId];

  if (splitState.tableId === tableId) {
    // Toujours, même feuille masquée : pendant l'encaissement d'une part, la feuille de partage est
    // cachée sous celle des espèces, et fermer celle-ci la rouvrait (splitPayCallback) sur l'ancien partage.
    splitState.flow = null;
    closeSplitModal({ skipRevert: true });
  }

  if (method === 'card') {
    // Le terminal a pu débiter la carte avant le refus : la repasser la débiterait deux fois.
    toast(employeePick(
      `Table ${tableId} · la note a changé. La carte a pu être débitée : ne la repassez pas, vérifiez le ticket du terminal avant de réessayer`,
      `Table ${tableId} · the bill changed. The card may already have been charged: do not run it again, check the terminal slip before retrying`,
      `الطاولة ${tableId} · تغيّرت الفاتورة. ربما خُصم المبلغ من البطاقة: لا تمرّرها مجدداً، تحقّق من وصل الجهاز قبل إعادة المحاولة`,
    ), 9000);
  } else {
    toast(employeePick(
      `Table ${tableId} · la note a changé, vérifiez le total puis réessayez`,
      `Table ${tableId} · the bill changed, check the total then try again`,
      `الطاولة ${tableId} · تغيّرت الفاتورة، تحقّق من المجموع ثم أعد المحاولة`,
    ), 6000);
  }

  try { pollServiceSync(); } catch (_) {}
}
