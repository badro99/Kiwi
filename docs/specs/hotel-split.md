# Hotel: extraction prudente de la localisation

Référence : `82e5d1297faf221d4177bcfe70949d9e7d34380d`,
`assets/hotel.js`, 10 296 lignes. L'original compressé est conservé dans
`tools/fixtures/hotel/original.js.gz`; ses offsets et son SHA-256 figurent
dans `tools/fixtures/hotel/split.json`.

## Frontière et chargement

La première frontière autonome est la localisation : les anciennes lignes
42–1428, soit 1 387 lignes, passent sans modification dans
`assets/hotel-language.js` (1 400 lignes avec son enveloppe). Le cœur conserve
8 909 lignes et les responsabilités qui partagent son état mutable : réception,
chambres, réservations, ménage, tarifs, folios, canaux, économat et onboarding.
Cette découpe reste volontairement limitée : ces workflows ne sont pas séparés
entre eux dans ce changement.

Le dashboard charge deux scripts classiques `defer`, adjacents et dans l'ordre :
`hotel-language.js`, puis `hotel.js`. Cela consomme le dernier emplacement permis
(161 → 162 balises, pin 159 + marge 3). Aucun chargement asynchrone au premier clic
ni déplacement de l'initialisation du cœur. Le préambule publie uniquement une
fabrique, sans initialiser les dictionnaires; le cœur l'appelle à l'emplacement
initial du bloc de langue.

Contrat privé unique : `window.__kiwiHotelInternal`, objet gelé avec la seule clé
`language`. `language()` crée et retourne les dix anciennes liaisons
`hxLang`, `hxLocale`, `tx`, `txk`, `HX_N`, `txn`, `ltr`, `hxTo`, `hxColon`, `HX_T`.
Elles restent privées au cœur et à la fermeture de localisation. Les lectures
langue/locale restent dynamiques. Les dictionnaires gardent leur mutabilité
originale; seul le contrat du namespace est gelé.

L'URL littérale du nouveau script dans `dashboard.html` est découverte par
`tools/stamps.js` et donc par `tools/bump-stamp.js`. Les anciennes estampilles,
`tools/asset-stamps.json` et `kiwi-sw.js` sont inchangés, selon les consignes.
À l'intégration, estampiller les deux scripts et ajouter
`/assets/hotel-language.js?v=1` (ou sa nouvelle révision) au SHELL du SW.
Le PWA test existant passe, mais ne détecte pas cette absence de pré-cache.

## Preuve

`node tools/hotel-split-test.mjs` reconstruit l'original octet par octet depuis
les fichiers de production et vérifie le SHA-256 de l'archive. Il vérifie aussi
les enveloppes exactes, les balises ordonnées, le plafond de 162 scripts,
la découverte de l'estampille, et exécute l'original puis les deux vrais fichiers
dans le même harnais de registre, avec une horloge fixe. État initial,
écritures locales, corps de tous les handlers, globals publics et forme gelée
du namespace concordent. Les dictionnaires, sources des fonctions, traductions
FR/EN/AR et pluriels concordent. Remettre temporairement l'ancien cœur fait
échouer le test; la version découpée passe.

`tools/hotel-test-source.mjs` reconstruit la portée d'origine pour les anciens
tests qui extraient des fonctions. Il lit exclusivement les corps de production,
jamais l'archive. Les fixtures navigateur chargent les deux scripts réels.
`tools/check.js` n'est pas modifié.

## Validation locale

52 suites hôtel/économat lancées séquentiellement : 46 passent. Six sont bloquées
par l'environnement; les mêmes six échecs ont été reproduits sur un export intact
de la référence ci-dessus, avec les mêmes dépendances :

- `economat-real-d1-transfer`, `hotel-commercial-layout`, `hotel-i18n`,
  `hotel-room-plan-ui` : `listen EPERM 127.0.0.1`.
- `hotel-direct-booking-browser`, `hotel-stays-group-browser` : échec de lancement
  de Chromium.

Le ratchet passe (665 contrôles), le PWA shell passe (787 contrôles), et les deux
scripts passent `node --check`. Seul le pin de `assets/hotel.js` est abaissé
(10 284 → 8 909); aucun pin n'est augmenté. La validation navigateur reste donc
à faire dans un environnement autorisant les ports locaux et Chromium.

Contrôles connexes : `modal-desc-escape` (40), `financial-ledger-invariant`
et `pairing-resolver` (83) passent. `dashboard-breadcrumb-language` rencontre
le même `listen EPERM` sur la version découpée et sur la référence intacte.
