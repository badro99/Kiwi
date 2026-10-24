# Retiring kiwi-maroc.pages.dev

The old host stays available to existing devices. Public document navigations
without a Kiwi cookie receive a non-cacheable 302. App shells snapshot Kiwi
localStorage before boot, then inspect the durable queues before redirecting an
empty origin. Storage errors keep the device on the old origin.

The FR/EN/AR notice blocks movement for all tenants' local sales, command,
attendance and print debt, in-flight printing and unresolved cloud print jobs.
The source checks again after requesting the handoff. Nothing deletes the old
origin's books, settings, queues or credentials. Other open tabs keep their data;
close them after verifying the new origin works. A PWA installed for the old
origin must be installed again from kiwi-os.com to update its launch origin.
Browser USB/Bluetooth permissions must be granted again on the new origin.

A paired till, kitchen or waiter device receives a 256-bit single-use handoff,
valid for at most two minutes. Employee sessions keep employee-only authority.
Only the SHA-256 digest and bound claims live in D1. The new origin strips the
fragment before POSTing the exchange, rechecks tenant/device revocations, and
atomically consumes the row before setting HttpOnly cookies. It uses the shared
pairing commit. Owners sign in again. The old pairing remains usable for recovery.

Only language, theme, POS device identity and explicitly projected printer
settings cross through D1. No books, PINs, pairing codes, owner sessions, cloud
print credentials or arbitrary localStorage buckets are exported. Existing
settings at the destination take precedence. Other settings remain accessible
on the old origin. Expired handoffs are pruned when another is issued.

The operator card reads only merchant name, device role and last seen, capped
at 500 devices seen within seven days. Middleware verifies live identities before
recording sightings. An isolate reservation plus a D1 read and conditional
upsert limit actual writes to one per device per hour. Telemetry failure never
blocks an operational request.

## Integration and rollout

- Migration is deliberately `0015_origin_move.sql`, drafted with
  `node tools/d1-migrations.mjs --draft`. This worktree currently has only
  `0001` through `0010`. Integrate the lead's `0011` and `0012` before the full
  gate, without renumbering this migration or fabricating placeholder migrations.
- The owner applies migrations through the normal D1 migration procedure before
  deployment. Agents do not apply production migrations.
- Register/version the new assets with the normal stamp tooling:
  `assets/origin-move.js`, `assets/origin-move.css`,
  `assets/admin-origin-devices.js`. The shell loader intentionally snapshots
  state inline and loads the notice dynamically, within the script count pins.
  Existing stamps and service-worker generation were left unchanged.
- Run `node tools/origin-move-test.mjs`, the targeted non-browser suites, size
  ratchet and PWA checks. The lead runs `node tools/check.js`.
- Verify a public redirect, an existing offline device (including blocked print
  debt), an employee and a kitchen transfer, and the operator projection in the
  deployed environment. Watch the seven-day card before retiring the old host.

Rollback: remove the public redirect and shell notice integration. Keep D1
handoff/sighting tables and the old host available; no migration data was erased.
