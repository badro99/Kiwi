# Kiwi AI — Phase 2 Roadmap

**Real market & accounting intelligence for the Kiwi assistant.**

This is a forward design doc, not a commitment. It sketches what it takes to
evolve the Kiwi AI agent from a deterministic co-pilot into an assistant that
genuinely *knows* — the merchant's real books, Moroccan tax, and the Moroccan
café market. The backend spine it needs is now live (Cloudflare Pages
Functions + D1 — see `AI_HANDOFF.md`); the intelligence layer on top remains
a multi-quarter effort. Companion to `KIWI_2.0_ROADMAP.md` (which tracks
payment-license-gated removals — a separate concern).

---

## Where the agent is today (Kiwi 1.0)

`assets/agent.js` is a hybrid:

- **A deterministic scenario engine.** `respond()` routes plain-language
  questions to scenario functions (`sHire`, `sPrice`, `sAfford`, `sForecast`,
  `sBreakEven`, `sMargin`, `sCharges`, `sRevenue`, `sProfit`, `sAccounting`,
  `sCalc`). It does *real* financial math — but against one café's hardcoded
  `B` profile (Café Atlas, mocked figures).
- **An optional in-browser LLM** for open questions — WebLLM, Llama-3.2-3B,
  ~2 GB, opt-in. Small model, **no internet, no real-time data**.

It knows Café Atlas's numbers cold and the *shape* of Moroccan SME accounting
(the `accounting.js` `ACCT` mock — plausible TVA / CNSS / IS data). It does
**not** know real markets, do research, or compute against a real merchant's
data. That gap is what this doc addresses.

## The unlock: a backend

Everything below needs a server — to store real POS transactions, run a tax
engine, hold a knowledge base, compute benchmarks, and proxy a hosted model
(API keys cannot sit in client JS). `CLAUDE.md` locks the vanilla stack
*"until a real backend lands."* Phase 2 **is** that moment — this is the
trigger the roadmap anticipates, not a violation of it.

## The core principle: tools, not knowledge

The Phase-2 agent is a **thin reasoning layer**. It never *knows* a financial
number — it **calls a tool** that computes it deterministically, then explains
the result. Authority lives in the tools (scenario engine, tax engine,
benchmark store); the LLM only orchestrates, translates, and handles open
questions. LLMs hallucinate tax figures, so the hard rule is: **the model
never emits a financial number it did not receive from a tool.**

---

## Track 1 · The Moroccan tax-rules engine

A server-side component that takes a merchant's real transactions and computes
TVA / IS / IR / CNSS correctly and explainably — the authoritative tool the
agent calls instead of guessing.

1. **Rules as versioned data, not code.** Moroccan tax law changes every *Loi
   de Finances*. Hardcoding rates means a yearly refactor and regression risk.
   Instead, a `ruleset` store keyed by fiscal year — TVA rates & regimes, the
   IS schedule, IR brackets & abattements, CNSS / AMO rates & ceiling, taxe
   professionnelle. The engine selects the ruleset by the *period's* date, so a
   2027 audit of a 2025 period still computes on 2025 rules. A tax update
   becomes a data edit plus a test — never a refactor.

2. **The engine is pure and deterministic.**
   `computeTVA(transactions, period, ruleset) → {result, trace}` — no side
   effects, fully unit-testable, same inputs always the same output. Same shape
   for IS, payroll and IR. Determinism is what makes it auditable and
   replayable.

3. **Every output carries a computation trace.** Not "TVA: 38 309 MAD" but the
   structured breakdown — which transactions, which rate, which regime, the
   arithmetic. The merchant and accountant must verify it; the agent needs the
   trace to *explain* the result rather than hallucinate around it.

4. **Classification is the hard part — keep it separate.** Computing TVA on
   already-classified lines is easy maths. *Knowing* that a supplier line is a
   deductible raw-material purchase is the hard problem. A classification layer
   (rules + ML + merchant confirmation) maps raw POS / expense lines → tax
   categories; the computation layer is pure math on classified data.
   Classification can keep learning; computation stays provably correct.

5. **How it grounds the agent.** The LLM never computes tax — it calls
   `tax.computeTVA(period)`, receives `{result, trace}`, and translates it to
   natural language. If the engine cannot classify a line it returns a
   `needsReview` flag and the agent *asks the merchant* — it never guesses.

6. **Validation is the trust layer.** A tax engine is a liability surface.
   Three mitigations: a **golden test suite** of real anonymized declarations
   with known-correct outputs; **expert-comptable sign-off** on every ruleset
   version (recorded and dated); and **human-in-the-loop** — declarations are
   *drafts* the accountant approves. The agent says "prepared, ready to sign,"
   never "filed."

7. **Filing is file generation, not an API.** DGI (SIMPL) and CNSS (Damancom)
   have no clean public API. The engine's job ends at a **compliant export** in
   the format those portals — or an agréé accounting editor — expect. "Filing
   integration" realistically means file generation, possibly a partnership.
   Scope it honestly in any pitch.

8. **This is what `accounting.js` becomes.** Today `ACCT` is a hand-authored
   plausible snapshot. The engine *produces* that snapshot from real data plus
   rules — and it is reusable beyond the agent: it powers the Comptabilité hub
   directly too.

---

## Track 2 · The data-moat architecture

Turning aggregated, anonymized Kiwi POS data into live Moroccan sector
benchmarks — a compounding, defensible asset.

1. **The raw material is a byproduct.** Every Kiwi POS already emits tickets,
   items, amounts, timestamps, payment mix. Once a backend stores them, you
   hold structured commerce data across every café on Kiwi — no scraping, no
   buying. It falls out of running the core product.

2. **One-way pipeline: raw → aggregates, never raw → query.** The agent must
   never touch another merchant's raw data. Scheduled aggregation jobs roll raw
   transactions into *cohort statistics* — distributions of average ticket,
   covers/day, hourly intensity, payment mix. Only the aggregates land in a
   benchmark store the agent reads. Raw and aggregate are separate stores with
   separate access — enforced by architecture, not policy.

3. **Cohorting is the key design choice.** A benchmark only helps if it is
   "cafés *like me*." Cohort dimensions: business type, city / zone, size band,
   price band. The agent always compares a merchant to their cohort — never to
   "all merchants."

4. **The privacy model — non-negotiable, and a selling point.** Under Loi
   09-08 / CNDP: **k-anonymity** — a cohort aggregate is shown only if it holds
   ≥ k merchants (below that → "not enough peers yet"), which blocks
   de-anonymizing a competitor. Aggregates only — medians, percentiles,
   distributions — never another merchant's actual figure. Opt-in, with the
   benchmark itself as the value exchange. Done right, "aggregated,
   k-protected, never sold, never exposed" is a *trust* pitch, not just
   compliance overhead.

5. **How the agent uses it.** A grounded tool: `benchmark.query(cohort, metric)`
   → the cohort distribution plus the merchant's percentile. *"Your 142 MAD
   ticket is 60th percentile for Casablanca cafés your size — but your
   15h–17h covers are bottom quartile."* The dashboard's static "147 cafés"
   block becomes the real thing.

6. **The flywheel is the moat.** More merchants → more data → finer cohorts
   (neighborhood, not just city) → better agent advice → more valuable Kiwi →
   more merchants. A competitor starting fresh has *zero* benchmark data and
   cannot buy it — it only accrues by operating the POS at scale. It compounds
   and cannot be shortcut: a textbook data network-effect moat. And you sell
   the POS, not the data — the intelligence is the compounding byproduct.

7. **It unlocks more than benchmarks.** On the aggregate layer you can build
   demand forecasting ("your zone sees +30 % covers during X"), cohort anomaly
   detection, pricing intelligence ("your cohort raised prices 4 % this
   quarter; you have not"), and eventually a *sellable* macro product —
   anonymized sector reports for suppliers, landlords, investors.

8. **It accrues, it does not launch.** Day one, N = 1 merchant → no benchmarks.
   You build the pipeline early (cheap) but benchmarks only become real at
   scale; until then the agent says "available once enough peers join" —
   honest, and a growth incentive. For the pitch: present the *moat* as the
   earned asset, the *pipeline* as proof you architected for it.

---

## The tool-call interface

Phase 2 inverts the agent's control flow. Today `respond()` is a regex router
and the LLM is a fallback. In Phase 2 the **LLM is the front door**, it holds a
tool catalog, and the deterministic engine, tax engine and benchmark store are
all tools behind it.

### Tool catalog

```
business.metrics(period)            → { revenue, cogs, grossMargin, opex{}, netProfit, cash, … }
business.transactions(period, filter?) → ledger lines

scenario.hire({ monthlyCost })      → { stats[], verdict, … }   ← today's sHire
scenario.priceChange({ pct })       → { … }                     ← today's sPrice
scenario.afford({ amount })         → { … }                     ← today's sAfford
scenario.forecast() | breakEven() | margin() | charges() | revenue() | profit()

tax.computeTVA(period)              → { collectee, deductible, aPayer, regime, trace[], needsReview[] }
tax.computeIS(year)                 → { taxable, rate, due, trace[] }
tax.computePayroll(period)          → { totalBrut, cnss, ir, totalNet, perEmployee[], trace[] }
tax.classify(line)                  → { category, confidence, needsReview }
tax.draftDeclaration(type, period)  → { draft, exportFile, status:'draft' }
tax.calendar()                      → upcoming DGI / CNSS deadlines

benchmark.query({ metric, cohort? }) → { distribution:{p25,p50,p75}, merchantPercentile, n, cohortLabel }
                                       (returns insufficientPeers when n < k)

kb.search(query)                    → Moroccan tax / accounting passages, with citations
calc.evaluate(expr)                 → number                    ← today's evalMath
```

### The agent loop

1. User question, any language → hosted LLM (behind the backend) with the tool
   catalog in context.
2. The LLM plans and calls tools — often several.
3. Tools return `{ result, trace }` — authoritative, deterministic.
4. The LLM composes the answer in the user's language, grounded by the traces,
   citing only figures the tools returned.
5. Any `needsReview` flag → the agent asks the merchant; it never guesses.

### Mapping from today's `agent.js`

| Today (Kiwi 1.0)                     | Phase 2                                            |
| ------------------------------------ | -------------------------------------------------- |
| `B` (hardcoded café profile)         | `business.metrics()` — real, DB-backed             |
| `respond()` regex router             | LLM tool-choice (regex kept only as a fast-path)   |
| `sHire`, `sPrice`, … scenario fns    | `scenario.*` tools — same math, real inputs        |
| `sAccounting` + `ACCT` mock          | `tax.*` tools over the rules engine                |
| `buildSystemPrompt()` (FR, static)   | System prompt: role + tool catalog + the no-freelance-numbers rule |
| WebLLM in-browser (2 GB)             | Hosted model via backend proxy; WebLLM kept as an offline fallback |

The scenario engine is already good — it stays. Phase 2 does not throw it away;
it gives it real inputs and makes it callable.

---

## Phasing — cheapest and highest-trust first

| Phase | What                                              | Needs                                        |
| ----- | ------------------------------------------------- | --------------------------------------------- |
| 2.0   | Curated Moroccan tax knowledge base + RAG (`kb.*`) | Makes accounting answers correct & current    |
| 2.1   | Backend + real POS data (`business.*`, `tax.*`)   | Agent reasons on actual transactions          |
| 2.2   | Benchmark aggregates (`benchmark.*`)              | Merchant scale — a flywheel, not a build      |
| 2.3   | Filing integration + external market research    | Hardest, last                                 |

---

## Caveats — and how to pitch them

- **Tax computation is a liability surface.** A wrong TVA filed is real harm.
  Frame the agent as *assistive*, with the expert-comptable in the loop — never
  authoritative. "Prepared, ready to sign," not "filed."
- **Benchmarks need scale and privacy rigor.** Loi 09-08 / CNDP. Aggregate,
  anonymize, enforce k-anonymity in the architecture.
- **A hosted model has real per-merchant cost.** The in-browser model was free
  precisely to avoid that — it hits unit economics; budget for it.
- **DGI / CNSS integration is portal-bound, not API.** Scope it as compliant
  file generation or an editor partnership.

**Pitch framing.** Phase 1 (today) ships the deterministic co-pilot — real math
on the merchant's numbers, tri-lingual, fully offline. Honest and demoable now.
The Phase-2 narrative is the data moat: *"every café on Kiwi makes Kiwi smarter
about the Moroccan café market."* True, defensible, and it compounds with scale
— pitch it as the **earned** asset, never claimed before the data exists.
