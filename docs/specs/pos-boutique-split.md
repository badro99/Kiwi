# Boutique till split

Reference: f746ee9e, 8,080 lines, one outer IIFE. The test-only frozen source,
SHA-256 and exact statement map live in `tools/fixtures/pos-boutique/`.

## Original section map

| Original lines | Feature / registration | Destination |
| --- | --- | --- |
| 1–18 | Wrapper and strict mode | Wrapper removed; strict statement retained |
| 19–46 | DOM, money, date helpers | sales |
| 47–87 | Store identity, money input, toast | core |
| 88–259 | Barcode, retail art, colours | sales |
| 260–506 | Catalogue, stock, staff and client state | core |
| 507–554 | Client-book access and loyalty readers | sales |
| 555–801 | Demo gate, seeded sales, credit registry | core |
| 802–994 | Ticket state, retained journal, tenant persistence | core |
| 995–1343 | Shared sales, return sync, ticket numbering | core |
| 1344–1456 | Prices, promotions, ticket math, upload queue | core |
| 1457–1845 | Mount, fullscreen, navigation, rendering | core |
| 1846–2381 | Grid, ticket, variant sheet | sales |
| 2382–2628 | Customer picker and customer view | sales |
| 2629–3101 | Scan, other-store lookup, camera | sales |
| 3102–3731 | Returns, exchanges, credit UI | checkout, except issueAvoir |
| 3732–4704 | Checkout, payment sheets, balance collection, receipt | checkout, except checkout and payExistingBalance |
| 4705–5317 | Offline/network, inventory scan, keyboard wedge | checkout |
| 5318–5976 | Promotions, labels, promotion composer | inventory |
| 5977–6489 | Inventory, products, variants, existing barcodes | inventory |
| 6490–7256 | Intake state machine and label printing | inventory |
| 7257–8080 | Service opening/closing, reprint provider, dispatcher registration | core |

The three exceptions stay in core because they assign core-owned `avSeq`,
`saleSeq` or `bqOutstandingCents`. Their bodies are unchanged. Comments travel
with statements, so the exact fragment map can extend a section boundary.

## State, dependencies and every glue line

- Core: 2,758 lines. Owns mutable catalogue, tenant identity, sales, ticket,
  staff/client and service state. Registers Maison Mansour with
  `KiwiPosDispatch` as `boutique` and its provider with `KiwiPosReprint`.
- Sales: 1,511 lines. Owns art/formatting helpers, sheet and camera state;
  imports live core data and checkout/inventory entry points.
- Checkout: 1,871 lines. Owns return/payment/network/scanner helpers;
  imports core ledger/credit operations and sales/inventory UI helpers.
- Inventory: 1,944 lines. Owns promotion and intake state; imports live
  catalogue/stock operations, sales display helpers and checkout scan helpers.

All modules use the same ES live-binding mechanism as Maison. Each adds exactly
three import declarations and one export declaration. `split.json` records all
16 glue lines literally (`lead`/`tail`), with every exported and imported name
and its dependency file. No moved body line changes. The original outer IIFE
header/footer is omitted, with its strict directive preserved. No window state
bridge, copied state or eval is added. Feature initializers only build pure
constants; the demo gate, startup effects, listeners and public registrations
stay in core in original order.

The existing dispatcher receives only `module: true` on Boutique's registry
entry. Its existing module load promise waits for the entire linked graph and
registration. All chunks are SHELL entries; the existing PWA module-closure test
and stamp scanner now cover both tills. The exact stamped core URL comes from
the dispatcher. Both VM tests assert every feature back-import resolves to
that URL, query included, and that the graph contains exactly four instances.

## Proof and maintenance

`pos-boutique-split-test.mjs` reconstructs the frozen original byte-for-byte,
evaluates the actual stamped module graph and original in matched demo/real VM
contexts, and compares globals, registration/function sources, startup order,
storage and reprint output. It is named in `tools/check.js`.

The existing Maison extraction adapter is generalized into
`pos-retail-test-source.cjs`; its previous name remains a compatibility alias.
Legacy extraction tests reconstruct actual production bodies in original order.
No business assertions are relaxed. The real module graph has its own VM test.
Browser fixtures use modules and matching core stamps for both tills.

The Boutique icon budget is redistributed 19/39/35/81, total 174, unchanged.
No stylesheet or pinned !important count moves. Inline style bytes are retained
by the body reconstruction proof. The core line pin is lowered 7,882 to 2,758.

## Sandbox validation

166 Boutique/retail-related suites were attempted: 133 passed; 33 were blocked
by loopback restrictions. 32 print EPERM directly. clients-campaign-flag reports
only “fixture exited 1”; running its retail fixture directly reproduces EPERM,
and its untouched HEAD version fails identically. No product assertion failure
remains. The separately rerun Maison VM suite also passes.

Blocked suites (all require browser/loopback):

- `app-interaction-test.mjs`
- `avoir-customer-scope-browser-test.mjs`
- `boutique-phone-browser-test.mjs`
- `caisse-restaurant-lang-browser-test.mjs`
- `client-history-browser-test.mjs`
- `clients-book-page-browser-test.mjs`
- `clients-campaign-flag-test.mjs`
- `dashboard-pin-vault-browser-test.mjs`
- `delivery-collect-browser-test.mjs`
- `discount-policy-browser-test.mjs`
- `fixture-agreement-test.mjs`
- `french-leak-browser-test.mjs`
- `ipad-touch-browser-test.mjs`
- `maison-caisse-browser-test.mjs`
- `maison-dashboard-browser-test.mjs`
- `maison-movement-kpis-browser-test.mjs`
- `maison-shelf-price-browser-test.mjs`
- `native-premium-feel-test.mjs`
- `operations-system-test.mjs`
- `orderpro-parity-browser-test.mjs`
- `pairs-boutique-browser-test.mjs`
- `pairs-caisse-browser-test.mjs`
- `promo-window-browser-test.mjs`
- `repeat-sale-guard-test.mjs`
- `retail-acompte-browser-test.mjs`
- `retail-return-stock-browser-test.mjs`
- `retail-tender-browser-test.mjs`
- `scan-wedge-browser-test.mjs`
- `shift-age-nudge-test.mjs`
- `sync-ledger-boutique-browser-test.mjs`
- `sync-ledger-browser-test.mjs`
- `team-codes-browser-test.mjs`
- `z-reconciliation-browser-test.mjs`

`node tools/check.js --fast`: only the eight known EPERM suites fail:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay. Their failures reproduce in an untouched
f746ee9e export. That export also fails haptics-scan because it has no Git index;
the actual worktree passes it.

PWA: 785 checks, all 17 verticals complete offline. Stamps: 1,155 checks.
Stamp tooling: 65 checks. Material icons: 30 checks. Size ratchet: 647 checks.
The two inline !important occurrences move unchanged to checkout; pinned
stylesheet counts do not change. Browser sale/render checks remain for the owner.
