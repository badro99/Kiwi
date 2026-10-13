# Design direction · round 23 critique of revision 22

**One scope note first.** Another session started rewriting both files while I was reviewing. The preview changed at 20:11 and the spec at 20:14. The header still says "Revision 22", but §18.4 is already reduced to a stub and the page says "revision 23: the floor is kept as shipped". My first headless capture was taken before that change and still showed revision 22: 17 of 17 checks and 188 of 188 mutations passing. The findings below cite content, not revision-22 line numbers, because those numbers have since moved. The floor is out of scope, as the lead instructed.

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 9 | §1 keeps the Kiwi wordmark, but no hero screen places it. Every after frame lacks it, while the shipped Home and till show it (P6). |
| UI | 9 | The Orders row icon is defined for card, cash and refund only. `pay.other` has no icon and no filter (P1). |
| UX | 7 | Two majors. Kiwi AI loses its live voice input, its Action Center and its calculator (M1). Invoicing and export have no place left in the IA (M2). |
| Motion | 10 | No findings. The new store-lock Back, Escape and re-entry agree with §14. |
| Feel and haptics | 10 | No findings. The new controls fire nothing, and one haptic per gesture still holds. |
| Copy and language | 9 | "Open the till without this service" names a destination the unpaired variant does not reach (P3). The 484 rows and 473 Arabic strings are correct. |
| Accessibility | 10 | No findings. Contrast pairs I recomputed pass, the bidi visual order is correct, and type steps match. |
| Honesty and consistency | 8 | M1 and M2 are removals by omission. The preview's text checks read text the frame may not paint (P4). The icon-file self-test passes on a partial read (P5). The dashboard 401/403 rule is now out of step with `main` (P7). |
| Performance | 10 | No findings. |
| Feasibility and migration safety | 8 | Building §18.6 as written replaces a live surface and deletes three shipped features as a side effect (M1). CLAUDE.md §2 forbids doing that unplanned. |

## 2. Verdict

**FAIL.** Six dimensions are below 10.

## 3. Rebuttal rulings

1. **Largest remainder: ACCEPT.** `shareWeighted` at `kiwi-caisse.html@31c94529:13490-13493` says "Largest remainders receive the leftover centimes", which is the rule the rebuttal states.
2. **No Cancel in the roster step: ACCEPT, moot.** The roster step was removed in revision 21, and the rebuttal now defends nothing live.
3. **No kept clock-in time, no code fetch from the team app: ACCEPT.**
   - `employee.js@31c94529:482-483`: the code "proves the employee is physically present".
   - `:494-495`: an expired code is refused.
   - `:509`: `inTs: now`.
   - `team/live.js:151`: `allowTill: true`.
4. **No pairing-state check after a timed-out redeem: ACCEPT.** `pair/state.js@31c94529:27-28` refuses a request with no `merchant`. The only complete fix is still the idempotent redeem keyed on `terminalId`.

## 4. Findings, ranked

**M1 · Major · UX and feasibility (honesty: removal by omission) · §18.6 Kiwi AI, §22, §12.**
- **Finding.** The new AI sheet drops three live features and the spec never says so:
  - **Voice dictation.** `assets/agent-voice.js`, loaded at `dashboard.html@31c94529:5587`, puts a mic in the AI composer. It records, sends the audio to `/api/ai/voice` (Whisper), and falls back to `webkitSpeechRecognition` on a 429 or 503. Its own comment notes the browser fallback is weaker in darija.
  - **The Action Center** (`assets/agent-action-center.js`, "Actions" button). It is the tenant-scoped queue where AI-proposed actions wait for the owner to confirm, and where they are undone.
  - **The calculator and simulators.** `agent.js@31c94529:3` ("hybrid agent + calculator"), `:555`, `:928`; the before frame shows "Simulate a hire" and "Test a price rise".
- **Evidence.** The before frame draws the mic, Calculator and Actions. §18.6's composer is a field plus Send only, and §18.6 has no "Removed" line. A search of the spec for "voice", "mic", "dictat", "calculator", "action center" and "agent-voice" finds nothing. §22 lists none of them, and §12 gives none of them a home.
- **Why it fails.** If §18.6 is built as written:
  - an owner who dictates loses dictation;
  - actions waiting for approval have no entry point, so pending AI actions can no longer be confirmed or undone;
  - the finance simulators disappear.

  This is the same omission class as revision 5's tips.
- **What a 10 looks like.** Either §18.6 keeps:
  - the mic in the composer, with recording, sign-in (401) and fallback (429 or 503) states and their copy;
  - an Actions entry with a pending count;
  - the calculator, through an overflow;

  or §22 lists each removal with its reason and §23 asks the owner.

**M2 · Major · UX and IA (owner's eye: Home and Customers lose functions) · §22, §12, §18.5.**
- **Finding.** §22 deletes Home's quick actions (Day report, Invoicing, Export, Customize). §18.5 deletes the Customers "export, gift and team icon row". None of these is given a destination.
- **Evidence.**
  - §12's IA table has no Invoicing and no Export entry. Searching the spec for "invoic" or "factur" returns 0 hits.
  - `assets/invoice.js@31c94529:1-11` is the legal A4 sales invoice: numbered F-AAAA-XXXX, with a sealed ICE snapshot, loaded by the dashboard.
  - The before Home frame shows Day report, Invoicing, Export and Customize. The before Customers frame shows the export, gift and team buttons.
  - By contrast, the margin tile's removal does name its destination: "Report shows margin when dish costs exist".
- **Why it fails.** A merchant who issues B2B invoices, or exports their sales or customers, would no longer find either function in the new IA.
- **What a 10 looks like.** §12 places Invoices (for example under Money, and from an order's detail) and Export (Report and Customers overflow). §18.5 says where export, birthdays and groups now live.

**P1 · Polish · UI · §18.2 Orders, check 13.** The row icon is defined only as `credit_card`, `payments` or `undo`, and the filter as All, Card, Cash, Refunds. An order paid by `pay.other` (§18.3) therefore has no icon and no filter, and the shipped "Mobile" filter is dropped silently. **A 10:** `pay.other` has an icon and a filter segment, or the spec states that it is folded into All.

**P2 · Polish · UX · §18.5 Customers.** Two shipped functions are dropped without being named:
- the VIP segment (shipped: "VIP 1"); VIP is now only a star, with no way to list VIP customers;
- e-mail search: shipped placeholder "Search name, phone or email…", now `customers.search` "Search name or phone".

**A 10:** each is either kept or listed under Removed.

**P3 · Polish · Copy · §10.26 difference 6, R9, `lock.store.open_without`.** "Open the till without this service" runs a reload. §10.26's own Reloading item says a reload opens "the pairing pad when unpaired", and check 15 keeps an "unpaired with a service open" case. In that variant the button lands on a pairing pad, not a till, yet R9 asserts "opens the till". **A 10:** the label and R9 are true in both variants, for example "Leave this service", or a conditional unpaired label.

**P4 · Polish · Honesty · the preview's claim "compares the text a frame draws".**
- **Technique.** I cloned each light frame (`.m` node) and passed it with the embedded fixture to `__kiwiPreview.run(fixture, frames)`. The baseline was all green.
- **Data mutations: all red, each for the right reason.** I made about 40, among them:
  - Salma's city, her name, the contactable count, a segment count;
  - the sold-out tile showing a price;
  - MAD changed to EUR on every money figure (rows, lifetime, till price, total, refund, AI card, deltas);
  - U+00A0 changed to U+0020;
  - "Send 3", the bill note, "Sent 17:27", "73 days", Inactive changed to Regular;
  - the AI stamp, count and source chip;
  - the SE and AR "of 8".
- **Paint mutations: all green.** Hiding the Home key figure "19,174" with `visibility:hidden`, `opacity:0`, `color:var(--bg)` or `font-size:0`. Moving the Orders tile value 3,000 px off the frame. `color:transparent` on the till total. `-webkit-text-fill-color:transparent` on a lifetime figure. `display:none` on the Home date. `display:none` on an Orders row went red only by accident, through check 13's icon chain, not check 2.
- **Why it fails.** The "still not compared" list does not name text visibility, although check 13 models visibility in detail for icons.
- **A 10:** either the text checks read paint as check 13 does, or text visibility is added to the not-compared list.

**P5 · Polish · Honesty · the kit self-test's "Icon path table".**
- **Evidence.** The verdict is `fd.length ? 'Fail' : fu.length === fk.length ? 'Not run' : 'Pass'`. My first headless Chrome run printed "Pass · … 11 of 35 symbols hash … unreadable: 24", with every icon request logged 200 by the server. The browser pane on reload printed 35 of 35.
- **Why it fails.** §18.0 and the page claim "35 of 35 match", but a partial read passes.
- **A 10:** Pass only when every file is read and matches; anything unreadable gives "Not run" or Fail.

**P6 · Polish · Visual · §1 versus §18.** §1 says "Kept … the Kiwi wordmark". The spec mentions it nowhere else, and none of the five after frames draws it, while the shipped Home and till show it. For an owner who rejected a screen as lifeless, the one brand mark disappears from every work surface. **A 10:** the spec names where the wordmark sits (Home nav, till rail head, More) or says why it does not.

**P7 · Polish · Honesty · §10.2 dashboard block.**
- **Evidence.** `d004116f`, an ancestor of `319ac100` (the commit revision 22 read as `main`'s head), rewrote `askServer`:
  - `unauthorized`, `account-revoked`, or a 401 whose body is not JSON → "signed-out": the stored row is kept, and the lock shows "Session expired. Sign in again".
  - any other 401 or 403 body → `null`, so the offline rows are read.
- **Why it fails.**
  - The block's "Shipped differs: `askServer` reads every 401 and 403 as a refusal" is no longer true.
  - The designed Read row ("a 401, a 403 … decides and no row is read") now conflicts with `main` for an unrecognised body.
  - No response row covers `account-revoked` or a non-JSON 401.
- **A 10:** the block says which rule is designed for an unrecognised 401 or 403 body, and covers `account-revoked` and a non-JSON 401.

## 5. Checked and found correct

**Screens, as the merchant sees them** (after frames rendered at full device size with headless Chrome, next to the before captures):
- **Home:** better at reading the day. There is one key figure, a compare control that names its baseline, signed deltas with polarity colours, and yesterday's curve. The figures reconcile (19,174, −1,127, −5.6 %, 140 against 152.64, 66 % against 65 %). The weakness is M2: Invoicing and Export are gone.
- **Orders:** better. About 8.5 rows per screen against 7.3. Each row now shows its order number, table, staff and hour group, where the shipped list showed "Client 12". The weakness is P1.
- **Till (menu, bill, payment):** better. The bill is legible, there is one primary, and the "Not sent · 2" group is clear. Changing a quantity takes two taps where it took one (the steppers are behind line selection), but §22 lists that deliberately, so it is not a finding.
- **Customers:** better at finding a person, thanks to the last-visit line and statuses as words. The weaknesses are P2 and M2.
- **Kiwi AI:** weaker at its job (M1).
- **Floor:** reverted by the owner, not judged.

**AR and SE frames.** I measured the visual order of every digit run in the Arabic frame through `Range` rects ("−1 127", "−5,6 %", "19 174"): all LTR and correct. The SE frame matches §18.11.

**Critique 21's majors:**
- **F1 (idle relock) is fixed.** The spec states the path accurately:
  - `handleNativeAppState` sets the pending flag after 20 minutes (`native-runtime.js:1864-1879`);
  - `maybePromptBiometricUnlock` calls `reveal()`, then `__kiwiUnlockApp`, then hides `#pin-screen`;
  - `reveal()` is `skipToApp()`;
  - `__kiwiUnlockApp` is at `kiwi-caisse.html@319ac100:13997`;
  - `idle-lock.js` sets `kiwiIdleLockReason` (10 minutes visible, 3 minutes hidden) and loads on the dashboard only;
  - `biometric-unlock-test.mjs:222` and `:232` are the two checks the spec says will change.
- **F2 (store-lock exits) is fixed,** apart from P3. The check loop does re-show the screen once the pad is gone (`till-tenant.js@762bb255:297-316`).
- **F3 (Face ID offline) is fixed.** The tier bounds match `localVerify`.
- **Polish 4 to 6 are fixed.**
  - F4: selection is disclosed as not compared.
  - F5: §22 and the 404/405 row are added; the redeem route answers only 422, 429 and 503 at both `762bb255` and `main`.
  - F6: `support.html` lists the e-mail address and the WhatsApp number, and the native app's `kiwiPage` opens it in the in-app browser.

**String table and fonts:**
- 484 rows and 473 Arabic strings, by the spec's own rule.
- Every string-table character falls inside the declared Inter Tight or Kiwi Arabic ranges.
- All six preview font files have the same SHA-1 as the fontsource files.

**Preview self-tests:**
- `__kiwiPreview.why(n)` gives the targeted reason for each sampled row (1, 2, 3, 55, 104, 110, 125, 134, 180).
- Type steps measured in the frames: Home 5, Orders 3, Till 5, Customers 2, AI 4. All match §18.

**Contrast (WCAG 2.x), recomputed:** ink-3 on bg 5.00, on s1 5.36, on s2 4.62; dark ink-3 on s2 4.63; warning on its tint 5.38; field edge 3.52.

**Housekeeping:**
- I served the preview on port 8962 and stopped the server; the port answers nothing now.
- I opened tab `tab-6`, reset its viewport and closed it. The `seed` and `tab-5` tabs and the other session's node server were not touched.
- I deleted only my `critic22/` scratch folder.
- No repo file was edited, staged or committed, and no code or credential was printed.
