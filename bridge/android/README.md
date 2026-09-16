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

**La clé d'août (empreinte `28:A8:36:…:42:D8`) n'a jamais été retrouvée.** Le
16 septembre 2026, pour publier la 1.0.4, une **nouvelle clé** a été créée. Elle
signe désormais toutes les versions :

- fichier : `~/.kiwi-signing/kiwi-print-bridge.jks` sur le Mac de développement
  (alias `kiwi-print-bridge`, PKCS12, RSA 4096) ;
- mot de passe : `~/.kiwi-signing/kiwi-print-bridge.pass` (permissions 600) ;
- **à sauvegarder** chiffré hors de ce Mac (gestionnaire de mots de passe) : une
  clé perdue ne se régénère pas.

```
CN=Kiwi Print Bridge, OU=Kiwi, O=Kiwi, L=Casablanca, C=MA
SHA-256 B1:5C:8B:BF:B8:40:82:4A:92:6B:C8:E1:FC:16:7D:0F:68:16:31:01:44:53:A0:10:5E:F3:E7:B6:37:AB:D0:AA
```

Construire sans jamais écrire le mot de passe dans le dépôt :

```bash
export KIWI_BRIDGE_KEYSTORE=~/.kiwi-signing/kiwi-print-bridge.jks KIWI_BRIDGE_KEY_ALIAS=kiwi-print-bridge
export KIWI_BRIDGE_KEYSTORE_PASSWORD="$(cat ~/.kiwi-signing/kiwi-print-bridge.pass)" KIWI_BRIDGE_KEY_PASSWORD="$(cat ~/.kiwi-signing/kiwi-print-bridge.pass)"
app/android/gradlew -p bridge/android assembleRelease
$ANDROID_HOME/build-tools/35.0.0/apksigner verify --print-certs bridge/android/app/build/outputs/apk/release/app-release.apk | grep SHA-256
```

L'empreinte doit être celle ci-dessus. **Changement de clé en 1.0.4 :** une
tablette qui avait l'APK 1.0.0 (clé d'août) doit désinstaller, installer la 1.0.4,
puis ré-associer avec un code à six chiffres. Les ponts Termux ne sont pas
concernés, et les mises à jour suivantes s'installeront par-dessus.
