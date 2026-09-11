# Mesure SEO et AEO des guides Kiwi

Le contrôle automatique prouve que les pages sont publiables et accessibles. Il ne prouve pas qu’elles sont indexées, bien classées ou citées par un moteur de réponse.

## Contrat automatique

Chaque lundi, `.github/workflows/seo-watch.yml` vérifie depuis le dépôt principal :

- la génération déterministe des guides et du sitemap ;
- l’âge des pages qui portent des affirmations fiscales, sanitaires ou administratives ;
- les redirections permanentes vers l’origine canonique ;
- toutes les URL manifestées (24 actuellement), leur statut 200 direct, leur canonical, leurs alternates exacts et leur présence dans le sitemap ;
- la découverte des six guides depuis chaque landing locale.

Les dates de revue juridique vivent dans `content/guides/manifest.mjs` sous `legalReviewDate`. Une date n’est avancée qu’après relecture des sources primaires et mise à jour du texte. Le job planifié échoue au-delà de 90 jours.

## Baseline Search Console

Aucun chiffre n’est inventé dans le dépôt. Une fois l’accès à la propriété de domaine `kiwi-os.com` disponible :

1. soumettre `https://kiwi-os.com/sitemap.xml` ;
2. enregistrer une baseline de 28 jours avant toute conclusion ;
3. filtrer les pages contenant `/guides/`, puis séparer FR, EN et AR ;
4. suivre clics, impressions, CTR et position par page, requête, pays et appareil ;
5. séparer les requêtes de marque des requêtes non marque ;
6. annoter chaque date de publication ou modification dans le journal de mesure.

Le tableau mensuel doit montrer les pages manifestées valides et indexées, les requêtes non marque qui gagnent ou perdent des impressions, les pages proches des positions 4 à 20 et les contenus sans impression après un cycle complet. Les impressions précèdent les clics ; le trafic précède les demandes commerciales.

### Point zéro · 24 août 2026

- propriété de domaine `kiwi-os.com` vérifiée par enregistrement DNS TXT ;
- `https://kiwi-os.com/sitemap.xml` soumis et accepté avec le statut `Success` ;
- 24 pages découvertes, 0 vidéo ;
- performances, indexation, expérience et enrichissements encore indiqués comme « Processing data » par Search Console ;
- clics, impressions, CTR et position non disponibles à ce stade, donc aucune valeur zéro n'est enregistrée à leur place ;
- première revue glissante de 28 jours prévue le 21 septembre 2026, puis revue mensuelle par locale et par guide.

## Conversion et AEO

Pour les guides, la conversion utile est un clic vers la démonstration WhatsApp ou une autre prise de contact confirmée. Aucun nouveau traceur n’est ajouté par ce chantier. Si une mesure consentie existe déjà, nommer l’événement une seule fois et conserver la page, la locale et le placement du CTA.

La revue AEO mensuelle reste manuelle : tester les questions principales en français, anglais et arabe, noter si Kiwi est cité, quelle URL est reprise et si la réponse respecte les limites du guide. Une citation isolée n’est pas une tendance ; conserver la date, le moteur, la question exacte et une capture.
