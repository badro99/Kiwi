# Audit Kiwi AI

## Phase 1a - inventaire des signaux reels

Date: 2026-08-21

Ce document precede volontairement toute regle proactive. Un signal n'est marque
`READY` que si le tableau de bord peut deja lire une source durable, rattachee au
bon commerce, avec les dimensions necessaires au calcul. `CONDITIONAL` signifie
que le calcul est possible uniquement quand sa couverture est mesurable.
`BLOCKED` signifie que l'information reste locale a une autre surface ou perd un
champ indispensable pendant sa synchronisation.

### Frontiere de transport actuelle

`assets/live-link.js` n'est pas un bus d'evenements operationnels general. Il
envoie les ventes de la caisse ou du serveur vers `/api/sale`, relit
`/api/feed`, puis hydrate `window.KiwiSales` dans le tableau de bord. Il relit
aussi l'etat des ventes sorties des livres, mais seulement sous forme de
references a retirer. Les autres domaines utilisent leurs propres documents ou
registres synchronises.

| Signal | Statut | Source de verite et chemin jusqu'au dashboard | Ce qui est calculable maintenant | Limite a respecter / plomberie minimale |
| --- | --- | --- | --- | --- |
| Baisse des ventes | READY | Table D1 `sales` via `functions/api/sale.js` -> `/api/feed` -> `assets/live-link.js` -> `window.KiwiSales` (`assets/venues.js`). La fenetre commerciale vient de `window.KiwiDayReport.cutoff()` (`assets/day-report.js`, 5 h par defaut) et `assets/dateRange.js` applique cette meme bascule. | CA, tickets et panier moyen par fenetre; comparaison d'une fenetre fermee a la fenetre precedente ou au meme segment J-7; volume d'evidence et periode exacte. | Ne rien emettre sans baseline complete. Le backfill Live Link est pagine et doit avoir atteint sa derniere page avant qu'une absence de ventes soit interpretee comme une baisse. |
| Stock bas / rupture | CONDITIONAL | Registre durable tenant-scope `assets/inventory-ledger.js` (`window.KiwiInventory.balance`, `history`, `between`) synchronise par son API; fiche article, seuil et fournisseurs dans le document cloud `stock` (`functions/api/store.js`, `assets/stock.js`). | Quantite courante contre seuil; ruptures; consommation recente et jours de couverture quand l'historique et le seuil existent. | Une quantite ou un seuil absent n'est pas zero. Supprimer le signal pour les articles non suivis et annoncer la couverture du calcul. Le lecteur AI existant dans `assets/agent-data.js` expose deja une vue stock, mais une alerte de vitesse doit lire le registre, pas une valeur de demonstration. |
| Erosion de marge | CONDITIONAL | Ventes et lignes horodatees dans `window.KiwiSales.list`; couts prives dans le document cloud `costs`; calcul canonique dans `window.KiwiCost.coverage()` et `marginOf()` (`assets/cost.js`). | Marge brute par periode et comparaison a une baseline, avec `revenueCosted` / `pctCosted` comme preuve de couverture. | Ne jamais completer les couts manquants par une marge par defaut. N'emettre que si les deux periodes ont une couverture suffisante et comparable; afficher cette couverture dans l'evidence. |
| Remises inhabituelles | BLOCKED | `kiwi-caisse.html` calcule la remise localement avec `discountAmountFor()`, puis `/api/sale` conserve le net encaisse, les lignes, la methode, le libelle, la reference, le canal et l'heure. Aucun montant brut, montant de remise, taux ou auteur n'atteint la ligne `sales`. | Rien de fiable: reconstruire une remise depuis le net et les prix actuels confondrait promotions, changements de prix et anciennes cartes. | Ajouter au payload de vente des champs bornes `grossAmountCents`, `discountAmountCents`, `discountReason` et `actorId`, les valider cote serveur, les stocker et les renvoyer dans `/api/feed`. |
| Annulations inhabituelles | BLOCKED | Live Link interroge `/api/feed?voids=1` et recoit une liste d'etat `{c, r}` (curseur, reference), puis retire ces ventes de `KiwiSales`. Le dashboard sait donc quelles ventes sont actuellement sorties, pas quand, pourquoi ni par qui elles ont ete annulees. | Suppression correcte des KPI, mais aucun taux d'annulation par periode ni anomalie par motif ou acteur. | Exposer des evenements d'annulation tenant-scopes avec `saleId/ref`, `voidedAt`, `reason`, `actorId` et montant. Conserver le flux d'etat actuel pour la reconciliation, ajouter un historique pour l'analyse. |
| Commandes en retard | BLOCKED | `kiwi-serveur.html` tient `tables[id].elapsed` en memoire et l'incremente chaque minute pour certains statuts. Les changements de table synchronisent surtout `status` et `ts`; l'addition vient de la file canonique. Aucun jalon durable commande envoyee -> prete -> servie n'est expose au dashboard AI. | La surface Serveur peut afficher un age approximatif de table pendant la session; le dashboard ne peut pas prouver un retard de preparation ou de service. | Ecrire des jalons serveur (`acceptedAt`, `sentAt`, `readyAt`, `servedAt`, `closedAt`) dans un registre de commandes tenant-scope et les rendre lisibles au dashboard. Ne pas reutiliser `elapsed`, qui se reinitialise aux transitions et au rechargement. |
| Trou dans le planning | CONDITIONAL | Document cloud `team` (`members`, `hours`, `shifts`) via `functions/api/store.js`; `window.KiwiTeam.roster()`, `daySnapshot()` et `bookingCoverage()` dans `assets/team.js`; horaires d'ouverture dans le document cloud `hours`. | Service ouvert sans personne planifiee; couverture par role; reservation sans membre de salle couvrant tout le creneau. | Planning incomplet et absence planifiee sont deux etats differents. N'emettre un trou que si le jour est configure/publie et les horaires d'ouverture existent. Les donnees personnelles restent reservees aux roles autorises. |
| Ecart de caisse | BLOCKED | `kiwi-caisse.html` garde `cashMovements[]`, calcule `drawerExpected()` et l'ecart de passation/Z, puis persiste l'etat de caisse localement. Ces donnees ne passent ni dans `/api/sale`, ni dans `/api/feed`, ni dans un document cloud lisible par le dashboard. | La caisse peut calculer son propre attendu et son ecart; Kiwi AI sur le dashboard ne peut pas les voir. | Creer un registre append-only tenant-scope de sessions de caisse et passations avec totaux attendus/comptes, ecart, mouvements motives, terminal, acteurs et heures. Proteger lecture et ecriture comme donnees financieres sensibles; une caisse appairee ne doit lire que sa session. |

### Ordre recommande pour les premieres regles

1. Baisse des ventes, car la source, la periode commerciale et le volume de preuve sont deja communs aux KPI.
2. Stock bas, avec suppression stricte quand quantite ou seuil manque.
3. Erosion de marge, uniquement avec une couverture de cout explicite.
4. Trou dans le planning, uniquement sur planning configure/publie.

Les remises, annulations, retards et ecarts de caisse ne doivent pas etre
simules a partir de donnees voisines. Ils restent bloques jusqu'a ce que leurs
faits minimaux soient durables et atteignent le dashboard.

### Invariants pour la suite

- Toute evidence porte commerce, periode, volume et source; aucun chiffre de demo dans une session reelle.
- L'absence de donnee n'est jamais transformee en zero.
- Les regles sont deterministes et testables; le modele explique, il ne fabrique pas le signal.
- Les couts, l'equipe, les actions AI et les futurs registres de caisse restent soumis aux redactions et refus d'ecriture des surfaces non autorisees.
- Aucun detector ne declenche une operation. Toute mutation passe par l'Action Center, la confirmation, les permissions serveur et la piste d'audit existantes.
