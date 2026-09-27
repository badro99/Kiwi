# Kiwi remaining tickets · 2026-09-27
Shipped and board testing: #93 `0d066bd1`, #97/#100 `529b5d65`, #81 `36278a3c`; #99 `0cdef2ed` and #101 `f070f976` shipped and later marked done externally.
In progress: #94b durable Boutique/Maison acompte; #94a transfer/cheque already shipped as `b7c7a510`, but #94 is still problem.
Next: add migration-backed open balance and individual receipt payments, integrate both tills, Z and dashboard; prove 300 cash day 1 plus 700 transfer day 2.
Then run red/green tests wired to check.js, full gate, fixture UI proof, commit/push both URLs, submit #94 for testing, and recheck list_tickets.
