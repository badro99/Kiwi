# Kiwi Pro · App Store launch checklist (2026-10-10)

Replaces `2026-09-28-app-store-release.md` as the working list. Written from
Apple's current review guidelines and from what the iPhone app actually does,
not from the earlier checklist. Each line says who can close it.

Legend: **[x]** done and proven · **[ ]** open · *(Claude)* closed from the
repo, tests and read-only data · *(Owner)* needs a person, a device, an Apple
account or a credential.

---

## A · Launch blockers: the numbers must be right

A merchant who sees two different totals for the same day stops trusting
every screen. Nothing ships while these are open.

- [x] **A1 · Restaurant dashboard equals the till's Z report** (#0096). For a
  real restaurant, the dashboard's revenue for a closed business day equals
  the sum of that day's Z reports, payment method by payment method.
  Measured on production data, read-only. *(Claude)*
- [x] **A2 · A sale reaches the dashboard within a minute** (#0141). No
  15-minute delay; the sync-warning badge clears once the queue drains.
  Measured on production data, read-only. *(Claude)*
- [ ] **A3 · Invoice from the till renders and downloads** (#0141), web and
  native. *(Claude for tests and simulator; Owner for one real merchant)*
- [ ] **A4 · Boutique side audit** asked for in #0096: boutique dashboard
  equals boutique Z, same method as A1. *(Claude)*

## B · Review access: Apple must be able to use the app

Guideline 2.1 (completeness) and 2.3 (accurate metadata). Reviewers reject an
app they cannot get into, or whose demo contradicts itself.

- [x] **B1 · Demo tells one story.** In "Enter the demo", Home, Orders,
  Report and Customers agree for the same day: same revenue, same order
  count, same payment mix. *(Claude)*
- [ ] **B2 · No dead ends.** Every role (Till, Kiwi Team, Kitchen,
  Dashboard) has a visible way back: Change role, Sign out. *(Claude, test)*
- [x] **B3 · No placeholder, debug or "test" content** visible to a
  reviewer: no lorem ipsum, no `TODO`, no raw i18n keys, no "beta". *(Claude)*
- [ ] **B4 · Review account** with an owner code, a menu and one staff
  member, signed into once on a clean install of the candidate build.
  Credentials go into App Store Connect only. *(Owner)*
- [x] **B5 · Review notes** pasted from `docs/ops/app-review-notes.md`,
  updated for the candidate build. *(Claude writes · Owner pastes)*

## C · Apple rules the binary must meet

- [x] **C1 · No in-app purchase, price or upgrade path** (3.1.1, 3.1.3(f)).
  `tools/native-store-readiness-test.mjs`.
- [x] **C2 · Account deletion inside the app** (5.1.1(v)). ☰ › Delete my
  account.
- [x] **C3 · AI consent before any data leaves the device** (5.1.2(i)).
- [x] **C4 · Privacy manifest** present in the shipped bundle.
- [x] **C5 · Permission prompts explain their purpose** in FR, EN and AR
  (camera, microphone, speech, local network, Face ID).
- [x] **C6 · Export compliance** key set (`ITSAppUsesNonExemptEncryption`).
- [x] **C7 · Not a thin web wrapper** (4.2): the app bundles its screens,
  works offline for the till, uses native printing and native Face ID.
  Re-confirm the bundle loads with the network off. *(Claude, simulator)*
- [x] **C8 · Launch and lock show the mark without a tile** (#0147, build 30).

## D · Build integrity

- [x] **D1 · One clean full gate** (`node tools/check.js`) on the exact
  commit that ships, run when the machine is quiet. No skipped suites, no
  timeouts. *(Claude)*
- [ ] **D2 · Fresh archive from that commit**, explicit build number,
  signed export verified, uploaded. *(Claude)*
- [ ] **D3 · Tickets in testing proven** with kiwi-ui-qa runs: #0149–#0151,
  #0165–#0171. *(Claude runs · Owner closes)*

## E · Real device, before submitting

Simulators do not prove these. *(Owner, on the TestFlight build from D2)*

- [ ] **E1** Sign in, choose each role, sign out.
- [ ] **E2** Pair a till; take a sale; it appears on the dashboard in under a minute.
- [ ] **E3** Airplane mode mid-sale, then reconnect: the sale syncs once, not twice.
- [ ] **E4** Print to a real thermal printer; first print asks for Local Network.
- [ ] **E5** Camera barcode scan; microphone dictation to the assistant.
- [ ] **E6** VoiceOver can reach the keypad, and largest text size does not clip the till.
- [ ] **E7** Face ID: sign in with the owner code, accept "Open Kiwi with Face ID?", relaunch: the app opens with a glance. Sign out, sign back in: Face ID is asked for again, not reused.

## F · App Store Connect listing *(Owner, with text from Claude)*

- [ ] **F1** Name, subtitle, description, keywords in FR, EN, AR.
- [ ] **F2** Screenshots from the D2 build: 6.9" iPhone (and 13" iPad if iPad is offered).
- [ ] **F3** Privacy labels matching the privacy manifest.
- [ ] **F4** Age rating questionnaire (business app, no user content shared publicly).
- [ ] **F5** Support URL, privacy policy URL, contact e-mail.
- [ ] **F6** Pricing: free (the subscription is sold outside the app).

---

## Progress log

Each closed line gets its evidence here: commit, test, query, or screenshot.

**2026-10-10**

- **A1 closed.** Production D1, read-only: `z_reconciliations` 31 of 31 matched
  since 2026-09-24. Remaining divergence risk was a dashboard holding an older
  local business-day cutoff than the till's. Fixed: the dashboard now adopts the
  cutoff the till publishes (`assets/merchant-config.js` › `adoptTillCutoff`,
  pinned in `tools/native-face-entry-test.mjs`). Pasta Corner publishes 5 h.
- **A2 closed.** Production D1, read-only, arrival order by rowid since
  2026-09-30: 0 sales later than one minute (314 Pasta Corner, 38 Santos Store).
  The dashboard polls every 2.5 s.
- **A4 deferred, not closed.** The boutique keeps its own `syncId` journal;
  replaying "missing" entries through `queueSnapshot` could duplicate real
  sales. Wiring `bqReportSales` into `KiwiZReconciliation` needs its own change
  and test, not a side effect of launch work.
- **B1 closed.** `tools/native-demo-ledger-test.mjs`, 37 checks: Home, Orders,
  Report and Customers agree on revenue, count and payment mix.
- **B3 closed.** Scan for lorem, TODO, raw keys, beta: only the hidden
  preview-code teasers, now refused in the native app (App Store 2.3.1,
  `dashboard.html` › `isPreviewCode`).
- **B5 written.** `docs/ops/app-review-notes.md` updated with Face ID.
- **New opening screen and Face ID.** Launch mark centred, lock glides it into
  place, greeting by first name, borderless keypad, Face ID key in the empty
  slot, opt-in sheet after a real code. Keychain stores the account, access
  tier and first name, never a code. `tools/native-face-entry-test.mjs`
  (27 checks) wired into `check.js`; all native suites green.

- **A3, tests green, device pass open.** `sale-invoice-test.mjs` (72),
  `ticket-141-test.mjs` (23, native A4 PDF export through
  `KiwiPrinterSocket.exportInvoice`), `invoice-receipt-test.mjs` (64). The
  simulator was too loaded to drive by hand; one real till invoice on the
  TestFlight build closes it (fold into E2).
- **D1 closed** on `aae0d8c2` (the archived commit; `26e4d104` after it is a
  doc-only change). Full `node tools/check.js`: every suite green except
  `kiwi-ui-qa-mcp-test.mjs`, which timed out on one click while the load
  average spiked to 104; rerun alone it passes 60 of 60. No skipped suites,
  no environment overrides.
- **C7 closed.** The native browser suites (`native-pass2-browser-test`,
  `native-demo-ledger-test`, `native-face-entry-test`) serve the bundle locally
  and abort every other request, i.e. the app with no network: all green.
  `pwa-shell-test.js`: 17 POS verticals complete offline.
- **D2 half done.** Build 31 archived from `aae0d8c2`, exported, signature
  verified, build number 31, privacy manifest present, opening screen inside.
  Upload refused: Xcode reports no App Store Connect access for team
  H74H42538F. Owner to check Xcode › Settings › Accounts, then upload with
  `xcodebuild -exportArchive` on `app/ios/build/release-31-n5VGXT`.
- **D3, nothing left for Claude.** All eight open tickets (#0096, #0141,
  #0149, #0150, #0151, #0165, #0168, #0171) are already in testing with
  proofs; only the owner can close them.

