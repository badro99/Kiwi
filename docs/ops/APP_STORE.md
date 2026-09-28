> Release gate: see `docs/audits/2026-09-28-app-store-release.md`. This runbook is not proof of submission readiness.

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

Les deux revues exigent un compte qui marche. Le créer par le parcours normal
d'inscription marchand, jamais à la main dans D1. Le 27 septembre 2026,
`demo-review@kiwi-os.com` a été créé par l'inscription normale dans Chrome avec
le nom « Kiwi App Review » et l'établissement « Kiwi Review Demo » (restaurant).
**Ce n'est pas encore un compte de revue prêt** : l'onboarding s'est arrêté à
la saisie obligatoire du code propriétaire, que seul le titulaire doit faire.
L'alias mail, le marquage opérateur `demo`, la carte et le parcours du binaire
candidat restent à vérifier. **Amira est aussi un espace de démonstration,
pas un compte commerçant réel** : il peut servir aux contrôles non destructifs,
mais ne vaut pas à lui seul un parcours App Review vérifié. Ne pas utiliser
les comptes des commerçants réels. Le 27 septembre, une session Amira Boutique
était visible dans Chrome ; cela ne vérifie pas la connexion dans le binaire iOS :

- e-mail `demo-review@kiwi-os.com`, établissement **« Kiwi Review Demo »**,
  activité restaurant. Vérifier l'alias Zoho, la formule Pro et les fonctions
  dépôt-vente/nutrition avant de les annoncer à la revue.
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
| Classification | À calculer avec le questionnaire Apple actuel sur le binaire final. Examiner notamment l’assistant IA, les liens web et le contenu partagé ; ne pas répondre Non par défaut. |
| Droits sur le contenu | Vérifier les droits et licences des icônes, polices et contenus embarqués avant attestation. |
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
iPhone. Record sales offline, use a compatible receipt printer and follow your business.

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
  quand l’imprimante répond. Vérifiez les reçus après toute interruption.
· Codes personnels pour chaque membre de l'équipe.

Cuisine
· Suivez les commandes synchronisées sur l’écran cuisine et imprimez les bons
  de préparation sur une imprimante compatible et configurée.

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
  printer is available. Check receipts after an interruption.
· A personal code for every member of staff.

Kitchen
· Follow synchronized orders on the kitchen screen and print preparation tickets
  with a configured, compatible printer.

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
  ولا حاسوب. تُرسل التذاكر المعلقة عند توفر الطابعة. تحقّق من الإيصالات بعد أي انقطاع.
· رمز شخصي لكل عضو في الفريق.

المطبخ
· تابع الطلبات المتزامنة على شاشة المطبخ واطبع تذاكر التحضير بطابعة متوافقة ومهيأة.

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

Inventaire technique à confirmer dans App Store Connect pour le binaire final ; voir `PrivacyInfo.xcprivacy`,
`assets/err-reporter.js` et de `privacy.html` §2. **Utilisation pour le suivi publicitaire (tracking) : Non.**

| Donnée | Collectée | Liée à l'utilisateur | Finalité | Pourquoi |
|---|---|---|---|---|
| Adresse e-mail | Oui | Oui | Fonctionnement de l'app | identifiant de connexion du compte |
| Nom | Oui | Oui | Fonctionnement | nom du contact et de l'établissement |
| Identifiant utilisateur | Oui | Oui | Fonctionnement | id de compte |
| Identifiant d'appareil | Oui | Oui | Fonctionnement | id d'appareil généré par Kiwi pour l'appairage |
| Autres informations financières | Oui | Oui | Fonctionnement | ventes du commerçant (montant, mode, libellé) ; aucune carte bancaire |
| Données de plantage · autres diagnostics | Oui | Oui | Fonctionnement | rapports expurgés vers /api/error |
| Photos et documents | Oui | Oui | Fonctionnement | médias choisis pour stock, menu et assistant IA |
| Numéro de téléphone | Oui | Oui | Fonctionnement | coordonnées des clients et contacts enregistrés |
| Audio | Oui | Oui | Fonctionnement | dictée et traitement vocal via Cloudflare Workers AI |
| Autre contenu utilisateur | Oui | Oui | Fonctionnement | messages, documents et contexte envoyés à l’assistant |
| Adresse physique | Oui | Oui | Fonctionnement | adresse de la fiche client / voyageur |
| Informations de paiement | Oui | Oui | Fonctionnement | mode de règlement enregistré, pas de numéro de carte |
| Historique d’achats | Oui | Oui | Fonctionnement | achats, visites, dépenses et fidélité des clients |
| Santé | Oui | Oui | Fonctionnement | allergies facultatives dans la fiche voyageur, pas de HealthKit |
| Informations sensibles | Oui | Oui | Fonctionnement | besoins d’accessibilité facultatifs pouvant révéler un handicap |
| Assistance client | Oui | Oui | Fonctionnement | demandes, réponses, pièces jointes et diagnostic |
| Autres types de données | Oui | Oui | Fonctionnement | anniversaire, genre, nationalité, référence de document d’identité |
| Historique de recherche | Oui | Oui (déclaration conservatrice) | Fonctionnement, analyse | recherches dans l’aide enregistrées après masquage e-mail / chiffres |
| Interaction avec le produit | Oui | Oui (déclaration conservatrice) | Fonctionnement, analyse | avis utile / inutile sur les articles d’aide |
| Position GPS, carnet de contacts de l’appareil, historique de navigation externe, identifiants publicitaires | Non | | | |

Sources : `functions/api/clients.js` (champs explicitement persistés),
`functions/api/support/tickets.js`, `attachments.js`, `articles.js` (recherches et avis),
les ventes et la fidélité. Les champs facultatifs de santé ne sont pas une permission
HealthKit. Les textes libres ne justifient pas à eux seuls toutes les catégories possibles.
Le serveur d’aide ne stocke pas d’identifiant de compte dans ses tables de recherches
et avis ; le manifeste garde une déclaration « liée » conservatrice tant que les
journaux et possibilités de rapprochement côté hébergeur ne sont pas audités.

Google, en plus : données chiffrées en transit **Oui** ; l'utilisateur peut demander
la suppression **Oui** (dpo@kiwi-os.com, et le formulaire de §5) ; partage avec des
prestataires à déclarer selon les définitions de la boutique, dont Cloudflare Workers AI ; l'app est destinée aux **professionnels, 18 ans et plus** ; pas de
publicité ; questionnaire IARC à compléter honnêtement sur les fonctions du binaire final.
Permission `CAMERA` : déclarer « scan de codes-barres et photo de bons de livraison ».

## 5. Notes pour la revue (à coller dans App Review Information · App access)

> Kiwi Pro is a business app for merchants who already have a Kiwi account
> (created by Kiwi when they subscribe, outside the app). Sign in with the
> demo account provided in the Sign-In Information fields.
>
> After sign-in, choose a role in native setup. Till and Kitchen pair with a
> code generated under Dashboard › Devices. Kiwi Team uses an employee code
> shown under Dashboard › Team. On a phone, the native More button in every
> workspace opens Change role, Sign out and Delete my account.
>
> The app asks for Local Network access the first time you open Printer › Test:
> it sends ESC/POS tickets to a thermal printer on the Wi-Fi (TCP port 9100). No
> printer is needed for review: tickets queue and the app keeps working.
> Camera is only used when the merchant scans a barcode or photographs a delivery
> note.
>
> There are no in-app purchases, no subscriptions sold in the app, no ads, no
> tracking, no third-party login. Account deletion: native More › Delete my
> account opens an owner-authenticated request. It asks for the account password
> and records the request server-side; Kiwi processes it within 30 days. The
> same request is available under Dashboard › Settings › Security.

Les trois points qu'Apple refuse le plus souvent sur ce genre d'app, et notre
réponse :
- **2.1 / compte qui ne marche pas** → compte démo testé la veille de l'envoi.
- **4.2 fonctionnalités minimales (« c'est un site web emballé »)** → montrer dans
  le binaire candidat la configuration SwiftUI, la navigation native avec libellés,
  Face ID au déverrouillage, le retour haptique, la conservation locale des ventes
  hors ligne et le test d'impression TCP sur le réseau local. Ne pas présenter une
  capacité non vérifiée comme une démonstration réussie.
- **5.1.1 (v) suppression de compte** → la règle s'applique dès qu'un compte sert
  à se connecter, même créé hors de l'app, et le chemin doit partir **de l'app**.
  Le parcours natif **Plus › Supprimer mon compte** et Paramètres › Sécurité &
  Intégrations appellent `/api/account/deletion-request` après confirmation du mot
  de passe propriétaire. La suppression effective reste un geste de l'opérateur
  dans la console, sous 30 jours ; vérifier cette étape avant soumission.

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

**Résumé.** Les fichiers du dépôt et les tests automatisés ne constituent pas
une autorisation de lancement. Vérifier le compte de revue (§2), le binaire
exact et son empreinte, les captures et réponses App Privacy dans App Store
Connect, puis la matrice sur appareils réels de `APP.md`. Une archive, un
upload accepté, l'affectation TestFlight et une soumission App Review sont
quatre états distincts. Les formalités du compte Apple dépendent du titulaire
réel ; ne pas déduire son statut de ce document.
