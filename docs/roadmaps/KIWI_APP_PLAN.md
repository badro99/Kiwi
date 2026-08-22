# Kiwi App — plan complet App Store / Play Store

*Rédigé le 2026-08-22. Propriétaire du document : l'équipe Kiwi. Statut : plan validé, exécution à démarrer.*

---

## 0. Pourquoi maintenant (le déclencheur Browse Café)

Le premier client réel tourne sa caisse sur **iPad**. Safari iOS n'a ni Web Bluetooth, ni
WebUSB, et il n'y a **aucun ordinateur au comptoir** pour héberger le Kiwi Printer Bridge.
Résultat : aucun des trois transports d'impression de la caisse web ne peut atteindre son
POS-8370 (`192.168.11.199:9100`). On a livré une solution temporaire (relais cloud
`/api/print/jobs` + pont sur un autre appareil, cf. `docs/ops/LIVE_LINK.md` et la mémoire
*print-relay-ipad*), et l'accès « KiwiÉquipe » des serveurs passe par un raccourci d'écran
d'accueil PWA.

**Ce qu'une app native débloque, et que le web ne pourra jamais faire sur iPad :**

| Besoin | Web (Safari iOS) | App native |
|---|---|---|
| Imprimer en ESC/POS sur une imprimante réseau (TCP 9100) | impossible sans pont | socket TCP natif, direct |
| Imprimer en Bluetooth | impossible | BLE natif (CoreBluetooth) |
| Découvrir l'imprimante sur le Wi-Fi | impossible | scan du sous-réseau / Bonjour |
| Notifications push (nouvelle commande, shift, rupture) | non (PWA iOS limitée) | APNs |
| Écran qui ne s'éteint pas (KDS, caisse) | bricolage | `keep-awake` natif |
| Mode kiosque (iPad verrouillé sur Kiwi) | Accès guidé manuel | Single App Mode supervisé |
| Face ID / Touch ID pour déverrouiller la caisse | non | oui |
| Présence dans l'App Store (confiance client, installation en 1 minute) | non | oui |

Le web reste le produit : l'app est une **coque native autour des surfaces existantes**
(`kiwi-caisse.html`, `kiwi-serveur.html`, `kiwi-cuisine.html`, `dashboard.html`), avec les
briques matérielles en natif. Réécrire la caisse en Swift serait une migration de plusieurs
mois sur un produit qui porte déjà des livres de clients réels — ce n'est pas le sujet.

---

## 1. Décisions d'architecture (tranchées — ne pas rouvrir sans raison nouvelle)

### 1.1 Une seule app, « Kiwi », trois portes d'entrée
Une app, un identifiant (`com.kiwios.app`), un écran d'accueil qui oriente selon qui se
connecte :

- **Caisse** — compte marchand ou till appairé (iPad, tablette Android).
- **KiwiÉquipe** — e-mail + code employé (`POST /api/employee`, `action:'login'`) : prise de
  commande en salle, planning, pointage, messages. C'est l'actuel `kiwi-serveur.html`.
- **Cuisine** — l'écran KDS (`kiwi-cuisine.html`), tablette murale.
- **Tableau de bord** (propriétaire, téléphone) — `dashboard.html` en lecture + actions
  rapides ; pas un objectif de la v1.0 mais la porte existe.

Pourquoi une seule app et pas trois : un seul passage en revue Apple, un seul certificat, une
seule fiche store à maintenir, et surtout un restaurant installe **une** chose sur tous ses
appareils. Le rôle se décide à la connexion, jamais au téléchargement.

### 1.2 Capacitor, pas un rewrite, pas Expo/React Native
- **Capacitor 6** (Ionic) emballe les fichiers statiques du dépôt dans une WKWebView
  (iOS) / WebView (Android) et expose les plugins natifs à `window.Capacitor`.
- Les surfaces sont **embarquées dans l'app** (`app/www/`), pas chargées depuis kiwi-os.com :
  c'est ce qui satisfait la règle 4.2 d'Apple (une app ne doit pas être « un site web dans
  un cadre ») et ce qui fait marcher la caisse hors ligne.
- Android vient gratuitement avec le même projet → Play Store → les tablettes/téléphones
  Android comme caisse ou relais d'impression (le cas Browse aujourd'hui).

### 1.3 Le natif ne fait que ce que le web ne peut pas faire
Plugins v1.0, et rien d'autre :

| Capacité | Plugin | Notes |
|---|---|---|
| Impression TCP 9100 | **plugin maison** `KiwiPrinterSocket` (Swift `Network.framework` / Kotlin `java.net.Socket`) | ~150 lignes par plateforme ; `send(host, port, base64)` ; `probe(host, port)` ; `scan(subnet)` |
| Impression Bluetooth | `@capacitor-community/bluetooth-le` | BLE uniquement (pas de SPP classique sur iOS hors MFi — on le documente au client) |
| Découverte imprimante | `KiwiPrinterSocket.scan` + Bonjour (`NSBonjourServices: _pdl-datastream._tcp`) | |
| Écran allumé | `@capacitor-community/keep-awake` | caisse + KDS |
| Push | `@capacitor/push-notifications` + APNs/FCM | KiwiÉquipe : nouvelle commande, rappel shift ; Caisse : rupture, commande OrderPro |
| Biométrie | `@aparajita/capacitor-biometric-auth` | déverrouillage du verrou d'inactivité déjà existant (mémoire *dashboard-idle-lock*) |
| Caméra | `@capacitor/camera` | scan code-barres boutique, photo de bon de livraison (`skReceptPhoto`) |
| Réseau / cookies / HTTP | `@capacitor/network`, `CapacitorHttp`, `CapacitorCookies` | cf. 1.4 |
| Statut / clavier / haptique | `@capacitor/status-bar`, `@capacitor/keyboard`, `@capacitor/haptics` | |

Tout passe par les façades existantes : `window.KiwiHardware` / `window.KiwiPrinter`
(`assets/caisse-hardware.js`, `assets/printer-bridge.js`). On ajoute un **transport E :
natif**, essayé en premier quand `window.Capacitor?.isNativePlatform()`, avant A (Web
Bluetooth), B (WebUSB), C (pont), D (relais). Aucun autre fichier ne doit savoir qu'il
tourne dans une app.

### 1.4 Le même backend, sans fourche
L'app parle au **même** Cloudflare Pages Functions + D1 que le web. Deux conséquences
techniques à régler avant toute autre chose (c'est le travail de la semaine 1) :

1. **Les 118 appels `fetch('/api/…')` sont relatifs.** Dans l'app, l'origine est
   `capacitor://localhost` ; `/api/…` n'existe pas là. On n'édite pas 118 sites d'appel :
   `assets/api-base.js` (chargé en premier sur chaque surface) enveloppe `window.fetch` et
   `EventSource` pour préfixer `/api/` par `window.KIWI_API_BASE`
   (`https://kiwi-os.com`) quand on est natif. Sur le web le fichier est un no-op.
2. **Les cookies de session sont `HttpOnly; Secure; SameSite=Lax`**
   (`functions/auth/_lib.js` L178–544). Depuis une origine `capacitor://`, une requête vers
   `kiwi-os.com` est inter-site : la WKWebView n'enverrait pas le cookie. Solution retenue :
   `CapacitorHttp` activé (`capacitor.config.ts` → `plugins.CapacitorHttp.enabled = true`),
   qui fait passer `fetch` par `URLSession` / `OkHttp` avec leur propre pot à cookies —
   le cookie est alors « same-site » du point de vue natif. **Point ouvert à prouver en
   semaine 1 :** `assets/live-socket.js` (SSE/WebSocket) n'est pas intercepté par
   `CapacitorHttp` ; si le cookie manque, le flux live doit accepter le jeton de till / de
   session en paramètre d'URL signé (même mécanisme que le `kpb_` du pont) — à trancher
   après mesure, pas avant.
3. **Pas de service worker dans l'app.** Les trois bootstraps PWA
   (`assets/dashboard-pwa.js`, `caisse-pwa.js`, `employee-pwa.js`) retournent immédiatement
   si natif ; les estampilles `?v=` n'ont pas d'effet dans le bundle (le bundle entier est
   versionné par la release).
4. **`_middleware.js`** doit accepter les origines `capacitor://localhost`,
   `ionic://localhost`, `http://localhost` (Android) sur `/api/*` avec credentials — sans
   toucher au gate de compte des pages HTML.

### 1.5 Mises à jour
- **v1.0 :** le web embarqué se met à jour avec l'app (release App Store / Play). Cadence
  visée : une release toutes les deux semaines au début, puis mensuelle.
- **v1.1 :** mise à jour « live » du bundle web depuis nos propres serveurs
  (`@capgo/capacitor-updater` en mode auto-hébergé sur Cloudflare R2) — autorisé par Apple
  tant que le code téléchargé ne change pas la finalité de l'app (contrat développeur
  §3.3.2). Le natif, lui, ne bouge que par release store.

---

## 2. Ce qu'il faut avoir AVANT d'écrire une ligne (chemin critique)

| # | Quoi | Qui | Délai réel | Pourquoi c'est bloquant |
|---|---|---|---|---|
| P1 | **Apple Developer Program** — inscription **Organisation** (99 USD/an) | propriétaire | 2–10 jours ouvrés | TestFlight et App Store impossibles sans. L'inscription organisation exige un **numéro D-U-N-S** de la société (gratuit, demandé à Dun & Bradstreet, ~5–10 jours). Si la société n'est pas encore immatriculée : inscrire en *Individual* aujourd'hui (nom de personne affiché comme vendeur) et migrer en Organisation plus tard — possible mais pénible. **Ouvrir la demande D-U-N-S aujourd'hui.** |
| P2 | **Google Play Console** (25 USD une fois) | propriétaire | 1–3 jours | Android. Vérification d'identité + adresse. |
| P3 | Un Mac avec Xcode (déjà : Xcode 26.6 + simulateur iOS 26.5 installés, mémoire *ios-simulator-setup*) | — | fait | `xcode-select` pointe encore sur CommandLineTools : `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` ou `sudo xcode-select -s`. |
| P4 | Une **imprimante de test** identique au parc client (POS-8370 ou équivalent Epson TM-T20 / Xprinter) sur le Wi-Fi du bureau + un iPad | équipe | cette semaine | On ne valide pas une impression sur simulateur. |
| P5 | **Compte démo marchand** dédié à la revue Apple (pas un vrai client), avec menu, 2 employés, une imprimante « simulée » | équipe | 1 h | Apple exige des identifiants de démonstration dans les notes de revue. |
| P6 | Pages légales publiques : **politique de confidentialité** (URL stable, FR + EN), CGU, page support/contact (+212 6 24 49 51 59) | équipe | 1 jour | Champs obligatoires de la fiche store. |
| P7 | Décider l'**identité éditeur** : nom affiché « Kiwi OS », bundle `com.kiwios.app`, nom d'app « Kiwi — Caisse & Équipe » | propriétaire | 10 min | Irréversible côté bundle id. |

---

## 3. Structure dans le dépôt

```
app/                         ← projet Capacitor (nouveau)
  package.json               ← premier package.json du repo (lockfile commité)
  capacitor.config.ts
  ios/                       ← Xcode project (généré, commité)
  android/                   ← Gradle project (généré, commité)
  plugins/
    kiwi-printer-socket/     ← plugin maison TCP (Swift + Kotlin + définition TS)
  www/                       ← SORTIE de build, .gitignore
  src/
    native-shell.js          ← écran d'accueil rôle, liaison plugins → window.KiwiHardware
    api-base.js              ← (copié vers assets/ par le build, source unique ici)
tools/
  build-app-www.mjs          ← copie kiwi-caisse.html, kiwi-serveur.html, kiwi-cuisine.html,
                                dashboard.html, assets/, fonts → app/www ; injecte
                                <script src="assets/api-base.js"> en tête ; retire les
                                <link rel=manifest> et l'enregistrement SW ; échoue si un
                                asset référencé manque (pas de 404 silencieux dans le bundle)
  app-bundle-test.mjs        ← suite wired dans check.js : chaque page du bundle parse,
                                aucune URL absolue vers kiwi-os.com en dur hors api-base,
                                aucun fetch('/api/…') non enveloppé, manifest absent
docs/ops/APP.md              ← runbook : build, signer, TestFlight, release, rollback (créé, §7 à compléter en semaine 4)
```

Règles CLAUDE.md qui s'appliquent telles quelles : on n'édite pas les surfaces web pour
l'app sauf via `api-base.js` et les gardes `isNativePlatform()` ; estampilles via
`bump-stamp` pour tout asset web touché ; `check.js` vert ; push sur les deux miroirs.
Le déploiement Cloudflare/GitHub Pages doit **ignorer `app/`** (rien à y servir) — ajouter
`app/` à l'exclusion de build Pages et vérifier que `_middleware.js` ne l'expose pas.

---

## 4. Plan d'exécution (6 semaines jusqu'à la soumission)

### Semaine 1 — Fondations (résultat : la caisse tourne dans l'app sur l'iPad du bureau, connectée au vrai backend)
- [ ] P1, P2, P7 lancés (le jour 1 — ce sont les délais les plus longs).
- [x] `app/` scaffoldé (Capacitor **8.5**, pas 6 — version courante, iOS en SPM donc sans CocoaPods), iOS + Android ajoutés, projets commités (2026-08-22).
- [x] `tools/build-app-www.mjs` + `tools/app-bundle-test.mjs` wired dans `check.js` (2026-08-22).
- [x] `assets/api-base.js` (fetch, XHR, EventSource, WebSocket, sendBeacon, liens /auth/) ; `_middleware.js` accepte les origines app sur /api + /auth (2026-08-22).
- [ ] `CapacitorHttp` + `CapacitorCookies` activés (fait, `capacitor.config.ts`) ; **preuve** : connexion marchand, appairage
  till, `GET /api/me`, vente Live Link → visibles sur le dashboard web — à faire sur l'iPad du bureau.
- [x] SW désactivé en natif ; bootstraps PWA gardés (2026-08-22).
- [ ] Mesure du flux live (`live-socket.js`) : cookie transmis ou pas → décision jeton d'URL.
- [x] Écran d'accueil natif minimal (tuiles Caisse / Équipe / Cuisine / Tableau de bord + connexion marchande) qui charge la
  page correspondante dans la même WebView ; mémorise le dernier rôle (2026-08-22, `app/src/`).

### Semaine 2 — Impression native (résultat : un ticket sort du POS-8370 depuis l'iPad, sans pont ni relais)
- [x] Plugin `kiwi-printer-socket` : `send`, `probe`, `scan` ; iOS via `NWConnection`
  (TCP, timeout 4 s, gestion `waiting` sur réseau local non autorisé), Android via socket.
- [x] `Info.plist` : `NSLocalNetworkUsageDescription`, `NSBonjourServices`,
  `NSBluetoothAlwaysUsageDescription` — textes en français, précis (Apple rejette les
  textes vagues).
- [x] Transport E dans `assets/printer-bridge.js` : si natif → socket TCP (IP/port déjà dans
  `kiwiPrinterCfg`), sinon chaîne existante. Le modal imprimante propose « Rechercher sur
  le réseau » (scan) et « Tester » (probe) en natif.
- [ ] BLE via `bluetooth-le` : appairage, écriture par chunks de 180 octets, reconnexion.
- [ ] Ticket cuisine + ticket client + tiroir-caisse (ESC/POS `1B 70`) validés sur la vraie
  imprimante ; `tools/print-relay-test.mjs` étendu d'un cas « transport natif prioritaire ».

### Semaine 3 — Expérience native (résultat : ça ne ressemble plus à un site dans un cadre)
- [ ] Safe areas / encoche / barre d'état (`viewport-fit=cover` déjà en place), clavier qui
  ne masque pas le champ actif, haptique sur ajout au ticket et encaissement.
- [ ] `keep-awake` sur Caisse et Cuisine ; Face ID pour lever le verrou d'inactivité.
- [ ] Hors ligne : la caisse embarquée démarre sans réseau, file d'attente des ventes
  (déjà : `KiwiSales` local-first) ; bannière « hors ligne » via `@capacitor/network`.
- [ ] Push : APNs key + FCM ; côté serveur une table `push_tokens` (merchant, role,
  employee_id, token, platform) + `POST /api/push/register` ; premier événement :
  nouvelle commande OrderPro → Caisse + Cuisine ; nouveau shift publié → Équipe.
- [ ] Caméra native pour le scan code-barres (boutique/maison) et la photo de bon.
- [ ] Mode kiosque documenté pour iPad (Single App Mode via Apple Configurator, ou Accès
  guidé) dans `docs/ops/KIOSK.md` — c'est un réglage OS, pas une fonction de l'app.

### Semaine 4 — Qualité, Android, bêta interne
- [ ] Android : build, même plugin socket, permissions `INTERNET`, `BLUETOOTH_CONNECT`,
  `BLUETOOTH_SCAN`, `CAMERA`, `POST_NOTIFICATIONS` ; test sur la tablette/téléphone Android
  qui sert aujourd'hui de relais chez Browse.
- [ ] Audit RTL (arabe) dans la WebView ; tailles iPhone SE → iPad 13".
- [ ] Crash reporting : Sentry (plan gratuit) ou au minimum `@capacitor/app` + remontée vers
  `POST /api/error` (existe déjà).
- [ ] **TestFlight interne** (équipe) + **bêta fermée Play**. Runbook `docs/ops/APP.md`.

### Semaine 5 — Bêta clients (Browse Café, Amira)
- [ ] TestFlight externe (jusqu'à 10 000 testeurs, revue légère d'Apple ~24 h).
- [ ] Installation chez Browse : app sur l'iPad caisse, imprimante en TCP direct, **le pont
  et le relais sont retirés de leur parcours**. Un service complet en conditions réelles.
- [ ] KiwiÉquipe sur les téléphones des serveurs ; remplacement du raccourci PWA.
- [ ] Journal des incidents → corrections → nouvelle build TestFlight (cycle 48 h).

### Semaine 6 — Soumission
- [ ] Fiche App Store : nom, sous-titre, description FR/EN/AR, mots-clés, captures iPhone
  6.7" + iPad 13" (caisse, équipe, cuisine, tableau de bord), icône 1024, catégorie
  *Business*, âge 4+, prix gratuit (l'abonnement est vendu hors app — **aucun achat
  in-app**, donc pas de commission Apple ; ne jamais afficher de prix d'abonnement ni de
  bouton « s'abonner » dans l'app, c'est la règle 3.1.1 qui coince sinon).
- [ ] Étiquettes confidentialité (App Privacy) : données liées à l'utilisateur — e-mail,
  nom, identifiant ; données d'usage — ventes du marchand (« Données financières »
  au sens large : à déclarer honnêtement) ; pas de pistage publicitaire.
- [ ] Export compliance : HTTPS uniquement → `ITSAppUsesNonExemptEncryption = NO`.
- [ ] Notes de revue : identifiants du compte démo (P5), explication « l'app imprime sur
  une imprimante réseau locale, d'où la permission Réseau local », vidéo de 60 s montrant
  le parcours caisse → ticket.
- [ ] Soumettre. Délai de revue typique : 24–48 h ; prévoir un rejet et une resoumission
  (les motifs fréquents pour nous : 4.2 « minimum functionality » si l'écran d'accueil a
  l'air d'un site, 5.1.1 si une permission n'est pas justifiée à l'écran **avant** le
  prompt système, 2.1 si le compte démo ne marche pas).
- [ ] Play : fiche équivalente, questionnaire « Sécurité des données », revue 1–7 jours.

### Après la v1.0
- v1.1 : mise à jour live du bundle (1.5), tableau de bord propriétaire mobile, Sign in with
  Apple si un jour on ajoute Google/Facebook login (obligatoire dès qu'un login tiers
  existe — pas avant).
- v1.2 : impression AirPrint (tickets A4/PDF), NFC (Kiwi Tap SoftPOS — Phase 2, nécessite
  l'entitlement *Tap to Pay on iPhone*, dossier Apple séparé).

---

## 5. Critères d'acceptation de la v1.0 (ce qu'on vérifie avant de soumettre)

1. Sur un iPad neuf : installer → se connecter → appairer le till → imprimer un ticket
   client et un ticket cuisine sur une imprimante TCP, **sans aucun autre appareil**.
2. Couper le Wi-Fi : encaisser 3 ventes, rallumer, les 3 ventes arrivent sur le
   dashboard web (Live Link) ; aucune doublon.
3. KiwiÉquipe sur iPhone : connexion e-mail + code, prise de commande d'une table,
   la commande apparaît sur la Cuisine (iPad) et sur la Caisse ; push reçu.
4. Fermer l'app 20 min, rouvrir : le verrou demande Face ID puis le code ; l'état du ticket
   en cours est conservé.
5. Un compte démo Apple peut parcourir Caisse / Équipe / Cuisine sans jamais voir de donnée
   d'un vrai marchand (gate `KiwiEnv.isReal()`, mémoire *real-not-custom-leak*).
6. `node tools/check.js` vert, `app-bundle-test` compris ; `build-app-www` reproductible
   (même entrée → même bundle).
7. Aucun secret dans `app/` (clés APNs/FCM et certificats **hors dépôt** ; `.gitignore`
   couvre `*.p8`, `*.p12`, `*.mobileprovision`, `google-services.json`,
   `GoogleService-Info.plist`).

---

## 6. Risques et parades

| Risque | Parade |
|---|---|
| Rejet Apple 4.2 (« c'est un site web ») | impression native, push, Face ID, hors ligne, écran d'accueil natif, captures qui montrent du matériel réel ; répondre au reviewer avec la vidéo |
| Cookie de session non transmis (SSE) | mesuré en semaine 1 ; repli jeton signé en URL, même modèle que le pont |
| Imprimantes Bluetooth « classiques » (SPP) chez des clients | iOS ne les voit pas : recommander le TCP/Wi-Fi (la majorité des POS-80 ont un port Ethernet) ou un modèle BLE ; Android les gère — le documenter dans le guide matériel |
| Délai d'inscription Apple / D-U-N-S | lancer le jour 1 ; tout le reste avance en parallèle sur simulateur + build ad-hoc sur l'iPad du bureau (signature de développement gratuite, 7 jours, suffisante pour tester) |
| Régression du web en touchant les surfaces | `api-base.js` no-op sur le web ; gardes `isNativePlatform()` ; `check.js` + stamps |
| Deux bases de code qui divergent | il n'y en a qu'une : l'app embarque le même `assets/` ; toute fonctionnalité se livre d'abord sur le web, l'app la récupère à la release |
| Bande passante équipe | semaines 1–2 = une personne à plein temps ; 3–6 = une personne + tests terrain ; le reste du produit continue |

---

## 7. Ce que ça change pour le premier client, concrètement

Aujourd'hui : iPad → relais cloud → pont sur un autre appareil → imprimante. Trois maillons,
dix minutes d'attente possibles, un appareil de plus à alimenter.
Avec l'app : iPad → imprimante. Un maillon, une seconde, rien d'autre à installer. Et ses
serveurs ont **KiwiÉquipe** dans l'App Store, pas un raccourci Safari à réexpliquer à chaque
nouvel employé.

---

*Documents liés : `docs/ops/KIOSK.md` (mode kiosque par OS), `docs/ops/LIVE_LINK.md`
(backend des ventes et relais d'impression), `bridge/README.md` (pourquoi les transports
web échouent sur iPad), `docs/specs/SYNC_MODEL.md` (local-first), `CLAUDE.md` §2–3.*

---

## 8. L'app « Kiwi » côté consommateur — fidélité, reçus, commande, puis paiement

*Ajouté le 2026-08-22 (décision du propriétaire). Complète les sections 1–7 ; ne les remplace pas.*

### 8.1 Deux apps, une base de code
| | **Kiwi** (consommateur) | **Kiwi Pro** (marchand) |
|---|---|---|
| Bundle | `com.kiwios.app` | `com.kiwios.pro` |
| Qui | le client final d'un commerce équipé Kiwi | marchand, caissier, serveur, cuisine |
| Parcours type | ouvrir → scanner → voir ses points → fermer (8 secondes) | se connecter une fois, vivre dedans 10 h par jour |
| Contenu v1 | fidélité (scan du QR de ticket, solde par commerce, récompenses), reçus dématérialisés, carte des commerces Kiwi, OrderPro à table (déjà `kiwi-order.html`) | sections 1–7 de ce plan |
| Plus tard | portefeuille Kiwi Pay (Phase 2), Zakat/Sadaqa côté client, commande à emporter | — |

Pourquoi deux fiches store et pas une : audiences opposées, notes d'utilisateurs qui se
polluent mutuellement, écran de connexion marchand devant un client de café. Le même
projet Capacitor produit les deux cibles ; le web embarqué et le backend sont communs.
C'est le découpage Square / Cash App.

### 8.2 La mécanique qui ne se fraude pas
- **Jamais de QR statique au comptoir** (scannable à l'infini). La caisse imprime / affiche
  un **QR par vente** : jeton signé côté serveur (`/api/loyalty/token`, HMAC, expire en
  10 min, usage unique), lié au ticket, au marchand et au montant. Le client le scanne dans
  Kiwi → points pour *ce* ticket. Le caissier peut aussi scanner le QR du client (l'iPad a
  une caméra) pour lier avant l'encaissement.
- **Identité = numéro de téléphone** (OTP WhatsApp), pas d'e-mail. Sans l'app, le client
  donne son numéro au caissier et gagne quand même ses points — c'est le carnet clients
  existant (`/api/clients`, `employee_loyalty_events`). L'app est la voie premium, pas un
  prérequis : le programme a de la valeur dès le client n° 1.
- **Un client, plusieurs soldes.** Les points d'Amira ne sont pas les points de Browse. Un
  programme Kiwi inter-commerces est une décision de Phase 2 (c'est un passif).
- Le marchand garde la main : règles (1 point / 10 MAD, tampon, palier), récompenses,
  export de son carnet. Kiwi ne revend ni ne croise les données entre marchands.

### 8.3 Ce que ça demande au backend (petit, parce que le gros existe)
- `loyalty_tokens` (merchant, sale_id, token_hash, amount, expires_at, redeemed_by,
  redeemed_at) ; `consumers` (phone_hash, created_at, consent_at, consent_version) ;
  liaison consommateur ↔ ligne du carnet clients de chaque marchand.
- Endpoints publics à débit limité : `POST /api/loyalty/otp`, `POST /api/loyalty/redeem`
  (jeton + consommateur → points crédités **une fois**, même idempotence que
  `employee_loyalty_events`), `GET /api/loyalty/me` (soldes, reçus), `GET /api/places`
  (commerces Kiwi qui ont activé la fidélité publique — opt-in marchand).
- Reçu dématérialisé = le ticket déjà généré, rendu en HTML ; rien à réinventer.

### 8.4 Séquence (ne doit PAS retarder Kiwi Pro)
1. **Semaines 1–6 :** Kiwi Pro (sections 4–5). En parallèle, à coût quasi nul : le QR par
   vente sur le ticket + la page web `kiwi-os.com/c/<jeton>` (numéro → OTP → points).
   Les points s'accumulent déjà avant toute app consommateur.
2. **Semaines 7–12 :** l'app « Kiwi » emballe cette page (Capacitor, même projet, deuxième
   cible), ajoute le scanner natif, la carte, les reçus, les notifications (« +12 points
   chez Amira »). Soumission store, fiche **grand public** (catégorie *Food & Drink* ou
   *Lifestyle*, captures côté client).
3. **Phase 2 :** portefeuille / Kiwi Pay dans la même app — le client a déjà Kiwi sur son
   téléphone avec des points dedans ; c'est précisément l'entrée du paiement.

### 8.5 À ajouter au chemin critique (section 2)
| # | Quoi | Pourquoi |
|---|---|---|
| P8 | **Déclaration CNDP (loi 09-08)** pour le traitement « programme de fidélité multi-commerces » : numéros de téléphone + historique d'achats ; écrans de consentement versionnés, droit d'accès/suppression dans l'app | obligatoire dès que Kiwi détient des données clients finals pour le compte de plusieurs marchands ; c'est du papier, pas un bloqueur — le lancer avec le D-U-N-S |
| P9 | Fournisseur OTP WhatsApp (Meta Cloud API via le numéro business, ou SMS de repli) | l'identité consommateur en dépend |
| P10 | Deuxième fiche store (nom « Kiwi », icône, captures client), deuxième bundle id | irréversible, à décider en même temps que P7 |

### 8.6 Critères d'acceptation de Kiwi v1.0 (consommateur)
1. Un client sans compte scanne le QR d'un ticket, entre son numéro, reçoit l'OTP, voit
   ses points : **moins de 30 secondes**, aucune autre donnée demandée.
2. Le même QR scanné deux fois ne crédite qu'une fois ; un QR de plus de 10 minutes est
   refusé ; un QR d'un autre marchand ne touche que le solde de ce marchand.
3. Le marchand voit le client et ses points dans son carnet sur la caisse **et** le
   tableau de bord, sans doublon (le bug historique du carnet local, corrigé par
   `/api/clients`, ne doit pas revenir par cette porte).
4. Le client peut supprimer son compte dans l'app ; ses lignes sont anonymisées chez
   chaque marchand dans l'heure.
5. Aucune donnée d'un marchand n'est lisible par un autre via l'API publique
   (`tools/loyalty-isolation-test.mjs`, wired dans `check.js`).
