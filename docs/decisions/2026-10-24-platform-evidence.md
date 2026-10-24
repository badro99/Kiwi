# Wave D platform evidence

## Implemented decisions

See `2026-10-24-wave-d.md`, heading `platform`. No schema change, production migration, stamp update, commit or push.

- Console: strict properties for redacted code list, non-echoing creation and idempotent status audits failed against the original handlers and pass after the changes. Removed the nonfunctional reveal control. Existing atomic-audit property now deliberately seeds a different prior status.
- Tickets: the original closure property failed when made strict, then passed with authenticated operator access. A strict denial matrix covers merchant owner, till, employee and anonymous access, including images. Audit events share the mutation batch, identify the operator and ticket, and survive ticket expiry. Classify retries audit no change. Merchant support remains tenant-scoped. The local tickets MCP now requires `KIWI_TICKETS_COOKIE` for a named operator session; its new regression proves credentials cannot leave the configured origin, and redirects fail closed. A named operator role is enforceable; physical-human presence cannot be inferred from HTTP or guaranteed by these tests.
- Triage: existing labeled corpus already existed in `tools/support-triage-eval.mjs`, but was not a local accuracy gate. New deterministic benchmark initially missed nine urgent examples; after conservative FR/EN/AR/Darija safety rules, recall is 11/11 urgent examples, with zero low-urgency false alerts. Model output cannot downgrade that priority. This is not evidence of unrestricted real-world accuracy; no model was called.
- Gate and landing: new release regression failed against the old inventory check (exit 0), and passes after critical acceptances cause exit 1. Four resolved properties leave the baseline. Ordinary inventory check intentionally remains red while other jobs' 18 critical acceptances remain. Pricing source advertises only a booking link in FR/EN/AR, not automatic deposits or hotel billing. No new operational claim was introduced.
- i18n: glossary test failed with the missing artifact, then passed for ten reviewed terms. Review is explicitly Codex technical semantic review, not fabricated native-speaker or merchant approval. The contract records who must review changes and how disputes are resolved.
- Print: existing `print-relay-properties-test.mjs` already strictly asserts that an interrupted bridge creates an uncertain ticket, never automatically reprints, and explicit till resend works once. This matches the chosen rule; no automatic-delivery promise is justified.

## Verification of every coverage and structural gap

| Gap | Current evidence and remaining limit |
| --- | --- |
| Console coverage | Already annotated FR phone/tablet/desktop, including keyboard task/dossier workflows, in `surface-matrix-states-console-browser-test.mjs`. EN/AR remain open: the console is still FR-only. |
| Tickets coverage | Already annotated FR desktop/tablet/phone shell in `surface-matrix-apps-browser-test.mjs`. New `tickets-workflow-browser-test.mjs` exercises FR/EN/AR phone/tablet photo followup, failed retest, fixed and tested transitions with axe checks. Chromium launch failed before scenarios; annotations and baseline additions deliberately withheld. |
| Pairing coverage | Original absence is stale: `surface-matrix-dash-{desktop,tablet,phone}-browser-test.mjs` annotate dashboard-terminaux in FR/EN/AR. These establish rendered visits, not complete device-management interactions; that workflow remains open. Frozen terminaux runtime untouched. |
| Onboarding coverage | Original absence is stale: `surface-matrix-apps-browser-test.mjs` annotates EN/AR desktop; `onboarding-recovery-browser-test.mjs` exercises FR/EN/AR phone/tablet recovery. These do not prove every desktop setup state. |
| Printer coverage | Original absence is stale: `surface-matrix-apps-browser-test.mjs` annotates FR/EN/AR all three device classes, with visibility/overflow/axe. Complete interactive setup remains a stronger claim than those visits. |
| Landing coverage | Original absence is stale: the same suite annotates all seven tablet locales. It checks rendered accessibility; interactive tablet pricing/navigation is not comprehensively established. |
| Schema restore | Already fixed: `d1-restore-rehearsal-test.mjs`, registered in check.js, seeds every baseline table, exports/imports SQL, injects failed atomic upgrades and every persisted prefix, restores and compares every original row and the final schema. Executed successfully. |
| Vision coverage | Original absence is stale for photos: `surface-matrix-states-intake-browser-test.mjs` annotates corrected photo-review FR/EN/AR phone/tablet workflow and prevents model calls. The distinct document/voice review flow remains open. Frozen split-proof agent-voice runtime untouched. |
| Native app coverage | Already annotated: `app-interaction-test.mjs` lines near 1999 covers EN tablet and AR desktop; `font-face-census-test.mjs` adds AR tablet. The cited missing annotations are stale; a full locale/device/accessibility certification remains broader than those visits. |
| Big-file coupling | Already fixed: registered `global-ownership-test.mjs` detects multiple owners, dangling global reads and pinned large-file dependency counts. Executed successfully: 299 owned globals, four deliberate shared globals, ten existing pinned dangling references, 12 coupling pins. No pin raised. |

## Operational limits

The new browser workflow suite could not start Chrome in this restricted execution environment, even through the required machine-wide slot wrapper. No real merchant records or credentials were used. Existing, unchanged browser suites were not run, as authorized scope permits only written/changed browser suites. Coverage evidence above is source inspection of existing registered suites, not a claim of fresh execution.

Restamp before deployment: `assets/tickets.js`. Asset stamps and service-worker generation remain untouched as instructed.

## Executed suites

39 distinct non-browser suites passed; the ordinary known-issue check is deliberately blocked by 18 remaining critical acceptances (30 total). Explicit inventory maintenance passed and removed four entries. The full gate was not run.

- `admin-crm-layout-test.mjs`: PASS.
- `admin-delete-r2-test.mjs`: PASS.
- `app-bundle-test.mjs`: PASS.
- `caisse-godmode-toggles-test.mjs`: PASS.
- `demo-request-api-test.mjs`: PASS.
- `economat-rd-invariants-test.mjs`: PASS.
- `feed-changes-test.mjs`: PASS.
- `hotel-units-test.mjs`: PASS.
- `import-test.js`: PASS.
- `known-issues-release-test.mjs`: PASS.
- `known-issues-test.mjs`: EXPECTED RELEASE BLOCK (18 critical acceptances).
- `menu-analysis-test.mjs`: PASS.
- `menu-nutrition-test.mjs`: PASS.
- `operating-day-admin-test.mjs`: PASS.
- `operational-glossary-test.mjs`: PASS.
- `operator-properties-test.mjs`: PASS.
- `operator-workspace-test.mjs`: PASS.
- `order-basic-test.mjs`: PASS.
- `planning-layout-test.mjs`: PASS.
- `pos-maison-test.mjs`: PASS.
- `public-assets-test.js`: PASS.
- `simple-food-cost-test.mjs`: PASS.
- `subscription-privacy-test.mjs`: PASS.
- `support-system-test.mjs`: PASS.
- `support-triage-test.mjs`: PASS.
- `support-urgency-benchmark-test.mjs`: PASS.
- `tickets-i18n-test.mjs`: PASS.
- `tickets-properties-test.mjs`: PASS; final rerun: 15 strict properties.
- `tickets-retest-test.mjs`: PASS.
- `tickets-storage-purge-test.mjs`: PASS.
- `tickets-taxonomy-test.mjs`: PASS.
- `till-truth-test.mjs`: PASS.
- `zone-law-test.mjs`: PASS.
- `file-size-ratchet-test.mjs`: PASS.
- `pwa-shell-test.js`: PASS.
- `d1-restore-rehearsal-test.mjs`: PASS.
- `global-ownership-test.mjs`: PASS.
- `print-relay-properties-test.mjs`: PASS.
- `coverage-manifest-test.mjs`: PASS; no unexecuted coverage was added.
- `tickets-mcp-auth-test.mjs`: PASS; red before origin and redirect protection.
- `tickets-workflow-browser-test.mjs`: infrastructure exit 3, Chrome process failed to launch through the mandatory browser-slot wrapper; scenarios not executed.
- `KIWI_UPDATE_KNOWN_ISSUES=1 node tools/known-issues-test.mjs`: PASS, four removed, zero added.
- `git diff --check`: PASS.

## Changed files and line counts

Additions/deletions include new files. No files are staged.

| File | Added | Removed |
| --- | ---: | ---: |
| `assets/tickets.js` | 3 | 0 |
| `content/operational-glossary.json` | 156 | 0 |
| `docs/decisions/2026-10-24-platform-evidence.md` | 117 | 0 |
| `docs/decisions/2026-10-24-wave-d.md` | 11 | 0 |
| `functions/api/_support.js` | 2 | 1 |
| `functions/api/admin/clients.js` | 4 | 4 |
| `functions/api/admin/pins.js` | 4 | 5 |
| `functions/api/ticket-images/[[key]].js` | 3 | 1 |
| `functions/api/tickets/[id].js` | 14 | 9 |
| `functions/api/tickets/_access.js` | 22 | 0 |
| `functions/api/tickets/cleanup.js` | 3 | 1 |
| `functions/api/tickets/index.js` | 11 | 7 |
| `kiwi-admin.html` | 0 | 1 |
| `tools/check.js` | 5 | 0 |
| `tools/known-issues-baseline.json` | 0 | 24 |
| `tools/known-issues-release-test.mjs` | 13 | 0 |
| `tools/known-issues-test.mjs` | 4 | 0 |
| `tools/operational-glossary-test.mjs` | 25 | 0 |
| `tools/operator-properties-test.mjs` | 5 | 3 |
| `tools/support-urgency-benchmark-test.mjs` | 15 | 0 |
| `tools/ticket-test-auth.mjs` | 19 | 0 |
| `tools/tickets-mcp-auth-test.mjs` | 23 | 0 |
| `tools/tickets-mcp/server.js` | 14 | 9 |
| `tools/tickets-properties-test.mjs` | 8 | 6 |
| `tools/tickets-storage-purge-test.mjs` | 3 | 1 |
| `tools/tickets-taxonomy-test.mjs` | 5 | 2 |
| `tools/tickets-workflow-browser-test.mjs` | 48 | 0 |

Total: 27 files, +537/−74 lines.
