# Kiwi POS · Étude Préliminaire de Conformité Fiscale Marocaine (2026)

> [!CAUTION]
> ### Avertissement Légal & Périmètre de l'Étude (17 Août 2026)
> - **Nature du document** : Ce document est une synthèse documentaire préliminaire (*desk research*), réalisée le **17 août 2026**, à des fins de cadrage technique et architectural.
> - **Absence de conseil juridique ou fiscal** : Cette étude **ne constitue en aucun cas un avis juridique, fiscal ou comptable**, ni une certification de conformité réglementaire.
> - **Validation professionnelle obligatoire** : Toutes les exigences, règles de facturation, taux applicables et obligations de traçabilité **doivent impérativement être validés par un expert-comptable inscrit à l'Ordre des Experts-Comptables (OEC) du Maroc ou par un conseiller fiscal habilité** avant toute implémentation logicielle définitive ou communication commerciale engageante.
> - **Sources consultées** :
>   - *Code Général des Impôts (CGI) du Royaume du Maroc* – Direction Générale des Impôts (DGI) : [https://portail.tax.gov.ma](https://portail.tax.gov.ma) (notamment Article 145 relatif aux obligations comptables, systèmes d'encaissement et facturation, et Article 211 relatif aux délais de conservation).
>   - *Circulaires et notes de doctrine de la DGI* régissant les mentions obligatoires et la tenue des registres de caisse.
>   - *Synthèses documentaires secondaires* relatives aux pratiques de facturation et aux normes d'encaissement au Maroc.

---

## 1. Cadre Réglementaire Présumé (CGI Art. 145 & DGI)

Sur la base des textes du Code Général des Impôts (CGI) et de la doctrine fiscale marocaine :

### A. Mentions Requises sur le Ticket de Caisse / Facture Simplifiée
Pour constituer une pièce justificative probante (opposabilité comptable et contrôle fiscal), tout reçu ou ticket émis doit comporter les mentions d'identification suivantes :

1. **Identité Complète de l'Émetteur** :
   - Raison sociale ou dénomination commerciale.
   - Adresse géographique du point de vente.
   - **ICE** (Identifiant Commun de l’Entreprise - format standard à 15 chiffres).
   - **IF** (Identifiant Fiscal).
   - **RC** (Numéro de Registre du Commerce et tribunal compétent).
   - **TP** (Taxe Professionnelle / Numéro de Patente).
   - *Optionnel / Pratique courante* : N° d'affiliation CNSS.

2. **Identification & Chronologie de l'Opération** :
   - **Numéro séquentiel chronologique ininterrompu** : L'obligation légale fondamentale (Art. 145 CGI) impose une **série continue et sans rupture chronologique**.
     > *Note d'ingénierie* : Le format de type `YYYY-XXXXX` utilisé par Kiwi POS est un choix d'implémentation interne (segmentation annuelle et réservation de plages par caisse) pour respecter cette exigence, et non un format imposé par le texte de loi lui-même.
   - Date et heure précises de la transaction.
   - Identifiant du terminal ou de la caisse (ex: `Caisse 01`).

3. **Ventilation des Lignes & TVA (Taux au 17 août 2026)** :
   - Désignation claire des articles ou prestations (proscription des mentions génériques indéterminées).
   - Quantité, prix unitaire, total de la ligne.
   - **Taux de TVA applicables** (selon CGI / Loi de Finances en vigueur au 17 août 2026 : taux normal de 20%, taux réduits de 0%, 7%, 10%, 14% selon les catégories ; **attention : ces taux sont assujettis aux révisions annuelles des Lois de Finances**).
   - Montant ventilé de la TVA et montant total TTC en dirhams marocains (MAD).
   - Mode de règlement (Espèces, Carte Bancaire / CMI, Virement, etc.).

4. **Traçabilité & Opérations Particulières** :
   - **Réimpressions** : Marquage ostensible **« DUPLICATA »** avec horodatage de réimpression pour interdire tout usage frauduleux d'une copie comme reçu initial.
   - **Annulations et Avoirs** : Émission d'un avoir / ticket d'annulation numéroté, rattaché explicitement à la référence du ticket initial.

---

## 2. Intégrité Informatique & Archivage

- **Inaltérabilité du Grand Livre (Art. 145-IX CGI)** : Les écritures de vente enregistrées ne doivent pouvoir faire l'objet d'aucune modification ni suppression unilatérale.
- **Délai d'Archivage (Art. 211 CGI)** : Conservation obligatoire des journaux d'encaissement et des clôtures périodiques (tickets Z journaliers) pendant une durée légale de **10 ans**.
- **Chaînage Cryptographique** : Non encore implémenté à ce stade (à concevoir en concertation avec les experts fiscaux lors de la phase d'homologation).

---

## 3. État des Lieux de l'Architecture Kiwi POS

Les mécanismes actuels de Kiwi POS fournissent un socle technique répondant aux règles de cohérence de base :

| Domaine Technique | Choix d'Implémentation Kiwi | Suite de Tests & Contrôles |
| :--- | :--- | :--- |
| **Continuité de Numérotation Multi-Caisse** | Plages réservées par caisse, réinitialisation annuelle, détection de collisions | `tools/ticket-sequence-test.mjs` (21 contrôles) |
| **Inaltérabilité du Grand Livre (Ventes/CA)** | Total consolidé inaltérable, neutralisation des arrondis | `tools/kpi-ledger-test.js` (51 contrôles) |
| **Traçabilité des Réimpressions** | Conservation du numéro et de l'horodatage initial, mention « DUPLICATA », pas de double enregistrement | `tools/pos-reprint-test.js` (31 contrôles) |
| **Gestion des Retours & Avoirs** | Échanges & avoirs reliés sur 7 jours avec historique unifié | `tools/returns-sales-sync-test.js` (24 contrôles) |
| **Calcul et Ventilation Marges / TVA** | Remises réparties au prorata, TVA ventilée réelle, coûts figés à la vente | `tools/cost-margin-test.js` (96 contrôles) |
| **Cloisonnement Établissements** | Isolation stricte des stocks, cartes et tickets par point de vente | `tools/stock-lookup-test.js`, `tools/menu-carte-store-test.js` |
