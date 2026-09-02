# Spécification · Déclaration Statistique & Télédéclaration des Nuitées (STDN)

**Domaine :** Kiwi Hôtel / Riad  
**Cadre juridique :** Loi n° 80-14 (BO n° 6404) & Décret n° 2-15-865 (BO n° 6488, Annexes 1 & 2)  
**Directives professionnelles :** Circulaires DRT / MGH (Édition Novembre 2024)  
**Statut :** **Sprint 0 — Découverte Administrative Consolidée (Sources Primaires Validées)**  
**Emplacement :** `docs/specs/HOTEL_TOURISM_REPORTING_SPEC.md`

---

## 1. Cadre Réglementaire & Réalité Opérale (Sources Primaires)

L'exploitation des textes officiels du Bulletin Officiel (Décret 2-15-865) et des manuels d'exploitation STDN clarifie la réglementation et la pratique administrative sur le terrain :

### A. Dédoublement Réglementaire Confirmé (MGH / DRT Novembre 2024)
* **La règle sur le terrain :** Le système STDN s'ajoute aux déclarations manuelles traditionnelles. Conformément aux directives de la Délégation Régionale du Tourisme (DRT) et de la DGSN/Gendarmerie Royale, **les établissements doivent maintenir les déclarations papier (bulletins et relevés statistiques mensuels) jusqu'à notification formelle d'une dispense**.
* **Configuration établissement requise dans Kiwi :**
  ```ts
  paperReportingStatus: 'paperReportingRequired' | 'paperReportingExempt' | 'unknown'
  ```
  Le relevé statistique mensuel photographié n'est donc ni obsolète ni purement exceptionnel : il demeure une obligation de routine active pour la majorité des établissements non dispensés.

### B. Le Formulaire Photographié vs. l'Annexe 2 du Décret
* **Annexe 2 officielle du Décret 2-15-865 :** Formulaire nominatif d'avarie (mode dégradé > 24h) listant par voyageur : date d'arrivée, date de départ, sexe, nationalité, mineurs < 18 ans, numéro de chambre.
* **Le document photographié :** Relevé statistique mensuel agrégé par nationalité et par jour calendaire (J1 à J31), exigé par les Délégations Provinciales du Tourisme pour le suivi économique de la fréquentation et le calcul du Taux d'Occupation.

### C. Dictionnaire des Données Voyageur STDN (Annexe 1 du Décret 2-15-865)
Le *bulletin individuel d'hébergement* légal et l'interface STDN imposent la collecte structurée des attributs suivants :

| Champ STDN | Caractère | Description / Format |
| :--- | :--- | :--- |
| `roomNumber` | Obligatoire | Numéro de la chambre attribuée |
| `lastName` & `firstName` | Obligatoire | Nom et prénom du voyageur |
| `sex` | Obligatoire | `M` ou `F` |
| `nationality` | Obligatoire | Nationalité (code ISO / libellé officiel) |
| `birthDate` | Obligatoire | Date de naissance (`YYYY-MM-DD`) |
| `residenceCountry` | Obligatoire | Pays de résidence habituelle (code ISO) |
| `minorsUnder15` | Obligatoire | Nombre d'enfants accompagnants < 15 ans |
| `minors15To18` | Obligatoire | Nombre d'enfants accompagnants entre 15 et 18 ans |
| `arrivalDate` | Obligatoire | Date effective d'arrivée |
| `expectedDepartureDate` | Obligatoire | Date prévue de départ |
| `idDocType` | Obligatoire | `CNIE`, `passeport`, `carte_sejour`, `autre` |
| `idDocNumber` | Obligatoire | Numéro de la pièce d'identité |
| `guestSignature` | Obligatoire | Émargement physique ou électronique |
| *Optionnels / Complémentaires* | Optionnel | Lieu de naissance, adresse, ville, profession, motif du voyage, canal de réservation |

---

## 2. Stratégie Produit Kiwi Hôtel

Au lieu de dépendre d'une API privée non documentée, Kiwi adopte la passerelle officielle documentée par le portail STDN : **l'import par fichier Excel journalier (`JJMMAAAAhhmm.xls`)**.

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
  • Génération fichier Excel STDN         • Si paperReportingRequired :
    Format : JJMMAAAAhhmm.xls               Relevé mensuel A4 officiel (1:1)
  • Téléversement assisté sur stdn.ma     • Calcul TO (brut/net) & DMS
  • Journalisation locale des dépôts :    • Snapshot append-only mensuel
    (nom fichier, timestamp, lignes,        avec audit lineage
    statut rejet/succès STDN)
```

### Avantages de l'Export Excel STDN :
1. **Officiel et Supporté :** Le portail STDN dispose d'un module natif d'import en masse sous *Espace pratique*, avec rapport de rejet/validation immédiat.
2. **Robustesse Immédiate :** Aucun risque de blocage lié à des modifications d'API non publiques ou à des révocations de reverse-engineering.
3. **Zéro ressaisie :** La réception exporte le fichier du jour en un clic depuis Kiwi et le dépose sur le portail STDN en 30 secondes.

---

## 3. Contacts Officiels des Délégations Régionales STDN

Pour toute clarification administrative ou demande de spécification technique, le Ministère du Tourisme a établi des points focaux dédiés :

* **Marrakech-Safi :** `stdn_marrakech@tourisme.gov.ma`
* **Casablanca-Settat :** `stdn_casablanca@tourisme.gov.ma`
* **Souss-Massa (Agadir) :** `stdn_agadir@tourisme.gov.ma`
* **Rabat-Salé-Kénitra :** `stdn_rabat@tourisme.gov.ma`
* **Tanger-Tétouan-Al Hoceima :** `stdn_tanger@tourisme.gov.ma`
* **Fès-Meknès :** `stdn_fes@tourisme.gov.ma`
* **Oriental (Oujda) :** `stdn_oujda@tourisme.gov.ma`
* **Béni Mellal-Khénifra :** `stdn_benimellal@tourisme.gov.ma`
* **Drâa-Tafilalet :** `stdn_errachidia@tourisme.gov.ma`
* **Dakhla-Oued Eddahab :** `stdn_dakhla@tourisme.gov.ma`
* **Guelmim-Oued Noun :** `stdn_guelmim@tourisme.gov.ma`
* **Laâyoune-Sakia El Hamra :** `stdn_laayoune@tourisme.gov.ma`

---

## 4. Tableau de Décision Sprint 0 — Éléments Tranchés & Reste à Fournir

| Dimension | Décision Validée | Source / Justification | Action Restante |
| :--- | :--- | :--- | :--- |
| **Schéma Voyageur** | Données complètes Annexe 1 Décret 2-15-865 + découpage mineurs (-15 / 15-18) | BO n° 6488 & Manuel STDN | Valider l'ordre exact des colonnes Excel |
| **Canal Déclaration Quotidienne** | Générateur de fichier Excel bulk `JJMMAAAAhhmm.xls` | Manuel STDN (*Espace pratique*) | Télécharger le template `.xls` depuis un compte actif |
| **Relevé Mensuel Photographié** | Maintenu sous condition `paperReportingRequired` | Directives DRT / MGH Nov 2024 | Confirmer le statut d'exemption du riad pilote |
| **Audit & Récépissés** | Historique local : nom fichier, horodatage, hash, statut d'intégration STDN | Spécification STDN | Récupérer 1 rapport d'intégration réel anonymisé |
| **Mode Panne Réseau (> 24h)** | Déposition bulletins physiques avant 8h (DGSN) + régularisation STDN sous 72h | Arts. 4 & 6 Décret 2-15-865 | Validé par les textes |

---

## 5. Règle d'Ingénierie Verrouillée

* **Code gelé :** Aucune modification de `hotel.js` ni de création de table D1 n'est autorisée.
* **Prochaine étape utile :** Télécharger le fichier modèle `.xls` et le guide technique depuis l'espace authentifié du riad pilote (ou par email auprès de `stdn_[region]@tourisme.gov.ma`), et vérifier si le riad bénéficie d'une dispense écrite pour le relevé papier.
