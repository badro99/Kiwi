# Le point du matin (Worker planifié)

Un push par commerçant ayant activé « Le point du matin », à l'ouverture
(05:30 heure de Casablanca), avec le total de la journée commerciale d'hier.
Ce Worker ne fait que POSTer sur `https://kiwi-os.com/api/push/morning` avec
un secret partagé. Calcul, idempotence et envoi APNs vivent dans
`functions/api/push/morning.js` et `_dispatch.js`.

Tant que les secrets ne sont pas posés, rien n'est envoyé et rien n'échoue
(la route répond 503 sans `MORNING_PUSH_SECRET`, et n'envoie rien sans clé APNs).

## Déploiement

1. Créer une clé APNs sur developer.apple.com (Certificates, Identifiers & Profiles,
   Keys, Apple Push Notifications service). Télécharger le `.p8` une seule fois.
2. Sur le projet Cloudflare Pages `kiwi-os.com`, ajouter ces quatre secrets
   (Settings, Variables and Secrets, type Secret) :
   - `APNS_KEY_ID` : l'identifiant de 10 caractères de la clé
   - `APNS_TEAM_ID` : l'identifiant d'équipe Apple Developer
   - `APNS_PRIVATE_KEY` : le contenu complet du `.p8` (PEM, `\n` littéraux acceptés)
   - `MORNING_PUSH_SECRET` : une valeur aléatoire longue (`openssl rand -hex 32`)

   Facultatif : `APNS_SANDBOX=1` pour un build de développement (aps-environment
   development) ; à retirer pour TestFlight et l'App Store.
3. Déployer le Worker, depuis ce dossier : `wrangler deploy`, puis
   `wrangler secret put MORNING_PUSH_SECRET` avec la MÊME valeur que sur Pages.
4. Vérifier :
   `curl -X POST https://kiwi-os.com/api/push/morning -H 'X-Kiwi-Morning-Secret: <secret>'`
   répond `{"ok":true,...}` (le compteur `sent`, jamais de jeton dans la réponse).

## Horaire

Le cron Cloudflare est en UTC. Le Maroc est à UTC+1 toute l'année sauf pendant
le Ramadan (UTC+0). `wrangler.toml` déclare 04:30 et 05:30 UTC ; `index.js` ne
déclenche que si l'heure de Casablanca est entre 05:30 et 05:59. Un seul passage
a donc lieu par jour, jamais avant la coupure de 5 h de la journée commerciale.
