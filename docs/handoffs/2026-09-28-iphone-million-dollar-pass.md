# Handoff prompt · Kiwi Pro iPhone app, the "million-dollar" pass

Paste everything below the line into a fresh session of a capable coding model,
opened on `/Users/zaka/Developer/kiwi`.

---

You are the design-engineering lead finishing the **Kiwi Pro iPhone app**. It is a real
point-of-sale product with paying merchants in Morocco, not a demo. The owner wants it to
feel like Revolut's app built by Apple's design team: calm, obvious, fast, and exact in every
detail. It should read as a million-dollar app. You have full autonomy. Work until every
screen, button, sheet, state and transition in every role has been exercised on the iPhone
simulator and brought to that standard. Do not stop to ask for approval. Stop only for the
hard safety rules below.

## 0. Read first (in this order)

1. `CLAUDE.md` at the repo root. It is binding: the two GitHub mirrors, commit format,
   stamp tooling, brand rules, tenant safety and PIN rules.
2. `docs/handoffs/HANDOFF.md`, Part 1.
3. `docs/audits/2026-09-28-iphone-app-revolut-standard.md`. This is the audit this work
   continues: Revolut's eight principles, the 17-finding diagnostic, what already changed,
   and what is still open. Treat its eight principles as your acceptance rubric.
4. `app/src/native-runtime.js` and `app/src/native-runtime.css`: the web layer injected
   only into the native app.
5. `app/ios/App/App/KiwiNativeShell.swift`: the SwiftUI host, with the setup flow, the
   floating tab capsule and the More sheet.

## 1. What the app is

- Capacitor 8 app, bundle id `com.kiwios.pro`, in `app/`.
- `node tools/build-app-www.mjs` bundles the web surfaces into `app/www` and injects the
  native runtime.
- SwiftUI owns these parts:
  - native setup: sign-in, role picker and pairing;
  - the floating bottom tab capsule;
  - the "More" sheet (half-height, `[.medium, .large]`).
- The web view owns the page content.
- The bridge: the web posts `kiwiShell` context
  `{version, screen:'workspace', role, locale, rtl, selected, tabs:[{id,label}]}`. Swift
  calls `window.KiwiNativeHostAction({action, id})` (actions `navigate`, `open-tools`,
  `change-role`, `sign-out`, `delete-account`) and `window.KiwiNativeHostRequestState()`.
- Swift publishes `--kiwi-host-safe-*` and `--kiwi-host-tab-height` CSS variables.
- Four roles:
  - **Till** (`kiwi-caisse.html`): Floor / Takeaway / Waiting / More.
  - **Kiwi Team** (employee app): floor, schedule, attendance.
  - **Kitchen** (KDS): a pairing keypad, then the production screen.
  - **Dashboard / owner** (`dashboard.html`): Home / Orders / Report / Clients / More.
- Three languages: FR (default), EN, AR (RTL, IBM Plex Sans Arabic). Light and dark themes.
  The dashboard follows the system theme until the owner picks one. The till uses
  `data-caisse-theme`.

## 2. Already done (do not redo; build on it)

The last two commits on `main` are `1b5569ed` and `40b56ebc`:

- **Owner home:**
  - revenue hero with a phone-width chart, ticks thinned and localised;
  - a segmented period control;
  - four round quick actions (Day report, Invoicing, Export, Customize);
  - grouped borderless cards on a tinted ground;
  - a translucent header that owns the status-bar strip;
  - large titles on inner pages;
  - orders and clients shown as Revolut-style list rows.
- **Native tabs:** Home, Orders, Report, Clients, More. The More sheet can open the full
  dashboard menu.
- **Native setup:** a full-bleed ink stage, dark filled fields, round-icon role rows, and a
  paper capsule primary pinned at the bottom. The dashboard's first-run and lock screens
  match it.
- **Till tiles:** they never clip their price, and categories are in sentence case.
- **Till bill:**
  - a floating ink "View bill" pill with a mint count badge;
  - the open bill is a sheet with a scrim, a 24 pt edge, one filled capsule
    "Encaisser · total", a tonal Card button, a tonal kitchen button and an "Autres actions"
    text link;
  - **the X folds the sheet.** It used to call `clearCart()`, which discarded the order and
    bypassed the staff-code guard on "Vider la commande". Never reintroduce a path that
    empties or cancels a sale without going through that guard.
- **Guard test:** `tools/native-owner-home-browser-test.mjs` (27 checks), wired into
  `tools/check.js`.

## 3. Hard rules (non-negotiable)

- **Never enter** merchant PINs, staff PINs, caisse personal codes, account passwords or
  six-digit pairing codes. Never create accounts. Never bypass the account gate
  programmatically.
  - Enter surfaces only through the demo entry points: "Explore the demo first" /
    "Enter the demo →" on the dashboard, and clock-in on the demo till.
  - If a flow is gated behind a code, polish everything around the gate, then verify the
    gated screen in the Puppeteer harness (with state that is already open) or by reading
    the code. Never type a code.
- **Merchant data is real.** Create no test sales and modify no customer records on a
  paired or real tenant. Do this work on the demo only.
- **Brand:**
  - Colours come from `assets/tokens.css`: `--atlas #0B6E4F`, `--riad #053B2C`,
    `--mint #7DF2B0` (at most 5 % of any screen), `--paper #F7F5F0` (never pure white),
    `--ink #0A0F0D`. Add no new accent colours.
  - Type: Inter Tight, weights 400 to 600, **no bold display weights**. IBM Plex Sans Arabic
    for AR. JetBrains Mono only for codes.
  - **No italics anywhere.** No em dashes in user-facing copy (use commas, full stops or
    middle dots). No emoji in titles or CTAs.
  - Icons: **Material Symbols only**, vendored into `assets/icons/material/` with the curl
    line in that folder's README. On the Swift side use SF Symbols.
  - Signature motion: the "liquid lens" in `assets/liquid-lens.js`,
    `cubic-bezier(0.34, 1.45, 0.5, 1)` at 310 ms. Every new segmented or tab group
    registers there.
- **CSS specificity:**
  - The dashboard stacks the Vexel, 2026 and iOS 27 skins, with `!important` rules like
    `body.design-vexel[data-vexel-mode] …`.
  - Scope owner rules as `html.kiwi-native body.kiwi-native-owner:not(#kno)` and till rules
    as `html.kiwi-native body.kiwi-native-till:not(#kno)`, all inside
    `@media (max-width:600px)` (or `900px` for the till).
  - Measure what actually paints (computed styles, CDP matched rules). Never assume.
  - Do not change web or iPad layouts: keep native-only changes in `app/src/native-runtime.*`.
- **Stamps:** if you edit a stamped file under `assets/`, run
  `node tools/bump-stamp.js <files>`. Never hand-edit `?v=`.
- **`npx cap sync ios`** rewrites `app/ios/App/CapApp-SPM/Package.swift` with absolute
  paths. Always `git checkout app/ios/App/CapApp-SPM/Package.swift` before committing.
- **Git:**
  - Work in a worktree (for example `git worktree add /private/tmp/kiwi-polish main` and
    symlink `app/node_modules` to `/Users/zaka/Developer/kiwi/app/node_modules`).
  - Stage by path, never `-A`. Commit as `app · <what changed>` with the Co-Authored-By
    footer.
  - Push `HEAD:main` by URL to **both** `https://github.com/zaka33333-hash/Kiwi.git` and
    `https://github.com/badro99/Kiwi.git`. Fast-forward only, never force.
  - Leave nothing staged.
- **Gate:** `node tools/check.js` must stay green before each push. The one known
  pre-existing failure is `shared-day-selector-browser-test.mjs`; prove anything else is
  pre-existing in a detached worktree at the base before ignoring it. Every new test goes
  into `check.js`.

## 4. Toolchain

- **Build and run:**
  ```
  node tools/build-app-www.mjs && (cd app && npx cap sync ios)
  cd app/ios/App && xcodebuild -project App.xcodeproj -scheme App -configuration Debug \
    -destination 'id=<booted iPhone 17 Pro udid>' -derivedDataPath /private/tmp/kiwi-ios-dd \
    CODE_SIGNING_ALLOWED=NO build
  xcrun simctl install <udid> /private/tmp/kiwi-ios-dd/Build/Products/Debug-iphonesimulator/App.app
  xcrun simctl launch <udid> com.kiwios.pro
  ```
- **Drive the simulator** with the iOS Simulator tool (tap, swipe, screenshot) in device
  points (402 × 874). Take a screenshot before every tap.
- **Fast iteration:** use a Puppeteer harness that serves `app/www` at 402 × 874 with
  Capacitor stubbed. Base it on `tools/native-owner-home-browser-test.mjs`, which builds
  into a scratch dir and has a `phone(lang, role)` helper. Use it to measure, then confirm
  on the simulator: synthetic events can false-pass, so final checks use real taps.
- For an evidence-heavy diagnosis, read the actual painted pixels and computed styles, not
  the source intent.

## 5. The job: a complete sweep, then fix everything

### 5a. Sweep method

Build a checklist before you change anything, and save it under `docs/audits/`. Cover:

- every role × every tab × every sheet, drawer and modal × every button;
- FR / EN / AR;
- light / dark;
- empty / populated / long-content / error / offline states;
- first launch versus returning launch;
- Dynamic Type at the largest accessibility size;
- portrait, plus an iPad and a landscape sanity check (those must not regress).

Tap **every** control and record, for each:

1. What happened.
2. Whether it was right.
3. Tap target at least 44 pt.
4. Contrast (AA for text, 3:1 for UI).
5. Clipping or overflow.
6. Text under the Dynamic Island or the tab capsule.
7. Truncated translations.
8. RTL mirroring (chevrons, progress, swipe directions).
9. Keyboard behaviour: the field stays visible, "return" does the right thing, and taps
   outside dismiss.
10. Haptics where Apple would use them.
11. VoiceOver labels.
12. Console errors.

### 5b. Surfaces to cover (minimum)

- **Native setup (Swift):**
  - sign-in, the role picker, and every role's entry;
  - error states (wrong credentials show the message without you typing real ones: use the
    empty or invalid-format path);
  - loading states;
  - "Back";
  - the keyboard and safe areas;
  - AR RTL.
- **Owner dashboard:**
  - Home: the hero, period switching (animate the chart transition), every quick action and
    the sheet or page it opens, the KPI customize sheet, the invoice flow and export.
  - Orders: list, row detail, filters, search, empty state.
  - Report: the day report on the phone, and the PDF button.
  - Clients: list, search, "New client" (open and cancel only; do not save on real
    tenants), client detail.
  - More: the full menu drawer, and every destination in it (Transactions, Terminals,
    Settlements, Compliance, Team, Tables, Menu, KDS, Stock, Payroll, Reservations,
    settings, theme toggle, language switch, sign out, delete-account sheet (open and close
    only)).
  - Each destination drawer must look native on a phone: a large title, list rows instead
    of tables, and no sideways scroll.
- **Till:**
  - clock-in;
  - Floor (floor plan and list, open a table, the order builder, send to kitchen (demo
    only), the bill and payment sheets with cash and card as UI only, split, discount,
    transfer or merge table);
  - Takeaway (tiles, categories, search, the bill sheet, the payment modals);
  - Waiting list;
  - More / till tools (refunds, drawer, team, menu, end of shift, printer settings).
  - Every modal on the phone must be a bottom sheet with a grabber, safe-area padding and
    one primary action.
- **Kitchen (KDS):**
  - the pairing keypad screen (polish it to Apple passcode quality: round keys, haptic
    tick, a shake on error, dots that fill with a spring);
  - then the production screen as seen through the harness or demo: ticket cards, bump and
    recall, timers, colour states, the empty state.
- **Kiwi Team (employee app):** sign-in, floor, schedule, attendance and clock-in/out
  flows, and the empty states.

### 5c. Standard to hold every screen to (Revolut × Apple)

- One hero per screen, and one filled primary action per screen, sitting where the thumb is.
- Standard iOS chrome:
  - translucent headers that own the status bar;
  - large titles collapsing to inline on scroll;
  - half-height sheets with grabbers;
  - swipe-to-dismiss;
  - the edge-swipe back gesture where there is hierarchy;
  - tapping the status bar or re-tapping the active tab scrolls to top;
  - pull-to-refresh on live lists.
- Lists as rows: a round leading glyph, a title and subtitle, and the trailing amount and
  date, with hairline separators inside one rounded group. Use per-method glyphs for
  payments (card, cash, QR); this item is still open from the audit.
- Grouped cards with a 20 to 24 pt radius, no borders and near-zero shadow, on a tinted
  ground. Quiet 13 pt secondary labels, with the number carrying the weight.
- Empty states that teach: a glyph, a sentence, and one action. Skeleton loaders instead
  of spinners. Errors that say what happened and what to do.

### 5d. Motion and little details (the "million dollar" part)

- Every press:
  - a scale of about 0.97 with a spring;
  - light haptics on primary taps and success;
  - a warning haptic on destructive confirmation.
  - Use the Capacitor Haptics plugin if it is present; otherwise add it.
- Sheet present and dismiss follow the finger, with velocity-aware snapping. The scrim fades
  in step with the sheet.
- Numbers roll or count when they change: the revenue hero, the bill total and the pill
  total.
- Adding an item to the bill: the tile pulses and the pill's count badge bumps.
- Tab switches keep scroll position per tab and cross-fade. The liquid lens is used on
  every segmented control.
- The chart draws in on load and on period change, and a scrub gesture shows the value
  under the finger.
- Payment success is a full-screen moment: a check that draws itself, a success haptic, the
  amount, then auto-return.
- Respect `prefers-reduced-motion` for all of the above.
- Typography: tabular numerals everywhere amounts line up. Currency uses "MAD" with a
  thin space, and follows the Moroccan grouping the app already uses.
- Pixel detail:
  - consistent 16/20 pt gutters;
  - icons optically centred;
  - no double borders;
  - no orphaned words in titles (`text-wrap: balance`).
  - The app icon, launch screen and splash-to-first-frame transition must be seamless,
    with no white flash, in dark or light.

### 5e. Still-open items carried from the audit (do these)

1. A native passcode keypad for the dashboard lock, replacing the system keyboard and its
   accessory bar. Revolut-style.
2. The Kitchen and Team role polish pass (see 5b).
3. The demo-data inconsistency: the home hero shows "−16 % vs yesterday" next to a goal card
   showing "+3.2 % vs yesterday". Make the demo numbers agree. Demo only: never touch real
   tenants.
4. Per-method glyphs on order rows.
5. On the till, let the menu grid scroll under the translucent tab capsule instead of
   stopping on a solid paper band above it.

## 6. How to work

- Loop: find an issue, fix it in the smallest correct place, add or extend a test in
  `tools/native-owner-home-browser-test.mjs` (or a new suite wired into `check.js`),
  rebuild, verify on the simulator with a screenshot, then commit and push.
- Commit in coherent slices (one surface or theme per commit), and push both mirrors after
  each green run.
- Keep the audit doc current:
  - append a "Pass 2" section with the sweep checklist and a before/after note for each fix;
  - list anything deliberately left, with the reason.
- At the end:
  - `node tools/check.js` is green, apart from the known pre-existing failure;
  - both mirrors are at the same commit;
  - the worktrees are removed and nothing is staged;
  - give the owner a short report: what changed, per role, with screenshots, and what
    remains, if anything.
