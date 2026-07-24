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

### Onboarding wizard (6 steps) — 🟢 works end-to-end
Auto-launched after the v56 fix. Steps: (1) owner name, (2) business name + type,
(3) # establishments + city, (4) team size, (5) priorities (multi-select) + daily
revenue goal, (6) team access codes (owner 4-digit PIN required). Clean UI, back/skip
controls present, progress bar accurate. Entered: Claude / Claude's Moneys / **Boutique** /
1 établissement / Casablanca / 2 people / {ventes, stock, fidélité} / 3000 MAD goal.

**🟡 #4 — wizard doesn't prefill known signup data.** Step 1 (name) and step 2 (business
name) both start empty even though signup already captured `kiwiOwnerName="Claude"` and
`kiwiBizName="Claude's Moneys"`. Minor friction — the owner re-types what they just entered.

**🟡 #5 — business type defaults to "Restaurant" in the wizard.** Step 2 pre-selects
Restaurant; a boutique owner must actively switch. (Same root as #3 — nothing carries the
type from signup, so the default is a guess. Kiwi is boutique-heavy at launch, so a
neutral/no default, or remembering, would fit better.)

**Owner PIN (step 6):** required; becomes the dashboard-lock credential → owner set it
(I don't type login credentials). Team rows optional. Owner "Claude" → 1234,
cashier "Hamza" → 4321. Final summary shows "Codes d'accès: 2 actifs" ✓.

### Post-onboarding dashboard — 🟢 pristine, zero demo leakage
"Claude's Moneys · Casablanca", **boutique** sidebar (Inventaire produits, Catégories,
Promotions & offres, Retours & échanges), live card "En attente d'une vente", 0,00 MAD
everywhere, KPIs all 0, KIWI AI "Votre tableau de bord est prêt · aucune donnée pour
l'instant", daily goal 3 000 MAD (from onboarding). F1/F3/F6 all holding on a real fresh
store — no Café Atlas, no Ghali, no seed shift.

### 🟢 Caisse staff-PIN gate (F8) — verified live end-to-end
Owner asked: "the caisse shouldn't open unless the owner or a cashier PIN is entered."
**Already works — no code change needed.** Chain verified:
1. Onboarding wrote owner 1234 + cashier 4321 and **synced them to the server** —
   `GET /api/config?merchant=claude-s-moneys` → `pins:[{Claude,1234,owner},{Hamza,4321,staff}]`.
2. Paired a caisse (dashboard "Connecter la caisse" → code 447748 → redeem) — the till
   bound to **"Claude's Moneys"** (correct slug, not cafe-atlas).
3. `bootWithPin()` saw pins existed → showed the **"CODE PERSONNEL · 4 CHIFFRES"** pad
   instead of opening (gate active, not fail-soft).
4. Wrong code `9999` → **rejected** (dots cleared, till stayed locked).
5. `submitPin()` accepts any configured PIN → owner 1234 **or** cashier 4321 opens it;
   nothing else does.

**🟡 caveat — fail-soft opens the till if `/api/config` is unreachable OR returns no PINs.**
Deliberate anti-lockout design (a real owner is never bricked out of their own register),
but it means a network blip = an ungated till for that boot. Acceptable default; flagging
for awareness. Also: the gate currently accepts ANY configured role (owner/manager/staff),
which matches "owner or cashier" here; if the till should exclude some role, that's a small
`submitPin` role-filter — not currently requested.
