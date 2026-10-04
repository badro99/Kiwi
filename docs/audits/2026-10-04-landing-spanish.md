# Spanish landing completion audit

Date: 2026-10-04. Base: de5af75d6c4bb5ae6bbf97774f300129d10892c3. Surface: public landing pages only. Native-speaker review: pending.

## Copy and source extraction

Inventoried 554 static copy nodes/attributes, including SVG captions, title, metadata, aria-label, alt, placeholder and title attributes. No JSON-LD is present in the English or Spanish landing; therefore there is no structured-data translation to claim. Decorative empty alt attributes remain empty. Source code and URL/machine metadata are excluded. The full inventory with offsets is [copy-inventory.json](evidence/2026-10-04-landing-es/copy-inventory.json).

250 nodes matched an English or French source before correction; 206 remain identical after correction, all individually justified below and enforced by the explicit test allowlist. The comparison includes identical Spanish words and numeric fixtures, not only foreign prose.

The generator uses decoded text keys for both English and French source, descriptive attributes, metadata, React Flight records and locale-specific client component exports. Flight T records are parsed by UTF-8 byte length; surrounding whitespace is preserved to agree with the server HTML. The client exports have content-addressed URLs. The runtime dictionary remains a safety net for later changes; it disconnects its observer while translating.

The invoice mock is fully Spanish: FACTURA, Cliente, TOTAL. Its numeric ICE and invoice ID stay unchanged. The inventory products are Leche, Café and Azúcar; Café and TOTAL are also valid Spanish spellings. French QR tea and Arabic IQ samples remain deliberate demonstrations of the product's existing multilingual output, with exact allowlist entries. French IQ question, comparison, chart labels, warning and recommendation are Spanish. Nutrition initials are deliberately localized in HTML, Flight and the client export: P (proteínas), C (carbohidratos), G (grasas), instead of the French P/G/L; the original 32/48/21 g amounts are unchanged.

## Language review

An agent performed a second pass across every dictionary entry, including newly discovered dynamic trade cards and billing text. Native-speaker approval has not happened. The blank native review sheet is [landing-es-review.md](landing-es-review.md). Register is usted throughout. TPV identifies the software, caja the physical cash operation. Inventario/existencias, establecimiento, ticket and factura are used consistently. Thousands use a space, decimal fractions a comma, and MAD/% a preceding space. Source features/prices are preserved: no new Spanish software-language claim, plan, rate or promise was introduced.

## Sharing card

Spanish PNG rendered at 1200 × 630 with headless Chrome from [the committed template](../templates/landing-og-es.html). Method recovered from the existing FR/EN/AR source, commit 27826d13, in /Users/zaka/Developer/vexel-clone-hydrated-snapshot-20260823/.og-render/og-card.html. It reuses the original Cycle ring render (Tamminen credit), actual Kiwi logo and Google Inter Tight font; Spanish headline/subtitle, existing brand ink/paper/mint tokens, same layout. DE/IT/NL had no separate image files in this checkout. The image was personally viewed after rendering. Both sharing metadata fields address /es/opengraph-image; _headers maps it to image/png. The regression guard compares it against English bytes and checks PNG dimensions.

## Browser evidence

Real Google Chrome/Puppeteer run: **207/207 checks passed**, including all six Spanish widths and four English/French regression states. [Machine-readable results](evidence/2026-10-04-landing-es/browser-results.json) and [test output](evidence/2026-10-04-landing-es/browser-test-output.txt) record the actual run. Every page unregisters service workers and deletes cache keys, then reloads with the browser cache disabled.

| page | width | page scroll width | clipped text / overlaps / SVG overflow / console errors | full-page screenshot |
| --- | ---: | ---: | --- | --- |
| es | 360 | 360 | 0 / 0 / 0 / 0 | [es-360.png](evidence/2026-10-04-landing-es/es-360.png) |
| es | 390 | 390 | 0 / 0 / 0 / 0 | [es-390.png](evidence/2026-10-04-landing-es/es-390.png) |
| es | 768 | 768 | 0 / 0 / 0 / 0 | [es-768.png](evidence/2026-10-04-landing-es/es-768.png) |
| es | 1024 | 1024 | 0 / 0 / 0 / 0 | [es-1024.png](evidence/2026-10-04-landing-es/es-1024.png) |
| es | 1440 | 1440 | 0 / 0 / 0 / 0 | [es-1440.png](evidence/2026-10-04-landing-es/es-1440.png) |
| es | 1920 | 1920 | 0 / 0 / 0 / 0 | [es-1920.png](evidence/2026-10-04-landing-es/es-1920.png) |
| en | 390 | 390 | 0 / 0 / 0 / 0 | [en-390.png](evidence/2026-10-04-landing-es/en-390.png) |
| en | 1440 | 1440 | 0 / 0 / 0 / 0 | [en-1440.png](evidence/2026-10-04-landing-es/en-1440.png) |
| fr | 390 | 390 | 0 / 0 / 0 / 0 | [fr-390.png](evidence/2026-10-04-landing-es/fr-390.png) |
| fr | 1440 | 1440 | 0 / 0 / 0 / 0 | [fr-1440.png](evidence/2026-10-04-landing-es/fr-1440.png) |

The six `es-<width>-menu.png` captures also show the open language dropdown. [Expanded features](evidence/2026-10-04-landing-es/es-1440-more-features.png) include the Spanish invoice and nutrition demo. Screenshots were personally inspected at useful scale across the six Spanish widths, including hero, demos, pricing and footer. Corrected layout defects: dashboard navigation clipping, long product tiles, tablet introductory cards (whole heading words), tablet pricing/footer columns, and the sharing-diagram caption. A dedicated range-based check rejects heading words split across lines at each Spanish width.

Chrome's single full-page capture repeated the top of pages taller than its 16384-pixel compositor surface. Final full-page evidence assembles bounded document clips of at most 8000 pixels in a detached canvas. The viewport stays at the top during capture, preserving fixed/sticky elements; no DOM style or layout is changed. Measurement happens before this screenshot operation. Animated decoration can represent different moments across the clips. The real footer was separately verified against the tall-page capture. No image text was invented or retouched.

Interactions actually executed: seven ES-to-locale paths and six return paths (13 total); Español current/selected and all seven options; all 18 trade tabs at 390 and 1440 (36 clicks, each resulting demo measured); monthly/yearly billing with 199/249 MAD and source-rounded annual total 2 400 MAD; liquid-lens highlight (moved 106 px and aligned to the selected option, [geometry evidence](evidence/2026-10-04-landing-es/pricing-lens-results.json)); six additional features revealed; mobile menu opened/closed. The original extra-feature control has no collapse action, so none is claimed.

All 25 unique link targets were checked: eight existing anchors, 13 successful local HTTP targets, and four contact/external targets. WhatsApp and Sketchfab separately returned HTTP 200 ([external results](evidence/2026-10-04-landing-es/external-link-results.json)); telephone/email retain the source targets, with no call or message sent. Guide, legal and product-language fallbacks are listed below.

The dashboard is intentionally scaled; glows and table/receipt animation lanes can extend beyond their clipping containers. The QR-language marquee intentionally clips moving language tokens. These are visual effects, not truncated navigation or pricing text. Painted prose is measured geometrically; masked SVG demo frames are not treated as simultaneous controls. The unchanged team timeline first reveals the avatar and then grows its bar to uncover the clock label. Expanded-feature measurement waits for the real fully revealed phase; it does not disable the animation or translate the sample clock times.

## SEO and locale inventories

All eight landing HTML pages retain reciprocal fr/en/ar/de/it/nl/es/x-default hreflangs. Each locale canonical is self-referential; root index retains the French canonical. x-default remains /fr/. Spanish uses html lang=es and og:locale=es_ES for Open Graph interoperability, with neutral Spanish copy. All other landing heads contain es_ES as an alternate. The Spanish metadata was also checked in the hydrated real browser, not only the source HTML ([rendered head](evidence/2026-10-04-landing-es/rendered-head-results.json)). Sitemap has seven landing rows with all seven locale alternates and x-default; guide clusters remain fr/en/ar.

The nl/Nederlands inventory was checked across assets, functions, tools, content, sitemap, robots and _headers. Landing locale-menu labels, middleware public routes, generator/runtime dictionaries, sitemap and landing tests include es. Non-landing app language enumerations and guide publication locales are intentionally unchanged. The sitemap builder now separates the seven landing languages from the three guide-publication languages, so regeneration preserves the landing alternates without creating Spanish guides. All 21 existing guide files are unchanged. Stamp tooling now discovers locale landing shells, so bump-stamp can version these assets and seal their hashes without manual stamp edits.

## Known gaps

- Native-speaker review is pending.
- /en/guides/ is the intentional English guide fallback. No /es/guides/ was created.
- /mentions-legales.html, /privacy.html, /terms.html and /cookies.html are existing canonical legal documents. They retain their existing French/English content; Spanish anchor labels do not imply Spanish contracts.
- /dashboard.html is the existing product sign-in/demo destination, not a translated Spanish POS surface. No POS files, credentials or production data were changed.
- French QR tea and Arabic IQ examples intentionally depict the existing product languages. The marketing page does not claim Spanish product support.
- External WhatsApp, Sketchfab, telephone and email links retain source targets. Link QA sends no message and does not verify delivery to a person.

## Repository checks and release

Focused checks: Spanish static integration 146/146, browser 207/207, public assets 300, article templates 486/486, stamp drift 736 controls over 245 sealed assets, stamp coverage 7, bump-stamp tool 34/34. The guide builder reports `guide source is deterministic (21 pages + sitemap.xml)`. Rebuilding the landing twice is deterministic. Both new regression paths are wired into tools/check.js.

Negative guard proof: deliberately reintroducing the English heading fails with the exact unallowlisted h1; replacing the Spanish sharing card with the English PNG fails the byte-difference guard. Both runs exit 1, and both original files were restored ([mutation results](evidence/2026-10-04-landing-es/negative-guard-results.json), [copy output](evidence/2026-10-04-landing-es/negative-english-copy.txt), [image output](evidence/2026-10-04-landing-es/negative-english-og.txt)).

The first full run exposed sitemap regeneration drift and a premature check of the source's animated timeline mask; both are corrected. Its hotel-layout and app-bundle failures were missing installed font files, reproduced without changes at detached base de5af75d ([hotel failure](evidence/2026-10-04-landing-es/base-hotel-font-failure.txt), [app failure](evidence/2026-10-04-landing-es/base-app-font-failure.txt), [setup-shell failure](evidence/2026-10-04-landing-es/base-shell-font-failure.txt), [owner-shell failure](evidence/2026-10-04-landing-es/base-owner-font-failure.txt)). The hotel and app-bundle tests pass with the actual installed dependency fonts. No POS file was edited.

An intermediate run with fonts was stopped for the final tablet heading correction; it is not claimed as a completed gate. The final full run uses NODE_PATH for the existing Puppeteer dependency and a [read-only font-path alias](evidence/2026-10-04-landing-es/dependency-font-alias.cjs) via NODE_OPTIONS. This resolves only four actual font files from the primary checkout's installed packages; missing files still fail, all assertions are unchanged, and no app files are edited. The [environment record](evidence/2026-10-04-landing-es/dependency-environment.json) includes the exact font SHA-256 hashes. The final frozen-product full gate completed with **exit 0**, `all checks passed (1 warning(s))` ([complete output](evidence/2026-10-04-landing-es/check-output.txt)). The sole checker warning is the pre-existing `background:var(--ink)` debt on untouched POS assets. Module-format notices are existing Node diagnostics, not failed checks.

Reproduction command, from this isolated worktree:

```sh
NODE_PATH=/Users/zaka/Developer/kiwi/app/node_modules \
KIWI_CHROMIUM_BIN='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' \
KIWI_SHARED_FONT_ROOT=/Users/zaka/Developer/kiwi/app/node_modules \
NODE_OPTIONS="--require $PWD/docs/audits/evidence/2026-10-04-landing-es/dependency-font-alias.cjs" \
node tools/check.js
```

No simultaneous full checker was run. Git diff whitespace checks pass; native-review verdicts remain blank in all 450 rows. Implementation commit: `ba1619d1672300185cbe7013689fa14a40b26b6a` (`landing · complete Spanish copy and browser verification`, with Codex GPT-5 coauthor). Pushed without force by URL to both mirrors; both `refs/heads/main` were read back as this exact SHA ([mirror observations](evidence/2026-10-04-landing-es/release-results.json)). A documentation-only release-evidence commit follows; no product code changed after the successful full gate.

The live Cloudflare page was checked after deployment at 2026-10-04T17:07:30Z in a cache-disabled real browser after clearing service workers/cache storage: HTTP 200, html lang=es, self-canonical /es/, expected two content-hashed Spanish client bundles, landing-es.css?v=7, 1440/1440 width, and zero console/page errors. The public sharing endpoint returned HTTP 200 and image/png with SHA-256 exactly equal to the committed Spanish PNG ([production observations](evidence/2026-10-04-landing-es/production-results.json)). This is a live 1440-pixel load/sharing check, not a claim that the full local interaction matrix or native-language approval was repeated in production.

## Full leftover-string audit, before and after

Every node below either matched a source before correction or still matches one after it. Node numbers refer to copy-inventory.json. All retained instances have a reason; empty attributes and the absence of JSON-LD are covered above.

| node / kind | English-page source | Before | After | decision |
| --- | --- | --- | --- | --- |
| 17 / text | FR | FR | FR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 18 / text | EN | EN | EN | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 19 / text | AR | AR | AR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 29 / text | Kiwi AI | Kiwi AI | Kiwi AI | Brand, named demo merchant/person, plan name or model credit. |
| 30 / text | · | · | · | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 32 / text | YB | YB | YB | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 33 / text | Youssef Benali | Youssef Benali | Youssef Benali | Brand, named demo merchant/person, plan name or model credit. |
| 35 / text | Main | Principal | Principal | Correct Spanish spelling shared with the source. |
| 44 / text | 3 | 3 | 3 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 61 / text | Café Atlas | Café Atlas | Café Atlas | Brand, named demo merchant/person, plan name or model credit. |
| 64 / text | 27,632 | 27 632 | 27 632 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 65 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 66 / text | +2.5% | +2,5 % | +2,5 % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 67 / text | vs | vs | frente a | Translated from source. |
| 68 / text | 26,958 MAD | 26 958 MAD | 26 958 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 71 / text | 412 | 412 | 412 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 72 / text | +0.5% | +0,5 % | +0,5 % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 73 / text | vs | vs | frente a | Translated from source. |
| 74 / text | 410 | 410 | 410 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 77 / text | 67 | 67 | 67 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 78 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 79 / text | −1.5% | −1,5 % | −1,5 % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 80 / text | vs | vs | frente a | Translated from source. |
| 81 / text | 68 MAD | 68 MAD | 68 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 84 / text | 12,632 | 12 632 | 12 632 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 85 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 86 / text | +2.5% | +2,5 % | +2,5 % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 87 / text | vs | vs | frente a | Translated from source. |
| 88 / text | 12,324 MAD | 12 324 MAD | 12 324 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 93 / text | 1M | 1M | 1M | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 94 / text | 800k | 800k | 800k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 95 / text | 600k | 600k | 600k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 96 / text | 400k | 400k | 400k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 97 / text | 200k | 200k | 200k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 98 / text | 0 | 0 | 0 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 99 / text | 612,400 MAD | 612 400 MAD | 612 400 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 102 / text | Feb | Feb | feb | Translated from source. |
| 103 / text | Mar | Mar | mar | Translated from source. |
| 105 / text | May | May | may | Translated from source. |
| 106 / text | Jun | Jun | jun | Translated from source. |
| 107 / text | Jul | Jul | jul | Translated from source. |
| 109 / text | Sep | Sep | sep | Translated from source. |
| 110 / text | Oct | Oct | oct | Translated from source. |
| 111 / text | Nov | Nov | nov | Translated from source. |
| 114 / text | 21,060 | 21 060 | 21 060 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 115 / text | / 27,000 MAD | / 27 000 MAD | / 27 000 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 118 / text | 1,284 | 1 284 | 1 284 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 120 / text | +3.2% | +3,2 % | +3,2 % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 123 / text | 74 | 74 | 74 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 124 / text | % | % | % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 125 / text | 92,980 | 92 980 | 92 980 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 128 / text | 46 | 46 | 46 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 129 / text | % | % | % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 130 / text | 28,546 | 28 546 | 28 546 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 133 / text | 14 | 14 | 14 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 134 / text | % | % | % | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 135 / text | 14,008 | 14 008 | 14 008 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 141 / text | 800k | 800k | 800k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 142 / text | 600k | 600k | 600k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 143 / text | 400k | 400k | 400k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 144 / text | 200k | 200k | 200k | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 145 / text | 0 | 0 | 0 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 150 / text | Feb | Feb | feb | Translated from source. |
| 151 / text | Mar | Mar | mar | Translated from source. |
| 153 / text | May | May | may | Translated from source. |
| 154 / text | Jun | Jun | jun | Translated from source. |
| 155 / text | Jul | Jul | jul | Translated from source. |
| 157 / text | Sep | Sep | sep | Translated from source. |
| 170 / text | 01 | 01 | 01 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 171 / text | / | / | / | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 172 / text | 18 | 18 | 18 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 173 / text | T1 | T1 | T1 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 174 / text | T2 | T2 | T2 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 175 / text | T3 | T3 | T3 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 176 / text | T4 | T4 | T4 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 177 / text | T5 | T5 | T5 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 178 / text | T6 | T6 | T6 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 181 / text | Ticket | Ticket | Ticket | Correct Spanish spelling shared with the source. |
| 182 / text | T4 | T4 | T4 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 184 / text | 85 | 85 | 85 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 186 / text | 18 | 18 | 18 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 188 / text | Total | Total | Total | Correct Spanish spelling shared with the source. |
| 189 / text | 103 | 103 | 103 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 190 / text | 0 | 0 | 0 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 191 / text | 85 | 85 | 85 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 192 / text | 103 | 103 | 103 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 193 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 204 / text | Food truck | Food truck | Camión de comida | Translated from source. |
| 205 / text | Boutique | Boutique | Tienda de ropa | Translated from source. |
| 218 / alt | MIX Restaurant | MIX Restaurant | MIX Restaurant | Brand, named demo merchant/person, plan name or model credit. |
| 219 / alt | Pasta Corner | Pasta Corner | Pasta Corner | Brand, named demo merchant/person, plan name or model credit. |
| 220 / alt | Claro | Claro | Claro | Brand, named demo merchant/person, plan name or model credit. |
| 221 / alt | Startoner | Startoner | Startoner | Brand, named demo merchant/person, plan name or model credit. |
| 226 / text | BAR | BAR | BARRA | Translated from source. |
| 227 / text | TILL | TILL | TPV | Translated from source. |
| 228 / text | 01 | 01 | 01 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 229 / text | 02 | 02 | 02 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 230 / text | 6 min | 6 min | 6 min | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 231 / text | 02 | 02 | 02 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 232 / text | 03 | 03 | 03 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 233 / text | 03 | 03 | 03 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 234 / text | 04 | 04 | 04 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 235 / text | 05 | 05 | 05 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 236 / text | 05 | 05 | 05 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 237 / text | 06 | 06 | 06 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 238 / text | 07 | 07 | 07 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 239 / text | 08 | 08 | 08 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 240 / text | 06 + 07 | 06 + 07 | 06 + 07 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 241 / text | Free | Libre | Libre | Correct Spanish spelling shared with the source. |
| 249 / text | What were yesterday’s sales? | What were yesterday’s sales? | ¿Cuáles fueron las ventas de ayer? | Translated from source. |
| 250 / text | « Quelles ont été les ventes d’hier ? » | « Quelles ont été les ventes d’hier ? » | ¿Cuáles fueron las ventas de ayer? | Translated from source. |
| 251 / text | كم بلغت مبيعات الأمس؟ | كم بلغت مبيعات الأمس؟ | كم بلغت مبيعات الأمس؟ | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 252 / text | KIWI IQ | KIWI IQ | KIWI IQ | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 253 / text | FR | FR | FR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 254 / text | FR | FR | FR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 255 / text | AR | AR | AR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 256 / text | AR | AR | AR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 257 / text | EN | EN | EN | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 258 / text | EN | EN | EN | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 259 / text | 12,480 MAD | 12 480 MAD | 12 480 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 261 / text | 12 480 MAD | 12 480 MAD | 12 480 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 262 / text | +18 % | +18 % | +18 % | Translated from source. |
| 263 / text | 12‎ ‎480 درهم | 12‎ ‎480 درهم | 12‎ ‎480 درهم | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 266 / text | vs le même jour la semaine passée | vs le même jour la semaine passée | frente al mismo día de la semana pasada | Translated from source. |
| 267 / text | مقارنة باليوم نفسه من الأسبوع الماضي | مقارنة باليوم نفسه من الأسبوع الماضي | مقارنة باليوم نفسه من الأسبوع الماضي | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 270 / text | 7 DERNIERS JOURS | 7 DERNIERS JOURS | ÚLTIMOS 7 DÍAS | Translated from source. |
| 271 / text | HIER | HIER | AYER | Translated from source. |
| 272 / text | آخر 7 أيام | آخر 7 أيام | آخر 7 أيام | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 273 / text | الأمس | الأمس | الأمس | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 276 / text | CE QUI CLOCHE | CE QUI CLOCHE | QUÉ OCURRE | Translated from source. |
| 277 / text | Marge en baisse sur les jus pressés. | Marge en baisse sur les jus pressés. | El margen de los jugos naturales ha bajado. | Translated from source. |
| 278 / text | موضع الخلل | موضع الخلل | موضع الخلل | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 279 / text | هامش ربح العصائر الطازجة يتراجع. | هامش ربح العصائر الطازجة يتراجع. | هامش ربح العصائر الطازجة يتراجع. | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 282 / text | À FAIRE | À FAIRE | SIGUIENTE PASO | Translated from source. |
| 283 / text | Remonter le jus d’orange de 2 MAD. | Remonter le jus d’orange de 2 MAD. | Subir el precio del jugo de naranja en 2 MAD. | Translated from source. |
| 284 / text | الخطوة التالية | الخطوة التالية | الخطوة التالية | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 285 / text | ارفع سعر عصير البرتقال بدرهمين. | ارفع سعر عصير البرتقال بدرهمين. | ارفع سعر عصير البرتقال بدرهمين. | Intentional Arabic-language Kiwi IQ demonstration; preserves the actual supported language, not Spanish product support. |
| 302 / text | #248 | #248 | #248 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 306 / text | 01 | 01 | 01 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 309 / text | 02 | 02 | 02 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 312 / text | 03 | 03 | 03 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 315 / text | 04 | 04 | 04 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 323 / text | AT THE COUNTER | AT THE COUNTER | EN EL MOSTRADOR | Translated from source. |
| 331 / text | Thermal printer | Thermal printer | Impresora térmica | Translated from source. |
| 332 / text | ESC/POS | ESC/POS | ESC/POS | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 334 / text | TPE | TPE | TPE | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 336 / text | HID | HID | HID | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 338 / text | PWA | PWA | PWA | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 340 / text | KDS | KDS | KDS | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 342 / text | RJ11 | RJ11 | RJ11 | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 346 / text | Sold | Sold | Vendidos | Translated from source. |
| 347 / text | Rented | Rented | Alquilados | Translated from source. |
| 348 / text | Shared | Shared | Compartidos | Translated from source. |
| 349 / text | YOUR DATA | YOUR DATA | SUS DATOS | Translated from source. |
| 359 / text | Yassine | Yassine | Yassine | Brand, named demo merchant/person, plan name or model credit. |
| 361 / text | FR | FR | FR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 362 / text | EN | EN | EN | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 363 / text | AR | AR | AR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 364 / text | ES | ES | ES | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 365 / text | ZH | ZH | ZH | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 366 / text | DE | DE | DE | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 367 / text | RU | RU | RU | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 368 / text | IT | IT | IT | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 369 / text | JA | JA | JA | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 370 / text | PT | PT | PT | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 371 / text | HE | HE | HE | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 372 / text | NL | NL | NL | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 373 / text | KO | KO | KO | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 374 / text | TR | TR | TR | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 375 / text | HI | HI | HI | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 376 / text | PL | PL | PL | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 377 / text | EL | EL | EL | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 378 / text | SV | SV | SV | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 379 / text | ID | ID | ID | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 380 / text | UK | UK | UK | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 381 / text | DA | DA | DA | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 382 / text | NO | NO | NO | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 383 / text | Thé | Thé | Thé | French product-name sample in the 23-language QR-menu demonstration. |
| 384 / text | à | à | à | French product-name sample in the 23-language QR-menu demonstration. |
| 385 / text | la | la | la | French product-name sample in the 23-language QR-menu demonstration. |
| 386 / text | menthe | menthe | menthe | French product-name sample in the 23-language QR-menu demonstration. |
| 387 / text | 18 MAD | 18 MAD | 18 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 391 / text | ESC/POS | ESC/POS | ESC/POS | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 394 / text | 8 | 8 | 8 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 395 / text | 2 | 2 | 2 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 396 / text | 0 | 0 | 0 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 397 / text | 4 | 4 | 4 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 398 / text | 1 | 1 | 1 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 399 / text | 6 | 6 | 6 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 406 / text | +48 | +48 | +48 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 407 / text | +120 | +120 | +120 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 408 / text | 27 632 | 27 632 | 27 632 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 409 / text | 27 680 | 27 680 | 27 680 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 410 / text | 27 800 | 27 800 | 27 800 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 414 / text | Lait | Lait | Leche | Translated from source. |
| 415 / text | −1 | −1 | −1 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 416 / text | Café | Café | Café | Correct Spanish spelling shared with the source. |
| 417 / text | −1 | −1 | −1 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 418 / text | Sucre | Sucre | Azúcar | Translated from source. |
| 419 / text | −1 | −1 | −1 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 425 / text | · 3 | · 3 | · 3 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 427 / text | SA | SA | SA | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 428 / text | 08:02 | 08:02 | 08:02 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 429 / text | YB | YB | YB | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 430 / text | 08:15 | 08:15 | 08:15 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 431 / text | RM | RM | RM | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 432 / text | 12:30 | 12:30 | 12:30 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 437 / text | 19:00 | 19:00 | 19:00 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 438 / text | 20:00 | 20:00 | 20:00 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 439 / text | 21:00 | 21:00 | 21:00 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 440 / text | 22:00 | 22:00 | 22:00 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 441 / text | 19:30 | 19:30 | 19:30 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 442 / text | T4 · 2 | T4 · 2 | T4 · 2 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 443 / text | 21:00 | 21:00 | 21:00 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 444 / text | T2 · 6 | T2 · 6 | T2 · 6 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 448 / text | 1 240 MAD | 1 240 MAD | 1 240 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 449 / text | FACTURE | FACTURE | FACTURA | Translated from source. |
| 450 / text | 2026-0142 | 2026-0142 | 2026-0142 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 451 / text | ICE 00156··· · Client | ICE 00156··· · Client | ICE 00156··· · Cliente | Translated from source. |
| 452 / text | TOTAL | TOTAL | TOTAL | Correct Spanish spelling shared with the source. |
| 453 / text | 1 240 MAD | 1 240 MAD | 1 240 MAD | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 455 / text | PDF | PDF | PDF | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 460 / text | 180 g | 180 g | 180 g | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 462 / text | 60 g | 60 g | 60 g | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 464 / text | 40 g | 40 g | 40 g | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 465 / text | 0 | 0 | 0 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 466 / text | 320 | 320 | 320 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 467 / text | 540 | 540 | 540 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 468 / text | kcal | kcal | kcal | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 469 / text | P | P | P | P is the Spanish proteínas abbreviation as well as the source French protéines abbreviation. |
| 470 / text | 32 | 32 | 32 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 471 / text | g | g | g | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 472 / text | G | G | C | Translated from source. |
| 473 / text | 48 | 48 | 48 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 474 / text | g | g | g | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 475 / text | L | L | G | French L (lipides) is deliberately localized to Spanish G (grasas); the numerical amount is preserved. |
| 476 / text | 21 | 21 | 21 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 477 / text | g | g | g | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 478 / text | Gluten | Gluten | Gluten | Correct Spanish spelling shared with the source. |
| 488 / text | Basic | Basic | Basic | Brand, named demo merchant/person, plan name or model credit. |
| 490 / text | 249 | 249 | 249 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 491 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 500 / text | Pro | Pro | Pro | Brand, named demo merchant/person, plan name or model credit. |
| 502 / text | 399 | 399 | 399 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 503 / text | MAD | MAD | MAD | Currency, hardware/nutrition unit, language code or sample staff initials. |
| 544 / text | Cookies | Cookies | Política de cookies | Translated from source. |
| 547 / text | +212 624 495 159 | +212 624 495 159 | +212 624 495 159 | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 548 / text | contact@kiwi-os.com | contact@kiwi-os.com | contact@kiwi-os.com | Unchanged numeric fixture, date, time, invoice/table identifier, punctuation or contact detail. |
| 552 / text | Kiwi | Kiwi | Kiwi | Brand, named demo merchant/person, plan name or model credit. |
| 554 / text | Tamminen | Tamminen | Tamminen | Brand, named demo merchant/person, plan name or model credit. |
