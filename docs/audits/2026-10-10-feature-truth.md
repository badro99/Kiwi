# Feature truth pass · 2026-10-10

Owner's brief: every feature should do exactly what it claims, with no bugs
and no partial behaviour dressed up as complete. This pass takes the features
one at a time and runs each one end to end, not by reading code alone.

## Method

- **Local stack, synthetic data.** `node tools/kiwi-local-stack.mjs --seed`
  runs the whole product on `localhost:8790`: Pages Functions, a SQLite stand-in
  for D1 loaded from `schema.sql`, and an in-memory stand-in for R2. `--seed`
  creates a fixture café account (`LOCAL_FIXTURE` in the file) and activates its
  store. No production data or real merchant is involved.
- **Two devices in one browser.** The dashboard runs in one tab and the till
  (`kiwi-caisse.html`) in another, paired through the product's own "Ouvrir la
  caisse sur cet appareil" button.
- **Hidden browser pane.** If the pane is hidden, the page reports
  `visibilityState === 'hidden'`. Pollers then stop, the idle lock fires after
  3 min, and screenshots come back blank. To test anyway, override
  `document.visibilityState` in the page and emulate a 1440×900 viewport.

## Plan de salle: done

| # | Finding | Status |
|---|---|---|
| P1 | "Caisse en direct" lit whenever `/api/floor/live` answered, even with no till ever paired. | **Fixed.** The route now returns `tillSeen` from `order_desk`, the heartbeat of the till's authenticated queue poll. The badge says "Caisse en direct" only within 90 s of it. Otherwise it says "Caisse hors ligne · vue à HH:MM", or "Aucune caisse connectée". |
| P2 | A new store's empty room came pre-furnished with a counter, kitchen, door and plant. The till then drew them as COMPTOIR and CUISINE. | **Fixed.** The `blank` template uses scene `blank`, not `salle`, which the v1 migration expands. |
| P3 | Count strings ignored the singular: "1 tables", "1 libres", "1 occupées". | **Fixed** across the plan's FR and EN templates. |
| P4 | With an empty roster, the inspector showed three selects reading "Aucun · ·". | **Fixed.** It now says there are no servers yet and where to add them. Otherwise it shows one spare slot, and never offers an already-assigned server twice. |
| P5 | Adding a table below 1100 px scrolled the page about 1 000 px down to the inspector. | **Fixed.** Palette adds keep you on the plan (`openInspector(id, {reveal:false})`). |
| P6 | Auto-placed tables at y=48 put their top chairs across the "SALLE" name plate. | **Fixed.** Placement starts at y=64. |
| P7 | The "Places" stepper applied to every shape, giving a 56×56 counter stool 4 seats and a square 8. | **Fixed.** Seats are capped per shape (round 8, square 4, long 10, counter 1, high 4) and the stepper is capped at 10. |
| P8 | The "Aujourd'hui" panel showed "5 MAD par couvert" for a 120 MAD bill and 2 covers. The figure is revenue per seat in the room; EN and AR already said "per seat". | **Fixed.** FR now reads "par place". A true per-diner figure would need covers stored on `table_sessions`. |
| P9 | The editor's `_selection` Set was saved into every plan, locally and on the server, as `{}`. | **Fixed.** `pdsSerialize` drops `_`-prefixed top-level keys. |
| — | Rotation with fewer than 2 servers. | Verified honest: the button is disabled and the reason is shown. |
| — | Live loop: a till opens a table, the dashboard KPIs and plan follow, payment frees the table, and revenue and turns land. | Verified end to end. |

## Cross-cutting, found on the way

| # | Finding | Status |
|---|---|---|
| X5 | The "Connecter la caisse" chip never came back after a code unlock. `caisse-link.js` listened on `document`, while `dashboard.html` dispatches the event on `window`. For a new store, where Terminaux starts off, that chip is the only way to pair a till. | **Fixed.** The test now checks the event target, not just the event name. |
| C1 | **The same-device hand-off opened a real store's till as the demo.** `IS_DEMO` is frozen at mount, and the hand-off pairs during boot, after that. Result: the 35-dish demo menu at invented prices, ringable; kitchen tickets starting at "bon #53"; the tab titled "Démo commerçant"; the owner shown as "Caissier". | **Fixed.** The till publishes `__kiwiCaisseBootedAsDemo`. `caisse-pairing.js` puts the hand-off back and reloads once, guarded against loops. The real till is titled with the store name. Covered by `tools/caisse-handoff-demo-reload-test.mjs`. |
| C2 | The till dialog read "Ouvrir 1". | **Fixed.** It now reads "Ouvrir la table 1", in FR, EN and AR. |
| C3 | The till's empty-menu card was squeezed into one tile and wrapped word by word. | **Fixed.** It spans the grid. |
| T1 | Équipe › Nouveau membre pre-filled the salary at 4 500 MAD and the hourly rate at 50 as real values, so a quick save booked invented payroll. | **Fixed.** Both fields start empty, with a placeholder of 0. |
| X1 | A pending store's writes are refused. | Not a bug. It is the subscription paywall (`entitlements-v2.js`). |
| X3 | `/api/feed` is polled every 2.5 s. | Not a bug. This is the documented cadence while visible (20 s when hidden). |
| X6 | The lock screen offers "Entrer dans la démo". | Localhost only. `demosOn()` is false on hosted domains. |

## Sidebar and till presence: done

| # | Finding | Status |
|---|---|---|
| S1 | The sidebar's "Caisse connectée" chip came from local pairing memory alone. It stayed green with the till switched off while the plan said "hors ligne", and read "Connecter la caisse" beside a till paired from an iPad and ringing. | **Fixed.** `/api/feed` now carries the till heartbeat (`order_desk.seen_ts`), `live-link.js` publishes it as `KiwiTillPresence`, and the chip reads "Caisse connectée" within 90 s of it, otherwise "Caisse hors ligne". Boutique and spa tills never poll the queue, so for them local memory still decides. Covered in `tools/caisse-chip-gate-test.mjs`. |
| S2 | Sidebar badges ("Équipe 0", "Plan de salle LIVE"). | Not shown. `.sidebar nav a .tag` and `.count` are `display:none` for every merchant. No user impact. |

## Accueil: done

| # | Finding | Status |
|---|---|---|
| A1 | **"vs hier" compared today so far with the whole of yesterday.** `realDeltaPct` said, in its own comment, that it compared the same slice. But `shiftedBusinessBounds` returns whole days, so every tile read −80 to −100 % each morning. | **Fixed.** For a live range, the baseline now ends at the same hour of the reference day. `tools/kpi-same-slice-test.mjs` runs the real function, and fails on the old code. |
| A2 | "Heures de pointe" labelled each hour's sale count as "couverts". A sale carries no covers. | **Fixed.** For a real store it says "commande(s)". The demo keeps its covers fixture. |
| A3 | "Score de santé" and "Vous vs établissements similaires" promised a figure "après vos premières semaines". Kiwi computes neither for any real store. | **Fixed.** Hidden outside the demo. The "Plus d'analyses" count and grid follow (they used to say 4 over 2 cards). |
| A4 | "Ventes par canal" said "indisponible" before the first sale. | **Fixed.** It says "Aucune vente". "Indisponible" now only appears when sales exist without a channel. |
| A5 | "Objectif du jour" showed the day's revenue in the goal's place when no goal was set ("85,00 · Aucun objectif défini"). | **Fixed.** It shows "·". |
| A6 | The payment-mix ring shipped the demo's "16 590 MAD carte" in its markup until first render. | **Fixed.** Neutral placeholder. |
| — | Revenue, orders, average basket, channels, payment mix, insights and the live feed with one real sale. | Verified on the local stack. |

Covered by `tools/dashboard-truth-test.mjs`.

## Till, found on the way

| # | Finding | Status |
|---|---|---|
| C4 | **Demo kitchen tickets inside a real store's till.** A till that went through the C1 hand-off before its fix saved the demo board (bons #38 to #52) into the real merchant's shift. "À emporter" then offered "Encaisser · 205 MAD" for a Pastilla nobody ordered. | **Fixed.** Restoring a real store's shift drops tickets that match the demo seed (same number and dishes, no `opId`). New seeds are tagged `demoSeed`. Covered in `tools/caisse-handoff-demo-reload-test.mjs`. |
| C5 | The pay dialogs read "Table À emporter · 1 art. couverts" for a take-away, and "Table Part 2 · T7 couverts" for a split. | **Fixed.** One helper sets the prefix and the unit: "À emporter · 1 article", "Table T4 · 3 couverts", "Part 2 · T7". Covered by `tools/caisse-pay-subtitle-test.mjs`. |

## Commandes, factures, rapport journalier: done

| # | Finding | Status |
|---|---|---|
| F1 | **An invoice could carry another merchant's ICE.** `getSellerBusiness` scanned every `*:ice` key on the device, so a till that had served two stores printed the first one's identity. A placeholder like "·" also passed as an ICE, and the "ICE manquant" warning stayed silent. | **Fixed.** Only the active store's own aliases are read, and an ICE must be 15 digits to count. Anything else prints as missing and warns. Covered in `tools/sale-invoice-test.mjs`. |
| F2 | The day report said "Ouverture 11:48" on a day the till never recorded an opening. The time was the first sale's. | **Fixed.** `day-report.js` flags `openedKnown`. Without it the report says "Première vente". |
| — | Commandes list, server invoice numbering, ICE input validation on the client. | Verified on the local stack. |

## Clients et fidélité: done

| # | Finding | Status |
|---|---|---|
| L1 | **Points accrued with no programme chosen.** The server, the device book and the till all credited 1 point per MAD to every client sale, in a store that had never opened Fidélité. The client card then announced rewards nobody offered. | **Fixed.** A programme counts only once a model is chosen and saved (not `auto`). Until then a sale records the visit and spend, and nothing else. Same rule in `functions/api/clients.js`, `clients-store.js` (`loyaltyOn`), the till's progress line and the assistant. Covered in `tools/audit-remediation-inventory-loyalty-test.mjs`. |
| L2 | The assistant read a flat `fidelity.threshold` that the configurator never writes, so "points avant récompense" was always wrong. | **Fixed.** It reads the chosen model's own rule (stamps or points). |
| L3 | The client book showed "il y a 20 371 j" for a client with no visit on record. | **Fixed.** It shows "·". |
| L4 | The till's client button appeared only after the first re-render, because the inline script hooked the client book before the deferred `clients-store.js` had loaded. | **Fixed.** It hooks on `DOMContentLoaded` when the book is not there yet. |

## Équipe: done

| # | Finding | Status |
|---|---|---|
| E1 | **A clock-in at the till never reached the open Équipe page.** The live poll stored the new reply's signature, then re-rendered only `if (signature !== liveTeamSignature)`, which was always false by then. "En service" and each member's status stayed stale until something else redrew the page. | **Fixed.** A changed reply now repaints (still deferred while a form is open). Verified: an on-duty reply turned the tile to 1 and the row to "En service" with no click. |
| E2 | The job and department lists were not linked. A new member started as "Chef de cuisine · Cuisine", and picking "Serveur" kept them in Cuisine for planning and payroll by department. | **Fixed.** Every job of every trade maps to one of that trade's departments, and picking a job moves the department (the owner can still override it). The custom select is notified, so what shows is what saves. |
| E3 | A salary nobody entered read "0 MAD / 0 MAD/h" in each row, and "Masse salariale · 0 MAD". "Salaire calculé" read 0 MAD for a week of hours with no hourly rate. | **Fixed.** "· Non renseigné", "· aucun salaire renseigné" (or "k salaires renseignés sur n"), and "·" for pay without a rate. |
| E4 | "En service aujourd'hui" said "membres pointés (estimation)". It is a live count from the till, or hours logged today when the live roster is not there. | **Fixed.** The subtitle names the source: "pointés en ce moment" or "avec des heures saisies aujourd'hui". |
| E5 | A member without an e-mail showed "· Hors service". | **Fixed.** |

## Planning et paie: done

| # | Finding | Status |
|---|---|---|
| P1 | **"À payer · période" added a full month of base salary to one week of hours.** A 3 100 MAD/month employee showed 3 100 + the week's hours as due for 7 days. | **Fixed.** The base is prorated to the period's days (each day weighs 1/its month's length, so a full month is exactly 1 and a week across two months stays right). The subtitle says so: "base au prorata de 7 j + heures". |
| P2 | **Typing an hour summed every day ever stored.** The live refresh used `Object.values(row)`, so a member with 10 h last week showed 18 h after 8 h were typed this Tuesday, and the tiles followed. | **Fixed.** It totals the displayed period only, and the four tiles share one computation with the render. Verified: 8 h, 160 MAD, À payer 860 = 700 + 160. |
| P3 | An empty week read "1 conflit à résoudre · 2026-10-05 · Aucun service ni jour de repos n'a été saisi". | **Fixed.** "Rien de planifié pour l'instant", no date. Publishing an empty plan stays blocked. Other issue rows read "lun. 05/10", not ISO. |
| P4 | Tiles, "Coût prévu" and "Salaire calculé" read 0 MAD with no salary or rate entered. | **Fixed.** "·", with "aucun salaire ni taux horaire renseigné". |

Covered by `tools/team-truth-test.mjs`.

## Open, logged for their own pass

- **Programmatic `<select>` changes.** `kiwi-select.js` repaints only on a
  `change` event. Any code that sets `select.value` without dispatching one
  shows the old choice. E2 handles its own case. Others may exist.
- **Plan "Tours".** A table still seated counts as a turn. It is defensible,
  but say "en cours" if we keep it.
- **Sidebar "Clients & Marketing".** The page holds no marketing (campaigns
  are off). Rename, or ship the campaigns.
- **Invoice prompt.** Its labels have no `for`/`id`.
- **Till ticket numbering after C4.** A contaminated shift keeps its
  `kdsOrderSeq` (53 and up) until the service is closed. Not rewritten, since
  those numbers may already be printed.

## Inventory · next features

Dashboard: ~~Accueil~~ · ~~Commandes~~ · ~~Rapport journalier~~ · ~~Clients~~ ·
Fidélisation · Terminaux · Conformité · ~~Équipe~~ · ~~Planning~~ · Réservations & RDV ·
Menu & modificateurs · Stock & approvisionnement · Marges & budget.

Other surfaces: the till (restaurant and the 14 `pos-*` verticals) ·
kiwi-serveur · kiwi-cuisine · employee app · booking.html · kiwi-order.html ·
kiwi-report.html · support/tickets.
