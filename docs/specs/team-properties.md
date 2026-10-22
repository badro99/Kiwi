# Team properties

`tools/team-properties-test.mjs` drives the two routes that publish a roster,
`POST /api/config` (till codes and the employee login mirror) and
`POST /api/store` feature `team`, with the real verifiers `verifyStaffPin` and
`findEmployeeCredential`, on the SQLite D1 fixture. Codes are generated test
values and are never printed. Fast tier.

## What holds (5 strict properties)

- After any sequence of roster saves, the till codes are exactly the published
  ones, each opens the till as its own member, and the owner's code is kept.
- Every member with an e-mail logs in with the code just published, and with no
  other code.
- A login revision never goes back, and moves exactly when that member's code
  changes (so an old employee session ends when its code changes).
- The Team document and the code publish of one save, landing together, leave
  every login working.
- Two saves with different codes racing, through either route and held at
  either moment (before the revision read, or before the write), never leave an
  employee unable to log in.

`tools/team-roster-cap-test.mjs` holds the roster bound: up to 200 members are
all kept, more is refused with 413.

## Defects found and fixed (22 October 2026)

1. `config.js`: the roster stopped at twenty members without a word; the 21st
   and later lost their till code and their login at the next save.
2. `config.js` and `store.js`: both routes raised the durable login revision
   before writing the mirror that carries it. A save that then lost its
   revision (`stale`) or failed left the revision raised and the mirror old,
   and two saves with different codes for one person could leave the mirror of
   one facing the revision of the other. The employee could then log in with
   neither code. The revision is now planned, written in the same D1 batch as
   the mirror, guarded by the document write, and the batch opens with a check
   that no other save moved the revisions since they were read; if one did, the
   route recomputes (three attempts, then 409).
