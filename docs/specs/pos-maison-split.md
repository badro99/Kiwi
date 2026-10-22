# Maison till split

Reference: HEAD 12ebe6b3, 9,613 lines, one outer IIFE. The frozen gzip and its
SHA-256 are in `tools/fixtures/pos-maison/`. The reference is test-only.

## Original section map

| Original lines | Feature / public registration | Destination |
| --- | --- | --- |
| 1–18 | Outer wrapper and strict mode | Wrapper removed; module strict mode |
| 19–47 | DOM, money and date helpers | sales |
| 48–118 | Real-store and tenant identity | core |
| 119–291 | Retail icons, colours | sales |
| 292–511 | Catalogue, stock reconciliation, team and client state | core |
| 512–558 | Shared client-book access | sales |
| 559–818 | Sales, tenders, credit and ticket data | core |
| 819–1020 | State, persistence, retained journal and tenant reload | core |
| 1021–1506 | Shared sales journal and ticket numbering | core |
| 1507–1706 | Prices, discounts, consignment | core |
| 1707–2113 | Mount, navigation and active view | core |
| 2114–4363 | Grid, ticket, product sheet, clients, camera, registries, procurement, damage and delivery | sales |
| 4364–5263 | Returns, credit issuance and return UI | checkout, except issueAvoir in core |
| 5264–6021 | Checkout, balance collection, tender sheets and receipt | checkout, except checkout and payExistingBalance in core |
| 6022–6609 | Offline/network state and barcode input | checkout |
| 6610–7268 | Promotions and composer | inventory |
| 7269–7996 | Stock movements, inventory and product/variant editing | inventory |
| 7997–8783 | Intake state machine and label printing | inventory |
| 8784–9613 | Service opening/closing, reprint provider and dispatcher registration | core |

The exact statement boundaries, original line ranges and declaration names are
recorded in `split.json`. Comments travel with their statements; therefore the
high-level feature boundaries above can include comments belonging to the next
statement. The reconstruction test proves that every body byte occurs exactly
once, unchanged.

## Shared state and glue

Four ES modules retain lexical state with live bindings. No copied snapshots,
window state bridge, eval or rewritten function bodies are used. Every added
glue line is listed literally in each chunk's `lead` and `tail` in `split.json`:
three import declarations and one export declaration per file. They expose
internal module bindings only; no new window globals are introduced.

Core owns mutable catalogue, sales, ticket, staff/client, tenant, stock and
service state. Sales owns formatting/icons, product sheets and customer views.
Checkout owns payment/return UI and scanners. Inventory owns promotion and
stock tooling. Each feature imports the functions and live state it uses from
the other three modules; the literal import/export lists document each edge.

`issueAvoir`, `checkout` and `payExistingBalance` stay in core because they assign
core-owned `avSeq`, `saleSeq` or `bqOutstandingCents`. Imported bindings cannot
be assigned. Moving these would require edits to their bodies. Other assignment
owners likewise remain in their original state module.

All startup effects, listeners and public registrations remain in core in their
original order. Feature top levels only declare functions/constants. The static
module graph links before core evaluates, including cyclic live references.

Dispatcher glue adds `module: true` only to Maison's registry entry and sets
`script.type = 'module'` for that entry. Its load promise resolves after the
whole static dependency graph executes and Maison registers. Other verticals
retain their classic script path and existing retry handling.

Every graph URL is stamped and precached. Stamp tooling follows relative static
imports, including cycles; the PWA test verifies the complete graph offline.

## Proof

`pos-maison-split-test.mjs` reconstructs the original byte-for-byte, evaluates
original and actual module graph in demo and real VM contexts, and compares
registrations, function sources, globals, initialization order, storage and
reprint output. Legacy extraction tests reconstruct the actual production
bodies in original order through `pos-maison-test-source.cjs`.

`pos-maison-split-browser-test.mjs` uses the real demo page and dispatcher in
fresh contexts for the frozen original and current modules. It completes one
cash sale and compares initial DOM, receipt DOM, reprint sales and storage.
It uses browser-trace and reports environment failures distinctly. Run it on
a host permitting loopback and Chromium before deployment.

## Validation in this sandbox

All 95 existing test files matching `pos-maison|maison` were attempted: 75 passed,
20 could not bind loopback (EPERM). The new VM suite passed; the new browser
reference/sale suite also reports EPERM. No rendered or sale browser comparison
was executed here. The blocked suites are:

- `avoir-customer-scope-browser-test.mjs`
- `client-history-browser-test.mjs`
- `clients-book-page-browser-test.mjs`
- `dashboard-breadcrumb-language-test.mjs`
- `discount-policy-browser-test.mjs`
- `invoicing-v2-browser-test.mjs`
- `ipad-touch-browser-test.mjs`
- `kds-cards-browser-test.mjs`
- `kiwi-ui-qa-mcp-test.mjs`
- `maison-caisse-browser-test.mjs`
- `maison-dashboard-browser-test.mjs`
- `maison-movement-kpis-browser-test.mjs`
- `maison-shelf-price-browser-test.mjs`
- `operations-system-test.mjs`
- `pairs-boutique-browser-test.mjs`
- `pos-maison-split-browser-test.mjs`
- `repeat-sale-guard-test.mjs`
- `retail-acompte-browser-test.mjs`
- `retail-return-stock-browser-test.mjs`
- `retail-tender-browser-test.mjs`
- `team-codes-browser-test.mjs`

`node tools/check.js --fast` has only the eight known loopback failures:
operations-system, audit-remediation-devices, economat-real-d1-transfer,
kiwi-agent-access, invoicing-v2-real-server-browser, retail-tender-browser,
retail-acompte-browser and print-relay. Their EPERM failures reproduce in an
untouched HEAD export. The exported tree additionally cannot run haptics-scan
because it has no Git index; that check passes in the real worktree.

PWA: 755 checks, all 17 verticals complete offline. Stamps: 1,146 checks.
Material icons: 30 checks; Maison total remains 227 (22/68/38/99).
Stamp tooling: 65 checks including cyclic import bump/cascade.
Size ratchet: 644 checks; core pin lowered from 9,456 to 2,991 lines.
