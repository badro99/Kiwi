# Kiwi Print Bridge pour Android

Application Android dédiée au relais d'impression Kiwi. Elle remplace Termux :
association par code à six chiffres, récupération des tickets sur `kiwi-os.com`,
envoi ESC/POS brut aux imprimantes LAN et redémarrage automatique.

## Prérequis de compilation

- Java Development Kit (JDK 17 ou supérieur).
- Android SDK : défini via la variable `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`), ou via `bridge/android/local.properties` (`sdk.dir=/chemin/vers/sdk`).
- La plateforme `platforms;android-35` doit être installée : `compileSdk` vaut 35,
  et un SDK qui n'a que `android-36` échoue à la configuration.

### Sur le poste de développement actuel (macOS, 2026-09-05)

Le JDK est installé mais **invisible** : `openjdk@21` par Homebrew est *keg-only*,
donc `java`, `javac`, `keytool` et `/usr/libexec/java_home` répondent tous
« Unable to locate a Java Runtime ». Ce n'est pas une absence de JDK. Une session
précédente en a conclu qu'aucune compilation n'était possible ici et a cherché
ailleurs pendant une heure. Exporter les deux variables suffit :

```bash
export JAVA_HOME=$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
```

`sdkmanager` vient du cask `android-commandlinetools` et vit dans
`/opt/homebrew/bin/sdkmanager` ; il exige lui aussi `JAVA_HOME`.

## Construire

Le projet utilise le wrapper Gradle versionné dans `app/android` :

```bash
app/android/gradlew -p bridge/android assembleDebug
```

## Vérifier ce qu'on vient de construire

`tools/check.js` ne compile jamais le Java : il ne fait que chercher des sous
chaînes, et une accolade manquante lui échappe entièrement (c'est arrivé). Un
`assembleDebug` est donc la seule preuve qu'une modification compile. Ensuite,
`aapt2` dit ce que l'APK contient réellement, ce qu'aucune lecture du source ne
garantit :

```bash
AAPT=$ANDROID_HOME/build-tools/35.0.0/aapt2
$AAPT dump badging bridge/android/app/build/outputs/apk/debug/app-debug.apk | head -3
$AAPT dump permissions bridge/android/app/build/outputs/apk/debug/app-debug.apk
```

Le premier donne `versionCode` et `versionName`, le second la liste des
permissions. C'est ainsi qu'on a établi que l'APK publié en août était resté en
1.0.0 sans `WAKE_LOCK` : le source disait autre chose depuis longtemps.

## Signer une version distribuable

La clé de signature doit vivre hors du dépôt. Créez-la une seule fois, gardez-en
une sauvegarde chiffrée, puis copiez `keystore.properties.example` vers
`keystore.properties` et remplissez les quatre valeurs. Ensuite :

```bash
app/android/gradlew -p bridge/android assembleRelease
```

L'APK signé se trouve dans
`bridge/android/app/build/outputs/apk/release/app-release.apk`. Copiez-le vers
`downloads/kiwi-print-bridge.apk` pour le servir depuis le domaine Kiwi.

Ne remplacez jamais la clé de signature après une première installation client :
Android refuserait les mises à jour signées avec une autre clé.

### Où est la clé, et comment vérifier qu'on a la bonne

**La clé qui a signé l'APK d'août n'est sur aucun poste retrouvé à ce jour.**
Elle n'est ni dans ce dépôt (`.gitignore` l'exclut, c'est voulu) ni sur la
machine de développement. Son empreinte, extraite de l'APK publié, est la
suivante :

```
CN=Kiwi Print Bridge, OU=Kiwi, O=Kiwi, L=Casablanca, C=MA
SHA-256 28:A8:36:D7:D6:54:2E:30:65:65:DC:6B:82:00:26:F6:CC:A0:90:FA:C1:98:C3:4D:7E:AC:A7:1C:9E:24:42:D8
```

Avant toute publication, comparez l'empreinte de la clé qu'on s'apprête à
utiliser à celle-ci :

```bash
keytool -list -v -keystore /chemin/vers/la.jks -alias kiwi-print-bridge | grep SHA256
```

Si elles diffèrent, les tablettes qui ont déjà l'APK devront désinstaller puis
réinstaller, et **perdront leur association** (le jeton vit dans le stockage de
l'application, que la désinstallation efface) : il faudra ré-associer avec un
code à six chiffres. Les nouvelles installations, elles, ne sont pas concernées.

Quand une clé est créée, notez ici où elle est gardée et par qui. Une clé perdue
ne se régénère pas.
