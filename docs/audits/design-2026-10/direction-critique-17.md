# Design direction · round 18 critique of revision 17

## 1. Scorecard

| Dimension | Score | Reason |
|---|---|---|
| Visual design | 10 | Type stays on the six declared steps. I recomputed every contrast pair the spec cites and all pass. Nothing new drifts off the brand. |
| UI | 8 | There is no designed state for a handover that can't complete offline. The pad says "approved", then the handover screen refuses. |
| UX | 7 | The handover approves and then refuses. Clock-in's silent retry window can outlive the attendance code it is sending. |
| Motion | 10 | The spring settles where the spec says it does (308, 308 and 300 ms, plus 333 and 367 ms). The lens timing is unchanged and correct. |
| Feel and haptics | 9 | The close-register success haptic has a 600 ms rule, but the spec doesn't say whether it fires at the local commit or after the sync, which can take up to 8 s. |
| Copy and language | 7 | The `{act}` slot has no string keys per use, and the Arabic template becomes ungrammatical. French uses two terms for one act. The glossary and `count.close` disagree. |
| Accessibility | 8 | When the pad goes busy or locked, its keys become `disabled`, so keyboard and VoiceOver focus falls to `body`. |
| Honesty and consistency | 5 | The fix for critique 16's M4 is incomplete and the spec overclaims what the check proves. The spec says the offline verifier gives the server's answer, which it doesn't always. It claims handover approval works offline. The pinVenue status is stale. |
| Performance | 10 | The budgets and font strategy hold. Every glyph in the 96-string corpus resolves through the declared `unicode-range` stack. |
| Feasibility and migration safety | 8 | The offline handover can't be built as written, because the shipped handover requires an `actorProof`. The manager-approval table also leaves out two vertical callers. |

### 2. Verdict

FAIL. A PASS needs 10 in every dimension.

### 3. Rebuttal rulings

- **Rebuttal 1** (pro rata discount rounding by largest remainder): **ACCEPT.** `shareWeighted` at `kiwi-caisse.html:13490-13506` is the shipped allocator, and the split already uses it for by-item tips. A second rounding rule would round two amounts in one split two different ways. Largest remainder also keeps every share within one centime of its exact value.
- **Rebuttal 2** (no Cancel while the roster step is checking): **ACCEPT.** The lock's only exit is a verified roster. Every check is bounded by `KIWI_REQUEST_TIMEOUT_MS` (8 s) and ends with a stated cause. Try again appears, enabled and live, from the first failure on, and its slot is reserved and empty before that. A Cancel would have nowhere to go, and the revision 17 rewording (P7) makes the last clause true again.

### 4. Findings, ranked

**Majors**

1. **Honesty · §6 and preview self-test · critique 16 M4 is only partly fixed.**
   - **Evidence:**
     - In the preview script, `drawnErr` only checks fill on `use` and `svg`, transforms, `visibility`, `opacity`, and painted area.
     - In my mutation runs (`__kiwiPreview.run`, `__kiwiPreview.why`, `__kiwiPreview.mutations`), the icons I broke through properties outside that chain stayed green.
     - The spec still says the check proves the icon is drawn.
   - **What a 10 looks like:** either the check samples painted pixels against the surface, or the spec states exactly which properties the check covers. Plus a mutation for each property class that goes red.

2. **Honesty and Feasibility · §10.2 and §23 decision 2 · offline approval is claimed for the handover, and the shipped handover can't accept it.**
   - **Evidence:**
     - `confirmHandover` (`kiwi-caisse.html:18897-18908`) requires `who.actorProof`, and on a real store a name match too.
     - `mgrApprove` passes `verified`, which is `lastOperator`.
     - After `verifyOfflinePin` (`assets/caisse-pairing.js:880-962`, where the catch branch falls back to the verifier), `actorProof` is `''`.
     - `functions/api/pin/verify.js` only mints `actorProof` online, and only for till roles.
     - So offline the pad succeeds and the handover then refuses.
   - **What a 10 looks like:** the handover row says "needs a connection" and has its own designed state and copy. The pad says so before anyone types a code, not after it approves.

3. **UX and UI · §10.2 handover row · approve-then-refuse.**
   - **Evidence:** same path as finding 2. The person sees a success haptic and the approved state, then the handover screen refuses with nothing tying the two together.
   - **What a 10 looks like:** the pad knows the handover is out of reach before entry (connection state is known when the pad opens) and shows that state there. No success feedback for an act that can't complete.

4. **Honesty · §10.2 "till's offline verifier" · the spec says an offline verdict matches the server's. It doesn't always.**
   - **Evidence:**
     - The verifier keeps salted SHA-256 rows for codes proven online in the last 7 days, up to 12 rows (`caisse-pairing.js:28-99`).
     - A code revoked, or a role changed, on the server inside that window still verifies offline.
     - `verifyStaffPin` returns 200 for any staff role, and the role check runs in the browser (`staff-roles.js:156-170`), so offline role drift is invisible.
   - **What a 10 looks like:** the spec says the offline verdict is "proven online within 7 days, may be stale". It names the revocation lag as an owner risk under §23 decision 2. The offline row's trace records that the verdict was offline.

5. **Copy · §10.2 PIN titles and §14 strings · the `{act}` slot has no keys, and the Arabic is ungrammatical.**
   - **Evidence:**
     - The pad title puts an action name into a template, but the table gives no `pin.act.*` key per use. There are 8 pad uses.
     - The Arabic template takes the act as an imperative verb, so the sentence breaks once it is filled in.
     - French uses "Autorisation" in one row and "Validation" in another for the same manager act.
     - The glossary term doesn't match the `count.close` value.
   - **What a 10 looks like:** one keyed EN, FR and AR string per act, with Arabic written as a verbal noun (masdar) phrase. One French term for the approval act. Glossary and keys agree, and the lint table catches drift.

6. **Accessibility · §9.6 pad states · disabled keys drop focus.**
   - **Evidence:** busy and lockout put `disabled` on the keys that hold focus, and focus falls back to `body`. That is a WCAG 2.4.3 focus-order failure for keyboard and switch users, and VoiceOver loses its place.
   - **What a 10 looks like:** `aria-disabled="true"` with activation suppressed, focus kept on the key, and the state announced once through the existing polite live region.

7. **UX · §10.x clock-in · the retry rule can outlive the code.**
   - **Evidence:** the attendance code lives 5 minutes (`functions/api/team/live.js:169`). The spec's retry rule is an 8 s timeout, then automatic retries that stay silent unless the cause changes. A code that expires during silent retries ends as a failed clock-in, and the copy never names the expiry.
   - **What a 10 looks like:** expiry is its own cause, which breaks the silence. The copy says the code expired and offers to get a new one, and the pending clock-in time is kept.

**Polish**

8. **Feel and haptics · §15 close register.**
   - **Evidence:** the 600 ms response rule against `closeRegisterSteps`, which waits up to 8 s for the sync (`kiwi-caisse.html:16333-16468`). The spec doesn't say which moment fires Paid.
   - **What a 10 looks like:** the haptic fires at the local commit, and a separate quiet state covers the sync.

9. **Feasibility · §10.2 manager-approval table · two callers missing.**
   - **Evidence:** the table lists the caisse call sites but leaves out the vertical callers in `assets/pos-maison.js:4440-4500` and `assets/orderpro-inbox.js:236-250`.
   - **What a 10 looks like:** the census lists every `authorizeManager` and `authorizeTill` caller with file and line.

10. **Honesty · status rows · pinVenue is stale.**
    - **Evidence:** the spec still lists the pinVenue bug as open. It is fixed on `main` in `59392a9c` (`activeVenue`, `resetPinState`).
    - **What a 10 looks like:** the row is marked fixed and cites the commit.

### 5. Checked and found correct

- **Critique 16:**
  - M1 is fixed: the offline verifier is stated with its lifecycle, and `pin.offline_unknown` is scoped.
  - M2 is fixed: the dashboard's plaintext `kiwiPins` compare is stated truthfully at `dashboard.html:5850-5995` and `:6335-6395`.
  - M3 is fixed.
  - M4 is only partly fixed (finding 1).
- **Grep sweep:** no "online-only" or "server-only" claim about codes is left standing outside the correction notes.
- **Approval levels:** the two till levels match the code. `requireTillOperator` maps to `authorizeTill` and `requireManager` to `authorizeManager` (`kiwi-caisse.html:17319-17445`).
- **Dashboard lock:** it correctly shows no avatar and no name, because `verifyAccountPin` accepts any role that opens the dashboard.
- **Retry rule:** the 8 s timeout, and 10 s of silent automatic retries, match `KIWI_REQUEST_TIMEOUT_MS` and the pairing code (the pairing check itself times out at 12 s).
- **Contrast:** every pair the spec cites, recomputed with python, meets its stated level.
- **Fonts:** per-character fallback holds. I checked each WOFF2 cmap against the 96-string corpus and every glyph resolves through the declared `unicode-range` stack.
- **Spring motion:** critically damped, and the settle times are as stated.
- **Icons:** the preview's icon hashes (`ICON_HASH`, `pathKey`) match the vendored Material Symbols files.
- **Preview self-tests:** they run green at 1440x900.
- **Rebuttal 1's code citation:** `shareWeighted` and the `:13611` tip use are accurate.
- **Brand:** no italics, no em dashes in user-facing copy, no new accent tokens.

Housekeeping: I stopped the HTTP server I started on port 8871, reset the viewport and closed only the browser tab I opened. I deleted only the `critic17` scratch subfolder. I edited, staged and committed nothing in the repo, and printed no codes.
