/* Le cadre partagé des pages publiques générées : guides (tools/build-guides.mjs)
 * et fonctionnalités (tools/build-features.mjs). En-tête de la landing, pied de
 * page recopié de la landing de chaque langue, liens hreflang, échappement et
 * estampilles. Un seul endroit, pour que les deux familles de pages ne
 * divergent pas (même nav, même menu de langue, même lien de démo). */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FEATURE_HUB } from '../content/features/manifest.mjs';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE = 'https://kiwi-os.com';

/* assets/fonts/legacy-faces.css (design 2027, stage 1): the guides declare the
 * historical Arabic family from the self-hosted file, before article.css. Its
 * stamp is the one tools/bump-stamp.js seals in tools/asset-stamps.json, so a
 * bump there and a rebuild here always agree. */
export const LEGACY_FACES_V = (() => {
  try {
    const seal = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/asset-stamps.json'), 'utf8'))['assets/fonts/legacy-faces.css'];
    if (seal && seal.v) return seal.v;
  } catch (_) { /* reported below */ }
  throw new Error('build-guides: no stamp for assets/fonts/legacy-faces.css in tools/asset-stamps.json');
})();

export const UI = Object.freeze({
  fr: {
    dir: 'ltr', language: 'fr-MA', ogLocale: 'fr_MA', home: 'Accueil',
    brandLabel: 'Kiwi · accueil', navLabel: 'Navigation principale', features: 'Fonctionnalités',
    guides: 'Guides', pricing: 'Tarifs', security: 'Sécurité', signIn: 'Se connecter', demo: 'Demander une démo',
    menu: 'Menu', languagePicker: 'Choisir la langue', languageName: 'Français', skipArticle: 'Aller à l’article', skipHub: 'Aller aux guides',
    author: 'Équipe Kiwi',
    previousGuide: 'Guide précédent', nextGuide: 'Guide suivant',
    sequenceLabel: 'Guide précédent et suivant',
    orgDescription: 'Kiwi édite un logiciel de caisse et de gestion utilisé par des cafés, restaurants et commerces au Maroc. Les guides sont écrits à partir de ce que les équipes observent en service.',
  },
  en: {
    dir: 'ltr', language: 'en-MA', ogLocale: 'en_US', home: 'Home',
    brandLabel: 'Kiwi · Home', navLabel: 'Main navigation', features: 'Features',
    guides: 'Guides', pricing: 'Pricing', security: 'Security', signIn: 'Sign in', demo: 'Book a demo',
    menu: 'Menu', languagePicker: 'Choose language', languageName: 'English', skipArticle: 'Skip to the article', skipHub: 'Skip to the guides',
    author: 'Kiwi Team',
    previousGuide: 'Previous guide', nextGuide: 'Next guide',
    sequenceLabel: 'Previous and next guide',
    orgDescription: 'Kiwi builds point-of-sale and management software used by cafes, restaurants and shops in Morocco. These guides are written from what the teams observe during real service.',
  },
  ar: {
    dir: 'rtl', language: 'ar-MA', ogLocale: 'ar_MA', home: 'الرئيسية',
    brandLabel: 'Kiwi · الرئيسية', navLabel: 'التنقل الرئيسي', features: 'الخصائص',
    guides: 'الأدلة', pricing: 'الأسعار', security: 'الأمان', signIn: 'تسجيل الدخول', demo: 'اطلب عرضا توضيحيا',
    menu: 'القائمة', languagePicker: 'اختر اللغة', languageName: 'العربية', skipArticle: 'انتقل إلى المقال', skipHub: 'انتقل إلى الأدلة',
    author: 'فريق Kiwi',
    previousGuide: 'الدليل السابق', nextGuide: 'الدليل التالي',
    sequenceLabel: 'الدليل السابق والتالي',
    orgDescription: 'تطوّر Kiwi برنامج كاشير وإدارة تستعمله مقاه ومطاعم ومتاجر في المغرب. تُكتب هذه الأدلة انطلاقا من ما تلاحظه الفرق أثناء الخدمة الفعلية.',
  },
});

export const plainText = (markup) => String(markup)
  .replace(/<script[\s\S]*?<\/script>/g, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;|&#xA0;|&#160;/gi, ' ')
  .replace(/&amp;/g, '&')
  .replace(/&lt;/g, '<')
  .replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&[a-zA-Z0-9#]+;/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

export const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
export const json = (value) => JSON.stringify(value, null, 2)
  .replaceAll('<', '\\u003c')
  .replaceAll(' ', '\\u2028')
  .replaceAll(' ', '\\u2029');
export const absolute = (route) => SITE + route;

/* La feuille de démo et la liste des métiers sont des assets ESTAMPILLÉS de la
 * landing : leur URL doit changer quand leur contenu change, sinon le cache de
 * Cloudflare (max-age 4 h, puis stale-while-revalidate 7 jours) continue de
 * servir l'ancienne version aux guides, comme le 13 octobre 2026. On lit donc
 * l'estampille dans tools/asset-stamps.json, que `bump-stamp` tient à jour.
 * bump-stamp ne réécrit pas les pages générées : après un bump, `--check`
 * échoue bruyamment jusqu'à ce qu'on relance le générateur. */
const STAMPS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'asset-stamps.json'), 'utf8'));
export function stamp(asset) {
  const entry = STAMPS[asset];
  if (!entry || !entry.v) throw new Error(`${asset}: aucune estampille dans tools/asset-stamps.json`);
  return entry.v;
}

export const icon = (name, extra = '') => `<i class="ms${extra ? ' ' + extra : ''}" aria-hidden="true" style="--ms:url(/assets/icons/material/${name}.svg)"></i>`;

export function extractFooter(source, label) {
  const matches = source.match(/<footer\b[\s\S]*?<\/footer>/g) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one <footer>, found ${matches.length}`);
  return matches[0];
}

/* Le pied de page est copié tel quel depuis la landing de chaque langue, et
 * c'est voulu : une seule source pour le même pied partout. Mais ses liens de
 * section sont des ancres NUES (`#pricing`), écrites pour une page qui vit à
 * `/fr/`. Recopiées dans `/fr/guides/`, elles pointaient vers des ancres qui
 * n'existent pas sur la page des guides : le visiteur cliquait « Tarifs » et
 * ne bougeait pas. On les réécrit vers la landing de la même langue. Le lien
 * reste identique sur la landing elle-même, où `/fr/#pricing` et `#pricing`
 * désignent la même cible.
 *
 * Novembre 2026 : « Fonctionnalités » (`#features`) mène au hub des
 * fonctionnalités de la langue, qui détaille ce que la section de l'accueil
 * résume. */
export function localizeFooterAnchors(footer, locale) {
  return footer
    .replace(/href="#features"/g, `href="${FEATURE_HUB.routes[locale]}"`)
    .replace(/href="(#[^"]*)"/g, `href="/${locale}/$1"`);
}

export function alternateLinks(routes, locales) {
  return [
    ...locales.map((locale) => `  <link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}">`),
    `  <link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}">`,
  ].join('\n');
}

/* L'en-tête est celui de la landing (choix du propriétaire, octobre 2026 :
 * « le même monde que la page d'accueil ») : bande noire, logo clair, barre
 * centrale en verre avec la lentille liquide, « Se connecter », la démo en
 * pastille claire et un menu de langue. Sur téléphone, la landing garde la
 * langue et un menu ; on fait de même avec deux <details>, sans JavaScript,
 * au lieu de cacher la navigation et la langue (audit H2).
 *
 * « Demander une démo » ouvre la feuille de la landing sur place
 * (assets/landing-demo-funnel.js, chargé par la page, data-kiwi-demo) ; sans
 * script, le lien mène à la landing qui l'ouvre à l'arrivée (?demo=1).
 *
 * `active` dit quelle entrée de la barre porte la page : « guides » ou
 * « features ». « Fonctionnalités » mène au hub des fonctionnalités. */
export function header(locale, routes, locales, active) {
  const ui = UI[locale];
  const languageLinks = locales.map((code) => {
    const current = code === locale ? ' aria-current="true"' : '';
    return `<a href="${esc(routes[code])}" hreflang="${code}" lang="${code}"${current}><b>${code.toUpperCase()}</b>${esc(UI[code].languageName)}</a>`;
  }).join('');
  const links = [
    [FEATURE_HUB.routes[locale], ui.features, active === 'features'], [`/${locale}/#security`, ui.security],
    [`/${locale}/#pricing`, ui.pricing], [`/${locale}/guides/`, ui.guides, active === 'guides'],
  ];
  const lens = links.map(([href, label, on]) => `<a data-lens-item${on ? ' class="on"' : ''} href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  const sheet = links.map(([href, label, on]) => `<a href="${href}"${on ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  const demo = (extra) => `<a class="button nav-demo${extra}" href="/${locale}/?demo=1" data-kiwi-demo>${esc(ui.demo)} <span class="arrow" aria-hidden="true">${icon('north_east')}</span></a>`;

  return `<header class="site-header">
    <div class="nav-shell">
      <a class="brand" href="/${locale}/" aria-label="${esc(ui.brandLabel)}"><img src="/images/kiwi-logo.svg" width="855" height="455" alt=""></a>
      <nav class="nav-center" data-lens-demo aria-label="${esc(ui.navLabel)}">${lens}</nav>
      <div class="nav-end">
        <a class="nav-signin" href="/dashboard.html">${esc(ui.signIn)}</a>
        <span class="nav-rule" aria-hidden="true"></span>
        ${demo('')}
        <details class="language-menu">
          <summary aria-label="${locale.toUpperCase()}, ${esc(ui.languagePicker)}"><span>${locale.toUpperCase()}</span>${icon('expand_more')}</summary>
          <div class="menu-pop" role="group" aria-label="${esc(ui.languagePicker)}">${languageLinks}</div>
        </details>
        <details class="nav-menu">
          <summary aria-label="${esc(ui.menu)}">${icon('menu', 'when-closed')}${icon('close', 'when-open')}</summary>
          <div class="menu-pop menu-sheet"><nav aria-label="${esc(ui.navLabel)}">${sheet}<a href="/dashboard.html">${esc(ui.signIn)}</a></nav>${demo(' nav-demo--block')}</div>
        </details>
      </div>
    </div>
  </header>`;
}

/* Les lignes du sitemap : chaque page liste toutes ses langues et le
 * x-default (le français). */
export function sitemapRow(route, routes, lastmod, locales) {
  const links = [
    ...locales.map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}" />`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}" />`,
  ].join('');
  const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `<url><loc>${esc(absolute(route))}</loc>${modified}${links}</url>`;
}

/* Écrire, ou en mode --check, comparer et noter la dérive. */
export function writeOrCheck(file, expected, drift, check) {
  if (check) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (actual !== expected) drift.push(path.relative(ROOT, file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected);
  console.log(`built ${path.relative(ROOT, file)}`);
}
