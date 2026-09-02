# Spécification · Déclaration Statistique & Télédéclaration des Nuitées (STDN)

**Domaine :** Kiwi Hôtel / Riad  
**Cadre juridique :** Loi n° 80-14 (BO n° 6404, Arts. 36–38 & 56) & Décret n° 2-15-865 (BO n° 6488, Arts. 1, 4 & 6)  
**Statut :** **Sprint 0 — Découverte Administrative Verrouillée**  
**Emplacement :** `docs/specs/HOTEL_TOURISM_REPORTING_SPEC.md`

---

## 1. Cadre Légal et Rôles des Autorités (Sources Primaires)

L'analyse directe des textes officiels publiés au Bulletin Officiel établit la hiérarchie juridique et la répartition exacte des rôles administratifs :

### A. Loi n° 80-14 relative aux établissements touristiques (BO n° 6404)
* **Article 36 :** L'exploitant d'un établissement d'hébergement touristique est tenu de déclarer **dès leur arrivée, par voie électronique**, les données relatives à ses clients auprès de « l'administration ».
* **Article 37 :** Chaque client doit présenter un document d'identité et renseigner et signer un **bulletin individuel d'hébergement**, dont le modèle est fixé par voie réglementaire.
* **Article 38 :** Les établissements procédant à cette déclaration électronique sont expressément **dispensés de la tenue du registre papier et du dépôt physique des bulletins individuels** (fiches de police).
* **Article 56 :** Le régime transitoire de transmission mensuelle sur support papier était expressément limité à une durée de deux ans suivant la publication du décret d'application.

### B. Décret n° 2-15-865 (BO n° 6488) — Attribution des Rôles & Procédure d'Avarie
* **Article 1 (Attribution des rôles, arrivées et départs) :**
  * La transmission électronique quotidienne des données relatives aux **arrivées et aux départs** des clients est effectuée auprès du **service compétent de la Direction Générale de la Sûreté Nationale (DGSN) ou de la Gendarmerie Royale**.
  * L'administration chargée du tourisme reçoit les **données statistiques générées à travers ce système électronique**.
* **Article 4 (Indisponibilité technique > 24 heures) :**
  * En cas d'indisponibilité du système électronique excédant 24 heures empêchant la télé-déclaration, l'exploitant doit déposer des copies des bulletins individuels d'hébergement **avant 8 heures du matin** auprès du service compétent de la DGSN ou de la Gendarmerie Royale.
  * Si l'ensemble des arrivées concernées n'a pas pu être télé-déclaré au cours du mois, l'exploitant doit déposer le **relevé mensuel sur formulaire papier avant le 3ᵉ jour du mois suivant** auprès des **services extérieurs de l'administration chargée du tourisme** (Délégation Provinciale / Régionale du Tourisme).
* **Article 6 (Régularisation post-rétablissement) :**
  * Dès rétablissement du système électronique, l'exploitant est tenu de procéder à la transmission électronique de l'ensemble des données des déclarations non transmises dans un **délai de 72 heures**.

### C. Requalification du Formulaire Photographié
Le document papier photographié correspond soit au **formulaire d'indisponibilité prescrit par l'Article 4 du Décret 2-15-865**, soit à une pratique administrative locale persistante. Son usage doit être confirmé auprès du riad pilote avant toute hypothèse de conception.

---

## 2. Réalignement Produit pour Kiwi Hôtel

Le produit ne doit pas être conçu autour d'un formulaire papier mensuel obsolète ou de secours, mais autour du flux électronique officiel :

```
                        SAISIE FRONT-DESK / CHECK-IN
          (Données complètes du bulletin individuel d'hébergement)
                                     │
                                     ▼
                     CONTRÔLE DE COHÉRENCE QUOTIDIEN
                (Badge de déblocage : 0 donnée manquante)
                                     │
                 ┌───────────────────┴───────────────────┐
                 ▼                                       ▼
       [ FLUX NOMINAL (STDN) ]               [ FLUX SECOURS / AUDIT ]
     • Assistance saisie ou export STDN    • Relevé mensuel A4 (Art. 4)
     • Transmission directe si API confirmée • File locale chiffrée (offline)
     • Récépissés conservés si fournis     • Archive canonique append-only (serveur)
```

### Priorités d'Implémentation Révisées :
1. **Priorité 1 — Schéma Voyageur STDN Réel :** Capture sécurisée de l'ensemble des attributs du *bulletin individuel d'hébergement* prescrits par le STDN (nationalité et pays de résidence habituelle sont nécessaires mais **non suffisants** ; identité, document de voyage et dates sont requis). Le schéma final dépend du cahier des charges STDN obtenu au Sprint 0.
2. **Priorité 2 — Écran d'Audit Quotidien :** Détection matinale des omissions bloquantes avant transmission.
3. **Priorité 3 — Préparation et Export Assisté STDN :** Assistance à la saisie ou export, selon les capacités confirmées du portail STDN. La transmission directe n'est envisageable que si une interface officielle documentée et une habilitation formelle sont confirmées. Conservation des récépissés de transmission, si le STDN en fournit.
4. **Priorité 4 — Formulaire A4 de Secours :** Moteur d'export du formulaire photographié réservé au mode dégradé (panne > 24h non résorbée dans le mois conformément à l'Art. 4, ou demande spécifique de la délégation).
5. **Principe d'Archivage :** Une tablette ou un navigateur local ne doit jamais constituer l'archive de référence pour les données sensibles d'identité ; le stockage local reste strictement limité à une file chiffrée temporaire pour le fonctionnement hors-ligne, tandis que l'archive append-only canonique réside côté serveur.

---

## 3. Questionnaire du Sprint 0 (Auprès du Riad Pilote)

Avant d'écrire la moindre ligne de code dans `hotel.js` ou d'exécuter une migration, les réponses formelles aux questions suivantes doivent être obtenues :

1. **Compte STDN :** L'établissement pilote possède-t-il un compte actif sur le portail STDN (`stdn.ma`) ?
2. **Pratique Réelle :** L'établissement télé-déclare-t-il actuellement ses arrivées/départs tous les jours sur STDN ?
3. **Origine du Document :** Qui a remis le formulaire papier photographié, à quelle date, et dans quel cadre précis (routine mensuelle exigée par la délégation, panne STDN, ou habitude historique) ?
4. **Fréquence du Dépôt Papier :** Ce document est-il déposé physiquement chaque mois à la délégation, ou uniquement suite à une panne STDN excédant 24h ?
5. **Dédoublement Administratif :** La délégation provinciale locale exige-t-elle encore ce relevé papier en parallèle d'un compte STDN actif ?
6. **Spécifications STDN :** L'établissement peut-il fournir le cahier des charges des champs STDN, le guide d'utilisation et un récépissé récent de télé-déclaration ?
7. **Procédure d'Avarie :** Quelle est la procédure locale réellement appliquée lors des coupures de réseau dépassant 24h ?

---

## 4. Tableau de Décision Sprint 0 (À Remplir)

| Règle / Question | Réponse Officielle | Autorité / Contact | Texte de Référence | Date d'Effet |
| :--- | :--- | :--- | :--- | :--- |
| **Statut STDN de l'établissement** | *À renseigner* | Riad Pilote / DGSN-Gendarmerie | Art. 36 Loi 80-14 | À confirmer |
| **Destinataires des flux (DGSN vs Tourisme)**| DGSN (quotidien) / Tourisme (stats + panne) | DGSN / Délégation | Art. 1 Décret 2-15-865 | À confirmer |
| **Usage du formulaire papier photographié** | *Secours panne > 24h ou doublon local* | Délégation Provinciale | Art. 4 Décret 2-15-865 | À confirmer |
| **Champs complets du bulletin STDN** | *À renseigner* | Support STDN / Guide | Spécification STDN | À confirmer |
| **Comptabilisation des enfants/mineurs** | *À renseigner* | Support STDN / Délégation | Guide STDN | À confirmer |
| **Traitement du Day-Use** | *À renseigner* | Support STDN / Délégation | Guide STDN | À confirmer |
| **Traitement des séjours avortés / no-show** | *À renseigner* | Support STDN / Délégation | Guide STDN | À confirmer |
| **Dénominateur Capacité (TO)** | *Chambres installées vs exploitables* | Délégation / HCP | Guide d'instruction | À confirmer |
| **Délai légal de conservation** | *À renseigner (CNDP / Fiscale / Police)* | CNDP / DGSN | Lois 09-08 / 80-14 | À confirmer |

---

## 5. Règle d'Ingénierie Verrouillée

* **Code gelé :** Aucune modification de `hotel.js` ni de création de table D1 n'est autorisée.
* **Prochaine étape utile :** Entretien avec la direction du riad pilote, consultation de leur compte/récépissés STDN, et récupération du cahier des charges des données requises.
