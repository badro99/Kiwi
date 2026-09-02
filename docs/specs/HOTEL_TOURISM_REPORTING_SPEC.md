# Spécification · Déclaration Statistique & Télédéclaration des Nuitées (STDN)

**Domaine :** Kiwi Hôtel / Riad  
**Cadre juridique :** Loi n° 80-14 (BO n° 6404) & Décret n° 2-15-865 (BO n° 6488, Annexes 1 & 2)  
**Sources professionnelles secondaires :** Guide professionnel MGH diffusé à la demande de la DRT (créé en 2022), à confirmer localement  
**Statut :** **Sprint 0 administratif ouvert · Sprint 1A technique autorisé en mode non réglementaire**  
**Emplacement :** `docs/specs/HOTEL_TOURISM_REPORTING_SPEC.md`

---

## 1. Cadre Réglementaire & Réalité Opérationnelle (Sources Primaires & Secondaires)

L'exploitation des textes officiels du Bulletin Officiel (Loi 80-14, Décret 2-15-865) et des guides d'exploitation STDN clarifie la réglementation et la pratique administrative sur le terrain :

### A. Dédoublement Réglementaire et Deux Régimes d'Exemption Distincts
* **Deux dispenses distinctes et indépendantes :**
  1. **Dispense Sûreté (DGSN / Gendarmerie Royale) :** Dispense de la tenue du registre papier et du dépôt physique des fiches de police individuelles (Loi 80-14, Art. 38).
  2. **Dispense Tourisme (Délégation du Tourisme) :** Dispense du dépôt du relevé statistique mensuel de fréquentation.
* **Configuration établissement requise dans Kiwi :**
  ```ts
  policePaperStatus: 'required' | 'exempt' | 'unknown'
  tourismMonthlyStatus: 'required' | 'exempt' | 'unknown'
  ```
  **Règle de sécurité opérationnelle :** Tant qu'une dispense écrite formelle n'a pas été enregistrée, toute valeur `'unknown'` est traitée opérationnellement comme `'required'` pour les deux statuts, évitant tout risque d'omission administrative.

### B. Distinction Rigoureuse : Annexe 2 Légale vs. Relevé Mensuel Statistique
L'Annexe 2 et le relevé photographié ne sont pas des alternatives substituables ; ce sont deux instruments administratifs distincts pouvant coexister sur une même période :
* **Annexe 2 officielle du Décret 2-15-865 (Formulaire d'avarie légal) :** Tableau nominatif d'avarie obligatoire en cas d'indisponibilité STDN > 24h non résorbée dans le mois (Décret 2-15-865, Art. 4), listant par voyageur : date d'arrivée, date de départ, sexe, nationalité, mineurs de moins de 18 ans, numéro de chambre.
* **Le document photographié (Relevé mensuel statistique de routine) :** Un relevé mensuel agrégé par nationalité et par jour calendaire (J1 à J31), exigé à titre de suivi statistique par les Délégations du Tourisme tant que l'établissement n'a pas reçu de dispense formelle (`tourismMonthlyStatus !== 'exempt'`). Sa maquette exacte acceptée localement doit être confirmée avec la délégation compétente.

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

## 2. Stratégie Produit & Architecture de Données

Au lieu de dépendre d'une API privée non documentée, Kiwi adopte la passerelle d'import par fichier du portail STDN (*Espace pratique*) adossée à une gouvernance stricte des données :

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
  • Génération fichier d'import agréé     • Si tourismMonthlyStatus !== 'exempt' :
    (Documentation historique :             Relevé mensuel conforme à l'usage local
     JJMMAAAAhhmm.xls ; production        • Si des arrivées restent non télédéclarées
     calquée sur le modèle actuel)          au terme du mois d'indisponibilité :
  • Téléversement assisté sur stdn.ma       Annexe 2 officielle (Décret Art. 4)
  • File locale chiffrée (outbox)         • Calcul TO (brut/net) & DMS
  • Registre d'audit serveur canonique      avec audit lineage
  • Rétention sécurisée en outbox
    jusqu'à confirmation d'intégration
```

### Principes d'Architecture & Sécurité :
1. **Modèle de Fichier d'Import :** La documentation historique utilise le motif `JJMMAAAAhhmm.xls` ; le nom de fichier de production, son extension (`.xls` ou `.xlsx`) et l'ordonnancement exact des colonnes doivent être strictement calqués sur le modèle actuellement agréé par le portail STDN.
2. **Cloisonnement du Stockage & Définition du « Transfert Confirmé » :**
   * **Poste local / tablette :** File temporaire chiffrée (*encrypted outbox*) pour le fonctionnement hors-ligne.
   * **Critères stricts de suppression locale :** Un fichier d'export généré localement n'est **jamais supprimé** sur simple téléchargement ou téléversement. Sa suppression de l'outbox locale intervient **exclusivement et cumulativement** lorsque :
     1. Le portail STDN a retourné un compte-rendu de traitement avec succès (sans rejet de lot ni d'anomalie bloquante) ;
     2. La preuve de traitement / rapport d'intégration a été consignée ;
     3. L'écriture d'audit canonique correspondante a été validée et enregistrée côté serveur.
     *Tout fichier rejeté ou en attente reste accessible et recouvrable dans la file chiffrée.*
   * **Serveur Kiwi :** Registre d'audit canonique append-only conservant nom de fichier, hash, horodatages, compteurs de lignes, statut de validation STDN et éventuelles corrections.
   * **Conservation légale des bulletins :** L'Article 38 de la Loi 80-14 impose la conservation des bulletins individuels d'hébergement pendant **un an (1 an)**. Les délais pour les métadonnées d'audit et exports restent à confirmer selon les normes fiscales et CNDP.
3. **Gestion Complète de l'Indisponibilité STDN (> 24 heures) :**
   * *Avarie quotidienne :* Dépôt des copies de bulletins individuels avant 8h du matin auprès de la DGSN/Gendarmerie (Décret 2-15-865, Art. 4).
   * *Régularisation mensuelle obligatoire :* Si toutes les arrivées du mois n'ont pas pu être télé-déclarées au cours du mois, dépôt de l'**Annexe 2 officielle du Décret 2-15-865** avant le 3ᵉ jour du mois suivant auprès des services extérieurs de l'administration chargée du tourisme (Art. 4).
   * *Régularisation électronique :* Transmission électronique de rattrapage sous 72 heures dès rétablissement du système (Art. 6).

---

## 3. Questionnaire du Sprint 0 (Auprès du Riad Pilote)

Avant d'écrire la moindre ligne de code dans `hotel.js` ou d'exécuter une migration, les réponses formelles aux questions suivantes doivent être obtenues :

1. **Compte STDN :** L'établissement pilote possède-t-il un compte actif sur le portail STDN (`stdn.ma`) ?
2. **Pratique Réelle :** L'établissement télé-déclare-t-il actuellement ses arrivées/départs tous les jours sur STDN ?
3. **Statut d'Exemption de l'Établissement :**
   * A-t-il reçu une dispense écrite de la DGSN/Gendarmerie pour les fiches de police ? (`policePaperStatus`)
   * A-t-il reçu une dispense écrite de la Délégation pour le relevé mensuel papier ? (`tourismMonthlyStatus`)
4. **Origine du Relevé Photographié :** Qui a remis ce formulaire spécifique, à quelle date, et sous quelle directive ?
5. **Modèle de Fichier Actuel :** Télécharger depuis l'*Espace pratique* du compte STDN le modèle officiel d'import actuel ainsi que sa notice technique.
6. **Rapports & Récépissés :** Obtenir un exemple réel anonymisé de rapport de traitement après import ou de récépissé de transmission.
7. **Procédure d'Avarie Locale :** Quelle est la procédure acceptée localement en cas d'indisponibilité du système STDN dépassant 24 heures ?

---

## 4. Tableau de Décision Sprint 0 (À Remplir)

| Règle / Dimension | Réponse Officielle | Autorité / Contact | Texte / Document Source | Date d'Effet |
| :--- | :--- | :--- | :--- | :--- |
| **Statut Dispense Police (`policePaperStatus`)** | *À renseigner* (défaut: `required`) | DGSN / Gendarmerie | Notification écrite | À confirmer |
| **Statut Dispense Tourisme (`tourismMonthlyStatus`)**| *À renseigner* (défaut: `required`)| Délégation Provinciale | Notification écrite | À confirmer |
| **Format du fichier d'import agréé** | *À renseigner (.xls / .xlsx)* | Portail STDN (*Espace pratique*) | Template officiel | À confirmer |
| **Convention de nommage et colonnes** | *Modèle actuel portail* (hist: JJMMAAAAhhmm.xls) | Portail STDN (*Espace pratique*) | Spécification technique | À confirmer |
| **Encodage nationalités / pays** | *Codes ISO ou Libellés en clair* | Portail STDN (*Espace pratique*) | Spécification technique | À confirmer |
| **Découpage des mineurs** | *Global < 18 (légal) ou -15 / 15-18*| Portail STDN (*Espace pratique*) | Annexe 1 Décret / Template| À confirmer |
| **Prise en compte de la signature client** | *Papier conservé ou émargement* | DGSN / STDN | Guide juridique | À confirmer |
| **Relevé mensuel statistique de routine** | *Modèle photographié ou modèle Délégation* | Délégation Provinciale | Formulaire fourni | À confirmer |
| **Formulaire d'avarie légal (mode dégradé > 24h)**| **Annexe 2 officielle du Décret** | Services extérieurs Tourisme | Art. 4 Décret 2-15-865 | À confirmer |
| **Conservation des bulletins individuels** | **1 an (Obligatoire)** | DGSN / Ministère | Art. 38 Loi 80-14 | Confirmé |
| **Conservation des métadonnées d'audit/fichiers**| *À renseigner (Fiscale / CNDP)* | CNDP / DGI | Code Commerce / Lois | À confirmer |

---

## 5. Règle d'Ingénierie Verrouillée

* **Autorisé sans les pièces STDN :** modèle interne normalisé, segments voyageurs/chambres, journal append-only sans PII, contrôles de complétude, permissions et écriture en ombre. Ces éléments ne dépendent ni de l'ordre des colonnes STDN ni de la maquette provinciale.
* **Toujours gelé :** sérialiseur STDN, calculs MRE/REM, règles mineurs/day-use, taux d'occupation réglementaire, clôture officielle, PDF/Excel/CSV administratif et toute migration de production.
* **Compatibilité :** tant que la table `hotel_stay_events` n'existe pas dans une base, le writer conserve le chemin historique `store_docs`. La migration fournie n'est pas appliquée automatiquement.
* **Prochaine preuve utile :** télécharger le modèle actuel et la notice technique depuis l'espace pratique du compte STDN du riad pilote, puis clarifier ses deux statuts d'exemption (`policePaperStatus` et `tourismMonthlyStatus`). Ces preuves débloquent les Sprints 4 et 5, pas le socle interne des Sprints 1 à 3.
