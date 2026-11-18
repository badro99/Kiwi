# Remise à la marocaine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Boutique discounts accept an agreed price or an amount in MAD, per item and per ticket, next to today's percentages.

**Architecture:** A pure module `assets/pos-boutique/bargain.js` holds all arithmetic (floor, agreed unit, ticket spread). The line keeps a new optional `agreed` per-piece price that `lineUnit` honours before `remise`. The sheet (sales.js) and the ticket picker (ticket-remise.js) get a three-way switch that calls the module and the existing approval gate.

**Tech Stack:** Vanilla ES modules, node test files under `tools/`, puppeteer through `tools/browser-trace.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-18-bargain-remise-design.md`

## Global Constraints
- Money in MAD with centimes; compare in integer centimes.
- Floor = `price × (100 − max allowed %) / 100`, rounded UP to the centime; max % = highest of `KiwiDiscountPolicy.percentages(_bqKey)` (default `[5,10,15,20]`).
- Ticket spread: whole MAD per piece, remainder on one piece of the most expensive line; sum equals the target exactly.
- Manager code once per ticket (`state.ticket.remiseAuth`); removing a discount never asks.
- Every new visible string goes through `tr()` with EN + AR in `assets/caisse-lang.js`. No em dashes. Material icons only.
- New tests live in `tools/` and are named in `tools/check.js`. Stamps move with `node tools/bump-stamp.js`, never by hand.
- `assets/pos-boutique.js` is size-pinned (+50 lines): touch only `lineUnit`, the frozen line and the sale record.

## Review Focus
1. An agreed price above the shelf/promo price: must be refused (it is not a discount), never raise the price.
2. Adding the same variant twice, once with an agreed price and once without: must stay two lines (merge key includes `agreed`).
3. Ticket "Prix convenu" then the cashier changes a quantity: per-piece prices stay; the total moves with the pieces (no silent re-spread).
4. Return of a piece sold at an agreed price: refunds `agreed`, not the shelf price.
5. Comma input ("299,50") and empty / zero / negative input in the MAD field.

---

### Task 1: Pure bargain arithmetic

**Files:** Create `assets/pos-boutique/bargain.js`, `tools/boutique-bargain-test.mjs`; Modify `tools/check.js` (name the test).

**Interfaces — Produces:**
- `maxPct(percentages: number[]) -> number`
- `floorUnit(base: number, maxPct: number) -> number` (MAD, ceil to centime)
- `parseMad(text: string) -> number|null` (accepts `299,50`, `1 234`, refuses ≤ 0)
- `agreedUnit(base: number, mode: 'price'|'amount', value: number) -> {unit:number, cut:number}|{error:'above'|'floor'|'invalid', floor?:number}` (takes `maxPct` as 4th arg)
- `spreadTicket(lines: {key, base, qty}[], target: number, maxPct: number) -> {assign: {key, qty, agreed}[]}|{error, floor}` (one line may appear twice when split)
- `unitFor(base: number, line: {remise, agreed}, pctUnit: (base, remise) => number) -> number`

- [ ] Step 1: write tests: `floorUnit(350, 20) === 280`; `agreedUnit(350,'price',300,20).cut === 50`; `agreedUnit(350,'amount',50,20).unit === 300`; `agreedUnit(350,'price',270,20)` → `{error:'floor', floor:280}`; `agreedUnit(350,'price',400,20)` → `'above'`; `parseMad('299,50') === 299.5`, `parseMad('0') === null`; `spreadTicket([{key:'a',base:350,qty:1},{key:'b',base:250,qty:2}], 750, 20)` sums to 750.00 in centimes, whole MAD per piece except one remainder piece; a split appears when the remainder piece's line has qty > 1; target below the summed floor → `'floor'`; `unitFor` returns `agreed` when set and `pctUnit(base, remise)` otherwise.
- [ ] Step 2: `node tools/boutique-bargain-test.mjs` → FAIL (module missing).
- [ ] Step 3: implement `bargain.js` (pure, no DOM, centime integers internally).
- [ ] Step 4: run → PASS. Step 5: commit `caisse boutique · prix convenu : arithmétique pure (plancher, prix ou montant, répartition du ticket)`.

### Task 2: Line model honours `agreed`

**Files:** Modify `assets/pos-boutique.js` (`lineUnit` ~L1248, frozen line ~L1858, sale lines ~L1934, `remiseAuth` ~L1926, `discountPercents` ~L2006), `assets/pos-boutique/ticket-owner.js`; Test `tools/boutique-ticket-owner-test.mjs` (extend), `tools/boutique-bargain-test.mjs`.

**Interfaces — Consumes:** `unitFor`. **Produces:** `ticketOwner.agreeLine(ticket, index, agreed|null)`, `ticketOwner.agreeTicket(ticket, assign)` (rebuilds lines from `spreadTicket` output, keeps promo stamps), `discountAllLines` also clears `agreed`; `addLine` merge key includes `agreed`; sale line and frozen line carry `agreed` (null when absent); `remiseAuth` keeps `{by, role, at, pct, mode, value, amount}`.

- [ ] Step 1: tests: addLine with `agreed:300` and without stay two lines; `discountAllLines(t, 10)` clears `agreed`; `agreeTicket` with a split yields qty 1 + qty n-1 lines with the right prices; ticketTotals-style sum (`agreed*qty`) equals the target.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run both suites → PASS.
- [ ] Step 5: commit `caisse boutique · la ligne garde son prix convenu (vente, reçu, retour)`.

### Task 3: Sheet and ticket switch, approval, strings

**Files:** Modify `assets/pos-boutique/sales.js` (sheet remise block, `refreshPrice`, `lineRow`, `openApprove` label), `assets/pos-boutique/ticket-remise.js`, `assets/caisse-lang.js` (EN + AR), boutique CSS where `.bq-chips` lives; Create `tools/boutique-bargain-browser-test.mjs` (browser-trace).

**Interfaces — Consumes:** Tasks 1–2. `openApprove(label: string, onOk, auth: {pct?, mode, value})`; existing callers pass `−${pct} %` and `{pct, mode:'pct', value:pct}`.

UI: a segmented row `% | Prix convenu | −MAD` registered with the liquid lens (`data-lens-demo` / `data-lens-item`); `%` shows today's chips; the other two show one numeric input (`inputmode="decimal"`) with a live line `350 → 300 · −50 MAD`, or `Prix minimum 280 MAD` in the error tone when below the floor; the Add button is disabled while invalid. Ticket picker: same switch; Apply spreads via `agreeTicket`. Ticket line: struck original when `agreed` is set, tag `Prix convenu`.

- [ ] Step 1: browser test (demo boutique, French): open an item at a known price, choose Prix convenu, type a price 10 % below, approve, ticket shows that price and the struck original; type below the floor → Add disabled, floor text visible; ticket picker Prix convenu on a 2-item ticket → ticket total equals the typed figure; −MAD 50 on one item → unit = price − 50.
- [ ] Step 2: run → FAIL. Step 3: implement. Step 4: run → PASS, plus `node tools/check.js --changed --browsers`.
- [ ] Step 5: `node tools/bump-stamp.js` on every changed asset; commit `caisse boutique · remise à la marocaine : % , prix convenu ou −MAD, à l'article et au ticket`.

### Final
Full gate (money change) before landing; push main to both mirrors by URL.
