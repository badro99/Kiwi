# Kiwi Pro · fiche App Store et Google Play, prête avant le paiement

*Créé le 2026-08-23. Complète `docs/ops/APP.md` (construire, signer, TestFlight,
rollback). Ce document contient tout ce que les deux boutiques demandent, rédigé à
l'avance, pour que le jour où le compte Apple est payé il n'y ait plus qu'à coller.*

---

## 0. Ce qui est déjà fait dans le dépôt (2026-08-23)

- **Pages publiques.** `privacy.html`, `terms.html`, `mentions-legales.html`,
  `cookies.html` et la nouvelle `support.html` passent la porte sans session
  (`functions/_middleware.js`). Apple et Google ouvrent l'URL de confidentialité
  et l'URL d'assistance sans compte ; avant, elles répondaient 401.
- **Politique de confidentialité** : section 2.4 « Application Kiwi Pro » (réseau
  local, identité d'appareil dans le Trousseau, diagnostic expurgé, appareil photo,
  pas d'achat intégré). Version 2.2.
- **Info.plist** : `NSCameraUsageDescription` (le scan code-barres boutique appelle
  `getUserMedia` dans la WebView ; sans la clé iOS tue l'app au premier scan),
  `CFBundleLocalizations` fr · en · ar, `UIRequiredDeviceCapabilities` = `arm64`
  (armv7 est retiré des cibles iOS 15+), `ITSAppUsesNonExemptEncryption = NO`,
  `NSLocalNetworkUsageDescription` + `NSBonjourServices`, `PrivacyInfo.xcprivacy`.
- **Android** : signature release lue depuis `app/android/keystore.properties`
  (ignoré, modèle `.example`) ou quatre variables `KIWI_ANDROID_*` ; sans clé,
  `bundleRelease` sort non signé et rien ne peut fuir dans Git.
- **iOS** : `app/ios/ExportOptions.plist` (modèle, Team ID injecté) et
  `tools/app-archive.sh` (build → sync → archive → export, `--upload` vers
  App Store Connect). `tools/app-release-test.mjs` garde tout ça dans `check.js`.
- Icône 1024 et écran de lancement (marque, fond `--paper`) : déjà les bons fichiers.

## 1. Le jour du paiement · à faire par le propriétaire, dans l'ordre

**Décision du 2026-08-23 : inscription *Individuel* d'abord, au nom du partenaire** (Apple
vérifie l'identité avec une pièce à photo ; brief en anglais pour lui :
`docs/ops/APP_STORE_PARTNER_BRIEF.md`). Aucune société n'est
encore immatriculée, donc ni D-U-N-S ni inscription *Organisation* possibles. Les deux
comptes s'ouvrent au nom du propriétaire ; l'app sera **transférée** au compte de la
société une fois celle-ci créée (App Store Connect → App → Transfer App ; Play Console →
Transfert d'application). Rien dans Kiwi Pro ne bloque un transfert : pas d'achat
intégré, pas d'iCloud, pas de Passkeys, pas d'App Group. Le vendeur affiché sur la
fiche est le nom de la personne jusqu'au transfert.

### Apple (99 USD / an, Individuel)
1. `mentions-legales.html` nomme l'éditeur personne physique (nom, adresse, directeur
   de la publication) : Apple compare l'identité du compte à celle de la politique de
   confidentialité.
2. Apple ID personnel avec **authentification à deux facteurs**, puis
   developer.apple.com → Enroll → *Individual / Sole Proprietor*. Pièce d'identité
   demandée (l'app Apple Developer sur iPhone accélère la vérification) ; paiement par
   carte ; activation 24 à 48 h.
3. Dans le compte : noter le **Team ID** (10 caractères). Il vit en variable
   d'environnement `KIWI_DEVELOPMENT_TEAM`, jamais dans le dépôt.
4. Xcode › Settings › Accounts : ajouter le compte, sélectionner l'équipe.
5. App Store Connect › Apps › + : nom **Kiwi Pro**, langue principale **Français**,
   bundle **com.kiwios.pro** (irréversible, P7 confirmé), SKU `kiwi-pro-ios`.
6. Premier envoi : `KIWI_DEVELOPMENT_TEAM=… sh tools/app-archive.sh --upload`, puis
   §3 de ce document pour la fiche, §4 pour la confidentialité, §5 pour la revue.

### Google (25 USD, une fois, compte personnel)
1. Play Console → compte **Personnel** (vérification d'identité du titulaire, 1 à
   3 jours ; Google exige depuis 2023 que les comptes personnels passent un test
   fermé avec 12 testeurs pendant 14 jours avant la production : la piste interne
   sert à Browse et à la revue, la production attend ce délai ou le compte
   Organisation).
2. Créer l'app « Kiwi Pro », catégorie Business, gratuite.
3. Générer la clé d'upload **une seule fois** (commande dans
   `app/android/keystore.properties.example`), la sauvegarder hors machine, activer
   **Play App Signing**. `cd app/android && ./gradlew bundleRelease` → l'AAB dans
   `app/build/outputs/bundle/release/`.
4. Piste **test interne** d'abord (tablette Android de Browse), production ensuite.

### Plus tard, quand la société existe
D-U-N-S (gratuit, dnb.com, 5 à 10 jours ouvrés) → compte Apple *Organisation* et
Play Console *Organisation* → transfert des deux apps → `mentions-legales.html`
complétée avec RC, IF, TP, ICE.

## 2. Compte démo pour la revue (P5)

Les deux revues exigent un compte qui marche. Le créer depuis la console
opérateur (`kiwi-admin.html`), jamais à la main dans D1 :

- e-mail `demo-review@kiwi-os.com` (alias Zoho, gratuit), établissement
  **« Kiwi Démo »**, activité restaurant, formule Pro, dépôt-vente et nutrition
  activés pour montrer la carte complète.
- Publier une carte d'une vingtaine d'articles avec prix, une formule, deux
  recettes complètes (la nutrition s'affiche), trois employés avec codes. Tout
  est prêt dans `docs/ops/demo-review/` : le CSV de la carte (Menu → Importer)
  et le détail de la formule, des recettes et des salariés à saisir.
- **Ne rien appairer d'avance** : la revue doit pouvoir faire Tableau de bord →
  code d'appairage → Caisse dans le même appareil, c'est ce que décrivent les notes.
- Le mot de passe va dans le champ *Sign-In Information* d'App Store Connect et
  dans *App access* de la Play Console. Nulle part ailleurs : pas dans ce dépôt,
  pas dans un message, pas dans une capture.
- Le compte est un compte réel de D1 : le marquer `demo` côté opérateur pour qu'il
  n'entre jamais dans les chiffres clients.

## 3. Fiche App Store Connect

| Champ | Valeur |
|---|---|
| Nom | **Kiwi Pro** |
| Sous-titre (30) | FR « Caisse, équipe et cuisine » · EN « POS, team and kitchen » · AR « الكاشير والفريق والمطبخ » |
| Catégorie | Business · secondaire Food & Drink |
| Prix | Gratuit · disponible dans tous les pays (pas d'achat intégré) |
| URL d'assistance | https://kiwi-os.com/support.html |
| URL marketing | https://kiwi-os.com/fr |
| URL confidentialité | https://kiwi-os.com/privacy.html |
| Copyright | © 2026 *entité des mentions légales* |
| Classification | **4+** (toutes les questions : Non ; pas de contenu généré par les utilisateurs visible d'autres utilisateurs, pas d'achats, pas d'accès web non filtré) |
| Droits sur le contenu | Aucun contenu tiers |
| Chiffrement | Exempt (HTTPS uniquement ; `ITSAppUsesNonExemptEncryption = NO`, rien à téléverser) |
| Sign in with Apple | Non requis : aucune connexion via un tiers, comptes créés par Kiwi hors de l'app |
| Version · build | `MARKETING_VERSION` 1.0 · `CURRENT_PROJECT_VERSION` 1, incrémentés à chaque archive |

### Mots-clés (100 caractères, sans espaces après les virgules)

FR : `caisse,POS,restaurant,café,cuisine,ticket,stock,équipe,imprimante,Maroc,commerce,carte`
EN : `pos,point of sale,restaurant,cafe,kitchen,receipt,inventory,staff,printer,morocco,retail,menu`
AR : `كاشير,نقطة بيع,مطعم,مقهى,مطبخ,تذكرة,مخزون,فريق,طابعة,المغرب,تجارة,قائمة`

### Texte promotionnel (170)

FR : Kiwi Pro met la caisse, la cuisine, l'équipe et le tableau de bord de votre
établissement sur iPad et iPhone. Hors ligne, tickets imprimés en direct, chiffres
à jour.
EN : Kiwi Pro puts your till, kitchen screen, team app and dashboard on iPad and
iPhone. Works offline, prints tickets instantly, keeps your numbers live.

### Description (4000)

**FR**

Kiwi Pro est l'application des commerçants qui utilisent Kiwi : la caisse, l'écran
cuisine, l'app équipe et le tableau de bord, dans une seule app, sur iPad et iPhone.

Caisse
· Encaissement rapide, articles, formules, remises, modes de règlement.
· Fonctionne sans réseau : les ventes sont gardées sur l'appareil et se
  synchronisent dès que la connexion revient.
· Impression directe des tickets et reçus sur l'imprimante thermique du comptoir,
  en Wi-Fi, sans boîtier ni ordinateur. Les tickets en attente partent d'eux-mêmes
  quand l'imprimante répond, sans doublon.
· Codes personnels pour chaque membre de l'équipe.

Cuisine
· Les commandes arrivent sur l'écran cuisine et l'imprimante de la cuisine à la
  seconde où elles sont encaissées.

Équipe
· Pointage, horaires, heures travaillées, un code par employé.

Tableau de bord
· Chiffre d'affaires, ventes par article, stock, recettes et coûts, carte du
  restaurant avec valeurs nutritionnelles et allergènes, tout en direct depuis la
  caisse.
· En français, en anglais et en arabe, en clair comme en sombre.

Kiwi Pro se connecte avec le compte Kiwi de votre établissement. L'app ne vend
rien et ne contient aucun achat intégré : l'abonnement se règle entre Kiwi et le
commerçant. Pour découvrir Kiwi : kiwi-os.com.

**EN**

Kiwi Pro is the app for merchants who run their business on Kiwi: the till, the
kitchen screen, the team app and the dashboard, in one app, on iPad and iPhone.

Till
· Fast checkout, items, set menus, discounts, payment methods.
· Works offline: sales are kept on the device and sync as soon as the connection
  is back.
· Prints tickets and receipts straight to the counter's thermal printer over
  Wi-Fi, with no box and no computer. Pending tickets print themselves when the
  printer answers, never twice.
· A personal code for every member of staff.

Kitchen
· Orders reach the kitchen screen and the kitchen printer the second they are
  rung up.

Team
· Clock-in, schedules, hours worked, one code per employee.

Dashboard
· Revenue, sales per item, stock, recipes and costs, the restaurant menu with
  nutrition and allergens, all live from the till.
· French, English and Arabic, light and dark.

Kiwi Pro signs in with your establishment's Kiwi account. The app sells nothing
and has no in-app purchases: the subscription is settled between Kiwi and the
merchant. Discover Kiwi at kiwi-os.com.

**AR**

كيوي برو هو تطبيق التجار الذين يديرون نشاطهم على كيوي: الكاشير، شاشة المطبخ،
تطبيق الفريق ولوحة المتابعة، في تطبيق واحد، على iPad وiPhone.

الكاشير
· تحصيل سريع، أصناف، عروض، تخفيضات، طرق الدفع.
· يعمل بدون إنترنت: تُحفظ المبيعات على الجهاز وتتزامن فور عودة الاتصال.
· طباعة مباشرة للتذاكر والإيصالات على الطابعة الحرارية عبر الواي فاي، بدون علبة
  ولا حاسوب. التذاكر المعلقة تُطبع تلقائياً عند استجابة الطابعة، دون تكرار.
· رمز شخصي لكل عضو في الفريق.

المطبخ
· تصل الطلبات إلى شاشة المطبخ وطابعة المطبخ لحظة تسجيلها.

الفريق
· تسجيل الحضور، الجداول، ساعات العمل، رمز لكل موظف.

لوحة المتابعة
· رقم المعاملات، المبيعات حسب الصنف، المخزون، الوصفات والتكاليف، قائمة المطعم
  بالقيم الغذائية ومسببات الحساسية، كل ذلك مباشرة من الكاشير.
· بالفرنسية والإنجليزية والعربية، في الوضعين الفاتح والداكن.

يسجّل كيوي برو الدخول بحساب كيوي الخاص بمحلّك. التطبيق لا يبيع شيئاً ولا يحتوي على
مشتريات داخلية: الاشتراك يُسوّى بين كيوي والتاجر. اكتشف كيوي على kiwi-os.com.

### Captures d'écran (obligatoires avant la soumission, pas pour TestFlight)

Tailles acceptées : **iPad 13"** 2064 × 2752 (ou paysage 2752 × 2064) et **iPhone
6.9"** 1320 × 2868, de 3 à 10 par taille, PNG sans transparence. Les prendre sur
simulateur (`iPad Pro 13-inch (M4)`, `iPhone 16 Pro Max`) avec le compte démo :

```bash
xcrun simctl io booted screenshot ~/Desktop/kiwi-pro-01-caisse.png
```

Six scènes, dans cet ordre : Caisse avec un ticket en cours · Cuisine avec deux
commandes · Tableau de bord (chiffres du jour) · Carte avec nutrition · Équipe ·
Imprimante (test réussi). Pas de texte incrusté ni de cadre d'appareil dessiné :
la capture nue suffit et évite le rejet « métadonnées trompeuses ».

## 4. App Privacy (étiquettes) · et Data safety Google

Réponses à donner telles quelles ; elles découlent de `PrivacyInfo.xcprivacy`, de
`assets/err-reporter.js` et de `privacy.html` §2. **Aucun suivi (tracking) : Non.**

| Donnée | Collectée | Liée à l'utilisateur | Finalité | Pourquoi |
|---|---|---|---|---|
| Adresse e-mail | Oui | Oui | Fonctionnement de l'app | identifiant de connexion du compte |
| Nom | Oui | Oui | Fonctionnement | nom du contact et de l'établissement |
| Identifiant utilisateur | Oui | Oui | Fonctionnement | id de compte et id d'appareil généré par Kiwi |
| Autres informations financières | Oui | Oui | Fonctionnement | ventes du commerçant (montant, mode, libellé) ; aucune carte bancaire |
| Données de plantage · autres diagnostics | Oui | Oui | Fonctionnement | rapports expurgés vers /api/error |
| Photos | Oui | Oui | Fonctionnement | uniquement la photo de bon choisie par le commerçant (stock) |
| Localisation, contacts, historique de navigation, identifiants publicitaires, santé | Non | | | |

Google, en plus : données chiffrées en transit **Oui** ; l'utilisateur peut demander
la suppression **Oui** (dpo@kiwi-os.com, et le formulaire de §5) ; partage avec des
tiers **Non** ; l'app est destinée aux **professionnels, 18 ans et plus** ; pas de
publicité ; questionnaire IARC : application utilitaire → **Tous publics / PEGI 3**.
Permission `CAMERA` : déclarer « scan de codes-barres et photo de bons de livraison ».

## 5. Notes pour la revue (à coller dans App Review Information · App access)

> Kiwi Pro is a business app for merchants who already have a Kiwi account
> (created by Kiwi when they subscribe, outside the app). Sign in with the
> demo account provided in the Sign-In Information fields.
>
> After sign-in the app opens the Dashboard. To see the till: Dashboard › Devices
> › generate a 6-digit pairing code, then tap the Kiwi logo (or open
> "Change role") › Till › enter the code. Kitchen pairs the same way. The Team
> app signs in with an employee code shown in Dashboard › Team.
>
> The app asks for Local Network access the first time you open Printer › Test:
> it sends ESC/POS tickets to a thermal printer on the Wi-Fi (TCP port 9100). No
> printer is needed for review: tickets queue and the app keeps working.
> Camera is only used when the merchant scans a barcode or photographs a delivery
> note.
>
> There are no in-app purchases, no subscriptions sold in the app, no ads, no
> tracking, no third-party login. Account deletion: Settings › Security ›
> "Supprimer mon compte" opens a pre-filled request to dpo@kiwi-os.com and Kiwi
> deletes the account within 30 days; data export is next to it (CSV).

Les trois points qu'Apple refuse le plus souvent sur ce genre d'app, et notre
réponse :
- **2.1 / compte qui ne marche pas** → compte démo testé la veille de l'envoi.
- **4.2 fonctionnalités minimales (« c'est un site web emballé »)** → les notes
  nomment ce qui est natif : impression TCP directe, Trousseau, hors ligne,
  haptique, réseau local. Les captures montrent l'app, pas le site.
- **5.1.1 (v) suppression de compte** → la règle s'applique dès qu'un compte sert
  à se connecter, même créé hors de l'app, et le chemin doit partir **de l'app**.
  Fait : Paramètres › Sécurité & Intégrations › **Supprimer mon compte**
  (`assets/interactive.js`, action `settings-delete-account`) explique le délai de
  30 jours et ouvre le mail au DPO pré-rempli avec l'adresse du compte. La
  suppression effective reste un geste de l'opérateur dans la console, sous
  30 jours ; c'est le propriétaire qui s'y engage en répondant au mail.

## 6. TestFlight · « Quoi tester » (premier build)

> Build 1 · `git <hash>` · bundle `<12 premiers caractères>` (sortie de
> tools/app-archive.sh). Connexion propriétaire, appairage caisse + cuisine dans
> le même iPad, une vente, un ticket cuisine et un reçu sur le POS-8370 du
> comptoir, coupure du Wi-Fi pendant une vente puis retour, fermeture forcée et
> reprise, changement de langue fr/en/ar, mode sombre. Signaler tout écran où le
> clavier cache un champ.

Groupe **interne** uniquement jusqu'à la preuve terrain (docs/ops/APP.md §8,
matrice d'acceptation). Les testeurs externes ouvrent une revue TestFlight
allégée ; inutile avant.

## 7. Google Play · fiche

| Champ | Valeur |
|---|---|
| Nom (30) | Kiwi Pro |
| Description courte (80) | FR « La caisse, la cuisine, l'équipe et le tableau de bord de votre établissement. » |
| Description longue | la même qu'en §3 |
| Catégorie | Business |
| E-mail de contact | contact@kiwi-os.com |
| Site | https://kiwi-os.com/fr · confidentialité https://kiwi-os.com/privacy.html |
| Captures | téléphone 1080 × 1920 minimum (2 à 8), tablette 7" et 10" recommandées ; icône 512 × 512 ; image de présentation 1024 × 500 |
| Accès à l'app | « Tout ou partie des fonctionnalités sont restreintes » → identifiants du compte démo + les notes de §5 |
| Public cible | 18 ans et plus · pas destinée aux enfants |
| Annonces | Non |
| Niveau d'API | `targetSdk 36`, `minSdk 24` (variables.gradle) |

---

**Résumé.** Le dépôt ne bloque plus rien : pages publiques, manifeste, plist,
signature, script d'archive, textes et réponses sont prêts. Il reste au
propriétaire : mentions légales complètes, D-U-N-S, inscription Apple
Organisation, compte démo (§2), captures (§3) avant la soumission à la revue.
