# Structure plan · from 8.41 to above 9 (26 October 2026)

Owner asked on 26 October for a staged plan before any code moves. Nothing in this plan has started.

## Where the score stands

The scorecard follows the newest blind rating. Rating 10 (code f408fee2) averaged 7.85. Waves R and S closed 47 of its gaps and the card now reads 8.41 on the 42 features in use.

Rating 10 also named 65 gaps it judged not fixable in a day. They are what stands between 8.41 and 9. They are not one till problem: they spread over 37 features and fall into five kinds of work.

| Track | What it is | Gaps | Score if done alone | Running total |
|---|---|---|---|---|
| A · one owner per rule | The same rule written twice (till and server, or two trades): loyalty matching, promotion pricing, menu formulas, recipe units, catalogue merge, five translation systems, three day-report paths, two credential fields | 12 | +0.14 | 8.55 |
| B · conflict review | Two devices editing the same thing: one edit silently wins (floor plan, catalogue variant, whole-menu publication, credit book inside the shared snapshot) | 4 | +0.05 | 8.60 |
| C1 · split, outside the till | Large mixed controllers: dashboard renderers (4,343 lines), team and planning, OrderPro guest page, menu editor, stock, hotel reception, pressing, invoicing, tickets, booking, onboarding, console | 23 | +0.27 | 8.87 |
| C2 · split, the till | caisse-app.js (3,886) and caisse-accounting.js (3,008) sharing checkout state, tables, kitchen, pairing, Live Link, boutique checkout, waiter app, ~100 global scripts per shell | 12 | +0.14 | 9.01 |
| D · skins | design-vexel.css (5,915 lines, 229 !important), kit.css hiding controls by force | 3 | +0.04 | 9.05 |
| E · proof outside code | Real iPhone and background wake-up, a physical Z receipt, a real Shopify store, measured photo-reading and ticket-triage accuracy | 11 | +0.13 | 9.18 |

Two honest limits:

- Reaching 9 needs A, B, C1 and C2 together, about 51 gaps. The till split alone is worth +0.14.
- Every fresh blind rating so far has landed near 7.85 and found deeper gaps than the last (rating 9: 7.88, rating 10: 7.85). The structural tracks are the first work that should raise that floor itself, because they remove the cause a reviewer keeps citing ("a small change crosses a large shared controller") rather than one symptom.

## Order and why

1. **Track A first.** Low risk, high leverage: each rule moves into one shared module that both the till and the server import, with the existing property suites pointed at it. No screen changes. About two waves.
2. **Track C1 next, one surface per wave.** Non-money surfaces first (tickets, booking, invoicing, onboarding), then the dashboard renderers, then team and planning, OrderPro, menu, stock, hotel, pressing. About six waves.
3. **Track B** once A has given each rule one owner, because conflict review needs one place to compare two edits. Visible to merchants: the owner sees each screen before it ships. One wave.
4. **Track C2, the till, last and slowest** (method below). Four to six steps over one to two weeks, because each step waits a trading day.
5. **Track D** after C, with screenshot baselines taken first. Two waves.
6. **Track E** needs the owner's devices and accounts, so it runs alongside, whenever the owner has time.

## How the till is split safely

- **No new script tags.** kiwi-caisse.html is at its script-count ratchet. New pieces are ES modules imported by the file they leave, as pos-boutique already does.
- **Moves and changes never share a commit.** A move is proven byte for byte by a split fixture, the pattern already used for caisse-app, venues, the printer and the dashboard. A behaviour change comes in its own commit with a test that fails before it.
- **Order inside the till:**
  1. pure money and receipt functions;
  2. one checkout-session owner object with an explicit interface, replacing the shared mutable globals between caisse-app.js and caisse-accounting.js;
  3. table lifecycle and settlement;
  4. kitchen reconciliation;
  5. pairing UI apart from the PIN core;
  6. Live Link transport apart from reconciliation.
- **Proof for every step:**
  1. The full gate passes.
  2. A real run on Amira Cafe, the designated test venue, through the normal UI: cash, card and split sales, a refund, a table reopened, a kitchen ticket, an offline sale replayed. Every test order is labelled TEST KIWI and reversed.
  3. A 24-hour watch of real merchants before the next step. These are read-only database queries on Santos Store: sales count, sync errors, refused operations.
- **Deploy window:** outside trading hours in Morocco (after 23:00, before 08:00).
- **Rollback:** each step is one commit with its own stamps; reverting it restores the previous till on the next load.

## What the owner decides

- Approve this order, or move the till earlier.
- Allow till steps to deploy at night without asking each time.
- See and approve each conflict-review screen (track B) before it ships.
- Time with a real iPhone, the counter printer and the Shopify store for track E. Measured photo-reading accuracy uses only the free Workers AI models, within the zero-cost rule.

## Effort

Roughly 12 to 16 waves. A, C1 and B run back to back at one to three waves a day. The till adds one to two weeks because each step waits a trading day.
