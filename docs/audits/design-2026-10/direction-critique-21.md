# Design direction · round 22 critique of revision 21

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | No findings. The preview's font files are byte-identical to fontsource. The `@font-face` order and descriptors match §6.1. The string-table characters fall inside the declared ranges. |
| UI | 10 | No findings. Anatomy, sizes and states are consistent in every section I read. |
| UX | 8 | One major: on the iPad app, the store lock's only exit without a code is "reload the page", and the pad that its one button opens has no way back. One polish: "Contact Kiwi" names no channel. |
| Motion | 10 | No findings. The store-lock entrance, its reduced-motion form and its exits agree across §14 and §10.26. |
| Feel and haptics | 10 | No findings. One haptic per gesture holds, and no successful code buzzes. |
| Copy and language | 9 | `lock.store.reload` tells the cashier to reload "the page" on surfaces that have no reload control (part of UX major 2). The Arabic count of 470 is right by the spec's own rule. |
| Accessibility | 10 | No findings. `aria-disabled` keys, focus on the lock title, and the two live regions are consistent. |
| Honesty and consistency | 7 | Two majors: a second Face ID path that opens both the dashboard and the till with no code is never named, and the designed Face ID has no tier rule offline. Two polish items: the preview's selection state is neither checked nor disclosed, and §22 omits the removal of the same-browser pairing fallback. |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 8 | The designed Face ID conflicts with `tools/biometric-unlock-test.mjs`, which runs in `check.js` on main and requires a code-free unlock. The spec does not plan that test's change. |

## 2. Verdict

**FAIL.** Four dimensions are below 10.

## 3. Rebuttal rulings

1. **Largest remainder: ACCEPT.** `shareWeighted` at `kiwi-caisse.html@31c94529:13490-13506` floors each share, then hands out the leftover centimes by `b.frac - a.frac || a.i - b.i`. That is exactly the rule the rebuttal states.
2. **No Cancel in the roster step: ACCEPT, now moot.** Revision 21 removes the roster step (§10.26 "Removed", §22). The rebuttal now says it no longer describes the body, which is true. It defends nothing live. (UX finding 2 below is a different gap: the pad that the lock opens has no exit.)
3. **No kept clock-in time, no code fetch from the team app: ACCEPT.** The cited lines are unchanged from round 21's verification (`employee.js` `inTs: now` after the expiry check; `team/live.js:151` `allowTill`).
4. **No pairing-state check after a timed-out redeem: ACCEPT.** Cookies are set on the lost response and `pair/state` needs `merchant`. The only complete fix is the idempotent redeem keyed on `terminalId`, which §10.2 names.

## 4. Findings, ranked

**1. Major · Honesty and feasibility (security) · §10.2, the dashboard lock's Face ID row and the till lock.**
- **Finding.** The spec names one shipped Face ID path, `tryFace` → `unlockAs`. A second biometric path opens both the dashboard and the till with no code, no stored Face ID record and no server call. The spec never mentions it.
- **Evidence.**
  - `app/src/native-runtime.js@ae45b301:1864-1879` (`handleNativeAppState`): after 20 minutes away, the app sets `kiwi:native:biometric-pending` and reloads. `assets/idle-lock.js:182` on main sets `kiwiIdleLockReason` and reloads too.
  - `maybePromptBiometricUnlock` (`:1882-1910`) then calls `authenticateBiometric()` (device biometrics, `KiwiPrinterSocketPlugin.swift:366-378`).
  - On success it calls `__kiwiLock.reveal()`, which is `skipToApp()` (`dashboard.html@a8158aad:6302`, `:6637`). On the till it calls `window.__kiwiUnlockApp` → `unlockApp()` (`kiwi-caisse.html` on main, `:13997`, `:14015`), which skips the staff pad.
  - `tools/biometric-unlock-test.mjs`, wired into `check.js:1415`, asserts both: "kiwiIdleLockReason alone is pending and successful biometrics reveals the lock" and "successful biometrics uses the caisse unlock hook".
  - A search of the spec for "idle", "relock" and "biometric" finds only the §20.3 haptic row at 1640.
- **Why it fails.** Built as written, the designed Face ID ("asks the server first", "a 'no' deletes the record") leaves this path open. So the dashboard still opens after an idle relock with no server judgement. The till opens with no staff identity, which defeats the till lock's own rows ("every code door of the till goes through `verifyCode`"). The new `dashboard-pin-migration-test` Face ID assertions would pass while `biometric-unlock-test` keeps asserting the opposite.
- **What a 10 looks like.** §10.2 names `maybePromptBiometricUnlock` as a shipped deviation for both locks. The design says what an idle relock does: the same server-proof rule as `tryFace` for the dashboard, and for the till either the staff pad or a stated till rule. `biometric-unlock-test`'s two "reveals" checks are listed as changing at the stage that lands it.

**2. Major · UX and copy · §10.26 (the screen, the pad, "Reloading"), `lock.store.reload`, §10.2 store-lock row.**
- **Finding.** On the till as it is deployed, the lock's only exit without a code is a reload that has no control. And once the cashier taps the button, the screen that explains that exit disappears with no way back.
- **Evidence.**
  - The till runs in the native iPad app (`app/ios/build/app-store-screenshots/final/ipad-13/02-till-bill.png`) and as a standalone PWA (`kiwi-caisse.html` on main, `:5693-5695` manifest and `apple-mobile-web-app-capable`; `:5978-5979` display-mode standalone). Neither shows a browser reload control.
  - `pairBack` hides the screen (`till-tenant.js@762bb255:294`), and `check` keeps it hidden while the pad shows (`:307`).
  - The shipped pad (`renderPairPad`, `caisse-pairing.js@762bb255:455-490`) has only digits, C and backspace: no Back or Close.
  - §10.2's store-lock row adds no Plain. §10.26 says "Nothing else differs".
- **Why it fails.** A cashier without a code taps "Pair back" and is stuck on a pad with no way back to the explanation. The explanation itself tells them to do something the app offers no control for.
- **What a 10 looks like.** The lock screen gets a second action, for example "Open the till without this service", which does the reload. The pad that the lock opens gets a Plain Back to the screen. The reload copy does not assume a browser. Each is listed as a sixth difference with its reason.

**3. Major · Honesty and consistency · §10.2, Face ID "Designed", offline.**
- **Finding.** The designed offline Face ID unlock has no access-tier rule, so it contradicts the rule for typed codes.
- **Evidence.**
  - Offline, a typed manager code unlocks only while the account's list has not loaded (Read row; `localVerify`, `dashboard.html@a8158aad:5975`). Owner decision 14(b) accepted exactly that bound.
  - The Face ID design says only that the record opens the lock "within 7 days of the server's last yes".
  - Shipped `readFaceUnlock` and `unlockAs` accept `owner|manager|staff` (`native-runtime.js@ae45b301:1507`; `dashboard.html@a8158aad:6307`).
- **Why it fails.** Offline, a manager's face opens a dashboard that the same manager's code cannot.
- **What a 10 looks like.** The Face ID row applies the Read row's tier rule offline: an owner record unlocks, a manager record only while the list has not loaded, and a staff record never. `dashboard-pin-migration-test` asserts it.

**4. Polish · Honesty · preview claims and §18.0 "still not compared".**
- **Finding.** Selection state is drawn, unchecked and not disclosed.
- **Evidence.** Two mutations on the light Home frame, run through `__kiwiPreview.run(fixture, frames)`:
  - moving `.on` in `.seg` from "Today" to "Yesterday": all 17 checks stay green;
  - moving `.it.on` and `.foots` in `.capsule` from Home to Orders: all green.
  
  The frame then claims Yesterday while drawing today's figures and "Today · Monday 12 October". The closed list names curve shape, layout and keyed strings, not selection.
- **What a 10 looks like.** Either check 1 reads the selected segment against the fixture's range and the tab against the frame, with a mutation row each, or selection is added to the list of things not compared.

**5. Polish · Honesty · §22 and the §10.2 pairing rows.**
- **Finding.** The kit's pairing states silently drop a shipped path, and no row says what the kit does in its place.
- **Evidence.**
  - Shipped `redeem()` falls back to `localRedeem` (the same-browser map) both on a network throw and on a 404 or 405, "backend absent" (`caisse-pairing.js@762bb255:247-262`).
  - §10.2 answers a throw with `pair.no_answer` and has no row for 404 or 405.
  - §22 does not list the fallback's removal. Difference 1 calls it a copy change only.
- **What a 10 looks like.** §22 lists `localRedeem` as removed, or kept for local demos only, and §10.2 gains a 404/405 row.

**6. Polish · UX and copy · `pin.dashboard.no_owner_code`.**
- **Finding.** "Contact Kiwi to set up your access code" gives no channel and no control.
- **Evidence.** §9.4 says "Errors say what happened, then what to do". The owner is locked out of the dashboard, the one surface where they could find support.
- **What a 10 looks like.** The row carries a Plain action to the support contact, or the string names the channel.

## 5. Checked and found correct

- **Critique 20's six majors.**
  - **M1 (icon check).** Rows 180 to 183 are red for their stated causes: `why(180)` gives "sent behind (z-index −1) the background of div.a.cmp", `why(181)` "together cover 20 of 25 points", and 182 and 183 "::after is painted over its centre".
  - **M2 (store lock).** §10.26 matches `till-tenant.js@762bb255`: `mismatch` (:43), the 12 h `MAX_AGE` (:35, :59-66), the `/api/` net except `/api/pair/` (:106-160), `alertdialog` and `inert` (:247-288), the 700 ms check (:316), and no focus move. The copy is mapped key by key. The no-restart path after an unpair checks out against `pos-dispatch.js@762bb255:113-120`.
  - **M3 (no owner code).** The trigger matches `maybeShowNoOwnerHelp` (:6076-6098).
  - **M4 (offline pause).** The pause is read only on `null` (:6417-6421), and `lockedFor` returns seconds (vault :85-90).
  - **M5 (Face ID).** The `tryFace` path is now stated accurately, apart from findings 1 and 3.
  - **M6 (discount act).** `act.discount.pct` and `act.discount.amount` pass the act-phrase lint. The verticals send a percentage only.
  - **P7 and P8.** The handover picker matches `opensTill` (`staff-roles.js@31c94529:162-171`). The "No codes yet" timing matches `askServer`.
- **Preview.** Served over HTTP at 1024×768: 17 of 17 fixture checks pass, and 183 of 183 mutations go red. `why(n)` gives a specific cause for every sampled row (102 to 133, 180 to 183). Of my 16 text mutations, every data-bearing one went red with the right cause: the order count, card share, returning count, tile change, clock, gridline label, row time, weekday, venue, top label, legend, baseline and the Orders date. Keyed labels stayed green, as disclosed.
- **Fonts.** All six preview woff2 files have the same SHA-1 as the fontsource files. The `@font-face` order (Latin Extended, Latin, Plex 400 to 700, then the ranged fallback) matches §6.1. Every non-Arabic character in the string table is inside Inter Tight's declared ranges.
- **String table.** 480 rows and 470 Arabic strings by the spec's rule. No U+2014, U+202F, U+200E/U+200F, U+2026 or U+2019 in any row. `lock.store.body` passes the bill-and-account lint.

Housekeeping:
- I started a Python HTTP server on port 8953 and stopped it; the port is free.
- I opened browser tab tab-4, reset its viewport and closed it. The "seed" tab and the other session's node server were not touched.
- Only my scratch subfolder `critic21/` was deleted.
- No repo file was edited, staged or committed, and no code or credential was printed.
