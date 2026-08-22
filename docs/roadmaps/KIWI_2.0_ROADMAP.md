# Kiwi 2.0 — Payment-Processing Feature Roadmap

This document tracks features that have been **removed or hidden from Kiwi 1.0** because they only make sense once Kiwi holds a Bank Al-Maghrib payment-processing license. Each entry notes:

- What the feature is
- When/why it was removed from 1.0
- Where the code still lives (so it can be re-enabled cleanly for 2.0)
- Any data sources / dependencies that need to come online with the license

When the payment-processing license lands and we move to **Kiwi 2.0**, walk through this list in order and re-enable each block.

---

## 1. Règlements (Settlements)

**Status in 1.0:** **Removed from sidebar.** Code preserved.

**What it does:** End-of-day T+1 settlements ledger, 30-day cash-flow forecast, IBAN management (BMCE / Attijariwafa), interchange + Kiwi fee breakdown, "Régler maintenant" instant-settle CTA, économie vs CMI calculator.

**Why removed for 1.0:** Without our own payment processing, we don't settle anything — the merchant's existing acquirer (CMI / Maroc Telecommerce / etc.) handles money movement. Talking about T+1 settlements that we don't actually perform would be dishonest in front of an investor.

**Where the code lives:**
- `assets/pages-pro.js` → `handlers['nav-reglements']` (line ~572 — full drawer with cash-flow forecast SVG, IBAN cards, settlement detail table)
- `assets/pages.js`    → `handlers['nav-reglements']` (line ~468 — older variant, overridden by pages-pro.js)
- `dashboard.html`     → sidebar `<a data-nav="reglements">` block — **REMOVED in 1.0**
- `assets/interactive.js` → command-palette entry for "Règlements" — **REMOVED in 1.0**

**To re-enable for 2.0:**
1. Re-insert the `<a data-nav="reglements">` block in `dashboard.html` between `data-nav="terminaux"` and `data-nav="conformite"`.
2. Restore the command-palette entry in `interactive.js`.
3. Wire the cash-flow forecast to real Kiwi settlement data (currently hardcoded synthetic series).
4. Wire IBAN management to the merchant onboarding KYC.

---

## 2. Commandes drawer — Réconciliation tab

**Status in 1.0:** **Tab still visible but content is dormant.** *(Left in place because removing a tab mid-drawer would visually scar the layout — consider removing for Kiwi 2.0 launch polish.)*

**What it does:** Per-day settlement breakdown showing volume brut, interchange (1.18 %), Kiwi network fees (0.30 %), TVA on fees, net amount paid to merchant's bank account.

**Why dormant for 1.0:** All the percentages and the "net versé BMCE ••3291" amount imply we're the processor.

**Where the code lives:** `assets/pages-pro.js` → inside `handlers['nav-transactions']`, the `data-tx-pane="rec"` block.

**To re-enable for 2.0:** Just wire the percentages to real settlement data per merchant.

---

## 3. Commandes drawer — Anti-fraude tab

**Status in 1.0:** **Tab still visible but content is dormant.**

**What it does:** Surfaces "Kiwi Sentinel" risk-model alerts (recurring refunds, anomalous QR spikes), with Examiner / Marquer légitime / Bloquer la carte actions.

**Why dormant for 1.0:** Card-blocking is only meaningful if we hold the relationship with the card issuer through processing.

**Where the code lives:** `assets/pages-pro.js` → inside `handlers['nav-transactions']`, the `data-tx-pane="fra"` block.

**To re-enable for 2.0:** Wire alerts to a real Kiwi Sentinel risk-scoring service.

---

## 4. Health-score widget — "Taux succès commandes"

**Status in 1.0:** **Still visible in the dashboard health-score widget.** *(Originally "Taux succès transactions" — renamed in commit 883a7c2 to match the Commandes vocabulary, but the underlying metric is still card-transaction success rate.)*

**Where:** `dashboard.html` around the `.health-check` block.

**To consider for Kiwi 2.0 launch:** Either replace with a Phase-1-honest metric (e.g. "Commandes complétées" / order completion rate from the POS) or remove until we actually have the processing-side data.

---

## 5. Sidebar — "Banque commerçant" section (entire block)

**Status in 1.0:** **Entire section removed from sidebar.** Handler code preserved in `assets/features.js`.

**What it contained:**
- **Kiwi Compte · IBAN** — Kiwi-issued merchant bank account, IBAN management, balance/movements view.
- **Avance trésorerie (Capital)** — Cash advance / merchant financing product. Needed a balance-sheet position and KYC tooling.
- **Fidélité clients** — Loyalty program. Not strictly payment-processing, but lives in this section as part of the broader merchant-banking surface. Pulled with the section for now; can be relocated to a different sidebar group in 2.0 if we keep it as a POS feature.
- **Liens de paiement** — Generate a payment link to send to a customer. Requires acquirer relationship.
- **Factures & TVA** — Invoicing + VAT export. Most of the value here actually works without processing (PDF generation, VAT period summaries), but pulled with the section in this pass — review for 2.0 whether to reinstate as a pure POS feature earlier.
- **Analytiques** — Cross-venue analytics, cohort/funnel analysis. Not payment-processing, but currently a placeholder; review for 2.0 whether to wire to real POS-only data.

**Why removed for 1.0:** "Banque commerçant" as a sidebar section communicates "we are your bank" to an investor / merchant — which is not the truth until we hold the license. The few items inside that don't strictly need processing (Fidélité, Factures & TVA, Analytiques) are placeholders today, so removing them costs nothing and avoids selling vapor.

**Where the code lives:**
- `dashboard.html` → sidebar `<div class="sect">Banque commerçant</div>` + 6 `<a>` blocks — **REMOVED in 1.0**
- `assets/features.js` → handlers for `kiwi-compte`, `capital`, `loyalty`, `payment-link` — preserved
- `assets/i18n.js` → `'sidebar.section.bank'` key — preserved (used by other surfaces eventually)

**To re-enable for 2.0:**
1. Re-insert the section block in `dashboard.html` between `<div data-vertical-section></div>` and `</nav>`.
2. Wire `kiwi-compte` to real Kiwi merchant-banking onboarding.
3. Wire `capital` to the underwriting flow.
4. Wire `payment-link` to the acquirer link-generation API.
5. Decide whether `loyalty`, `factures-tva`, and `analytiques` should live in this section or in their own group.

---

## 6. Other payment-processing-adjacent surfaces (left in place for now)

These weren't asked to be removed, but flagging for the Kiwi 2.0 walkthrough since they share the same "implies we process payments" problem:

- **Hero card "Net après Kiwi" line** — implies we deduct fees from gross
- **"Économie vs CMI" mentions** throughout the dashboard
- **Mix de paiement widget** (Visa/MC/Wallet/Cash breakdown — informational but coupled to processing)
- **Marketing site stat** `stats.2.l` in `assets/i18n.js`: "Card transaction success rate" — currently orphaned (no DOM consumer found in dashboard, but may surface elsewhere)

Review each one against the "what can the POS-only product honestly claim?" rule before the investor demo. The principle: if it only works because we hold an acquirer relationship, it doesn't belong in 1.0.

---

## 7. Dashboard right column · "Prochain règlement" hero + "Calendrier des règlements"

**Status in 1.0:** **Both widgets removed from the dashboard.** Replaced with operations-focused widgets (Service du soir + Stock à recommander).

**What they were:**
- **Prochain règlement** (dark-atlas gradient card): showed next T+1 settlement amount, IBAN destination, Kiwi commission deducted, and an "Régler instantanément · 1,50 MAD" CTA for express payout.
- **Calendrier des règlements** (7-day mini-calendar): forward forecast of daily settlement amounts with weekly projection total.

**Why removed for 1.0:** Pure payment-processing surface. Saying "23 091 MAD arrive demain à 9 h 00 sur votre IBAN BMCE ••3291" implies Kiwi handles money movement — which we don't until the license lands.

**What replaced them (Kiwi 1.0):**
- **Service du soir** — uses the same `.settle` premium dark-atlas card style, but content is restaurant operations: count of covers expected tonight, next 3 reservations with table assignments + notes (habitué / anniversaire / 1ʳᵉ visite chips), CTA "Voir le plan de salle".
- **Stock à recommander** — utility card listing the 3 items running low with severity dots (red = rupture imminente, orange = bas), supplier names, suggested reorder quantity + price, total commande suggérée, and a one-click "Commander chez tous les fournisseurs" CTA wired to the existing `stock-reorder` handler.

**To re-enable for 2.0:** Both widgets' original HTML is preserved verbatim in git history (commit before this one). Find them by `grep "PROCHAIN RÈGLEMENT"` against pre-2.0 dashboard.html. The replacement widgets stay in 2.0 alongside the settlement views — they're useful in both phases.

**Where the legacy code still lives:**
- `dashboard.html` → the widgets are gone, but the `.settle` and `.timeline-day` CSS classes are kept (used by the new Service du soir card and could be repurposed).
- `assets/i18n.js` → `dash.settle.*` and `dash.timeline.*` keys still defined.
- `assets/interactive.js` → `instant-settle` quick-action in the global "+" menu (line 321) still references settlement — review for 2.0 cleanup pass.

---

## Removal log

| Date       | Commit  | Feature                                                          | Reason                            |
| ---------- | ------- | ---------------------------------------------------------------- | --------------------------------- |
| 2026-05-11 | 20d285a | Règlements (sidebar item + command palette)                      | Phase 1 has no processing license |
| 2026-05-11 | aa7387f | Banque commerçant section (Kiwi Compte · IBAN, Avance trésorerie, Fidélité, Liens de paiement, Factures & TVA, Analytiques) | Phase 1 is POS-only — no banking/lending surface |
| 2026-05-11 | (this)  | Dashboard "Prochain règlement" + "Calendrier des règlements" — replaced with Service du soir + Stock à recommander | Pure payment-processing surface; replacement is operations-focused |
