# Kiwi audit remediation · 8 September 2026

Implementation of the 40 findings in the source audit. The separate feature
roadmap is not part of this patch. All 40 confirmed findings have local fixes and
regression coverage. Bridge enforcement is staged: old installed bridge servers
remain exposed until upgraded; compatibility is not a claim of remediation on
those devices. This document is an integration work record, not a
production verification or a penetration-test certificate.

## Authorized migration and release preflight

- The four audit migrations were applied to production `kiwi-sales` on
  2026-09-08: fourteen additive statements (six tables, six indexes, two
  columns). No existing business record was updated or deleted.
- A Cloudflare Time Travel recovery bookmark was recorded before writes.
  Recovery evidence, exact migration hashes and statement results are kept
  outside the repository in `/Users/zaka/.codex/kiwi-audit-backup.Zcpe9w`.
  This is a provider recovery point, not a local full database export. No
  in-place restore was attempted; a restore would require separate approval
  because it overwrites later live changes.
- All 65 existing application tables had identical before/after row counts.
  Existing schema objects and column definitions were preserved. The six new
  tables and two added column definitions were verified against the migration
  SQL. Existing accounts have session_epoch 0; existing movement hashes remain
  empty for legacy compatibility.
- The exact combined release is isolated at `/tmp/kiwi-audit-release.E71LlO`,
  based on published `67d1766e019f8b8ebee1afe429248881136e0eae`; it retains
  the concurrent hotel work and upstream OrderPro fix. Canonical HEAD/index
  were not moved. The release commit retains this baseline's published changes.
- Full release gate: `node tools/check.js` exited 0, one existing styling
  warning. Log: `/tmp/kiwi-audit-release-exact-gate-2.log`. Browser interaction
  checks executed (209 controls), hotel layout checks and native layout checks
  passed. The initial isolated run lacked ignored app dependencies; reusing
  the matching-lockfile local dependencies fixed that environment issue,
  without weakening tests. `app/node_modules` in the isolated worktree is a
  local dependency symlink and must never be staged.

### Rollout blockers resolved after explicit authorization

1. Broader read-only comparison of the live sqlite_master definitions against
   schema.sql found older drift: missing `merchant_config.till_epoch`,
   `clients.hospitality`, three hotel_internal_request_lines substitute fields,
   `hotel_reservations`, `intake_docs`, and their four indexes. These are not
   included in the four audit migration files and were not silently applied.
   The user subsequently approved fixing the authentication prerequisite:
   `2026-09-08-till-epoch-prerequisite.sql` was applied separately after a new
   recovery bookmark. Verified 14 merchant configurations, all with epoch zero,
   2,835 pairings and 2,525 sales before/after; no counts changed, epochs were
   not incremented, and no pairing was cleared. A real legacy-layout SQLite
   test proves the old token works after migration and fails after revocation.
   The other pre-existing hotel/intake schema omissions are unchanged and
   remain separate from this audit release; this is not a clean full-schema
   attestation for all optional modules.
2. The browser bridge patch requires a capability handshake and target
   enrollment absent from the currently published bridge/server.js. Registered
   bridges report older versions; even published version 1.4.4 does not prove
   capability support because that version label predates this patch. Registry
   data alone does not establish every merchant's local transport. The user
   approved a compatible rollout: explicitly recognized pre-1.4.5 bridges keep
   printing with their existing protocol, with an upgrade recommendation in
   setup. The next print automatically recognizes an upgraded bridge. Version
   1.4.5 advertises capabilityRequired and retains strict server enforcement.
   Modern missing/invalid credentials, denied enrollment and unknown bridge
   versions fail closed; a remembered secure-protocol fence prevents downgrade
   after reload or a port change. Local relay pairing now carries the same
   capability. Actual client regressions plus a real Node bridge/TCP sink prove
   these boundaries; no physical merchant printer was exercised.

Both mirrors pointed to 67d1766e before publication of this release.
Pages, Shopify worker, installed bridge/native updates and authenticated
merchant smoke tests remain distinct, uncompleted rollout steps.


## Publication boundary

- Baseline: `d753a0abb5e16ece5641e2952a0cc1b17b39d54f`.
- Publication is authorized to main on both GitHub mirrors after the final
  exact-release gate. The production additive schema changes are recorded above.
- The pre-existing, concurrently edited hotel work is preserved and must be
  reviewed separately when selecting commits.
- During integration, a separate authorized hotel task published
  `61949cf2f33a612c8bb579646573fcda0740c5f7`; both GitHub `main` refs were
  independently checked with `git ls-remote`. The canonical checkout's baseline
  and index were not moved. Reconcile against that upstream hotel release in an
  isolated checkout before publishing these audit changes; never push the old
  baseline over it. Hotel asset-version references were advanced locally only
  to keep this combined working tree's cache keys consistent.
- No Strix scan ran: its required model/API configuration was not available.

## Scope and verification tracker

| Group | IDs | Verification |
| --- | --- | --- |
| Public/private media | A01 | Actual handler: private paths refused before R2 access; supported public shapes accepted |
| Identity and tenant authorization | A02–A09 | SQLite races, legacy migration, revision outages, stale records and revoked cookies: 37 focused checks |
| Pressing authorization and state | A10, I06, I07 | Actual middleware/route and merge tests: 25 focused checks |
| Cash synchronization, close, refunds, voids | F01–F05 | Actual cash queue, report aggregation and SQLite void/refund tests pass |
| External refunds | F06 | Actual handler + SQLite: 17 connector checks plus 31 refund-recovery race/crash checks |
| Connector money precision | F07 | Stored Shopify and generic-channel totals and unit prices retain centimes |
| Shopify inventory retry | F08 | Signed webhook + SQLite: durable pending work, scheduler recovery, no duplicate decrement |
| Dashboard and reporting | R01–R04 | Shipped module tests: merchant DST boundaries, signed refunds, receivables, feed cutoff |
| Orders and kitchen dispatch | O01–O07 | Actual order routes, transactional transfer tests and delayed-ACK waiter VM tests pass |
| Inventory and loyalty | I01–I05 | 45 focused checks: stock races, replay, fractional costs, delayed event writes and coherent sync acknowledgements |
| Bridge and native recovery | D01–D03 | 44 focused local checks, including real local transport and staged client compatibility; physical merchant devices untested |
| AI quota and gateway | X01 | Actual SQLite concurrent quota test; database errors deny calls; no direct fallback |

Additional hardening: menu URL import follows at most five redirects, validating
each destination before requesting it. Tests reject private-IP, plaintext HTTP,
and credential-bearing redirects. Private DNS resolution/rebinding behavior in
the deployed Worker remains unverified; this is not a claimed live SSRF exploit.

## Release prerequisites

1. Review and approve the exact patch/commits. Do not include unrelated hotel
   work accidentally.
2. Apply additive schema changes before releasing code that depends on them:
   `2026-09-08-auth-session-revocation.sql`,
   `2026-09-08-inventory-movement-payload-hash.sql`,
   `2026-09-08-audit-remediation-inventory-loyalty.sql`, and
   `2026-09-08-audit-payment-shopify-outboxes.sql`, and the reviewed
   `2026-09-08-till-epoch-prerequisite.sql`. All five are now applied.
   Use the schema-aware migration tool to avoid replaying non-idempotent ALTERs;
   `schema.sql` describes new databases, not an automatic deployed migration.
3. Deploy the Shopify sync worker separately from Pages. Its scheduled handler
   now owns inbound stock retry as well as outbound synchronization; a Pages-only
   deployment does not establish the recurring retry service.
4. Release/reload the compatible web clients first, then upgrade and restart
   Node printer bridges to 1.4.5 in a supervised window. Preserve configuration
   files and verify paper output before marking each merchant upgraded. Old
   bridges keep their legacy protocol in this transition, not the security fix.
   Verify enrolled destinations and supported Android/Termux transports
   separately, then rebuild native packages as appropriate. Source edits do not
   update installed merchant bridges or App Store builds.
5. Review whether any previously exposed private media URLs require a scoped
   CDN purge. This patch denies new reads but does not purge existing caches.
6. Test authenticated merchant flows and physical supported printers after
   approval. Local green tests do not prove paper output or deployed recovery.

## Recovery cautions

- A payment provider timeout can happen after money was refunded. Such a refund
  remains reserved and is marked for reconciliation. Do not release its balance
  or repeat the external refund without provider evidence and the stable command
  ID. The command journal's refund-verification action queries
  `payment-refund-status` using the original command ID. The provider must return
  a matching command ID, amount, successful refund status and refund reference.
  Unsupported or uncertain responses keep the hold; support must investigate.
  When provider evidence was saved before a local ledger failure, retry finishes
  that ledger entry without another provider call. Generic lifecycle changes
  cannot manufacture a completed refund or release an uncertain hold.
  A fresh queued command is left alone while its original request runs; after
  60 seconds, a queued command with no reservation may resume through the atomic
  reservation guard. Completed refund commands cannot be downgraded by a stale
  request, and concurrent audit appends retry against the current chain sequence.
- Fixes prevent future data loss; they do not reconstruct missing historical
receipts from screenshots or invent transactions to make totals match.
- Never clear a merchant's offline queues as a recovery shortcut.

## Gate record

- Authorized safe-rollout gate: `node tools/check.js` exited 0 on the exact
  combined release, including the till prerequisite regression and compatible
  bridge/pairing protocol. Log: `/tmp/kiwi-audit-final-push-gate-2.log`.
  One existing styling warning, no failed or skipped browser interaction suite.
  Focused auth: 37 checks; device/rollout: 44 checks. No files were deleted.
- Final `node tools/check.js`: exit 0, all checks passed, one existing warning.
  Log: `/tmp/kiwi-remediation-release-gate.log`.
- The warning is existing `background:var(--ink)` styling debt, not a failed
  security or behavioral check.
- Thirteen focused audit-regression suites are registered in the full gate.
- `node tools/stamp-drift-test.js`: 691 checks green across 230 stamped assets.
- `git diff --check`: clean. Index remains empty; baseline HEAD unchanged.
- All four additive migrations applied to an in-memory database built from
  the actual baseline `HEAD:schema.sql`; eight required table/column assertions
  passed. The separate `d1-schema-test.mjs` fresh/legacy upgrade checks passed.
- Intermediate red runs included stale mocks and cache stamps; they were not
  counts of additional merchant defects. The final result above supersedes them.

Remaining validation is release/environment work: authenticated merchant smoke
tests, provider status-protocol verification, physical printer output, native
package delivery, scoped cache purge assessment and historical reconciliation.
The original audit's unconfirmed risks and feature roadmap are not represented
as proven fixes or as part of the 40 confirmed findings.

## Finding-by-finding implementation map

These describe the implemented safeguards, not a claim that merchant devices
have received the patch. Focused test families live under `tools/audit-remediation-*`.

| ID | Safeguard | Test family |
| --- | --- | --- |
| A01 | Public media path allowlist rejects private objects before R2 access | peripheral |
| A02 | Atomic merchant ownership claim protects winner configuration | auth |
| A03 | Account revocation lookup fails closed without purging identity on outage | auth |
| A04 | Till epoch lookup cannot default a failed/missing read to zero | auth |
| A05 | PIN and pairing throttles refuse work when persistence is unavailable | auth |
| A06 | Concurrent throttle increments are SQLite-atomic | auth |
| A07 | Employee credential revisions invalidate old cookies after PIN changes | auth |
| A08 | Password recovery advances the account session epoch | auth |
| A09 | Suspended-store employee planning and attendance writes are refused | auth |
| A10 | Pressing cancellation verifies the actual authorizing manager PIN server-side | pressing |
| F01 | Denied cash events remain recoverable; invalid events enter a durable rejected queue | money |
| F02 | Acknowledgements remove only the exact acknowledged cash event ID | money |
| F03 | Closing reconciles remote sales first and exposes incomplete results | money |
| F04 | Rejected refunds do not reduce revenue; actual cash handed out remains explicit | money |
| F05 | Void and its attributable audit record commit or roll back together | money |
| F06 | Refund balance is reserved before provider calls; uncertain outcomes are held and reconciled | connectors |
| F07 | Channel totals and unit prices retain MAD centimes | connectors |
| F08 | Shopify stock failures have durable, idempotent scheduled retry | connectors |
| R01 | Reporting windows use merchant timezone and DST | dashboard |
| R02 | Receivables are separate from collected tender totals | dashboard |
| R03 | CSV exports retain signed refunds | dashboard |
| R04 | Feed subtitles use the same business-day cutoff as the report | dashboard |
| O01 | Required modifier selections are validated server-side | orders |
| O02 | Waiter sends persist immutable batches and serialize overlapping acknowledgements | orders, serveur |
| O03 | A delayed table close must match the current visit identity/revision | orders |
| O04 | Table transfers and merges use atomic operation claims | table-transfer-merge |
| O05 | Rejected tickets leave active KDS/payment projections | orders, caisse-integration |
| O06 | Remote connected-printer work cannot bypass exclusive hub dispatch | devices, caisse-integration |
| O07 | Expired/rejected ticket dismissal avoids the uninitialized-time exception | orders |
| I01 | Stock review reserves availability; transfer confirmation guards the claim atomically | inventory-loyalty |
| I02 | Inventory movement IDs are bound to their normalized payload | inventory-loyalty |
| I03 | Fractional inventory unit costs retain sub-cent precision | inventory-loyalty |
| I04 | Employee loyalty balances and idempotency events commit atomically | inventory-loyalty |
| I05 | Purchases and reward redemptions use event deltas instead of replacing balances | inventory-loyalty |
| I06 | Pressing cancellation tombstones survive stale synchronization | pressing |
| I07 | Occupied pressing rack slots cannot be silently overwritten | pressing |
| D01 | Node print commands require a capability, trusted origin/host and enrolled destination | devices |
| D02 | Claimed print jobs retain acknowledgement/recovery state across interruptions | devices |
| D03 | Native recovery cannot restore a revoked pairing from an old snapshot | devices |
| X01 | Atomic fail-closed AI quota; all six reviewed fallback callsites retain the gateway and respect policy denials | peripheral, ai-channel-surfaces |
