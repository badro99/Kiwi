# Claude's Moneys — full test-run journey (boutique)

Live end-to-end walkthrough of a **brand-new boutique account** on the real hosted
site (`kiwi-maroc.pages.dev`), driven through the Chrome MCP. Goal: click every
surface, ring real flows, and log every bug / rough edge for a concrete fix-list.

- **Store:** Claude's Moneys · boutique · owner "Claude"
- **Login:** `claudes.moneys.test@kiwi-demo.ma` (throwaway) — account created by the owner (I can't create accounts / type passwords)
- **Started:** 2026-07-24, on build after F6/F6b (empty floor + shift-restore hardening)

Status legend: 🔴 blocker · 🟠 bug · 🟡 rough edge · 🟢 works

---

## Findings

### 🔴 #1 — Fresh signup lands on the PIN gate, NOT onboarding (FIXED, v56)
**Symptom:** brand-new account, right after signup, shows the 4-digit dashboard lock
("Saisis ton code à 4 chiffres") with no way in — no onboarding wizard, and no valid
code exists yet (`/api/config` → `pins: []`). Owner read it as "it thinks I'm Ghali."

**Not an identity leak:** `/api/me` + `KiwiMe` both correctly resolve **Claude's Moneys**
(`claudes.moneys.test@kiwi-demo.ma`). F1 purge ran (`kiwiOnboarded`, `kiwiPins`,
`kiwiCustomVenues`, `kiwiVenue` all cleared; `kiwiAccountKey` = new email).

**Root cause:** `venues.js ensureOwnEmptyVenue()` synthesizes an empty `'own'` venue for
every authenticated merchant at boot and adds it to `customIds`, so `KiwiVenue.isCustom()`
returns `true` from the first paint. `onboarding.js shouldAutoLaunch()` guards with
`if (hasCustomVenue()) return false` — reusing that same `isCustom()` — so the synthetic
placeholder vetoes the wizard. venues.js:1297 even documents that `'own'` should let "the
onboarding CTA still show", but `hasCustomVenue()` didn't honor that. The signup
`?onboarding=1` one-shot can also be consumed by the F1 purge-reload before the wizard
opens, so the (broken) fallback path is what a fresh merchant actually hits.

**Fix (v56):** `hasCustomVenue()` now ignores the synthetic `'own'` placeholder (returns
false for it) while still suppressing for a genuine user-created venue and for `'scoped'`
operator god-mode. Fresh merchant → `shouldAutoLaunch()` → wizard opens.

### 🟡 #2 — Stale `kiwiLiveMerchant` survives account switch
On the fresh Claude's Moneys session, `kiwiLiveMerchant` was still `"mixmax-test"` (Ghali's
slug). F1's purge list is supposed to include it, and F7 self-heals it on dashboard load
from `KiwiMe.business` — but on the locked screen the dashboard poll never starts, so it
sits stale. Low severity (heals once the dashboard opens) but worth confirming the purge
actually clears it. _To verify post-fix._

### 🟡 #3 — Synthetic `'own'` venue defaults to type `restaurant` for a boutique
`ensureOwnEmptyVenue()` reads `KiwiMe.type`, but a brand-new merchant has no
`merchant_config` row yet (`/api/config` → `type: ""`), so the placeholder falls back to
`restaurant`. A boutique briefly presents as a restaurant until onboarding sets the type.
Cosmetic pre-onboarding; resolves once the wizard runs. _To verify post-fix._

---

## Journey log
_(populated as the walkthrough proceeds)_
