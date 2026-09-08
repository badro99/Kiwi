#!/usr/bin/env node
/* tools/hotel-stays-group-guards-test.mjs — structural guards for the group
 * recovery workflow in assets/hotel.js (defects 1-4).
 *
 * These are source-text invariants: cheap, browser-free, and precise about
 * the exact regressions that cost real dossiers (frozen terms read from
 * disabled controls, skipped server reconciliation, mixed quote revisions).
 * The behaviour itself is proven in tools/hotel-stays-group-browser-test.mjs
 * against the real modal, real API handlers and a real database.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hotelJs = fs.readFileSync(path.join(ROOT, 'assets/hotel.js'), 'utf8');

let controls = 0;
function ok(value, label) { assert.ok(value, label); controls++; }

console.log('\n■ 1. Frozen submission terms survive disabled controls (defect 1)');
{
  ok(hotelJs.includes('const terms = getTerms();'), 'group submit reads the frozen submission model');
  ok(hotelJs.includes('const freezeTerms = (terms)'), 'frozen terms are captured explicitly');
  ok(hotelJs.includes('if (!committedTerms) { freezeTerms(terms); lockCommittedFields(); }'), 'first saved room freezes the dossier identity');
  ok(hotelJs.includes('committedTerms,') && hotelJs.includes('staged.committedTerms'), 'frozen terms persist in the draft cache and restore on reopen');
  const lockBlock = hotelJs.slice(hotelJs.indexOf('const lockCommittedFields'), hotelJs.indexOf('const persistStaged'));
  for (const name of ['groupName', 'checkIn', 'checkOut', 'contactName', 'contactPhone', 'contactEmail', 'accountId', 'channel', 'board']) {
    ok(lockBlock.includes(`'${name}'`), `committed field locked after partial save: ${name}`);
  }
  ok(lockBlock.includes('!!committedTerms'), 'adopted intent terms lock the form even before any local save');
  ok(hotelJs.includes("if (savedRooms[room.id]) {\n            continue;\n          }") === false, 'no blind skip of locally saved rooms');
}

console.log('\n■ 2. Single authoritative versioned recovery record (defect 2)');
{
  ok(hotelJs.includes('const INTENT_VERSION = 2;'), 'intent record is versioned');
  ok(hotelJs.includes("status: 'in-progress'"), 'attempts are marked in-progress until completion');
  ok(hotelJs.includes('rooms: roomPlans.map('), 'exact per-room payloads persist before any booking write');
  ok(hotelJs.includes('const attempt = readIntent(groupDossierId);'), 'the loop iterates the persisted attempt, proving write-before-post');
  ok(hotelJs.includes('attempt.rooms.length !== roomPlans.length'), 'a torn intent aborts instead of posting');
  ok(hotelJs.includes('termsDiffer(priorIntent.terms, terms)'), 'an unresolved intent is never overwritten with incompatible edits');
  ok(hotelJs.includes('for (const entry of attempt.rooms)'), 'every attempt replays the persisted room entries');
  ok(hotelJs.includes('quoteBreakdown: JSON.parse(JSON.stringify(quoteBreakdown))'), 'the accepted quote position persists with the intent');
  ok(hotelJs.includes("intentNotice === 'adopted'") && hotelJs.includes("intentNotice === 'other-pending'"), 'intent/draft merges are said out loud');
}

console.log('\n■ 3. Saved rooms reconcile against the server (defect 3)');
{
  ok(hotelJs.includes('const bookingMatchesPayload = (existing, payload, room)'), 'material comparison helper exists');
  ok(hotelJs.includes("['voyageurs'") || hotelJs.includes("'voyageurs'"), 'guest identities are compared, not just room/dates/party');
  ok(hotelJs.includes("['compte'") && hotelJs.includes("['formule'"), 'commercial terms (account, board) are compared');
  ok(hotelJs.includes("['canal'") && hotelJs.includes("['contact'"), 'channel and contact survive reconciliation');
  ok(hotelJs.includes('provisionally trust') || hotelJs.includes('provisional trust'), 'offline fallback is explicit and provisional, never silent');
  ok(hotelJs.includes('aucune écriture, utilisez un avenant explicite'), 'incompatible server state fails loudly without touching the booking');
  ok(hotelJs.includes('!savedRooms[r.id] || r.id === currentVal'), 'saved rooms leave the traveler assignment options');
  ok(hotelJs.includes('!savedRooms[r.id] || r.id === t.roomId'), 'saved rooms leave newly rendered traveler rows too');
}

console.log('\n■ 4. One revision for the whole reviewed group (defect 4)');
{
  ok(hotelJs.includes('let quoteGen = 0;'), 'quote simulations carry a generation');
  ok(hotelJs.includes('const gen = ++quoteGen;'), 'each simulation takes the next generation');
  ok(hotelJs.includes('if (gen !== quoteGen) {') && hotelJs.includes('quoteGen++;'), 'stale generations die and invalidations retire in-flight work');
  ok(hotelJs.includes('a changé pendant la simulation'), 'a directory move mid-simulation rejects the whole run');
  ok(hotelJs.includes('quoteRevs[r.id] !== quoteRevision'), 'submission requires every pending room on the accepted revision');
  ok(hotelJs.includes('activeQuoteSignature !== cuGroupQuoteSignature()'), 'the accepted signature is re-checked at submission');
  ok(hotelJs.includes('revBody.rev !== quoteRevision'), 'directory freshness is re-checked against the live directory at submission');
  ok(hotelJs.includes('Révision commerciale n°'), 'the reviewed revision is displayed, not just stored');
}

console.log(`\n✓ All ${controls} group recovery guard controls passed.`);
