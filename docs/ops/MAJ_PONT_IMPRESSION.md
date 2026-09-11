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

Demande **la clé de signature d'origine** (`.jks` + son mot de passe, créée le
26 août 2026). Android refuse une mise à jour signée par une autre clé : il
faudrait désinstaller d'abord, ce qui **efface l'appairage**.

Empreinte de la clé attendue, à vérifier avant toute tournée :
`28:A8:36:D7:D6:54:2E:30:65:65:DC:6B:82:00:26:F6:CC:A0:90:FA:C1:98:C3:4D:7E:AC:A7:1C:9E:24:42:D8`

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
git add downloads/kiwi-print-bridge.apk
git commit -m "printer · publier le pont Android v1.0.4"
git push https://github.com/zaka33333-hash/Kiwi.git main
git push https://github.com/badro99/Kiwi.git main
```

Sur la tablette : télécharger l'APK depuis kiwi-os.com, **installer par-dessus**
(jamais désinstaller), accepter « Ignorer les optimisations de batterie »,
vérifier que l'application affiche **1.0.4**.

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
