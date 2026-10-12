# Kiwi design elevation · brief

Owner request, 2026-10-12, rewritten as an executable brief for a multi-agent team.

## The goal

Take every Kiwi surface to the level a Revolut or Apple design team would ship if
they built the product from a blank page: UI, UX, information design, motion,
haptics and the feel of every interaction. Not a reskin. A product that a merchant
can run a full service on without thinking, and that looks unmistakably like Kiwi.

Success is judged on the merchant's real screens, at real sizes, with real data
shapes. It is not judged on mockups.

## What "better" means here (the rubric)

Every screen is scored 0 to 3 on each line. A screen ships when nothing is below 2
and the average is at least 2.6.

1. **Hierarchy.** One primary action per screen, obvious within one second. The
   number that matters is the largest thing on the page.
2. **Density.** A busy service fits on the screen it is used on. No scrolling to
   reach the pay button. No card holding one word.
3. **Consistency.** One control per job across the whole product: one segmented
   control (the liquid lens), one sheet, one list row, one empty state, one toast.
4. **Type.** Inter Tight, upright, a short scale (no more than six sizes per
   surface), tabular figures for every amount, IBM Plex Sans Arabic in Arabic.
5. **Colour.** The locked tokens only. Contrast WCAG AA at minimum, measured on
   what actually paints in both themes.
6. **Motion.** Every transition explains where something came from or went. One
   spring (`cubic-bezier(0.34, 1.45, 0.5, 1)` · 310 ms) and a short set of
   durations. Interruptible. Reduced motion parks every animation at a true frame.
7. **Haptics.** Every tap that changes state has the right feedback, from one map
   (below). Nothing buzzes for decoration.
8. **States.** Loading, empty, error, offline and "demo data" are designed, not
   left as defaults. Skeletons match the real layout.
9. **Language.** No French leaking into English or Arabic. RTL mirrors layout and
   motion direction. Numbers stay LTR inside Arabic.
10. **Honesty.** No invented figures, no labels that disagree between screens
    (one customer cannot be "Dormant" on one page and "Visiting less often" on
    another), no button that does nothing.
11. **Touch.** 44 pt minimum targets, thumb-reachable primary actions on phone,
    no hover-only affordances.
12. **Speed.** Interaction to next paint under 200 ms on an iPhone 12. No layout
    shift on load. Animations hold 60 fps on device.

## Non-negotiables (from CLAUDE.md and the owner)

- Real product, paying merchants. Santos Store and every other merchant except the
  Amira Cafe restaurant venue are production data: read-only, never test on them.
  Use demo surfaces, `kiwi-ui-qa` fixtures, and Amira Cafe (restaurant only) for
  anything that writes.
- **Brand lock lifted for the proposal (owner, 2026-10-12).** The direction
  phase may propose new tokens, type scale, iconography and visual language from
  scratch. Until the owner approves that direction, the current lock still
  governs anything built: `--atlas #0B6E4F`, `--riad`, `--mint` (accent under
  5 %), `--paper #F7F5F0` (never pure white), `--ink`, Material Symbols, the
  liquid lens. What stays regardless: no italics as fake emphasis, no em dashes
  in user copy, no emoji in titles or CTAs, every icon from one licensed set.
- Shipped surfaces are not rewritten as a side effect. Each redesign is staged
  behind a switch, verified against real data shapes, and the old path stays until
  the new one is proven.
- Every asset edit moves its stamp with `node tools/bump-stamp.js`. The gate is
  `node tools/check.js`; a new test that `check.js` does not name guards nothing.
- Commit by path, never `git add -A`. Push `main` to both mirrors by URL. Never
  force-push.
- FR, EN and AR move together. The caisse uses `assets/caisse-lang.js`, the
  dashboard `assets/i18n.js`.
- Credentials and codes are never printed, logged or committed.

## Surfaces in scope

Capture and judge all of them before designing any of them.

- **Marketing.** Landing in seven locales, guides hub and articles, pricing.
- **Onboarding and access.** Sign-in, role picker, setup wizard, dashboard lock,
  till lock, clock-in, pairing (till and printer).
- **Owner dashboard.** Home, Orders, Daily report, Customers, Customer retention,
  Terminals, Compliance, Team, Planning, Reservations, Floor plan, Menu and
  modifiers, Stock and procurement, Menu analysis, Kiwi AI, notifications,
  settings, operator view.
- **Till (caisse).** Floor (list and map), takeaway, waiting list, menu builder,
  bill sheet, payment, split, refund, cancel a sale, cash movement, till
  handover, end of shift, kitchen screen, stock, customers and loyalty, and the
  fourteen `pos-*` verticals.
- **Team app, KDS, customer ordering (QR / OrderPro).**
- **Native shell.** iPhone and iPad (Capacitor), tab bar, drawer, sheets, status
  bar, safe areas, keyboard, haptics.

## Device, theme and language matrix

| Device | CSS size | Notes |
| --- | --- | --- |
| iPhone 6.9" | 440 × 956 | App Store size, native shell |
| iPhone SE | 375 × 667 | smallest supported |
| iPad 13" | 1032 × 1376 | App Store size, docked till |
| iPad landscape | 1376 × 1032 | counter mount |
| Desktop | 1440 × 900 | dashboard on a laptop |

Each in light and dark, and in FR, EN and AR (RTL). That is up to 30 frames per
screen. Capture the phone and iPad in all six combinations. On desktop,
EN light and AR dark are enough.

## Team and model routing

| Role | Model | Job |
| --- | --- | --- |
| Lead | Opus | Owns this brief, the design direction, merges, final review |
| Capture | Haiku | Drive fixtures and demo, take the screenshot matrix, write the manifest |
| Critique | Opus | Score each surface on the rubric, rank findings with evidence |
| Direction | Opus | Write the design system spec and the haptics and motion maps |
| Build | Sonnet | Implement one surface per agent, in its own worktree |
| Review | Codex (second opinion) plus Opus | Diff review, a11y, RTL, honesty |
| Critic | Opus, fresh per review | Scores each round 0 to 10 per dimension; only 10/10 passes |

Agents get self-contained prompts: file paths, the rubric, the non-negotiables,
the fixture to use, and the exact output format. No agent edits outside its
surface.

## Rounds and the critic gate (owner, 2026-10-12)

All work moves in rounds. A round is one coherent unit (the direction, one shared
component set, one surface). A round passes only when the critic scores it
**10/10 on every dimension**. Anything less sends it back with the critic's list,
and the same round runs again. There is no "good enough" exit.

**The critic.** One Opus agent, spawned fresh for every review so it carries no
loyalty to earlier work. It plays a principal designer from Apple's Human
Interface team who has also shipped Revolut's app: harsh, specific, unimpressed
by effort. It never sees the builder's reasoning, only the evidence pack:
- the screenshot matrix for the round (device × theme × language);
- screen recordings (or frame strips) of every animated transition at 60 fps;
- the haptics trace (which interaction fired which feedback);
- measured numbers: contrast ratios, touch target sizes, INP, layout shift,
  frame times, text that overflows or truncates;
- the before frames, so regressions are visible.

**Dimensions, each scored 0 to 10.**

| Dimension | 10 means |
| --- | --- |
| Visual design | Nothing to remove, nothing to add. Every pixel on a grid, one type scale, colour with intent. Indistinguishable in finish from a first-party Apple app. |
| UI | Every control is the canonical one, every state designed (rest, pressed, disabled, loading, error, empty). No orphan element. |
| UX | The primary task takes the fewest possible steps, is obvious to a first-time cashier, and is impossible to get wrong under service pressure. |
| Motion | Every transition explains a change of place or state, is interruptible, springs consistently, holds 60 fps, and parks correctly under reduced motion. |
| Feel and haptics | Feedback lands on the right frame with the right weight. The app feels physical and calm, never buzzy. |
| Copy and language | Short, human, consistent across FR, EN and AR. No leaks, no truncation, correct RTL. |
| Accessibility | AA contrast everywhere, 44 pt targets, VoiceOver and Dynamic Type work, focus order is sane. |
| Honesty and consistency | Every number agrees with every other screen. No invented data, no dead control. |
| Performance | INP under 200 ms on an iPhone 12, no layout shift, no jank. |

**Rules for the critic.**
- A score of 10 needs zero findings on that dimension. One finding caps it at 9.
- Every finding has evidence (frame, recording timestamp or measured number),
  the exact element, and what a 10 would look like. No vague taste notes.
- The critic may not soften a score because the round already ran several times.
- If the critic cannot verify something from the evidence (for example, haptics
  without a trace), that dimension scores 0 until the evidence exists.

**Rules for the builders.**
- Fix every finding or rebut it with evidence. A rebuttal goes to a second, fresh
  critic, never back to the one who raised it.
- Every three failed iterations of the same round, the lead sends the owner a
  short status: scores, what is blocking 10, and what would unblock it.
- Passing a round never relaxes the non-negotiables above or the `check.js` gate.

## Phases

### 0 · Ground truth (lead, 1 pass)
Read `CLAUDE.md`, `docs/handoffs/HANDOFF.md`, the `kiwi-dna` skill and
`assets/tokens.css`. List every surface with its entry file and how to reach it
in demo. Output: `docs/audits/design-2026-10/surfaces.json`.

### 1 · Capture (Haiku, parallel by surface cluster)
Use `kiwi-ui-qa` fixtures, the demo, and the iOS simulators. Unregister service
workers and clear caches before capturing a web surface. Save to
`docs/audits/design-2026-10/shots/<surface>/<device>-<theme>-<lang>.png` with a
`manifest.json` row per frame (route, steps taken, data source). Capture states
too: empty, loading, error, offline, long names, Arabic, 200-item menus. The
App Store screenshots already taken (`app/ios/build/app-store-screenshots/`)
count as the iPhone and iPad EN-dark baseline.

### 2 · Critique (Opus, one per cluster)
Score every screen on the 12-point rubric. Each finding has a screenshot, the
file and line that causes it, severity (blocker, major, polish) and a one-line
fix direction. Output: `docs/audits/design-2026-10/findings.md`, ranked.
Known so far: iPad dashboard quick actions and account links render as bare
WebKit buttons; the phone floor map overflows and overlaps labels; free-table
dots are invisible; Customers and Retention disagree on a customer's status;
Report's "yesterday" disagrees with Home's "vs yesterday"; the till's tile art
is hand-drawn SVG against the Material-only rule.

### 3 · Direction (Opus, owner approval gate)
One spec, `docs/specs/kiwi-design-2027.md`, plus a published HTML page with
before and after for the six highest-traffic screens (dashboard home, orders,
till menu and bill, floor, customers, Kiwi AI). It defines:
- principles (five at most) and the rubric above;
- token evolution inside the locked palette: elevation, radii, spacing scale,
  type scale, surface layers for both themes;
- the component inventory, one canonical version each, with states;
- the motion map: which transition uses which duration and curve, shared
  element moves, sheet physics, list insert and delete, number roll on totals;
- the haptics map below, wired through Capacitor Haptics with a web no-op;
- what is deleted (duplicated controls, dead pills, decorative chrome).
Nothing is built until the owner approves this page.

### 4 · Build (Sonnet, one surface per worktree)
Staged behind a skin switch so the old path keeps working. Shared components
first, then surfaces in order of traffic. Each change ships with: before and
after screenshots from the matrix, tests wired into `check.js`, stamps moved by
the tool, FR, EN and AR strings. Open-source code is allowed under MIT, Apache
2.0 or ISC with the licence kept in the repo; prefer behaviour patterns (Radix,
Vaul-style sheets, Motion) over importing a design that is not Kiwi's.

### 5 · Verify
Real clicks, not synthetic events. The full matrix again, reduced motion,
VoiceOver labels on the native shell, a performance trace on an iPhone 12 class
device, haptics felt on a real phone through TestFlight. A surface that loses a
rubric point it had before does not ship.

### 6 · Ship
Commit by path, push both mirrors, cut a TestFlight build from the deployed
commit, refresh the App Store screenshots from the new build.

## Haptics map (starting point)

| Interaction | Feedback |
| --- | --- |
| Tab, segment, pill change | selection |
| Add item to bill, stepper +/- | impact light |
| Send to kitchen, open till, confirm table | impact medium |
| Payment accepted, shift closed | notification success |
| Code wrong, payment declined | notification error |
| Destructive confirm (void, refund) | notification warning before, none after |
| Long press, drag start | impact soft |
| Pull to refresh threshold | impact light, once |

## Deliverables

1. `surfaces.json`, the screenshot matrix and its manifest.
2. `findings.md`, ranked, with evidence.
3. `kiwi-design-2027.md` and its published before and after page (approval gate).
4. Staged implementation per surface, each green on `check.js`.
5. A TestFlight build and new App Store screenshots.
6. A short changelog for the business partner, written for a non-designer.
