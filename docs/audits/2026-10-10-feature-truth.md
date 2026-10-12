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

## Caisse (restaurant): done

Measured on the local stack with real clicks: open a service, ring
take-away and table bills, split equally, discount, refund, close the Z, and
compare the till, D1 and the dashboard's Rapport journalier.

| ID | Finding | Status |
|---|---|---|
| K1 | **"Fond d'ouverture" opened with 500 MAD preselected.** A till opened without counting expected 500 MAD nobody counted. | **Fixed.** A real store has nothing preselected; the till opens once a chip or an amount (0 counts) is chosen. The last float is a tap-to-use hint. |
| K2 | **"Carte" booked the sale by itself** two seconds after "Approchez la carte", with no reader attached. | **Fixed.** Without a reader the till says "Faites payer sur votre terminal, puis confirmez"; only the cashier's confirmation writes the sale. |
| K3 | The Z read "À 2 % de l'objectif", against an 18 000 MAD goal nobody set. | **Fixed.** "X MAD encaissés sur ce service". |
| K4 | A take-away discount of 5,70 MAD read "Réductions accordées 0" on the Z; a code entry after a reload reset discounts to 0. | **Fixed.** Counted from the sale itself; reset only when no service is open. |
| K5 | "Moyenne table" was revenue ÷ transactions, shown with zero tables. | **Fixed.** "Ticket moyen" (FR/EN/AR). |
| K6 | **Each equal-split part counted the whole dish**: 8 dishes read 11 on the Z, and stock would leave three times. | **Fixed.** Each part counts 1/N; the receipt still reads "1× … · 1/3". |
| K7 | A sold-out (86) dish vanished from the grid. | **Fixed.** A greyed "Épuisé" tile that adds nothing. Tile prices now read "14,50 MAD", not "14.5 MAD". |
| K8 | A dish without a recipe wrote a −1 movement on its own id. | **Fixed.** Direct movements only for articles the ledger knows (retail products are seeded on creation). |
| K9 | **Rapport journalier dropped every split part after the first split of the day**: net 444,24 instead of 650,91. The feed carries no `id`, and "À emporter · part 1" collided. | **Fixed.** Sales are keyed by the server `saleId` (report and export). Measured: 650,91 MAD and 13 transactions, as in D1 and the till. |

Verified honest: change and tip arithmetic, refunds to D1, cash moves,
no-sale with no printer, Z reconciliation `matched`. Covered by
`till-truth-test.mjs`.

## Commande QR et rapport mensuel: done

| ID | Finding | Status |
|---|---|---|
| Q1 | **A 14,50 MAD café was charged 15**; "Grand +3" came to 18 instead of 17,50. The relay rounded every price to the dirham. | **Fixed.** `priceOrder` and the queue count in centimes. Phone, server, till and sale all read 17,50. |
| Q2 | **Every dish with a required option was refused** ("carte modifiée"): the page sent text only, and supplements were never charged. | **Fixed.** It sends `{group, choiceId}` and an idempotency ref; price comes from the published menu. |
| Q3 | "Un serveur arrive" and "Addition demandée" sent nothing. | **Fixed.** Both write to `/api/order/session`; a table missing from the plan says so. |
| Q4 | "Prêt dans 4–6 min" was hard-coded and the progress bar a timer. | **Fixed.** The page shows the real order status. |
| Q5 | With Order Pro off, "+" and "Envoyer" stayed live and failed. | **Fixed.** Ordering hidden, with a banner. |
| Q6 | Opening hours on the phone's clock. | **Fixed.** `/api/menu` publishes the store's zone; `hours.js` takes an explicit zone, else the till-declared zone (`KiwiConfig.timezone`), else Casablanca. A store outside Morocco reads its own clock. |
| Q7 | A default 15 % tip was added to "Total à régler" and recorded nowhere. | **Fixed.** 0 for a real store. |
| Q8 | Every merchant's page was titled "Café Atlas"; a raw `opt_label_og_4` label showed. | **Fixed.** |
| Q9 | Monthly report: basket on net, not gross as in Rapport journalier; amounts rounded to the dirham; "1 ventes". | **Fixed.** |

Verified honest: the order reaches "Commandes clients" and "Encaisser" books
it at 17,50; "Paiement à la caisse", no online payment claimed; the report
is operator-only. Covered by `order-truth-test.mjs`.

## Verticales POS (14): done

A static sweep listed 99 leads; two passes re-measured each one on a paired
till of every trade.

| ID | Finding | Status |
|---|---|---|
| V1 | **Real tills showed demo books**: stock, expiry lots, duty rota, doctors, school lists, truck spots, classes, "247 membres", MRR, bouquets. Autosave then wrote them into the merchant's own record. | **Fixed.** Real sessions start empty; old saved docs carrying demo data are guarded. `vertical-state.js` no longer marks itself hydrated before the terminal is real. |
| V2 | **Hotel extras posted demo prices** (Hammam 280 MAD) to real folios. | **Fixed.** The price is typed per posting; zero disables the button. |
| V3 | Untracked stock read as zero: whole shelves "épuisé". | **Fixed.** "Non suivi". |
| V4 | Prices lost their centimes (12,50 → 13). | **Fixed** (pharmacie, épicerie). |
| V5 | "Réseau de retour, tout est synchronisé" after a hand-flipped toggle. | **Fixed.** `navigator.onLine` plus the real sale queue (`KiwiVerticalNet`). Demo keeps its simulation. |
| V6 | "✓✓" delivered ticks on unsent WhatsApp drafts. | **Fixed.** "Brouillon, pas encore envoyé". |
| V7 | Librairie "Scanner ISBN" printed a random demo title; pharmacie scan, call and wholesaler list were fake. | **Fixed.** The real scanner, `tel:` and a real list. |
| V8 | Ticket counters started at demo numbers (2480, 4821…). Fast-food "commandes / heure" put every order at 13h. | **Fixed.** Start at 1; the chart is built from real sale times. |
| V9 | "Annoncé au micro" with no speaker. | **Fixed.** Speech synthesis, and says so when the device cannot speak. |
| V10 | Traiteur quotes printed fixed 30/50/20 % terms. | **Fixed.** Editable per quote. |
| V11 | Coiffure did not open at all (`TIP_LEDGER` read before its declaration); its 40 % commission was invented. | **Fixed.** Commission "à définir" until set. |
| V12 | Gym, coiffure and spa counts ignored the 5 h business day. | **Fixed.** |
| V13 | Plurals ("1 achats", "1 pièces"), an em dash and four emojis in Maison labels. | **Fixed.** |

Covered by `pos-truth-a-test.mjs` and `pos-truth-b-test.mjs`.

## App employé et support: done

| ID | Finding | Status |
|---|---|---|
| W1 | **A removed employee kept her login.** The server refused the empty roster and the union merge brought her back. | **Fixed.** Removals are tombstones (`removed: [{id, ts}]`) kept by the server; login and session honour them. Measured: the open app returned to login within 9 s. |
| W2 | 6 digits showed "Arrivée autorisée" before the server compared the code. | **Fixed.** "Code saisi · il sera vérifié au pointage". |
| W3 | The attendance code had no attempt limit. | **Fixed.** The login limiter: 8 wrong codes give 403, then 429. |
| W4 | Every failure said "Email ou code personnel incorrect". | **Fixed.** One message per cause, FR/EN/AR; a 401 closes the session. |
| W5 | Worked hours counted breaks. | **Fixed.** |
| W6 | "Prochain service" looked only at the displayed week, on the phone's clock. | **Fixed.** 14 days, venue time. |
| W7 | "Planning & demandes" ignored polls: approved leave showed after a reload only. | **Fixed.** |
| W8 | The till's "Copier le message" button sent the message; "1 serveurs". | **Fixed.** |
| S1 | Help centre promised "a tracked request"; the merchant could never see one. | **Fixed.** "Vos demandes" lists them. |
| S2 | The help hero's text was invisible on its green card. | **Fixed.** |

Verified honest: planning draft/published, no pay figure in `/api/employee`,
the ticket confirmation copy. Covered by `employee-truth-test.mjs`.

## Serveur et cuisine: done

| ID | Finding | Status |
|---|---|---|
| SV1 | **A cash sale was recorded at "Fermer", not at "Confirmer".** The sheet said "Espèces confirmées" first; an app closed, a locked phone or a call between the two taps and the cash taken existed nowhere. | **Fixed.** "Confirmer" posts the sale and shows the success step only once the server agrees; a refusal keeps the sheet on the amount. "Fermer" only closes. Split parts follow the same rule. |
| SV2 | The table timer counted from when the phone first saw the table. | **Fixed.** It reads the session's `opened_ts`. |
| SV3 | The "Espèces confirmées" step could paint under the amount step (`.cash-grid` ignored `[hidden]`). | **Fixed.** |
| SV4 | Outside the demo, the card sheet approved itself after a delay, with an invented "TXN #KW-" number; a tap on the backdrop while waiting settled the table. | **Fixed.** The waiter confirms "Paiement reçu"; the backdrop closes without paying; the TXN number exists in the demo only. |
| SV5 | "Ticket" and "SMS / WA" buttons toasted "Ticket en impression…" and "Envoyé" and did neither. | **Removed.** |
| SV6 | "Flous reçu" in the French UI. | **Fixed.** "Montant reçu", FR and EN. |
| SV7 | The shift tally (tables, revenue) reset on reload. | **Fixed.** Kept per service, reset at the next one. |
| SV8 | A freed table kept its old cover count. | **Fixed.** |
| K1 | The kitchen's link badge said "Comptoir lié"; the pass reads the server, not the counter. | **Fixed.** "En ligne", FR/EN/AR. |
| K2 | An offline "Je prends" / "Prête" lived in memory: a reload or an iOS recycle lost it, and the ticket came back "en cuisson". | **Fixed.** The queue is stored per merchant and replayed; a gesture older than the service is dropped. |
| K3 | The till's kitchen drawer was titled "Servies aujourd'hui" for tickets that were ready, not served. | **Fixed.** "Prêtes aujourd'hui". |
| K4 | "God Mode" in front of the brigade and the cashier; a promise that orders "continue to print normally" with no printer known. | **Fixed.** Neutral copy, FR/EN/AR, no printing claim. |
| Q10 | **A QR order was accepted when the till had never been seen.** `deskOpen` let a merchant whose till never polled take orders: the customer read "commande envoyée" into a queue nobody reads, since the till is what reads it. | **Fixed.** Never seen means closed; only a missing `order_desk` table (migration not run) still lets orders through. |

Covered by `serveur-kitchen-truth-test.mjs` (SV1 runs the real confirm
handler: one sale, success only after the server, none on refusal) and
`orderpro-relay-test.js` (Q10).

## Commerce de détail (dashboard): done

| ID | Finding | Status |
|---|---|---|
| R1 | Épicerie, pharmacie, librairie, fleuriste and "autre" read "base partagée avec la caisse", "disponible en caisse", "Synchronisé avec la caisse". Only the boutique and maison tills read that catalogue. | **Fixed.** Decided on the trade, not the base type (which is "boutique" for all of them). |
| R2 | A real merchant was shown "(code 0002)", the demo till's code. | **Fixed.** Demo only. |
| R3 | "Valeur du stock" summed cost for costed products and sale price for the rest, under one label. | **Fixed.** No costs: "au prix de vente, coûts non saisis". Partial: the cost of the costed products only, "2 produits sur 3 au coût d'achat". Complete: cost, with the potential. |
| R4 | A promotion on "Divers" (uncategorised) matched no article. | **Fixed.** |
| R5 | "Les couleurs de catégorie apparaissent aussi en caisse": false. | **Fixed.** Says what is true, where it is. |
| R6 | "1 variantes", "1 couleurs", "0 pièces", "1 dernières", "ses 1 variantes". | **Fixed.** |
| R7 | A 14,50 MAD return showed "15". | **Fixed.** |
| R8 | "Marges" sent retail merchants to a "Marge brute" tile their band does not offer. | **Fixed.** FR/EN/AR copy says where the purchase price is used today. |
| R9 | "Ventes aujourd'hui" on trade pages counted from device midnight and included refunds. | **Fixed.** 5 h business day, refunds excluded. |
| R10 | Vendus counts gross sales. | **Disclosed** in its subtitle; netting returns is open. |

Covered by `retail-truth-test.mjs`.

## Hôtel (dashboard): done

| ID | Finding | Status |
|---|---|---|
| H1 | **The band showed "Occupation 0,0 % · ADR 0 · RevPAR 0 · 0 / 0", hard-coded.** Two rooms sold out of eight read 0 %. | **Fixed.** New `GET /api/hotel/performance` computes them from `hotel_reservations` and the `rooms` document (owner session or named operator only, never a paired till). Unknown is "·", loading is "…", never 0. Matched against independent SQL on the local stack for Hier, Aujourd'hui, 7 and 30 jours. |
| H2 | Deltas compared different slices. | **Fixed.** The previous window of equal length, same formulas. |
| H3 | The band's range used device midnight. | **Fixed.** Business day. |
| H4 | The band did not move after a stay was created or changed. | **Fixed.** On stay events and every 30 s while visible. |
| H5 | Ménage read 0. | **Fixed.** Real room states; "·" when no room is declared. |
| H6 | Réception strip, Tarifs ("ADR, RevPAR s'activent ici"), Intelligence hôtel and the Folios tiles were empty or claimed what was not measured. | **Fixed.** Same definitions as the band. |
| H7 | Réservations' hotel occupancy tile was a formula nobody chose. | **Fixed.** Uses the shared figures. |
| H8 | Canaux: "Réservation directe" always said "non connectée". | **Fixed.** Says whether the booking link is open. |
| H9 | ISO dates shown to the receptionist; "1 nuits". | **Fixed.** |
| H10 | The hotel till's folio list threw when a stay's room had been deleted. | **Fixed.** Covered in `pos-truth-b-test.mjs`. |

Definitions (in `functions/api/hotel/_performance.js`): sold = confirmed,
checked in or completed; ADR = revenue over priced nights; RevPAR = revenue
over active rooms × days; a 0 MAD stay is unpriced, not a nil rate; no room
inventory gives no occupancy. Covered by `hotel-truth-test.mjs`.

## Pressing (dashboard and till): done

| ID | Finding | Status |
|---|---|---|
| P1 | Accueil "Dépôts" and "Bon moyen" counted payments: tickets of 226, 64 and 90 MAD read "2 dépôts · 57 MAD". | **Fixed.** Counted from the tickets by drop-off date, cancelled excluded: "3 · 62 MAD" after one cancellation. |
| P2 | **A balance payment reused the deposit's sale ref, so the server dropped it as a duplicate: revenue short.** | **Fixed.** Its own ref (`…-S3050`); both rows in `sales`. |
| P3 | Dashboard "Annuler" wrote in the browser only (the server answered 409); the till kept the order alive. | **Fixed.** `/api/pressing/cancel` accepts the signed-in owner (or a named operator) without a till code. |
| P4 | Card headers used undefined classes: giant black icons. | **Fixed.** |
| P5 | Services editor: 12,50 refused, "dès 12.5 MAD", "0 traitements", dry-clean items shown "À la caisse". | **Fixed.** |
| P6 | Real stores numbered tickets from the demo's 1045. | **Fixed.** |
| P7 | Historic dry-clean lines vanished on reload. | **Fixed.** |
| P8 | Plurals, "Retiré" vs "Remis". | **Fixed.** |
| P9 | Quality, Services, Delivery, Workshop pages and the assistant promised photos, rework, rounds and supplements that do not exist. | **Fixed.** The copy says what the product does. |
| P10 | Times on the device clock; "today" from device midnight. | **Fixed.** Venue zone, business day. |
| P11 | Pressing customers never reached the Clients book. | **Fixed.** |
| P12 | Pages never refreshed while open. | **Fixed.** Every 20 s while visible. |
| P13 | Dashboard French only. | **Fixed** (FR/EN/AR); the till and catalogue editor stay French. |

Measured on a local stack with a pressing signed up through onboarding and a
paired till. Covered by `pressing-truth-test.mjs` (66 checks, red on the old
code). Open: cancelling a paid order refunds nothing (the prompt says so); the
pressing till and catalogue editor are French only.

## Support: tri automatique (Clef): done

| ID | Finding | Status |
|---|---|---|
| T1 | A ticket was "urgent" only when a regex matched "paiement" or "bloqu": darija and Arabic were invisible. | **Fixed.** `@cf/cloudflare/clef-flash` answers category, urgency and the probability that the merchant cannot sell, after the ticket is written, never blocking it. A screenshot re-triages it. Quota 60 per merchant per day. |
| T2 | No alert to Kiwi staff on a new ticket. | **Fixed, opt-in.** One e-mail per ticket via `MAIL_WEBHOOK` when `SUPPORT_ALERT_EMAIL` is set; the console shows "sent", "unconfigured" or "failed". |
| T3 | The console showed no category, urgency or confidence. | **Fixed.** Urgent first, probability shown, "à vérifier" under 60 %, "Non triée" when the model did not answer. |
| T4 | The merchant must never see the labels. | **Verified.** |

Measured on the real model on 2026-10-11 (31 synthetic tickets, FR, EN,
darija, AR): category 93.5 %, urgency 77.4 %, alert recall 90.9 % (10/11),
false alerts 20 % (4/20), inside the thresholds fixed before measuring.
The misses over-alert ("mot de passe oublié" read as blocking). Covered by
`support-triage-test.mjs`; `support-triage-eval.mjs` reruns the measure.

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
| Till "God Mode" toasts | Cash moves, drawer, refunds, handover and the maison catalogue told the cashier a module was off "dans la console God Mode", the operator console's internal name. | "… désactivé(e)s pour cet établissement", FR/EN/AR. Covered in `till-truth-test.mjs`. |
| Cancel or reopen from "Réimprimer" | The manager-code window and its refusals stayed in French on an English or Arabic till. | Translated. Covered in `caisse-lang-test.js`. |
| Day report top products | "1 plats" / "1 dishes". | Singular for one. Covered in `dashboard-truth-test.mjs`. |
| Day report payment header | Showed the gross above method rows that are net of refunds: 500 over rows totalling 450. | The header is the sum of its rows. Covered in `dashboard-truth-test.mjs`. |
| QR bill tip (OrderPro) | A 15 % tip was pre-ticked and added to "Total à régler", a total the till never sees: the phone sends no tip anywhere. "Le serveur arrive avec l'addition" promised a waiter; the split calculator toasted "Addition divisée". | No tip pre-selected; the sheet says the tip is handed to the waiter and is not added to the bill; "Demander l'addition"; the split result reads "À annoncer au serveur". FR/EN/AR. Covered in `order-truth-test.mjs`. |
| Booking settings checkboxes | Logged as "accessible name on". | Measured again: each sits inside its label. Not a bug. |

## Lecture d'images (IA vision): done

| ID | Finding | Status |
|---|---|---|
| V1 | Menu import and floor-plan import read photos with Llama 3.2 11B vision. Measured on real models: it read the menu but answered in Markdown instead of the requested JSON (3 % exact prices). That is not a call error, so the fallback never ran and the merchant saw "lecture impossible". | **Fixed.** GLM 5.3 Flash first, Gemma 4 26B as fallback, on all nine vision routes. |
| V2 | Every model got the same request shape. | **Fixed.** `_vision.js` builds each model's own payload (reasoning effort for GLM only, native shape for Llama). |
| V3 | No way to measure a model change before shipping it. | **Fixed.** `tools/ai-model-eval.mjs` scores synthetic menus and floor plans (`tools/fixtures/ai-eval/`) to the centime, with a dry mode for CI. |

Measured on 2026-10-11 (6 fixtures, 2 runs each, real Workers AI): GLM 5.3
Flash 100 % exact prices, PRIMARY-READY; Gemma 4 accurate when it answers
(0.965 to 1.000) but slow (median 41 s, one 120 s timeout), so fallback only;
Llama 0.078. Covered by `ai-vision-models-test.mjs` (62 checks) and
`menu-scan-test.mjs`.

## Analyse du menu, phase 1: done

The restaurant's "Marges" page becomes **Analyse du menu**: the overview it
already had (margins on the costed share of sales, products still to cost),
plus **Performance** and **Heures de pointe**, moved out of Menu &
modificateurs. That page now keeps only what configures the menu (Menu,
Traductions, Postes, Recettes, Nutrition, Alertes, NFC).

| ID | Change | How it stays true |
|---|---|---|
| MA1 | Nav key, console module key and owner-only gate unchanged (`finance`). Label "Analyse du menu" / "Menu analysis" / "تحليل القائمة" for the restaurant only; other trades keep "Marges". | A merchant's existing on/off setting carries over untouched. |
| MA2 | Performance and Heures de pointe are rendered by the same functions as before (`KiwiRestaurantMenuWorkspace.analysis`), not copies. | The performance, peak-hours and ledger-reconciliation suites run unchanged against the moved panels. |
| MA3 | An old link to either tab opens the analysis on that tab, through the owner gate. | A manager following it is refused, as on the page itself. |
| MA4 | Three tabs on the liquid lens; the period choice stays on the overview, Performance keeps its 30 business days. | The open tab is remembered; an unknown saved value falls back to the overview. |

Covered by `menu-analysis-test.mjs` (35 checks, red on the previous files).
Next phases: one margin engine with refunds and frozen line costs, revenue by
category and item over the six period presets, then Simple Food Cost as an
owner-only opt-in with its own storage (no stock, no movements).

## Analyse du menu, phase 0: one margin engine: done

Once the overview and Performance sat side by side, their two engines would
have shown two different margins for the same days.

| ID | Finding | Status |
|---|---|---|
| ME1 | The overview (`KiwiCost.coverage`) counted voided sales and settlements received twice, and never subtracted refunds (they live in `KiwiRefunds`). So did the morning briefing, the KPI margin and customer retention, which call it too. | **Fixed.** `KiwiCost.ledger()` is the one register: void out, duplicates out and declared, refunds subtracted from net and declared as not split by dish. `coverage()` is its summary. |
| ME2 | Performance ignored VAT: profit and margin were computed on prices including VAT, overstated by about the rate. | **Fixed.** Excluding VAT when the receipt includes it, and said on screen. |
| ME3 | Performance ignored costs typed by hand (flat) and ticket discounts. | **Fixed.** Same chain as everywhere: frozen line cost, recipe, flat, else unknown. Ticket discounts spread pro rata over their own ticket's lines, like the VAT base, and declared. |
| ME4 | Performance used the observed cost (7 days of stock usage) in place of the recipe cost when present. | **Fixed.** Theoretical (recipe) cost drives profit; the observed cost is shown beside it, never mixed in. |
| ME5 | Peak hours kept its own copy of the sales filter. | **Fixed.** Reads the same ledger lines. |
| ME6 | The cost source label was French only. | **Fixed.** FR / EN / AR. |
| ME7 | Today's cost applied to past sales was silent. | **Said.** The restaurant till does not freeze a cost on the line yet; both tabs say current costs are applied to past sales. Freezing at sale time is logged below. |

Covered by `menu-ledger-test.mjs` (26 checks: the ledger rules, then one
fixture rendered by both tabs, same 221 MAD).

## Analyse du menu, phase 2: sales by category and item: done

A fourth tab, **Ventes**, between the overview and Performance. It reads the
same `KiwiCost.ledger` as Performance, so gross and net agree to the centime
between the two tabs (asserted).

| ID | Rule | How |
|---|---|---|
| MS1 | Six periods, all in business days. | Today, yesterday, 7 and 30 days, this month (from the 1st at 05:00), last month (the whole previous calendar month). A sale at 04:59 on the 1st belongs to the previous month. Without `KiwiDayReport` the period is named without dates rather than dated wrongly. |
| MS2 | Money collected only. | Per line, VAT included, after the ticket discount spread over that ticket's lines. No cost, profit or margin on this tab. |
| MS3 | A formula keeps its price. | Its components add quantity only ("1 en formule"); average price divides by paid units. |
| MS4 | Nothing is attached by guess. | Off-menu and free-amount lines keep their names in their own rows, after the menu. |
| MS5 | Shares say what they are shares of. | Of item lines, with the total printed; refunds and amounts without item detail stay in the strip above. |
| MS6 | States. | Empty period, history still loading ("partial for this period"), offline, ledger missing (error, no figure). The chosen period is remembered per device. Phone: rows become labelled cards. |

Covered by `menu-sales-test.mjs` (31 checks, crashes on the previous code).

## Analyse du menu, phase 3: Simple Food Cost: done

An opt-in calculator, the "Coût simple" tab of Analyse du menu. It is not
inventory: nothing it does moves, reserves or counts stock.

| ID | Rule | How |
|---|---|---|
| SF1 | Opt-in, per store. | `features.simple_food_cost === true` only (console: "Options à la demande", off by default). Turned off: the tab disappears, the API stays readable, writes are refused, nothing is deleted. |
| SF2 | Owner or named operator, enforced on the server. | `functions/api/foodcost.js`: the account session that owns the store, or a named operator. A paired till, an employee, another account or a visitor get 403, read and write. Its own tables (`foodcost_sheets`, `foodcost_snapshots`), not the till-readable `costs` document. |
| SF3 | Unknown is never 0. | An empty price, quantity or an incompatible unit (ml of a product bought by the bottle) makes the line unknown; the total shows "au moins X" and the % is not computed. |
| SF4 | Honest maths. | Pack price ÷ pack qty × qty used (safe unit conversion) ÷ yield; food and packaging apart; batch ÷ portions; % on the price excluding VAT when VAT is included; "contribution", not profit; price for the target. |
| SF5 | Stale and frozen. | A purchase price older than 90 days is flagged; an undated one says so. Every save is a frozen version (who, when) that later menu or price changes never alter. |
| SF6 | No silent overwrite. | Each save carries the version it read; a newer one online returns 409 with who changed it, and the typed sheet is kept until the owner chooses. |
| SF7 | States and export. | Loading, empty, forbidden, error, read-only, offline (calculate, save later), conflict. Templates, duplicate, archive, CSV export with formula-injection guard. Typing only repaints figures, and live sales no longer redraw the form. |

Covered by `foodcost-api-test.mjs` (28) and `simple-food-cost-test.mjs` (42).

## Analyse du menu, phase 4: contribution and "À faire": done

| ID | Finding | Status |
|---|---|---|
| MC1 | Performance called price minus food cost "profit brut" / "gross profit" / "الربح". It is a contribution: no labour, rent or overheads come off it. | **Fixed.** "Contribution", "Taux de contribution", "Contribution calculée" in FR, EN and AR; quadrant and matrix hints follow. |
| MC2 | A Simple Food Cost sheet linked to a dish was invisible from Performance. | **Fixed.** Shown beside the recipe and observed costs as "Fiche de coût · X MAD" (or "fiche incomplète", or "prix de plus de 90 jours"). It never enters a contribution, a quadrant or a unit cost. Templates and archived sheets don't count; the newest sheet per dish wins. Off, forbidden or unread: nothing shown, never 0. |
| MC3 | The page described the menu but never said what to do. | **Fixed.** "À faire": sales with no known cost, observed vs recipe gap of 15 % or more, sheet vs recipe gap of 15 % or more, popular low-contribution dishes, high-contribution dishes that sell little, sheets with prices older than 90 days. Each line comes from a figure on the page and carries its action (open the recipe, open the sheets). A dish without a complete cost gets no gap and no quadrant. |

| MC4 | A cost sheet could not become a recipe; the merchant retyped every line. | **Fixed.** "Créer un brouillon de recette" on a sheet linked to a dish. A confirmation says what carries over (named food lines, gross quantity = used ÷ yield), what doesn't (packaging), and whether the dish already has a recipe. The recipe editor then opens pre-filled under a "Brouillon, non enregistré" banner. Nothing is written until its Save button; the sheet never changes. |

| MC5 | The restaurant till wrote no cost on its sale lines, so Analyse du menu applied today's cost to every past sale: a purchase-price rise rewrote past contributions. | **Fixed.** `recordSale()` freezes `unitCost` per line through `KiwiCost.of` (complete recipe, else typed cost), the dashboard's own engine. Unknown, offered (0 MAD), formula and free-amount lines get nothing, never 0. The dashboard already prefers a frozen cost. Sales made before this change keep the "coût actuel appliqué au passé" note. |

| MC6 | The Performance matrix was a black slab on a light page. A square-root scale pushed popular dishes against the right edge, overlapping dishes hid each other, and no dish was named without hovering. Quadrants were called "Plowhorses / Puzzles / Dogs" in French, and the numbers repeated across three card rows. | **Redesigned.** One summary strip (dish sales, contribution, contribution rate, cost coverage, then gross minus refunds equals net). A light matrix on a linear scale with inner margins and tinted quadrants. Each dish is named beside its dot when there is room; overlapping dishes become one numbered dot; both medians carry their value. A 2×2 quadrant panel, laid out like the chart, lists every dish (clickable to its recipe) with sold and contribution per item. Fewer than two costed dishes: an explanation, not a fake matrix. Percentages follow the language. Phone: one column, only the three biggest names. |
| MC7 | The recipe editor was a translucent glass sheet over the page, with its numbers in `toFixed(2)` dot decimals, units truncated ("Gramme (..."), a "min" suffix drawn over its field, and "Marge" computed on the price including VAT. A recipe with unpriced lines showed a cost as if complete. | **Redesigned.** An opaque sheet: composition on the left (each line says whether it is in stock, at what price, or missing), the result on the right. Cost per portion in the language's format; with an unpriced or unlinked line it reads "au moins" and names the lines. Contribution and food cost come from `KiwiCost.marginOf`, hors TVA when prices include it. Short unit codes with the full name on hover, a native select, a suffix that sits inside its field, Material icons. FR, EN, AR. One column under 900 px. |
| MC8 | Every dashboard modal, drawer and dropdown (staff, items, hotel bookings, quotes, recipes) was painted at 46 to 86 % of a translucent surface behind a 34 px blur, so forms were read over the page behind them. In Vexel dark the fallback token is itself a 4 % wash. A select cut its label with no way to read it. | **Fixed at the source** (`design-2026.css` section 6). Sheets and menus are opaque: `--paper` in light, ink 7 % over paper in dark. No blur on the sheet or on its fields; a select inside a sheet matches the filled fields beside it and shows its full label on hover. The native app keeps its own opaque sheets (`native-runtime.css`). Guarded by `sheet-opacity-test.mjs`. |
| MC9 | The item editor (the screen behind every dish) was one column of grey fields: native checkboxes in oversized boxes, a template button cut to "modèle réu…", step titles flush against their fill, availability as a select, no preview of the photo. Save did nothing when the name was empty. Toasts, upload status and the empty-step text were French in all three languages. In Arabic, every modal's close button sat on its title. | **Redesigned.** The recipe sheet's layout: item, options and set menu as titled sections on the left; photo preview, then switches for available, sold alone and photo in set menus on the right. Options are chips. A step reads as a sentence ("Le client en choisit 1 à 1") and shows each choice's à la carte price beside its supplement. An empty name is flagged on the field. Every string in FR, EN and AR, with singular and plural counts. On a phone the fields come first. Shared fixes: the modal close button follows the reading direction and the head keeps room for it; selects keep their chevron under Vexel. Guarded by `restaurant-item-editor-test.mjs` (33 checks). |
| ST1 | Stock, « À traiter maintenant », rupture totale : in dark mode « Commander en urgence » turned into a black box with no label on hover (the hover painted `var(--paper)`, pure black under Vexel, behind `--riad-deep` text). The row claimed « Coût impact estimé : X MAD/jour de manque à gagner », computed as purchase cost × 3.2, an invented margin, and showed 0 MAD when the week had no usage. | **Fixed.** Dark hover lightens the mint (same for the suggested-order button). The row names the dishes whose recipe uses the item, the week's real daily use when there is one, and nothing when neither is known; a venue without recipes gets no recipe claim. FR, EN, AR. `stock-alert-truth-test.mjs`. |
| LK1 | The PIN lock and the greeting after it. At 00:12 the greeting read « Bonjour Amira, bonne journée. » over « AMIRA BOUTIQUE · SERVICE OUVERT »: a morning wish at midnight, a service nothing had opened, and the account's first shop while the dashboard opened on Amira Cafe. identity.js rewrote it in French over EN and AR sessions, and wrote the owner's name over the manager who had just typed their code. An owner filed without a name was greeted « Bonsoir Propriétaire ». The lock was a frosted, near-white card (`rgba(255,255,255,.88)`) with a Feather icon, said « Saisis ton » while the native app says « Entrez votre », showed no sign of where the next digit would land, and on a phone the tab bar (z 1200) floated live above it (z 800). After a wrong code, the help line came back in French whatever the language. The update notice was French only and wrapped to three lines on a phone. | **Redesigned.** The greeting is composed when it is shown: hello and wish follow the clock (morning, afternoon, evening, night) in FR, EN and AR; the name is whoever's code opened the door, then the owner, and a role word counts as no name; the pill names the store the dashboard opens on, plus what its own opening hours say (`KiwiHours.summary`), and nothing when no hours are set. Upright 600, no neon glow; it wraps on a phone and the wish wipes in by clip-path; it ends at 1.9 s and any key skips it. The lock names the shop on an opaque bone card (deep green in dark), its four cells shrink to a 360 px screen, and the cell for the next digit shows a caret while focused. Its two exits sit under a hairline, with the Material logout icon. The tab bar hides while the gate is up. The update notice is in FR, EN and AR, on one line. `lock-greeting-truth-test.mjs` (31 checks). |
| TM1 | Équipe · the member form, the profile and the empty roster. The form behind « Ajouter un membre » was one grey column whose placeholders read like a filled-in record (« Sara », « Belkadi », « BK 384721 », « Allergie crustacés… »). A new member was pre-set as the catalogue's first post (« Chef de cuisine · Cuisine »), on a CDI, speaking French and Arabic, nobody having said so. Contract and language names stayed French under EN and AR, and a missing field only raised a toast. The profile printed « 0 MAD » for a salary nobody entered, ISO dates, « Serveur · » with no department, and the personal code in clear the moment it opened. On the empty roster, « Ajouter un membre » re-opened the page and said « Aucun membre ne correspond aux filtres ». Under Arabic, theme.css mirrored every icon in a button, so the check on « Ajouter » read as a chevron. | **Redesigned.** The form now uses the recipe sheet's layout: sections on the left; on the right, the person and the code that opens the till. Placeholders are formats (`nom@exemple.ma`, `06 00 00 00 00`). Role, department, contract and languages start empty, and choosing a role still fills in its department. Contract is a segmented control on the liquid lens. Errors appear under their field, and the first one takes the focus. Contract and language names follow the session language in the form, roster, filters and profile. The profile is read-only and shares the form's opaque sheet: an empty field says « Non renseigné », dates are written out in full, and the code stays masked until « Afficher ». The empty roster says so and its button opens the form. In RTL only arrows and chevrons flip. Verified in the browser in light, dark, a 375 px phone and Arabic RTL (the contract segment overflowed by 59 px on a phone before the fix). Gate: `tools/team-member-editor-test.mjs` (23 checks, 0 pass on the old code). |
| HM1 | Hôtel · amounts in quotes, group stays and the commercial view. Seventeen places printed money with `(cents / 100).toFixed(2)`: « 2400.00 MAD TTC » with a decimal point and no thousands space, beside a dashboard that writes « 2 400,00 ». The price-change confirmation read « … MAD TTC — je l’ai vérifié. », with an em dash. | **Fixed.** Every displayed amount goes through `cuDraftMoney` (KiwiNumber in the page's locale, two decimals); input `value`s stay raw numbers. The em dash became a comma. The two tests that parsed the old format now read the localized one (`hotel-stays-group-browser-test` 145/145, `hotel-reception-journal-test` 39/39). |
| MO1 | Menu · option group editor (« Nouveau groupe d'options »). It had two selects and a help line in French under every language. The price boxes were unlabelled and pre-filled with « 0 ». « Enregistrer » did nothing at all when the name or every choice was empty. A choice with a price or an emoji but no name was silently dropped. The emoji picker opened off the left edge of a phone, said « Aucun repère » in French, and could only be closed by picking. The delete confirmation's default sentence was French in every language. | **Redesigned.** Kind and requirement are segmented controls on the liquid lens. A sentence says what ordering will enforce: one option, at least one, as many as wanted, or none. Each sentence was checked against the till (a second tap clears a single choice; required blocks validation) and against the order API's min/max. Columns are named (marker, choice, supplement); an empty supplement means included. Errors are written under the name and the choices, and the first takes the focus; removing the only choice clears it. The picker stays on screen, flips above its button, is opaque, closes on Escape or a click away, and escapes what it prints. Verified in the browser: phone, desktop, Arabic RTL, dark. Groups were created, reopened, persisted across a reload, and deleted. Gate: `tools/menu-option-group-editor-test.mjs` (10 checks, 0 pass on the old code). One early save in the session closed the editor without creating its group and could not be reproduced in four later attempts. |
| PN1 | Locks · a lockout read as « offline » or « wrong code ». After a few attempts `/api/pin/verify` answers 429 with `retry_after`. The dashboard lock folded every non-2xx into « unknown » and told an operator on working Wi-Fi « Connexion requise pour vérifier le code · appareil hors ligne ». A server error said the same. The till pad told someone typing the right code « Code incorrect ou impossible à vérifier ». | **Fixed.** The dashboard lock reads 429 as `{ busy: seconds }` before anything can treat it as an identity, and says « Trop d'essais. Réessayez dans N min. » in FR, EN and AR. A server error says « Kiwi ne répond pas ». « hors ligne » appears only when the browser is offline. The till pad remembers the 429 and says the same. A lockout still never approves anything. Verified in the browser with a stubbed 429 (stays locked, names 4 min) and a stubbed 503, then a normal unlock. Gate: `tools/pin-lockout-truth-test.mjs` (7 checks; 6 fail on the old code). |
| UP1 | « Nouvelle version prête » sat at the top of the stack (z 2147483000), bottom-centre, over the footer of every modal (« Ajouter le membre », « Enregistrer ») and over the till's sheets. Its icon was a Unicode arrow character. | **Fixed.** The pill waits behind any modal, sheet, or the till's code screen that is laid out, visible and clickable (the till keeps its dialogs in the page and toggles them), and comes back when they close. On the dashboard lock, which is a full page rather than a dialog, it stays visible below the code card. It draws the Material refresh icon. Verified in the browser: it hides while a modal is open and returns after it closes. Checks added to `lock-greeting-truth-test`. |
| BQ1 | Inventaire boutique · « Nouveau produit » and « Modifier le produit ». The price and the cost went through `parseInt`. An article priced 29,90 MAD at the till (the till keeps centimes) was saved back at 29 the first time someone changed its photo on the dashboard. The grid, the list, the product sheet and the shelf label rounded it to 30. A cleared price saved the article at 0 MAD. A cleared name kept the old one without a word. « Nom requis » was a toast. The edit tag printed « &amp; ». « ·Sans catégorie » kept the dot of a dash that had been removed, on the dashboard and on both tills. The photo hint told every store « Visible par vos clients sur le téléphone », with or without Order Pro, and a video could be uploaded where a video shows nowhere. Every word was French under EN and AR. | **Redesigned and fixed.** One form for both gestures, in FR, EN and AR: article (name, category, kind as cards), price (selling price and cost with a MAD suffix, read to the centime, « 149,90 », « 1 890 » and Arabic-Indic digits accepted, an ambiguous « 1.890 » refused), a live « prix moins coût » line, and Category A / B (named, never explained, per the owner's 2026-08-19 decision). A card on the side follows the form with the medium, name, category and price. Errors are written under their fields and the first takes the focus. A kind the trade does not list is no longer rewritten on save. The photo hint says where the photo actually shows: the inventory, the till for trades that read this catalogue, and the phone only with Order Pro. The video picker is offered only with Order Pro. Prices show and print to the centime. Gate: `tools/boutique-product-form-test.mjs` (12 checks; 0 pass on the old code). |
| MV1 | Maison · « Nouveau mouvement de stock » on the dashboard. Seven bare fields in one column. A text arrow was glued to each motive. The supplier was asked for a breakage. Nothing showed the stock the gesture would leave. A refusal printed the server's code (« Mouvement impossible : non-autorise »). French under every language. | **Redesigned.** Direction first (Entrée / Sortie on the liquid lens), then only its motives as chips. The article and variant come next. A product without a variant says so and cannot be saved. The quantity has a stepper and a live « Stock : 12 → 15 ». A shortage is said before saving. The supplier is asked only for motives that have one. Each refusal is in words, under its field. FR, EN and AR. The gesture is unchanged (`KiwiMaisonStock.record`). Gate: `tools/stock-movement-modal-test.mjs` (8 checks; 7 fail on the old code). |
| SI1 | Stock · « Nouvel article » / « Modifier l'article » (restaurant stock). A new article saved with « Stock actuel » empty was recorded with its par level as stock. That invented quantity went to the ledger as the opening balance (`KiwiInventory.ensureOpening`). An empty reorder level silently became 40 % of par. « 2,5 » kg was stored as 2 (`parseFloat`). The first supplier was picked for every new article. An unconfirmed « + Nouvelle catégorie… » filed the article under Légumes. The « Nom de la catégorie / Confirmer » row never hid (inline `display:none` then `display:flex`). On a phone the unit and the third number were cut off. Mono capital micro-labels. | **Fixed and redesigned.** On creation the current stock is required (« Écrivez 0 si vous n'en avez pas ») and becomes the opening stock as typed. The 40 % reorder rule stays, and the hint under the field spells out what an empty field will mean before saving. Numbers are read with a comma, a dot or Arabic-Indic digits, and refused when malformed. The supplier list starts with « Aucun ». An unconfirmed new category stops the save. Three sections (Article, Stock, Coût) with the unit beside every quantity, readable on a phone. The nutrition panel's marker was redrawn. FR, EN and AR. Gate: `tools/stock-item-form-test.mjs` (9 checks; 0 pass on the old code). |
| BS1 | Inventaire boutique · the product sheet (variants, stock, codes, labels). « Ajouter une variante » on a colour and size the product already had replaced that variant's stock with the form's « Stock initial » (0 by default) and said « Variante ajoutée ». Clearing a stock field saved 0. « − » at zero recorded a −1 the catalogue kept, so the next « + » left 0. The bin deleted a variant, its stock and its codes on one tap. A refused existing code was a toast, « Enregistrement impossible ». The title said « Sans catégorie » and the stat said « Divers ». The colour editor drew its own shield and the label button an upload arrow. In dark mode the barcode was ink bars on a dark card. The scan field lost its focus to the close button. French under every language. | **Redesigned and fixed.** A four-cell summary that states only what the catalogue holds: price and cost gap, pieces and sold-out variants, shelf value at price and at cost, codes « 2 sur 3 ». Each variant is a card with its colour, size, a stepper whose « − » stops at zero, a stock field that refuses an empty or malformed count and puts the value back, its code (« Généré » / « Importé ») and Material icons. Adding a variant is a three-section window: colour with no default, size chips or free text (empty means TU), stock and code. It warns « Noir · M existe déjà… avec 3 pièces » and will not save a duplicate; creation goes through `ensureVariant`, never the overwriting `addVariant`. Deleting a variant or a product is asked first, naming its pieces, its codes and the till. An existing code is refused under the field by reason (too short, unreadable, already on another variant, named). A bad EAN check digit warns once, then offers « Enregistrer tel quel ». « Générer les N codes manquants » and « Imprimer les N étiquettes » act on the whole product. The scan and copies fields open focused. In dark mode the barcode sits on paper. FR, EN and AR, with Arabic plurals. Gate: `tools/boutique-product-sheet-test.mjs` (13 checks; 12 fail on the old code). |
| OV1 | Every window (`Kiwi.modal`). A `[data-dismiss]` button (« Annuler », « Fermer », « Plus tard ») closed a drawer but not a window, unless the caller wired it itself. About twenty did not, among them « Supprimer ce produit ? », so « Annuler » did nothing and the only way out was the cross. Escape closed every open layer at once: a window opened from the product sheet took the sheet with it. A window that wanted its field focused raced the shared focus trap on a timer and lost on a slow frame. | **Fixed at the source.** `modal()` closes on `[data-dismiss]` like `drawer()`; `close()` is idempotent, so callers that still wire it close once. Escape belongs to the topmost open layer (the last in the document that is not fading) and closes only that one. The focus trap honours `[data-autofocus]` (and `[data-autofocus-select]`) before falling back to the first control. Gate: `tools/overlay-stack-test.mjs` (15 checks in headless Chrome with real clicks and keys; the old `interactive.js` fails the first « Annuler » check). |
| EN1 | Compte en attente · the activation gate (`entitlements-v2.js`). After « Plus tard » the activation panel rests for ten minutes, as designed, but for those ten minutes every held gesture did nothing at all: « Nouveau produit », a keystroke in a field, « Supprimer » on a product. No panel, no pill, no line, so a deleted product simply stayed and the dashboard looked broken. A background write (the menu resyncing on load) went through the network guard and opened the full panel over the lock screen with nobody touching anything. On the lock screen itself, touching a code box or typing the code opened the panel over the lock, and « Changer de compte » was held, because its label « Se déconnecter… » contains « connecter »: a pending merchant could not log out. The setup line was French under EN and AR, and a refused menu sync printed the server code `subscription-required`. | **Fixed.** While the panel rests, a held gesture answers with one line in the screen's language, refreshed rather than stacked, with « Voir l'activation » to reopen it on purpose. The network guard still refuses every write, and only explains one that follows a real gesture within 1.2 s; keys typed on the lock screen do not count. The lock screen and any logout control are never held. `menu-catalog.js` stays silent on a 402 (the gesture was already explained) and its sync failures read FR, EN and AR. Gate: `tools/entitlement-held-gesture-test.mjs` (31 checks in headless Chrome with real clicks and keys; the old gate fails at the background write, and without the lock exemption it fails at the code box). |
| EN2 | Compte en attente · the activation panel, its pill, and « Nouvelle version prête » on a phone. Under English and Arabic a pending merchant read « Prêt à ouvrir · en parler à Kiwi », then a panel entirely in French, and « En parler avec Kiwi » opened WhatsApp on a French sentence they had not written. Built once, the panel kept the language of its first opening. On a phone (the dashboard's tab bar runs up to 860 px) the pill was full width on top of the tab bar: Accueil, Commandes, Vendre, Kiwi AI and Menu could not be reached. It also showed on the code screen and, at the top of the stack, painted over open sheets (the date picker's calendar). After every deploy the update pill sat centred on « Vendre » until the merchant refreshed. Under Arabic the close cross and the pill stayed on the right, over the mirrored sidebar. | **Fixed.** Panel, pill, labels and the WhatsApp message read FR, EN and AR; the panel is rebuilt when the language has changed and the pill relabels on `kiwi:langchange`. On a phone the pill sits above the tab bar on the right, clear of the day-report chip, stands aside behind the code screen (`html.kiwi-gate-up`, the tab bar's own rule) and lives under windows and sheets (z 1250). `pwa-update.js` rides 12 px above the bottom cluster (bar, chip, activation pill) when a tab bar is showing, and keeps the bottom edge on the caisse, Serveur and the employee portal. Cross and pill use logical insets. The French copy reads « dès aujourd’hui, avec tout… » instead of a middle dot. Gate: `tools/entitlement-panel-language-test.mjs` (27 checks in headless Chrome with the real `entitlements-v2.js`, `entitlements.css` and `pwa-update.js`; the old code fails the first check). |
| DR1 | Tableau de bord · « Mois dernier », « Ce trimestre », « Cette année ». The picker shows them as calendar periods (« Septembre 2026 », « 1 Jul – 12 Oct 2026 », « 2026 ») and the tiles say « vs mois préc. », but `rangeBounds` returned the last 30, 90 and 365 days. Measured on 2026-10-12: « Septembre 2026 » ran from 13 September to now, October included; the quarter from 15 July; « 2026 » from 13 October 2025. Every consumer of `KiwiDateRange.bounds` (KPI band, revenue card, report) inherited it. « vs mois préc. » weighed 30 days against the 30 before. « CA moyen par jour » divided a custom period by 1 (the average equalled the total) and the year by 365. On a real merchant's revenue card the badge read « 30 DERNIERS JOURS » for last month, and none of the real card's labels (« AUJOURD'HUI », « Cumul horaire · hier », « Total journalier · période sélectionnée », « Cumul », any day count other than 7 or 30) had a translation, so the card stayed French under EN and AR. | **Fixed at the source.** `calendarBounds` gives the whole previous month, and the quarter and the year from their first business day, on the merchant's 5 h clock, across year boundaries. Their deltas weigh the previous calendar period (the same elapsed slice while live). `windowDays` gives the per-day KPIs the days the window really covers (real data; the demo keeps its buckets). The real card names its period and counts its real days. The dictionaries carry the real card's strings, plus a numeric template (« # DERNIERS JOURS », « Total # jours ») with Arabic counts that agree. Gate: `tools/date-range-calendar-truth-test.mjs` (13 checks executing the real `dateRange.js` functions; `kpi-same-slice-test.mjs` follows the new helper). |
| CP1 | Couleurs · the colour picker and every colour name on the boutique dashboard (`color-palette.js`, product sheet, add-variant and colour windows, colour filter, stock movement). The palette already carried English and Arabic names and nobody read them: under EN and AR the merchant read « Noir », « Bleu », « Couleur personnalisée #4A67D6 », « Plus de couleurs », « Choisir », and the caption asked a phone to « survoler » a swatch, which no finger can do. | **Fixed.** A name is READ in the screen's language and STORED in French: `label` stays the key for reports, imports and printed tags, `KiwiColors.name` / `nameOf` give the read name, and a custom colour keeps its stored label in `data-kc-label` so the title can be localised without changing what is saved. The hint follows the device (hover with a mouse, tap on touch), the custom-colour controls read FR, EN and AR, and the hex field stays left to right in Arabic. On the dashboard, `_bqxColorName` / `_bqxVarName` are what the merchant reads; `_bqxVarLabel` is still what a tag prints. Gate: `tools/color-palette-language-test.mjs` (19 checks in headless Chrome with the real palette; the old palette fails the first). |
| TM2 | Équipe · the confirmation after adding a member. It read « Code personnel 4821 · compte employé activé »: the new member's four-digit code in clear, for several seconds, over the dashboard and often on the counter screen, and « activé » before the server copy (the only thing that opens the employee app) had answered. | **Fixed.** The toast says how the member signs in (their e-mail and the personal code on their profile) in FR, EN and AR; the code is read and copied on the profile, which the manager opens on purpose. Gate: `tools/team-added-toast-test.mjs` (7 checks; the old toast fails the third, on the code it printed). |
| DR2 | Tableau de bord · the date row (title, pills, liquid lens, calendar header). A merchant whose stored period was « Mois dernier », « Ce trimestre » or « Cette année » (the old range menu offered them) read that title with the lens lit on « Aujourd'hui »: no pill matched, and the lens stayed on the last one that had. After the greeting, the title stayed the static « Aujourd'hui », in French under Arabic, until the first full render. The calendar opened on a lone « · ». | **Fixed.** A period without a pill of its own lights the calendar pill it is chosen from. The title and pills are painted behind the code screen (`restoreRange` + `renderSelector`, no data needed), in the screen's language and on the stored period. `liquid-lens.js` steps aside when nothing in a row is selected, in every group, and comes back in place on the next selection. The calendar header names the period in effect, muted, until a day is picked. Gate: `tools/date-range-selector-truth-test.mjs` (10 checks in headless Chrome on the shipped date block; the old code fails the second). |
| BI1 | Inventaire boutique · the page around the sheet (`_renderInventory`, cards, rows, stock tags, the selection bar, the grouped move and delete windows, import and export toasts). The sheet read FR, EN and AR; the page that opens it was French under every language, with « MAD » where the sheet says « درهم », and a product without a category was « Divers » on its card and « Sans catégorie » on its sheet. | **Fixed.** One `_BQX_INV` dictionary in FR, EN and AR, with real plurals (Arabic singular, dual, 3 to 10 and 11 and more). The currency follows the language on cards, rows and the value KPI; the uncategorised word is the sheet's own; the toolbar spacing is logical (`margin-inline-start`) so it mirrors under Arabic. Gate: `tools/boutique-inventory-i18n-test.mjs` (7 checks; the old page fails the French-literal check). |

Covered by `menu-insights-test.mjs` (44 checks), `caisse-frozen-cost-test.mjs` (12) and `restaurant-recipe-layout-test.mjs` (17); `menu-ledger-test.mjs` follows the new wording.

## Métiers de bouche (pizzeria, boulangerie, fast-food, food truck, traiteur): done

| ID | Finding | Status |
|---|---|---|
| G1 | The five tills sold the demo catalogue at demo prices whatever the merchant had set; with no catalogue, demo items passed as the merchant's own. | **Fixed.** They read the dashboard carte (same mirror as the restaurant till). A real till with an empty carte says so and takes a typed price. |
| G2 | Pizza sizes, dough, extras, delivery zones and fees, traiteur dishes, extras and terms, cake formats were constants in code. | **Fixed.** From the carte's option groups, or the new owner-written `foodtrade` store doc the paired till only reads. Half-and-half exists once a supplement is set. |
| G3 | Changing the carte changed the total of an existing catering quote. | **Fixed.** A quote freezes its dishes and extras (`ev.snap`); J-n is set per quote (1 to 90). |
| G4 | Dashboard quote, deposit, delivery, kitchen and cake pages ignored the till; Accueil showed every sale as a new client. | **Fixed.** Read-only "Depuis la caisse" cards, never in demo; new clients show a dash. |

Covered by `food-trades-truth-test.mjs` (49 checks).

## Métiers de service (coiffure, spa, gym, fleuriste): done

| ID | Finding | Status |
|---|---|---|
| F1 | Tills sold the demo grid (120 MAD a cut) and named staff "Coiffeur 1-3". | **Fixed.** Merchant catalogue through `KiwiPosWorkspaces`; staff from the practitioners board or the roster (names only, never codes); commission only when set. |
| F2 | Drafts, archived items and unset prices could be sold. | **Fixed.** Drafts are not sold and the till says so; an unset price is typed. |
| F3 | Gym: a second sale to the same member was refused (409) because the ref was the member code. Money taken, never counted. | **Fixed.** Unique ref per sale. |
| F4 | Number fields read "24,5" as 245. | **Fixed.** Text inputs accept a comma. |
| F5 | Spa cures showed an invented saving; fleuriste receipts printed the demo shop's name. | **Fixed.** Cures at unit price, "sans remise"; receipt uses the merchant's name. |
| F6 | Gym had no way to create a class, counter item, pass or coaching pack; spa had no products page. | **Fixed.** "Comptoir, coaching & pass" and "Boutique & produits" boards. |

Covered by `service-trades-truth-test.mjs` (26 checks).

## Commerces spécialisés (pharmacie, librairie, épicerie): done

| ID | Finding | Status |
|---|---|---|
| S1 | On a real account the three tills sold an invented catalogue and demo stock. | **Fixed.** They read the shared catalogue (`KiwiBoutiqueCatalog`, `/api/catalog`): price, EAN/ISBN and stock are the merchant's. A product with no price is not sold. |
| S2 | Pharmacy medicine sheets, batches and insurers were constants. | **Fixed.** Médicaments (DCI, prescription, reimbursable, cold chain), Lots et péremption (FEFO; an expired batch cannot be sold) and Organismes (rates) live in the tenant-scoped `workspaces` doc. |
| S3 | Insurer share rounded to the dirham; third-party claims and dispensed prescriptions never reached the dashboard. | **Fixed.** Share to the centime; claim "À envoyer" and prescription "délivrée" written to the same doc. |
| S4 | Bookshop school lists and special orders lived only on the till. | **Fixed.** Lists resolve against the catalogue (an unmatched line reads "sans prix"); special orders sync both ways; deposit and balance enter the day's takings. |
| S5 | Grocery weighed items and scans were demo-only. | **Fixed.** Sold by kg or L, scanned through the catalogue, rounded to the centime. |
| S6 | A sale did not draw stock. | **Fixed.** Stock leaves the catalogue with the ticket reference. |
| S7 | Accueil said "Réservations non configurées" for a pharmacy or bookshop; expiry counted in device hours. | **Fixed.** Duty pharmacy and special orders replace it; expiry in calendar days, Casablanca time. |
| S8 | A record edited in another tab was not seen by the till. | **Fixed.** The till listens to `storage` events. |
| S9 | "Ventes aujourd'hui" on trade pages used device midnight. | **Fixed** (merged with the earlier rule): business day from `KiwiDateRange.bounds`, then `KiwiDayReport`, refunds excluded. |

Covered by `specialty-retail-truth-test.mjs` (29 checks); `pos-truth-a-test` and `trade-workspaces-test` follow the new contract.

## Open, logged for their own pass

- **Dashboard period labels claim calendar periods the maths does not use.**
  In `assets/dateRange.js`, `moisDernier` is labelled "Last month" but
  `RANGE_DAYS` makes it the last 30 days to now; `trimestre` ("This quarter")
  is the last 90 days and `annee` ("This year") the last 365. The Ventes tab
  does not use these; the global date picker does.

- **Pharmacy health data on the counter device.** Prescriptions and
  allergies sit in the `workspaces` store doc, which a paired till token can
  read (like `costs`). It needs its own owner/pharmacist scope before real
  patient data is entered.
- **Bookshop deposit and balance are recorded as cash** whatever the tender.
- **Weighed grocery stock is not tracked**; only unit products draw stock.
- **School lists show "BALANCE 0 MAD"** in the generic summary strip, which
  means nothing for a list.
- **Boutique and maison Accueil still say "Bookings not configured".**



- **What a pending store may save.** `entitlements-v2.js` says configuring
  (a dish, a room) is not held back during installation, but the server
  refuses every `store_docs` write from a pending store. The wizard's own
  team roster and floor plan are therefore kept on the device, marked
  unsynced, and only reach the server after activation. Measured: they did,
  on the same browser. On another device they are missing until then.
  A product decision, not a bug to patch quietly.
- **Hotel walk-ins** (`hx-walkin-room`, `hx-checkout-pay`) use a ledger the
  band does not count; only `hotel_reservations` is measured.
- **Room charges** are recorded by the hotel till as a card sale, not as
  "charged to room".
- **Retail tills other than boutique/maison** ship demo catalogues and do not
  read the shared catalogue; the boutique till posts no credit note to
  `/api/store-credits`, and its exchange replacement is missing from the
  stock ledger. "Personnaliser" previews KPIs from demo data.

- **Till ticket numbering after C4.** A contaminated shift keeps its
  `kdsOrderSeq` (53 and up) until the service is closed. Not rewritten, since
  those numbers may already be printed.

- **Default tariffs with no editor.** Librairie catalogue, pizzeria prices
  and delivery fees, traiteur dishes, fast-food menu, gym plans, coiffure and
  spa services, fleuriste stems: real tills still sell at these (the service
  trades are in their own pass). Staff rosters are "Coach 1–3".
- **Tips are not in D1.** The `sales` table has no tip column; the dashboard
  learns tips only from the closing Z, so an open day shows none.
- **Equal splits** count one transaction per part (defensible per payment).
- **Hours not enforced server-side** for QR orders: the page blocks, the API
  accepts.
- **Removed employee clocked in**: the open attendance entry stays.
- **Per-device unpair** is impossible: the till token carries no device id.
- **Pharmacie** has no UI to enter stock or lots.
- **Coiffure appointment panel** is not linked to the `appointments` board;
  fleuriste delivery default still names "Tanger".
- **Food trades**: delivery fee lines appear as "to cost" in margins;
  pizzeria customer order counts stay at 0; traiteur ignores carte option
  groups (per-person price only); restoring a remote till snapshot can
  replace an in-progress ticket (`KiwiVerticalState`, pre-existing).
- **`txPerDay`** divides by the range length, not by days open.
- **The restaurant till does not freeze a cost on its sale lines** (`k`).
  Until it does, a purchase price change rewrites past margins; both
  analysis tabs say so. Needs the till to read the recipe cost at sale time.
- **A paired till can read `costs` and `recipes`.** Stock consumption on the
  till needs the recipes, so the read cannot simply be removed; Simple Food
  Cost gets its own owner-only storage instead of extending these documents.

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

Other surfaces: ~~the till (restaurant and the 14 `pos-*` verticals)~~ ·
~~kiwi-serveur~~ · ~~kiwi-cuisine~~ · ~~employee app~~ · ~~booking.html~~ · ~~kiwi-order.html~~ ·
~~kiwi-report.html~~ · ~~support/tickets~~.
