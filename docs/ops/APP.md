# Kiwi Pro — l'app native (Capacitor) · runbook

*Créé le 2026-08-22 (semaine 1 du plan). Plan complet et décisions d'architecture :
`docs/roadmaps/KIWI_APP_PLAN.md` — ce document ne les répète pas, il dit comment on
construit, teste, signe et livre.*

---

## 1. Ce qu'il y a dans le dépôt

```
app/                          projet Capacitor 8 (commité, sauf node_modules/ et www/)
  package.json                premier package.json du dépôt — lockfile commité
  capacitor.config.ts         com.kiwios.pro · « Kiwi Pro » · CapacitorHttp + CapacitorCookies
  src/                        la coquille native : index.html, native-shell.js, native-shell.css
  ios/                        projet Xcode (SPM, pas de CocoaPods) — App/App/public/ est gitignoré
  android/                    projet Gradle — assets/public/ gitignoré
  www/                        SORTIE du build, gitignorée, jamais éditée à la main
assets/api-base.js            le shim : préfixe /api/ et /auth/ par kiwi-os.com en natif (no-op web)
tools/build-app-www.mjs       assemble app/www depuis les surfaces du dépôt
tools/app-bundle-test.mjs     suite wired dans check.js (50 gardes)
functions/_middleware.js      CORS réfléchi pour les origines de l'app sur /api + /auth, 404 sur /app/
```

**L'app n'a pas de deuxième base de code.** Le build copie `kiwi-caisse.html`,
`kiwi-serveur.html`, `kiwi-cuisine.html`, `dashboard.html` et `assets/` tels quels,
injecte `assets/api-base.js` en tête de chaque page, retire les `<link rel=manifest>`
et refuse le bundle si un asset référencé manque. Une fonctionnalité se livre
d'abord sur le web ; l'app la récupère à la release suivante.

## 2. Construire

```bash
cd app
npm ci                                  # une fois par clone
npm run build                           # → app/www (23 Mo, empreinte dans .kiwi-bundle.json)
npx cap sync                            # copie www dans ios/ et android/, met à jour les plugins
```

iOS : `export DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer` d'abord si
`xcode-select` pointe encore sur CommandLineTools, puis `npx cap open ios` → Xcode →
cible **App** → un simulateur ou l'iPad du bureau (signature de développement, 7 jours).

Android : nécessite un JDK 17+ et le SDK Android (`ANDROID_HOME`). Ni l'un ni l'autre
n'est installé sur le Mac de référence au 2026-08-22 ; le projet est généré et commité,
le build Android se fait en semaine 4.

Tester le bundle dans un navigateur de bureau, contre un déploiement :

```bash
node tools/build-app-www.mjs --api-base https://kiwi-maroc.pages.dev
node tools/static-server.js            # depuis app/www — attention au service worker (voir CLAUDE.md §3)
```

`--api-base` injecte `window.KIWI_API_BASE` avant le shim ; la porte accepte l'origine
`http://localhost:<port>` en CORS avec identifiants. Sans le drapeau, le shim ne
préfixe **qu'en natif** (vers `https://kiwi-os.com`).

## 3. Comment l'app parle au backend

- **Origine.** iOS : `capacitor://localhost` ; Android : `https://localhost`. Aucune
  URL relative `/api/…` n'y existe. `assets/api-base.js` enveloppe `fetch`,
  `XMLHttpRequest`, `EventSource`, `WebSocket` (live-socket fabrique
  `ws://localhost/api/live/socket` → `wss://kiwi-os.com/…`), `navigator.sendBeacon`
  et les liens `<a href="/auth/logout">`. Rien d'autre ne sait qu'il tourne dans une
  app ; si un module en a besoin, il lit `window.KiwiApiBase.native`.
- **Cookies.** Le cookie de session est `HttpOnly; Secure; SameSite=Lax`. Avec
  `CapacitorHttp` activé, `fetch`/XHR passent par URLSession/OkHttp et leur pot à
  cookies natif — le cookie est same-site vu du natif. **À mesurer sur l'appareil
  (point ouvert du plan §1.4) :** `EventSource`/`WebSocket` ne passent PAS par
  CapacitorHttp ; si le cookie n'est pas transmis au flux live, le repli est un jeton
  signé en paramètre d'URL (même modèle que le `kpb_` du pont). Ne pas trancher avant
  la mesure.
- **Connexion.** Le gate HTML de kiwi-os.com n'existe pas dans le bundle : la coquille
  (`app/src/native-shell.js`) porte le formulaire compte marchand → `POST /auth/login`
  (JSON) → `GET /api/me`. KiwiÉquipe a son propre login (`/api/employee`), la Caisse
  et la Cuisine s'appairent par code (`/api/pair/redeem`, cookie `kiwi_till`).
- **CORS.** `functions/_middleware.js` reflète **uniquement** `capacitor://localhost`,
  `ionic://localhost`, `http(s)://localhost[:port]`, sur `/api/*` et `/auth/*`, avec
  `Access-Control-Allow-Credentials: true` et `Vary: Origin` ; préflight `OPTIONS` →
  204 avant le gate. Jamais `*`, jamais sur une page HTML.

## 4. Rôles et écran d'accueil

`index.html` (coquille) : quatre tuiles — Caisse, KiwiÉquipe, Cuisine, Tableau de bord —
qui chargent la page correspondante **dans la même WebView** et mémorisent le rôle
(`localStorage.kiwiAppRole`). Au lancement suivant l'appareil va droit à sa surface ;
`index.html?choose=1` ramène le choix. Le pied affiche la plateforme et les 12 premiers
caractères de l'empreinte du bundle (`<meta name="kiwi-bundle">`, posée par le build).

## 5. Ce qui est volontairement coupé en natif

- **Service worker et PWA.** Les bootstraps (`assets/caisse-pwa.js`,
  `dashboard-pwa.js`, `employee-pwa.js`) retournent immédiatement si
  `Capacitor.isNativePlatform()` ; `employee-live.js` n'enregistre pas le SW. Les
  estampilles `?v=` n'ont pas d'effet dans le bundle — c'est la release qui versionne.
- **`/app/*` côté Pages.** Le projet Capacitor vit dans le dépôt, donc dans le
  déploiement ; la porte répond 404 pour ne rien en servir.

## 6. Gardes

`node tools/check.js` inclut `app-bundle-test.mjs` : build jetable déterministe, api-base
premier script de chaque page, pas de manifest, aucune origine d'API en dur dans
`assets/`, gardes natives des bootstraps, comportement du shim dans une fausse fenêtre,
CORS de la porte (origines app oui, tierce non, `/app/` 404).

## 7. Impression native

Dans Kiwi Pro, `assets/printer-bridge.js` choisit le plugin local
`KiwiPrinterSocket` avant les transports web dès que Capacitor confirme une plateforme
native et que la cible possède une adresse IP. Le plugin ouvre directement un socket TCP
vers le port configuré, `9100` par défaut, écrit les octets ESC/POS, puis ferme la
connexion. Si l'envoi échoue, Kiwi reprend la chaîne existante : Bluetooth web, USB web,
pont local, puis relais cloud. Le navigateur web ne charge pas ce plugin et conserve son
comportement actuel.

La première recherche, le premier test ou la première impression vers le réseau local
peut afficher la demande système iOS. Le texte explique que Kiwi envoie les tickets à
l'imprimante thermique du réseau local. Il faut choisir « Autoriser » pour imprimer
directement depuis l'iPad.

Si le marchand a refusé : ouvrir **Réglages > Kiwi Pro > Réseau local**, activer l'accès,
revenir dans Kiwi Pro, puis utiliser **Imprimante > Tester**. **Rechercher sur le réseau**
sonde le port choisi sur le sous-réseau Wi-Fi et remplit l'adresse IP d'un toucher.

## 8. Signer, TestFlight, release, rollback

### Préconditions et signature

Avant le premier envoi, le propriétaire confirme l'organisation Apple, le D-U-N-S et
l'identifiant irréversible `com.kiwios.pro`. Le Team ID ne doit apparaître ni dans le
code ni à plusieurs endroits dans Xcode. Il est fourni comme un seul build setting :

```bash
export KIWI_DEVELOPMENT_TEAM=XXXXXXXXXX
cd app
npm ci
npm run build
npx cap sync ios
xcodebuild -project ios/App/App.xcodeproj -scheme App \
  -configuration Release -destination 'generic/platform=iOS' \
  KIWI_DEVELOPMENT_TEAM="$KIWI_DEVELOPMENT_TEAM" archive
```

Dans Xcode, utiliser la cible **App**, la même équipe d'organisation et la signature
automatique. Ne jamais commiter de certificat, profil, clé APNs/FCM ou keystore.
`ITSAppUsesNonExemptEncryption = NO` est dans `Info.plist`; `PrivacyInfo.xcprivacy`
déclare les diagnostics d'erreur, UserDefaults et les métadonnées du registre local.

### TestFlight interne

1. Incrémenter `MARKETING_VERSION` et `CURRENT_PROJECT_VERSION` avant l'archive.
2. Product > Archive, puis Distribute App > App Store Connect > Upload.
3. Dans App Store Connect, remplir App Privacy selon le manifest et confirmer l'absence
   de tracking, d'achat in-app et de prix d'abonnement dans l'app.
4. Affecter d'abord le build au groupe interne Kiwi. Ne pas ouvrir de groupe externe
   avant validation réelle sur l'iPad du comptoir.
5. Conserver le numéro de build, le hash Git et l'empreinte du bundle dans la fiche de
   test. Une validation simulateur seule ne vaut jamais acceptation terrain.

### Matrice d'acceptation terrain

- Connexion propriétaire, appairage Caisse et Cuisine, changement d'employé par code.
- Français, anglais et arabe, clair et sombre, iPhone et iPad, clavier ouvert et fermé.
- Vente hors ligne, retour réseau, fermeture forcée et reprise sans perte du ticket.
- POS-8370 : réponse sur l'IP actuelle, ticket cuisine et reçu depuis la caisse.
- Redémarrage du routeur : probe de l'ancienne IP, recherche seulement file inactive,
  mise à jour automatique uniquement si une seule imprimante répond.
- Imprimante éteinte : backlog visible, reprise sans doublon, réimpression volontaire
  numérotée, export de diagnostic sans contenu du reçu.
- Deux iPad : un seul hub actif, expiration du lease et reprise visible par l'autre.
- Refus Réseau local : explication Réglages, aucun scan silencieux.
- Suppression du WebView : rôle, appairage et identité restaurés depuis le stockage natif.
- Erreur JS et fin anormale en session active : événement redacted reçu dans `/api/error`.
- Flux live WebSocket/EventSource mesuré avec le cookie natif. Ce point reste bloquant
  tant qu'il n'a pas été prouvé sur appareil.

### Android

Android exige JDK 17 et `ANDROID_HOME`. Le manifest v1 demande réseau, caméra et
notifications; il ne demande pas Bluetooth. Après `npx cap sync android` :

```bash
cd app/android
./gradlew assembleDebug
./gradlew bundleRelease
```

La signature release vient de variables CI ou d'un fichier local ignoré. Aucun
`*.keystore` ni `google-services.json` ne doit entrer dans Git.

### Rollback

Un bundle natif ne suit pas un rollback Pages. En incident, retirer le build du groupe
TestFlight, réactiver le dernier build accepté pour les testeurs et publier un nouveau
numéro de build; ne jamais tenter de remplacer un binaire déjà distribué. Pour une panne
d'impression, conserver les jobs, désactiver la découverte automatique et utiliser
l'ancien transport configuré. Noter l'heure, le merchant, le device id, le hash Git et
l'export diagnostic, puis prévenir le comptoir avant toute action distante.

## 9. État au 2026-08-23

Fait côté code (semaines 1 à 3 du plan, hors BLE volontairement) : scaffold iOS/Android,
`api-base.js` + CORS, coquille native (polices embarquées, zones sûres, barre d'état,
haptique, keep-awake), appairage et identité d'appareil dans le Trousseau (`secureGet`
/`secureSet` du plugin), impression TCP directe + scan/probe, file d'impression
(tickets cuisine et reçus, réimpressions numérotées par vente, bail du hub, journal de
vol `exportDiagnostics`, registre natif `ledgerRead/Write` restauré au démarrage),
`PrivacyInfo.xcprivacy`, rapports d'erreur natifs vers `POST /api/error` (plateforme +
version), suites `app-bundle-test` / `app-release-test` / `print-socket-test` dans
`check.js`. iOS compile et tourne sur simulateur ; Android compile (`assembleDebug`,
JDK 21 + SDK 36 sur le Mac du bureau).

Reste, et rien de ceci n'est du code : **P1** Apple Developer (Organisation, D-U-N-S)
puis premier TestFlight ; **preuve sur un vrai iPad** (connexion, appairage, `/api/me`,
vente Live Link, flux live) ; **POS-8370 au comptoir** (IP courante, ticket cuisine +
reçu depuis la caisse, impression après redémarrage du routeur) ; APK sur la tablette
Android de Browse ; P5 compte démo pour la revue Apple ; P7 identifiant définitif.
