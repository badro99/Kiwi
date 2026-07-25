# CLAUDE.md — operating notes for AI agents on the Kiwi project

This file is read on first contact by any Claude session opened against this repo.
It captures rules and conventions that aren't obvious from the code alone.
For full project context (history, architecture, brand system, roadmap), read **`HANDOFF.md`**.
**New session resuming work? Read `AI_HANDOFF.md` first** — it's the current-state brief
(what's true right now, recent work, gotchas, the two dev tracks, the Design 2026 skin).

---

## 1. Auto-push to GitHub AND the local Mac main repo after every edit

The project owner's business partner needs constant access to the latest state on
GitHub (`https://github.com/badro99/Kiwi`), and the owner himself works out of the
main repo at `/Users/badrosonair/Documents/kiwi`. **Both** must be updated after
every edit — never just one.

After **any edits** to files in this repo, you must:

1. `git add` the changed files (specific paths — never `git add -A` blindly)
2. `git commit` with a descriptive message in the format `<scope> · <what changed>`
   (e.g. `dashboard · redesign revenue chart tooltip`,
   `wallet · fix split-bill modal close button`)
3. Land the commit on **both** the local main branch and the GitHub remote:
   - **If working in the main repo directly:** `git push origin main`.
   - **If working in a worktree** (branch like `claude/*`, which is the default
     for Claude Code sessions): after committing on the worktree branch, run
     `git -C /Users/badrosonair/Documents/kiwi merge --ff-only <branch>` to
     fast-forward main locally, then
     `git -C /Users/badrosonair/Documents/kiwi push origin main`.
   - You may also push the worktree branch itself (`git push -u origin <branch>`)
     if a PR is expected, but the **main** push to origin is the non-negotiable step.

Authentication is cached in macOS Keychain — pushes are silent, no prompts.
Always end the turn by confirming the push landed (e.g.
`git -C /Users/badrosonair/Documents/kiwi log --oneline -1` plus the GitHub URL).

### Exceptions (don't commit in these cases)
- **Iteration within one turn.** If the user pivots mid-turn ("make it green / no, red"),
  commit once at the end with the final state.
- **Exploration only.** Reads, greps, file inspection — no commit.
- **Broken state.** If an edit left the repo in a broken state, fix it before pushing.
  If you can't fix it, tell the user and don't push.
- **Secrets.** If a commit would include anything that looks like an API key, password,
  token, `.env`, or credentials — stop and flag it. Never commit secrets.

### Commit author identity
Repo-local config sets author as `Badr-Eddin Bakkioui <badromail9@gmail.com>`
(set in `.git/config`). The `Co-Authored-By: Claude Opus 4.7 (1M context)` footer
should be appended to commit messages per the standard convention.

---

## 2. Tech stack — real product, vanilla frontend

**This is a real, working product now — not a mock/pitch demo.** Build features to
actually work, backed by real infrastructure. Where a surface is still placeholder
data, that's tech debt to replace, not the intended end state.

- **Frontend:** vanilla HTML + CSS + JS. No React, no build step, no framework, no
  bundler. This is a pragmatic choice (fast, zero-toolchain, trivially hostable on
  static CDNs) — NOT because the app is fake. Keep it vanilla unless a real need
  forces otherwise; if you think a framework is warranted, raise it first.
- **Real backend (live):** Cloudflare Pages Functions + D1 (`functions/`, `schema.sql`)
  — accounts/auth, Live Link sales, operator console, caisse↔dashboard pairing. See
  `LIVE_LINK.md` / `ADMIN.md`.
- **Real native components:** the Kiwi Printer Bridge (`bridge/`) — a local helper
  that relays ESC/POS jobs to networked thermal printers. Real hardware I/O lives
  behind `window.KiwiHardware` / `window.KiwiPrinter` (`assets/caisse-hardware.js`,
  `assets/printer-bridge.js`, `assets/escpos.js`).
- **Persistence:** `localStorage` for client state (`kiwiLang`, `kiwiTheme`,
  `kiwiMode`, `kiwiDateRange`, `kiwiRevCompare`, `kiwiPrinterCfg`, …); D1 for
  server-authoritative data.
- **Fonts:** Inter Tight, Instrument Serif, IBM Plex Sans Arabic, JetBrains Mono.

When you add a new capability, prefer a real implementation with a fail-soft path
(works degraded when the backend/hardware isn't reachable) over a pure mock — the
caisse pairing and printer bridge both follow this pattern.

---

## 3. Brand system — locked

Colors (defined in `assets/tokens.css`):
- `--atlas` `#0B6E4F` (primary) · `--riad` `#053B2C` (deep) · `--mint` `#7DF2B0` (accent ≤5%)
- `--paper` `#F7F5F0` (warm bone — never use pure `#fff` for backgrounds)
- `--ink` `#0A0F0D`

Don't introduce new accent colors. Don't use bold display weights. Don't use emojis
in section titles or CTAs. Don't rebuild the design system.

**Type is roman. Never italic.** Instrument Serif is the editorial voice, and the
accent word inside a heading is set in it — but upright. `font-style: italic` on a
heading, a display numeral, or a UI label is the single fastest-read "generated by
an AI" tell there is, and at 11–14px in Inter Tight it renders as sheared sans, not
as emphasis. `em`/`i`/`cite`/`dfn`/`var` are normalised to roman in
`assets/tokens.css` and `assets/landing/base.css`, so bare `<em>` can't fall back to
the browser default. Carry emphasis with the serif face, `--atlas`/`--mint`, or
weight. The only italics left in the repo *depict* something real — icing piped on
a cake (`.bl-script`), an imitated masthead (`.plogo.telquel`), a pilot's own
wordmark (`kandisky`) — and they set `font-style` on their own class so they outrank
the reset. Anything else is drift.

Signature motion — **la lentille liquide**: one highlight pill that stretches to span
the old and new option, then settles with a spring
(`cubic-bezier(0.34, 1.45, 0.5, 1)` · 310 ms). Implemented once in
`assets/liquid-lens.js` and auto-attached to segmented controls (date-range pills,
tab rows, the landing audience switch, the phone capsule bar). For any NEW
tab/pill group, register it there (or use `data-lens-demo`/`data-lens-item`) —
never invent a different selection style.

---

## 4. Architecture pointers

- `assets/i18n.js` · captured-originals i18n pattern (FR captured from DOM,
  EN/AR in `T` dict). `data-i18n="key"` on elements; `data-i18n-attr="placeholder:key"`
  for attributes.
- `assets/interactive.js` · global click delegation on `[data-action="..."]`,
  routed through `Kiwi.handlers[name]`. Modals/drawers via `Kiwi.modal/drawer/toast`.
- `assets/dateRange.js` · single source of truth for the dashboard's selected
  date range and all per-range data. Subscribers re-render when range changes.
- `assets/features.js` · feature handlers (Zakat, Sadaqa, Kiwi Compte, Capital,
  Diaspora, Loyalty, Agent Mode, Payment Links).
- `assets/pages.js` · sidebar destination drawers (Transactions, Terminaux,
  Règlements, Conformité, Équipe, Tables, Menu, KDS, Stock, Payroll, Reservations).

---

## 5. Phase 1 focus

The pitch deck and dashboard story revolve around **Kiwi POS SaaS** — a
four-tier model:
- **Kiwi Basic · 199 MAD/month** — software only, on the merchant's own
  hardware, unlimited devices, one établissement, integrated into the existing
  till, on-site training + guides included.
- **Kiwi Pro · 399 MAD/month** — everything in Basic + one free Kiwi cashier,
  T+1 settlement, hardware maintenance.
- **Kiwi Ultra · 1 499 MAD/month** — unlimited établissements, multi-pays, API
  enterprise, dedicated 24/7 account manager.
- **Kiwi Ultimate · sur devis** — bespoke scope, device/cashier count and price
  agreed with the client.

Kiwi Pay / Banking / Investing are Phase 2-3 optionality.

Don't add Pay/Banking/Investing surfaces unless explicitly asked.
Don't surface internal financials, asks, or projections in any external-facing
material — public macro market data only (tourists, interchange cap, SME count).
