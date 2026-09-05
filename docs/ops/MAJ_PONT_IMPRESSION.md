# Mettre à jour le pont d'impression Android — mode d'emploi

Pour qui : la personne qui a **la clé de signature** de l'application
(`kiwi-print-bridge-release.jks`). Sans elle, la mise à jour est impossible :
Android refuse une application signée par une autre clé.

Pourquoi maintenant : la tablette de Pasta Corner tourne encore sur la version
**1.0.0 d'août**. Tous les correctifs d'impression depuis sont dans le code mais
**pas dans l'APK publié**. C'est pour ça que le premier ticket met toujours
15-20 s. Il n'y a pas de mise à jour automatique : l'application est installée à
la main, elle ne va jamais chercher une nouvelle version toute seule.

---

## Ce qu'il faut avoir une seule fois

**1. Java** (l'APK ne peut pas se construire sans) :

```bash
brew install --cask temurin@21
```

**2. Le SDK Android.** S'il est déjà là (`~/Library/Android/sdk`), il suffit de
créer le fichier qui dit à Gradle où le trouver :

```bash
echo "sdk.dir=$HOME/Library/Android/sdk" > bridge/android/local.properties
```

**3. La clé de signature.** Copier le modèle et remplir les quatre valeurs avec
la clé d'août :

```bash
cp bridge/android/keystore.properties.example bridge/android/keystore.properties
```

⚠️ Ce fichier et le `.jks` ne doivent **jamais** être commités. Ils sont déjà
dans `.gitignore`.

---

## Construire et publier

```bash
git pull
app/android/gradlew -p bridge/android assembleRelease
cp bridge/android/app/build/outputs/apk/release/app-release.apk downloads/kiwi-print-bridge.apk
git add downloads/kiwi-print-bridge.apk
git commit -m "printer · publier le pont Android v1.0.4"
git push https://github.com/zaka33333-hash/Kiwi.git main
git push https://github.com/badro99/Kiwi.git main
```

Vérifier que c'est bien parti (la taille doit avoir changé) :

```bash
curl -sI https://kiwi-os.com/downloads/kiwi-print-bridge.apk | grep -i content-length
```

---

## Sur la tablette du comptoir

1. Ouvrir `https://kiwi-os.com/downloads/kiwi-print-bridge.apk` dans le
   navigateur de la tablette, télécharger, appuyer pour installer.
   **Installer par-dessus — ne jamais désinstaller d'abord** : la désinstallation
   efface l'appairage et il faudrait refaire un code à six chiffres.
2. À l'ouverture, accepter la demande **« Ignorer les optimisations de batterie »**.
   C'est cette autorisation qui empêche Android d'endormir le pont.
3. Dans les applications récentes, épingler la carte Kiwi Print Bridge
   (cadenas / glisser vers le bas) pour que le système ne la ferme pas.
4. Vérifier la version : la notification et l'écran de l'application doivent
   afficher **1.0.4**. Si elle affiche encore 1.0.0, l'installation n'a pas pris.

---

## Vérifier que c'est réglé

Laisser la caisse tranquille **20 minutes sans commande**, puis lancer un
ticket. Il doit sortir en une seconde ou deux, pas en quinze.

Refaire le test le lendemain matin à l'ouverture, et surtout **après le jour de
fermeture** : c'est le cas que la version 1.0.4 corrige en plus.

---

## En attendant la mise à jour

Réglage à faire directement sur l'imprimante, sans rien installer : désactiver
**Energy Star / Auto Power Off / Sleep Mode / Wi-Fi Power Save** dans son
interface web, et réserver son adresse IP sur le routeur. Détails dans
[`PRINTER_POWER_SAVE.md`](PRINTER_POWER_SAVE.md).
