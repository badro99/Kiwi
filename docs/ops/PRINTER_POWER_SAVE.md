# Configuration d'économie d'énergie et réveil instantané des imprimantes thermiques

Ce document décrit les causes matérielles et micrologicielles des latences d'impression constatées après une période d'inactivité (10–15 minutes), ainsi que les mesures logicielles et matérielles à appliquer pour garantir une impression instantanée (< 1 s) en continu.

---

## 1. Symptôme & Diagnostic Terrain (Cas Pasta Corner)

### Le phénomène
- **Symptôme** : Le premier ticket imprimé après une accalmie de 10 à 15 minutes prend entre 15 et 20 secondes sur l'imprimante comptoir et l'imprimante cuisine (`192.168.100.199:9100`).
- **Comportement consécutif** : Tout ticket imprimé immédiatement après sort en moins d'une seconde (500–1100 ms).
- **Architecture réelle** : Le client fait tourner le pont d'impression Kiwi sur une tablette Android (Blackview Tab 18, `pb_19b337f599c561fc`) connectée en Wi-Fi au relais cloud Kiwi, poussant les tickets en RAW TCP vers l'IP locale de l'imprimante.

### Cause racine
1. **Mise en veille micrologicielle (Firmware Sleep / Energy Star)** :
   Après 10 minutes sans trame réseau reçue, l'interface réseau (Ethernet ou Wi-Fi) de l'imprimante passe en veille basse consommation (IEEE 802.11 Power Save ou Energy Star).
2. **Fermeture silencieuse du socket 9100** :
   La pile réseau de l'imprimante coupe la connexion TCP sous-jacente sans envoyer de paquet `FIN` ou `RST`.
3. **Pénalité de reconnexion** :
   À la commande suivante, le premier paquet envoyé sur l'ancien socket échoue après timeout TCP (8–12 s), forçant une reconnexion, un réveil du contrôleur et une réinitialisation mécanique du moteur thermique (3–5 s), totalisant 15–20 s.
4. **Limites des versions initiales** :
   - L'application Android déployée chez le client était en v1.0.0 (sans logique keepalive).
   - Les tentatives précédentes sur PC utilisaient `ESC @` (0x1b 0x40), qui est bufferisé passivement par les firmwares sans provoquer de réponse, avec un intervalle de 30 s trop espacé.

---

## 2. Configuration Matérielle de l'Imprimante

Pour éliminer la latence à la source matérielle, ajuster les paramètres de l'imprimante thermique :

### A. Interface Web de l'imprimante (HTTP)
La majorité des imprimantes réseau (Epson TM-T20/TM-m30, Xprinter, Rongta, Munbyn, Bixolon) disposent d'un serveur web intégré accessible depuis un navigateur sur le même réseau local (`http://<IP_IMPRIMANTE>`):
1. Taper l'adresse IP de l'imprimante (ex. `http://192.168.100.199`) dans Chrome ou Safari.
2. Identifiants par défaut courants :
   - Epson : `epson` / `epson` ou numéro de série.
   - Xprinter : `admin` / `admin` ou `12345678`.
   - Rongta / Munbyn : `admin` / `admin`.
3. Désactiver les options suivantes :
   - **Energy Star / Auto Power Off** : Définir sur `Disabled` ou `Off`.
   - **Sleep Mode / Power Saving Mode** : Définir sur `Disabled` ou `0`.
   - **Wi-Fi Power Save (IEEE 802.11 PS)** : Désactiver (passer en mode `Active` / `Continuous`).
   - **TCP Keep-Alive Timeout** : Réduire à 30 secondes ou désactiver la coupure automatique.

### B. Micro-interrupteurs (DIP Switches)
Sur les modèles à micro-interrupteurs physiques situés sous l'imprimante (trappe vissée sous l'appareil) :
- Consulter le manuel spécifique du modèle pour repérer l'interrupteur `Energy Star` ou `Power Saving`.
- Sur Epson TM-T20 : vérifier que le switch d'auto-extinction n'est pas activé.

### C. Réservation DHCP / IP Fixe sur le routeur
- Fixer l'adresse IP de l'imprimante par réservation d'adresse MAC sur la box/routeur de la boutique.
- Cela évite toute renégociation de bail DHCP ou latence ARP pendant le réveil de la machine.

---

## 3. Architecture Logicielle Kiwi (Pre-warm & Active Probing)

Kiwi intègre désormais une architecture à trois niveaux pour empêcher toute mise en veille :

### 1. Sondage actif temps réel (`DLE EOT 1`)
- **Séquence** : `0x10, 0x04, 0x01` (Real-time status transmission - Printer status).
- **Mécanique** : Le pont envoie cette trame toutes les 10 secondes (`PRINTER_KEEPALIVE_MS = 10000`).
- **Effet** : Contrairement aux octets d'initialisation passifs, cette commande force la CPU et l'interface réseau de l'imprimante à répondre immédiatement par 1 octet d'état (papier, capot, erreur).
- **Réparation proactive** : Si la lecture échoue ou expire après 1500 ms, le pont détruit le socket et en ouvre un nouveau immédiatement. L'imprimante est donc déjà chaude quand le ticket arrive.

### 2. Préchauffe anticipée sur intention (`warmPrinter`)
- Dans `kiwi-caisse.html`, dès qu'un article est ajouté au panier (`pushCartLine`) ou dès que le caissier clique sur un mode de paiement (`openCashModal`, `openCardModal`), `KiwiHardware.warmPrinter()` est invoqué.
- Cette action envoie une requête de réveil (`POST /kiwi/wake` ou job de type `'wake'` via le relais cloud avec TTL court de 60 s).
- L'imprimante sort de son sommeil pendant que le caissier manipule la caisse, rendant l'impression finale instantanée.

### 3. Persistance et reprise au démarrage (`resumePrinterWarm`)
- L'adresse IP et le port de la dernière imprimante active sont persistés localement (`BridgeStore.saveWarmTarget` sur Android, `config.json` sur Node).
- Dès le redémarrage de la tablette ou du service en tâche de fond, le canal TCP est rétabli avant même la première commande du matin.

### 4. Télémétrie d'impression
Chaque impression mesure et remonte :
- `connectMs` : Temps de connexion TCP (0 ms si le canal était maintenu ouvert).
- `writeMs` : Temps d'écriture du buffer ESC/POS.
- `reused` : Booléen confirmant la réutilisation du socket chaud.
- `idleMs` : Temps écoulé depuis la dernière écriture/sonde.
- `totalMs` : Temps total de traitement.

---

## 4. Procédure de Mise à Jour Terrain

### Mise à jour de l'application Android sur la tablette client
1. Générer l'APK release signé (v1.0.2, versionCode 3) :
   ```bash
   app/android/gradlew -p bridge/android assembleRelease
   ```
2. Remplacer `downloads/kiwi-print-bridge.apk`.
3. Sur la tablette Blackview du client :
   - Ouvrir Chrome et télécharger la mise à jour depuis `https://kiwi-os.com/downloads/kiwi-print-bridge.apk`.
   - Installer l'APK (la mise à jour conserve l'association cloud existante sans avoir à ressaisir de code).
   - Ouvrir l'application pour confirmer l'état : `En ligne · Pasta Corner`.
