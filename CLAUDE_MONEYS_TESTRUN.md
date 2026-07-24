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

---

## Caisse walkthrough (till open, boutique POS)

### 🟢 Inventaire — product + variant creation works end-to-end
« Nouvel article » → name / category / type (Vêtement S–XL) / price / cost / icon picker,
then « Ajouter une variante » → colour swatch × size × initial stock, with an auto-generated
**real EAN-13** (2000000000015) plus print/copy/delete controls. Created *Chemise en lin*,
450 MAD sale / 200 MAD cost, variant Bleu nuit · M · stock 10. KPIs updated correctly
(Valeur de stock 4 500 MAD, 10 pièces). Catalog persists to
`kiwiBoutiqueCatalog:v1:claude-s-moneys` — the base shared with the dashboard.

### 🟢 Vente → encaissement works end-to-end
Product appears in the sale grid under its category, tap → add-to-ticket sheet (size with
live per-size stock, colour, quantity stepper, manager-gated discounts −5/10/15/20 %),
« Encaisser » → payment sheet (Espèces / Carte / Avoir). Cash tender computes change
correctly (550 reçu → 100 MAD rendu). « C'est encaissé » confirmation with 80 mm + WhatsApp
receipt options. Header ticked over to "1 vente · 450 MAD aujourd'hui".

### 🔴 #6 — Selling a boutique item does NOT decrement inventory stock (FIXED)
**Symptom:** rang a real sale of *Chemise en lin · M* (qty 1); the variant's stock stayed
**10** in the Inventaire view *and* in storage (`var_2.stock: 10`) — a boutique whose stock
never moves. Low-stock / rupture alerts would never fire, stock valuation stays wrong, and
the owner can oversell indefinitely.

**Root cause:** `assets/pos-boutique.js` decrements stock only in the in-memory `P`
projection via `stockAdd()` (add-to-ticket, ticket +/−, reset). `checkout().onPaid` records
the sale, mirrors it to Live Link, and awards points, but **never persists the decrement to
the shared catalogue** (`window.KiwiBoutiqueCatalog.adjustStock`). `rebuildCatalog()`
re-derives `P` from the persistent base on every catalogue sync, so even the in-memory
decrement evaporates. The code comment at line ~213 admits it: *"La baisse de stock à la
vente reste en mémoire (démo)."* Fine for the pitch demo, wrong for a real store. The mirror
paths (retour `restoreLines`, échange `apply`) had the same gap — they only did in-memory
`stockAdd(+)`.

**Fix:** added a `persistStock(pid, size, color, delta)` helper that resolves the exact
variant (produit × couleur × taille) and calls `adjustStock`, gated on `pvReal()` so the
local Maison Mansour demo keeps its reset-each-load behaviour (byte-identical). Wired into
the three **committed** movements: vente (−qty per line), retour (+qty), échange (+ rendue /
− remplacement). Idempotent-safe: `adjustStock`'s commit fires the subscribe→`rebuildCatalog`,
which re-sets `P` from the base, so the persisted change never double-counts the in-memory
hold. Provisional ticket holds (add / +/− / reset) stay in-memory only, as before.
_Shipped cache v57 — pending live re-verify after deploy._

### 🟡 #7 — Three colliding venue identities for one store (to investigate)
On the paired caisse: `kiwiVenue = "vmrza3s4g"` (dashboard's generated custom venue),
catalog keyed `claude-s-moneys` (merchant slug, what pos-boutique uses), and the live-sales
mirror under `kiwiSales:own` (legacy synthetic "own" venue). The catalog/dashboard share the
merchant-slug key so inventory syncs, but the sales mirror lives under a *different* key.
Needs a pass to confirm the caisse sale actually surfaces on the dashboard "En direct" feed
under the right venue. _To verify on the dashboard side._

### 🟠 #8 — Stale phantom sale in `kiwiSales:own` → traced to a real cross-tenant leak (FIXED)
`kiwiSales:own` held `[{ts, amount:189, method:"cash", cursor:5}]` — a single sale
timestamped ~3 h **before** this account created its first product. Traced to the server:

```
GET /api/feed?merchant=claude-s-moneys → cursor 6 · 450 MAD · "Chemise en lin"   ← ours
GET /api/feed?merchant=mixmax-test     → cursor 5 · 189 MAD · "Jean"             ← Ghali's
```

The 189 MAD sale belongs to **`mixmax-test`** on the server, but it was sitting in Claude's
Moneys' browser, counted into this store's KPIs. Not a display glitch — a real
cross-tenant ingest. Root cause + fix: see 🔴 #9 below. **The 450 MAD caisse sale filed
correctly** under `kiwiSales:vmrza3s4g`, so the caisse→dashboard path itself is sound;
what leaked came in through the feed poll.

_Note: #7's catalogue half is a false alarm._ `_bqxVenue()` (pages-pro.js:6806) resolves to
`_bqxSlug(KiwiMe.business)` = `claude-s-moneys` on a real session — the same key the caisse
writes. Confirmed live: `KiwiBoutiqueCatalog.use('claude-s-moneys').stats()` → 1 produit ·
10 pièces · 4 500 MAD from the **dashboard** tab. Inventory sync is correct. Only the
*sales* keys are per-venue (`venues.js:7071 SALES_KEY = id => 'kiwiSales:' + id`), which is
what let an ingested foreign sale land in the `own` bucket.

---

## Security — multi-tenant isolation (found while chasing #8)

### 🔴 #9 — Any merchant could read any other merchant's sales feed (FIXED)
**Symptom:** `GET /api/feed?merchant=<slug>` returned that store's sales to *any* caller
past the site gate. Demonstrated live: from Claude's Moneys' authenticated session I read
`mixmax-test`'s full feed. Slugs are `slugMerchant(business name)`, so they're guessable.

**Root cause:** `functions/api/feed.js` took the tenant straight from the query string with
no ownership check. The site gate admits *every* signed-in merchant plus the shared
`SITE_PASSWORD` staff passcode, so "past the gate" was being treated as "entitled to this
store's data". The same missing check is what let the leak in #8 happen automatically: the
feed poll starts at boot, `merchant()` fell back to a stale `kiwiLiveMerchant` a previous
account left in the browser, and the server happily served that other merchant's sales.

**Fix:** the server now decides the tenant, not the client — account session → always that
account's own slug (`?merchant=` ignored); operator (`kiwi_op`, God mode) → `?merchant=`
honoured, that's what the console is for; gate-only caller (pitch demo) → demo tenant only.
Unknown ⇒ empty feed. Demo path unchanged.

### 🔴 #10 — Shared `'default'` tenant bucket on sale + feed (FIXED)
Both `/api/sale` and `/api/feed` defaulted a missing/empty merchant to the literal string
`'default'`. Every device whose identity hadn't resolved yet **wrote real sales into one
shared bucket**, which any other unresolved device then **read back as its own**. A
cross-tenant channel by construction, and unattributed money is unrecoverable once there.
**Fix:** `/api/sale` refuses an unnamed sale (400 `no-merchant`); `/api/feed` returns an
empty feed; `live-link.js postSale()` skips the post instead of firing a guaranteed 400.

### 🔴 #11 — Feed poll ingested a previous account's sales (FIXED)
`live-link.js merchant()` fell back to the pinned `kiwiLiveMerchant` whenever `KiwiMe`
hadn't resolved — and the poll starts *before* `/api/me` answers. On a browser that had
held another account, the first ticks polled the **previous merchant's** slug. This is the
mechanism behind #8. **Fix:** a paired till still trusts its own binding
(`kiwiPairedVenue.merchant` — account-scoped, purged on switch); a real session with
unresolved identity now polls **nothing** and self-heals a tick later. The local demo is
untouched.

### 🟠 #12 — A till's staff PINs are still readable without an account (OPEN, needs a call)
`GET /api/config?merchant=<slug>` returns `pins:[{pin,name,role}]` — the codes that open a
till. Half-fixed: a **signed-in** merchant can no longer read another merchant's PINs (the
session slug now overrides `?merchant=`; operator still honoured). Still open: a caller with
**no** session but past the site gate can pass any `?merchant=` and get its PINs, because a
paired caisse has no account and legitimately needs exactly that call.

**Proposed fix (not applied — would de-authorise tills already paired in the field):** have
`/api/pair/redeem` set a signed, HttpOnly per-merchant cookie (`kiwi_till`), and require it
to match `?merchant=` on the no-session path. Needs a re-pair or a grace window for the
tills already deployed — owner's call before shipping.

### 🟡 #13 — Pairing codes are brute-forceable (OPEN, low)
`/api/pair/redeem` is unauthenticated (site gate only), single-use, 15-min TTL, 6 digits =
900 000 codes, **no rate limit**. A script could grind a live code and bind its own till to
a merchant. Low urgency at pilot scale; wants a per-IP attempt cap before real volume.
