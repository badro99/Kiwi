# Spécification · Déclaration Statistique & Télédéclaration des Nuitées (STDN)

**Domaine :** Kiwi Hôtel / Riad  
**Cadre juridique :** Loi n° 80-14 (BO n° 6404) & Décret n° 2-15-865 (BO n° 6488, Annexes 1 & 2)  
**Sources professionnelles secondaires :** Guide professionnel MGH diffusé à la demande de la DRT (créé en 2022), à confirmer localement  
**Statut :** **Sprint 0 — Découverte Administrative Consolidée (Corrections Légales Intégrées)**  
**Emplacement :** `docs/specs/HOTEL_TOURISM_REPORTING_SPEC.md`

---

## 1. Cadre Réglementaire & Réalité Opérale (Sources Primaires & Secondaires)

L'exploitation des textes officiels du Bulletin Officiel (Décret 2-15-865) et des guides d'exploitation STDN clarifie la réglementation et la pratique administrative sur le terrain :

### A. Dédoublement Réglementaire et Deux Régimes d'Exemption Distincts
* **Deux dispenses distinctes et indépendantes :**
  1. **Dispense Sûreté (DGSN / Gendarmerie Royale) :** Dispense de la tenue du registre papier et du dépôt physique des fiches de police individuelles.
  2. **Dispense Tourisme (Délégation du Tourisme) :** Dispense du dépôt du relevé statistique mensuel de fréquentation.
* **Configuration établissement requise dans Kiwi :**
  ```ts
  policePaperStatus: 'required' | 'exempt' | 'unknown'
  tourismMonthlyStatus: 'required' | 'exempt' | 'unknown'
  ```
  Le relevé statistique mensuel n'est pas globalement caduc : il continue d'être exigé tant que `tourismMonthlyStatus` n'a pas fait l'objet d'une dispense notifiée par l'autorité touristique compétente.

### B. Statut du Formulaire Photographié
* **Annexe 2 officielle du Décret 2-15-865 :** Tableau nominatif d'avarie (mode dégradé > 24h) listant par voyageur : date d'arrivée, date de départ, sexe, nationalité, mineurs de moins de 18 ans, numéro de chambre.
* **Le document photographié :** Un relevé mensuel agrégé semblant émaner d'une Délégation du Tourisme ; sa provenance exacte, son applicabilité réglementaire actuelle et la maquette formellement acceptée restent en attente de confirmation auprès du riad pilote et de sa délégation.

### C. Dictionnaire des Données Voyageur STDN (Annexe 1 du Décret 2-15-865)
Le *bulletin individuel d'hébergement* légal et l'interface STDN prévoient les attributs suivants :

| Champ STDN | Référence Légale / Statut | Description / Précisions |
| :--- | :--- | :--- |
| `roomNumber` | Annexe 1 Décret | Numéro de la chambre attribuée |
| `lastName` & `firstName` | Annexe 1 Décret | Nom et prénom du voyageur |
| `sex` | Annexe 1 Décret | Sexe du voyageur (`M` ou `F`) |
| `nationality` | Annexe 1 Décret | Nationalité (format texte ou code selon modèle portail) |
| `birthDate` | Annexe 1 Décret | Date de naissance (`YYYY-MM-DD`) |
| `residenceCountry` | Annexe 1 Décret | Pays de résidence habituelle (format selon modèle portail) |
| `minorsUnder18` | Annexe 1 Décret | Nombre d'enfants mineurs de moins de 18 ans |
| *`minorsUnder15` & `minors15To18`* | *Comportement historique portail* | Distinction observée sur l'ancienne interface, à valider sur le modèle actuel |
| `arrivalDate` | Annexe 1 Décret | Date d'arrivée |
| `expectedDepartureDate` | Annexe 1 Décret | Date prévue de départ |
| `idDocType` | Annexe 1 Décret | Type de pièce (`CNIE`, `passeport`, `titre_sejour`, `autre`) |
| `idDocNumber` | Annexe 1 Décret | Numéro de la pièce d'identité présentée |
| `clientSignature` | Annexe 1 Décret | Signature du client (validité juridique d'une signature électronique à confirmer) |
| *Optionnels / Complémentaires* | Annexe 1 Décret | Lieu de naissance, adresse, ville, profession, motif du voyage, canal de réservation |

---

## 2. Stratégie Produit Kiwi Hôtel

Au lieu de dépendre d'une API privée non documentée, Kiwi adopte la passerelle d'import par fichier du portail STDN (*Espace pratique*) :

```
                        SAISIE CHECK-IN KIWI HÔTEL
           (Champs complets de l'Annexe 1 : Identité, Résidence, Mineurs)
                                     │
                                     ▼
                     CONTRÔLE DE COHÉRENCE MATINAL
             (0 anomalie : pièces complètes, départs clôturés)
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
    [ MODULE QUOTIDIEN STDN ]               [ MODULE STATISTIQUES MENSUELLES ]
  • Génération fichier Excel agréé        • Si tourismMonthlyStatus !== 'exempt' :
    Format : JJMMAAAAhhmm.[xls/xlsx]        Relevé mensuel conforme à l'usage local
  • Téléversement assisté sur stdn.ma     • Calcul TO (brut/net) & DMS
  • Journalisation locale des dépôts :    • Snapshot append-only mensuel
    (nom fichier, timestamp, lignes,        avec audit lineage
    statut rejet/succès STDN)
```

### Principes Directeurs :
1. **Modèle Excel Agréé :** Kiwi générera le fichier dans le format de modèle Excel actuellement agréé par le portail STDN (`.xls` ou `.xlsx`), selon le fichier source extrait de l'espace pratique.
2. **Encadrement des Formats de Pays :** Le codage (codes ISO vs libellés en clair) sera calqué strictement sur les listes déroulantes du modèle officiel STDN une fois obtenu.
3. **Assistance à l'Export :** La réception exporte le fichier du jour en un clic et le dépose sur le portail STDN, en conservant le rapport de traitement et les éventuels récépissés.
4. **Gestion de l'Indisponibilité STDN :** En cas d'indisponibilité du système STDN dépassant 24 heures, application de la procédure légale (dépôt des copies de bulletins avant 8h à la DGSN/Gendarmerie, et régularisation électronique sous 72h après rétablissement).

---

## 3. Questionnaire Révisé du Sprint 0 (Auprès du Riad Pilote)

Avant d'écrire la moindre ligne de code dans `hotel.js` ou d'exécuter une migration, les réponses formelles aux questions suivantes doivent être obtenues :

1. **Compte STDN :** L'établissement pilote possède-t-il un compte actif sur le portail STDN (`stdn.ma`) ?
2. **Pratique Réelle :** L'établissement télé-déclare-t-il actuellement ses arrivées/départs tous les jours sur STDN ?
3. **Statut d'Exemption de l'Établissement :**
   * A-t-il reçu une dispense écrite de la DGSN/Gendarmerie pour les fiches de police ? (`policePaperStatus`)
   * A-t-il reçu une dispense écrite de la Délégation pour le relevé mensuel papier ? (`tourismMonthlyStatus`)
4. **Origine du Relevé Photographié :** Qui a remis ce formulaire spécifique, à quelle date, et sous quelle directive ?
5. **Modèle Excel Officiel :** Télécharger depuis l'*Espace pratique* du compte STDN le modèle de fichier d'import actuel ainsi que sa notice technique.
6. **Rapports & Récépissés :** Obtenir un exemple réel anonymisé de rapport de traitement après import ou de récépissé de transmission.
7. **Procédure d'Avarie Locale :** Quelle est la procédure acceptée localement en cas d'indisponibilité du système STDN dépassant 24 heures ?

---

## 4. Tableau de Décision Sprint 0 (À Remplir)

| Règle / Dimension | Réponse Officielle | Autorité / Contact | Texte / Document Source | Date d'Effet |
| :--- | :--- | :--- | :--- | :--- |
| **Statut Dispense Police (`policePaperStatus`)** | *À renseigner* | DGSN / Gendarmerie | Notification écrite | À confirmer |
| **Statut Dispense Tourisme (`tourismMonthlyStatus`)**| *À renseigner* | Délégation Provinciale | Notification écrite | À confirmer |
| **Format du modèle Excel agréé** | *À renseigner (.xls / .xlsx)* | Portail STDN (*Espace pratique*) | Template officiel | À confirmer |
| **Encodage nationalités / pays** | *Codes ISO ou Libellés en clair* | Portail STDN (*Espace pratique*) | Spécification technique | À confirmer |
| **Découpage des mineurs** | *Global < 18 ou détail -15 / 15-18* | Portail STDN (*Espace pratique*) | Template officiel | À confirmer |
| **Prise en compte de la signature client** | *Papier conservé ou émargement* | DGSN / STDN | Guide juridique | À confirmer |
| **Maquette acceptée du relevé mensuel** | *Modèle photographié ou autre* | Délégation Provinciale | Formulaire fourni | À confirmer |
| **Procédure indisponibilité STDN > 24h** | *Procédure Décret Art. 4 & 6* | DGSN / Délégation | Arts. 4 & 6 Décret 2-15-865 | À confirmer |
| **Délai de conservation légale** | *À renseigner (CNDP / Fiscale / Police)* | CNDP / DGSN | Lois 09-08 / 80-14 | À confirmer |

---

## 5. Règle d'Ingénierie Verrouillée

* **Code gelé :** Aucune modification de `hotel.js` ni de création de table D1 n'est autorisée.
* **Prochaine étape utile :** Télécharger le fichier modèle Excel actuellement agréé et la notice technique depuis l'espace pratique du compte STDN du riad pilote, et clarifier ses deux statuts d'exemption (`policePaperStatus` et `tourismMonthlyStatus`).
