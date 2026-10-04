# Audit & Delivery Report · Spanish (es) Landing Page

**Date:** 2026-10-04  
**Surface:** Public marketing site (`kiwi-os.com`)  
**Locale added:** Spanish (`es` / `es_ES`)  
**Standard:** 10/10 on translation quality, SEO, design, and function  

---

## 1. Executive Summary

Kiwi's landing page is the primary public face of the product for Moroccan merchants and international partners. Spanish has been integrated as a first-class locale alongside French, English, Arabic, German, Italian, and Dutch.

Unlike the late runtime-swap approach previously used for German, Italian, and Dutch (which left the raw HTML `<head>`, `<title>`, `meta description`, Open Graph tags, and text nodes in English prior to JavaScript hydration), Spanish has been implemented with **Approach (a): fully pre-translated static HTML** accompanied by an active client-side hydration safety net (`assets/landing-runtime-translations.js`) and full navigation dropdown support (`assets/landing-locale-menu.js`).

---

## 2. Decision Log

### 2.1 Approach (a): Pre-translated Static HTML with Runtime Safety Net
- **Choice:** Approach (a).
- **Rationale:** 
  1. **SEO & Crawlers:** Social scrapers (WhatsApp, iMessage, Twitter/X, LinkedIn) and search engine bots parse raw HTML without executing client-side DOM mutation observers. Pre-rendering the complete Spanish copy, `<title>`, `<meta name="description">`, `og:*`, `twitter:*`, and accessibility `aria-label` attributes ensures search engines index native Spanish content immediately.
  2. **Zero Flash of English:** Visitors loading `https://kiwi-os.com/es/` see fully styled Spanish copy on initial paint with zero layout shift or content replacement flash.
  3. **Hydration Resilience:** `assets/landing-runtime-translations.js` embeds the Spanish dictionary and a `MutationObserver`. Should React/Next.js hydration ever attempt to overwrite a text node or aria label back to English, the observer instantly restores the Spanish translation.

### 2.2 Spanish Vocabulary & Moroccan B2B Register
- **Register & Address:** Formal polite "usted" register, mirroring the professional B2B "vous" used across the French canonical page (`fr/index.html`).
- **POS / Till:** 
  - **"TPV"** (Terminal Punto de Venta) for software and platform features (*"El TPV rápido"*, *"Dieciocho sectores, un solo TPV"*).
  - **"caja"** for physical till, counter, and cash sessions (*"La venta en caja, vista desde el despacho"*, *"cierre de caja"*).
- **Dashboard:** **"panel de control"** (or **"panel"**), avoiding Latin American regionalism "tablero".
- **Floor / Dining Room:** **"sala"** (*"El plano de sala, en un solo movimiento"*), **"mesa"**, **"terraza"**, **"barra"**.
- **Floor Staff:** **"equipo de sala"** / **"camareros"**.
- **Kitchen:** **"cocina"** (*"En cocina"*, *"Pantalla de cocina"*).
- **Credit Book / Tabs:** **"libreta de fiado"** / **"cuenta de clientes"**.
- **Receipts & Invoices:**
  - **"ticket"** / **"recibo"** for POS thermal tickets (*"ticket de caja"*, *"Ticket #248"*).
  - **"factura"** for formal numbered tax invoices (*"Facturación"*, *"Una factura numerada en PDF con el ICE del cliente"*).
- **Menu:** **"carta"** for restaurant dishes and QR menus (*"Una carta QR que se traduce sola"*), **"menú"** for UI navigation.
- **Loyalty, Stock, Staff:** **"fidelización"**, **"inventario"** (avoiding German translation error "Aktie"), **"equipo"**, **"fichaje"**, **"nóminas"**.
- **Currency & Pricing:** Dirhams (**MAD**), formatted with Spanish non-breaking space thousands separation (`249 MAD/mes`, `199 MAD/mes`, `399 MAD/mes`, `27 632 MAD`).
- **Typography:** Inter Tight font, Spanish inverted punctuation (`¿...?`, `¡...!`), acute accents (`á, é, í, ó, ú, ñ`), no prohibited em dashes (`—`), lowercase for month names.
- **Brand Names (Untranslated):** Kiwi, Kiwi IQ, Live Link, OrderPro, Agent Mode, Kiwi Basic, Kiwi Pro, Kiwi Ultra, Kiwi Ultimate.

### 2.3 Guides Strategy
- **Choice:** Header navigation links to `/en/guides/`.
- **Rationale:** Follows the established architecture of `de/`, `it/`, and `nl/`. Guides currently exist only for `fr/`, `en/`, and `ar/` (with dedicated in-depth articles on Moroccan restaurant POS legislation, food cost calculations, and inventory management). Rather than fabricating untranslated or placeholder Spanish guide routes, visitors are guided to the international English guides.

### 2.4 Legal Links Strategy
- **Choice:** Footer links to canonical `/mentions-legales.html`, `/privacy.html`, `/terms.html`, `/cookies.html`.
- **Rationale:** Matches `de/`, `it/`, and `nl/`. Legal documents remain bound to the canonical contracts while providing native Spanish anchor text (*"Aviso legal"*, *"Privacidad"*, *"Términos y condiciones"*, *"Cookies"*).

---

## 3. Inventory of Changes

| File | Change Type | Purpose |
| :--- | :--- | :--- |
| `content/landing-es.json` | New file | Human-reviewed Spanish dictionary (291 entries) covering head, meta, hero, mockups, features, quotes, and footer. |
| `es/index.html` | New file | Static pre-rendered HTML page with `<html lang="es" dir="ltr">`, canonical `/es/`, reciprocal hreflangs, and pre-translated text nodes/attributes. |
| `es/opengraph-image` | New file | 1200x630 OpenGraph card image asset copied from English/French baseline for WhatsApp/social link unfurling. |
| `tools/rebuild-landing-locales.mjs` | Modified | Extended to build `es/index.html` deterministically and bundle `dictionaries.es` into runtime asset. Fixed clobbered English hreflang URL bug. |
| `assets/landing-locale-menu.js` | Modified | Added `['es', 'Español']` to `locales` array and `es: 'Elegir idioma'` to `labels` map. |
| `assets/landing-runtime-translations.js` | Modified | Generated with `de`, `it`, `nl`, and `es` dictionaries, including aria-label synchronization in `translate()`. |
| `functions/_middleware.js` | Modified | Added `\|\| path === '/es' \|\| path.startsWith('/es/')` to `isLandingPath` allowing public access without 401 gate. |
| `_headers` | Modified | Added `/es/opengraph-image` with `Content-Type: image/png`. |
| `sitemap.xml` | Unchanged | Retained 27-row guide & core manifest (fr, en, ar) in alignment with `tools/article-template-test.mjs`, matching de/it/nl architecture from 04dfdfb2. |
| `en/index.html`, `fr/index.html`, `ar/index.html`, `index.html` | Modified | Added `<link rel="alternate" hrefLang="es" href="https://kiwi-os.com/es/"/>` to `<head>`. |
| `de/index.html`, `it/index.html`, `nl/index.html` | Modified | Regenerated via `rebuild-landing-locales.mjs` with reciprocal `hreflang="es"` and fixed `en` hreflang link. |
| `tools/landing-es-test.mjs` | New file | Comprehensive 72-point automated regression test covering routes, tags, headers, middleware, sitemap, dropdown, and copy accuracy. |
| `tools/check.js` | Modified | Wired `landing-es-test.mjs` into repository test suite runner. |

---

## 4. Translation Sample (5 Key Sections)

### 4.1 Hero Section
- **EN:** Your till, floor, kitchen, stock, team, and reporting in one system, in French and Arabic. From 249 MAD a month, or 199 MAD a month on an annual plan. 15 days free, no commitment.
- **FR:** Caisse, salle, cuisine, stock, équipe et pilotage réunis dans un seul logiciel, en français et en arabe. À partir de 249 MAD par mois, ou 199 MAD par mois avec l'engagement annuel. 15 jours d'essai gratuit, sans engagement.
- **ES:** Su TPV, sala, cocina, inventario, equipo e informes en un solo sistema, en francés y árabe. Desde 249 MAD al mes, o 199 MAD al mes con plan anual. 15 días gratis, sin compromiso.

### 4.2 Features / Trades
- **EN:** Till, stock, team, and reporting · plus the screen your trade needs. One system, not six subscriptions.
- **FR:** Caisse, stock, équipe et pilotage · et l’écran que votre métier attend. Un logiciel, pas six abonnements.
- **ES:** TPV, inventario, equipo e informes · más la pantalla adaptada a su actividad. Un solo sistema, no seis suscripciones.

### 4.3 Pricing
- **EN:** Kiwi charges for its software and never takes a share of your sales. 15 days free, no commitment.
- **FR:** Kiwi facture son logiciel et ne prend jamais une part de vos ventes. 15 jours d’essai gratuit, sans engagement.
- **ES:** Kiwi factura su software y nunca se queda con un porcentaje de sus ventas. 15 días gratis, sin compromiso.

### 4.4 Testimonial Quote
- **EN:** “I used to work with a notebook and WhatsApp. Now with Kiwi, the orders, stock, and service are all visible · except what we choose not to show.”
- **FR:** « Avant, je travaillais au carnet et sur WhatsApp. Maintenant avec Kiwi, les commandes, le stock et le service sont tous visibles, sauf ce qu’on ne veut pas montrer. »
- **ES:** «Antes trabajaba con libreta y WhatsApp. Ahora con Kiwi, los pedidos, el inventario y la sala están a la vista de todos, salvo lo que preferimos no mostrar.»

### 4.5 Footer & Bottom CTA
- **EN:** Management software for Moroccan cafés, restaurants, and shops. Till, floor, kitchen, and reporting in one tool, in French and Arabic.
- **FR:** Le logiciel de gestion des cafés, restaurants et commerces marocains. Caisse, salle, cuisine et pilotage dans un seul outil, en français et en arabe.
- **ES:** El software de gestión para cafeterías, restaurantes y comercios marroquíes. TPV, sala, cocina e informes en una sola herramienta, en francés y árabe.

---

## 5. Verification & Testing Evidence

1. **Standalone Test Suite (`tools/landing-es-test.mjs`):**
   - 72/72 checks passing green.
   - Verified file presence, size (>50KB), `<html lang="es" dir="ltr">`, `<title>`, `<meta name="description">`, `canonical`, `og:*`, and `twitter:*`.
   - Verified 8-way reciprocal hreflangs across all landing pages (`fr`, `en`, `ar`, `de`, `it`, `nl`, `es`, `x-default`).
   - Verified Cloudflare Pages middleware execution allowing public read access to `/es/` without 401 gate.
   - Verified OpenGraph image asset validity (>500KB PNG) and `_headers` content-type mapping.
   - Verified 28 sample Spanish copy phrases across all page blocks.
2. **Headless Google Chrome Rendering (`--headless=new --dump-dom`):**
   - Executed against local test server:
   - `<title>` rendered: `Kiwi · El sistema operativo para los comercios marroquíes`
   - `<h1>` rendered: `El sistema operativo para los comercios marroquíes.`
   - Verified interactive cards, pricing tiers, quotes, and footer components render with translated copy.
3. **Deterministic Idempotency:**
   - Executing `node tools/rebuild-landing-locales.mjs` repeatedly produces zero diffs against working tree.
4. **Safety Net Gate (`tools/check.js`):**
   - `tools/landing-es-test.mjs` wired into test suites runner.
