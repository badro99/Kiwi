# Kiwi 10x — Feature & Capability Roadmap

**Drafted 2026-07-03 · dashboard-motion track.**

This is a forward roadmap of *new* features and capabilities that would make Kiwi
**10x more valuable** — read against the codebase as it actually stands today
(17 POS verticals, the dashboard, the scenario-engine agent, Kiwi Dépenses, the
growth suite). It is a companion to — not a replacement for — the three existing
roadmaps, and deliberately avoids re-proposing what they already own:

- **`KIWI_2.0_ROADMAP.md`** — payment-license-gated re-enables (Règlements,
  reconciliation, Sentinel, merchant banking, Capital, payment links).
- **`KIWI_AI_ROADMAP.md`** — Phase-2 AI (Moroccan tax-rules engine, data-moat
  benchmarks, the tool-calling agent).
- **`PITCH_PRIORITIES.md`** — the near-term investor cut (KiwiBus sync, finish
  i18n/RTL, unified entry).

Where an item here *deepens* one of those, it says so. Everything carries a
**dependency tag** — `demo-now` (buildable honestly in the vanilla artifact
today), `needs-backend` (the server the raise funds), or `license-gated`
(Bank Al-Maghrib / DGI / AMMC) — and every item respects the house honesty rule:
never claim a capability Kiwi does not hold.

> **Update (July 2026):** the backend has since landed — Cloudflare Pages
> Functions + D1 (accounts/auth, till pairing, live sales sync, clients, menus,
> orders; see `AI_HANDOFF.md`). Read the tags accordingly: `needs-backend` no
> longer means "blocked on a future server" — the spine exists and those items
> are now buildable engineering work; only `license-gated` remains a hard
> external gate. Kiwi itself is a live product, not a demo artifact.

> **How this was built.** A 6-slice code recon → 7 independent
> ideation lenses (52 raw ideas) → consolidation to
> 39 candidates → an adversarial scoring pass (skeptical
> investor + skeptical café owner) that **kept 21 and cut the rest**
> → synthesis of the **top 20** into the horizons below. Scores are
> a weighted blend of merchant value (0.30), moat (0.25), differentiation (0.20),
> Morocco-fit (0.15) and feasibility (0.10), each rated 0–5. Full ranking and the
> cut list are in the appendix.

---

## The 10x thesis

Kiwi's step-change is not another POS feature — it is becoming the **system of record for the half of Moroccan commerce that has never been recorded**. Today a café owner's real economics live in three places no software touches: the *cahier* of cash-in and cash-out, the *ardoise* of who owes what, and the WhatsApp thread where ordering, reminders and supplier haggling actually happen. Kiwi already sees the POS ticket; the 10x move is to swallow the other three — cash-out capture (Kiwi Nb), the supplier side of the credit economy (Souk Ouvert), and the phone number as universal customer identity (Wa9tek) — so that for the first time one ledger reconciles. The moment Kiwi holds the *complete* money picture, everything downstream stops being a mockup and becomes trustworthy: the treasury countdown (Sentinelle Trésorerie) knows what you actually owe, the benchmark knows your real margin, and a sales-based cash advance (Kiwi Capital) can underwrite you off first-party data no bank in Morocco possesses.

That completeness is the flywheel we call **the closed ledger**: more surfaces captured → a truer financial picture → smarter AI advice and a real cash-position number → the merchant opens Kiwi daily and routes more of the shop through it → which captures even more of the ledger. On top of it sits the **compliance rail** — a legal facture engine (Kiwi Reçu Pro) maturing into a versioned Moroccan tax engine and, when the DGI e-facturation mandate lands, a compliant e-invoice issuer (Kiwi e-Facture) every merchant needs overnight. That is the deepest switching-cost moat available in this market: once Kiwi is the thing that keeps you legal with the DGI and CNSS, and the thing your *expert-comptable* logs into to close your books (Espace Comptable), you cannot leave. Two moats compound — a data moat from the closed ledger, a regulatory moat from the compliance rail — and both are structurally hostile to foreign POS players who will never localize CNSS bordereaux, the ardoise, or Darija.

Honesty is the constraint that makes this credible. The closed ledger and the AI operator (Bghit, the do-it-for-me action layer) are buildable **now**, in the vanilla client, as an honest demo. The identity spine, benchmark cohort, treasury timeline and tax filing need a **backend** — the server the raise funds. Cash advance and the DGI rail are **license-gated** behind Bank Al-Maghrib and the mandate itself. We never blur those lines: the roadmap is sequenced precisely so that each honest demo today de-risks the backend investment tomorrow and earns the right to the licensed rails last.

## How to read this roadmap

Every item carries a **dependency tag** that maps to one of three horizons, and the sequencing is deliberate. **H1 — demo-now** are features we can ship honestly in the vanilla artifact today (Mode Ramadan, Bghit, Souk Ouvert, Kiwi Nb, Kiwi Reçu Pro, Sbah l-Khir): they prove the closed-ledger thesis in the pitch, deepen daily indispensability, and cost only build time. **H2 — needs-backend** are the compounding moats that require the server the raise pays for (Wa9tek identity, Benchmark Pro, Sentinelle Trésorerie, Espace Comptable, the agentic tax filer): each one is de-risked by an H1 feature that already demonstrated the surface. **H3 — license-gated** are the endgame rails that need a regulator's signature (Kiwi Capital behind Bank Al-Maghrib, Kiwi e-Facture behind the DGI mandate) — the highest-value, hardest-to-copy layer, sequenced last because it must stand on a backend and a data moat that already exist. Read top-to-bottom as a compounding sequence, not a menu: H1 earns the raise, H2 builds the moat, H3 monetizes it.

---

## At a glance — the 20 that made the cut

**Horizon 1 · demo-able now (vanilla)**

| Feature | Category | Dependency | Score |
|---------|----------|-----------|------:|
| Mode Ramadan — le pilote saisonnier qui rebase tout | Morocco | demo-now | 3.9 |
| Bghit — the do-it-for-me action layer | AI | demo-now | 3.75 |
| Souk Ouvert — le carnet fournisseur & crédit grossiste | Morocco | demo-now | 3.55 |
| Kiwi Reçu Pro — la facture légale DGI comme service | Revenue | demo-now | 3.4 |
| Kiwi Sentinelle — les alertes qui te font gagner | Indispensability | demo-now | 3.25 |
| Kiwi Nb — capture dépense-caisse en 3 secondes | Indispensability | demo-now | 3.15 |
| Kiwi Naoubi — l'employé de nuit ⤳ *merged into one morning-briefing surface* | AI | demo-now | 3.05 |
| Sbah l-Khir — le briefing du matin ⤳ *merged into one morning-briefing surface* | Indispensability | demo-now | 3 |
| KiwiBus + Boîte d'envoi — spine live cross-surface & outbox offline durable | Platform | demo-now | 3 |
| Tabi3a — la carte de fidélité qui vit sur le scan | Consumer | demo-now | 2.55 |

**Horizon 2 · needs backend**

| Feature | Category | Dependency | Score |
|---------|----------|-----------|------:|
| Wa9tek — le numéro WhatsApp comme identité client universelle | Consumer | needs-backend | 3.75 |
| Espace Comptable — le portail expert-comptable | Platform | needs-backend | 3.75 |
| Sentinelle Trésorerie — le compte à rebours 'pourrai-je payer' | AI | needs-backend | 3.7 |
| Kiwi Benchmark Pro — 'les cafés comme moi' | Moat | needs-backend | 3.6 |
| Chef comptable IA — l'agent qui dépose, pas seulement calcule | AI | needs-backend | 3.6 |
| Kiwi WhatsApp — toute la boutique comme un numéro WhatsApp | Platform | needs-backend | 3.5 |
| Kiwi Sentinel — anti-fraude & sentinelle de caisse | Revenue | needs-backend | 3.45 |
| Sawt Kiwi — le co-pilote qui parle et écoute en darija | AI | needs-backend | 3.05 |

**Horizon 3 · license-gated**

| Feature | Category | Dependency | Score |
|---------|----------|-----------|------:|
| Kiwi e-Facture — le rail DGI obligatoire | Platform | license-gated | 3.95 |
| Kiwi Capital — avance de trésorerie sur ventes réelles | Revenue | license-gated | 3.7 |

> Two H1 morning items (**Kiwi Naoubi** and **Sbah l-Khir**) are merged into one
> surface in the detail below — shipping both would be two half-built morning
> screens. **Pont Matériel** (WebHID/WebSerial hardware bridge, score 2.15) was
> kept but fell just outside the top 20; it's a strong H1 candidate to pull
> forward if hardware interop becomes a sales blocker.

---

## Horizon 1 — Demo-able now (vanilla, no backend)

Everything here ships inside the current vanilla HTML/CSS/JS artifact — no framework, no build step, no server — and stays strictly inside the honesty envelope: mocked client-side state, `localStorage` persistence, and a visible "aperçu / roadmap — aucune transaction réelle" gate anywhere money or a licence is implied. These items don't wait for the raise; they 10x the *pitch* and the *daily* value today by turning compute Kiwi already runs into surfaces a merchant acts on, and by localizing the operating model in ways Loyverse, Square, Lightspeed and CMI structurally will not. They are ordered best-first by adversarial score. Two of them (Kiwi Naoubi and Sbah l-Khir) heavily overlap and should merge into a single morning-push surface — flagged inline.

---

#### Mode Ramadan — le pilote saisonnier qui rebase tout
- **10x thesis:** One calendar-aware toggle simultaneously re-bases forecast, break-even working-days, staffing peaks, stock pars *and* the AI's advice, making Kiwi the only POS that is *correct* for the 40+ days a year every foreign POS is visibly wrong.
- **What it is:** A seasonal operating mode selector (Ramadan / Aïd / jour de marché / rentrée / paydays) that swaps the flat linear model for a calendar-specific curve: the daily forecast flips to a dead daytime + iftar spike, break-even recomputes against reduced working-days, staffing recommendations invert to evening peaks, stock pars jump on the affected SKUs, and the agent's advice text switches register. Outside Ramadan/Aïd it degrades into everyday seasonality (market days, rentrée, paydays) so it earns its place the other 325 days.
- **Why now / why Kiwi:** Ramadan is the single most violent demand shock a Moroccan café faces and no foreign POS localizes it. The pieces already half-exist (scattered Ramadan strings across POS files, forecast/break-even math in `agent.js` + `finance.js`, `dateRange.js` as a re-render bus), so a convincing demo is realistic — and it's the clearest "Kiwi understands *my* calendar" moment in the whole deck.
- **Dependency:** demo-now. Honesty note: on a mocked profile the rebased curves must be labelled as *modelled projections from your history*, not guarantees; the Hijri/jours-fériés calendar is public data, so the pitch must not overclaim uniqueness of the *calendar* — only of the *rebase across five surfaces at once*.
- **Ties into existing code:** `dateRange.js`/`dateRange2.js` (re-render bus + per-range data), `agent.js` (forecast, break-even, staffing scenarios), `finance.js` (break-even/working-days), `insights.js` (offpeak lever), `stock.js` (pars/reorder), plus existing Ramadan strings in the `pos-*` verticals.
- **Acceptance criteria:**
  1. Given the dashboard, When I select "Mode Ramadan", Then the daily forecast curve visibly changes shape (daytime trough + evening iftar peak) versus the default within one render, with no page reload.
  2. Given Mode Ramadan active, When I open break-even, Then the working-days count and break-even day recompute and differ numerically from default mode.
  3. Given Mode Ramadan active, When I open staffing, Then the recommended peak window shifts to evening and is stated explicitly.
  4. Given Mode Ramadan active, When I open stock pars, Then at least the iftar-relevant SKUs show raised par levels flagged as season-adjusted.
  5. Given Mode Ramadan active, When I ask the agent for advice, Then its answer references the seasonal context (e.g. iftar peak) rather than the flat model.
  6. Given I switch back to "Mode normal", Then every one of the above reverts to baseline values, proving the rebase is a reversible parameterization.
  7. The mode selection persists across reload via `localStorage` and uses the liquid-lens selection motion (never a bespoke selector).
  8. All mode labels and rebased advice render correctly in FR/EN/AR with RTL, and in dark mode.
  9. Every rebased number carries a "projection modélisée" honesty label; no number is presented as a committed forecast.
- **Demo moment:** Flip one toggle and watch the forecast curve, the break-even day, the staffing peak and the stock pars all rebase to Ramadan live — then flip it back.
- **Success metric:** % of merchants who toggle a non-default mode at least once during Ramadan/Aïd, and 30-day retention of that cohort vs. non-toggling cohort.

---

#### Bghit — the do-it-for-me action layer
- **10x thesis:** It converts the existing Darija/FR/EN intent spine from *navigating you to a screen* into *completing the task with a preview + Undo*, collapsing 17 PIN-gated screens into one text box — the copilot→operator leap.
- **What it is:** A Darija-first action grammar over the agent: "reprice my best-seller +2 MAD" writes the new menu price, "lance le happy-hour 15h-17h" creates the offer, and each action renders a preview card ("was 32 → now 34 MAD, applies to 1 item") with an explicit Confirm and a one-tap Undo before anything is committed to demo state. V1 ships a *narrow, safe verb set* (reprice, launch-offer) only; PO/reassort/WhatsApp verbs are explicitly deferred.
- **Why now / why Kiwi:** The deterministic intent spine already scores and routes intents (`agent.js`, the scored dispatcher at line 1083+), and writable demo state already exists (`KiwiMenu`/menu-edit in `dashboard-extra.js`, `KiwiSales`). Loyverse/Square have no Darija intent layer and no incentive to build one — this is the AI feature that makes Kiwi feel like staff, not software.
- **Dependency:** demo-now for reprice + launch-offer (pure writes to mocked client-side state). Honesty note: the write-action trust cliff is real — the user calls bad agent answers "bullshitting," so every action MUST preview-before-commit with Undo, and any verb that would touch inventory logic, a PO, or WhatsApp is out of scope until the backend exists and must not be demoed as if it works.
- **Ties into existing code:** `agent.js` (intent parse/score/route), `dashboard-extra.js` (`menu-edit`, KiwiMenu writable state), `KiwiSales`, `interactive.js` (`Kiwi.modal`/toast for the preview + Undo).
- **Acceptance criteria:**
  1. Given the agent box, When I type "reprice [best-seller] +2 MAD" (or Darija equivalent), Then a preview card shows old price, new price, and the exact item(s) affected — and nothing is written yet.
  2. Given that preview, When I press Confirm, Then the menu state updates and the change is visible on the menu screen; When I press Undo, Then it reverts exactly.
  3. Given "lance le happy-hour 15h-17h", When confirmed, Then an offer object with that window is created and visible; Undo removes it.
  4. Given an ambiguous or unsupported request (e.g. "commande le réassort"), Then the agent explicitly declines and says this action isn't available yet — it does NOT fake a write.
  5. Every action requires explicit confirmation; no write occurs on parse alone.
  6. The verb set is documented and bounded; out-of-scope verbs return the honest-decline path in criterion 4.
  7. Preview cards, confirm/undo, and decline messages all render in FR/EN/AR with RTL and in dark mode.
  8. A misparse never silently commits: if confidence is below threshold the agent asks to confirm the interpretation before showing a write preview.
- **Demo moment:** Type one Darija sentence, watch a preview appear, hit Confirm, see the price change on the menu — then hit Undo and watch it snap back.
- **Success metric:** Number of confirmed write-actions per merchant per week, and the Undo rate (a low Undo rate proves parses are trusted).

---

#### Souk Ouvert — le carnet fournisseur & crédit grossiste
- **10x thesis:** It closes the only half of the cash economy Kiwi can't yet see — what the merchant *owes* grossistes on informal T+15/T+30 credit — turning the runway forecast from fiction into something trustworthy.
- **What it is:** The supply-side inverse of the ardoise: a real accounts-payable ledger per supplier with a running balance, due-date aging, and partial payments, reconciled against `stock.js` reorders. Today's `depenses.js` ships only a 2-row "Factures fournisseurs à payer" list where "pay" just deletes the row; this replaces it with a true balance-carrying ledger. Settlement stays a manual "marquer comme payé" — never an actual money movement.
- **Why now / why Kiwi:** "What do I owe, and when is it due" is a daily anxiety no notebook answers well, and this credit economy is invisible to Loyverse/Square/CMI. `stock.js` already has a full Fournisseurs tab with orders and payment terms, so the reconciliation hook exists — the build is a deepening that consolidates the toy `depenses.js` list and the stock supplier data into one ledger, not a third place suppliers live.
- **Dependency:** demo-now for *tracking*. Honesty note: `depenses.js` already gates supplier payment behind the Bank Al-Maghrib établissement-de-paiement banner (`phaseMsg`); the "pay / confirmation link / auto-reconciled" copy (`tPaidD`) is license-gated and must remain a manual mark-as-paid with the phase banner visible — no settlement claim.
- **Ties into existing code:** `depenses.js` (supplier-bills list + `phaseMsg`/`tPaidD` gating), `stock.js` (Fournisseurs tab, orders, payment terms), `accounting.js` (posting the payable into the Livre).
- **Acceptance criteria:**
  1. Given a supplier, When I record a bill, Then it increments that supplier's running balance and appears in a due-date-aged list (current / overdue buckets).
  2. Given an outstanding balance, When I record a partial payment, Then the balance decreases by exactly that amount and the payment is timestamped in history.
  3. Given a `stock.js` reorder for a supplier, When I open Souk Ouvert, Then that reorder can be linked to a payable and reconciled (matched/unmatched state visible).
  4. Given any "pay" affordance, Then it is labelled "marquer comme payé" (manual) with the Bank Al-Maghrib phase banner shown — no language implies real settlement.
  5. Given the ledger, Then a total "à payer cette semaine / ce mois" figure is computed and feeds the runway/cash view.
  6. All balances, aging labels, and the phase banner render in FR/EN/AR with RTL and dark mode; Arabic amounts and dates are correctly formatted.
  7. Ledger state persists across reload via `localStorage`.
  8. The old 2-row `depenses.js` list is replaced/consolidated, not left as a duplicate surface.
- **Demo moment:** Show a grossiste at 4 200 MAD owed with two overdue bills, record a 1 500 MAD partial payment, and watch the balance and the week's "à payer" total both update — with the honest "marquer comme payé, pas de règlement réel" note visible.
- **Success metric:** % of active merchants with at least one supplier balance tracked after 30 days, and the share of `stock.js` reorders that get reconciled to a payable.

---

#### Kiwi Reçu Pro — la facture légale DGI comme service
- **10x thesis:** It turns compliance anxiety into a paid daily-use hook — a legally correct facture carrying ICE/IF/RC with a right multi-rate TVA breakdown — and is the honest on-ramp to the whole Phase-2 tax-rules engine.
- **What it is:** A per-vertical legal receipt/facture engine: printable + PDF tickets with ICE/IF/RC and a correct multi-rate TVA breakdown (e.g. 10% vs 20% lines split correctly), a searchable archive, PDF-by-WhatsApp (share/download, not a payment rail), and a DGI-ready export bundle. It reuses Kiwi's existing per-vertical POS and ICE/TVA plumbing rather than inventing a new surface.
- **Why now / why Kiwi:** Merchants get burned by non-conforming tickets (missing ICE, wrong TVA split), so a correct facture is a real daily hook and requires no licence to print. It advances the roadmap: it's the concrete first step of the planned versioned tax-rules engine (computation traces, DGI export), so H1 effort compounds instead of sitting beside the moat.
- **Dependency:** demo-now. Honesty note: the "légale / DGI-ready" framing is a credibility landmine — the format must be hedged as "conforme au format DGP standard, à valider avec votre expert-comptable" per vertical until an expert-comptable has actually signed off; do not claim certified conformity the team can't back.
- **Ties into existing code:** the `pos-*` verticals (receipt rendering), `accounting.js` (TVA buckets incl. `deductible`/collected split), `finance.js` (rate application); export tie-in anticipates the Phase-2 tax engine.
- **Acceptance criteria:**
  1. Given a sale with mixed TVA rates, When I generate the facture, Then each rate is shown on its own line with correct HT / TVA / TTC subtotals that sum to the ticket total.
  2. Given the business profile, Then the facture prints ICE, IF and RC fields populated from the merchant's identity (`account.js`), with a clear placeholder if unset — never a blank or fabricated value.
  3. Given a generated facture, Then it is retrievable from a searchable archive by date/number/amount.
  4. Given an archived facture, When I choose "PDF par WhatsApp", Then it produces a shareable PDF/download — with no implication of a payment or settlement action.
  5. Given a date range, When I export the DGI bundle, Then a structured file is produced and labelled "format standard — à valider avec votre expert-comptable".
  6. Every facture, TVA label, and export UI renders in FR/EN/AR with RTL and dark mode; Arabic numerals/dates format correctly.
  7. No screen uses the word "certifié"/"certified" or claims DGI approval; the hedge copy is present wherever "légale/DGI" appears.
  8. TVA math is unit-tested against at least the 10% and 20% rate cases with a rounding rule stated.
- **Demo moment:** Ring a mixed-rate sale, print a facture with the TVA correctly split by rate and ICE/IF/RC on it, then pull the same facture back from the archive by number.
- **Success metric:** Factures generated per merchant per week, and % of merchants who run at least one DGI export per month.

---

#### Kiwi Sentinelle — les alertes qui te font gagner
- **10x thesis:** It flips Kiwi's existing margin/break-even/off-peak compute from a passive card you must go look at into a proactive stream with a MAD figure and a one-tap action on each alert — the cheapest way to convert existing compute into daily indispensability and ROI-in-MAD proof.
- **What it is:** A money-relevant alert feed — "marge tajine sous 55%", "seuil de rentabilité atteint jour 21", "sur-staffé mardi 15h-17h" — each carrying a MAD impact and a one-tap action that routes into the relevant screen (or into a Bghit action). Alerts are grounded in the venue's real menu/hourly data via `insights.js`, not invented.
- **Why now / why Kiwi:** The deterministic star/offpeak/price levers already exist in `insights.js` and the scenario math in `agent.js`; they just sit behind a card. A café owner reacts to "marge tajine sous 55%" in a way they never react to a dashboard tile — this is the "opens Kiwi every day" lever at near-zero build cost.
- **Dependency:** demo-now, but scoped honestly. Honesty note: alerts that need a live cost feed or delivery-commission data Kiwi doesn't have client-side (e.g. "agneau +14%", "tu as gardé 4 200 MAD de commission Glovo") must be omitted from the demo or clearly marked as illustrative — the shipped stream is limited to the four `insights.js`-grounded levers so nothing is bluffed. A wrong "sur-staffé mardi" burns trust permanently, so each alert states the data it's computed from.
- **Ties into existing code:** `insights.js` (star/offpeak/price levers), `agent.js` (break-even/margin scenarios), `interactive.js` (`data-action` routing for the one-tap button), `dateRange.js` (range context).
- **Acceptance criteria:**
  1. Given the venue's menu/hourly data, When the dashboard loads, Then the alert stream shows only alerts computable from real client-side data (margin, break-even, off-peak, price lever) — no hardcoded cost-feed alerts.
  2. Each alert displays a concrete MAD impact figure derived from the underlying numbers, and states which data it was computed from.
  3. Each alert has exactly one primary action that routes to the relevant screen or opens a Bghit preview.
  4. Given no meaningful signal for a lever, Then no filler alert is shown (no noise).
  5. Given an alert, When I dismiss it, Then it does not reappear for the same underlying condition within the session (persisted).
  6. Any illustrative/roadmap alert (delivery, live cost) is visually distinct and labelled "exemple — nécessite intégration" — never shown as live truth.
  7. Alerts, MAD figures, and action buttons render in FR/EN/AR with RTL and dark mode.
  8. Recomputing after a data/range change updates the alerts consistently (no stale alert survives a range switch).
- **Demo moment:** Open the dashboard and see "marge tajine sous 55% — tu perds ~X MAD/mois" with a one-tap "corriger le prix" that opens the Bghit reprice preview.
- **Success metric:** One-tap action-through rate per alert, and % of alerts dismissed-as-useful vs. ignored.

---

#### Kiwi Nb — capture dépense-caisse en 3 secondes
- **10x thesis:** It supplies the missing *input* that wires the already-shipping two-sided Dépenses ledger to the Grand Livre, so a 3-second cash-out capture becomes a real accounting entry — killing the cahier on speed *and* correctness.
- **What it is:** A one-tap out-of-drawer cash-expense capture (taxi, glace, petit fournisseur): amount, category, optional receipt photo, landing instantly in Dépenses and in the accounting Livre. Every capture asks whether a valid facture exists; only then is it eligible for the TVA-deductible bucket.
- **Why now / why Kiwi:** In a real café the drawer bleeds cash all day and none of it reaches the books — which is exactly why the cahier survives and the TVA-deductible base is understated. Both the two-sided Dépenses ledger and the Grand Livre with its `deductible` bucket already ship (`depenses.js`, `accounting.js`), so this is the missing button, not a new surface.
- **Dependency:** demo-now (photo input + `localStorage` write). Honesty note: most informal petit-fournisseur cash has no valid facture, so auto-dropping it into "TVA-deductible" would produce a non-compliant declaration — captures MUST default to *dépense non-déductible sans facture* and only move to deductible when the merchant confirms a facture exists. This is the difference between a useful tool and the overpromise the team hates.
- **Ties into existing code:** `depenses.js` (two-sided in/out ledger), `accounting.js` (Grand Livre + `deductible` TVA bucket), `interactive.js` (capture modal/toast), `account.js` (category list).
- **Acceptance criteria:**
  1. Given the capture affordance, When I enter amount + category and confirm, Then within ~3 seconds a matching expense row appears in Dépenses and a corresponding entry appears in the Grand Livre.
  2. Given a capture, Then it defaults to "non déductible (pas de facture)"; When I confirm a facture exists, Then and only then is it flagged TVA-deductible.
  3. Given the optional photo, When I attach a receipt image, Then it is stored (client-side) and viewable from the expense row.
  4. Given a completed capture, Then the amount is correctly signed as a cash-out in the two-sided ledger and reflected in the running cash position.
  5. The deductible/non-deductible flag is visible on the row and drives which TVA bucket the Livre entry lands in.
  6. Captures persist across reload via `localStorage`.
  7. Capture form, category labels, and the deductibility prompt render in FR/EN/AR with RTL and dark mode.
  8. No capture is auto-classified as TVA-deductible without explicit facture confirmation (honesty gate testable by default state).
- **Demo moment:** Tap once, enter "35 MAD, taxi", snap the receipt, and show it land in both Dépenses and the Grand Livre — flagged non-deductible until a facture is confirmed.
- **Success metric:** Cash-out captures per merchant per day, and the ratio of captured cash-out to total cash-out (proxy for cahier displacement).

---

#### Kiwi Naoubi + Sbah l-Khir — le briefing du matin (MERGE)
- **10x thesis:** It inverts the agent from pull to push — the merchant wakes to a one-screen Darija "voici ce que j'ai préparé, voici les 3 gestes que tu me dois", making Kiwi the first thing opened before the till is unlocked.
- **What it is:** *These two candidates should merge* — Naoubi (the "overnight run") and Sbah l-Khir (the morning card) are the same surface seen from two ends, and shipping both would be two half-built morning screens. The merged item is one full-screen Darija morning briefing: yesterday-vs-your-weekday-average, last clôture cash, today's forecast, the one anomaly that matters, a drafted staffing suggestion and a pre-filled reorder list — each with a single act-on-it button. Because there's no scheduler/backend, it presents as "voici ce que j'ai préparé pour aujourd'hui" computed *on open*, never as a job that actually ran overnight.
- **Why now / why Kiwi:** The ingredients already ship (`agent.js` forecast/anomaly/scenario math, `dateRange.js` per-range data, clôture cash), so this is orchestration + a Darija surface, not new intelligence. The Darija "employé de nuit" framing lands with a merchant who thinks in staff, not dashboards — a texture Loyverse/Square never build.
- **Dependency:** demo-now as an *on-open* briefing. Honesty note: this is the sharpest trap in the list — "books the Z into the ledger" and a genuinely *scheduled* after-close/before-open job are needs-backend (no scheduler, no persistent server). The H1 build must say "préparé à l'ouverture", must not claim an autonomous overnight write happened, and any "je l'ai fait pendant la nuit" copy is deferred until the backend exists.
- **Ties into existing code:** `agent.js` (forecast, anomaly, cost/margin scenarios), `dateRange.js`/`dateRange2.js` (per-range data), `insights.js` (the anomaly/off-peak pick), clôture cash from the POS layer, `interactive.js` (act-on-it routing / Bghit previews).
- **Acceptance criteria:**
  1. Given the first open of the day, When the briefing renders, Then it shows yesterday's revenue vs the merchant's same-weekday average with the delta stated in MAD and %.
  2. The briefing shows last clôture cash, today's forecast, and exactly one highlighted anomaly (not a list) drawn from `insights.js`/`agent.js`.
  3. The briefing offers at most three one-tap actions, each routing to the relevant screen or a Bghit preview.
  4. All framing is "préparé à l'ouverture"/"here's what I prepared" — no copy claims a scheduled overnight job ran, and no ledger write is presented as already-committed.
  5. Given a staffing suggestion or reorder pre-fill, Then it is presented as a draft the merchant confirms — nothing is auto-applied.
  6. The briefing is dismissible and does not block the dashboard; it reappears once per day.
  7. Full Darija-first copy renders correctly in FR/EN/AR with RTL and dark mode, full-screen and mobile-safe.
  8. Every figure is traceable to the underlying computed data (tap-to-see-why), so no number is unexplained.
- **Demo moment:** Open Kiwi in the morning to a full-screen Darija card: "Hier +12% vs tes mardis · caisse clôturée 3 480 MAD · 1 alerte · 3 gestes" — tap one and it acts.
- **Success metric:** % of daily-active merchants who open the briefing before their first sale, and act-through rate on the three morning actions.

---

#### KiwiBus + Boîte d'envoi — spine live cross-surface & outbox offline durable
- **10x thesis:** It's the genuinely-unbuilt event substrate every other platform feature needs — one `KiwiSale` module all verticals write through, broadcast over BroadcastChannel + localStorage so serveur→caisse→KDS→dashboard update live, plus a durable replay-on-reconnect outbox that makes the cosmetic "coupure réseau" banner real.
- **What it is:** A tiny event spine: every ticket/ardoise/stock-move is written through one `KiwiSale` writer that broadcasts over `BroadcastChannel` + `localStorage`, so open surfaces update live on the same device; plus a durable outbox with conflict-free IDs and replay-on-reconnect so the currently-cosmetic offline banner reflects real queued state. Verified against the repo: no BroadcastChannel/bus exists in `assets/` today, and the "coupure réseau" banner is pure copy in `index.html`/`business-plan-v2.html`.
- **Why now / why Kiwi:** Morocco's flaky café/souk connectivity makes a durable offline outbox a real requirement, and a serveur running a table while the caisse rings and the KDS fires genuinely needs live sync. This is the substrate the roadmap's cross-surface story (and several other H1 items) quietly assume — building it now de-risks everything downstream.
- **Dependency:** demo-now for *same-device* live sync + outbox. Honesty note: `BroadcastChannel` is same-origin/same-device only, so this does NOT deliver true multi-device sync without the backend — the pitch must say "sync live sur cet appareil / entre les onglets", and the outbox demo must not imply cross-device replay until the server lands. It's also plumbing with near-zero direct willingness-to-pay: sell the *features* it enables, not the bus.
- **Ties into existing code:** new `KiwiSale` writer consumed by the `pos-*` verticals, `pos-epicerie.js` (ardoise), `stock.js` (stock-moves), the dashboard (`dateRange.js` subscribers), and the currently-cosmetic banner in `index.html`.
- **Acceptance criteria:**
  1. Given serveur and caisse surfaces open on the same device, When the serveur adds a ticket item, Then the caisse reflects it live without reload.
  2. Given a ticket fired, When the KDS surface is open, Then the order appears on the KDS live via the same event.
  3. Given the dashboard is open, When a sale is written, Then the relevant dashboard figure updates via a `dateRange.js` subscriber without reload.
  4. Given simulated "offline", When I create sales, Then they queue in the outbox with conflict-free IDs and the banner shows a real pending count (not static copy).
  5. Given "reconnect", When the outbox replays, Then queued events apply exactly once — no duplicate tickets or double-counted stock.
  6. Every ticket/ardoise/stock-move across the covered verticals flows through the single `KiwiSale` writer (no surface writes state directly around it).
  7. The pitch/UI states the same-device/same-origin limitation honestly; no copy claims cross-device sync.
  8. Live updates and the offline banner render correctly in FR/EN/AR with RTL and dark mode.
- **Demo moment:** Two tabs side by side — add an item on the serveur, watch it hit the caisse and the dashboard live; pull the network, ring three sales, restore, watch the outbox drain exactly once.
- **Success metric:** Zero duplicate/lost events across an offline→online replay test suite, and the number of downstream H1 features that consume the bus.

---

#### Tabi3a — la carte de fidélité qui vit sur le scan
- **10x thesis:** It makes Kiwi's dead loyalty mockup real — each ticket/scan drops a stamp, the customer watches the card fill, the reward auto-applies at the caisse — and seeds per-scan behavioral data for the future benchmark moat.
- **What it is:** A merchant-controlled digital stamp card: each POS ticket or QR scan drops a stamp, a customer view (kiwi.ma/carte) shows the card filling, and the reward applies at the caisse when complete. Today's version is a dead mockup (`features.js:1239` — hardcoded stamp dots, a radio-button model picker, a success toast, zero per-customer state); this gives it real per-customer state and persistence.
- **Why now / why Kiwi:** Loyalty is the most universally understood retention lever, and making it real raises daily indispensability — the merchant watches regulars fill up and the reward fires at the till. It's the natural hook for the benchmark cohort data the roadmap wants (frequency-cohort labels already exist in `interactive.js`).
- **Dependency:** demo-now as a *single-device* illusion. Honesty note: "phone/QR identity" and cross-device reward auto-apply imply a persistent customer-identity backend and cross-device sync that don't exist — the vanilla artifact can only fake per-scan identity via `localStorage` on one browser, so the demo scope is a convincing single-device stamp card, and the "passeport de quartier" cross-merchant network is explicitly needs-backend and must not be pitched as live. Ships lowest in H1 for exactly this reason.
- **Ties into existing code:** `features.js` (loyalty mockup at ~line 1239), `interactive.js` (frequency-cohort labels), the `pos-*` caisse surfaces (stamp-on-ticket + reward-apply), and — when it lands — KiwiBus for the scan event.
- **Acceptance criteria:**
  1. Given a customer identity (single-device, localStorage), When a ticket is rung or a QR scanned, Then a stamp is added and persists across reload.
  2. Given a card reaching its stamp threshold, When that customer next checks out, Then the reward is offered/applied at the caisse and the card resets.
  3. Given the customer view, Then the current stamp count renders and reflects the merchant-side state on the same device.
  4. Given the merchant config, Then the stamp threshold/reward is editable and the change reflects in new cards.
  5. Per-customer stamp state is real (not the hardcoded dots) and distinct per customer.
  6. Any cross-device or cross-merchant "network/passeport" affordance is either absent or clearly labelled "à venir — nécessite backend"; nothing implies a live consumer network.
  7. Card, customer view, and reward messaging render in FR/EN/AR with RTL and dark mode.
  8. The old hardcoded mockup path in `features.js` is replaced, not left alongside.
- **Demo moment:** Ring three tickets for the same customer, watch the stamp card fill, then on the reward ticket watch the discount auto-apply at the caisse.
- **Success metric:** Active stamp cards per merchant and reward-redemption rate — with cross-device/network adoption explicitly deferred to a backend milestone.

---

## Horizon 2 — Needs the backend (the raise funds this)

These eight bets all require the server and data layer that has since landed (Cloudflare Pages Functions + D1 — see the July 2026 update note up top); what remains is building each feature onto that spine. They belong here because: each one 10x's the *product* and, more importantly, the *moat*. Horizon 1 makes Kiwi worth opening every day on the merchant's own hardware; Horizon 2 makes Kiwi impossible to leave. The through-line is that the vanilla artifact already *fakes* most of these — a hardcoded "rang 12/147" benchmark card, WhatsApp "share" toasts with no thread behind them, accounting toasts claiming a "DGI/SIMPL file" that has no Blob, a "Darija" tag that no engine understands. Horizon 2 is where those fabrications become real, backed data flows. That reframing matters for the raise: we are not inventing eight new surfaces, we are pouring a backend under UI the merchant has already been shown and believed. Ordered best-first by adversarial score, with an honest note on the two identity/WhatsApp bets that should partially merge.

#### Wa9tek — le numéro WhatsApp comme identité client universelle
- **10x thesis:** Collapsing four independent, un-linked phone captures into one deduplicated customer record turns four toy demos into a single compounding customer graph — the first consumer-side data moat Kiwi owns.
- **What it is:** One identity spine keyed on the phone number (the de-facto Moroccan consumer ID) captured at POS/QR with one-tap opt-in, silently linking receipts, loyalty points, gift-card balance, ardoise/tab and win-back to a single record and a single WhatsApp thread. The customer texts `solde` and gets back points + tab + last receipt. Merchants stop seeing a walk-in four different times across four modules and start seeing one returning human.
- **Why now / why Kiwi:** Verified in the repo, the fabrication is real: loyalty (`features.js`), gift cards (`growth-giftcards.js` — `phonePh: 'Téléphone (WhatsApp)'`, `redeem: 'Vérifier un solde'`), CRM (`growth-crm.js` WhatsApp campaigns) and QR ordering each touch the phone number with **no shared customer record**. In Morocco the phone number genuinely *is* the consumer ID and WhatsApp is the universal channel, so an identity spine that de-dupes across all four is the correct architectural backbone — and no single-shop register or notebook can replicate a cross-visit customer graph.
- **Dependency:** needs-backend. Honest framing: value only lands once all four growth modules are re-plumbed onto the spine AND a WhatsApp Business API (WABA, template approval, opt-in) exists. Until then it must be shown as a *mock thread*, never as a live two-way bot. The auto-`solde` reply also carries CNDP consent exposure — opt-in must be explicit and revocable, and we must not claim two-way WhatsApp we can't ship.
- **Ties into existing code:** `features.js` (loyalty), `growth-giftcards.js`, `growth-crm.js`, `growth-qr.js`, `growth-ordering.js` — all re-pointed at one new customer-record service.
- **Acceptance criteria:**
  1. Given a phone number already captured in loyalty, When the same number is entered in gift cards or QR ordering, Then the system resolves to the *same* customer record (no duplicate created) and shows a merged history.
  2. A customer record surfaces, in one view, all four linked assets: loyalty points, gift balance, ardoise/tab, last receipt.
  3. Opt-in is an explicit, single tap with visible consent copy; a customer can revoke it and the record is flagged non-contactable (CNDP-safe).
  4. Texting `solde` (mock thread acceptable pre-WABA) returns points + tab + last-receipt in one message.
  5. No screen or toast claims live two-way WhatsApp automation unless a real WABA connection is configured; otherwise the thread is clearly labelled a preview.
  6. Full FR/EN/AR parity including RTL layout of the customer record and the `solde` thread; Arabic renders right-aligned with correct mirrored asset rows.
  7. Dark-mode: customer record and thread pass token-inversion with no hardcoded `#fff`.
  8. De-dup logic is idempotent: re-submitting the same number N times yields exactly one record.
- **Demo moment:** Enter the same number at the café till and at the gift-card desk — the second screen instantly shows "returning customer · 340 points · 60 MAD ardoise · last visit Tuesday," one human, not two strangers.
- **Success metric:** % of transactions matched to a known customer record (identity coverage) rising past 40% within 90 days of a merchant's launch.

#### Kiwi WhatsApp — toute la boutique comme un numéro WhatsApp
- **10x thesis:** Wrapping the channel Moroccan commerce already runs on in structured automation asks for zero behavior change — the single hardest thing to win in this market — making Kiwi's number a daily-open surface for both merchant and customer.
- **What it is:** A real WhatsApp Business API integration replacing today's share-toasts: customers order/reorder, check their ardoise, and (Phase-2-gated) receive a payment link and e-facture in-thread, while the merchant approves spend, gets a morning briefing, and confirms supplier orders — all in the app they never close. Note: this bet and *Wa9tek* share a spine and should **merge at the data layer** — Wa9tek is the identity/record; Kiwi WhatsApp is the transactional channel on top of it. Build them as one program, ship the identity spine first.
- **Why now / why Kiwi:** WhatsApp is genuinely the operating layer of Moroccan commerce — customers already order, reorder and settle the ardoise in-thread. The defensible part is not the channel (Meta's rails, licensable by any BSP) but the tie-back to Kiwi's POS/ardoise data and deterministic automation. That is exactly what a reseller can't replicate without the POS underneath.
- **Dependency:** needs-backend + license-gated for the money parts. Honest framing: payment-link-in-thread and e-facture are Kiwi Pay capabilities requiring a Bank Al-Maghrib payment-institution licence — these must be visibly gated ("available with Kiwi Pay") and NOT shown as live. Ordering, reorder, ardoise-check and briefings are needs-backend but honestly demoable once the BSP tunnel exists.
- **Ties into existing code:** the share-toast paths in `growth-ordering.js`, `growth-qr.js`, `growth-giftcards.js`; the Kiwi Dépenses approve/refuse flow; morning-briefing data from `dateRange.js`/`dateRange2.js`.
- **Acceptance criteria:**
  1. A customer message in a mock/real thread creates a real order object visible on the merchant dashboard (not just a toast).
  2. "Reorder" replays the customer's last linked order (uses the Wa9tek record).
  3. An ardoise-balance request returns the live tab tied to that phone number.
  4. Any payment-link or e-facture affordance is disabled with an explicit "requires Kiwi Pay (licence pending)" label — no live money movement anywhere.
  5. Merchant morning-briefing is generated from real period data, not a static string.
  6. Per-conversation cost/template state is surfaced honestly (no hidden metered charges to the merchant).
  7. FR/EN/AR + RTL across every thread template and the merchant-side briefing.
  8. Dark-mode parity on all thread and briefing UI.
- **Demo moment:** A customer texts "3awed nafs commande" (same order again); the order lands on the caisse dashboard live — and the payment-link button sits right there, greyed out and honestly labelled "with Kiwi Pay."
- **Success metric:** Share of a merchant's orders originating in the WhatsApp thread within 60 days.

#### Espace Comptable — le portail expert-comptable
- **10x thesis:** Winning the accountant wins their entire book of 40–150 SMEs in one sale, and switching cost becomes the accountant's workflow rather than the merchant's login — a two-sided network effect global players ignore.
- **What it is:** A multi-tenant, read-mostly portal where an accountant logs in across ALL their Kiwi clients, sees each shop's live ledger/TVA/CNSS/paie, pushes corrections back, and pulls FEC/SIMPL/Damancom per client from one screen. Kiwi stops being the thing an accountant exports *from* and becomes the system they work *from*.
- **Why now / why Kiwi:** In Morocco the expert-comptable is the true gatekeeper of the SME — the accountant, not CMI or Square, decides which POS a shop tolerates. The merchant-side data primitives already ship in `accounting.js` (FEC/SIMPL/Damancom/CNSS/DGI); this is the same data re-cut for a second persona. Honestly, merchant *daily* value is indirect (cleaner books, cheaper fidayi), so this bet is a distribution/moat play, not a daily-habit play — sequence it AFTER Kiwi has hundreds of merchants, or the portal is empty and wins nobody.
- **Dependency:** needs-backend + effectively regulated. Honest framing: an accountant pushing corrections and pulling official DGI/CNSS filings across dozens of legal entities implies real access-control, an audit trail, and liability surface — cannot be faked in the vanilla artifact. Corrections must be attributable and reversible.
- **Ties into existing code:** `accounting.js` (the merchant-side FEC/SIMPL/Damancom/CNSS/DGI generators), `team.js` (paie), re-projected multi-tenant.
- **Acceptance criteria:**
  1. One accountant login lists ≥2 distinct client shops, each strictly data-partitioned (no cross-tenant leakage — verifiable by attempting to access another tenant's ID and being denied).
  2. Selecting a client shows its live ledger, TVA position, CNSS and paie without leaving the portal.
  3. A correction pushed by the accountant is written back to the client ledger, attributed to that accountant, timestamped, and reversible (audit trail entry created).
  4. FEC / SIMPL / Damancom export is generated **per client** as a real downloadable artifact (real file, not a toast).
  5. Empty state is honest: a client with no data shows "no entries yet," never fabricated figures.
  6. Role separation: the accountant role cannot perform merchant-only actions (e.g., issue refunds).
  7. FR/EN/AR + RTL across the portal, including the client switcher and correction dialog.
  8. Dark-mode parity.
- **Demo moment:** The accountant switches between "Café Atlas" and a second shop from one dropdown, pushes a TVA correction to shop #2, and downloads its Damancom bordereau — all without a client login.
- **Success metric:** Number of net-new merchants onboarded *through* an accountant (accountant-sourced acquisitions).

#### Sentinelle Trésorerie — le compte à rebours "pourrai-je payer"
- **10x thesis:** It answers the single most anxiety-relevant number a Moroccan café owner has — "vendredi tu ne couvres pas la paie" — which no cahier, CMI portal, or bank app gives, making Kiwi the place he checks before he panics.
- **What it is:** A rolling 30-day cash-position timeline netting POS cash-in, ardoise receivables, souk payables and dated obligations (loyer, Lydec, CNSS, salaires, TVA/IS) to flag red days — "vendredi il te manque 3 200 MAD pour la paie" — with proposed levers (chase this ardoise, delay that payable).
- **Why now / why Kiwi:** Kiwi already sits on the three inputs that matter: POS cash-in, the épicerie carnet/ardoise, and Kiwi Dépenses payables/bills. Cash-runway anxiety is a top-tier pain that justifies moving a merchant up a tier or attaching a paid AI SKU, and the forecast quality compounds with Kiwi's own transaction history — a competitor without POS+ardoise+payables data can't match the accuracy.
- **Dependency:** needs-backend. Honest framing: a forecast is only as good as its worst inputs — informal cash sales that never hit the POS and payables living in the merchant's head. A false "tu ne couvres pas" causes real panic; a false "tu couvres" causes real harm. Every red-day flag must be traceable to its inputs and carry a confidence/coverage caveat, never presented as certainty.
- **Ties into existing code:** `dateRange.js`/`dateRange2.js` (POS cash-in), the épicerie carnet/ardoise, Kiwi Dépenses payables/bills; presented through the `agent.js` insight surface.
- **Acceptance criteria:**
  1. A 30-day timeline renders each day's projected net cash position from real netted inputs (cash-in − obligations − payables + expected receivables).
  2. Days projected below zero (or below a merchant-set floor) are flagged red with the exact shortfall amount.
  3. Every red day is drill-downable to the specific obligations and receivables that produced it (computation trace, no black box).
  4. Each flag shows a coverage/confidence indicator and an explicit caveat that unlogged cash sales aren't counted.
  5. At least one actionable lever is proposed per red day (chase receivable X, defer payable Y), with its cash impact quantified.
  6. Editing an obligation's date/amount re-computes the timeline immediately.
  7. No red-day alert appears when input coverage is below a defined threshold — it degrades to "not enough data" rather than guessing.
  8. FR/EN/AR + RTL (Arabic timeline reads right-to-left correctly) and dark-mode parity.
- **Demo moment:** The timeline shows Friday glowing red — "il te manque 3 200 MAD pour la paie" — tap it and see exactly which supplier bill and which unpaid ardoise created the gap, plus "encaisse l'ardoise Rkia (1 800) et tu passes."
- **Success metric:** % of flagged red days the merchant acted on before they arrived (pre-emptive action rate), and reduction in missed-payroll/bounced-obligation events.

#### Kiwi Benchmark Pro — "les cafés comme moi"
- **10x thesis:** A real opt-in k-anonymous cohort store is a textbook data-network-effect moat — value compounds with every merchant added and a single-shop register can never replicate it.
- **What it is:** Turn the fabricated "rang 12/147 cafés" card into a real cohort store: each merchant contributes aggregated stats and unlocks live percentiles (your basket / food-cost / Tuesday-14h vs cohort) plus an anomaly briefing. A separately monetizable second stream sells aggregated, k-anonymous market intelligence to FMCG brands who lack Moroccan on-premise consumption data.
- **Why now / why Kiwi:** The card already exists as fabricated data — `dateRange2.js:1388` hardcodes `rank: 12, total: 147` and `dateRange2.js:298-300` hardcodes "147 cafés casablancais" in FR/EN/AR — so the UI is proven and merely needs to be made honest. This is the single most defensible idea on the roadmap: Loyverse/Square would need Moroccan-café density they don't have.
- **Dependency:** needs-backend. Honest framing: percentiles are worthless below ~30–50 real contributing cafés per city/ticket-band, so this is a retention/upsell layer *after* dense adoption, not a growth driver. Shipping it early with thin cohorts would reproduce the exact fabrication it's meant to fix — the honesty rule then forces an empty state. The FMCG data-sale path adds CNDP exposure and must be k-anonymous and opt-in.
- **Ties into existing code:** the benchmark card in `dateRange2.js` (replace hardcoded `rank`/`total`/`BENCH_SUB` with live cohort queries).
- **Acceptance criteria:**
  1. A merchant sees percentiles only after opting in to contribute; opt-out hides the card entirely (no free-riding on others' data).
  2. No cohort statistic is displayed unless the cohort has ≥ the k-anonymity threshold (e.g., 30) contributing shops — otherwise an honest "cohort still forming" state shows.
  3. The rank/percentile is computed from live contributed data, not any hardcoded value (grep confirms `rank: 12, total: 147` is gone).
  4. At least one anomaly briefing is *specific and actionable* ("your food-cost is 6 pts above cohort on dairy"), not a vanity percentile.
  5. Contributed data is aggregated/anonymized before leaving the merchant's tenant (no raw transaction row is exported).
  6. Any FMCG-facing export is k-anonymous and shows the consent basis.
  7. FR/EN/AR + RTL on the card, percentiles and briefing (Arabic numerals/percentiles align correctly).
  8. Dark-mode parity.
- **Demo moment:** "You're in the top 8% for average basket but bottom quartile on Tuesday afternoons — cohort of 63 Casablanca cafés, same ticket band" — a live number that visibly recomputes when a mock café joins the cohort.
- **Success metric:** Opt-in contribution rate, and premium-benchmark SKU attach rate among eligible (dense-cohort) merchants.

#### Chef comptable IA — l'agent qui dépose, pas seulement calcule
- **10x thesis:** It collapses the merchant's most-dreaded recurring chore — *filing*, not calculating — into a one-tap review step, which is exactly where the pain and the willingness-to-pay live.
- **What it is:** An agentic tax employee on a versioned Moroccan rules engine (TVA 10/20, IS acompte, IR, CNSS 6.74/21.09) that autonomously assembles the actual period declaration — the TVA/SIMPL file, the CNSS/Damancom bordereau, a DGI export — as **real downloadable artifacts**, each with a plain-language computation trace for one-tap approval. The expert-comptable becomes reviewer, not preparer.
- **Why now / why Kiwi:** This is the honest fulfillment of a promise the product ALREADY makes falsely. Verified: `accounting.js` fires toasts claiming it can "pré-remplir la déclaration au format DGI/SIMPL — il ne vous reste qu'à signer" (`tvaInsight`, lines 191/244/298) and offers "Exporter pour la DGI" (`actExportTva`) with **no Blob and no download behind them**. Assembling the real files exploits a deeply Moroccan truth (SIMPL, Damancom, 10/20 TVA, CNSS ceilings, the comptable relationship) that Loyverse/Square/CMI structurally never touch.
- **Dependency:** needs-backend + regulation-adjacent. Honest framing: SIMPL/Damancom have no clean public third-party submission API, so "the agent that files" honestly means "the agent that produces a filing-ready file the merchant/comptable uploads and signs" — the current demo copy blurs this and MUST be corrected. The rules engine must be versioned, expert-comptable-in-the-loop, and every trace auditable; Kiwi must not warrant the numbers in a way that transfers DGI penalty liability onto Kiwi.
- **Ties into existing code:** `accounting.js` (replace the fake `tvaInsight`/`actExportTva` toasts with a real generator on a versioned rules engine); `team.js` for paie/CNSS inputs.
- **Acceptance criteria:**
  1. "Prepare the VAT return" produces a **real downloadable file** in SIMPL-compatible format (real Blob/download — verifiable by the file landing on disk), not a toast.
  2. The CNSS/Damancom bordereau and a DGI export are likewise real downloadable artifacts.
  3. Every generated figure has a tap-to-expand plain-language trace (which entries, which rate, which ceiling) in the merchant's language.
  4. The rules engine is versioned: the active ruleset (e.g., "TVA rules v2026.1") is visible on the output, so a recomputation is reproducible.
  5. Copy is honest end-to-end: the flow says "prêt à déposer, à vérifier et signer par votre comptable" — it must NOT claim Kiwi files with the DGI on the merchant's behalf.
  6. A review/approval gate exists before any file is considered final (expert-comptable-in-the-loop toggle).
  7. Grep confirms the old no-op "generated"/"pré-remplir … signer" toasts no longer fire without a real artifact behind them.
  8. FR/EN/AR + RTL on the declaration, trace and artifacts; dark-mode parity.
- **Demo moment:** Tap "Préparer la déclaration TVA" and an actual SIMPL-format file downloads, with a trace reading "TVA collectée 12 480 (20%) − TVA déductible 3 120 = 9 360 à payer · ruleset v2026.1" — a real file, honestly labelled "à signer par votre comptable."
- **Success metric:** % of eligible merchants who generate and download a real filing artifact each period, and Ultra-tier attach among them.

#### Kiwi Sentinel — anti-fraude & sentinelle de caisse
- **10x thesis:** An always-on watcher trained on *your* shop's own rhythm turns shrinkage — the deepest unspoken merchant anxiety — into a plain-Darija heads-up only the owner can judge, and the longer it runs the better it knows your normal.
- **What it is:** An anomaly watcher over the shop's own transaction stream — voided tickets after payment, no-sale drawer opens, discount abuse, refund spikes per cashier, Z-variance — surfaced in plain language ("Youssef a annulé 7 commandes après 22h, 4× ta moyenne") so the owner decides. It flags patterns, it does not accuse.
- **Why now / why Kiwi:** Shrinkage is a genuine, high-anxiety, high-willingness-to-pay problem in cash-heavy Moroccan cafés, and the void-after-payment / no-sale / refund-spike vectors are exactly where theft hides. It sits on top of already-planned Kiwi 2.0 reconciliation/settlements and the benchmark store — the per-merchant baseline plus the k-anonymous cohort gives a real data-network moat that's hard to bolt on late. The Darija plain-language proactive framing is the differentiator; the anomaly math is commodity.
- **Dependency:** needs-backend. Honest framing: real per-cashier detection cannot be demoed today without faking a live watcher, which the team would reject. Framing is load-bearing — Kiwi surfaces a *pattern for the owner to judge*, never a verdict; one wrong theft accusation collapses trust in the whole feature.
- **Ties into existing code:** Kiwi 2.0 reconciliation/settlements (Règlements), the per-cashier data in `team.js`, cohort baselines from Kiwi Benchmark Pro; surfaced via the `agent.js` insight/briefing pattern.
- **Acceptance criteria:**
  1. The watcher establishes a per-shop, per-cashier baseline from historical data before flagging (no alerts on day one).
  2. Each of the core vectors is detectable: void-after-payment, no-sale drawer open, discount abuse, refund spike, Z-variance.
  3. An alert is phrased as an observation with the comparison to normal ("4× ta moyenne"), never as an accusation or a guilt verdict.
  4. Every alert drills down to the specific tickets/events behind it (auditable, not a black box).
  5. The owner can dismiss/annotate an alert (false positive), and that feedback tunes the baseline.
  6. No alert fires below a baseline-confidence threshold (avoids the trust-killing false positive).
  7. Plain-language output available in FR/EN/AR (+ Darija phrasing where the merchant's language is set to it) with RTL.
  8. Dark-mode parity on the alert cards and drill-down.
- **Demo moment:** A calm card appears: "Youssef a annulé 7 commandes après 22h hier — 4× sa moyenne. À toi de voir." Tap it and see the seven exact tickets, timestamped.
- **Success metric:** Alert precision (share of flags the owner marks as genuine) staying above a trust threshold, and measured shrinkage reduction in shops running it 90+ days.

#### Sawt Kiwi — le co-pilote qui parle et écoute en darija
- **10x thesis:** A press-to-talk Darija voice layer collapses the literacy/typing barrier that keeps informal merchants on paper — a barrier Loyverse, Square, CMI and the cahier all ignore.
- **What it is:** A press-to-talk voice layer over the agent: the merchant speaks "chhal khassni nbi3 lyoum bach nrbeh?" or "zid Coca f l'ardoise dyal Rkia" and gets a spoken answer or a booked action, hands-free at a busy counter. It pays off the "en darija" promise the code currently breaks.
- **Why now / why Kiwi:** The Moroccan truth is sharp — much of the informal merchant base is functionally illiterate in written French/standard Arabic, transacts in spoken Darija, and works two-handed. Verified: "Darija" exists in the repo only as a staff-language tag (`team.js:100`, `431`, `455-457`); the `agent.js` engine is a deterministic FR/EN/AR regex parser with zero voice and zero Darija comprehension. Honestly, value is capped by the agent behind it (a hardcoded single-café scenario engine), so voice makes a demo dazzle, not yet a daily habit — this ships *after* the real backend agent, not before.
- **Dependency:** needs-backend (+ likely needs-a-fine-tune). Honest framing: there is no drop-in production-grade Darija (code-switched, dialectal, noisy-counter) speech model — this is a multi-quarter bet, and open-vocabulary action-booking ("zid Coca f l'ardoise dyal Rkia") is far beyond the current regex engine. It must NOT be over-invested for a 15-second stage wow before the deterministic agent and transactional backend exist; a mic that mishears at a loud café erodes exactly the trust the honesty rule protects.
- **Ties into existing code:** `agent.js` (the voice layer sits in front of the scenario/tool engine), the ardoise/carnet data for action-booking, `team.js` (Darija language surfacing).
- **Acceptance criteria:**
  1. Press-to-talk captures audio and returns a transcription; on low confidence it shows the transcript for confirmation rather than acting blind.
  2. A spoken query maps to the same deterministic agent answer the typed query would, and the answer can be read back aloud.
  3. An action command ("zid Coca f l'ardoise dyal Rkia") produces a confirmable draft action (add item to a named customer's ardoise) — never a silent auto-commit.
  4. Any action is confirmed by the merchant before it writes (voice never books money movement unconfirmed).
  5. Recognition failure degrades gracefully to "je n'ai pas compris, réessaie ou tape" — never a wrong silent action.
  6. Honesty: nothing claims Darija comprehension beyond what the model actually supports; unsupported phrasings fall back cleanly.
  7. FR/EN/AR UI + RTL for the voice panel; dark-mode parity.
  8. Works one-handed/hands-free (large press target, audible confirmation) for a counter context.
- **Demo moment:** The owner holds the button, says "zid Coca f l'ardoise dyal Rkia," and a confirm card appears — "Ajouter 1 Coca à l'ardoise de Rkia · 6 MAD?" — one tap, done, without touching a keyboard.
- **Success metric:** Voice-initiated action completion rate (spoken commands that reach a confirmed write) and adoption among merchants flagged low-literacy at onboarding.

---

## Horizon 3 — License-gated / platform bets

These are the long-horizon, compounding bets — each requires a rail Kiwi does not yet own (a Bank Al-Maghrib payment-institution licence, a lending balance sheet, or DGI/regulatory certification), so none can be truthfully shipped in the vanilla demo today. What we *can* build now is the honest, gated preview: the interface, the sequence logic, the underwriting math and the archive model, every money-or-compliance claim wearing a visible "aperçu · non contractuel · en attente d'agrément" badge. The prize for winning either bet is the deepest switching-cost moat in the stack — a merchant whose legal invoice sequence or live credit line lives inside Kiwi does not migrate mid-fiscal-year. Both sit downstream of Kiwi Pay/settlement, so they are sequenced *after* the rail lands, not before.

#### Kiwi e-Facture — le rail DGI obligatoire
- **10x thesis:** When Morocco's e-facturation mandate goes live, every VAT-registered merchant needs a compliant, sequenced, ICE/IF-stamped issuer *overnight* — and the POS is where the fiscal document is born, so Kiwi becomes the legal rail nobody can rip out mid-year.
- **What it is:** A compliant e-invoicing engine that mints legally-numbered invoices with an unbroken cryptographic sequence, ICE/IF/RC stamps pulled from the merchant's Kiwi identity, and tamper-evident archiving (hash-chained, each invoice referencing the prior one's hash). It emits a structured payload (XML + PDF/A-3 human copy) ready to clear against whatever national platform DGI designates, and reconciles the issued-invoice ledger against POS sales so nothing is invoiced twice or skipped. It fuses with the planned Phase-2 tax-rules engine so TVA is computed, traced, and stamped at issuance.
- **Why now / why Kiwi:** All public signals point to a phased 2026–2027 Moroccan rollout mirroring KSA's ZATCA and Egypt; the merchant who resists the mandate legally cannot invoice, so willingness-to-pay is compliance-grade, not nice-to-have. Kiwi already sits at the exact transaction where the invoice originates and already holds the ICE/IF/RC/Patente/CNSS identity fields in "Mon profil" — no competitor pointed only at cards or only at bookkeeping is positioned at issuance the way a POS is.
- **Dependency:** license-gated. Honest framing is non-negotiable: until DGI publishes the final format spec and certifies Kiwi, every screen must show an "aperçu · en attente de certification DGI · non contractuel" badge and must not claim any invoice is legally valid. We build to the *published draft spec only*, versioned, so a spec change is a ruleset bump, not a rebuild.
- **Ties into existing code:** extends `account.js` (ICE/IF/RC/Patente identity fields as the stamp source), `accounting.js` and `finance.js` (the TVA computation + issued-invoice ledger), the planned Phase-2 tax-rules engine (versioned rulesets + computation traces), and reuses the compliance-surface pattern already established in `conformite.js` (trilingual, status-badged regulatory UI).
- **Acceptance criteria:**
  1. Given a completed POS sale, when the merchant issues an invoice, then it receives a monotonic, gap-free sequence number scoped to the établissement + fiscal year, and issuing two invoices never yields a duplicate or a skipped number (verifiable by issuing 3 in a row and reading 1-2-3).
  2. Given an issued invoice, when it is rendered, then it displays the merchant's ICE, IF, RC and Patente pulled live from "Mon profil" (edit the ICE in account settings → next invoice shows the new value).
  3. Given a chain of issued invoices, when any archived invoice's stored content is altered, then the tamper-evident check flags a broken hash-chain (each invoice stores the prior invoice's hash; mutate one and the verifier reports the break at that index).
  4. Given a range of dates, when the merchant exports, then a structured file (XML per the draft spec + PDF/A-3 human copy) is produced and re-imports/validates against the same schema without loss.
  5. Given TVA-liable lines, when the invoice is minted, then the TVA amount and rate are computed by the tax-rules engine and a computation trace is viewable (not a hardcoded number).
  6. Every e-Facture surface renders correctly in FR, EN and AR with full RTL (Arabic invoice preview mirrors layout, numerals and stamp block), verified by switching `kiwiLang`.
  7. Every surface renders correctly in dark mode via token inversion (no hardcoded `#fff`/`#000`; check the invoice preview and archive list).
  8. An "aperçu · non contractuel · en attente de certification DGI" badge is visible on every issuance and export screen and cannot be dismissed; no copy anywhere asserts an invoice is legally valid or DGI-cleared.
  9. Given the app is offline, when an invoice is issued, then sequence continuity and archiving still hold locally (localStorage), with a visible "non transmis" state until a rail exists.
- **Demo moment:** Ring up a coffee on the POS, tap "Facturer", and watch a fully-stamped, ICE/IF-numbered invoice mint in sequence — then edit one archived line and show the tamper-chain light up red.
- **Success metric:** Share of issued invoices that pass the sequence-continuity + hash-chain integrity check at fiscal-year close (target 100% unbroken), and, post-mandate, % of active merchants issuing through Kiwi within 30 days of their wave's go-live.

#### Kiwi Capital — avance de trésorerie sur ventes réelles
- **10x thesis:** Underwriting a café off its own trailing POS revenue and collecting repayment as a fixed % of each day's settlement turns Kiwi's ledger into a credit line no bank can match and no rival POS can replicate — borrow once and switching POS means losing your financing.
- **What it is:** Replaces today's hardcoded Murabaha mockup with a genuine sales-based cash advance: a ceiling, a single fixed fee (no variable rate, AAOIFI-consistent), and a daily-take repayment schedule all computed from the merchant's real trailing Kiwi revenue. Repayment is skimmed as a set percentage of each day's card settlement, so it flexes with volatile, cash-light takings. Every day of POS history sharpens the underwriting, and the advance is offered, accepted, drawn and tracked entirely inside the merchant's Kiwi surface.
- **Why now / why Kiwi:** This is the proven Square/Shopify Capital playbook, and the Moroccan café — no collateral, informal cash mix, no bankable history — is precisely the merchant a bank will not touch, so demand is real. Kiwi is the only party holding the first-party trailing-revenue signal *and* (post-Kiwi-Pay) the settlement rail to collect against; the fixed-fee Murabaha framing resonates with riba-averse owners in a way a conventional loan cannot.
- **Dependency:** license-gated (and dependency-stacked). Honest framing: this only becomes real after Kiwi Pay ships as a licensed payment institution (so settlement flows through Kiwi and can carry the daily take) *and* Kiwi holds or partners for lending capital *and* a default-loss model exists. Until then it is a preview: offers, ceilings and schedules compute from real data but every screen carries "aperçu · sous réserve d'agrément Bank Al-Maghrib · aucune offre de crédit ferme", and no button disburses real money.
- **Ties into existing code:** extends the existing Capital / avance-de-trésorerie handler in `features.js` (upgrading the hardcoded Murabaha mockup to a data-driven quote), reads trailing revenue from `finance.js` / the dateRange revenue store (`assets/dateRange.js`), and depends on the planned Kiwi Pay settlement rail for the daily-take collection mechanism.
- **Acceptance criteria:**
  1. Given a merchant with N days of Kiwi revenue history, when they open Capital, then the offered ceiling is computed from that trailing revenue (change the demo revenue profile → the ceiling changes accordingly; it is not a constant).
  2. Given an offered advance, when the terms display, then they show a single fixed fee and total repayable, with no variable/compounding interest rate anywhere (AAOIFI-consistent Murabaha framing).
  3. Given a chosen advance and a daily-take percentage, when the schedule renders, then projected repayment days are derived from projected daily settlement, and a lower daily revenue lengthens the schedule (verifiable by lowering the revenue assumption).
  4. Given the repayment mechanism, when explained in-UI, then it clearly states repayment is taken as a % of each day's settlement — and the UI states this requires Kiwi Pay settlement, which is not yet live.
  5. No control in the flow disburses funds, initiates a transfer, or claims an advance is approved/binding; the primary CTA is a preview/simulate action, not "receive money now".
  6. An "aperçu · sous réserve d'agrément Bank Al-Maghrib · non contractuel" badge is visible on every Capital screen and cannot be dismissed.
  7. All Capital surfaces render correctly in FR, EN and AR with full RTL (fee, ceiling and schedule tables mirror correctly), verified via `kiwiLang`.
  8. All Capital surfaces render correctly in dark mode via token inversion (no hardcoded light-only colors in the offer card or schedule).
  9. Given the underwriting inputs, when the quote is shown, then a plain-language "how we calculated this" trace lists the trailing-revenue basis and fee derivation (no opaque magic number).
- **Demo moment:** Show two demo cafés side by side — the busy one is offered a larger ceiling and a faster daily-take payoff, the quiet one a smaller ceiling and a longer runway — all recomputed live from their own Kiwi revenue, with a fixed fee and the honest "en attente d'agrément" badge on screen.
- **Success metric:** Post-launch, advance take-rate among offered merchants and repayment-completion rate via daily settlement (target default/write-off rate below the modeled loss threshold that keeps the fixed fee profitable).

---

Note on merging: keep them separate. They share a dependency (both sit downstream of Kiwi Pay settlement) and a moat thesis (in-Kiwi lock-in), but they are different products — one is a compliance rail triggered by a legal-calendar event, the other a lending product gated on a balance sheet — with different buyers, risks and go-live triggers. Merging would blur two distinct regulatory asks.

---

## Appendix A — full adversarial ranking (all 38 scored candidates)

Rated 0–5 on **v**alue · **m**oat · **d**ifferentiation · **mf** Morocco-fit ·
**f**easibility. Score = weighted blend (v·0.30 + m·0.25 + d·0.20 + mf·0.15 + f·0.10).

| Rank | Score | Feature | Cat | Horizon | Dependency | v | m | d | mf | f | Verdict |
|-----:|------:|---------|-----|---------|-----------|:-:|:-:|:-:|:-:|:-:|:------:|
| 1 | 3.95 | Kiwi e-Facture — le rail DGI obligatoire | Platform | H3 | license-gated | 4 | 4 | 4 | 5 | 2 | KEEP |
| 2 | 3.9 | Mode Ramadan — le pilote saisonnier qui rebase tout | Morocco | H1 | demo-now | 4 | 3 | 4 | 5 | 4 | KEEP |
| 3 | 3.75 | Bghit — the do-it-for-me action layer | AI | H1 | demo-now | 4 | 3 | 4 | 4 | 4 | KEEP |
| 4 | 3.75 | Wa9tek — le numéro WhatsApp comme identité client universelle | Consumer | H2 | needs-backend | 4 | 4 | 3 | 5 | 2 | KEEP |
| 5 | 3.75 | Espace Comptable — le portail expert-comptable | Platform | H2 | needs-backend | 3 | 5 | 4 | 4 | 2 | KEEP |
| 6 | 3.7 | Sentinelle Trésorerie — le compte à rebours 'pourrai-je payer' | AI | H2 | needs-backend | 4 | 3 | 4 | 5 | 2 | KEEP |
| 7 | 3.7 | Kiwi Capital — avance de trésorerie sur ventes réelles | Revenue | H3 | license-gated | 4 | 4 | 4 | 4 | 1 | KEEP |
| 8 | 3.6 | Kiwi Benchmark Pro — 'les cafés comme moi' | Moat | H2 | needs-backend | 3 | 5 | 4 | 3 | 2 | KEEP |
| 9 | 3.6 | Chef comptable IA — l'agent qui dépose, pas seulement calcule | AI | H2 | needs-backend | 4 | 3 | 4 | 5 | 1 | KEEP |
| 10 | 3.55 | Réseau Ardoise — le carnet de crédit en réseau | Moat | H2 | needs-backend | 3 | 4 | 4 | 5 | 1 | CUT |
| 11 | 3.55 | Souk Ouvert — le carnet fournisseur & crédit grossiste | Morocco | H1 | demo-now | 4 | 3 | 3 | 4 | 4 | KEEP |
| 12 | 3.5 | Kiwi WhatsApp — toute la boutique comme un numéro WhatsApp | Platform | H2 | needs-backend | 4 | 3 | 3 | 5 | 2 | KEEP |
| 13 | 3.45 | Kiwi Sentinel — anti-fraude & sentinelle de caisse | Revenue | H2 | needs-backend | 4 | 4 | 3 | 3 | 2 | KEEP |
| 14 | 3.4 | Kiwi Reçu Pro — la facture légale DGI comme service | Revenue | H1 | demo-now | 4 | 2 | 3 | 4 | 5 | KEEP |
| 15 | 3.25 | Kiwi Sentinelle — les alertes qui te font gagner | Indispensability | H1 | demo-now | 4 | 2 | 3 | 3 | 5 | KEEP |
| 16 | 3.2 | Kiwi Réassort — le marché de gros dans la caisse | Revenue | H2 | needs-backend | 3 | 4 | 3 | 4 | 1 | CUT |
| 17 | 3.15 | Kiwi Nb — capture dépense-caisse en 3 secondes | Indispensability | H1 | demo-now | 4 | 1 | 3 | 4 | 5 | KEEP |
| 18 | 3.05 | Kiwi Naoubi — l'employé de nuit | AI | H1 | demo-now | 4 | 2 | 3 | 3 | 3 | KEEP |
| 19 | 3.05 | Sawt Kiwi — le co-pilote qui parle et écoute en darija | AI | H2 | needs-backend | 3 | 2 | 4 | 5 | 1 | KEEP |
| 20 | 3 | Sbah l-Khir — le briefing du matin | Indispensability | H1 | demo-now | 4 | 1 | 3 | 3 | 5 | KEEP |
| 21 | 3 | Ardoise Diaspora — le voisin qui paie depuis l'étranger | Morocco | H3 | license-gated | 2 | 3 | 4 | 5 | 1 | CUT |
| 22 | 3 | KiwiBus + Boîte d'envoi — spine live cross-surface & outbox offline durable | Platform | H1 | demo-now | 3 | 2 | 3 | 4 | 4 | KEEP |
| 23 | 2.75 | Kiwi Franchise — clone-and-govern multi-location | Platform | H2 | needs-backend | 3 | 3 | 3 | 2 | 2 | CUT |
| 24 | 2.65 | Kiwi Dial — le carnet en poche du client | Consumer | H1 | demo-now | 2 | 3 | 2 | 4 | 3 | CUT |
| 25 | 2.55 | Caisse Deux Tiroirs — la vérité cash vs banque | Morocco | H1 | demo-now | 3 | 1 | 2 | 4 | 4 | CUT |
| 26 | 2.55 | Tabi3a — la carte de fidélité qui vit sur le scan | Consumer | H1 | demo-now | 3 | 2 | 2 | 3 | 3 | KEEP |
| 27 | 2.5 | Négociateur — l'agent qui chasse un meilleur prix | AI | H2 | needs-backend | 2 | 3 | 3 | 3 | 1 | CUT |
| 28 | 2.5 | Community — l'agent qui récupère les clients perdus | AI | H2 | needs-backend | 3 | 2 | 2 | 4 | 1 | CUT |
| 29 | 2.5 | Taïba — le téléphone du client, quatrième surface live | Consumer | H1 | demo-now | 3 | 2 | 2 | 2 | 4 | CUT |
| 30 | 2.3 | Blad — la couche de découverte du quartier | Consumer | H2 | needs-backend | 2 | 3 | 2 | 3 | 1 | CUT |
| 31 | 2.25 | Ftour Direct — la vente ftour & le livreur du quartier | Consumer | H1 | demo-now | 2 | 1 | 2 | 4 | 4 | CUT |
| 32 | 2.15 | Pont Matériel — WebHID/WebSerial (balances, scanners, imprimantes, TPE) | Platform | H1 | demo-now | 3 | 1 | 2 | 2 | 3 | KEEP |
| 33 | 2.1 | Nقra — le compteur de commission gardée, rendu visible au client | Consumer | H1 | demo-now | 2 | 1 | 2 | 3 | 4 | CUT |
| 34 | 2.1 | Kiwi Connect — open API + marketplace d'add-ons | Platform | H2 | needs-backend | 2 | 3 | 2 | 1 | 2 | CUT |
| 35 | 2.05 | Daret Kiwi — la tontine de quartier tenue proprement | Morocco | H2 | needs-backend | 1 | 2 | 2 | 5 | 1 | CUT |
| 36 | 1.75 | La Clôture — le rituel du soir | Indispensability | H1 | demo-now | 2 | 1 | 1 | 2 | 4 | CUT |
| 37 | 1.7 | La Série — streaks & rituel de constance | Indispensability | H1 | demo-now | 2 | 1 | 1 | 1 | 5 | CUT |
| 38 | 1.6 | Kiwi Régie — la vitrine sponsorisée du quartier | Revenue | H2 | needs-backend | 1 | 2 | 2 | 2 | 1 | CUT |


## Appendix B — considered and cut (kept here so nothing is lost)

These scored real but were cut as nice-to-haves, distractions, or too-early —
several are worth revisiting once the closed ledger and identity spine exist
(e.g. **Réseau Ardoise**, **Kiwi Réassort**, **Blad**, **Daret Kiwi** all become
much stronger *after* Wa9tek + the benchmark moat land).

- **Réseau Ardoise — le carnet de crédit en réseau** (Moat/H2) — Turn every épicerie ardoise into an opt-in, phone-keyed neighborhood credit graph: the same voisin's tab recognized across the hanout, boulangerie and lahma next door, with a real-time reputation score before extending the next tab — a two-sided moat global POS never captured because they never modeled shop-to-shop informal credit.
- **Kiwi Réassort — le marché de gros dans la caisse** (Revenue/H2) — When stock reorder thresholds trip, Kiwi shows live grossiste offers (Marjane Market, Metro, souk suppliers) with price/ETA and one-tap order routed to the cheapest — flipping stock.js from a passive alert into a GMV take-rate engine, giving small cafés aggregated Metro-tier pricing, and building a two-sided supplier moat.
- **Ardoise Diaspora — le voisin qui paie depuis l'étranger** (Morocco/H3) — Bridge the diaspora FX handler to the ardoise: an MRE in Paris settles or pre-funds a relative's tab at a named neighborhood hanout (EUR in, MAD tab cleared, WhatsApp receipt to both) — flipping remittance from 'send cash that might vanish' into 'guarantee Mama's groceries', a corridor no Wafacash or Square spans end to end.
- **Kiwi Franchise — clone-and-govern multi-location** (Platform/H2) — A franchise control plane on multi-établissement: clone a shop's full setup (menu, prices, roles, vocab, compliance checklists) to a new location in seconds, push central price/menu changes to all sites, lock what local managers can edit, and roll up a live cross-site P&L — building the Ultra tier's reason-to-exist and franchisor-led distribution.
- **Kiwi Dial — le carnet en poche du client** (Consumer/H1) — Turn the ardoise into a customer-held object: every neighbor with a tab gets a phone-keyed shareable link/QR showing live balance, itemized history and aging, and the merchant one-taps a prefilled WhatsApp 'rappel' — killing the #1 pain (chasing debts) and seeding the two-sided identity behind cross-shop reputation.
- **Caisse Deux Tiroirs — la vérité cash vs banque** (Morocco/H1) — Make espèces a first-class money source across sales AND expenses, then run an end-of-day two-drawer reconciliation (expected vs counted cash, mandatory variance reason) feeding accounting.js — the honesty backbone that makes the trésorerie forecast, ardoise net position and books stop being fiction.
- **Négociateur — l'agent qui chasse un meilleur prix** (AI/H2) — An agent watching supplier price drift ('agneau +14%, now above your cohort median') that drafts the next move: a ready-to-send WhatsApp asking the grossiste to match, alternative suppliers side-by-side, and the exact menu-price change to hold the tajine's margin — tying the benchmark cohort moat directly to money saved.
- **Community — l'agent qui récupère les clients perdus** (AI/H2) — An autonomous retention agent on a real WhatsApp customer identity: builds live RFM segments from actual tickets, and when a regular lapses drafts a personalized Darija win-back ('Nadia, 3 semaines qu'on t'a pas vue — café + msemen offert?'), schedules ftour/Aïd campaigns, and reports 'I re-engaged 22 sleeping regulars, 6 came back, +1 840 MAD'.
- **Taïba — le téléphone du client, quatrième surface live** (Consumer/H1) — Build the REAL diner web app the table QR only mocks: scanning T7 opens a genuine kiwi.shop menu, the guest orders, and via BroadcastChannel+localStorage the ticket lands live in the KDS and caisse — closing the serveur→caisse→KDS→dashboard→GUEST loop with the customer as origin, payment honestly Phase-2 gated (order now, pay at counter).
- **Blad — la couche de découverte du quartier** (Consumer/H2) — A consumer map/feed of Kiwi merchants: diners open kiwi.ma/blad, see nearby cafés/épiceries/pressings, their live 'ouvert maintenant' status, menu, QR-order link and the happy-hour just fired from CRM — the demand side that flips Kiwi into a two-sided marketplace and an anti-Glovo flywheel that compounds with density per quartier.
- **Ftour Direct — la vente ftour & le livreur du quartier** (Consumer/H1) — A neighborhood delivery loop on the merchant's own livreur instead of Glovo: a WhatsApp-first pre-order menu (harira/msemen baskets for a guaranteed pre-iftar drop) plus a lightweight 'mon livreur' dispatch with cash-on-delivery reconciling into Caisse Deux Tiroirs — 0% aggregator commission on the existing 0%-vs-30% visualizer.
- **Nقra — le compteur de commission gardée, rendu visible au client** (Consumer/H1) — Extend the 'what you kept vs Glovo' visualizer into a two-sided loop: a subtle 'commande directe · 0% aux intermédiaires' badge on storefronts and receipts nudges diners to order direct, and the merchant gets a monthly WhatsApp 'tu as gardé X MAD ce mois' — actively pulling demand off aggregators with a recurring proof-of-value hook.
- **Kiwi Connect — open API + marketplace d'add-ons** (Platform/H2) — A documented public API + webhook layer over the KiwiSale/venue/ledger spine plus an in-dashboard marketplace of installable third-party modules gated by OAuth scopes — with a demo-now interactive API explorer + webhook simulator so the pitch shows the developer surface before the backend exists, turning Kiwi from app into infrastructure.
- **Daret Kiwi — la tontine de quartier tenue proprement** (Morocco/H2) — A clean digital ledger for the daret (rotating savings circle) millions already run on paper: members, monthly contribution, payout order, who's owed, polite WhatsApp 'c'est ton tour' nudges, optional auto-collect from daily POS cash-in — invisible to every fintech, virally sticky (8-12 members dragged in per circle), and a savings dataset that later underwrites credit.
- **La Clôture — le rituel du soir** (Indispensability/H1) — A 90-second guided end-of-day close: count the drawer, confirm the Z, resolve expected-vs-counted variance, and persist the Z to localStorage — bookending the morning briefing into an unbreakable open→close habit and the persistence spine auto-accounting needs.
- **La Série — streaks & rituel de constance** (Indispensability/H1) — A brand-appropriate streak layer tracking consecutive clean closes and briefing-reads (no confetti spam), with a shareable monthly bilan — engineering loss-aversion into the daily open→close loop so skipping a day feels like a loss.
- **Kiwi Régie — la vitrine sponsorisée du quartier** (Revenue/H2) — An ad/placement network on the diner-facing QR menus and kiwi.shop storefronts: FMCG brands and distributors pay to feature a product, boost a menu item or drop a coupon across the network of diner phones Kiwi reaches; merchants opt in and share revenue — the highest-value ad inventory in retail (attention at the moment of purchase) with a two-sided moat.


## Appendix C — the honesty ledger (why the horizons are sequenced this way)

The single rule that governs the whole roadmap: **an honest demo today de-risks
the backend spend tomorrow and earns the right to the licensed rails last.**

- **H1 earns the raise.** Every H1 item ships inside the vanilla artifact with a
  visible `aperçu / roadmap` gate wherever money or a licence is implied. They
  prove the *closed-ledger* thesis in the pitch and deepen daily value at only
  build cost.
- **H2 builds the moat.** Each H2 item makes real a surface the vanilla artifact
  already *fakes* (the hardcoded `rang 12/147` benchmark, WhatsApp share-toasts
  with no thread, DGI/SIMPL toasts with no file behind them). We are not
  inventing eight surfaces — we are pouring a backend under UI the merchant has
  already been shown and believed.
- **H3 monetizes it.** The license-gated rails (e-Facture, Capital) are the
  deepest switching-cost moat in the stack, but they must stand on a backend and
  a data moat that already exist — so they come last, as gated previews until the
  regulator signs.
