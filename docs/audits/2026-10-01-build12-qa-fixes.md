# Build 12 exploratory QA · six corrective fixes

Date: 2026-10-01. Base: `26c3865d12ac4459a66d0d0e68044cd780eb4520`, verified as `main` on both GitHub mirrors before implementation.

This follow-up addresses the six confirmed findings in the private Build 12 exploratory report. It does not mark unrelated tickets complete, assert that all app flows are bug-free, or authorize an App Store/TestFlight release.

## Corrections

| Finding | Root cause and correction | Verification / status |
| --- | --- | --- |
| QA-01 · preselected customer marketing consent | WhatsApp/SMS was checked by default outside hotels, and saving required that checkbox. Both channels now start unchecked for every trade; a customer can be saved without opting into marketing. Explicit channel choices are saved independently. Optional-consent explanation is translated and attached to both checkboxes for assistive technology. | Local bundled form regression: unchecked defaults, opt-out save, email-only save, and fresh-form reset in EN/FR/AR passed. Fixed; native assertions and actual screenshots also verified in EN/FR/AR. |
| QA-02 · inconsistent demo payment totals / ratio | Demo payment mix and card/cash ratio still read static preview values while Home read the deterministic sales ledger. Active-demo mix now aggregates recorded tender amounts in cents, labels the center as collected money, and uses the same ledger for the ratio and comparison. Wallet is a distinct tender, not a card; card/cash uses the same denominator as the real-merchant path. | Local bundled ledger test: today, yesterday, seven and thirty days passed; real identity still disables the demo ledger. Fixed; the isolated native payment-range test passed with all four ranges selected and ledger totals/ratio matching. |
| QA-03 · Team summary contradicts member rows | Demo summary invented 75% attendance; rows consulted empty live attendance. Demo summary, rows (including partial filter repaint), and read-only roster now use today's demo hours grid consistently. The caption explicitly says demo hours. Real venue live-attendance selection and fallback are unchanged. | Local bundled Team summary, individual statuses and roster agree in EN/FR/AR. Fixed; native summary, roster and visible member counts also agree in all three locales. |
| QA-04 · amber server card destroys text contrast | A global skin selector matched any inline `D99A2B`, including a staff-accent custom property. It now matches actual background declarations only. Server cards retain their neutral surface and readable main text; staff avatar/chip accents remain. | Local bundled floor cards neutral in EN/FR/AR, both themes; actual native neutral-card/retained-accent assertions and screenshots verified all six locale/theme combinations. Fixed. |
| QA-05 · selected Today label disappears in light mode | Native CSS forced inverse ink onto a soft, translucent selection lens. Selected Home date now uses theme-aware native foreground ink, like unselected dates, while preserving the lens/track behavior. | Local bundled light/dark regression passed in all three locales; actual native theme-ink assertions and screenshots verified all six locale/theme combinations. Fixed. |
| QA-06 · French/English words inside other locales | Removed the hardcoded French consent suffix and added translated optional-consent copy. The phone floor summary now reads its table noun from the locale dictionary, including Arabic `طاولات`. Merchant-provided names are not translated. | Local bundled EN/FR/AR consent/floor copy and Arabic summary passed. Fixed; native optional-consent copy and Arabic floor summary were verified as well. |

## Targeted regression

- `tools/native-qa-six-fixes-test.mjs`: **47 checks passed**, actual assembled dashboard and demo entry at 402×874, all three languages and both themes. Customer test records stay in the disposable local browser; all external requests are blocked. No account login or code verification requested.
- `tools/native-demo-ledger-test.mjs`: **37 checks passed**, including the four payment ranges, existing order/report/customer-history checks, and real-identity demo isolation.
- `tools/native-pass5-test.mjs`: **55 checks passed**, preserving shared date-track/calendar/native layout behavior.
- `tools/clients-pending-write-test.mjs`: **7 checks passed**, preserving endpoint permissions for prepared customer profiles.
- Full `node tools/check.js`: **passed, exit 0** (exec session 58998). Run once for the completed batch, before pushing. The redirected log was removed externally during execution, so no exact warning count is asserted.

## Native boundary and evidence

Only **iPhone 17 Pro `D53BB4E4-F195-41EF-8DE2-9F74BAEADC62`**, 402×874 pt, was used. No Pro Max, SE, physical-phone installation, TestFlight upload, or public App Store action.

Durable evidence: `docs/audits/evidence/2026-10-01-six-fixes/verification.json` plus four recovered **local-browser**, not native, floor screenshots. Every changed runtime file was compared byte-for-byte against the still-installed private native simulator clone after the raw artifact cleanup.

Original private native/log directory: `/Users/zaka/.codex/artifacts/kiwi-six-fixes-2026-10-01/`. **It was externally removed while the final full gate was still running**, after the native range test had succeeded and selected actual native screenshots had been displayed in the chat. The original `.xcresult` bundles, observer transcript, native PNG/DOM files and redirected full-gate log are no longer available at that path. The native success was also confirmed by the completed `xcodebuild` command's zero exit code. Do not follow the old private paths or treat the recovered browser images as native screenshots. The gate subsequently completed successfully with exit 0; that result is recorded in the durable verification JSON.

The unchanged Build 12 Debug Swift simulator wrapper was reused with the newly assembled web bundle (fingerprint `a87bf4e3aaee`). This is sufficient for these JavaScript/CSS-only fixes, not proof of a new distribution archive. The app is a separate disposable bundle, `com.kiwios.pro.qafixes1`, with an observation bridge and production/auth network isolation. Normal role selection, Explore and the real demo skip control are used; no PIN, authentication bypass, real customer write, account deletion or financial mutation.

XCTest performs real native touches and screenshots. DOM evaluation observes state and prepares scroll-to-control; it never substitutes a JavaScript click for a native interaction. Language/theme APIs change only the disposable demo preferences. Before cleanup, screenshots were saved with corresponding DOM/error snapshots. The first combined run stopped at the previously observed intermittent sidebar Home-tap failure after a theme change on Team; it was recorded as failed, not described as passing. The settled-theme run completed all 18 locale/theme screenshots and their consent, Team, floor and ink assertions, then stopped because the next offscreen date control was prepared underneath the sticky header. The first isolated payment run completed today/yesterday/seven-day assertions, but its thirty-day input did not select that range (the active pill and displayed ledger remained seven-day); this is not reported as a data discrepancy or a passing run.

After making the private driver's scroll preparation instant and centered, allowing it to settle, and asserting the actually selected range before comparing numbers, **the isolated native four-range test passed** (`payments-settled.xcresult`; 51.337-second test session). Production runtime was not changed or instrumented to force selection. Each accepted payment screenshot has a corresponding passing range/amount/ratio observation. Those failed runs were not relabelled green; their raw files were subsequently lost in the external cleanup described above. This is targeted native verification of the six corrections, not a claim that the combined journey or every navigation path passed.

Actual phone Build 12 does **not** contain these changes until a subsequent native bundle is built and installed/distributed. Simulator, source publication, live authenticated Amira, physical device and App Review acceptance are separate boundaries.

## Not claimed by this follow-up

Real merchant/backend behavior under outages; till sale/refund/day-close; camera/microphone/Bluetooth/printer; VoiceOver/Dynamic Type; landscape stress. The prior report's three optional design opportunities (small chips, hidden horizontal actions, empty-demo teaching) remain deferred rather than being relabelled fixed.

## Additional visual follow-ups

The existing Arabic New customer header tag crowds the close control, and light amber avatar initials could use stronger contrast. These are separate polish observations, not silently marked fixed by correcting the server-card background. The intermittent sidebar tap merits a dedicated native repro rather than being diagnosed from a failed coordinate-driven journey alone.
