# Kiwi Hotel Economat field test

This is an evidence sheet, not an implementation phase. Do not enable direct
department transfers or choose a custody model from desk assumptions.

## Before the visit

- Use a disposable, non-writing prototype against the seeded hotel tenant.
- Bring the last 30 days of paper exit slips and time the last three completed slips.
- Ask the owner for five target values: weekly request volume, handover time,
  discrepancy rate, stock variance reduction, and the share expected to leave WhatsApp.
- Do not create the live `hotel-units` registry during discovery.

## Uncoached script

Give staff their own phones, explain only the goal, then stop coaching. Run each
scenario from request through physical handover and compare the resulting audit record.

1. Routine request.
2. Partial fulfilment.
3. Substitution.
4. Urgent after-hours request.
5. Disputed handover.

For every scenario record: words used for units and requisitions, real approver,
whether WhatsApp remained in the loop, when staff believed stock moved, completion
without help, audit-versus-physical match, and elapsed request-to-handover time.

## Custody decision

Ask who owns the trolley after the Economat releases it and before the receiving
department signs. If staff recognise a real interval, Phase 9 may model transit.
If they do not, keep the existing confirmation-only atomic transfer.

## Exit gate

Discovery passes only if all five scenarios complete without coaching and every
audit record matches the physical handover. Record the five commercial baselines
and 30-day targets before choosing the lightweight requisition overlay or the full
Economat platform. A positive reaction is not evidence.

## First live registry, after discovery

- Read `kiwi:caisse:terminal-id:v1` from every physical till using the caisse's
  **Identifiant caisse** button.
- Create units and the complete `terminalUnits` map in the same dashboard save.
- Confirm exactly one active Economat and at least one mapped terminal for every
  active outlet.
- Verify one inventory read and one queued write from every till before service.
- Never auto-assign an unknown terminal. A missed till keeps selling while its
  inventory queue receives 403, which is a silent operational failure.
