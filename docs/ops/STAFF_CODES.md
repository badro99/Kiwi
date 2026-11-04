# Staff code sealing

Set a dedicated PIN_PEPPER before the first deploy, independent of the AUTH_SECRET
global session kill switch, so no codes are sealed under AUTH_SECRET. Emergency
AUTH_SECRET rotation must move its old value to AUTH_SECRET_PREVIOUS.
Current key is PIN_PEPPER if set, otherwise AUTH_SECRET. Previous candidates are
PIN_PEPPER_PREVIOUS, AUTH_SECRET_PREVIOUS, and AUTH_SECRET when PIN_PEPPER is set.
For rotation, set the new secret, move the old value to the corresponding *_PREVIOUS,
run the seal route from the beginning until done (resolve every skipped row), then
remove previous secrets. Adding PIN_PEPPER later automatically retains AUTH_SECRET.
Without the old key, sealed values cannot be recovered: till verification refuses
cleanly. An unreadable field excludes only its member from login; the owner editor
marks that member as needing a new code and permits replacement.
Only k2 hashes and transition plaintext are supported; k1 was never deployed.
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
at most 250 candidates for one old PIN hash are tried per request. The recovery
cursor resumes the remaining candidates, up to 10,000 over 40 requests. Only failed
requests consume the seal limiter budget. Counts never include codes or hashes.
The route also scans 50 employee_auth_versions rows, decrypts the matching private
documents and CAS-upgrades legacy or old-key pin_digest to the current keyed p2
digest without changing auth_version. Unresolved rows accumulate across the pass;
done is true only when none remain. A completed pass with unresolved rows returns
a null cursor and done false: repair those rows and restart with {}. Re-running from
`{}` is safe and reports zero changes once all stored values are sealed. Updates
compare the original stored value, so concurrent owner saves cannot be overwritten.
If writes continue during the pass, run another full pass to include new rows.
On a failure, rerun from the last successful cursor (or `{}`).

Document history is also sealed, including snapshots created before this release.
This does not remove plaintext from older DB backups or Time Travel history.
