# Kiwi Print Bridge pour Android

Application Android dédiée au relais d'impression Kiwi. Elle remplace Termux :
association par code à six chiffres, récupération des tickets sur `kiwi-os.com`,
envoi ESC/POS brut aux imprimantes LAN et redémarrage automatique.

## Prérequis de compilation

- Java Development Kit (JDK 17 ou supérieur).
- Android SDK : défini via la variable `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`), ou via `bridge/android/local.properties` (`sdk.dir=/chemin/vers/sdk`).

## Construire

Le projet utilise le wrapper Gradle versionné dans `app/android` :

```bash
app/android/gradlew -p bridge/android assembleDebug
```

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
