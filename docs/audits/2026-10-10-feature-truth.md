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

## Open, logged for their own pass

- **Sidebar badges.** "Équipe 0" shows next to a 3-member team, and "Plan de
  salle LIVE" shows with no till connected. Each badge needs to say what it
  counts or drop the claim.
- **Sidebar "Caisse connectée" chip.** It reflects local pairing memory, so it
  stays green while the plan correctly says "Caisse hors ligne". The two
  should agree; the chip could read the same `tillSeen`.
- **Équipe form.** Picking the job "Serveur" leaves the department on
  "Cuisine". The department should follow the job.
- **Plan "Tours".** A table still seated counts as a turn. It is defensible,
  but say "en cours" if we keep it.

## Inventory · next features

Dashboard: Accueil · Commandes · Rapport journalier · Clients & Marketing ·
Fidélisation · Terminaux · Conformité · Équipe · Planning · Réservations & RDV ·
Menu & modificateurs · Stock & approvisionnement · Marges & budget.

Other surfaces: the till (restaurant and the 14 `pos-*` verticals) ·
kiwi-serveur · kiwi-cuisine · employee app · booking.html · kiwi-order.html ·
kiwi-report.html · support/tickets.
