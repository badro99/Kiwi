# Design audit 2026-10 · round 1 · ranked findings

Round 1 of the design elevation (`docs/specs/2026-10-12-design-elevation-brief.md`):
capture the whole product, then have a fresh, harsh critic score every surface.
Eight critics (Opus, one per cluster, evidence only) scored about 600 frames
captured by `tools/design-capture/` across iPhone, iPad and desktop, light and
dark, English, plus Arabic samples. Frames live outside the repo at
`/Users/zaka/Developer/kiwi-design-audit/shots/`.

Per-cluster reports, each with a scorecard, every finding (frame, element,
measurement, source line, what a 10 looks like) and its systemic patterns:
[marketing](findings-marketing.md) · [access](findings-access.md) ·
[dashboard](findings-dashboard.md) · [till](findings-till.md) ·
[verticals](findings-verticals.md) · [team](findings-team.md) ·
[kds](findings-kds.md) · [ordering](findings-ordering.md).

## Scoreboard

| Cluster | Visual | UI | UX | Motion | Feel | Copy | A11y | Honesty | Perf | Verdict |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Marketing | 4 | 4 | 5 | 0 | 0 | 5 | 3 | 4 | 0 | FAIL |
| Sign-in and setup | 4 | 4 | 3 | 0 | 0 | 3 | 3 | 4 | 0 | FAIL |
| Dashboard | 4 | 4 | 4 | 0 | 0 | 3 | 3 | **1** | 0 | FAIL |
| Till | 3 | 3 | 3 | 0 | 0 | 2 | 2 | 3 | 0 | FAIL |
| Business-type tills | 3 | 3 | 3 | 0 | 0 | 2 | 2 | 4 | 0 | FAIL |
| Team app | 4 | 4 | 4 | 0 | 0 | 3 | 4 | 5 | 0 | FAIL |
| Kitchen screen | 4 | 3 | 3 | 0 | 0 | 2 | 3 | 5 | 0 | FAIL |
| Online ordering | 4 | 4 | 4 | 0 | 0 | 5 | 3 | 4 | 0 | FAIL |

Motion, Feel and Performance are 0 everywhere by rule: still frames cannot
prove them. Round 2 needs screen recordings at 60 fps (normal and reduced
motion), a device haptics trace and INP/CLS traces on an iPhone 12 before those
columns can score at all.

## The eight root causes, ranked by how many scores they move

Almost every one of the roughly 400 findings traces back to one of these.
Fixing a cause fixes its findings everywhere; fixing findings one by one does not.

1. **Numbers that do not come from one place** (Honesty, every cluster).
   The demo clock drives some tiles while static seeds drive their neighbours:
   today's revenue has four values, yesterday three, customer status disagrees
   for 5 of 8 customers, the goal, payroll and fixed costs each have two. The
   till journal is re-randomised with `Math.random` on every load; two demo
   stores share one sales total and ticket number. One ledger reader for every
   figure, one segmentation function, seeded deterministic demo data.
   (dashboard §5.1-2, till §5.2, verticals §5.7)
2. **Translation by matching French text after render** (Copy, every product
   cluster). `assets/caisse-lang.js` and the team app's dictionary only catch
   strings they already know, after the screen paints. Anything built in a JS
   template stays French: 8 of 16 till screens, 15 of 17 business-type tills,
   the team app's money screens, the kitchen board, every aria-label.
   Homonyms mistranslate ("Remise" becomes "Discount"). Keyed strings with
   FR/EN/AR entries, and a gate that fails on French in an EN frame.
3. **No shared component layer** (Visual, UI, Consistency). Four PIN keypads,
   two kitchen screens, two guest-ordering apps 4 175 lines apart, 17 till
   anatomies, three primary-button styles per surface, 27 to 36 font sizes per
   page, 13 radii. One component set: PIN pad, sheet, primary/secondary button,
   segmented control, cart panel, page header, ticket, list row, empty state.
4. **Dark and light are half-built** (Visual, A11y). Sign-in, printer page,
   guides, all three guest-ordering pages and the QR poster have no dark mode;
   parts of the till stay dark in light mode. Two dark systems disagree
   (`data-theme` and `data-vexel-mode`), raw hex and rgba escape the tokens,
   and the bare `section{padding:96px 0}` in `assets/tokens.css:208` pads app
   surfaces. One token set with light and dark values, used by every surface.
5. **Phones and tablets are compressed, not designed** (UX, UI). The kitchen
   board collapses to 35 pt columns on iPhone, three business-type tills are
   unusable on iPhone, the team app and guest ordering render as a drawn phone
   on iPad, iPad dialogs are shrunken phone sheets with 11 px labels.
6. **Type and targets below the floor** (A11y). Hundreds of 9 to 11 px
   declarations, sizes in px (Dynamic Type does nothing), targets of 26 to
   40 pt, contrast from 1.02:1 to 2.9:1 on status dots, timers and buttons,
   pinch zoom disabled on the public ordering pages.
7. **Destructive and account actions in work surfaces** (UX). "Delete my
   account" in the cashier menu and the dashboard sidebar; Cancel table 8 pt
   under Take payment; "Cancel a sale" opens "Reprint a receipt"; Log out next
   to Clock in.
8. **Icons outside the system** (Visual). Hand-drawn SVG and Lucide across the
   till art, 17 business-type icon sets, the kitchen screens, the guest flow and
   the landing, against the Material-only rule.

## Fix now: not taste, correctness and trust

These do not wait for the redesign. Each is a factual, safety or trust problem
a merchant or guest can hit today.

| # | Problem | Where | Report |
| --- | --- | --- | --- |
| 1 | Landing claims "end-to-end encryption"; the product encrypts in transit and at rest, and Kiwi IQ reads figures server-side | landing (Next.js source, not this repo) | marketing L12 |
| 2 | Pricing shows Basic, Pro, "Custom"; Kiwi Ultra (1 499 MAD) is missing and the fourth tier is "Ultimate" | landing | marketing L13 |
| 3 | QR poster promises "Apple Pay, wallet Kiwi"; the flow is pay at the counter, and Kiwi Wallet is Phase 2 | `cafe-atlas-qr.html:964` | ordering |
| 4 | "Delete my account" in the till menu on a shared counter device and in the dashboard sidebar | `app/src/native-runtime.js:850` | till, dashboard |
| 5 | "Cancel a sale" opens a sheet titled "Reprint a receipt" | `kiwi-caisse.html:10899-10909`, `assets/pos-reprint.js:583` | till |
| 6 | Opening float pre-selected at 500 MAD: one tap records it whatever is in the drawer | till clock-in | access |
| 7 | Espresso gets "Sweet" sugar by default and the cart line hides it | `kiwi-order.html:4146` | ordering |
| 8 | No self-serve password reset on the web sign-in | `functions/_middleware.js:1176-1183` | access |
| 9 | Printer bridge page tells merchants to bypass Gatekeeper and pipe `curl | bash` from a personal repo; iPhone is offered a macOS download | `printer.html:110-115, 157` | access |
| 10 | Team app "browse without clocking in" only hides tabs; Take payment stays live | `kiwi-serveur.html:2724-2735` | team H-1 |
| 11 | Business type pre-selected as Restaurant in the setup wizard | `assets/onboarding.js` | access |
| 12 | The "other trade" till cannot sell anything (empty catalogue, no add action) | `assets/pos-autre.js` | verticals |
| 13 | Kitchen screen on the web opens in French whatever language the owner chose | `kiwi-cuisine.html:1054-1057` | kds S1 |

Checked by the lead and **not** a problem: the demo till codes printed on the
PIN screen render only in the demo (a paired till draws its own screen, and the
legend is off when `KiwiEnv.demosAllowed === false`).

## What a 10 needs that does not exist yet

- **Evidence tooling.** Recordings, a haptics trace and INP traces, so Motion,
  Feel and Performance can be scored at all. Haptics on iOS need a Capacitor
  Haptics bridge: `navigator.vibrate` is a no-op in WKWebView, and only three
  of seventeen business-type tills call haptics at all.
- **The landing's source.** It ships here as a compiled Next.js export; its
  fixes belong in the site project.
- **Capture coverage.** Arabic on every surface, the 1st floor of the floor
  plan, empty, error, offline and 200-item states, and a re-capture of the
  role-picker frames (they came out flat).

## Next: round 2, direction

Per the brief (Phase 3) the lead now writes one direction spec and a visual
proposal (tokens, type scale, component set, motion and haptics language)
built to answer the eight root causes. The critic must score the proposal 10
on every dimension it can judge before it goes to the owner, and the owner
approves the direction before anything is built. The "fix now" list can ship
in parallel, under the current brand lock, as ordinary fixes.
