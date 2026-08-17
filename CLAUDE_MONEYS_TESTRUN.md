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
1. Onboarding wrote owner and cashier PINs and **synced them to the server** —
   `GET /api/config?merchant=claude-s-moneys` → `pins:[{Claude,••••,owner},{Hamza,••••,staff}]`.
2. Paired a caisse (dashboard "Connecter la caisse" → code `••••••` → redeem) — the till
   bound to **"Claude's Moneys"** (correct slug, not cafe-atlas).
3. `bootWithPin()` saw pins existed → showed the **"CODE PERSONNEL · 4 CHIFFRES"** pad
   instead of opening (gate active, not fail-soft).
4. Invalid code → **rejected** (dots cleared, till stayed locked).
5. `submitPin()` accepts any configured PIN → owner or cashier PIN opens it;
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

### 🟠 #12 — A till's staff PINs are still readable without an account (FIXED, v65)
`GET /api/config?merchant=<slug>` returns `pins:[{pin,name,role}]` — the codes that open a
till. Half-fixed: a **signed-in** merchant can no longer read another merchant's PINs (the
session slug now overrides `?merchant=`; operator still honoured). Still open: a caller with
**no** session but past the site gate can pass any `?merchant=` and get its PINs, because a
paired caisse has no account and legitimately needs exactly that call.

**Proposed fix (not applied — would de-authorise tills already paired in the field):** have
`/api/pair/redeem` set a signed, HttpOnly per-merchant cookie (`kiwi_till`), and require it
to match `?merchant=` on the no-session path. Needs a re-pair or a grace window for the
tills already deployed — owner's call before shipping.

---

## Dashboard sweep — live, on the real Claude's Moneys account

Owner unlocked both surfaces (PIN `••••`). Every finding below was seen on screen by a
signed-in real merchant, not inferred from code.

### 🟢 Verified working end-to-end
- **Stock fix (#6) confirmed live.** Rang a 2nd sale (Chemise en lin · M, **Carte** this
  time). Variant stock **10 → 9** in storage, caisse Inventaire, *and* the dashboard's
  Inventaire produits (9 pièces · 4 050 MAD), plus a live "Vente encaissée · 450 MAD ·
  Carte" toast on the dashboard. Caisse → shared catalogue → dashboard all reconcile.
- **KPI bridge.** Aujourd'hui = 450,00 MAD · 1 commande · panier moyen 450 · 15 % of the
  3 000 MAD goal. After the 2nd sale: **Ventes = 2 ventes · 900 MAD**, correct methods
  (CARTE + ESPÈCES) and times. No demo leakage in that list.
- **Catégories write path.** Created "Chemises" → persisted to
  `kiwiBoutiqueCatalog:v1:claude-s-moneys`, toast *"disponible en caisse et au dashboard"*,
  filter chip + `CATÉGORIES 1` updated. No in-memory-only bug here.
- **Équipe.** Both onboarding PINs became real staff rows (Claude · Propriétaire ·
  Direction · CDI; Hamza · Équipier · Service · CDI). Correct, no demo staff.
- **Clients & Marketing / Promotions / Retours.** Honest all-zero empty states.

### 🔴 #14 — Live feed told the store it had **98 commandes aujourd'hui** (FIXED)
The "Commandes en direct" subtitle read
`window.KiwiDemoClock.getSimState().cumTx` (`dateRange.js` `renderFeed`). The demo
simulator keeps running behind a real session, so its counter was printed as the
merchant's own order count — **98** on a store that had rung **2**. A custom venue now
counts its own sales since midnight from `KiwiSales`; the demo still reads the sim.

### 🔴 #15 — Every **cash** sale was labelled "Carte bancaire" (FIXED)
`buildCustomFeed`'s label map had `card/qr/link` but **no `cash`**, so
`L[s.method] || L.card` relabelled cash as *Carte bancaire*, and the chip icon
(`(qr|link) ? 'qr' : 'tap'`) gave cash the NFC mark while an unused cash icon sat in
`ICONS`. On a Moroccan boutique — where cash is the dominant tender — the owner could not
tell cash from card on their own feed. Added cash/tap/wallet labels (fr/en/ar) and a
per-tender icon map, with a **neutral** card chip: the till records the tender, never the
network, so a Visa/Mastercard mark there would invent a fact the sale doesn't carry.

### 🔴 #16 — Kiwi Capital completed a **fabricated credit decision** (FIXED)
`features.js handlers['capital']` was ungated. A real merchant could reach
*"Pré-qualifié jusqu'à 120 000 MAD"* → *"Confirmer · fonds d'ici 24h"* → toast
**"Kiwi Capital · demande acceptée — 45 000 MAD seront crédités d'ici 24h"**, carrying
*"Conforme Murabaha · Agréé AAOIFI"* claims. No lending rail exists; nothing is sent
anywhere. Now an honest "bientôt" for real merchants (the same gate `kiwi-compte` used).

### 🔴 #17 — Zakat confirmed a **payment to a named real charity** (FIXED)
Ungated `handlers['zakat']`: pick *Fondation Mohammed V*, *Bayti* or *AMC* → confirm →
**"Zakat versée · reçu envoyé par WhatsApp"**. No payment rail — a merchant could believe
a religious obligation was discharged when no money moved. The **calculation is real and
useful, so it stays**; for a real merchant the recipient picker and payout button are
replaced with an honest note pointing them at their usual channel.

### 🔴 #18 — "Lien de paiement" hands the client a URL that 404s (FIXED)
In the dashboard header for **every** merchant. Generated `kiwi.ma/p/<random>` (nothing
serves `/p/`), the "QR" is a CSS stripe pattern rather than a scannable code, and the
WhatsApp/email/SMS share buttons only toast. A merchant would send a paying customer a
dead link. Gated to an honest "bientôt" for real merchants.

### 🟠 #19 — "Pour vous" band promoted Capital + Zakat to real merchants (FIXED)
`oppo-cards.js render()` had no phase check; dismissing two cards promoted
*"Kiwi Capital avance jusqu'à 200 000 MAD"*. Both dropped from the pool for real
merchants; demo pool unchanged.

### 🟠 #20 — "INVENTAIRE · MAISON MANSOUR" on a real client's dashboard (FIXED)
Verified live: *Inventaire produits → Nouveau produit* showed the demo store's name as the
modal eyebrow (hardcoded `tag:`). Now the store's own name via `_bqxTag()`.

### 🟠 #21 — Stock is valued at **retail price, not cost** (FIXED, v63)
`boutique-catalog.js:369` — `stockValue += s * (p.priceMAD || 0)`. Every product stores a
`cost` (the owner typed 200 MAD against a 450 MAD sale price) that is never used here, so
"VALEUR DE STOCK" read **4 050 MAD** for 9 pieces that cost **1 800 MAD** — 2.25×
overstated. A merchant using that for accounting, insurance or working capital is
materially wrong. Not fixed unilaterally: the demo seeds `cost = 55 % of price`, so
switching the basis changes the demo's visible number, and "which basis" is a product
decision. Recommend: value at cost, and show retail as a secondary "potentiel de vente".

### 🟠 #22 — Payment-mix card is dead + has **no cash row** (FIXED, v63)
`renderMix` has no custom-venue branch, so a real store sees a blank ring and Visa /
Mastercard / Kiwi Tap / QR all at **0 %** forever despite real sales. Worse, the four
categories are **card rails only — there is no Espèces row at all**, which is the
boutique's actual dominant tender. Fixing means adding a 5th segment, which also changes
the demo card, and relabelling "Visa/Mastercard" (the till only knows *card*, not the
network). Owner's call on the shape.

### 🟠 #23 — Terminaux shows "Encore rien ici" although a caisse **is** paired (FIXED, v63)
The sidebar chip says "Caisse connectée" and `kiwiPairedVenue` is set, but the Terminaux
destination is a starter placeholder. The one device the client definitely has does not
appear on the page whose whole job is listing devices.

### 🟡 #24 — Most destinations are starter placeholders for a real boutique (FIXED, v63)
`pages-pro.js REAL_FOR_CUSTOM = {inventory, categories, equipe, menu, tables}` — every
other destination (**Terminaux, Conformité, Paie & planning, Réservations & RDV,
Promotions, Retours & échanges**) renders "Encore rien ici". `conformite.js`, `stock.js`
and `finance.js` each already build a correct real empty-state page that is currently
unreachable — adding those navs to the set is close to a one-line unlock.

### 🟡 #25 — Restaurant copy on a boutique dashboard (FIXED, v64)
Kiwi AI suggestion chip **"Quel plat retirer de ma carte ?"**; Promotions placeholder
**"Ex. −10 % happy hour"**; hero card "CE SOIR · Aucune activité planifiée"; Équipe
department list offering *Bar, Cuisine, Coiffure, Manucure, Massage, Pâtisserie, Plonge*
to a clothing shop; `agent.js NAV_TARGETS` routing "ouvre le menu" / "plan de salle" to
live restaurant surfaces. Kiwi is boutique-heavy at launch — this reads as the wrong product.

### 🟡 #26 — Dashboard opened on **"Hier"**, showing 0,00 MAD next to a live 450 MAD sale (FIXED, v63)
`kiwiDateRange` is in identity.js's `PRESERVE` list, so a range chosen in a previous
session (or by a previous account on that browser) carries over. The first thing the
owner saw was *ENCAISSÉ HIER 0,00 MAD* directly under an *EN DIRECT · 450 MAD* card.
A brand-new store should land on Aujourd'hui.

### 🟡 #27 — KIWI AI panel contradicts the data on the same screen (FIXED, v63)
"Votre tableau de bord est prêt · **Aucune donnée pour l'instant**, enregistrez vos ventes"
while the same viewport showed 450 MAD / 1 commande. Same class: Promotions and Retours
both still offer "Encaisser ma première vente" after two sales.

### 🟡 #28 — Ventes rows are unidentifiable and not clickable (FIXED, v63)
Rows read "Vente", not "Chemise en lin" — the label IS sent to the server and shown in the
live card, but the local `kiwiSales:<venue>` record keeps only `{ts, amount, method}`. For
a boutique processing a return, finding the original sale is the core task.

### 🟡 #29 — Caisse day counter resets on reload (FIXED, v63)
After reloading the till, its header read "0 vente · 0 MAD aujourd'hui" while the dashboard
correctly showed 450 MAD. The server has the sales; the caisse's own list does not survive
a reload, so a cashier and the owner see different numbers for the same day.

### 🟡 #30 — fr plurals (FIXED)
"1 produits · 1 variantes · 1 catégories" → singular via a small `_bqxN()` helper.

---

### 🟡 #13 — Pairing codes are brute-forceable (FIXED, v65)
`/api/pair/redeem` is unauthenticated (site gate only), single-use, 15-min TTL, 6 digits =
900 000 codes, **no rate limit**. A script could grind a live code and bind its own till to
a merchant. Low urgency at pilot scale; wants a per-IP attempt cap before real volume.

---

## Pass 2 — 24 Jul 2026, evening (cache v63 → v65)

Every item left OPEN after the first sweep is now closed. Verified against a real
custom venue driven through the app's own public API (`KiwiVenue.createVenue`,
`KiwiSales.add`) on the local server, with DOM assertions rather than screenshots
— the dashboard sits behind the PIN gate, which this session cannot open.

**Verified on screen:** payment mix reads Espèces 68 % / Carte 23 % / QR 9 % on
1 100 MAD of real sales (segment dasharrays match pct − gap exactly); Ventes rows
read "Chemise en lin", "Foulard de soie", "Sac cabas"; KIWI AI reads "4 ventes
aujourd'hui pour 1 100 MAD, panier moyen 275 MAD… 68 % encaissé en espèces",
agreeing with both; Terminaux lists "Caisse Kiwi · Test Boutique · Casablanca ·
connectée"; Stock/Conformité/Finance render their own scoped empty registers;
Équipe offers Vente / Vitrine / Caisse / Stock / Management. The DEMO payment
mix was re-checked byte-for-byte (Visa 48 / MC 24 / Tap 18 / QR 10) — unchanged.

**Verified by test** (stubbed D1, `scratchpad/*.test.mjs`): 14 assertions on the
pairing rate limiter and 8 on the PIN disclosure. All pass.

### 🔴 #31 — Every real sale printed "450,00 MADMAD" (FIXED, v63)
Found while verifying #28. `buildCustomFeed` appended " MAD" to the amount while
the row template already appends its own `<span class="cur">MAD</span>`. Demo rows
pass the bare number, so only REAL merchants saw the doubled unit — on every row
of their sales list.

### 🔴 #32 — OrderPro has no tables in production (OPEN — partner's call)
`schema.sql` defines `menus` and `orders`; the live D1 (`kiwi-sales`) has neither:

```
accounts · merchant_config · operators · pairings · sales · staff_pins · pair_attempts
```

**RESOLVED 24 Jul, night — tables applied to the live D1 on the owner's go-ahead.**

`GET /api/menu?merchant=…` answered `{"menu":null,"orderpro":false}` — it fails
soft, so a customer who taps an NFC tag reaches the page (fixed in 890584c) and
finds an empty carte instead of an error. Nothing can be published and no order
can be stored. NOT provisioned unilaterally: these tables belong to the partner's
OrderPro rollout and they may be staging it deliberately (R2 media, etc.).
`pair_attempts` WAS applied, since it backs a security fix shipped in the same
commit and nothing else reads it.

Apply with:
```sql
-- the menus + orders blocks from schema.sql, verbatim
```

---

## Pass 3 — 24 Jul 2026, night (cache v68 → v69)

Swept the surfaces no live test had ever opened: **Paie & planning**, **Réservations
& RDV**, **Dépenses & cartes** on the dashboard, and **Échanges & avoirs**,
**Clientes**, **Scan** in the boutique caisse. Driven as a real paired store
("Test Boutique · Casablanca"), never as the demo.

### ✅ #33 — Paie & planning hid the staff you had hired  (FIXED, by the partner)
A merchant with two people on the roster opened Paie and read "Encore rien ici, et
c'est normal." venues.js already built that page from the Équipe roster. The
starter gate intercepted it — the same shape as #24 (Conformité/Stock/Finance).
Found independently on both sides within minutes; the partner's `b8a5dff` moved
the page into team.js and it is strictly better than my patch (period band, hours
grid, and a real empty state). Mine was withdrawn in `6ab3f20`.

### ✅ #34 — a real boutique printed the demo's initials on every receipt  (FIXED)
`MM-` is Maison Mansour, the pitch boutique. A real store's very first ticket
printed **MM-1208** — another business's initials and a fabricated starting
number. Real stores now take their own initials and start at 1 (`TB-1`);
`restoreDay()` already stripped any prefix, so resumed counters still work.

### ✅ #35 — Échanges & avoirs opened on a failed search nobody ran  (FIXED)
With no sale yet today the page rendered « Rien pour «  », vérifiez le n° de
ticket ou le téléphone » — a not-found error before the cashier had typed
anything. It now asks for the ticket or the phone, and only reports "rien" once
something was actually searched.

### Checked and found CORRECT (no change made)
- **Dépenses & cartes** — a real store gets the honest Phase-2 teaser, not Café
  Atlas's 248 600 MAD. `depenses.js` already branches.
- **Réservations & RDV** — correctly left on the starter: the module is still
  demo-only (it keeps Café Atlas's 38 couverts even when the venue name changes).
- **Clientes (caisse)** — the tab is deliberately redirected to the shared Carnet
  clients by `clients-book.js` (one client book across every vertical). Working as
  designed; `renderClientes()` in pos-boutique.js is now dead code.
- **Scan (caisse)** — correct empty state, no demo leak.

### Two false positives worth recording, so the next sweep doesn't re-raise them
- **"Bonjour Rachid · Café Atlas" on a real store.** Gated by `isRealSession()`,
  which is false on the local static server (no `/api/me`), so `neutralize()`
  no-ops there. Hosted sessions are patched. Same for the venue picker listing the
  three demo venues — filtered by `kiwiOnboarded` / `demosAllowed`.
- **"The Carnet opens invisible and bricks the till."** `#kcb-root` really does sit
  at `opacity: 0`, full-screen, `z-index: 940` — but only because the test tab is
  backgrounded: `visibilityState: hidden`, rAF never fires, so the `kcb-fade`
  keyframe never advances past `from`. Any CSS-animated reveal looks broken under
  this harness. Check `document.visibilityState` before believing one.

### #32 — OrderPro tables: now actively blocking, not merely dormant
Re-checked the live D1 tonight — still `accounts · merchant_config · operators ·
pair_attempts · pairings · sales · staff_pins`. No `menus`, no `orders`.

This stopped being dormant. The partner's `c1cafcb` fixes the *publisher* so it
finally fires (it was giving up before venues.js settled). `POST /api/menu` then
runs `INSERT INTO menus …`, which is wrapped in a `catch` returning
`{"error":"write-failed"}` **500**. So every publish from that new code path now
fails server-side. Still the partner's call to apply, but the cost of waiting
changed.

### ✅ #32 — RESOLVED, 24 Jul night
Applied to the live D1 on the owner's explicit go-ahead: the `menus` and `orders`
blocks from `schema.sql` verbatim, plus `idx_orders_merchant`. Confirmed present:

```
sqlite_master → idx_orders_merchant · menus · orders
```

**Not yet proven end-to-end.** Publishing needs an authenticated merchant session,
which this sweep could not create, and `GET /api/menu` fails soft either way
(`{"menu":null}` whether or not the table exists) — so the 200 it returns proves
nothing on its own. Someone signed in should press "publier" once and check a row
lands: `SELECT merchant, type, updated_ts FROM menus;`
