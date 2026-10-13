# Critic review: Kiwi design 2027 direction (round 12, revision 11)

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual | 9 | The lock's title uses "Title 2", which is not one of the six type steps. The §18.9 Difference figure has no arrow. |
| UI | 9 | The lock's anatomy disagrees with the §10.2 pad it is built on (Title 2 against Heading). The sync indicator has two conflicting visibility rules. |
| UX | 7 | Leaving the lock shows A's staff pad, but the spec says "the till comes back as it was". A third store's code entered on the lock is not covered. The open-pane sale has no cashier. |
| Motion | 10 | All springs settle as stated (300 to 308, 333 and 367 ms; ζ 0.9996). No findings. |
| Feel / haptics | 10 | The haptics map is consistent across the till, the lock and the pad. No findings. |
| Copy | 8 | The M5 rule "every delta is an arrow and a signed value" is broken in three places the spec writes itself. The lock wording is ambiguous in EN and off-vocabulary in FR. |
| Accessibility | 9 | §18.0 claims the light-frame checks run on home-ar, but home-ar is drawn dark only, so Arabic light Home is never verified. |
| Honesty / consistency | 6 | The §6.1 census says 48 pages and is false again (52). The §10.26 call list is presented as complete and misses about ten channels. §18.3 and §18.0 make stale claims. |
| Performance | 10 | No findings. |
| Feasibility / migration | 6 | `sale-unsynced-test` cannot pass as written. The lock leaves store B's inbound pollers unaddressed. The stage 1 font placement rule does not cover the 11 pages served through the Next chunk. |

## 2. Verdict

**FAIL.** Six dimensions are below 10.

## 3. Rebuttal rulings

- **Rebuttal 1 (shareWeighted largest remainder): ACCEPT.** The shipped code at `kiwi-caisse.html:13490-13506@31c94529` does what the rebuttal says, and the fixture reconciles.
- **"Corrections of fact": ACCEPT IN PART.**
  - **Accepted:** `kiwi-admin.html` names no Plex anywhere. Round 10 missed the 18 `article.css` pages (17 guides plus `docs/templates/article.html`). My own script confirms both.
  - **Rejected:** the corrected total of 48. At 31c94529 there are 52 pages:
    - 18 load a Google Plex link in their markup.
    - 29 get Google Plex through a stylesheet: the 18 `article.css` pages, plus 11 pages served through the Next chunk `_next/static/chunks/1d07ha593kf43.css`, which opens with `@import "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic..."`. Those 11 are the 8 landing pages and `ar/`, `en/` and `fr/robot/index.html`.
    - 5 have no Google Plex.

    The rebuttal repeats the class of error it was correcting.

## 4. Findings, ranked

### Major

**M1 · §10.26 store lock · The call table is not "the list known at 31c94529".**
- **Finding:** the table omits about ten store-keyed channels. Several are inbound, so store B's data keeps merging into A's in-memory service while the lock is up.
- **Evidence:** all at `kiwi-caisse.html@31c94529` unless named:
  - `/api/menu?merchant=` (`fetchCarte`, :9414), polled every 6 s (:19124) and re-run on `kiwi-paired` (:19117).
  - `/api/team/live` at :7427, :17480, :17644 and :17733.
  - `/api/feed?merchant=` at :14949.
  - `/api/service/events` at :8795 (table locks) and :11843 (`table-seated`).
  - `/api/order/queue` at :9474, :12009 and :12144 (expiry, transfer, merge).
  - The orderpro-inbox bridge every 6 s, which turns guest orders into till tickets (~:21436).
  - `caisse-refresh.js` `KiwiCloudDoc.pullAll` every 30 s.
  - The autosave every 5 s (:23159) and `publishServiceFloor` every 4 s (:23160).
  - The vertical `postSale` callers that bypass the guard: `pos-boutique.js` :3327, :3699 and :3804; `pos-maison.js`; `pos-sale.js:348`; `hotel.js:2362`; `z-reconciliation.js:147`; and `postRefund` (`live-link.js:974`, which calls `postSale` at :979).
  - Missing successor path: the shipped success path runs `/api/pair/recover {merchant:B}`, then `KiwiLive.flush(true)`, then `bootWithPin(B)`, which fetches `/api/config?merchant=B` and shows B's staff pad (`caisse-pairing.js@31c94529`, `submit()` ~:567 and `confirmTillProof`). The spec does not say how the lock takes its place.
- **What a 10 looks like:** one choke point that every timer and every `postSale` passes through (for example a `KiwiTenantGate.allowed()` check inside `fetch` wrappers and `postSale` itself, not at its callers). Plus a complete table: outbound, inbound and timers, each marked stopped or allowed under the lock. Plus a stated replacement for the `bootWithPin(B)` path.

**M2 · §21 / §10.26 · `sale-unsynced-test` cannot pass as written.**
- **Finding:** the test requires that no request carries B's pairing token while the lock is up. That cannot hold.
- **Evidence:**
  - `functions/auth/_lib.js:377-381`: `tillCookie` and `terminalCookie` are `Path=/; HttpOnly`. The browser attaches them to every same-origin request, including the allowed `/api/pair/redeem` and plain static files. Page code can neither strip them nor see them.
  - `/api/pair/recover` carries B's merchant in its body by design.
- **What a 10 looks like:** the assertion names what can actually be controlled. For example: no request to an endpoint on a stated store-keyed list, and no `merchant=B` in a query or body except `/api/pair/redeem` and `/api/pair/recover`, checked at the network layer. The cookie behaviour is named as out of scope.

**M3 · §10.26 exit and §10.2 · "The till comes back as it was" is false on the shipped path.**
- **Finding:** pairing back to A does not restore A's till as it was.
- **Evidence:**
  - `applyPairing`'s `onTenantSwitch` (`caisse-pairing.js:220-234@31c94529`) calls `setStaff(null)`, so returning to A lands on A's staff pad.
  - If the spec is taken literally (focus returns to the till's first heading with the till restored), it skips the F8 staff gate.
  - In the open-pane case, the cashier was already cleared when the lock went up, so the sale's actor is undefined.
- **What a 10 looks like:** the exit says it ends on A's staff pad, with focus on the pad's title. The held sale keeps the actor captured before the switch. The spec states that the F8 gate is never skipped.

**M4 · §6.3 M5 rule against §10.22, §18.6 and §18.9 · Three places break "every delta is an arrow and a signed value".**
- **Finding:** the spec's own copy and fixture contradict the rule.
- **Evidence:**
  - The §10.22 chart summary reads "down 1,127 MAD", which is unsigned.
  - `ai.today_down`, `ai.today_up` and the §18.6 card read "1,127 MAD less than yesterday at the same time". The live preview draws this text, and check 1 enforces the unsigned form with `money(Math.abs(d), 0)`.
  - §18.9 shows the Difference as "−18.00 MAD" with no arrow, and its width measurement leaves an arrow out.
  - Signing the sentence values ("−1,127 MAD less") would produce a double negative, so the rule as written cannot be applied to sentences.
- **What a 10 looks like:** §6.3 defines its scope. For example, "a delta shown as a figure carries an arrow and a sign; a delta inside a sentence is unsigned and carries its direction in a word". It then states whether the cash Difference is a delta (arrow, re-measured) or a balance (no arrow, and named as an exception).

**M5 · §6.1 / §21.1 stage 1 · The Plex census of 48 is false, and stage 1's green claim fails.**
- **Finding:** the count, two of its claims and its placement rule are wrong or incomplete.
- **Evidence:** at 31c94529 the count is 52 pages (see the ruling in section 3).
  - The 8 landing pages already get Google Plex through the Next chunk's `@import`, so the promised "visible change at stage 1" for them is false.
  - The 3 robot pages are not counted, so "green at stage 1, because stage 1 links it on all 48" cannot be true.
  - The rule "self-hosted face placed before the Google source" says nothing about the 11 pages where the Google source is an `@import` inside a built CSS chunk.
- **What a 10 looks like:**
  - A census produced by a committed script, listing all 52 pages under the source by which each gets Plex: markup link, `article.css`, Next chunk, or none.
  - A stated stage 1 plan for the Next chunk: rebuild it, or override it with an `@font-face` that loads before it.
  - A test that walks the HTML files rather than a hard-coded list.

### Polish

- **P1 · §10.26 type.** "Title 2" is not one of the six steps in §6.2, and the §10.2 pad anatomy the lock reuses gives this title as Heading. *A 10:* the lock's title is "Heading", or §6.2 gains the step.
- **P2 · §18.3 (spec line ~2964).** "The sync indicator sits above it when the outbox is not empty" is stale. §10.26 now says it is visible while any of rows 1 to 7 applies, including rows that have nothing to do with the outbox, such as storage_error and waiting_store. *A 10:* §18.3 refers to §10.26's rule.
- **P3 · §21.1 stage 4.** "Entering B's code again leaves the lock" reads as if a second entry of B's code dismisses the lock, while §10.26 says the lock stays until A is paired again. *A 10:* one sentence that matches §10.26.
- **P4 · Stage 3a.** It says "PIN pad on its six uses"; §10.2 now lists seven. *A 10:* "seven", or the list is referenced instead of counted.
- **P5 · §18.0 and the preview (also behind the Accessibility score).** The spec says the checks run on "every light frame ... including home-ar", but the preview draws home-ar dark only. Confirmed from the page: the frames are `home:light home:dark home-ar:dark home-se:light`, and so on. *A 10:* home-ar is drawn light too and the contrast checks cover it, or the sentence drops home-ar.
- **P6 · Preview, self-test intro.** The text lists the R, S, T, U and V rows and leaves out W, the revision 11 rows. *A 10:* the intro names W and its count.
- **P7 · Copy, `lock.store.memory`.** "Its sales ..." has an unclear referent: the store, the device or the service. In FR, the lock uses "bloquée/débloque", but the till's lock vocabulary is "verrouiller/déverrouiller". *A 10:* "Sales from [store A] on this till ..." and the till's verb throughout.
- **P8 · §10.2 / §10.26.** The lock accepts any store code on its pad. A third store's code (C) re-pairs the device to C while A's held service is still waiting, and the spec does not say what happens. *A 10:* the lock either refuses codes for anything but A (with a message and a separate "Pair a different store" exit that names the A data it will hold), or describes the A to C move and what happens to A's held copy.

## 5. Checked and found correct

**Fixture arithmetic and geometry**
- All fixture arithmetic, recomputed by hand:
  - The day: 19,174 MAD from 137 orders.
  - The deltas: −1,127, −5.6%, −13, +4 and +1 pt.
  - Table totals, order amounts, KDS station counts and customer segments.
  - The close: 25,310 total, 8,920 expected, 8,902 counted, a difference of −18. This matches `day-report.js:719`, where cash sales are already net of cash refunds.
- Spring math: settle times of 300 to 308 ms, 333 ms and 367 ms; ζ 0.9996.
- Floor-fit geometry and the scales when the pane is open; the gaps in §18.1, §18.10 and §18.11; tile widths; payment-pane coordinates.
- The attendance timer math based on `now` (P9).

**Shipped-code citations**
- The `pairing-commit.js` purge citation (`commit()` :55-118, `purgeTenantData` :86).
- `kiwiHeldService:` survives the `TENANT_KEYS` prefixes in `tenant-purge.js:44-45`, so the stage 4 held copy is sound.
- `kiwi-admin` names no Plex.
- The list of 18 pages with a Google link in their markup is correct.

**The preview, in Chromium 152**
- Fixture checks pass 17 of 17.
- The mutation self-test catches 109 of 109.
- Kit tests pass: icons 231 of 231, segmented controls hit 44 px, and the face measures 136.1 against 136.1.
- My own six mutations against the live check runner were all caught by check 1:
  - The Card share delta painted in danger red.
  - The Orders delta arrow removed.
  - The home-se baseline set to 17:40.
  - The Arabic basket delta set to −12.
  - The home-se card share set to 67%.

  The checks are real, not decorative.
- Check 15's model of the paid line, the sync rows, the banner, the lock and the heartbeat replay matches §10.26's own rules, and every held entry is shown either by the lock or by row 5.

**Housekeeping:** the HTTP server on port 8765 is stopped and its tab is closed. My scratch files (`cp.js`, `kc.html`, `ll.js`) are deleted. No repo file was edited, staged or committed.
