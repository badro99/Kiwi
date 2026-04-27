# CLAUDE.md — operating notes for AI agents on the Kiwi project

This file is read on first contact by any Claude session opened against this repo.
It captures rules and conventions that aren't obvious from the code alone.
For full project context (history, architecture, brand system, roadmap), read **`HANDOFF.md`**.

---

## 1. Auto-push to GitHub after every edit

The project owner's business partner needs constant access to the latest state on
GitHub (`https://github.com/badro99/Kiwi`). After **any edits** to files in this
repo, you must:

1. `git add` the changed files (specific paths — never `git add -A` blindly)
2. `git commit` with a descriptive message in the format `<scope> · <what changed>`
   (e.g. `dashboard · redesign revenue chart tooltip`,
   `wallet · fix split-bill modal close button`)
3. `git push origin main`

Authentication is cached in macOS Keychain — pushes are silent, no prompts.
Always end the turn by confirming the push landed (e.g. `git log --oneline -1`
plus the GitHub URL).

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

## 2. Tech stack — vanilla, deliberately

- Vanilla HTML + CSS + JS. **No React, no build step, no framework, no bundler.**
- All interactions mocked client-side via toasts, modals, drawers (`assets/interactive.js`).
- `localStorage` for persistence (`kiwiLang`, `kiwiTheme`, `kiwiMode`, `kiwiDateRange`,
  `kiwiRevCompare`).
- Fonts: Inter Tight, Instrument Serif, IBM Plex Sans Arabic, JetBrains Mono.

Resist the urge to migrate to Next.js / a framework / a build pipeline.
The vanilla decision is locked until a real backend lands.

---

## 3. Brand system — locked

Colors (defined in `assets/tokens.css`):
- `--atlas` `#0B6E4F` (primary) · `--riad` `#053B2C` (deep) · `--mint` `#7DF2B0` (accent ≤5%)
- `--paper` `#F7F5F0` (warm bone — never use pure `#fff` for backgrounds)
- `--ink` `#0A0F0D`

Don't introduce new accent colors. Don't use bold display weights. Don't use emojis
in section titles or CTAs. Don't rebuild the design system.

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

The pitch deck and dashboard story revolve around **Kiwi POS SaaS** —
Kiwi Basic 399 MAD/month and Kiwi Pro 699 MAD/month, hardware loaned free,
T+1 settlement. Kiwi Pay / Banking / Investing are Phase 2-3 optionality.

Don't add Pay/Banking/Investing surfaces unless explicitly asked.
Don't surface internal financials, asks, or projections in any external-facing
material — public macro market data only (tourists, interchange cap, SME count).
