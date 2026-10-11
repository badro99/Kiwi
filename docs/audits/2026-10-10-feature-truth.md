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

## Réservations & RDV: done

Run end to end on a fresh store: template, online booking switched on, hours
set, a TEST KIWI booking from the public page in a Europe/Berlin browser, a
staff booking from the dashboard, then both cancelled through the product
(staff lifecycle and the customer's manage link).

| # | Finding | Status |
|---|---|---|
| R1 | **The public page showed slots on the visitor's clock.** From Berlin or Paris, an 11:00 table in Casablanca read 12:00, and the first slot of a 09:00 opening read 10:00. The customer would arrive an hour late. | **Fixed.** Labels, slot grouping, the date strip and the default day all use Africa/Casablanca, the zone the API computes in. Verified: 09:00 first slot and "lundi 12 octobre à 11:00", stored as 10:00Z. |
| R2 | **The dashboard did the same.** The agenda listed that booking at 12:00, and a time typed in the staff form landed an hour off. | **Fixed.** Labels, the day boundary, the header date and the form's datetime-local are read and written in venue time. Verified: "lun. 12 oct., 11:00"; a staff 16:15 stored as 15:15Z. |
| R3 | **No staff booking could be saved once opening hours were set.** `KiwiHours.periodsOn()` returns `{periods, exception}`; the check read it as an array, found no length, and answered "Ce créneau vient d'être pris", whatever the agenda held. | **Fixed.** Verified: Tuesday 11:00 on an empty agenda was refused before, a booking today at 16:15 saves now. |
| R4 | Online booking with no hours set: the public link offered fourteen empty days, while the dashboard said "Réservation en ligne ouverte". | **Fixed.** The API reports `hoursSet`; the page says "Cet établissement n'a pas encore publié ses horaires de réservation", and the badge reads "En ligne · aucun créneau, horaires à renseigner". |
| R5 | The open page never saw an online booking arrive. | **Fixed.** It re-reads the server every 30 s while on screen and visible. Verified: the booking and its cancellation both reached the open page without a click. |
| R6 | "Occupation 0 % · 5 équipe & ressources": a ratio of nothing to nothing. | **Fixed** outside hotels: "Personnes attendues", with "16 places en même temps". |
| R7 | The staff form opened on a blank "·" service when there was only one, and priced a free table "0 MAD". | **Fixed.** A single service is preselected; price 0 reads "Sans frais", as on the public page. |
| R8 | Two "Annuler" buttons in one form: one closes it, one cancels the booking. | **Fixed.** The second reads "Annuler la réservation". |
| R9 | "1 services", "1 tables". | **Fixed.** Singular forms. |

Covered by `tools/booking-truth-test.mjs`.

## Installation: done

| # | Finding | Status |
|---|---|---|
| O1 | **A store that finished setup without a reload kept writing into a refusal.** The subscription gate reads identity once, at load, when the account was not yet onboarded. Finishing the wizard in the same page left it in "installation" mode: a pending store's saves went out, the server refused every one (401), and the screen said "Paramètres enregistrés", then "En ligne" for a booking link that answered "booking-closed". | **Fixed.** Entering the dashboard from the wizard tells the gate. Verified on a fresh signup: the "Prêt à ouvrir" pill appears without a reload, and the first edit opens the panel instead of a false save. |
| O2 | "Vous êtes combien ? 3", then the codes step offered the same rows whatever the number. | **Fixed.** One row per person announced (up to four), never erasing a row already filled. |

Covered by `tools/onboarding-truth-test.mjs`.

## Menu & modificateurs: done

Run end to end: a section, an item at 14,50, an options group "Lait" (oat
milk +3), attached; sold at a freshly paired till for 17,50 with the option;
price changed to 16 and the item marked 86, then put back on sale from
"Alertes 86", both with the till left open.

What held: the menu reached the server (`menus`), the till showed the item
and its options, the cart and the stored sale line carried "(Lait d'avoine)"
at 17,50, the price change and the 86 reached the open till without a
reload, and Performance read the one real sale (17,50, profit "·" until a
recipe gives a cost).

| # | Finding | Status |
|---|---|---|
| M1 | **With its only item marked 86, the till said "Carte pas encore composée · Ajoutez vos catégories et vos plats".** It sent the cashier off to rebuild a menu that exists. | **Fixed.** "Le seul article de la carte est indisponible" (or "Les N articles…"), "Marqués 86 depuis le tableau de bord · Menu". A truly empty menu keeps its old message. |
| M2 | "1 catégories · 1 articles" on the till, and "7 catégories · 35 articles" hard-coded until the menu rendered. "1 articles", "1 tickets", "0 remboursements", "1 articles vendus" on the dashboard. | **Fixed.** French singular for 0 and 1, from a `key1` rule in the workspace's `ui()`. |
| M3 | "14,5 MAD" on the dashboard against "14,50 MAD" on the till. | **Fixed.** Two decimals when there are any, none for a round price. |
| M4 | With a section created, the empty menu still said "Créez une section" and offered to create another. | **Fixed.** "Vos sections sont prêtes. Ajoutez votre premier article." with "Ajouter un article". |
| M5 | The button that opens a group's full editor (choices, surcharges) read "Renommer". | **Fixed.** "Modifier les choix". |

Covered by `tools/menu-truth-test.mjs`.

## Stock & approvisionnement: done

Run end to end: an empty restaurant store, then one article "Lait TEST"
(10 L at 9 MAD/L, par 6, reorder at 4) and a recipe for "Café crème TEST"
(0,15 L, then 0,2 L). Café crèmes were sold at an open till, and the edit
to 0,2 L was made while the till stayed open.

What held: the article and the recipe reached the server (`stock`,
`recipes`, `costs`). Once the till held the recipe, a sale wrote one
`inventory_movements` row against the milk (−200 milli, at 9 MAD/L), and the
Stock page read 9,8 L, valued at 88 MAD. The edited recipe reached the open
till without a reload.

| # | Finding | Status |
|---|---|---|
| S1 | **A café crème sold after its recipe was saved took no milk out of stock.** The movement landed on the dish itself (`it_2`, −1). The till first opened the recipe document (`costs`) at its first sale, from inside `inventory-consumption.js`. A till with no local copy (a new tablet, cleared storage) sold that first dish against an empty copy, and `caisse-refresh.js`'s 30 s `pullAll()` didn't know the document existed until then. | **Fixed.** The till opens it at startup and at pairing; the 30 s refresh keeps it current from there. A sale within 30 s of a recipe edit still uses the previous version. |
| S2 | **Theoretical usage counted one café crème out of three.** `salesFor` matched `line.id`, but till lines carry `itemId`. A dish sold with an option ("Café crème (Lait entier)") then failed the name test too. The recipe's "vendus" count read low the same way. | **Fixed.** It matches on `itemId`. The name is a fallback only for lines that carry no id. |
| S3 | **"Ratio coût matière : 15,7 %" for 3,6 % real.** The week's recipe cost was scaled to a month (×4,33), divided by 4 for display, then compared with 30 days of real sales. | **Fixed.** For a real store: the week's cost against the same week's sales. Measured after the fix: 5 MAD, 10,9 % (3 × 0,2 L × 9 MAD against 49,50 MAD). |
| S4 | "Standard restauration marocaine : 28-32 %", an unsourced "Moroccan standard". | **Fixed.** The tooltip says what is computed, then "Repère courant en restauration : 28 à 32 %". |
| S5 | With nothing tracked: "0 MAD · ratio 0,0 %" against real sales, "Tous les niveaux sont sains", a four-week trend chart with no history behind it, and a food cost that moved ±0,5 % on a timer. | **Fixed.** "·" with "Aucun coût matière connu", "Aucun article suivi". No trend chart and no timer for a real store. |
| S6 | "paiement T+15 à T+30 sur la majorité" under the supplier count, for a merchant with no suppliers. "1 articles en stock", "1 articles suivis · 0 fournisseurs actifs". | **Fixed.** Invented terms removed, and the singular used for 0 and 1 (FR/EN/AR). |
| S7 | Home: "2 articles sont au-dessus de son seuil". | **Fixed.** "de leur seuil". |

Covered by `tools/stock-truth-test.mjs`.

## Marges & budget: done

Run on the same store: one product with a complete recipe (1,80 MAD), three
sales totalling 49,50 MAD.

| # | Finding | Status |
|---|---|---|
| F1 | **For a real store the page was only a waiting screen, and its one number was wrong.** "Chiffrez votre carte, et vos marges se calculent · 1 produit sur 1 reste à chiffrer", while the Home margin tile showed 89 % for that same product. It counted only costs typed by hand and ignored recipes. When everything was costed it said "Vos marges apparaissent sur le tableau de bord" and still showed nothing. | **Fixed.** A real page on the same engine as Home (`KiwiCost.coverage`, Home's business-day bounds). Period: today, 7 days or 30 days. Sales, the costed share, material cost, gross margin, what to cost first (ranked by revenue), and each product's price, cost (with its source), unit margin and units sold. Measured: 49,50 MAD, 100 % costed, 5,40 MAD, 44,10 MAD (89,1 %). |
| F2 | The page's notes say what the margin covers: the costed share, sales with no item detail, "Avant loyer, salaires et charges : Kiwi ne les connaît pas". | **New.** No budget, break-even or targets for a real store: Kiwi knows none of them. |

Covered by `tools/cost-margin-test.js` (renders the page against the real
`cost.js`).

## Fidélisation: done

Run end to end: the module switched on, a customer "TEST KIWI Client"
created at the till with consent, and two café crèmes sold to them, the
second with the dashboard page left open.

| # | Finding | Status |
|---|---|---|
| L1 | **The page never showed a customer attached at the till.** It read this browser's copy of the customer book once, when it opened, and never pulled or subscribed. With the till at the counter: "Aucun client identifié pour l'instant", 0 réguliers, while the server already held the customer and their visit. | **Fixed.** Like the Clients directory, it pulls the shared book on open and repaints on each change (the book re-reads the server every 15 s). It never repaints while a field has focus or on the offers tab, whose draft lives only in the form. Measured: the second sale showed up on the open page with no reload. |
| L2 | **"Régulier" after a single visit.** | **Fixed.** A recent first visit is its own group, "Première visite", with its own tile shown only when it has someone in it. It gets no offer or suggestion. After `regularDays` without a return it becomes "vient moins souvent", as before. |
| L3 | **"Fidélité 0 / 10" with the loyalty card off.** It described a card the customer never had. | **Fixed.** "·" when no loyalty programme is on. |
| L4 | Suggested discounts are capped by "Marge brute moyenne", a figure the owner types (60 % by default) while Kiwi measures the real one. | **Improved.** The measured 30-day margin and the share of sales it covers are shown under the field, never copied into it. |

Covered by `tools/customer-retention-test.mjs`.

## Terminaux & Conformité: done

Operator modules, off for a new store. Measured through the real operator
console on the local stack: switch each module on, then use it as the
merchant with real clicks; switch it off and try every way in (sidebar,
⌘K, the home card, a direct handler call).

| ID | Finding | Status |
|---|---|---|
| T1 | **A module switched off still opened.** The gate wrapped `nav-terminaux` and `nav-conformite` once, then `operations-ui.js` and `conformite.js` reassigned them, unguarded. | **Fixed.** The gate sits on the property (accessor), so a later assignment is guarded too, and `featureOff` is read on every call. Re-verified in the browser at `merchant-config.js?v=278`: both handlers carry the gate and open nothing; an enabled page (Stock) still opens. `module-gate-test.mjs`. |
| T2 | The `terminaux` alias pointed at `nav-terminals`, a handler that never existed. | **Fixed.** It covers `terminal-catalog` and `add-terminal`. |
| T3 | The till and the dashboard on one machine shared a device id and overwrote each other: the till never appeared as its own row. | **Fixed.** The dashboard's id is suffixed `:web`. Measured: two rows. |
| T4 | The dashboard was listed as equipment and raised "appareil muet" once its tab closed, one false alarm per browser ever opened. | **Fixed.** A dashboard never alarms, and is listed only while it beats. |
| T5 | "Test d'impression" reused a heartbeat up to five minutes old, or did nothing. | **Fixed.** It forces a fresh heartbeat; with no printer it says so. |
| T6 | Rows showed raw ids, with no way to name a device. | **Fixed.** A readable default ("Mac · Chrome") and a rename kept in its own column, so the heartbeat never overwrites it. |
| T7 | No view of the print bridges. | **Fixed.** "Ponts d'impression" with the real paired state; "En ligne" means seen in the last 45 s. |
| T8 | Unpair one device. | **Open.** The till token carries no device identity, so a per-device unpair would be fake. Pairing and revoke stay on the till. |
| C1 | Conformité for a real store. | **Verified honest.** An empty card, no invented Z history, HACCP or certificates; the demo drawers are unreachable for a real merchant. |

Covered by `module-gate-test.mjs` and `terminaux-truth-test.mjs` (14 of 17 fail on the old code) and `operations-system-test.mjs`.

## Small items, closed

| Item | What it said | Now |
|---|---|---|
| Small food costs | Stock rounded 5,40 to "5 MAD" (1,80 to "2 MAD"); Marges showed 5,40. | Amounts under 1 000 MAD keep their centimes, larger ones stay whole. Covered in `stock-truth-test.mjs`. |
| "Récompense fidélité" offer | Selectable with the loyalty card off. | Disabled, with a note, unless the card is on (or it was already chosen). Covered in `customer-retention-test.mjs`. |
| Sidebar "Marges & budget" | A store has margins, no budget. | "Marges" in FR, EN, AR, the breadcrumbs and the assistant. |
| Sidebar "Clients & Marketing" | The page holds no marketing while campaigns are off. | "Clients", unless `ultraCampaigns` is on. |
| Opening-hours status | A closed Sunday read "Ouvre à 09:00". | "Ouvre demain à 09:00" when the next opening is tomorrow. Covered in `booking-truth-test.mjs`. |
| Booking copy | "gérer ce rendez-vous" for a table. | "gérer cette réservation". |
| Item price field | `type=number` without `step`: 14,50 was a step mismatch. | `step="0.01"`, `inputmode="decimal"` on prices and choice surcharges. |
| Invoice prompt | Labels with no `for`/`id`. | Each label names its input. |
| Opening hours on the phone's clock | `hours.js` judged "open" by the device clock. The public order page disables "Envoyer" on it: a phone left on Paris time saw a restaurant open until 19:00 as closed from 18:00 Casablanca time ("Ouvre Lundi à 09:00"). | The engine reads Africa/Casablanca whatever the device zone, and returns true instants. FR day names are lower case mid-sentence. Covered in `booking-truth-test.mjs`, run under Paris, New York and Casablanca. |
| Plan "Tours" | A table still seated counted as a turn: four seated tables read "4 tours" before anyone left. | A turn is a visit that ended. Seated tables read "en cours" beside it ("1 tour · 2 en cours"). Covered in `floor-live-test.mjs`. |
| Programmatic `<select>` changes | `kiwi-select.js` repainted only on `change`: code that set `select.value` left the old choice on screen while the form sent the new one. | Each enhanced select repaints on its own `value` / `selectedIndex` assignments. Covered by `kiwi-select-programmatic-test.mjs` in a real Chrome (red on the old file). |
| Booking "Supprimer" | Logged as a hard delete. Measured: it deleted nothing, it set the booking to "annulée", the same as "Annuler la réservation" right below it. | The duplicate button is gone; cancelling has one name. |
| Booking settings checkboxes | Logged as "accessible name on". | Measured again: each sits inside its label. Not a bug. |

## Open, logged for their own pass

- **A dish sold without a recipe** writes a −1 movement on the dish's own
  id (`it_2`), an id no stock article carries. It is right for retail, where
  the product is the stock article, and noise for a restaurant dish.

- **Till opening float.** "Fond d'ouverture" opens with 500 MAD
  preselected. A till opened without counting records 500 MAD nobody
  counted, which the cash reconciliation then expects. For the till pass.
- **86 items vanish from the till grid** when others remain. Common in POS,
  but a greyed "86" tile would let the cashier tell the customer.

- **What a pending store may save.** `entitlements-v2.js` says configuring
  (a dish, a room) is not held back during installation, but the server
  refuses every `store_docs` write from a pending store. The wizard's own
  team roster and floor plan are therefore kept on the device, marked
  unsynced, and only reach the server after activation. Measured: they did,
  on the same browser. On another device they are missing until then.
  A product decision, not a bug to patch quietly.
- **Hotel occupancy tile.** Still a formula nobody chose. Out of R6's scope.

- **Till ticket numbering after C4.** A contaminated shift keeps its
  `kdsOrderSeq` (53 and up) until the service is closed. Not rewritten, since
  those numbers may already be printed.

## Inventory · next features

Dashboard: ~~Accueil~~ · ~~Commandes~~ · ~~Rapport journalier~~ · ~~Clients~~ ·
~~Fidélisation~~ · ~~Terminaux*~~ · ~~Conformité*~~ · ~~Équipe~~ · ~~Planning~~ · ~~Réservations & RDV~~ ·
~~Menu & modificateurs~~ · ~~Stock & approvisionnement~~ · ~~Marges & budget~~.

\* Operator modules, off for a new store (`merchant-config.js`): a merchant
never reaches them until the console switches them on. Audit them that way.

Trade dashboards (destinations other trades see, from `venues.js`):
retail (inventory, categories, promos, returns, sold, credit, suppliers) ·
appointments (services, practitioners, appointments, chairs, packages,
renewals, formulas) · pressing (orders, workshop, services, quality, pickup,
delivery) · specialty (prescriptions, insurers, expiries, duty, school lists,
book orders, flower orders, freshness, vehicle, points of sale, quotes,
deposits, waste, economat, workflows, delivery) · hotel (chambres, séjours,
folios, check-ins, ménage, canaux, tarifs, hotel intel).

Other surfaces: the till (restaurant and the 14 `pos-*` verticals) ·
kiwi-serveur · kiwi-cuisine · employee app · ~~booking.html~~ · kiwi-order.html ·
kiwi-report.html · support/tickets.
