# Native launch readiness · 7 September 2026

## Implemented in this pass

- iOS setup cards have a readable maximum width on iPad, scalable headings,
  wrapping summaries and buttons, and stronger selected/disabled contrast.
- VoiceOver gets heading focus on step changes, selected-choice semantics,
  localized progress and password-toggle labels, and status announcements.
- Native password visibility preserves the entered value. Login failures no
  longer discard the password; successful sign-in or leaving the step clears it.
- Native printer-field refresh does not overwrite the focused field.
- Manual role selection includes a localized return to sign-in, on web and native.
- Dark PIN, clock-in and greeting overlays keep light status-bar content;
  native navigation is hidden and blocked while those overlays are visible.
- Clock-in and PIN layouts scroll on short displays and account for safe areas.
  Native product and quantity controls meet a 44 CSS-pixel minimum. Keyboard
  focus has an explicit contrasting outline.
- Boot paint tests use an explicitly released storage bridge rather than
  sampling an 800ms window. The real watchdog still has its own hanging test.
  The browser suite cleans up its browser even after an assertion exception.

## Repeatable checks

The local iOS candidate is version 1.0, build 3. Confirm that build number is
available in App Store Connect before creating a signed distribution archive.
It has not been uploaded or submitted by this pass.

```
node tools/native-workspace-ux-test.mjs
node tools/native-device-layout-test.mjs
node tools/native-host-bridge-test.mjs
node tools/app-interaction-test.mjs
node tools/app-release-test.mjs
node tools/check.js
```

The layout suite executes shipped overlay markup and styles with application
scripts and network calls disabled. It covers 320×568, 844×390, 507×768,
820×1180 and 1180×820. These are geometry checks, not authenticated device tests.
The setup suite covers French, English, Arabic, keyboard navigation, enlarged
text, printer error recovery, pairing and the native host action bridge.

Observed results: 209 setup interaction checks, 12 device layout checks,
19 native workspace checks, 7 host bridge checks and 48 release checks pass.
The integrated repository gate passes with one pre-existing warning. The
unsigned iOS simulator build succeeds. Fresh iPhone/iPad installs reach native
setup; password show/hide preserves its value and changes the accessibility
label. iPad portrait and landscape were inspected with the keyboard visible;
Next scrolls the password field above the keyboard. This is not a physical
device, VoiceOver gesture, live merchant or printing acceptance result.

## Still required before external distribution

1. Create the dedicated review tenant through normal signup; manage credentials
   outside source control. Verify login and seeded content in the candidate.
2. Verify build number, bundle fingerprint, processing state, internal tester
   assignment, screenshots and privacy answers in App Store Connect. Simulator
   debug builds are not signed distribution archives.
3. Record physical iPhone/iPad evidence for offline sale, force-close/recovery,
   authenticated live updates, printer reconnect and duplicate prevention.
4. Exercise VoiceOver, largest supported text sizes, keyboard dismissal and
   permission-denied paths on the actual candidate, not only browser mocks.
5. Prove fulfilment of account-deletion requests, including the no-establishment
   manual path in `ACCOUNT_DELETION.md`. This pass does not introduce a new
   destructive account-cleanup endpoint or execute merchant deletion.

App Store/TestFlight upload, production review-account creation and physical
printer acceptance are separate actions; do not infer them from passing tests.
