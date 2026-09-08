# Hotel room-plan release validation · 2026-09-08

## Scope

- Empty sections appear immediately in the still-open section manager and room assignment controls after an acknowledged save.
- Combine multiple floors/views with room category, status, capacity, connecting-door and amenity criteria. Floors/views use OR within their group; selected amenities use AND.
- Manage room views/custom amenities and reciprocal connecting-room relationships.
- Select and review up to 200 stable room identities per bulk operation. A floor-only move preserves type, amenities, guests, folios and other unrelated fields.

## Safety

Bulk changes use `POST /api/hotel/rooms-bulk`, tenant authorization, exact room revisions and a document compare-and-swap. The server derives the actor and records immutable before/after snapshots. A signed PIN proof is supported by the API; client-supplied names are not trusted. Dashboard actions without a PIN proof are attributed to their authenticated account/employee.

An operation ID and payload hash prevent duplicate application after a lost response. Unconfirmed intent is kept separately from confirmed room state and can be resumed after reload. A conflict requires a fresh review. No success is displayed for an unconfirmed/offline write. Generic room-document saves preserve server-owned audit history and also use compare-and-swap. Audit history is not silently truncated; oversized documents fail explicitly.

Explicit section/config saves are isolated from the normal background queue. Failed drafts do not overwrite confirmed state or prevent legitimate queued data from syncing on reconnection. Queued writes remain tenant-scoped.

## Regression evidence

- `tools/hotel-room-plan-test.mjs`: filters, reciprocal links, frozen selection, failure/reload/resume, conflicts, configuration and unknown-field preservation.
- `tools/hotel-room-bulk-api-test.mjs`: real SQLite-backed authorization, idempotency, atomic conflict handling, characteristic modes, audit immutability and future-client-clock monotonicity.
- `tools/hotel-cloud-save-test.mjs`: explicit acknowledgments, timeouts, busy/unread states, legitimate offline queue recovery and cross-tenant timer isolation.
- `tools/hotel-room-plan-ui-test.mjs`: isolated Chromium fixture using the shipped hotel and interactive/modal code; clicks through filtering, 20-room review/save, section creation and desktop/tablet/mobile/RTL layouts.
- Existing hotel register and broader release suites remain part of `node tools/check.js`; native setup interaction is run with the installed app dependencies, not skipped.

## Boundaries

Browser tests use a local synthetic hotel and mocked cloud acknowledgments; API persistence is separately exercised against SQLite. No live merchant data, account credentials, sales, bookings or stock were changed during this validation. Chromium responsive tests are not a physical iPad/Safari certification. A Git mirror push is distinct from deployment completion and authenticated live-merchant verification.
