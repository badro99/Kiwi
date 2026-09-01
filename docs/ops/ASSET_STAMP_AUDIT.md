# Asset stamp audit

Audit base: `c6cb5edd`, before stamping `assets/procurement.js`.

The earlier line-oriented count only matched tags where `src` immediately
followed `<script`. Parsing script attributes in any order finds a larger set:

| Shell | Script references | Unstamped references |
|---|---:|---:|
| `dashboard.html` | 130 | 40 |
| `kiwi-caisse.html` | 70 | 22 |
| `kiwi-serveur.html` | 20 | 8 |

Those 70 references resolve to 48 unique assets.

## Classification

| Bucket | Unique assets | Decision |
|---|---:|---|
| Should be stamped | 47 | First-party code with a stable, cacheable filename. Stamp in small commits. |
| Deliberately unstamped | 0 | No defensible case found. |
| Vendored or generated | 1 | `assets/vendor/dexie.min.js` is vendored, but its filename is not hashed or versioned, so it still needs a Kiwi stamp and is not excepted. |
| Dead | 0 | Every reference resolves to a file; no script was proven unused. Propose removal separately if runtime evidence establishes that. |

Task 1 removes `assets/procurement.js` from the first bucket. The remaining
backlog is 46 first-party assets plus the vendored Dexie file.

### First-party backlog at audit time

`assets/accounting.js`, `assets/agent-data.js`, `assets/ai-telemetry.js`,
`assets/auth-guard.js`, `assets/barcode.js`, `assets/caisse-lang.js`,
`assets/caisse-motion.js`, `assets/caisse-refresh.js`, `assets/cloud-doc.js`,
`assets/color-palette.js`, `assets/conformite.js`, `assets/demoClock.js`,
`assets/depenses.js`, `assets/design-2026.js`, `assets/design-ios27.js`,
`assets/design-vitrine.js`, `assets/employee-pwa.js`, `assets/err-reporter.js`,
`assets/finance.js`, `assets/growth-crm.js`, `assets/growth-kit.js`,
`assets/hours-ui.js`, `assets/hours.js`, `assets/image-proof.js`,
`assets/insights.js`, `assets/kiwi-env.js`, `assets/liquid-glass.js`,
`assets/liquid-lens.js`, `assets/marketing-suite-tease.js`,
`assets/merchant-config.js`, `assets/operational-print.js`,
`assets/operator-access.js`, `assets/oppo-cards.js`,
`assets/orderpro-panel.js`, `assets/polish.js`, `assets/pos-reprint.js`,
`assets/procurement.js`, `assets/production-action-guard.js`,
`assets/promos.js`, `assets/qrcode.js`, `assets/receipt-ui.js`,
`assets/receipt.js`, `assets/restaurant-units.js`, `assets/rtl-numbers.js`,
`assets/staff-roles.js`, `assets/ux.js`, and `assets/vertical-state.js`.

`assets/merchant-config.js` is especially misleading: it is already in
`tools/asset-stamps.json`, but its caisse and serveur tags are bare. A coverage
gate must therefore reject a bare shell reference even when another reference
put the asset in the manifest.

## Rollout plan

1. Boot and trust boundary: `kiwi-env`, `auth-guard`, `operator-access`,
   `staff-roles`, `err-reporter`, `cloud-doc`, `merchant-config`.
2. Shared transaction path: receipt, promotions, barcode, hours, language,
   reprint, operational print, vertical state and inventory support.
3. Dashboard business modules: accounting, finance, expenses, CRM, insights,
   OrderPro and the remaining operational panels.
4. Presentation modules: liquid effects, design controllers, polish, UX and
   the vendored Dexie URL.

Each group should use `node tools/bump-stamp.js` and land as its own reviewed
commit. Do not delete a tag during stamping work, and do not add an asset to the
service-worker precache merely because its URL is being stamped.
