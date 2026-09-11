# Kiwi — Pitch Priorities (the 16 → 3 cut)

> **✅ Historical (May 2026) — all three shipped, then surpassed.** Cross-surface
> sync went beyond the in-browser `KiwiBus` described here: it is now a real
> Cloudflare D1 backend (Live Link + till pairing — see `LIVE_LINK.md`,
> `AI_HANDOFF.md`). i18n/RTL is complete. Kiwi is a live product, not a demo;
> this file is kept as a record of the cut.

The HANDOFF roadmap spans 16 items across four horizons. For the next raise,
only three change an investor's mind. Everything else is deferred — not
abandoned — with a one-line reason. Doing fewer things completely beats doing
sixteen things partially.

## The 3 we do now

### 1. Cross-surface sync — make it *one product*
**Why it moves the needle:** the single sharpest objection is "these are three
disconnected mockups." A demo where an order taken on `kiwi-serveur` genuinely
appears on `kiwi-caisse` and ticks up the `dashboard` feed — live, in three
tabs — proves the architecture is real.
**Scope:** the `KiwiBus` (`BroadcastChannel` + `localStorage`) layer described
in `SYNC_MODEL.md`. No backend required. ~1 day.

### 2. Finish FR / EN / AR + clean RTL — credibility table-stakes
**Why it moves the needle:** Kiwi's whole thesis is "we know the Moroccan
market." An investor who switches to Arabic and sees layout overflow or
untranslated strings stops believing that sentence. This is ~90% done — RTL
viewport overflow is now fixed; the ~49 missing `data-i18n` attributes on the
dashboard are in progress.
**Scope:** complete dashboard i18n coverage, native-speaker pass on Arabic,
sweep caisse/serveur for the same gaps. ~2 days incl. review.

### 3. Unified entry + mobile-safe — one cohesive flow
**Why it moves the needle:** today the demo is three separate `.html` files an
investor must be told how to navigate, and the dashboard breaks below 375px —
exactly the width of the phone they'll open the link on. Fix both and the demo
*presents itself*.
**Scope:** one entry point with shared venue/login context routing to the three
surfaces; responsive fixes for dashboard <375px and heatmap <480px. ~2 days.

**Total: ~1 working week to a demo that survives a technical investor.**

## Deferred — and why (say this out loud in the pitch)

| Item | Why it waits |
|---|---|
| Règlements, Reconciliation, Kiwi Sentinel, Merchant Banking | License-gated. Correctly hidden until the Bank Al-Maghrib PE license lands — see `KIWI_2.0_ROADMAP.md`. Showing them now would be dishonest. |
| Kiwi Invest (fractional AMMC funds) | Phase 3. Separate regulatory track; out of scope until the core POS raise closes. |
| Pro-only API / CSV / refund tooling | Post-funding. Needs the real backend; no investor decides on it. |
| Real Moroccan photography | Deferred this round by choice. Real commissioned imagery matters for market credibility — revisit before a customer-facing launch, not for the raise. |
| Full WCAG 2.2 AA sweep | Do the high-visibility fixes (focus traps, keyboard nav) opportunistically; a formal audit is a launch gate, not a pitch gate. |
| Real backend infrastructure | This *is* the use of funds. The pitch sells the plan to build it — the demo doesn't need it. |

## The framing line for the deck

> "We deliberately scoped Kiwi 1.0 to what we can run honestly today — a
> point-of-sale system — and parked every processing-dependent feature behind
> the Bank Al-Maghrib license. The raise funds the backend and the license.
> The demo proves the product and the team."
