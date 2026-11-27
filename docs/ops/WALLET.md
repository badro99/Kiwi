# Carte fidélité Wallet · mise en service

La carte existe en trois formes : Apple Wallet, Google Wallet et une carte web
(`/carte/<commerce>/...`). Sans aucun des secrets ci-dessous, seule la carte web
marche ; chaque bloc de secrets allume sa plateforme, sans redéploiement de code.
Conception : `docs/superpowers/specs/2026-11-27-wallet-loyalty-card-design.md`.

Ordre à suivre : **1. la base, 2. Apple, 3. Google, 4. allumer un commerce.**
Les clés privées restent des secrets Cloudflare : jamais dans git, jamais dans
un message.

Les secrets se posent dans Cloudflare → Pages → `kiwi-maroc` → Settings →
Variables and secrets → **Add** (type *Secret*, environnement *Production*),
ou en ligne de commande :

```bash
npx wrangler pages secret put NOM_DU_SECRET --project-name kiwi-maroc
```

## 1. La base (migration 0040)

Les tables `wallet_cards`, `wallet_devices`, `wallet_claims` et
`wallet_tokens` arrivent par `migrations/0040_wallet_cards.sql`. Tant
qu'elle n'est pas appliquée, les routes `/api/wallet/*` et `/carte` répondent
en erreur ; la vente, elle, n'est jamais touchée (la mise à jour des cartes part
après la réponse et avale ses erreurs). **N'allumez aucun commerce avant.**

```bash
npx wrangler d1 migrations apply kiwi-sales --remote -c wrangler.d1.toml
```

Cette commande applique aussi les migrations plus anciennes encore en attente.
Ensuite, `MINIMUM_SCHEMA_VERSION` dans `functions/_schema-version.js` monte à 40
(un agent le fait une fois le registre de prod relu).

## 2. Apple Wallet

Sur <https://developer.apple.com/account> (compte de l'équipe Kiwi) :

1. **Identifiers → +** → *Pass Type IDs* → description « Kiwi carte fidélité »,
   identifiant `pass.com.kiwios.loyalty` (ou un autre, tant qu'il commence par
   `pass.`).
2. Sur le Mac, créez la clé et la demande de certificat (la clé ne quitte pas
   le Mac avant d'être collée dans Cloudflare) :

   ```bash
   openssl req -new -newkey rsa:2048 -nodes -keyout pass.key -out pass.csr -subj "/CN=Kiwi Pass/C=MA"
   ```

3. **Certificates → +** → *Pass Type ID Certificate* → choisissez l'identifiant
   de l'étape 1 → envoyez `pass.csr` → téléchargez `pass.cer`, puis :

   ```bash
   openssl x509 -inform der -in pass.cer -out pass-cert.pem
   ```

4. Secrets :
   - `WALLET_APPLE_PASS_TYPE_ID` : l'identifiant de l'étape 1.
   - `WALLET_APPLE_CERT_PEM` : tout le contenu de `pass-cert.pem`.
   - `WALLET_APPLE_KEY_PEM` : tout le contenu de `pass.key`.
   - `APNS_TEAM_ID` : l'identifiant d'équipe (10 caractères, en haut à droite du
     compte). Déjà posé si les approbations du propriétaire sont en service.
5. Les mises à jour en direct (un tampon qui apparaît sur l'iPhone) passent par
   la clé APNs de l'équipe, la même que les approbations du propriétaire :
   `APNS_KEY_ID` et `APNS_PRIVATE_KEY`. Si elles manquent : **Keys → +** →
   cochez *Apple Push Notifications service* → téléchargez le `.p8` (une seule
   fois) → `APNS_KEY_ID` = l'identifiant de la clé, `APNS_PRIVATE_KEY` = le
   contenu du `.p8`. Les cartes vont toujours sur l'APNs de production, quoi
   que dise `APNS_SANDBOX`.
6. Supprimez `pass.key`, `pass.csr`, `pass.cer` et `pass-cert.pem` du Mac une
   fois collés.

Vérification : ouvrez `/carte/<commerce>` sur un iPhone, inscrivez un numéro de
test : le bouton « Ajouter à Apple Wallet » apparaît et la carte s'ouvre. Un
achat crédité doit ensuite mettre la carte à jour en quelques secondes ; si
rien ne bouge, la première chose à regarder est la réponse APNs (une clé `.p8`
qui refuserait le sujet `pass.*` répond 403).

## 3. Google Wallet

1. <https://pay.google.com/business/console> → **Google Wallet API** → notez
   l'**Issuer ID**.
2. <https://console.cloud.google.com> → un projet (par exemple « kiwi-wallet »)
   → *APIs & Services* → activez **Google Wallet API**.
3. *IAM & Admin → Service accounts* → **Create** (« kiwi-wallet ») → onglet
   *Keys* → **Add key → JSON**. Le fichier téléchargé contient `client_email`
   et `private_key`.
4. Retour dans la console Wallet → **Users** → invitez l'adresse
   `client_email` du compte de service avec le rôle *Developer*.
5. Secrets :
   - `WALLET_GOOGLE_ISSUER_ID` : l'Issuer ID.
   - `WALLET_GOOGLE_SA_EMAIL` : `client_email`.
   - `WALLET_GOOGLE_SA_KEY` : la valeur de `private_key`, telle quelle (les
     `\n` écrits en toutes lettres sont acceptés).
6. Supprimez le fichier JSON du Mac.
7. Un émetteur neuf est en mode démo : seuls les comptes de test ajoutés dans
   la console peuvent enregistrer la carte. Dans la console Wallet, **Request
   publishing access** (quelques jours) pour l'ouvrir à tous.

## 4. Allumer un commerce

Tableau de bord du commerce → **Clients → Fidélité** → bloc
**Carte Wallet** : cochez « Proposer la carte à mes clients », nom, couleurs, adresse (et
« Utiliser ma position ici » sur place pour la notification d'écran verrouillé) →
**Enregistrer la carte** → **Imprimer le présentoir du comptoir** (A6, QR vers
`kiwi-os.com/carte/<commerce>`).

Dès lors :
- le présentoir inscrit un client (prénom, numéro, consentement) ;
- un reçu sans client porte un QR « Votre carte fidélité » qui inscrit le client
  et crédite ce passage, une seule fois ;
- à la caisse, le bouton carte à côté du client montre un QR à usage unique
  (dix minutes) qui lui ouvre sa carte ;
- la douchette lit la carte du client (`KIWI-C:<id>`) et le pose sur la vente.
