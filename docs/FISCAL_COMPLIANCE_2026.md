# Kiwi POS · Étude de Conformité Fiscale Marocaine (2026)

---

## 1. Cadre Réglementaire (CGI Art. 145 & DGI)

Conformément à l’article 145 du **Code Général des Impôts (CGI du Maroc)** et aux dispositions de la Direction Générale des Impôts (DGI) régissant les systèmes d'encaissement, les caisses enregistreuses et la facturation :

### A. Mentions Légales Obligatoires sur le Ticket / Facture Simplifiée
Pour tenir lieu de justificatif probant (opposabilité comptable, déductibilité et contrôle fiscal), tout ticket imprimé ou reçu électronique doit comporter de manière claire et lisible :

1. **Identité Complète du Vendeur / Établissement** :
   - Raison sociale ou nom commercial.
   - Adresse géographique exacte du point de vente.
   - **ICE** (Identifiant Commun de l’Entreprise - 15 chiffres, requis pour toute opération commerciale).
   - **IF** (Identifiant Fiscal).
   - **RC** (Numéro de Registre du Commerce + ville du tribunal).
   - **TP** (Taxe Professionnelle / Numéro de Patente).
   - *Optionnel mais d'usage* : N° d'affiliation CNSS.

2. **Identification & Traçabilité de l'Opération** :
   - **Numéro séquentiel chronologique continu et sans rupture** (ex: `YYYY-XXXXX`).
   - Date et heure précises de l'encaissement.
   - Identifiant du terminal / point d'encaissement (ex: `Caisse 01`).

3. **Ventilation des Lignes & TVA** :
   - Désignation explicite des articles ou prestations vendues (interdiction des libellés indéterminés de type « divers » ou « article » sans qualification).
   - Quantité, prix unitaire HT/TTC, montant de la ligne.
   - Taux de TVA applicable (0%, 7%, 10%, 14%, 20%) et montant ventilé de la taxe.
   - Montant total TTC en dirhams marocains (MAD).
   - Mode de règlement (Espèces, Carte Bancaire / CMI, Virement, Bon d'achat, etc.).

4. **Intégrité et Mentions Spéciales** :
   - **Réimpression** : Mention obligatoire et ostensible **« DUPLICATA »** avec horodatage de la réimpression (pour interdire l'utilisation d'une réimpression comme ticket initial frauduleux).
   - **Annulations et Retours** : Émission obligatoire d'un avoir / ticket d'annulation numéroté, lié à la référence du ticket d'origine.

---

## 2. Intégrité Informatique & Chaînage (Art. 145-IX CGI)

- **Inaltérabilité** : Les écritures enregistrées dans le grand livre ne peuvent être ni altérées, ni supprimées.
- **Piste d'Audit** : Conservation obligatoire des journaux d'encaissement et des clôtures journalières (Z de caisse) pendant 10 ans.
- **Continuité Séquentielle** : Les compteurs de tickets ne doivent présenter aucun trou de numérotation non justifié, même en cas de crash réseau ou de redémarrage système.

---

## 3. Alignement avec l'Architecture Kiwi POS

L'architecture actuelle de Kiwi POS intègre nativement ces exigences fondamentales :

| Exigence Fiscale | Implémentation Kiwi | Suite de Tests & Validation |
| :--- | :--- | :--- |
| **Numérotation séquentielle continue multi-caisse** | Plages réservées par caisse, réinitialisation annuelle, sans collision | `tools/ticket-sequence-test.mjs` (21 contrôles) |
| **Inaltérabilité du Grand Livre (CA/Ventes)** | Total consolidé inaltérable, neutralisation des arrondis, pas de recomposition inventée | `tools/kpi-ledger-test.js` (51 contrôles) |
| **Mentions Duplicata & Traçabilité** | Horodatage et numéro d'origine conservés, mention explicite « DUPLICATA », pas de double encaissement | `tools/pos-reprint-test.js` (31 contrôles) |
| **Gestion des Retours & Avoirs** | Échanges & avoirs reliés, traçabilité sur 7 jours et historique partagé | `tools/returns-sales-sync-test.js` (24 contrôles) |
| **Ventilation Marges & TVA** | Remises réparties au prorata, TVA ventilée réelle sans TVA fabriquée, coûts gelés à la vente | `tools/cost-margin-test.js` (96 contrôles) |
| **Isolation Multi-Établissement** | Séparation étanche des stocks, cartes et tickets par point de vente | `tools/stock-lookup-test.js`, `tools/menu-carte-store-test.js` |
