#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ASSET_VERSIONS, CATEGORIES, FEATURED, GOALS, HUBS, PATHS, PUBLISHED_LOCALES,
  TOPIC_CARDS, TOPIC_CATEGORY, TOPIC_GOALS, TOPICS,
} from '../content/guides/manifest.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SITE = 'https://kiwi-os.com';
const CHECK = process.argv.includes('--check');

const UI = Object.freeze({
  fr: {
    dir: 'ltr', language: 'fr-MA', ogLocale: 'fr_MA', home: 'Accueil',
    brandLabel: 'Kiwi · accueil', navLabel: 'Navigation principale', features: 'Fonctionnalités',
    guides: 'Guides', pricing: 'Tarifs', signIn: 'Se connecter', demo: 'Demander une démo',
    languagePicker: 'Choisir la langue', skipArticle: 'Aller à l’article', skipHub: 'Aller aux guides',
    author: 'Équipe Kiwi',
    previousGuide: 'Guide précédent', nextGuide: 'Guide suivant',
    sequenceLabel: 'Guide précédent et suivant',
    orgDescription: 'Kiwi édite un logiciel de caisse et de gestion utilisé par des cafés, restaurants et commerces au Maroc. Les guides sont écrits à partir de ce que les équipes observent en service.',
  },
  en: {
    dir: 'ltr', language: 'en-MA', ogLocale: 'en_US', home: 'Home',
    brandLabel: 'Kiwi · Home', navLabel: 'Main navigation', features: 'Features',
    guides: 'Guides', pricing: 'Pricing', signIn: 'Sign in', demo: 'Book a demo',
    languagePicker: 'Choose language', skipArticle: 'Skip to the article', skipHub: 'Skip to the guides',
    author: 'Kiwi Team',
    previousGuide: 'Previous guide', nextGuide: 'Next guide',
    sequenceLabel: 'Previous and next guide',
    orgDescription: 'Kiwi builds point-of-sale and management software used by cafes, restaurants and shops in Morocco. These guides are written from what the teams observe during real service.',
  },
  ar: {
    dir: 'rtl', language: 'ar-MA', ogLocale: 'ar_MA', home: 'الرئيسية',
    brandLabel: 'Kiwi · الرئيسية', navLabel: 'التنقل الرئيسي', features: 'الخصائص',
    guides: 'الأدلة', pricing: 'الأسعار', signIn: 'تسجيل الدخول', demo: 'اطلب عرضا توضيحيا',
    languagePicker: 'اختر اللغة', skipArticle: 'انتقل إلى المقال', skipHub: 'انتقل إلى الأدلة',
    author: 'فريق Kiwi',
    previousGuide: 'الدليل السابق', nextGuide: 'الدليل التالي',
    sequenceLabel: 'الدليل السابق والتالي',
    orgDescription: 'تطوّر Kiwi برنامج كاشير وإدارة تستعمله مقاه ومطاعم ومتاجر في المغرب. تُكتب هذه الأدلة انطلاقا من ما تلاحظه الفرق أثناء الخدمة الفعلية.',
  },
});

/* ── Bibliothèque · libellés localisés ───────────────────────────────────────
 * Le chrome (navigation, langues, liens d'évitement) vit dans UI ci-dessus.
 * Ici vivent uniquement les libellés de la bibliothèque : recherche, tri,
 * filtres, états vides et parcours. Les trois langues sont rédigées, pas
 * traduites mot à mot, et l'arabe isole chaque nombre avec <bdi dir="ltr">
 * pour que « 9 min » ne se réordonne pas au milieu d'une phrase RTL. */
const LIB = Object.freeze({
  fr: {
    toolsLabel: 'Rechercher et filtrer les guides',
    searchLabel: 'Rechercher un guide',
    searchPlaceholder: 'Rechercher un sujet, une question ou un guide…',
    searchHelp: 'La recherche porte sur les titres, les résumés, les catégories et les mots-clés. Tout se passe dans votre navigateur, sans compte ni envoi de données.',
    goalsTitle: 'Commencez par le problème que vous voulez régler',
    goalsLabel: 'Entrées par objectif',
    categoriesLabel: 'Filtrer par catégorie',
    allCategories: 'Tous les guides',
    sortLabel: 'Trier',
    sortRecommended: 'Recommandés',
    sortRecent: 'Plus récents',
    sortReading: 'Temps de lecture',
    featuredTitle: 'À lire en premier',
    featuredDeck: 'Les guides les plus récemment vérifiés.',
    gridTitle: 'Tous les guides',
    read: 'Lire le guide',
    category: 'Catégorie',
    minutes: (n) => `${n} min de lecture`,
    updated: (d) => `Mis à jour le ${d}`,
    published: (d) => `Publié le ${d}`,
    total: (n) => `${n} guides publiés`,
    filteredOne: (total) => `{n} guide affiché sur ${total}`,
    filteredMany: (total) => `{n} guides affichés sur ${total}`,
    emptyTitle: 'Aucun guide ne correspond à cette combinaison.',
    emptyBody: 'Essayez un autre mot, une autre catégorie, ou revenez à la bibliothèque complète.',
    reset: 'Réinitialiser les filtres',
    pathsTitle: 'Parcours guidés',
    pathsDeck: 'Des guides déjà publiés, remis dans l’ordre où une décision se prend. Aucun contenu en double.',
    step: (n) => `Étape ${n}`,
    pathLength: (n) => `${n} guides`,
    factGuides: 'Guides publiés', factLanguages: 'Langues', factUpdated: 'Dernière révision',
  },
  en: {
    toolsLabel: 'Search and filter the guides',
    searchLabel: 'Search a guide',
    searchPlaceholder: 'Search a topic, a question or a guide…',
    searchHelp: 'Search covers titles, summaries, categories and keywords. It runs in your browser, with no account and nothing sent anywhere.',
    goalsTitle: 'Start from the problem you need to solve',
    goalsLabel: 'Entry points by goal',
    categoriesLabel: 'Filter by category',
    allCategories: 'All guides',
    sortLabel: 'Sort',
    sortRecommended: 'Recommended',
    sortRecent: 'Most recent',
    sortReading: 'Reading time',
    featuredTitle: 'Read these first',
    featuredDeck: 'The guides verified most recently.',
    gridTitle: 'All guides',
    read: 'Read the guide',
    category: 'Category',
    minutes: (n) => `${n} min read`,
    updated: (d) => `Updated ${d}`,
    published: (d) => `Published ${d}`,
    total: (n) => `${n} published guides`,
    filteredOne: (total) => `{n} of ${total} guides shown`,
    filteredMany: (total) => `{n} of ${total} guides shown`,
    emptyTitle: 'No guide matches this combination.',
    emptyBody: 'Try another word, another category, or go back to the full library.',
    reset: 'Reset filters',
    pathsTitle: 'Guided paths',
    pathsDeck: 'Guides that are already published, put back in the order a decision actually gets made. Nothing is duplicated.',
    step: (n) => `Step ${n}`,
    pathLength: (n) => `${n} guides`,
    factGuides: 'Published guides', factLanguages: 'Languages', factUpdated: 'Last reviewed',
  },
  ar: {
    toolsLabel: 'ابحث في الأدلة وصنفها',
    searchLabel: 'ابحث عن دليل',
    searchPlaceholder: 'ابحث عن موضوع أو سؤال أو دليل…',
    searchHelp: 'يشمل البحث العناوين والملخصات والتصنيفات والكلمات المفتاحية. يعمل داخل متصفحك، دون حساب ودون إرسال أي بيانات.',
    goalsTitle: 'ابدأ من المشكلة التي تريد حلها',
    goalsLabel: 'مداخل حسب الهدف',
    categoriesLabel: 'التصفية حسب التصنيف',
    allCategories: 'كل الأدلة',
    sortLabel: 'ترتيب',
    sortRecommended: 'موصى بها',
    sortRecent: 'الأحدث',
    sortReading: 'زمن القراءة',
    featuredTitle: 'ابدأ بهذه',
    featuredDeck: 'الأدلة التي تمت مراجعتها حديثا.',
    gridTitle: 'كل الأدلة',
    read: 'اقرأ الدليل',
    category: 'التصنيف',
    minutes: (n) => `<bdi dir="ltr">${n}</bdi> دقيقة قراءة`,
    updated: (d) => `حُدّث في <bdi dir="ltr">${d}</bdi>`,
    published: (d) => `نُشر في <bdi dir="ltr">${d}</bdi>`,
    total: (n) => `<bdi dir="ltr">${n}</bdi> أدلة منشورة`,
    filteredOne: (total) => `<bdi dir="ltr">{n}</bdi> من <bdi dir="ltr">${total}</bdi> دليل معروض`,
    filteredMany: (total) => `<bdi dir="ltr">{n}</bdi> من <bdi dir="ltr">${total}</bdi> أدلة معروضة`,
    emptyTitle: 'لا يوجد دليل يطابق هذه التصفية.',
    emptyBody: 'جرب كلمة أخرى أو تصنيفا آخر، أو عد إلى المكتبة الكاملة.',
    reset: 'إعادة ضبط التصفية',
    pathsTitle: 'مسارات موجهة',
    pathsDeck: 'أدلة منشورة بالفعل، أعيد ترتيبها حسب تسلسل القرار الحقيقي. دون أي تكرار للمحتوى.',
    step: (n) => `الخطوة <bdi dir="ltr">${n}</bdi>`,
    pathLength: (n) => `<bdi dir="ltr">${n}</bdi> أدلة`,
    factGuides: 'أدلة منشورة', factLanguages: 'اللغات', factUpdated: 'آخر مراجعة',
  },
});

/* Le temps de lecture est MESURÉ, jamais saisi à la main : il vient du
 * fragment réellement publié, donc il ne peut pas mentir sur la longueur du
 * texte. L'arabe compte moins de mots pour la même idée, d'où un débit plus
 * bas. */
/* 160 mots/minute, pas les 250 d'un texte de magazine : ces guides portent des
 * formules, des tableaux et des conversions d'unités, qu'on relit. L'arabe dit
 * la même chose en moins de mots, d'où un débit plus bas pour une durée
 * comparable. Les durées écrites à la main variaient de 130 à 216 mots/minute
 * d'un guide à l'autre, et la carte ne pouvait donc pas s'accorder avec
 * l'article. Une seule formule mesurée remplace les sept estimations. */
const WORDS_PER_MINUTE = Object.freeze({ fr: 160, en: 160, ar: 150 });
const DATE_LOCALE = Object.freeze({ fr: 'fr-FR', en: 'en-US', ar: 'ar-u-nu-latn' });

const plainText = (markup) => String(markup)
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

function readingMinutes(fragment, locale) {
  const words = plainText(fragment).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE[locale]));
}

const formatDate = (iso, locale) => new Intl.DateTimeFormat(DATE_LOCALE[locale], {
  timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric',
}).format(new Date(iso));

/* Le pied de page est copié tel quel depuis la landing de chaque langue, et
 * c'est voulu : une seule source pour le même pied partout. Mais ses liens de
 * section sont des ancres NUES (`#pricing`), écrites pour une page qui vit à
 * `/fr/`. Recopiées dans `/fr/guides/`, elles pointaient vers des ancres qui
 * n'existent pas sur la page des guides : le visiteur cliquait « Tarifs » et
 * ne bougeait pas. On les réécrit vers la landing de la même langue. Le lien
 * reste identique sur la landing elle-même, où `/fr/#pricing` et `#pricing`
 * désignent la même cible. */
function localizeFooterAnchors(footer, locale) {
  return footer.replace(/href="(#[^"]*)"/g, `href="/${locale}/$1"`);
}

/* FAQPage n'est émis que si la page MONTRE vraiment une FAQ : on lit les
 * paires <summary>/<p> du fragment publié. Un balisage qui décrirait des
 * questions absentes de l'écran est une donnée structurée invalide, et Google
 * la sanctionne. `loyalty` n'a pas de section FAQ, donc n'en reçoit pas. */
function faqEntries(fragment) {
  const section = fragment.match(/<section class="faq"[\s\S]*?<\/section>/);
  if (!section) return [];
  return [...section[0].matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*<p>([\s\S]*?)<\/p>/g)]
    .map((match) => ({ question: plainText(match[1]), answer: plainText(match[2]) }))
    .filter((entry) => entry.question && entry.answer);
}

const esc = (value) => String(value)
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;');
const json = (value) => JSON.stringify(value, null, 2)
  .replaceAll('<', '\\u003c')
  .replaceAll('\u2028', '\\u2028')
  .replaceAll('\u2029', '\\u2029');
const absolute = (route) => SITE + route;
const outputPath = (route) => path.join(ROOT, route.replace(/^\//, ''), 'index.html');
const contentPath = (id, locale) => path.join(ROOT, 'content', 'guides', 'pages', id, `${locale}.html`);
// Landing languages are independent of the three published guide languages.
const LANDING_LOCALES = Object.freeze(['fr', 'en', 'ar', 'de', 'it', 'nl', 'es']);
const landingRoutes = Object.freeze(Object.fromEntries(LANDING_LOCALES.map((locale) => [locale, `/${locale}/`])));
const hubRoutes = Object.freeze(Object.fromEntries(PUBLISHED_LOCALES.map((locale) => [locale, `/${locale}/guides/`])));

const clusters = [
  { id: 'hub', routes: hubRoutes, pages: HUBS, type: 'hub' },
  ...TOPICS.map((topic) => ({ ...topic, type: 'article' })),
];

function extractFooter(source, label) {
  const matches = source.match(/<footer\b[\s\S]*?<\/footer>/g) || [];
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one <footer>, found ${matches.length}`);
  return matches[0];
}

function validateManifest() {
  if (PUBLISHED_LOCALES.join(',') !== 'fr,en,ar') throw new Error('published locales must be exactly fr, en and ar');
  const ids = new Set();
  const routes = new Set();
  const images = new Set();

  for (const cluster of clusters) {
    if (ids.has(cluster.id)) throw new Error(`duplicate guide id: ${cluster.id}`);
    ids.add(cluster.id);
    for (const locale of PUBLISHED_LOCALES) {
      const route = cluster.routes[locale];
      const page = cluster.pages[locale];
      if (!route || !page) throw new Error(`${cluster.id}: missing ${locale} route or metadata`);
      if (!route.startsWith(`/${locale}/guides/`) || !route.endsWith('/')) {
        throw new Error(`${cluster.id}/${locale}: invalid localized route ${route}`);
      }
      if (routes.has(route)) throw new Error(`duplicate guide route: ${route}`);
      routes.add(route);
      for (const field of ['title', 'description', 'ogTitle', 'ogDescription', 'image', 'imageAlt']) {
        if (typeof page[field] !== 'string' || !page[field].trim()) throw new Error(`${cluster.id}/${locale}: missing ${field}`);
      }
      if (cluster.type === 'article' && (!page.section || !/^\d{4}-\d{2}-\d{2}T/.test(page.datePublished) || !/^\d{4}-\d{2}-\d{2}T/.test(page.dateModified))) {
        throw new Error(`${cluster.id}/${locale}: article section or publication dates are invalid`);
      }
      if (images.has(page.image)) throw new Error(`social image reused: ${page.image}`);
      images.add(page.image);
      if (!fs.existsSync(path.join(ROOT, page.image))) throw new Error(`${cluster.id}/${locale}: missing ${page.image}`);
      if (cluster.type === 'article') {
        const summary = TOPIC_CARDS[cluster.id] && TOPIC_CARDS[cluster.id][locale];
        if (typeof summary !== 'string' || !summary.trim()) {
          throw new Error(`${cluster.id}/${locale}: résumé de carte manquant dans TOPIC_CARDS`);
        }
        if (summary.includes('\u2014')) throw new Error(`${cluster.id}/${locale}: le résumé de carte contient un tiret cadratin`);
      }
    }
    if (cluster.type !== 'article') continue;
    const categoryId = TOPIC_CATEGORY[cluster.id];
    if (!CATEGORIES.some((category) => category.id === categoryId)) {
      throw new Error(`${cluster.id}: catégorie inconnue ou absente (${categoryId})`);
    }
    const goals = TOPIC_GOALS[cluster.id] || [];
    if (!goals.length) throw new Error(`${cluster.id}: aucun objectif déclaré dans TOPIC_GOALS`);
    for (const goal of goals) {
      if (!GOALS.some((entry) => entry.id === goal)) throw new Error(`${cluster.id}: objectif inconnu ${goal}`);
    }
  }

  /* Un parcours ou une mise en avant qui pointerait vers un sujet retiré
   * produirait un lien mort dans les trois langues à la fois. */
  const topicIds = new Set(TOPICS.map((topic) => topic.id));
  for (const id of FEATURED) {
    if (!topicIds.has(id)) throw new Error(`FEATURED renvoie à un sujet inexistant: ${id}`);
  }
  if (FEATURED.length > 3) throw new Error('FEATURED ne doit pas dépasser trois guides');
  for (const path of PATHS) {
    if (path.steps.length < 2 || path.steps.length > 4) {
      throw new Error(`parcours ${path.id}: il faut entre deux et quatre guides`);
    }
    if (new Set(path.steps).size !== path.steps.length) {
      throw new Error(`parcours ${path.id}: un guide y figure deux fois`);
    }
    for (const step of path.steps) {
      if (!topicIds.has(step)) throw new Error(`parcours ${path.id} renvoie à un sujet inexistant: ${step}`);
    }
    for (const locale of PUBLISHED_LOCALES) {
      if (!path.titles[locale] || !path.decks[locale]) {
        throw new Error(`parcours ${path.id}: titre ou chapeau ${locale} manquant`);
      }
    }
  }
  for (const group of [CATEGORIES, GOALS]) {
    for (const entry of group) {
      for (const locale of PUBLISHED_LOCALES) {
        if (!entry.labels[locale]) throw new Error(`libellé ${locale} manquant pour ${entry.id}`);
      }
    }
  }
}

const fragmentCache = new Map();
function readFragment(cluster, locale) {
  const key = `${cluster.id}/${locale}`;
  if (fragmentCache.has(key)) return fragmentCache.get(key);
  const value = loadFragment(cluster, locale);
  fragmentCache.set(key, value);
  return value;
}

function loadFragment(cluster, locale) {
  const file = contentPath(cluster.id, locale);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} is missing`);
  const source = fs.readFileSync(file, 'utf8').trim();
  const expectedId = cluster.type === 'hub' ? 'guides' : 'article';
  if (!source.startsWith(`<main id="${expectedId}"`) || !source.endsWith('</main>')) {
    throw new Error(`${path.relative(ROOT, file)} must contain only <main id="${expectedId}">…</main>`);
  }
  if ((source.match(/<main\b/g) || []).length !== 1 || (source.match(/<h1\b/g) || []).length !== 1) {
    throw new Error(`${path.relative(ROOT, file)} must contain exactly one main and one h1`);
  }
  return source;
}

/* ── Bibliothèque · balisage généré ──────────────────────────────────────────
 * Les cartes, catégories, objectifs, mises en avant et parcours sont PRODUITS
 * depuis le manifeste, pas écrits à la main dans les trois fragments du hub.
 * C'est la seule façon de garantir que FR, EN et AR listent exactement les
 * mêmes guides : avant, chaque langue répétait deux paragraphes par article à
 * la main, et une page pouvait oublier un guide sans que rien ne le signale.
 *
 * Le motif de chaque carte est purement géométrique : aucun mot, donc aucune
 * dette de traduction, et aucun chiffre qui pourrait se lire comme une
 * moyenne du marché. Son étiquette accessible réemploie `imageAlt`, déjà
 * rédigé et relu dans les trois langues. */
const SCENE_PARTS = Object.freeze({
  pos: 7, food: 1, stock: 3, menu: 4, breakEven: 4, openRestaurant: 3, loyalty: 3,
});

function cardScene(topic, locale, position) {
  const page = topic.pages[locale];
  const parts = '<i></i>'.repeat(SCENE_PARTS[topic.id] || 3);
  const number = locale === 'ar'
    ? `<bdi dir="ltr">${String(position).padStart(2, '0')}</bdi>`
    : String(position).padStart(2, '0');
  return `<span class="card-scene card-scene--${esc(topic.id)}" role="img" aria-label="${esc(page.imageAlt)}">`
    + `<b>${number}</b><span class="scene-art">${parts}</span></span>`;
}

/* Le texte sur lequel porte la recherche. Il réunit ce que le visiteur voit
 * (titre, résumé, catégorie) et ce qu'il pourrait taper (rubrique éditoriale,
 * mots du slug). Il est produit ici, donc il ne peut pas décrire un guide
 * autrement que la carte elle-même. */
function searchHaystack(topic, locale, categoryLabel) {
  const page = topic.pages[locale];
  const slugWords = decodeURI(topic.routes[locale])
    .replace(/^\/[a-z]{2}\/guides\//, '').replace(/\/$/, '').replace(/-/g, ' ');
  return plainText([
    page.ogTitle, TOPIC_CARDS[topic.id][locale], categoryLabel,
    page.section, slugWords, page.description,
  ].join(' ')).toLowerCase();
}

function guideCard(topic, locale, position, { featured = false } = {}) {
  const page = topic.pages[locale];
  const lib = LIB[locale];
  const route = topic.routes[locale];
  const category = CATEGORIES.find((entry) => entry.id === TOPIC_CATEGORY[topic.id]);
  const categoryLabel = category.labels[locale];
  const minutes = readingMinutes(readFragment(topic, locale), locale);
  const modified = page.dateModified.slice(0, 10);
  const published = page.datePublished.slice(0, 10);
  const freshened = modified !== published;
  const dateLabel = freshened ? lib.updated(formatDate(modified, locale)) : lib.published(formatDate(published, locale));
  const goals = (TOPIC_GOALS[topic.id] || []).join(' ');
  const headingId = `card-${esc(topic.id)}${featured ? '-featured' : ''}`;

  return `<li class="guide-card${featured ? ' guide-card--featured' : ''}" data-guide`
    + ` data-id="${esc(topic.id)}" data-category="${esc(category.id)}" data-goals="${esc(goals)}"`
    + ` data-modified="${esc(modified)}" data-reading="${minutes}" data-order="${position}"`
    + ` data-haystack="${esc(searchHaystack(topic, locale, categoryLabel))}">`
    + `<article aria-labelledby="${headingId}">`
    + `<a class="card-link" href="${esc(route)}" data-guide-link="${esc(topic.id)}">`
    + cardScene(topic, locale, position)
    + `<span class="card-category">${esc(categoryLabel)}</span>`
    + `<h3 class="card-title" id="${headingId}">${esc(page.ogTitle)}</h3>`
    + `<span class="card-summary">${esc(TOPIC_CARDS[topic.id][locale])}</span>`
    + `<span class="card-meta"><time datetime="${esc(modified)}">${dateLabel}</time>`
    + `<span class="card-dot" aria-hidden="true"></span>`
    + `<span class="card-reading">${lib.minutes(minutes)}</span></span>`
    + `<span class="card-cta">${esc(lib.read)}<span class="arrow" aria-hidden="true">↗</span></span>`
    + `</a></article></li>`;
}

function libraryMarkup(locale) {
  const lib = LIB[locale];
  const total = TOPICS.length;
  const orderOf = new Map(TOPICS.map((topic, index) => [topic.id, index + 1]));

  const goalPills = GOALS.map((goal) => `<li><button type="button" class="goal-pill" data-goal="${esc(goal.id)}" aria-pressed="false">${esc(goal.labels[locale])}</button></li>`).join('');

  const categoryFilters = [
    `<button type="button" class="filter-pill" data-category="all" aria-pressed="true">${esc(lib.allCategories)}</button>`,
    ...CATEGORIES.map((category) => {
      const count = TOPICS.filter((topic) => TOPIC_CATEGORY[topic.id] === category.id).length;
      if (!count) return '';
      return `<button type="button" class="filter-pill" data-category="${esc(category.id)}" aria-pressed="false">${esc(category.labels[locale])}</button>`;
    }),
  ].join('');

  const featuredCards = FEATURED
    .map((id) => TOPICS.find((topic) => topic.id === id))
    .filter(Boolean)
    .map((topic) => guideCard(topic, locale, orderOf.get(topic.id), { featured: true }))
    .join('');

  const cards = TOPICS.map((topic, index) => guideCard(topic, locale, index + 1)).join('');

  const paths = PATHS.map((path) => {
    const steps = path.steps.map((id, index) => {
      const topic = TOPICS.find((entry) => entry.id === id);
      if (!topic) return '';
      const step = locale === 'ar' ? lib.step(index + 1) : esc(lib.step(index + 1));
      return `<li><a href="${esc(topic.routes[locale])}" data-path-link="${esc(path.id)}">`
        + `<span class="path-step">${step}</span>`
        + `<span class="path-name">${esc(topic.pages[locale].ogTitle)}</span></a></li>`;
    }).join('');
    return `<li class="path-card"><h3>${esc(path.titles[locale])}</h3>`
      + `<p>${esc(path.decks[locale])}</p>`
      + `<ol class="path-steps">${steps}</ol>`
      + `<p class="path-length">${lib.pathLength(path.steps.length)}</p></li>`;
  }).join('');

  /* Les commandes vivent dans un conteneur que le JS révèle. Sans JavaScript,
   * la grille complète, les mises en avant et les parcours restent servis et
   * indexables : on cache des boutons inertes, jamais du contenu. */
  return `<div class="library" data-guides-library>
<div class="library-tools" data-library-tools role="search" aria-label="${esc(lib.toolsLabel)}">
<div class="search-field"><label class="visually-hidden" for="guides-search">${esc(lib.searchLabel)}</label>
<span class="search-icon" aria-hidden="true"></span>
<input type="search" id="guides-search" data-guides-search placeholder="${esc(lib.searchPlaceholder)}" autocomplete="off" spellcheck="false" aria-describedby="guides-search-help"></div>
<p class="search-help" id="guides-search-help">${esc(lib.searchHelp)}</p>
</div>
<nav class="goal-rail" data-library-tools aria-labelledby="goals-title">
<h2 class="rail-title" id="goals-title">${esc(lib.goalsTitle)}</h2>
<ul class="goal-list">${goalPills}</ul>
</nav>
<div class="library-controls" data-library-tools>
<div class="filter-group" role="group" aria-label="${esc(lib.categoriesLabel)}">${categoryFilters}</div>
<div class="sort-field"><label for="guides-sort">${esc(lib.sortLabel)}</label>
<select id="guides-sort" data-guides-sort>
<option value="recommended">${esc(lib.sortRecommended)}</option>
<option value="recent">${esc(lib.sortRecent)}</option>
<option value="reading">${esc(lib.sortReading)}</option>
</select></div>
</div>
<p class="library-count" data-guides-count role="status" aria-live="polite" data-count-total="${esc(lib.total(total))}" data-count-one="${esc(lib.filteredOne(total))}" data-count-many="${esc(lib.filteredMany(total))}">${lib.total(total)}</p>
<section class="featured" aria-labelledby="featured-title">
<div class="section-rule"><h2 id="featured-title">${esc(lib.featuredTitle)}</h2><p>${esc(lib.featuredDeck)}</p></div>
<ol class="featured-grid">${featuredCards}</ol>
</section>
<section class="library-all" aria-labelledby="all-title">
<div class="section-rule"><h2 id="all-title">${esc(lib.gridTitle)}</h2></div>
<ol class="guide-grid" data-guides-grid>${cards}</ol>
<div class="library-empty" data-guides-empty hidden>
<p class="empty-title">${esc(lib.emptyTitle)}</p>
<p class="empty-body">${esc(lib.emptyBody)}</p>
<button type="button" class="button button--outline" data-guides-reset>${esc(lib.reset)}</button>
</div>
</section>
<section class="paths" aria-labelledby="paths-title">
<div class="section-rule"><h2 id="paths-title">${esc(lib.pathsTitle)}</h2><p>${esc(lib.pathsDeck)}</p></div>
<ol class="paths-grid">${paths}</ol>
</section>
</div>`;
}

/* Précédent / suivant suit l'ordre du manifeste, donc il ne peut pas pointer
 * vers un guide retiré ni oublier un guide ajouté. */
function articleSequence(cluster, locale) {
  const index = TOPICS.findIndex((topic) => topic.id === cluster.id);
  if (index < 0) return '';
  const ui = UI[locale];
  const link = (topic, rel, label) => {
    if (!topic) return '';
    return `<a class="sequence-link sequence-link--${rel}" rel="${rel}" href="${esc(topic.routes[locale])}">`
      + `<span class="sequence-label">${esc(label)}</span>`
      + `<span class="sequence-title">${esc(topic.pages[locale].ogTitle)}</span></a>`;
  };
  const previous = link(TOPICS[index - 1], 'prev', ui.previousGuide);
  const next = link(TOPICS[index + 1], 'next', ui.nextGuide);
  if (!previous && !next) return '';
  return `<nav class="article-sequence" aria-label="${esc(ui.sequenceLabel)}">${previous}${next}</nav>`;
}

function alternateLinks(routes) {
  return [
    ...PUBLISHED_LOCALES.map((locale) => `  <link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}">`),
    `  <link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}">`,
  ].join('\n');
}

function header(locale, routes) {
  const ui = UI[locale];
  const languageLinks = PUBLISHED_LOCALES.map((code) => {
    const current = code === locale ? ' aria-current="true"' : '';
    return `<a href="${esc(routes[code])}" hreflang="${code}" lang="${code}"${current}>${code.toUpperCase()}</a>`;
  }).join('');

  return `<header class="site-header">
    <div class="nav-shell">
      <a class="brand" href="/${locale}/" aria-label="${esc(ui.brandLabel)}"><img src="/images/kiwi-logo-ink.svg" width="855" height="455" alt=""></a>
      <nav class="nav-center" aria-label="${esc(ui.navLabel)}">
        <a href="/${locale}/#features">${esc(ui.features)}</a><a href="/${locale}/guides/" aria-current="page">${esc(ui.guides)}</a><a href="/${locale}/#pricing">${esc(ui.pricing)}</a><a href="/dashboard.html">${esc(ui.signIn)}</a>
        <a class="button nav-demo" href="https://wa.me/212624495159" target="_blank" rel="noreferrer">${esc(ui.demo)} <span class="arrow" aria-hidden="true">↗</span></a>
      </nav>
      <div class="language-picker" role="group" aria-label="${esc(ui.languagePicker)}">${languageLinks}</div>
      <a class="button mobile-demo" href="https://wa.me/212624495159" target="_blank" rel="noreferrer">${esc(ui.demo)} <span class="arrow" aria-hidden="true">↗</span></a>
    </div>
  </header>`;
}

/* Le hub garde son hero et sa note éditoriale écrits à la main ; la
 * bibliothèque elle-même est injectée ici. Un fragment de hub sans ce jeton
 * fait échouer la construction, pour qu'aucune langue ne puisse publier une
 * page de guides sans sa bibliothèque. */
const LIBRARY_PLACEHOLDER = '<!--GUIDES_LIBRARY-->';
const FACTS_PLACEHOLDER = '<!--GUIDES_FACTS-->';

/* Le fait affiché dans l'en-tête est COMPTÉ, pas saisi : « 7 guides publiés »
 * vient de la longueur du manifeste et la date de la plus récente révision
 * réelle. Un huitième guide met donc l'en-tête à jour tout seul, dans les
 * trois langues. */
function heroFacts(locale) {
  const lib = LIB[locale];
  const newest = TOPICS.map((topic) => topic.pages[locale].dateModified).sort().at(-1);
  const number = (value) => (locale === 'ar' ? `<bdi dir="ltr">${value}</bdi>` : String(value));
  const rows = [
    [lib.factGuides, number(TOPICS.length)],
    [lib.factLanguages, '<bdi dir="ltr">FR · EN · AR</bdi>'],
    [lib.factUpdated, `<time datetime="${esc(newest.slice(0, 10))}">${number(formatDate(newest, locale))}</time>`],
  ];
  return `<dl class="hero-facts">${rows
    .map(([term, value]) => `<div><dt>${esc(term)}</dt><dd>${value}</dd></div>`)
    .join('')}</dl>`;
}

const organization = (locale) => ({
  '@type': 'Organization',
  '@id': `${SITE}/#organization`,
  name: 'Kiwi',
  url: absolute(`/${locale}/`),
  logo: { '@type': 'ImageObject', url: absolute('/images/kiwi-logo.svg') },
  description: UI[locale].orgDescription,
  areaServed: { '@type': 'Country', name: 'Morocco' },
  knowsAbout: CATEGORIES.map((category) => category.labels[locale]),
});

/* La catégorie et la durée de lecture rejoignent la signature existante, et
 * la durée est celle MESURÉE sur le texte publié : la carte de la
 * bibliothèque et l'article affichent donc forcément le même chiffre. On
 * remplace le dernier <span> de la signature, qui porte la durée dans les
 * vingt-et-un fragments ; si ce motif disparaît un jour, la construction
 * échoue au lieu de publier une signature muette. */
function enrichArticle(cluster, locale, fragment) {
  const lib = LIB[locale];
  const minutes = readingMinutes(fragment, locale);
  const category = CATEGORIES.find((entry) => entry.id === TOPIC_CATEGORY[cluster.id]);
  const byline = fragment.match(/<div class="byline">[\s\S]*?<\/div>/);
  if (!byline) throw new Error(`${cluster.id}/${locale}: la signature de l'article est introuvable`);
  const rebuilt = byline[0].replace(
    /<span>(?:(?!<\/span>)[\s\S])*<\/span>(\s*)<\/div>$/,
    `<span class="byline-category">${esc(category.labels[locale])}</span>`
      + '<span class="byline-separator" aria-hidden="true"></span>'
      + `<span>${lib.minutes(minutes)}</span>$1</div>`);
  if (rebuilt === byline[0]) throw new Error(`${cluster.id}/${locale}: la durée de lecture est introuvable dans la signature`);
  return fragment
    .replace(byline[0], rebuilt)
    .replace(/<\/main>$/, articleSequence(cluster, locale) + '</main>');
}

function pageBody(cluster, locale) {
  const fragment = readFragment(cluster, locale);
  if (cluster.type === 'article') return enrichArticle(cluster, locale, fragment);
  for (const token of [LIBRARY_PLACEHOLDER, FACTS_PLACEHOLDER]) {
    if (!fragment.includes(token)) {
      throw new Error(`content/guides/pages/hub/${locale}.html doit contenir ${token}`);
    }
  }
  return fragment
    .replace(FACTS_PLACEHOLDER, heroFacts(locale))
    .replace(LIBRARY_PLACEHOLDER, libraryMarkup(locale));
}

function structuredData(cluster, locale) {
  const ui = UI[locale];
  const page = cluster.pages[locale];
  const route = cluster.routes[locale];
  const url = absolute(route);
  const breadcrumbs = [
    { '@type': 'ListItem', position: 1, name: ui.home, item: absolute(`/${locale}/`) },
    { '@type': 'ListItem', position: 2, name: ui.guides, item: absolute(`/${locale}/guides/`) },
  ];

  if (cluster.type === 'hub') {
    return {
      '@context': 'https://schema.org',
      '@graph': [
        {
          '@type': 'CollectionPage', '@id': `${url}#collection`,
          name: page.title.replace(/ · Kiwi$/, ''), description: page.description, url,
          inLanguage: ui.language,
          isPartOf: { '@id': `${SITE}/#organization` },
          publisher: { '@id': `${SITE}/#organization` },
          about: CATEGORIES.map((category) => ({ '@type': 'Thing', name: category.labels[locale] })),
          mainEntity: {
            '@type': 'ItemList', numberOfItems: TOPICS.length,
            itemListOrder: 'https://schema.org/ItemListOrderAscending',
            itemListElement: TOPICS.map((topic, index) => ({
              '@type': 'ListItem', position: index + 1,
              url: absolute(topic.routes[locale]), name: topic.pages[locale].ogTitle,
              description: TOPIC_CARDS[topic.id][locale],
            })),
          },
        },
        organization(locale),
        { '@type': 'BreadcrumbList', itemListElement: breadcrumbs.slice(0, 1).concat({ '@type': 'ListItem', position: 2, name: ui.guides }) },
      ],
    };
  }

  breadcrumbs.push({ '@type': 'ListItem', position: 3, name: page.ogTitle });
  const fragment = readFragment(cluster, locale);
  const category = CATEGORIES.find((entry) => entry.id === TOPIC_CATEGORY[cluster.id]);
  const minutes = readingMinutes(fragment, locale);
  const questions = faqEntries(fragment);
  /* FAQPage seulement si la page MONTRE les questions. Un balisage qui
   * déclarerait une FAQ absente de l'écran est invalide, et le guide
   * fidélisation n'a pas de section FAQ : il n'en reçoit donc pas. */
  const faq = questions.length ? [{
    '@type': 'FAQPage', '@id': `${url}#faq`, inLanguage: ui.language,
    mainEntity: questions.map((entry) => ({
      '@type': 'Question', name: entry.question,
      acceptedAnswer: { '@type': 'Answer', text: entry.answer },
    })),
  }] : [];
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article', '@id': `${url}#article`, headline: page.ogTitle,
        description: page.description, image: [absolute('/' + page.image)],
        datePublished: page.datePublished, dateModified: page.dateModified,
        inLanguage: ui.language,
        articleSection: category.labels[locale],
        timeRequired: `PT${minutes}M`,
        wordCount: plainText(fragment).split(/\s+/).filter(Boolean).length,
        author: { '@type': 'Organization', name: ui.author, url: absolute(`/${locale}/`) },
        publisher: { '@id': `${SITE}/#organization` },
        isPartOf: { '@id': `${absolute(`/${locale}/guides/`)}#collection` },
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
      },
      organization(locale),
      ...faq,
      { '@type': 'BreadcrumbList', itemListElement: breadcrumbs },
    ],
  };
}

function renderPage(cluster, locale, footer) {
  const ui = UI[locale];
  const page = cluster.pages[locale];
  const route = cluster.routes[locale];
  const url = absolute(route);
  const isArticle = cluster.type === 'article';
  const articleMeta = isArticle ? `
  <meta property="article:published_time" content="${esc(page.datePublished)}">
  <meta property="article:modified_time" content="${esc(page.dateModified)}">
  <meta property="article:section" content="${esc(page.section)}">` : '';
  const mainId = isArticle ? 'article' : 'guides';
  const skip = isArticle ? ui.skipArticle : ui.skipHub;

  return `<!doctype html>
<html lang="${locale}" dir="${ui.dir}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(page.title)}</title>
  <meta name="description" content="${esc(page.description)}">
  <meta name="robots" content="index, follow, max-image-preview:large">
  <link rel="canonical" href="${esc(url)}">
${alternateLinks(cluster.routes)}
  <meta property="og:type" content="${isArticle ? 'article' : 'website'}">
  <meta property="og:site_name" content="Kiwi">
  <meta property="og:locale" content="${ui.ogLocale}">
  <meta property="og:title" content="${esc(page.ogTitle)}">
  <meta property="og:description" content="${esc(page.ogDescription)}">
  <meta property="og:url" content="${esc(url)}">
  <meta property="og:image" content="${esc(absolute('/' + page.image))}">
  <meta property="og:image:type" content="image/png">
  <meta property="og:image:alt" content="${esc(page.imageAlt)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">${articleMeta}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(page.twitterTitle || page.ogTitle)}">
  <meta name="twitter:description" content="${esc(page.twitterDescription || page.ogDescription)}">
  <meta name="twitter:image" content="${esc(absolute('/' + page.image))}">
  <meta name="twitter:image:alt" content="${esc(page.twitterImageAlt || page.imageAlt)}">
  <link rel="icon" href="/icon.svg" type="image/svg+xml">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="/assets/articles/article.css?v=${ASSET_VERSIONS.css}">
  <script type="application/ld+json">${json(structuredData(cluster, locale))}</script>
</head>
<body>
  <a class="skip-link" href="#${mainId}">${esc(skip)}</a>
  <div class="reading-progress" data-reading-progress aria-hidden="true"></div>
  ${header(locale, cluster.routes)}
  ${pageBody(cluster, locale)}
  ${localizeFooterAnchors(footer, locale)}
  <script src="/assets/articles/article.js?v=${ASSET_VERSIONS.js}" defer></script>${isArticle ? '' : `
  <script src="/assets/articles/guides-library.js?v=${ASSET_VERSIONS.library}" defer></script>`}
</body>
</html>
`;
}

function sitemapRow(route, routes, lastmod, locales = PUBLISHED_LOCALES) {
  const links = [
    ...locales.map((locale) => `<xhtml:link rel="alternate" hreflang="${locale}" href="${esc(absolute(routes[locale]))}" />`),
    `<xhtml:link rel="alternate" hreflang="x-default" href="${esc(absolute(routes.fr))}" />`,
  ].join('');
  const modified = lastmod ? `<lastmod>${lastmod}</lastmod>` : '';
  return `<url><loc>${esc(absolute(route))}</loc>${modified}${links}</url>`;
}

function renderSitemap() {
  const newest = TOPICS.map((topic) => topic.pages.fr.dateModified.slice(0, 10)).sort().at(-1);
  const landingRows = LANDING_LOCALES.map((locale) => sitemapRow(landingRoutes[locale], landingRoutes, undefined, LANDING_LOCALES));
  const guideRows = clusters.flatMap((cluster) => {
    const lastmod = cluster.type === 'hub' ? newest : cluster.pages.fr.dateModified.slice(0, 10);
    return PUBLISHED_LOCALES.map((locale) => sitemapRow(cluster.routes[locale], cluster.routes, lastmod));
  });
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${[...landingRows, ...guideRows].join('\n')}\n</urlset>\n`;
}

function listPublishedGuideFiles() {
  const results = [];
  const walk = (directory) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name === 'index.html') results.push(file);
    }
  };
  for (const locale of PUBLISHED_LOCALES) walk(path.join(ROOT, locale, 'guides'));
  return results;
}

function writeOrCheck(file, expected, drift) {
  if (CHECK) {
    const actual = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
    if (actual !== expected) drift.push(path.relative(ROOT, file));
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, expected);
  console.log(`built ${path.relative(ROOT, file)}`);
}

validateManifest();
const expectedOutputs = new Set(clusters.flatMap((cluster) => PUBLISHED_LOCALES.map((locale) => outputPath(cluster.routes[locale]))));
const unexpected = listPublishedGuideFiles().filter((file) => !expectedOutputs.has(file));
if (unexpected.length) throw new Error(`published guide pages missing from manifest:\n${unexpected.map((file) => '  ' + path.relative(ROOT, file)).join('\n')}`);

const footers = Object.fromEntries(PUBLISHED_LOCALES.map((locale) => {
  const landing = path.join(ROOT, locale, 'index.html');
  return [locale, extractFooter(fs.readFileSync(landing, 'utf8'), path.relative(ROOT, landing))];
}));
const drift = [];
for (const cluster of clusters) {
  for (const locale of PUBLISHED_LOCALES) {
    writeOrCheck(outputPath(cluster.routes[locale]), renderPage(cluster, locale, footers[locale]), drift);
  }
}
writeOrCheck(path.join(ROOT, 'sitemap.xml'), renderSitemap(), drift);

if (drift.length) {
  console.error('generated guide files are stale:');
  drift.forEach((file) => console.error(`  ${file}`));
  console.error('run: node tools/build-guides.mjs');
  process.exit(1);
}
if (CHECK) console.log(`guide source is deterministic (${expectedOutputs.size} pages + sitemap.xml)`);
