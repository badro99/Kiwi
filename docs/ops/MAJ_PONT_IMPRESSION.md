# Mettre à jour le pont d'impression — mode d'emploi

## D'abord : quel pont tourne chez ce commerçant ?

Il en existe deux, et la mise à jour n'a rien à voir de l'un à l'autre.

Sur la tablette du comptoir, ouvrir **Termux** et taper :

```bash
curl -s http://127.0.0.1:9110/kiwi/ping
```

- **Ça répond** (`{"name":"kiwi-printer-bridge","version":"…"}`) → pont **Termux**.
  C'est le cas de Casablanca. Suivre la section A. Cinq minutes, rien à installer.
- **Termux n'est pas là**, mais une application « Kiwi Print Bridge » est dans le
  tiroir d'applications → pont **APK Android**. Suivre la section B, qui demande
  la clé de signature.

---

## A. Pont Termux — la mise à jour normale

Le pont est un simple fichier `server.js` exécuté par Node. Le corriger, c'est
remplacer ce fichier et relancer. **Pas de clé de signature, pas de Java, pas
d'APK.**

L'appairage n'est pas dans `server.js` : il est dans `~/.kiwi-printer-bridge.json`.
Remplacer le programme **ne dé-appaire rien** — pas de code à six chiffres à
refaire.

Dans Termux, sur la tablette :

```bash
termux-wake-lock
curl -fsSL https://raw.githubusercontent.com/badro99/Kiwi/main/bridge/server.js -o ~/kiwi-bridge/server.js
pkill -f "node .*server.js"
nohup node ~/kiwi-bridge/server.js >> ~/kiwi-bridge/bridge.log 2>&1 &
```

⚠️ **Le `pkill` n'est pas optionnel.** Télécharger le fichier ne change rien tant
que l'ancien programme tourne encore : il garde son code en mémoire. C'est
l'erreur qui fait croire que « la mise à jour n'a rien changé ».

Vérifier que la nouvelle version tourne vraiment :

```bash
curl -s http://127.0.0.1:9110/kiwi/ping
```

Doit afficher **`"version":"1.4.4"`** ou plus. Si le numéro n'a pas bougé,
l'ancien processus n'est pas mort — refaire le `pkill`.

### Pourquoi Termux tenait déjà mieux que l'APK
`termux-wake-lock` empêche Android d'endormir le processeur. L'installateur le
lance au démarrage et au boot. C'est précisément ce qui manquait à l'APK.

---

## B. Pont APK Android — seulement si c'est celui-là

Demande **la clé de signature** (`~/.kiwi-signing/kiwi-print-bridge.jks` et son
mot de passe dans `kiwi-print-bridge.pass`, créés le 16 septembre 2026 ; voir
`bridge/android/README.md`). Android refuse une mise à jour signée par une autre clé.

Empreinte attendue, à vérifier avant toute tournée :
`B1:5C:8B:BF:B8:40:82:4A:92:6B:C8:E1:FC:16:7D:0F:68:16:31:01:44:53:A0:10:5E:F3:E7:B6:37:AB:D0:AA`

⚠️ **Passage de 1.0.0 à 1.0.4 :** la clé d'août est perdue, la 1.0.4 est signée
par la nouvelle. Sur une tablette qui a l'ancienne application : **désinstaller**,
installer la 1.0.4, puis **ré-associer avec un code à six chiffres**. Ensuite, les
mises à jour s'installent par-dessus sans perdre l'appairage.

Prérequis, une seule fois, sur la machine qui a la clé :

```bash
brew install --cask temurin@21
echo "sdk.dir=$HOME/Library/Android/sdk" > bridge/android/local.properties
cp bridge/android/keystore.properties.example bridge/android/keystore.properties   # puis remplir
```

Construire et publier :

```bash
git pull
app/android/gradlew -p bridge/android assembleRelease
cp bridge/android/app/build/outputs/apk/release/app-release.apk downloads/kiwi-print-bridge.apk
shasum -a 256 downloads/kiwi-print-bridge.apk; stat -f %z downloads/kiwi-print-bridge.apk
# reporter empreinte et taille dans functions/api/print/_watch.js (voir plus bas)
git add downloads/kiwi-print-bridge.apk functions/api/print/_watch.js
git commit -m "printer · publier le pont Android v1.0.x"
git push https://github.com/zaka33333-hash/Kiwi.git main
git push https://github.com/badro99/Kiwi.git main
```

Sur la tablette : télécharger l'APK depuis kiwi-os.com, **installer par-dessus**
(sauf ce passage unique de 1.0.0 à 1.0.4), accepter « Ignorer les optimisations de batterie »,
vérifier que l'application affiche **1.0.8**. Depuis la 1.0.5, une tablette au repos
n'interroge plus kiwi-os.com qu'une fois toutes les 5 s, comme le pont de bureau. Depuis
la 1.0.6, une imprimante qui n'avale plus ses données ne bloque plus le pont : chaque
écriture a 8 s, une imprimante injoignable est rendue au serveur qui retente le ticket,
et le tiroir ne reste plus coincé derrière (Pasta Corner, 26 novembre 2026, douze
minutes de blocage en 1.0.5).

Depuis la 1.0.7, l'app se surveille : 75 s sans tour complet, elle coupe la connexion à
l'imprimante ; 150 s, elle se relance seule. Elle affiche aussi une notification
« Kiwi Print Bridge 1.0.x disponible » quand kiwi-os.com a une version plus récente :
la toucher télécharge l'APK, à installer par-dessus. Après une nouvelle version, relever
`ANDROID_BRIDGE_LATEST` dans `functions/api/print/_watch.js` (print-watch-test vérifie
qu'il suit `versionName`).

### Depuis la 1.0.8 : la mise à jour se fait seule

À partir de la 1.0.8, plus personne n'a à toucher la tablette pour les versions
suivantes. Le serveur joint à son offre l'empreinte sha256 et la taille de l'APK
publié (`ANDROID_BRIDGE_SHA256`, `ANDROID_BRIDGE_SIZE`). Le pont :

1. télécharge l'APK en arrière-plan (adresse neuve à chaque fois, aucun cache ne
   resert l'ancien) et le jette si taille ou empreinte diffèrent d'un seul octet ;
2. attend le calme : **aucun ticket depuis 10 minutes**, et aucun dans le poll en cours ;
3. l'installe par PackageInstaller. Sur Android 12 et plus, avec « Installer des applis
   inconnues » autorisé pour Kiwi Print Bridge, rien ne s'affiche : Android remplace
   l'app, le service repart seul (MY_PACKAGE_REPLACED), l'association est gardée.
   Les tickets envoyés pendant les quelques secondes de l'installation attendent en
   file et sortent au premier poll de la nouvelle version ;
4. si Android demande quand même une confirmation (Android 8 à 11, autorisation
   refusée, constructeur restrictif), une notification « Kiwi Print Bridge 1.0.x prêt ·
   Touchez pour installer » ; après trois essais à une heure d'écart, la notification
   de 1.0.7 (télécharger et installer à la main).

L'autorisation « Installer des applis inconnues » est demandée une fois, à
l'ouverture de l'app. Si elle a été refusée : Paramètres › Applications ›
Kiwi Print Bridge › Installer des applis inconnues › Autoriser.

**Publier une version** : construire, copier l'APK dans `downloads/`, puis reporter
dans `_watch.js` la nouvelle version, l'empreinte (`shasum -a 256`) et la taille en
octets. `print-watch-test` refuse un commit où l'empreinte, la taille ou la version
inscrite dans l'APK ne suivent pas le fichier publié : une empreinte fausse ferait
refuser chaque téléchargement par toutes les tablettes.

⚠️ Une tablette en 1.0.7 ou plus ancienne ne sait pas s'installer seule : il faut
installer la 1.0.8 une dernière fois à la main (la 1.0.7 l'annonce par sa notification).

## Être prévenu avant le commerçant

Depuis le 26 novembre 2026, le relais ouvre une **tâche opérateur** (console, file des
tâches, « Impression bloquée / lente / pont hors ligne · <commerce> ») et envoie un
courriel à `SUPPORT_ALERT_EMAIL` quand un ticket est pris sans accusé dans les 30 s,
récupéré plus de 15 s après son envoi, ou déposé sans pont en ligne. Une tâche par
commerce et par journée de service, un courriel à l'ouverture et à la réouverture.
Voir `functions/api/print/_watch.js`. La page Santé de Kiwi compte ces alertes et les
tickets « incertains ».

---

## Recette, dans les deux cas

Laisser la caisse **20 minutes sans commande**, puis lancer un ticket : il doit
sortir en une ou deux secondes, pas en quinze. Refaire le test le lendemain
matin, et surtout **après le jour de fermeture hebdomadaire** — c'est le cas que
corrige la fenêtre de sept jours.

## En attendant, sans rien installer

Sur l'imprimante elle-même : désactiver **Energy Star / Auto Power Off / Sleep
Mode / Wi-Fi Power Save** dans son interface web, et réserver son IP sur le
routeur. Voir [`PRINTER_POWER_SAVE.md`](PRINTER_POWER_SAVE.md).
