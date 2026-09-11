# Operator workspace · first operational release

## Delivered

- Today: independent incident/commercial/profile signals; no five-item cut-off; priority, owner, overdue, snoozed and resolved views.
- Durable follow-ups: merchant, context, priority, named owner, due time, snooze, required resolution outcome and append-only change history.
- Merchant dossier: deterministic briefing, internal notes, support entry point, business-specific six-step onboarding, and focused tabs for existing operational tools.
- Fleet: bounded, timestamped cloud print relay/job observations, application errors, support and connector work. No receipt payloads, bridge credentials or raw exception stacks in this endpoint.
- Money: void-aware centime totals; paid configured MRR excludes pending, suspended, trial, future and expired contracts; per-merchant contribution explanations. This is not invoicing or payment collection.
- Safer controls: PINs hidden by default, response guards against switching merchants mid-request, confirmed feature writes with optimistic concurrency and atomic audit; saving trial terms does not activate access.
- Design: compact sidebar, work-first home, responsive bottom navigation, keyboard search, focused dossier tabs, existing Kiwi light/dark tokens and reduced-motion support.

## Routes and data

`GET /api/admin/workspace[?merchant=slug]` is named-operator-only. Each source returns `available`, `rows` and `truncated`. A missing table is unavailable, not healthy zero. Fleet sources are capped at 200 rows, work at 500, notes/events at 100. The UI identifies partial results and supports merchant-scoped reads; it does not claim a complete fleet beyond these limits. Open work sorts ahead of resolved work in the bounded database query.

`POST /api/admin/tasks` requires a client-generated ID. Signal keys deduplicate within one merchant. `PATCH` requires the current version; a concurrent loser gets 409. Status transitions, actor and result are committed atomically. Resolution requires an outcome; snoozing requires a future time. Retries of creation do not duplicate tasks or audit records. A newer timestamped occurrence can reopen the operator's attention without silently changing the existing resolution.

`POST /api/admin/notes` is append-only and idempotent by ID. Existing note IDs cannot be repurposed or moved between merchants. Do not put secrets, payment information or unnecessary customer details in notes.

`PATCH /api/admin/config` changes one boolean flag against a revision. It never rewrites the plan or unrelated flags. Audit failure rolls back the change. The compatibility PUT remains for other existing workflows; this release does not claim optimistic concurrency for every legacy administrative action.

Automatic refresh runs every 30 seconds while visible, outside merchant dossiers, dialogs and focused inputs. Merchant forms refresh manually. Freshness becomes stale after 90 seconds. No polling sends support replies, reprints tickets, activates accounts or resolves work.

## Migration and verification

Apply only `migrations/2026-09-07-operator-workspace.sql` to the verified production database before serving the new routes. It adds three operator tables and their indexes and is repeatable; it does not rewrite existing merchant records. Do not apply the entire fresh-install schema as a substitute.

Validation:

```sh
node tools/operator-workspace-test.mjs
node tools/check-godmode.mjs
node tools/business-day-timezone-test.mjs
node tools/support-system-test.mjs
node tools/check.js
```

`node tools/operator-workspace-dev.mjs` serves an isolated, synthetic SQLite integration fixture at `http://127.0.0.1:8767/kiwi-admin.html`. It has no production credentials or D1 connection, allows only a narrow set of local mutations, and resets on exit. Do not expose this test server to a network.

Browser acceptance: create a follow-up from a printer signal, assign it, reload, resolve with an outcome, reopen resolved history; save a note and check the journal after reload; validate onboarding and switch merchants; inspect desktop and 390px layouts, overflow and browser errors. Production read-only smoke verification is separate from local mutation tests, and physical printer confirmation remains a merchant/hardware check.

## Not built in this release

The wider audit remains a roadmap, not a claim that all 120 ideas are implemented. This release does not add autonomous AI actions, automatic outbound campaigns, invoice collection, remote print retries, device management/MDM, a complete local-print heartbeat, full CRM integrations, role granularization, full-history fleet pagination, or official regulatory reporting. These need separate delivery and appropriate authority/data coverage. The briefing is deliberately deterministic and labelled as such.
