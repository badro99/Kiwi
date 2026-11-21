# Sale-line supplier stamp Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every boutique and maison sale line records the supplier of the product sold, so the supplier ranking still credits a supplier after the product is deleted from the catalogue.

**Architecture:** A new optional short key `sp` (supplier id at the time of sale) joins the existing sale-line v2 keys, exactly like `c` (category at sale time). The till reads it from the product map `P` and sends it as `supplierId`. Three whitelists carry it: `pos-sale.js cleanLine`, the offline queue compactor and `/api/sale`. `/api/suppliers/ranking` then uses `sp` for products that no longer exist in the catalogue.

**Tech Stack:** Vanilla JS (till, IIFE globals), Cloudflare Pages Functions (ES modules), D1 `sales.lines` JSON, node test files in `tools/` wired into `tools/check.js`.

**Spec:** The owner's request of 21 Nov 2026 ("store each sale line's supplier at sale time so deleted products keep their supplier"), following commit 9cc1f2a42. Finding behind it (prod, read-only): Santos had 91 % of its 90-day revenue on products since deleted, none with a delivery note, so that revenue cannot be assigned to any supplier today.

## Global Constraints

- The key is `sp`. Long form on the till side is `supplierId`. Value: string, trimmed, max 80 chars, omitted when empty (never `''` on the wire, never invented).
- No D1 schema change. `sales.lines` is JSON text, so there is no migration.
- No change to any money figure. Do **not** add `unitCost`/`k` to boutique or maison lines: `cost.js`, `month-report.js` and `day-report-export.js` prefer a cost frozen in the sale, so adding it would change merchant margins. That is a separate decision.
- Old sales (before this ships) have no `sp`. Nothing backfills them. The ranking keeps its current fallbacks.
- `assets/boutique-catalog.js` is at its size ceiling (1 416 lines, pin 1 366 + 50 slack). The field must go on an existing line. `pos-boutique.js` has 28 lines of room (frozen 2 955), `pos-maison.js` 31 (pin 2 991 + 50). Never raise a pin.
- Each edited asset moves its stamp with `node tools/bump-stamp.js <files>`, never by hand.
- Commits: `<scope> · <what changed>`, author from repo config, footer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Stage by path. Push `main` to both mirrors by URL (`"${H}:refs/heads/main"`).
- This touches the caisse sale path, so it gets the **full gate** (`npm run check:full`) before calling it done (CLAUDE.md §3, money path).

## Review Focus

1. **Untagged product.** A line for a product with no supplier must carry no `sp` key at all, not `sp: ""`. The test asserts `!('sp' in line)`.
2. **Oversized basket.** `fitBasket` must drop `sp` with the other optional detail before folding lines. A 40-line basket at the 24 000-char limit must still keep every centime. Test in Task 2.
3. **Offline replay of an old queued sale.** A sale queued before the update has no `supplierId`. It must post unchanged, with no `sp` key. Covered by the legacy-line assertion in Task 2.
4. **Product retagged to another supplier.** Products still in the catalogue keep using their current `supplierId`. `sp` is only read for products that are gone. Test in Task 4 pins this so nobody "fixes" it into splitting history.
5. **Deleted product with no known cost.** Its sales count for the supplier's revenue but must not turn the whole supplier's margin into "unknown". Test in Task 4.

---

### Task 1: The till stamps the supplier on each line

**Files:**
- Modify: `assets/boutique-catalog.js:1275`. Append `supplierId: p.supplierId || ''` to the existing line `createdAt: p.createdAt || 0, cost: p.cost || 0,`. **Same line, no new line.**
- Modify: `assets/pos-boutique.js:509-512` (`originalSalePayload`) and `assets/pos-boutique.js:1992-2000` (checkout basket).
- Modify: `assets/pos-maison.js:519-522` and `assets/pos-maison.js:2070-2078`.
- Modify: `assets/pos-sale.js:224-255` (`cleanLine`).
- Test: `tools/sale-line-v2-test.mjs` (extend; already wired in `tools/check.js:754`).

**Interfaces:**
- Produces: till line objects carry `supplierId: string` when the product has one. `cleanLine(l)` keeps `o.supplierId` (read from `l.supplierId ?? l.sp`, max 80) and omits it when empty.

- [ ] **Step 1: Write the failing source assertions** in `tools/sale-line-v2-test.mjs`, next to `'boutique basket keeps stable identity and variants'`:

```js
ok('till product map carries the supplier', /supplierId: p\.supplierId \|\| ''/.test(read('assets/boutique-catalog.js')));
ok('boutique lines stamp the supplier at sale time', (read('assets/pos-boutique.js').match(/supplierId: \(P\[(ln|line)\.pid\] && P\[(ln|line)\.pid\]\.supplierId\) \|\| ''/g) || []).length === 2);
ok('maison lines stamp the supplier at sale time', (read('assets/pos-maison.js').match(/supplierId: \(P\[(ln|line)\.pid\] && P\[(ln|line)\.pid\]\.supplierId\) \|\| ''/g) || []).length === 2);
ok('shared journal keeps the supplier', /if \(supplier\) o\.supplierId = supplier/.test(read('assets/pos-sale.js')));
```

- [ ] **Step 2: Run it and check that it fails.** Run `node tools/sale-line-v2-test.mjs`. Expected: the four new `✗` lines, exit 1.

- [ ] **Step 3: Implement.** In each of the four builders add `supplierId: (P[x.pid] && P[x.pid].supplierId) || ''` beside `kind: 'product'`, where `x` is that builder's variable (`line` or `ln`). In `cleanLine`, read `var supplier = String(l.supplierId ?? l.sp ?? '').trim().slice(0, 80);` and add `if (supplier) o.supplierId = supplier;`. Leave `bqFoldBasket`'s folded line without a supplier.

- [ ] **Step 4: Run the tests and check that they pass.** Run `node tools/sale-line-v2-test.mjs && node tools/file-size-ratchet-test.mjs`. Expected: `✓ sale-line v2 (…)`. The ratchet stays red only on the known `assets/pos-maison/inventory.js` overrun and names none of the four edited files.

- [ ] **Step 5: Bump the stamps and commit.**

```bash
node tools/bump-stamp.js assets/boutique-catalog.js assets/pos-boutique.js assets/pos-maison.js assets/pos-sale.js
git add assets/boutique-catalog.js assets/pos-boutique.js assets/pos-maison.js assets/pos-sale.js tools/sale-line-v2-test.mjs dashboard.html kiwi-caisse.html kiwi-sw.js assets/pos-dispatch.js tools/asset-stamps.json
git commit -m "caisse · chaque ligne de vente boutique et maison porte le fournisseur de l'article au moment de la vente"
```

(Stage only the stamp files that `bump-stamp` actually changed. `git status` shows them.)

### Task 2: The wire keeps `sp`: offline queue and `/api/sale`

**Files:**
- Modify: `assets/live-link/queue-store.js:670-680` (compactor: add `sp`).
- Modify: `functions/api/sale.js:480-490` (whitelist: add `sp`).
- Modify: `functions/api/_sale-truth.js:37`. The destructuring becomes `const { fc, o, pm, bn, sp, ...rest } = row;` so an oversized basket sheds it first.
- Test: `tools/sale-line-v2-test.mjs`.

**Interfaces:**
- Consumes: `supplierId` on till lines (Task 1).
- Produces: stored D1 line key `sp: string` (≤ 80), present only when non-empty.

- [ ] **Step 1: Write the failing tests.** Add `supplierId: 'sup_atlas'` to the `rich` fixture's line, then add:

```js
ok('supplier at sale time survives', rich[0].sp === 'sup_atlas');
ok('legacy line carries no supplier key', !('sp' in legacy[0]));
const blank = await store({ id: 'sale-v2-sp0', merchant: 'pressing-amira', amount: 10, method: 'cash', label: 'X', ref: 'P-9', ts: Date.now(),
  lines: [{ itemId: 'x', name: 'X', quantity: 1, total: 10, supplierId: '   ' }] });
ok('blank supplier is omitted, not stored empty', !('sp' in blank[0]));
ok('offline queue keeps the supplier', /if \(sp\) o\.sp = sp/.test(live));
```

Add an import-level unit test of `fitBasket` in the same file. Build 40 rows of `{ n: 'x'.repeat(60), q: 1, t: 1, i: 'i'.repeat(80), v: 'v'.repeat(80), c: 'c'.repeat(40), sp: 's'.repeat(80) }`, then assert `basketCents(fit.rows) === 4000` and `fit.rows.every((r) => !('sp' in r))` when `fit.folded`.

- [ ] **Step 2: Run it and check that it fails.** Run `node tools/sale-line-v2-test.mjs`. Expected: the new controls fail.

- [ ] **Step 3: Implement.** In `queue-store.js`: `var sp = String(l.supplierId || l.sp || '').trim().slice(0, 80); if (sp) o.sp = sp;`. In `sale.js`, inside `clean`: `const supplier = String((l && (l.sp ?? l.supplierId)) || '').trim().slice(0, 80); if (supplier) o.sp = supplier;`, with a two-line French comment saying it is dated like `c` and read by `/api/suppliers/ranking`. Then the `_sale-truth.js` destructuring above.

- [ ] **Step 4: Run the tests and check that they pass.** Run `node tools/sale-line-v2-test.mjs && node tools/pwa-shell-test.js && node tools/stamp-drift-test.js`. Expected: all green.

- [ ] **Step 5: Bump the stamp and commit.** Run `node tools/bump-stamp.js assets/live-link/queue-store.js`, stage the touched files by path, then commit `vente · la ligne enregistrée garde le fournisseur (sp), la file hors ligne aussi ; un panier trop gros le lâche avant de replier`.

### Task 3: Downstream copies do not lose or misuse `sp`

**Files:**
- Read-only audit, no edit expected: `functions/api/sale/refund.js:236`, `functions/api/store-credits.js:280`, `functions/api/receivables.js:403`, `functions/api/feed.js` (line expansion), `assets/venues.js` (dashboard sales cache).
- Test: `tools/sale-line-v2-test.mjs`.

**Interfaces:**
- Consumes: the `sp` key (Task 2).
- Produces: nothing new. The task pins that refunds and credit sales copy line JSON verbatim or rebuild it without `sp`, and that no reader treats an unknown key as an error.

- [ ] **Step 1: Write the failing assertion only if the audit finds a whitelist that rebuilds lines and is read by the ranking.** Lines the ranking never reads (refunds, credit settlements) need nothing. Write down what you found in the commit message of Task 4. If nothing needs a change, this task ends with no commit.

### Task 4: The ranking reads `sp` for deleted products

**Files:**
- Modify: `functions/api/suppliers/ranking.js`. The "retired" pre-scan added in 9cc1f2a42 (the block after `fromReceipt` / `lastLine`) and the per-supplier margin loop (`costKnown`).
- Test: `tools/supplier-ranking-test.mjs` (wired at `tools/check.js:2476`).

**Interfaces:**
- Consumes: stored line key `sp` (Task 2).
- Produces: unchanged response shape `{ suppliers, untagged, retired, period }`. Product rows may now be `retired: true` because of `sp` as well as receipts.

- [ ] **Step 1: Write the failing tests** inside the existing deleted-products block of `tools/supplier-ranking-test.mjs`:

```js
const spSales = [{ ts: now - 6 * DAY, ref: 'S1', lines: [{ ...line('prod_gone', 3, 900, 'Chemise short M'), sp: 'sup_atlas' }] }];
const s2 = rankSuppliers({ products, variants, suppliers, receipts, sales: sales.concat(spSales), returns, days: 30, now });
const atlas = s2.suppliers.find((x) => x.id === 'sup_atlas');
const gone = atlas.products.find((x) => x.id === 'prod_gone');
assert.ok(gone && gone.retired, 'a deleted product keeps the supplier written on its sale line');
assert.equal(gone.name, 'Chemise short M', 'its name comes from the latest sale line');
assert.equal(atlas.revenue, 1000 + 900);
assert.equal(atlas.margin, 1000 - 2 * 280, 'a deleted product without a cost does not hide the margin of the others');
assert.equal(s2.retired.revenue, 0, 'nothing left unassigned');
// Retagging stays a filing act: a product still in the catalogue counts for its current supplier, whatever its old lines say.
const moved = rankSuppliers({ products, variants, suppliers, receipts, returns, days: 30, now,
  sales: [{ ts: now - DAY, ref: 'M1', lines: [{ ...line('prod_1', 1, 500, 'Trench beige M'), sp: 'sup_nord' }] }] });
assert.equal(moved.suppliers.find((x) => x.id === 'sup_atlas').revenue, 500);
```

- [ ] **Step 2: Run it and check that it fails.** Run `node tools/supplier-ranking-test.mjs`. Expected: AssertionError on "keeps the supplier written on its sale line".

- [ ] **Step 3: Implement.** In the retired pre-scan, when a line's product is not in `prodById` and has no `lastLine` receipt but has `l.sp`, keep the latest such line per id. Create `{ id, name: l.n, cost: 0, retired: true, supplierId: l.sp }` in `prodById`. The existing `supplierOf` loop then picks it up through `p.supplierId`. A deleted product with neither a receipt nor `sp` still goes to `retired`. In the margin loop, a `retired` row with no cost does not set `costKnown = false`. Its revenue counts in `revenue` but not in the margin base, so `margin = knownRevenue - cost` and `marginRate = margin / knownRevenue` over costed rows. Live products keep today's rule (one uncosted seller means unknown margin).

- [ ] **Step 4: Run the tests and check that they pass.** Run `node tools/supplier-ranking-test.mjs`. Expected: `supplier-ranking: ok`.

- [ ] **Step 5: Commit** `fournisseurs · un article supprimé garde le fournisseur écrit sur sa ligne de vente ; sa marge inconnue ne masque plus celle des autres`.

### Task 5: Gate, land, verify

- [ ] **Step 1:** In the worktree, run `ln -s /Users/zaka/Developer/kiwi/app/node_modules app/node_modules`, then `npm run check:full` in the background. Expected: no red outside the known pre-existing set (pos-maison inventory size, exch-combined icons and i18n, agent-voice and seller-commissions i18n, the coverage annotation).
- [ ] **Step 2:** Rebase on the latest main, re-run `node tools/bump-stamp.js --all` only if a stamp conflict needed upstream's files, then push `"${H}:refs/heads/main"` to both mirror URLs.
- [ ] **Step 3:** After Cloudflare deploys, open the demo till on the GitHub Pages mirror, sell one tagged demo article, and read `performance.getEntriesByType('resource')` to confirm the new stamps loaded. Then call `/api/sale` through the demo flow and check the queued line has `sp`. Real merchants are not used for this check.
