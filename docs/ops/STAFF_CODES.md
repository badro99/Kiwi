# Staff code sealing

No schema migration or owner setup is required. PIN_PEPPER is the optional Worker
secret; otherwise AUTH_SECRET derives separate keys for PIN HMAC and document
AES-GCM. Preserve the chosen secret material: changing it without a planned key
rotation makes sealed codes unreadable. Version prefixes reserve a future rotation
protocol; this release does not implement key rotation.

Staff PINs upgrade on successful legacy verification. Team and employee-access
credentials encrypt on write. Owner and named-operator Team reads still reveal
codes. Other readers retain their existing redaction or access refusal.

An existing Face ID enrolment prompts for the personal code once because the
server mark now covers keyed PIN hashes. Its changed-mark response is the existing
403 `changed` path; entering the code issues a fresh mark. Sealing a legacy row
later does not change that mark again.

A named operator can finish the transition using POST /api/admin/codes/seal with
JSON `{}` and their normal operator session cookies. For example, using an existing
cookie jar (never paste credentials into this document):

```sh
curl --fail-with-body -b "$KIWI_OPERATOR_COOKIE_JAR" \
  -H 'Content-Type: application/json' --data '{}' \
  "$KIWI_ORIGIN/api/admin/codes/seal"
```

When `done` is false, post `{ "cursor": <returned cursor> }` until `done` is true.
Each request scans at most 50 staff rows, 50 documents and 50 history snapshots;
it reports changed counts, never codes or hashes. Requests are rate limited using
the normal operator limiter. Wait for Retry-After if throttled. Re-running from
`{}` is safe and reports zero changes once all stored values are sealed. Updates
compare the original stored value, so concurrent owner saves cannot be overwritten.
If writes continue during the pass, run another full pass to include new rows.
On a failure, rerun from the last successful cursor (or `{}`).

Document history is also sealed, including snapshots created before this release.
This does not remove plaintext from older DB backups or Time Travel history.
