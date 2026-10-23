# Menu rules extraction, 2026-10-23

`assets/menu-catalog.js` starts with an independent pure factory, exported as
`window.KiwiMenuRules` and CommonJS `module.exports`. Its export adapter is the
only reference to the browser global; the factory has no ambient screen,
storage, network or timer access. Requiring the asset in Node skips screen boot.
No new script tag, dynamic request, stamp or service-worker change is needed.
The dashboard already loads this asset before `restaurant-menu-workspace.js`.
The waiter, till and public OrderPro shells do not load it.

The screen delegates dish creation and patches, formula validation, category and
option construction, option-group patches, emoji validation, availability,
lookups, sequence recovery and the existing Latin slug fallback. Mutation of
stored objects stays in the persistence adapter. Locale-dependent defaults are
passed into the factory. Existing permissive option-ID arrays and nutrition
patches retain their original semantics; this is not a new publication sanitizer.
Unknown top-level dish/patch fields and unknown formula/slot/choice fields are
ignored by the existing whitelists.

`priceDish(dish, chosenModifiers, quantity = 1, taxPercent = 0)` returns integer
`unitCents`, `subtotalCents`, `taxCents`, `totalCents`. Each chosen modifier has a
MAD `price`. Quantity is a nonnegative whole number, optional tax is additive,
rounded once on the extended subtotal. This API does not resolve selection IDs,
promotions, set-menu explosion, or tax-inclusive margins. Callers must use values
whose resulting centimes fit in JavaScript safe integers. It is deliberately not
substituted for floating-point screen paths with different rounding semantics.

## Duplicate audit

| Surface / symbol | Finding and disposition |
| --- | --- |
| Workspace `saveItem`, formula choice `extra` | Identical nonnegative coercion now calls `KiwiMenuRules.nonnegative`. |
| Workspace `norm`, `validSlots`, min/max inputs | Search normalization uses French locale; draft formula defaults, random IDs and partial input differ from the saved schema. Retained. Save still passes through store formula validation. |
| Waiter `svApplyCarte`, `optsExtra`, formula confirmation | Availability matches; category fallback and item projection differ. Option sums and formula extras use floats. No shared asset loaded, retained. |
| OrderPro page `toCents`, `customizerUnitPrice`, catalog ingestion | Centime conversion exists, but customizer additions use floats and `delta`, catalog prices round on ingestion; formula availability/min/max and selection shape differ. No shared asset loaded, retained. |
| OrderPro boutique product projection | Rounds `priceMAD` and uses variants/stock, a different schema. Retained. |
| OrderPro publish `slugMerchant` | Latin normalization overlaps, but non-Latin names hash and empty names fall back to `client`; catalog fallback returns an empty slug. Retained. |
| Other `orderpro-*.js` | Guest nick keys, guest-page document normalization, display rounding, media geometry, and snapshot projection are not equivalent dish-schema/pricing rules. Retained. |
| Till `rebuildCarte` (around line 784) | Availability and category routing overlap; category/subcategory fallback and item projection are screen-specific. Frozen file untouched. |
| Till option totals (around lines 1431, 1470), formula extras (1583, 1631), formula-choice supplement coercion (3406) | Floating option/formula sums, promotion application and nonnegative supplement coercion overlap. Frozen byte-exact file untouched. |
| Till `money`/`minor` (12), name normalization (1172) | EPSILON rounding and artwork matching differ from the extracted schema. Untouched. |

## Evidence and remaining work

- Seven strict properties, 500 generated cases each: dish/schema idempotence,
  immutability, hostile-field whitelists, formula references/bounds, centime sum,
  quantity/tax, monotonic modifier removal, availability, IDs and slugs.
- Pre-existing formula edge, fixed: truncating a long label to 60 characters
  could leave trailing whitespace that disappeared on the second normalization.
  The label is now trimmed after truncation and the property is strict.
- A local differential comparison against the original asset passed 500 generated
  editor sequences including categories, groups, choices, dish creation, patches,
  formula removal and nutrition removal, with identical resulting records.
- Formula protocol harness now supplies the actual rules dependency.
- No size pin needed lowering: no pinned file shrank; script counts are unchanged.
- Restamp before release: `assets/menu-catalog.js`,
  `assets/restaurant-menu-workspace.js`. Stamps intentionally unchanged here.
- Phone browser suite attempted once; sandbox refused the localhost listener
  (`listen EPERM 127.0.0.1`) before browser scenarios could run.

## Targeted suite results

All 35 matching non-browser suites passed (default case counts):

- `cost-margin-test.js`: pass.
- `cross-store-copy-test.mjs`: pass.
- `formula-protocol-test.mjs`: pass.
- `food-trades-truth-test.mjs`: pass.
- `legacy-venue-modals-test.mjs`: pass.
- `menu-option-group-editor-test.mjs`: pass.
- `menu-insights-test.mjs`: pass.
- `menu-sales-test.mjs`: pass.
- `restaurant-menu-peak-hours-test.js`: pass.
- `resto-carte-test.js`: pass.
- `menu-analysis-properties-test.mjs`: pass.
- `menu-scan-test.mjs`: pass.
- `menu-translate-test.mjs`: pass.
- `menu-carte-store-test.js`: pass.
- `menu-truth-test.mjs`: pass.
- `menu-analysis-test.mjs`: pass.
- `native-pass5-test.mjs`: pass.
- `menu-ledger-test.mjs`: pass.
- `menu-pairs-test.js`: pass.
- `menu-nutrition-test.mjs`: pass.
- `orderpro-guestpage-editor-test.mjs`: pass.
- `menu-pull-route-test.js`: pass.
- `menu-i18n-test.mjs`: pass.
- `menu-properties-test.mjs`: pass.
- `restaurant-menu-nutrition-tab-test.js`: pass.
- `orderpro-formula-choice-images-test.mjs`: pass.
- `restaurant-recipe-layout-test.mjs`: pass.
- `restaurant-item-editor-test.mjs`: pass.
- `restaurant-menu-route-test.js`: pass.
- `native-pass7-test.mjs`: pass.
- `scoped-tab-isolation-test.mjs`: pass.
- `restaurant-menu-ledger-reconciliation-test.js`: pass.
- `restaurant-menu-performance-test.js`: pass.
- `restaurant-units-test.js`: pass.
- `menu-rules-properties-test.mjs`: pass.

Additional checks: file-size ratchet 668 checks passed; PWA shell 804 checks
passed; `git diff --check` passed. The full gate was not run.
