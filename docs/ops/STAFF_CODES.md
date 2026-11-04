# Staff code sealing

Use a dedicated PIN_PEPPER, independent of the AUTH_SECRET global session kill switch.
Current key is PIN_PEPPER if set, otherwise AUTH_SECRET. Previous candidates are
PIN_PEPPER_PREVIOUS, AUTH_SECRET_PREVIOUS, and AUTH_SECRET when PIN_PEPPER is set.
For rotation, set the new secret, move the old value to the corresponding *_PREVIOUS,
run the seal route from the beginning until done (resolve every skipped row), then
remove previous secrets. Adding PIN_PEPPER later automatically retains AUTH_SECRET.
Without the old key, sealed values cannot be recovered: till verification refuses
cleanly and owner editing reports staff-code-key-unavailable (409).
New k2 hashes carry a key tag; k1 compatibility includes both original derivations.
PIN HMAC and document AES use separate HKDF labels. Successful verification upgrades
old hashes using CAS; document writes re-encrypt previous-key fields under current.
Only the bounded operator seal route recovers old PIN hashes by trying all 10,000
candidates; ordinary login never performs that recovery.
The route reports skipped corrupt/unrecoverable rows and legacyCodeIds across scanned
documents and history. Legacy employee-<code> ids need coordinated re-identification;
production currently has zero such documents. No identity migration is performed.

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
at most one old PIN hash is recovered per request (at most 10,000 candidates);
it reports changed counts, never codes or hashes. Requests are rate limited using
the normal operator limiter. Wait for Retry-After if throttled. Re-running from
`{}` is safe and reports zero changes once all stored values are sealed. Updates
compare the original stored value, so concurrent owner saves cannot be overwritten.
If writes continue during the pass, run another full pass to include new rows.
On a failure, rerun from the last successful cursor (or `{}`).

Document history is also sealed, including snapshots created before this release.
This does not remove plaintext from older DB backups or Time Travel history.
