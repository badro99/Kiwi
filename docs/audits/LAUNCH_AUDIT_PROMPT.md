# Kiwi — Final Launch-Readiness Audit (agent brief)

> Hand this entire file to a very capable autonomous coding agent (Claude Code,
> or equivalent with shell + browser-preview tools). It is self-contained: it
> tells the agent what Kiwi is, how to run it, exactly what to audit, how to
> verify, and how to report. The agent's job is to decide **GO / NO-GO for
> launch** with evidence — not to guess, and not to fix unless explicitly asked.

---

## 0. Your mission

You are the final pre-launch auditor for **Kiwi**, a merchant operating-system
dashboard for Moroccan cafés/restaurants (the demo venue is *Café Atlas ·
Maarif*). You will audit **everything** — visual design, responsiveness,
theming, accessibility, internationalisation, every interactive feature, the
in-browser AI agent and its deterministic engine, data integrity, performance,
security, content accuracy, and code quality — then deliver a **severity-ranked
findings report and a single GO / NO-GO verdict**.

Treat this like shipping to real merchants who will run their daily takings on
it. A plausible-looking bug that corrupts a number, leaks a fake figure, or
breaks on a phone is a launch blocker. Be thorough, skeptical, and
evidence-driven. **Reproduce every finding** before you report it.

---

## 1. What Kiwi is (context you must respect)

- **Stack: HTML + CSS + JS, no build step today.** No longer a locked decision
  (lifted 2026-08-13) — but this is a *launch audit*, so audit the app as it
  actually ships. A "migrate to React/Next/Vite" recommendation is out of scope
  here regardless: it is a migration proposal, not a launch blocker.
- A **real backend exists** (Cloudflare Pages Functions + D1 — accounts/auth,
  till pairing, live sales sync, clients, menus, orders) and surfaces fail soft
  to per-device state when it's unreachable. `localStorage` holds client state:
  `kiwiLang`, `kiwiTheme`, `kiwiMode`, `kiwiDateRange`, `kiwiRevCompare`.
  The showcase venue audited here (Café Atlas) runs on seeded demo data by
  design; real paired stores must never show it — treat any leak of seed data
  into a real/paired store as a launch blocker.
- **Trilingual: French (default), English, Arabic.** Arabic implies **RTL**.
  i18n uses a "captured-originals" pattern (`assets/i18n.js`): FR is captured
  from the DOM; EN/AR live in a `T` dictionary. Elements carry
  `data-i18n="key"`; attributes use `data-i18n-attr="placeholder:key"`.
- **Brand system is locked** (`assets/tokens.css`):
  - `--atlas #0B6E4F` (primary) · `--riad #053B2C` (deep) · `--mint #7DF2B0`
    (accent, ≤5% of surface) · `--paper #F7F5F0` (warm bone — **never pure
    `#fff`** for backgrounds) · `--ink #0A0F0D`.
  - No new accent colours. No bold display weights. **No emojis in section
    titles or CTAs.** Fonts: Inter Tight, Instrument Serif, IBM Plex Sans
    Arabic, JetBrains Mono.
- **Phase-1 scope is Kiwi POS SaaS.** Do **not** expect Pay/Banking/Investing
  surfaces. **No internal financials, asks, or projections may appear in any
  user-facing surface** — only public macro market data. Flag any leak of
  internal numbers as a finding.
- A **fusion/dark mode** exists (`body.fusion-mode` + `html[data-theme="dark"]`).
- The dashboard simulates a live trading day via `assets/demoClock.js`
  (`KiwiDemoClock.getSimState()` → `cumTx`, `cumRevenue`, etc.). Figures grow
  through the real hour and reset at minute :00 — this is intentional.

### Key files
- `dashboard.html` — the product. Most CSS lives here in `<style>`.
- `assets/tokens.css` — brand tokens.
- `assets/i18n.js` — translation engine + `T` dict (FR/EN/AR).
- `assets/interactive.js` — global `[data-action]` delegation → `Kiwi.handlers`;
  `Kiwi.modal/drawer/toast`; the transaction/order detail modal.
- `assets/dateRange.js` — single source of truth for the selected date range and
  all per-range data; live-feed rendering (`renderFeed`, `buildOrder`,
  `buildLiveFeed`).
- `assets/features.js` — feature handlers (Zakat, Sadaqa, Kiwi Compte, Capital,
  Diaspora, Loyalty, Agent Mode, Payment Links).
- `assets/pages.js` / `assets/pages-pro.js` — sidebar destination drawers
  (Transactions, Terminaux, Règlements, Conformité, Équipe, Tables, Menu, KDS,
  Stock, Payroll, Reservations).
- `assets/accounting.js` — the Moroccan accounting/fiscalité engine
  (`KiwiComptable`): TVA 10% restauration, CNSS 6,74% employee / 21,09%
  employer, IR, IS, the DGI fiscal calendar, payslips.
- `assets/agent.js` — the in-browser AI financial assistant: a **deterministic
  engine** (scored intent classifier + scenario calculators) with an
  **in-browser LLM fallback** (Qwen3-4B via WebLLM/WebGPU). Read this file in
  full.
- `assets/venues.js` — venue data, menus (`KiwiVenue.getMenuItems`), the
  menu-engineering matrix.
- `assets/mobile.css` / `assets/mobile-nav.js` — the mobile layer.
- `HANDOFF.md`, `CLAUDE.md` — project context and operating rules.

---

## 2. Set up & run (do this first)

1. The dev server config is `.claude/launch.json` (a custom Node static server,
   `node .claude/static-server.js`, port **4173**). Start it with your
   preview/`preview_start` tool, or `node .claude/static-server.js` directly.
2. Open `http://localhost:4173/dashboard.html`.
3. There is a **PIN lock screen**. Skip it by clicking the demo-entry button
   ("Entrer dans la démo →" / "Enter the demo"). If you script it, click the
   element whose text matches `/entrer|enter|d[ée]mo/i`.
4. Prefer **text-based inspection** over screenshots for facts: use the DOM
   snapshot / `preview_inspect` for exact CSS values, `preview_console_logs`
   (filter to errors) after every interaction, `preview_eval` to read state.
   Use screenshots only for layout/visual judgement — **never** trust a
   screenshot for a colour, font size, or spacing value; inspect computed style.
5. The agent ships a **built-in routing eval harness**. After loading the page
   you can run, in the page context:
   ```js
   window.KiwiAgentEval()   // → { total, pass, accuracy, fails:[...] }
   window.KiwiAgentRoute("augmente les prix de 8% et embauche un serveur")
   ```
   Use it — and extend it mentally with your own adversarial cases.

---

## 3. Audit dimensions (cover ALL of these)

For each dimension, actively try to break it. Record every issue with: file +
line, exact reproduction steps, the evidence you captured (computed value,
console error, screenshot), severity, and a one-line suggested fix.

### A. Visual & brand fidelity
- Every surface uses brand tokens — no stray hexes, no pure `#fff` backgrounds,
  no off-palette accent colours, mint used sparingly (≤~5%).
- Typography: correct font families/weights; no bold display weights; no emojis
  in section titles or CTAs (per brand rules).
- Spacing/alignment/visual hierarchy consistent across cards, drawers, modals.
- The new live-feed payment chips render the real brand marks crisply
  (`assets/icons/` — Visa, Mastercard, cash, QR) at all DPIs; the Visa wordmark
  sits on a transparent chip (no stray blue card behind it).
- Empty states, loading states, hover/active/focus states all look intentional.

### B. Responsive & cross-device
- Test **mobile (375×812), tablet (768×1024), desktop (1280+), and a wide
  1440/1600** viewport. Use the responsive-resize tool.
- The live feed, KPI band, charts, drawers, and the agent fullpage drawer must
  not overflow, clip, or stack incorrectly. Sticky topbar, hamburger nav, and
  the mobile bottom nav behave correctly.
- No horizontal scroll. Tap targets ≥ ~40px on mobile. Modals/drawers are
  usable and scrollable on a phone.

### C. Theming (light + fusion/dark)
- Toggle fusion/dark mode. Every component re-themes — no black-on-black or
  invisible text, no token that forgot a dark override. Pay special attention to
  the feed rows, payment chips, KPI tiles, the agent drawer, charts.

### D. Accessibility
- Keyboard: every interactive element reachable and operable by keyboard;
  visible focus ring; logical tab order; Escape closes modals/drawers; focus is
  trapped in overlays and returns to the trigger on close.
- ARIA/roles on buttons, dialogs (`role="dialog"`, `aria-modal`), the live feed
  rows. Images/icons have alt or `aria-hidden` as appropriate.
- Colour contrast meets WCAG AA for text. RTL Arabic is correct (direction,
  alignment, mirrored chevrons).
- Respects `prefers-reduced-motion`.

### E. Internationalisation (FR / EN / AR)
- Switch through all three languages on **every** surface (dashboard, drawers,
  modals, the agent, accounting). Find any **untranslated string** (FR leaking
  into EN/AR, or a missing key showing the raw key).
- Arabic flips to RTL correctly everywhere; numbers/dates/currency format
  sensibly; the IBM Plex Sans Arabic font renders.
- The agent must reply **in the language of the question** regardless of UI
  language (it has its own per-question language detection). Verify FR/EN/AR.

### F. Functionality — exercise every surface
- **Navigation:** every sidebar destination opens its drawer (Transactions,
  Terminaux, Règlements, Conformité, Équipe, Tables, Menu, KDS, Stock, Payroll,
  Reservations); logo → home; mobile nav.
- **Date range:** Aujourd'hui / Hier / 7j / 30j / Personnalisé all re-render KPIs,
  charts, and the feed consistently (`assets/dateRange.js` is the source of
  truth — subscribers must update together; no stale numbers across ranges).
- **Live feed:** rows render with correct chips; **clicking a row opens the
  order-detail drawer** with ticket #, table, covers, server, itemised cart,
  TVA breakdown, payment block, and timeline; the numbers inside add up
  (subtotal + TVA = total).
- **Every `[data-action]`** resolves to a handler — find any dead button (no
  handler, or a handler that throws). Check the console after each click.
- Feature surfaces (`assets/features.js`): Payment Links, Loyalty, etc. open and
  behave. Toasts/modals/drawers open, trap focus, and close cleanly; the
  scroll-lock counter stays balanced (no stuck `kiwi-locked` after closing).
- **Persistence:** language, theme, mode, date range survive a reload
  (localStorage). A custom/user-created venue shows **honest empty states**, not
  Café Atlas's data.

### G. The AI agent — deterministic engine (audit in depth)
Read `assets/agent.js` fully. This is the highest-risk surface because it puts
**numbers** in front of merchants.
- **Routing:** run `window.KiwiAgentEval()` — confirm 100% (or list fails).
  Then attack it yourself: ambiguous queries, mixed-language, typos, and
  multi-intent. Confirm the scored classifier (not a first-match chain) picks
  the best intent, and that genuinely out-of-scope queries fall through to the
  LLM rather than being force-fit.
- **Math correctness:** verify the `ATLAS` model reconciles (gross = revenue −
  COGS; total opex = sum of opex; net = gross − opex; margins). Then verify each
  calculator's formula: hire (orders-to-cover, % of net), price (Δnet at
  constant volume), afford (payback, % of cash), forecast (run-rate), break-even
  (fixed ÷ contribution ratio), margin, charges, revenue, profit. Recompute by
  hand and compare to the rendered card.
- **Compound scenarios:** e.g. "augmente les prix de 8% et embauche un serveur"
  must combine both levers on one bottom line (price Δ + hire Δ → new net,
  annual effect). Verify the percent and the salary are parsed **separately**
  (the 8 in "8 %" must never be read as the wage). Check FR/EN/AR.
- **Honesty discipline:** on a custom venue with no cost structure, every
  cost-dependent scenario must **refuse to invent numbers** and say so. Confirm
  it never quotes Café Atlas's figures for another venue. This is a hard
  requirement — a violation is a launch blocker.
- **Moroccan accounting:** ask about TVA, CNSS, IR, IS, payslips, the DGI
  calendar. Confirm answers route to the **deterministic** `KiwiComptable`
  engine (not the LLM) and the rates are correct (TVA 10% restauration, CNSS
  6,74% / 21,09%). Spot-check the fiscal-calendar dates and the computed TVA/IS.
- **Calculator safety:** the inline math evaluator uses `Function()` behind a
  strict whitelist — try to break out of it (injection, weird input) and confirm
  it can't execute anything but arithmetic.

### H. The AI agent — LLM fallback (Qwen3-4B / WebLLM)
- Model is pinned: `Qwen3-4B-q4f16_1-MLC` on `@mlc-ai/web-llm@0.2.84`
  (`assets/agent.js`). Confirm the model id resolves in that pinned version.
- WebGPU gate: with no WebGPU, the agent must degrade gracefully (a clear
  message, no crash). With WebGPU, the opt-in download offer shows the correct
  size (~2,4 Go).
- If you can complete the download in your environment, verify: the answer is in
  the question's language; **no `<think>` reasoning tags leak** into the reply
  (thinking is disabled via `/no_think` + a `stripThink` guard); the answer uses
  the real grounding (menu, live orders, KPIs) and does not contradict the
  dashboard's numbers. (Note: a sandboxed environment may firewall the WebLLM
  lib-WASM host `raw.githubusercontent.com`; if so, state that you could not
  complete the live download and verify everything else statically.)

### I. Data integrity
- Sim clock (`KiwiDemoClock`) and the feed/KPIs agree (same `cumTx`/revenue).
- No `NaN`, `Infinity`, `undefined`, `null`, or `[object Object]` rendered
  anywhere. Force edge times (start of hour → empty feed state) and confirm
  graceful empty states.
- Currency formatting is consistent (MAD, thousands separators, 2 decimals where
  shown).

### J. Performance
- Page load: no long-blocking, no console errors/warnings on load. Reasonable
  asset weights (flag anything multi-MB that ships on first paint — the
  brand-icon PNGs, fonts). The Mastercard PNG is high-res — confirm it's not an
  unreasonable payload for a 34px chip.
- No layout thrash / jank on range switches, drawer opens, or the live feed
  tick. Animations respect reduced-motion.

### K. Security
- `innerHTML` usage with any data that could include user/derived content — look
  for XSS surfaces (the feed cache, the order-detail drawer, the agent's
  streamed output). Confirm untrusted text is escaped or text-set.
- No secrets, API keys, tokens, `.env`, or internal endpoints in the shipped
  source. No internal financials/projections in user-facing copy.
- External calls: only the opt-in WebLLM CDN + model host. Nothing phones home
  with merchant data (the agent must run fully local — verify no network egress
  of typed questions).

### L. Content & copy
- Proofread FR/EN/AR for typos, mojibake, and tone. No lorem ipsum, no
  placeholder, no "TODO". Moroccan specifics correct (MAD, cities, bank names,
  fiscal terms). No emojis in titles/CTAs.

### M. Code quality & architecture
- Dead code, dead handlers, duplicated logic, console noise, commented-out
  blocks left in. Obvious correctness risks. Consistency with the documented
  architecture in `CLAUDE.md`/`HANDOFF.md`. (Report — do not refactor.)

---

## 4. Method & rules of engagement
- **Reproduce before reporting.** Every finding needs steps + captured evidence.
- **Inspect, don't eyeball** numeric/visual facts (computed styles, console).
- **Read the source** to confirm root cause; cite `file:line`.
- Distinguish **a real defect** from **intended demo behaviour** (e.g. the feed
  resetting at minute :00 is intentional — read the comments before flagging).
- **Do not fix anything** unless the report is approved or the user asks; this is
  an audit. If you must, propose fixes separately from findings.
- Respect the locked decisions (brand system, Phase-1 scope). The stack is *not*
  among them any more — but see §1: stack migration is out of scope for an audit.
- If a check is impossible in your environment, **say so explicitly** and verify
  what you can statically — never claim a pass you didn't observe.

---

## 5. Deliverable — the report

Produce a single structured report:

1. **Verdict: GO / NO-GO** — one line, then a 3–5 sentence justification.
2. **Top blockers** — the ranked shortlist that gates launch (if any).
3. **Findings table**, grouped by severity:
   - **P0 — launch blocker** (data corruption, fabricated numbers, broken core
     flow, security leak, crash, money/number wrong).
   - **P1 — must-fix-soon** (broken on a major device/language/theme, dead
     primary action, a11y failure on a core path).
   - **P2 — should-fix** (visual/polish, minor i18n gaps, perf).
   - **P3 — nice-to-have** (copy nits, code hygiene).
   - Each row: `id` · area (A–M) · `file:line` · description · repro · evidence ·
     suggested fix.
4. **Coverage statement** — which dimensions you exercised, on which
   viewports/languages/themes, and anything you could **not** verify (and why).
5. **Confidence** — how confident you are in the GO/NO-GO and what would raise it.

Be exhaustive and honest. A NO-GO with three real blockers is far more valuable
than a GO that missed one.
