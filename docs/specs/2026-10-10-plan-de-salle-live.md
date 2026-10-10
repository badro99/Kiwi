# Plan de salle · the room as the till sees it (2026-10-10)

The owner's Plan de salle used to show a status typed by hand. Amira Cafe's
table 03, ticked « Occupée » once, read **1514 h 59** two months later, and the
KPI "1 occ." disagreed with the counter. This pass makes the plan read the
till and keep its own markings to what the till cannot know.

## Who decides a table's status

`KiwiFloorLive.resolve()` (`assets/floorplan-live.js`), in this order:

1. **Hors service**: the owner's. Nothing outranks it.
2. **The till**: any non-free state from `service-events` or an open
   `table_sessions` visit. Till vocabulary maps onto the plan's:
   `a-commander` → à commander, `ka-yaklo`/`ka-tkhdam` → en cours,
   `bgha-ykhlass` → addition demandée, `khlass` → réglée.
3. **A booking** from Réservations, due within 30 min or up to 15 min late.
4. **Réservée by hand** (the owner's hold).
5. Live feed answers → **libre**. No feed (demo, offline) → the owner's own
   marking, which is the whole point on a demo.

On a real store the inspector only offers *aucune / réservée / hors service*;
service statuses come from the till. `pdsNormalize` clears hand-typed service
statuses on real stores and anything older than the business day (5 h).

## The feed

`GET /api/floor/live?merchant=` (`functions/api/floor/live.js`) is read-only:
`entitledMerchant(…, {allowTill:true})`, no writes, no session ids returned.
It returns per table `{status, covers, since, billCents, orders, requests,
askBill}` and today's `{turns, avgMinutes, revenueCents}`. Each query degrades
on its own (`partial`) when prod D1 lags `schema.sql`.

The dashboard polls every 8 s while visible. A poll never rebuilds the page:
only tables whose signature (`pdsSig`) changed are repainted, never under a
pointer or a focused field. A failed poll keeps the last room, flagged stale.

## Table numbers

The till keys a table by `tableKey()` (`functions/api/service/events.js`),
which reads « T4 » and « Table 4 » as **4**. On a real store the plan
therefore flags « 4 » and « T4 » as one number (`pdsNumKey`), and the
per-zone renumber uses hundreds (1…, 101…, 201…), never letters.

## Rotation

Zones strategy: a ring of seats, one per server, each zone holding seats in
proportion to its tables; everyone advances a step coprime with the head
count, so over a cycle each server works every zone for its share. Inside a
zone each server takes a run of neighbouring tables. Auto-rotation applies when
the plan opens on any device; there is no background scheduler.

Tests: `tools/floor-live-test.mjs` (route, client resolve, rotation fairness,
duplicate folding), wired into `tools/check.js`.
