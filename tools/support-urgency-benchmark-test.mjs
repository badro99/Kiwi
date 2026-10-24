#!/usr/bin/env node
// Frozen, labeled synthetic reports. Measures the production deterministic
// safety floor, never a model or paid API. Not a claim about unseen reports.
import assert from 'node:assert/strict';
import { DATASET, validateDataset } from './support-triage-eval.mjs';
import { classify } from '../functions/api/_support.js';
import { consoleRank } from '../functions/api/_support-triage.js';
assert.deepEqual(validateDataset(DATASET), []);
const urgent = DATASET.filter(t => t.expect.urgency === 2 || t.expect.blocked);
const missed = urgent.filter(t => classify(t.text).priority !== 'urgent');
assert.deepEqual(missed.map(t => t.id), [], 'urgent labeled reports must never fall below the urgent queue');
for (const t of urgent) assert.ok(consoleRank({ status: 'open', priority: classify(t.text).priority, triage: { verdict: 'normal' } }) <= 1, 'model may not downgrade the safety floor');
const falseAlerts = DATASET.filter(t => t.expect.urgency === 0 && classify(t.text).priority === 'urgent');
assert.ok(falseAlerts.length / DATASET.filter(t => t.expect.urgency === 0).length <= 0.2);
console.log(`✓ urgent recall ${urgent.length}/${urgent.length}; ${falseAlerts.length} false alerts on low urgency; FR/EN/AR/Darija; no model called`);
