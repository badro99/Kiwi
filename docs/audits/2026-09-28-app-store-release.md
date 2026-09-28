# Kiwi Pro · App Store release gate

Status: release candidate preparation, not submission approval. Base: f922df3f.

## Code and package checks
- [x] Native AI disclosure, affirmative consent before transmission, decline and revoke.
- [x] Native companion app has no subscription purchase/upgrade path.
- [x] Deletion sheet distinguishes signed-out, pending, failure and success.
- [x] Release archive uses an explicit build number and clean checked source.
- [x] Privacy manifest matches uploaded content and customer data.
- [x] Focused regression tests and full repository gate on f7855757 (all checks passed, 1 warning).
- [ ] Repeat gate and signed export after final legal/privacy inventory corrections.
- [x] iOS Release compilation and App Store distribution export smoke test under
  the user-confirmed publisher, Team H74H42538F. Final export must follow the
  frozen-source gate, not reuse the earlier smoke-test IPA.

## Acceptance still required
- Publisher confirmed by user: Badr’s existing account. Automatic provisioning
  and local App Store export succeeded. App Store Connect app record/metadata
  and server validation still require verification.
- Signed archive/export validation with that publisher; no upload performed implicitly.
- Full-access review credentials supplied privately in App Store Connect, or a complete
  reviewed demo. Existing demo Home/Orders/Report historical figures are not yet a
  single reconciled ledger. Do not present demo balances as real merchant evidence.
- Real iPhone: native cookie login, pairing, offline/reconnect queue, printer hardware,
  camera/microphone permissions, VoiceOver, largest Dynamic Type and keyboard paths.
- Review screenshots from the final build, FR/EN/AR metadata, truthful age-rating answers,
  privacy labels, rights/legal contact details and deletion fulfillment process.
- No production account deletion, merchant data mutation or credentials entered for QA.

## Policy references reviewed
- https://developer.apple.com/app-store/review/guidelines/ (2.1, 3.1.3(f), 5.1.2(i))
- https://developer.apple.com/news/upcoming-requirements/
- https://developer.apple.com/support/offering-account-deletion-in-your-app/

Xcode 27.0 / iOS SDK 27.0 verified locally. A local signing certificate alone does not
prove account membership, app ownership, a valid profile or App Store acceptance.

## Evidence and implementation
- New `tools/native-store-readiness-test.mjs`: 78 checks for all three languages,
  including request refusal, affirmative choice, revoke, abort, account change,
  non-JSON 401, pending deletion, unavailable service, real bundled account and
  upgrade handlers. All API responses in this test are local fixtures.
- `@capacitor/keyboard` 8.0.5 resizes the native WebView. The keyboard accessory
  remains available so numeric fields still have a Done control.
- Native voice never silently falls back to a different speech provider.
- Consent is session-scoped and cleared at authentication boundaries. No request
  bodies or passwords are saved by the consent layer. Revocation blocks future
  transmissions, not data already sent.
- iOS privacy manifest includes phone, audio, user content, physical addresses,
  optional guest allergies/accessibility, identity-reference fields, purchase/payment
  records, support requests and help searches/feedback;
  App Store Connect labels and Cloudflare retention settings still need operator review.
- Production dependency audit: zero reported vulnerabilities. Development-tool
  audit reports 6 existing advisories; no blind breaking dependency upgrade applied.
- Public support URL returned HTTP 200 after its canonical redirect. User confirmed
  publisher Badr-Eddin Bakkioui Oufrassi and address 4 avenue Prince Héritier,
  90000 Tanger, Maroc. Legal placeholders replaced; existing support phone retained.
- App Store Connect record 6807952061 matches com.kiwios.pro and Badr’s account.
  French, English (US) and Arabic draft descriptions/promotional text/keywords/URLs
  saved. Categories Business / Food & Drink and localized subtitles saved.
  Primary privacy URL saved. No screenshots, selected build, age rating or final
  privacy labels yet. DSA status and reviewer credentials remain owner steps.
- Signed distribution build 4 at f7855757 passed the full gate and local export,
  but is superseded by the later legal/privacy inventory correction. No upload.
- Simulator Release app launched on iPhone 17 Pro; a screenshot proves the welcome
  screen only. Browser fixture checks do not establish full device acceptance.
- Release evidence is saved outside the checkout in
  `/Users/zaka/.codex/artifacts/kiwi-store-release-2026-09-28/`.
- `tools/app-archive.sh` now requires clean committed source and an explicit build,
  runs the full gate, preserves logs, restores generated SPM paths, verifies the
  exported signature/bundle/build/privacy content, and uploads only with `--upload`.
  Nothing has been uploaded or submitted by this task.
