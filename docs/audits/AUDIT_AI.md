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
## Phase 1d-a · historique durable des annulations

- Surface émettrice : `POST /api/sale/cancel`, appelée par la caisse depuis la
  réimpression et par le dashboard propriétaire. La caisse envoie uniquement
  `{merchant,id,source,pin,reason}` ; le PIN sert à l'autorisation existante et
  n'entre jamais dans l'historique. `actorId` vient de l'identité vérifiée côté
  serveur. `ref` et `amountCents` viennent de la vente D1, jamais du client.
- Fait durable : `{id,merchant,saleId,ref,voidedAt,reason,actorId,amountCents}`
  dans `sale_void_history`. Toutes les lectures filtrent `merchant`; aucune API
  de modification ou suppression n'est exposée.
- Panne backend / migration : l'état `sales.void_*` et le flux `{c,r}` restent
  la réconciliation canonique. L'écriture analytique est fail-soft après le
  marquage de la vente : son échec n'annule pas la décision et ne bloque jamais
  un encaissement. Le dashboard omet simplement le signal sans faits durables.
- Migration D1 additive appliquée à `kiwi-sales` après inspection de
  `sqlite_master` (aucune ligne commerçant lue) :

```sql
CREATE TABLE IF NOT EXISTS sale_void_history (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  sale_id TEXT NOT NULL,
  ref TEXT NOT NULL DEFAULT '',
  voided_ts INTEGER NOT NULL,
  reason TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  UNIQUE (merchant, sale_id)
);
CREATE INDEX IF NOT EXISTS idx_sale_void_history_merchant_ts
  ON sale_void_history (merchant, voided_ts);
```
## Phase 1d-b · remises durables sur la vente

- Surface émettrice : `kiwi-caisse.html` au point de vérité `recordSale()`, puis
  la file durable de `assets/live-link.js`. Le payload optionnel est
  `{grossAmountCents,discountAmountCents,discountReason,actorId}`. Le brut vient
  des lignes figées, la remise vaut `brut-net`, le motif est l'enum
  `commercial|loyal-customer|kitchen-error|other`, et l'acteur est l'id du
  responsable vérifié, jamais son code ni son nom.
- Validation serveur : entiers bornés, `discountAmountCents <=
  grossAmountCents`, motif dans l'enum, identifiant borné et non assimilable à
  quatre chiffres. `/api/feed` renvoie ces quatre faits avec la vente tenantée.
- Panne backend / schéma en retard : la caisse persiste d'abord le ticket et son
  outbox. `/api/sale` retombe sur l'INSERT historique sans les colonnes
  optionnelles si la migration manque; l'encaissement n'attend jamais la
  télémétrie. Le signal reste absent tant que ces faits ne sont pas relus.
- Migration D1 additive appliquée à `kiwi-sales` après `PRAGMA
  table_info(sales)` (aucune ligne commerçant lue) :

```sql
ALTER TABLE sales ADD COLUMN gross_amount_cents INTEGER;
ALTER TABLE sales ADD COLUMN discount_amount_cents INTEGER;
ALTER TABLE sales ADD COLUMN discount_reason TEXT;
ALTER TABLE sales ADD COLUMN discount_actor_id TEXT;
```

## Phase 1d-c · registre append-only des sessions de caisse

- Surface émettrice : `kiwi-caisse.html`, aux quatre points de vérité déjà
  transactionnels dans l'interface : ouverture du service, mouvement motivé,
  passation confirmée et clôture après comptage. Le payload est
  `{id,merchant,sessionId,terminalId,eventType,expectedCents,countedCents,gapCents,
  movementKind,movementAmountCents,movementReason,actorId,counterpartyActorId,
  openedAt,occurredAt}`. Les acteurs sont des ids de l'équipe, jamais un code.
- Liaison terminal : `/api/pair/redeem` reçoit l'id opaque et stable du terminal
  et pose un second cookie HttpOnly signé. Une caisse appairée ne peut lire et
  écrire que les événements dont `merchant`, `terminal_id` ET `session_id`
  correspondent à sa preuve et à sa requête. Le cookie marchand historique
  reste inchangé pour toutes les routes de vente existantes. Une caisse déjà
  appairée amorce cette seconde preuve à sa première écriture uniquement si son
  cookie marchand est valide et qu'aucun cookie terminal n'existe déjà; une
  preuve terminal existante mais différente est refusée.
- Protection financière : propriétaire et opérateur nommé lisent le registre
  tenant-scope. Toute lecture moins privilégiée renvoie une vue vide marquée
  `redacted`; toute écriture correspondante est refusée. Le registre n'expose
  aucune route de modification ou suppression.
- Panne backend : chaque événement entre d'abord dans une outbox locale bornée,
  puis part sans `await`; ouverture, mouvement, passation, clôture et vente ne
  dépendent jamais du réseau. Les retries gardent le même `id` et l'INSERT
  idempotent ignore le doublon. Le dashboard omet le signal tant que la lecture
  durable n'est pas prête.
- Migration D1 additive à appliquer à `kiwi-sales` après inspection de
  `sqlite_master` (aucune ligne commerçant lue) :

```sql
CREATE TABLE IF NOT EXISTS cash_session_events (
  id TEXT PRIMARY KEY,
  merchant TEXT NOT NULL,
  session_id TEXT NOT NULL,
  terminal_id TEXT NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('open','movement','handover','close')),
  expected_cents INTEGER,
  counted_cents INTEGER,
  gap_cents INTEGER,
  movement_kind TEXT,
  movement_amount_cents INTEGER,
  movement_reason TEXT,
  actor_id TEXT NOT NULL,
  counterparty_actor_id TEXT,
  opened_ts INTEGER NOT NULL,
  occurred_ts INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_merchant_ts
  ON cash_session_events (merchant, occurred_ts);
CREATE INDEX IF NOT EXISTS idx_cash_session_events_terminal_session
  ON cash_session_events (merchant, terminal_id, session_id, occurred_ts);
```

## Phase 1d-d · jalons durables du parcours commande

- Surface émettrice : `kiwi-serveur.html` conserve son payload canonique vers
  `/api/order/queue` : création
  `{merchant,create:true,mode,table,lines,ref,server}`, transition
  `{merchant,id,status,server,paid}` et fermeture
  `{merchant,closeSession|closeTable,closedBy}`. Le premier envoi accepté est
  aujourd'hui aussi l'envoi cuisine : `acceptedAt` et `sentAt` reçoivent donc le
  même instant serveur, sans inventer une étape intermédiaire. KDS écrit
  `readyAt`, le serveur écrit `servedAt`, la session canonique écrit `closedAt`.
- Fait durable : une ligne par `{merchant,orderId}` dans `order_course`, avec
  `acceptedAt`, `sentAt`, `readyAt`, `servedAt`, `closedAt`. Chaque jalon est
  posé une seule fois avec `COALESCE`; aucun nom client, contenu de commande,
  montant ou compteur `elapsed` n'entre dans ce registre.
- Panne backend / migration : la copie analytique est appelée sous `try/catch`
  seulement APRÈS la création ou transition canonique réussie. Une table absente
  omet donc le signal mais ne peut ni refuser une commande, ni retarder la
  cuisine, ni bloquer la caisse ou une vente. Aucun appel de télémétrie
  supplémentaire n'est attendu par le serveur ou le terminal.
- Lecture et règle : `/api/order-course` est tenant-scope et lecture seule pour
  le dashboard autorisé. La règle compare séparément les médianes `sent→ready`
  et `ready→served` de la dernière journée fermée à la baseline propre au lieu
  sur 28 jours; manager et propriétaire seulement, jamais de signal sans au
  moins 3 commandes courantes et 5 comparables.
- Migration D1 additive à appliquer à `kiwi-sales` après inspection de
  `sqlite_master` (aucune ligne commerçant lue) :

```sql
CREATE TABLE IF NOT EXISTS order_course (
  merchant TEXT NOT NULL,
  order_id TEXT NOT NULL,
  order_number INTEGER,
  accepted_ts INTEGER,
  sent_ts INTEGER,
  ready_ts INTEGER,
  served_ts INTEGER,
  closed_ts INTEGER,
  created_ts INTEGER NOT NULL,
  updated_ts INTEGER NOT NULL,
  PRIMARY KEY (merchant, order_id)
);
CREATE INDEX IF NOT EXISTS idx_order_course_merchant_sent
  ON order_course (merchant, sent_ts);
```
